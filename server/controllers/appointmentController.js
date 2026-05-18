const admin  = require('firebase-admin');
const twilio = require('twilio');
const { markSlotConfirmed } = require('../utils/fireStoreHelpers');
const { sendWhatsAppMessage } = require('../utils/whatsappButtons');

function toE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0')  && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length === 9) return `+27${digits}`;
  if (digits.startsWith('+')) return phone;
  return `+${digits}`;
}

async function sendSms(to, body) {
  const from = process.env.TWILIO_SMS_NUMBER;
  if (!from) throw new Error('TWILIO_SMS_NUMBER not set');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    .messages.create({ from, to, body });
}

async function confirmAppointmentHandler(db, req, res) {
  const { appointmentId, confirm, doctorName } = req.body || {};
  if (!appointmentId || typeof confirm !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Invalid input' });
  }

  try {
    const ref  = db.collection('appointments').doc(appointmentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    const apt    = snap.data();
    const status = confirm ? 'confirmed' : 'rejected';
    const clinic = doctorName || 'Dr. S Mtika';

    await ref.update({
      status,
      approved_by: clinic,
      approved_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const date        = new Date(`${apt.date}T${apt.time}`);
    const dateDisplay = date.toLocaleDateString('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' });

    const message = confirm
      ? `Hello ${apt.patient_name}, your appointment on ${dateDisplay} at ${apt.time} has been CONFIRMED. Please arrive 10 minutes early. - ${clinic}`
      : `Hello ${apt.patient_name}, your appointment request for ${dateDisplay} at ${apt.time} has been declined. Please call us to reschedule. - ${clinic}`;

    if (confirm) {
      const slots = await db.collection('time_slots')
        .where('date', '==', apt.date)
        .where('time', '==', apt.time)
        .limit(1).get();
      if (!slots.empty) await markSlotConfirmed(db, slots.docs[0].id);
    }

    const phone = toE164(apt.phone);

    if (apt.source === 'website') {
      try {
        await sendSms(phone, message);
      } catch (smsErr) {
        console.error('SMS failed, trying WhatsApp:', smsErr.message);
        try { await sendWhatsAppMessage(phone, message); }
        catch (waErr) { console.error('WhatsApp also failed:', waErr.message); }
      }
    } else {
      try { await sendWhatsAppMessage(phone, message); }
      catch (waErr) { console.error('WhatsApp failed:', waErr.message); }
    }

    return res.json({ success: true, status });
  } catch (err) {
    console.error('confirmAppointmentHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { confirmAppointmentHandler };
