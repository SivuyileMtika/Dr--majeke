const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const admin      = require('firebase-admin');
const bodyParser = require('body-parser');
const twilio     = require('twilio');
const {
  getOrCreateConversation,
  updateConversationState,
  createAppointment,
  markSlotPending,
  getServices,
  getMedicalAids,
  getBookedSlots,
} = require('./utils/fireStoreHelpers');
const {
  handleInitialMessage,
  handleMenuSelection,
  handleDateSelection,
  handleTimeSelection,
  handlePaymentMethod,
  handleMedicalAidSelection,
  handleMembershipNumber,
  handlePatientName,
} = require('./services/messageRouter');
const { seedMedicalAids, seedServices, seedTimeSlots } = require('./utils/seeding');
const { authMiddleware }           = require('./middleware/auth');
const { confirmAppointmentHandler } = require('./controllers/appointmentController');
const { sendWhatsAppMessage }      = require('./utils/whatsappButtons');

dotenv.config();

const requiredEnvVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER', 'FIREBASE_SERVICE_ACCOUNT'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

let db = null;
try {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount;
  try { serviceAccount = JSON.parse(sa); } catch { serviceAccount = require(sa); }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log('Firebase Admin initialized.');

  seedMedicalAids(db).catch(e => console.warn('Medical aids seeding warning:', e.message));
  seedServices(db).catch(e => console.warn('Services seeding warning:', e.message));
  // 15 days, 08:00–17:00, 30-min slots — covers the website's 14-day booking window
  seedTimeSlots(db, 15, 8, 17, 30).catch(e => console.warn('Time slots seeding warning:', e.message));
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err.message);
  process.exit(1);
}

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Twilio sends form-encoded POST bodies; JSON for our own REST endpoints
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const webhookUrl = process.env.WEBHOOK_URL || `${req.protocol}://${req.get('host')}/webhook`;
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    webhookUrl,
    req.body
  );
  if (!isValid && process.env.NODE_ENV === 'production') {
    return res.status(403).send('Forbidden');
  }

  const phone = (req.body.From || '').replace('whatsapp:', '');
  const text  = (req.body.Body || '').trim();

  if (!phone) return res.status(400).send('Missing From');

  try {
    const conversation  = await getOrCreateConversation(db, phone);
    let nextState       = conversation.current_state;
    const collectedData = conversation.collected_data || {};

    try {
      if (nextState === 'initial') {
        nextState = await handleInitialMessage(db, phone, text);
      } else if (nextState === 'menu') {
        nextState = await handleMenuSelection(db, phone, text);
      } else if (nextState === 'selecting_date') {
        nextState = await handleDateSelection(db, phone, text, collectedData);
      } else if (nextState === 'selecting_time') {
        nextState = await handleTimeSelection(db, phone, text, collectedData);
      } else if (nextState === 'payment_method') {
        nextState = await handlePaymentMethod(db, phone, text, collectedData);
      } else if (nextState === 'medical_aid_select') {
        nextState = await handleMedicalAidSelection(db, phone, text, collectedData);
      } else if (nextState === 'membership_number') {
        nextState = await handleMembershipNumber(db, phone, text, collectedData);
      } else if (nextState === 'patient_name') {
        nextState = await handlePatientName(db, phone, text, collectedData);
      } else if (nextState === 'confirm_details') {
        const t = text.toLowerCase();
        if (t === '1' || t.includes('confirm') || t.includes('yes') || t.includes('booking')) {
          const apt = await createAppointment(db, {
            phone,
            patient_name:      collectedData.patient_name,
            date:              collectedData.selected_date,
            time:              collectedData.selected_time,
            payment_method:    collectedData.payment_method,
            medical_aid:       collectedData.medical_aid || null,
            membership_number: collectedData.membership_number || null,
          });

          await markSlotPending(db, collectedData.selected_slot_id, phone);

          await sendWhatsAppMessage(phone,
            `Thank you ${collectedData.patient_name}! Your booking is pending doctor approval. You will receive confirmation within 24 hours.`
          );
          nextState = 'complete';
        } else if (t === '2' || t.includes('cancel') || t.includes('no')) {
          await sendWhatsAppMessage(phone, 'Booking cancelled. Send "Hi" to start over.');
          nextState = 'initial';
        }
      }

      await updateConversationState(db, phone, nextState, collectedData);
    } catch (handlerErr) {
      console.error(`Handler error: ${handlerErr.message}`);
      await sendWhatsAppMessage(phone, 'An error occurred. Please try again or send "Hi" to restart.');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

app.post('/confirm-appointment', authMiddleware, (req, res) => confirmAppointmentHandler(db, req, res));

app.get('/services', async (req, res) => {
  try {
    const services = await getServices(db);
    res.json({ success: true, data: services });
  } catch (err) {
    console.error('get-services error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/medical-aids', async (req, res) => {
  try {
    const aids = await getMedicalAids(db);
    res.json({ success: true, data: aids });
  } catch (err) {
    console.error('get-medical-aids error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/booked-slots', async (req, res) => {
  try {
    const data = await getBookedSlots(db);
    res.json({ success: true, data });
  } catch (err) {
    console.error('booked-slots error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/book', async (req, res) => {
  try {
    const { patient_name, phone, email, date, time, reason, payment_method, medical_aid, medical_plan, membership_number } = req.body || {};
    if (!patient_name || !phone || !date || !time) {
      return res.status(400).json({ success: false, error: 'Missing required fields: patient_name, phone, date, time' });
    }

    const conflict = await db.collection('appointments')
      .where('date', '==', date)
      .where('time', '==', time)
      .where('status', '==', 'confirmed')
      .limit(1)
      .get();
    if (!conflict.empty) {
      return res.status(409).json({ success: false, error: 'This time slot is already booked. Please choose another time.' });
    }

    const apt = await createAppointment(db, {
      phone,
      patient_name,
      date,
      time,
      payment_method: payment_method || 'cash',
      medical_aid:    medical_aid || null,
      membership_number: membership_number || null,
    });
    await db.collection('appointments').doc(apt.id).update({
      source:       'website',
      email:        email || null,
      reason:       reason || null,
      medical_plan: medical_plan || null,
    });
    return res.json({ success: true, appointmentId: apt.id });
  } catch (err) {
    console.error('book endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/', (req, res) => res.json({ ok: true, service: 'WhatsApp Booking System (Twilio)' }));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
