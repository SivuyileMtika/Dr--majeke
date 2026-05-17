/*
.env.example (example vars expected):
PORT=3000
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_TOKEN=EAA... (Meta access token)
WHATSAPP_PHONE_ID=1234567890
FIREBASE_SERVICE_ACCOUNT={...}   # JSON string of service account or path to JSON file
DOCTOR_AUTH_TOKEN=secure-token-here
*/

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const {
  getOrCreateConversation,
  updateConversationState,
  createAppointment,
  markSlotPending,
  markSlotConfirmed,
} = require('./utils/fireStoreHelpers');
const { getServices, getMedicalAids } = require('./utils/fireStoreHelpers');
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
const { authMiddleware } = require('./middleware/auth');
const { confirmAppointmentHandler } = require('./controllers/appointmentController');
const { sendWhatsAppMessage } = require('./utils/sendWhatsAppMessage');

dotenv.config();

const requiredEnvVars = ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'FIREBASE_SERVICE_ACCOUNT'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

let db = null;
try {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(sa);
  } catch (e) {
    serviceAccount = require(sa);
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log('Firebase Admin initialized.');

  seedMedicalAids(db).catch(e => console.warn('Medical aids seeding warning:', e.message));
  seedServices(db).catch(e => console.warn('Services seeding warning:', e.message));
  seedTimeSlots(db).catch(e => console.warn('Time slots seeding warning:', e.message));
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err.message);
  process.exit(1);
}

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
  return res.status(400).json({ success: false, error: 'Missing mode or token' });
});

function getTextFromMessage(msg) {
  if (!msg) return '';
  if (msg.text && msg.text.body) return msg.text.body;
  if (msg.type === 'button' && msg.button && msg.button.text) return msg.button.text;
  return '';
}

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;
        for (const change of entry.changes) {
          const value = change.value || {};
          const messages = value.messages || [];

          for (const msg of messages) {
            const phone = msg.from;
            const text = getTextFromMessage(msg) || '';
            console.log(`Message from ${phone}: ${text}`);

            const conversation = await getOrCreateConversation(db, phone);
            let nextState = conversation.current_state;
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
                if (text.includes('✅') || text.includes('Confirm')) {
                  const apt = await createAppointment(db, {
                    phone,
                    patient_name: collectedData.patient_name,
                    date: collectedData.selected_date,
                    time: collectedData.selected_time,
                    payment_method: collectedData.payment_method,
                    medical_aid: collectedData.medical_aid || null,
                    membership_number: collectedData.membership_number || null,
                  });

                  await markSlotPending(db, collectedData.selected_slot_id, phone);

                  await sendWhatsAppMessage(phone,
                    `✅ Thank you ${collectedData.patient_name}! Your booking is pending doctor approval.\n\nYou will receive confirmation within 24 hours.`
                  );
                  nextState = 'complete';
                } else if (text.includes('❌') || text.includes('Cancel')) {
                  await sendWhatsAppMessage(phone, 'Booking cancelled. You can start over by sending "Hi".');
                  nextState = 'initial';
                }
              }

              await updateConversationState(db, phone, nextState, collectedData);
            } catch (handlerErr) {
              console.error(`Error handling message: ${handlerErr.message}`);
              await sendWhatsAppMessage(phone, '❌ An error occurred. Please try again.');
            }
          }
        }
      }
      return res.json({ success: true });
    }
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
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

app.post('/book', async (req, res) => {
  try {
    const { patient_name, phone, email, date, time, reason, payment_method, medical_aid, medical_plan, membership_number } = req.body || {};
    if (!patient_name || !phone || !date || !time) {
      return res.status(400).json({ success: false, error: 'Missing required fields: patient_name, phone, date, time' });
    }
    const apt = await createAppointment(db, {
      phone,
      patient_name,
      date,
      time,
      payment_method: payment_method || 'cash',
      medical_aid: medical_aid || null,
      membership_number: membership_number || null,
    });
    await db.collection('appointments').doc(apt.id).update({
      source: 'website',
      email: email || null,
      reason: reason || null,
      medical_plan: medical_plan || null,
    });
    return res.json({ success: true, appointmentId: apt.id });
  } catch (err) {
    console.error('book endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/', (req, res) => res.json({ ok: true, service: 'WhatsApp Booking System' }));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
