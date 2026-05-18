const admin = require('firebase-admin');

async function getOrCreateConversation(db, phone) {
  const ref  = db.collection('patient_conversations').doc(phone);
  const snap = await ref.get();
  if (snap.exists) return { id: snap.id, ...snap.data() };

  const data = {
    phone,
    current_state:   'initial',
    collected_data:  {},
    last_message_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  const fresh = await ref.get();
  return { id: fresh.id, ...fresh.data() };
}

async function updateConversationState(db, phone, state, collectedData = null) {
  const updates = {
    current_state:   state,
    last_message_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (collectedData) updates.collected_data = collectedData;
  await db.collection('patient_conversations').doc(phone).update(updates);
}

async function createAppointment(db, { phone, patient_name, date, time, payment_method, medical_aid, membership_number, service_id }) {
  const ref = await db.collection('appointments').add({
    phone,
    patient_name,
    date,
    time,
    status:            'pending_approval',
    payment_method,
    medical_aid:       medical_aid || null,
    membership_number: membership_number || null,
    service_id:        service_id || null,
    created_at:        admin.firestore.FieldValue.serverTimestamp(),
    approved_by:       null,
    approved_at:       null,
  });
  return { id: ref.id };
}

async function getAvailableSlots(db, date) {
  const snap = await db.collection('time_slots')
    .where('date', '==', date)
    .where('status', '==', 'available')
    .orderBy('time', 'asc')
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Returns next ≤7 weekday dates that still have at least one available slot
async function getAvailableDates(db) {
  const todayStr = new Date().toISOString().split('T')[0];

  const snap = await db.collection('time_slots')
    .where('status', '==', 'available')
    .get();

  const dateSet = new Set();
  snap.docs.forEach(doc => {
    const { date } = doc.data();
    if (date > todayStr) dateSet.add(date);
  });

  return [...dateSet]
    .sort()
    .filter(d => {
      const day = new Date(d + 'T00:00:00').getDay();
      return day !== 0 && day !== 6; // weekdays only
    })
    .slice(0, 7);
}

// Returns { 'YYYY-MM-DD': ['HH:MM', ...] } for all confirmed/pending appointments
async function getBookedSlots(db) {
  const snap = await db.collection('appointments')
    .where('status', 'in', ['confirmed', 'pending_approval'])
    .get();

  const result = {};
  snap.docs.forEach(doc => {
    const { date, time } = doc.data();
    if (date && time) {
      if (!result[date]) result[date] = [];
      if (!result[date].includes(time)) result[date].push(time);
    }
  });
  return result;
}

async function markSlotPending(db, slotId, phone) {
  await db.collection('time_slots').doc(slotId).update({
    status:          'pending',
    booked_by_phone: phone,
    booked_at:       admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function markSlotConfirmed(db, slotId) {
  await db.collection('time_slots').doc(slotId).update({ status: 'confirmed' });
}

async function getServices(db) {
  const snap = await db.collection('services').orderBy('name', 'asc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getMedicalAids(db) {
  const snap = await db.collection('medical_aids').orderBy('name', 'asc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function getNextSevenDays() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

module.exports = {
  getOrCreateConversation,
  updateConversationState,
  createAppointment,
  getAvailableSlots,
  getAvailableDates,
  getBookedSlots,
  markSlotPending,
  markSlotConfirmed,
  getServices,
  getMedicalAids,
  getNextSevenDays,
};
