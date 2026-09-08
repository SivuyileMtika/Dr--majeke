#!/usr/bin/env node
'use strict';

// Phase 0 §5 — Patient ID migration.
//
// Backfills a canonical patient_id onto every existing phone-keyed record
// in `appointments` and `patient_conversations`, without deleting or
// overwriting anything else on those documents. Safe to run more than
// once: any document that already has patient_id is skipped, and
// getOrCreatePatientByPhone reuses the same patient_id for a phone it's
// already seen (via patient_phone_index) rather than allocating a new one.
//
// What it does NOT do: touch phone/name/any other existing field, delete
// any document, or change appointment/conversation status. It only adds
// one field (patient_id) to documents that don't have it yet, and creates
// `patients` + `patient_phone_index` records for phones seen for the
// first time.
//
// Usage:
//   node server/scripts/migrate-patient-ids.js            # dry run (default)
//   node server/scripts/migrate-patient-ids.js --apply     # actually writes
//
// Requires the same FIREBASE_SERVICE_ACCOUNT env var (or a path to the
// JSON key file) the main server uses. Run from an environment that has
// it set, e.g.:
//   FIREBASE_SERVICE_ACCOUNT=/path/to/key.json node server/scripts/migrate-patient-ids.js --apply

const admin = require('firebase-admin');
const { getOrCreatePatientByPhone } = require('../modules/identity');

async function main() {
  const apply = process.argv.includes('--apply');

  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set. Aborting.');
    process.exit(1);
  }
  let serviceAccount;
  try { serviceAccount = JSON.parse(sa); } catch { serviceAccount = require(sa); }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log(apply ? 'Running LIVE (writes enabled)' : 'Running DRY RUN (no writes — pass --apply to write)');

  const summary = {
    appointments_scanned: 0,
    appointments_already_migrated: 0,
    appointments_updated: 0,
    appointments_skipped_no_phone: 0,
    conversations_scanned: 0,
    conversations_already_migrated: 0,
    conversations_updated: 0,
    patients_created_or_reused: new Set(),
  };

  // --- appointments ---
  const appointmentsSnap = await db.collection('appointments').get();
  summary.appointments_scanned = appointmentsSnap.size;
  for (const doc of appointmentsSnap.docs) {
    const data = doc.data();
    if (data.patient_id) { summary.appointments_already_migrated++; continue; }
    if (!data.phone) { summary.appointments_skipped_no_phone++; continue; }

    const patient = await getOrCreatePatientByPhoneMaybeApply(db, data.phone, { name: data.patient_name, source: 'whatsapp' }, apply);
    summary.patients_created_or_reused.add(patient.id);
    if (apply) {
      await doc.ref.update({ patient_id: patient.id });
    }
    summary.appointments_updated++;
  }

  // --- patient_conversations (doc ID is already the phone number) ---
  const conversationsSnap = await db.collection('patient_conversations').get();
  summary.conversations_scanned = conversationsSnap.size;
  for (const doc of conversationsSnap.docs) {
    const data = doc.data();
    if (data.patient_id) { summary.conversations_already_migrated++; continue; }
    const phone = data.phone || doc.id;
    if (!phone) continue;

    const patient = await getOrCreatePatientByPhoneMaybeApply(db, phone, { source: 'whatsapp' }, apply);
    summary.patients_created_or_reused.add(patient.id);
    if (apply) {
      await doc.ref.update({ patient_id: patient.id });
    }
    summary.conversations_updated++;
  }

  console.log('\n--- Migration summary ---');
  console.log(`Appointments scanned:              ${summary.appointments_scanned}`);
  console.log(`  already had patient_id:          ${summary.appointments_already_migrated}`);
  console.log(`  updated this run:                ${summary.appointments_updated}`);
  console.log(`  skipped (no phone on record):    ${summary.appointments_skipped_no_phone}`);
  console.log(`Conversations scanned:              ${summary.conversations_scanned}`);
  console.log(`  already had patient_id:          ${summary.conversations_already_migrated}`);
  console.log(`  updated this run:                ${summary.conversations_updated}`);
  console.log(`Distinct patients created/reused:   ${summary.patients_created_or_reused.size}`);
  if (!apply) {
    console.log('\nThis was a DRY RUN — no data was written. Re-run with --apply to write.');
  }
}

// In dry-run mode we still need to know what patient_id *would* be
// assigned (to report a meaningful summary) without actually writing
// patients/patient_phone_index records — so dry-run resolves via
// findPatientByPhone/allocation math read-only where possible, but since
// getOrCreatePatientByPhone always writes when it creates, dry-run instead
// reports a placeholder for phones it hasn't seen yet in this run.
const identity = require('../modules/identity');
async function getOrCreatePatientByPhoneMaybeApply(db, phone, extra, apply) {
  if (apply) return getOrCreatePatientByPhone(db, phone, extra);
  const existing = await identity.findPatientByPhone(db, phone);
  if (existing) return existing;
  return { id: `(new, phone ${identity.normalizePhone(phone) || phone})` };
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
