'use strict';

// Identity Module — owns the canonical patient identity (Phase 0 §3/§7).
//
// Phone number and email are ATTRIBUTES of a patient, not the identity
// itself. The canonical identity is `patient_id` (e.g. "P-000001"),
// allocated once per real person and referenced by every other module.
// Two lookup-index collections make phone/email uniqueness cheap to check
// and enforce without ever scanning `patients`:
//   patient_phone_index/{normalizedPhone} -> { patient_id }
//   patient_email_index/{normalizedEmail} -> { patient_id }
// The index document's ID *is* the uniqueness constraint — Firestore
// transactions make "does this phone/email already have a patient" and
// "claim it if not" atomic.
//
// practice_id is stamped as a constant for now ('dr-majeke') — multi-
// tenancy prep per Phase 0 §14, not real tenant logic yet.

const PRACTICE_ID = 'dr-majeke';

class IdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
  }
}

// Same normalization the codebase already used in
// appointmentController.js's toE164 — consolidated here so there's one
// definition instead of every module inventing its own.
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length === 9) return `+27${digits}`;
  if (String(phone).startsWith('+')) return phone;
  return digits ? `+${digits}` : null;
}

function normalizeEmail(email) {
  if (!email) return null;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

function patientsCol(db) { return db.collection('patients'); }
function phoneIndexCol(db) { return db.collection('patient_phone_index'); }
function emailIndexCol(db) { return db.collection('patient_email_index'); }
function counterRef(db) { return db.collection('counters').doc('patients'); }

async function getPatientById(db, patientId) {
  const snap = await patientsCol(db).doc(patientId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function findPatientByPhone(db, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const idx = await phoneIndexCol(db).doc(normalized).get();
  if (!idx.exists) return null;
  return getPatientById(db, idx.data().patient_id);
}

async function findPatientByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const idx = await emailIndexCol(db).doc(normalized).get();
  if (!idx.exists) return null;
  return getPatientById(db, idx.data().patient_id);
}

// Resolves a phone number to its canonical patient, creating one if this
// is the first time this phone has been seen (the WhatsApp channel's
// entry point — see Phase 0 §4/§5). All reads happen before any write,
// per Firestore's transaction rules.
async function getOrCreatePatientByPhone(db, phone, extra = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new IdentityError('INVALID_PHONE', 'Invalid phone number');

  const phoneIdxRef = phoneIndexCol(db).doc(normalized);
  const counter = counterRef(db);

  return db.runTransaction(async (txn) => {
    const idxSnap = await txn.get(phoneIdxRef);

    if (idxSnap.exists) {
      const patientId = idxSnap.data().patient_id;
      const patientSnap = await txn.get(patientsCol(db).doc(patientId));
      return { id: patientId, ...patientSnap.data() };
    }

    const counterSnap = await txn.get(counter);
    const seq = (counterSnap.exists ? counterSnap.data().seq : 0) + 1;
    const patientId = `P-${String(seq).padStart(6, '0')}`;
    const patientRef = patientsCol(db).doc(patientId);

    const patientData = {
      patient_id: patientId,
      name: extra.name || null,
      phone: normalized,
      email: null,
      password_hash: null,
      practice_id: PRACTICE_ID,
      source: extra.source || 'whatsapp',
      created_at: new Date().toISOString(),
    };

    txn.set(counter, { seq });
    txn.set(patientRef, patientData);
    txn.set(phoneIdxRef, { patient_id: patientId });

    return { id: patientId, ...patientData };
  });
}

// Website registration. Claims an existing WhatsApp-only record for the
// same phone (no password yet) instead of creating a duplicate identity —
// Phase 0 §4's "must resolve to the same canonical patient record". Fails
// with ACCOUNT_EXISTS if that phone is already claimed, or EMAIL_TAKEN if
// the email belongs to a different patient.
async function createPatientWithCredentials(db, { name, email, phone, passwordHash }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedPhone) throw new IdentityError('INVALID_PHONE', 'Invalid phone number');
  if (!normalizedEmail) throw new IdentityError('INVALID_EMAIL', 'Invalid email address');
  if (!name || !name.trim()) throw new IdentityError('INVALID_NAME', 'Name is required');
  if (!passwordHash) throw new IdentityError('INVALID_PASSWORD', 'Password hash is required');

  const phoneIdxRef = phoneIndexCol(db).doc(normalizedPhone);
  const emailIdxRef = emailIndexCol(db).doc(normalizedEmail);
  const counter = counterRef(db);

  return db.runTransaction(async (txn) => {
    const [phoneIdxSnap, emailIdxSnap] = [await txn.get(phoneIdxRef), await txn.get(emailIdxRef)];

    if (emailIdxSnap.exists && (!phoneIdxSnap.exists || emailIdxSnap.data().patient_id !== phoneIdxSnap.data().patient_id)) {
      throw new IdentityError('EMAIL_TAKEN', 'An account already exists for this email.');
    }

    if (phoneIdxSnap.exists) {
      const patientId = phoneIdxSnap.data().patient_id;
      const patientRef = patientsCol(db).doc(patientId);
      const patientSnap = await txn.get(patientRef);
      const existing = patientSnap.data();
      if (existing.password_hash) {
        throw new IdentityError('ACCOUNT_EXISTS', 'An account already exists for this phone number.');
      }
      const updates = { name: name.trim(), email: normalizedEmail, password_hash: passwordHash, source: 'merged' };
      txn.update(patientRef, updates);
      txn.set(emailIdxRef, { patient_id: patientId });
      return { id: patientId, ...existing, ...updates };
    }

    const counterSnap = await txn.get(counter);
    const seq = (counterSnap.exists ? counterSnap.data().seq : 0) + 1;
    const patientId = `P-${String(seq).padStart(6, '0')}`;
    const patientRef = patientsCol(db).doc(patientId);
    const patientData = {
      patient_id: patientId,
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      password_hash: passwordHash,
      practice_id: PRACTICE_ID,
      source: 'website',
      created_at: new Date().toISOString(),
    };

    txn.set(counter, { seq });
    txn.set(patientRef, patientData);
    txn.set(phoneIdxRef, { patient_id: patientId });
    txn.set(emailIdxRef, { patient_id: patientId });

    return { id: patientId, ...patientData };
  });
}

module.exports = {
  PRACTICE_ID,
  IdentityError,
  normalizePhone,
  normalizeEmail,
  getPatientById,
  findPatientByPhone,
  findPatientByEmail,
  getOrCreatePatientByPhone,
  createPatientWithCredentials,
};
