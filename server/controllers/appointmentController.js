const admin  = require('firebase-admin');
const twilio = require('twilio');
const { markSlotConfirmed } = require('../utils/fireStoreHelpers');
const { sendWhatsAppMessage } = require('../utils/whatsappButtons');

// Normalise any SA phone number to E.164 (+27xxxxxxxxx)
function toE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length === 9) return `+27${digits}`;
  if (digits.startsWith('+')) return phone;
  return `+${digits}`;
}

async function sendSms(to, body) {
  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const token  = process.env.TWILIO_AUTH_TOKEN;
  const from   = process.env.TWILIO_SMS_NUMBER; // regular Twilio number for SMS
  if (!from) throw new Error('TWILIO_SMS_NUMBER not set');
  const client = twilio(sid, token);
  return client.messages.create({ from, to, body });
}

async function confirmAppointmentHandler(db, req, res) {
  const { appointmentId, confirm, doctorName } = req.body || {};
  if (!appointmentId || typeof confirm !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Invalid input' });
  }

  try {
    const appointmentRef  = db.collection('appointments').doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    const appointment = appointmentSnap.data();
    const status      = confirm ? 'confirmed' : 'rejected';

    await appointmentRef.update({
      status,
      approved_by: doctorName || 'doctor',
      approved_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const date        = new Date(`${appointment.date}T${appointment.time}`);
    const dateDisplay = date.toLocaleDateString('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' });
    const clinic      = doctorName || 'Dr. Majeke Clinic';

    const message = confirm
      ? `Hello ${appointment.patient_name}, your appointment on ${dateDisplay} at ${appointment.time} has been CONFIRMED by ${clinic}. Please arrive 10 minutes early. - Dr. Majeke Clinic`
      : `Hello ${appointment.patient_name}, unfortunately your appointment request for ${dateDisplay} at ${appointment.time} has been declined by ${clinic}. Please call us to reschedule. - Dr. Majeke Clinic`;

    // Mark time slot confirmed
    if (confirm) {
      const slots = await db.collection('time_slots')
        .where('date', '==', appointment.date)
        .where('time', '==', appointment.time)
        .limit(1).get();
      if (!slots.empty) await markSlotConfirmed(db, slots.docs[0].id);
    }

    const phone = toE164(appointment.phone);

    if (appointment.source === 'website') {
      // Website bookings → SMS
      try {
        await sendSms(phone, message);
        console.log(`SMS sent to ${phone}`);
      } catch (smsErr) {
        console.error('SMS failed, trying WhatsApp:', smsErr.message);
        try {
          await sendWhatsAppMessage(phone, message);
        } catch (waErr) {
          console.error('WhatsApp also failed:', waErr.message);
        }
      }
    } else {
      // WhatsApp bookings → WhatsApp
      try {
        await sendWhatsAppMessage(phone, message);
        console.log(`WhatsApp sent to ${phone}`);
      } catch (waErr) {
        console.error('WhatsApp failed:', waErr.message);
      }
    }

    return res.json({ success: true, status });
  } catch (err) {
    console.error('confirmAppointmentHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { confirmAppointmentHandler };
