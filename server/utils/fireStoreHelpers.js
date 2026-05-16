const admin = require('firebase-admin');

async function saveMessage(db, { name, phone, text, timestamp, raw }) {
  const docRef = await db.collection('whatsapp_messages').add({
    name: name || null,
    phone: phone || null,
    text: text || null,
    timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
    raw: raw || null,
  });
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() };
}

async function createAppointmentFromMessage(db, { messageId, name, phone, reason, preferredDate, status, createdAt }) {
  const data = {
    messageId: messageId || null,
    name: name || null,
    phone: phone || null,
    reason: reason || null,
    preferredDate: preferredDate || null,
    status: status || 'requested',
    createdAt: createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: null,
  };
  const docRef = await db.collection('whatsapp_appointments').add(data);
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() };
}

async function updateAppointmentStatus(db, appointmentId, updates) {
  const ref = db.collection('whatsapp_appointments').doc(appointmentId);
  await ref.update(updates);
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function getOrCreateConversation(db, phone) {
  const ref = db.collection('patient_conversations').doc(phone);
  const snap = await ref.get();
  if (snap.exists) {
    return { id: snap.id, ...snap.data() };
  }
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const data = {
    phone,
    current_state: 'initial',
    collected_data: {},
    last_message_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: expiresAt,
  };
  await ref.set(data);
  const newSnap = await ref.get();
  return { id: newSnap.id, ...newSnap.data() };
}

async function updateConversationState(db, phone, state, collectedData = null) {
  const ref = db.collection('patient_conversations').doc(phone);
  const updates = {
    current_state: state,
    last_message_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (collectedData) {
    updates.collected_data = collectedData;
  }
  await ref.update(updates);
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function createAppointment(db, { phone, patient_name, date, time, payment_method, medical_aid, membership_number, service_id }) {
  const docRef = await db.collection('appointments').add({
    phone,
    patient_name,
    date,
    time,
    status: 'pending_approval',
    payment_method,
    medical_aid: medical_aid || null,
    membership_number: membership_number || null,
    service_id: service_id || null,
    conversation_flow_state: 'complete',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    approved_by: null,
    approved_at: null,
  });
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() };
}

async function getAvailableSlots(db, date) {
  const snap = await db.collection('time_slots')
    .where('date', '==', date)
    .where('status', '==', 'available')
    .orderBy('time', 'asc')
    .get();
  const slots = [];
  snap.forEach(doc => slots.push({ id: doc.id, ...doc.data() }));
  return slots;
}

async function markSlotPending(db, slotId, phone) {
  const ref = db.collection('time_slots').doc(slotId);
  await ref.update({
    status: 'pending',
    booked_by_phone: phone,
    booked_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function markSlotConfirmed(db, slotId) {
  const ref = db.collection('time_slots').doc(slotId);
  await ref.update({ status: 'confirmed' });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function getServices(db) {
  const snap = await db.collection('services').orderBy('name', 'asc').get();
  const services = [];
  snap.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
  return services;
}

async function getMedicalAids(db) {
  const snap = await db.collection('medical_aids').orderBy('name', 'asc').get();
  const aids = [];
  snap.forEach(doc => aids.push({ id: doc.id, ...doc.data() }));
  return aids;
}

async function getNextSevenDays() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

module.exports = {
  saveMessage,
  createAppointmentFromMessage,
  updateAppointmentStatus,
  getOrCreateConversation,
  updateConversationState,
  createAppointment,
  getAvailableSlots,
  markSlotPending,
  markSlotConfirmed,
  getServices,
  getMedicalAids,
  getNextSevenDays,
};
