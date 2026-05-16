const admin = require('firebase-admin');
const { markSlotConfirmed } = require('../utils/fireStoreHelpers');
const { sendWhatsAppMessage } = require('../utils/whatsappButtons');

async function confirmAppointmentHandler(db, req, res) {
  const { appointmentId, confirm, doctorName } = req.body || {};
  if (!appointmentId || typeof confirm !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Invalid input' });
  }

  try {
    const appointmentRef = db.collection('appointments').doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();
    if (!appointmentSnap.exists) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    const appointment = appointmentSnap.data();
    const status = confirm ? 'confirmed' : 'rejected';

    await appointmentRef.update({
      status,
      approved_by: doctorName || 'doctor',
      approved_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const dateStr = appointment.date;
    const timeStr = appointment.time;
    const date = new Date(`${dateStr}T${timeStr}`);
    const dateDisplay = date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });

    const message = confirm
      ? `✅ Hello ${appointment.patient_name}, your appointment on ${dateDisplay} at ${timeStr} has been CONFIRMED by ${doctorName || 'our clinic'}.\n\nPlease arrive 10 minutes early.`
      : `❌ Hello ${appointment.patient_name}, we are sorry but your appointment request has been REJECTED by ${doctorName || 'our clinic'}. Please contact us to reschedule.`;

    if (confirm) {
      const slots = await db.collection('time_slots')
        .where('date', '==', appointment.date)
        .where('time', '==', appointment.time)
        .limit(1)
        .get();

      if (!slots.empty) {
        await markSlotConfirmed(db, slots.docs[0].id);
      }
    }

    try {
      await sendWhatsAppMessage(appointment.phone, message);
    } catch (sendErr) {
      console.error('Failed to send WhatsApp message:', sendErr.message);
    }

    return res.json({ success: true, status });
  } catch (err) {
    console.error('confirmAppointmentHandler error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

module.exports = { confirmAppointmentHandler };
