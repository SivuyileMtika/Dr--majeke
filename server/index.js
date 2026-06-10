const express    = require('express');
const cors       = require('cors');
const dotenv     = require('dotenv');
const admin      = require('firebase-admin');
const bodyParser = require('body-parser');
const crypto     = require('crypto');
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
const { authMiddleware }            = require('./middleware/auth');
const { confirmAppointmentHandler } = require('./controllers/appointmentController');
const { sendWhatsAppMessage }       = require('./utils/whatsappButtons');

dotenv.config();

const requiredEnvVars = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'FIREBASE_SERVICE_ACCOUNT',
];
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
  seedTimeSlots(db, 15, 8, 17, 30).catch(e => console.warn('Time slots seeding warning:', e.message));
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err.message);
  process.exit(1);
}

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Preserve raw body for Meta signature verification
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// Meta webhook verification handshake
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
});

// Meta webhook messages
app.post('/webhook', (req, res) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret && process.env.NODE_ENV === 'production') {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return res.status(403).send('Missing signature');
    const expected = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(403).send('Invalid signature');
    }
  }

  // Respond immediately — Meta requires 200 within 20s
  res.status(200).send('OK');

  processWebhook(req.body).catch(err => console.error('Webhook processing error:', err));
});

async function processWebhook(body) {
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const messages = change.value?.messages || [];

      for (const msg of messages) {
        const phoneRaw = msg.from; // '27762677268' — no +
        const phone    = `+${phoneRaw}`;
        let text = '';

        if (msg.type === 'text') {
          text = (msg.text?.body || '').trim();
        } else if (msg.type === 'interactive') {
          if (msg.interactive?.type === 'button_reply') {
            text = msg.interactive.button_reply.title;
          } else if (msg.interactive?.type === 'list_reply') {
            text = msg.interactive.list_reply.title;
          }
        }

        if (!text) continue;

        console.log(`Webhook: from=${phone} text="${text}"`);

        try {
          const conversation  = await getOrCreateConversation(db, phone);
          let nextState       = conversation.current_state;
          const collectedData = conversation.collected_data || {};

          console.log(`State: ${nextState}`);

          try {
            if (nextState === 'complete') nextState = 'initial';

            if      (nextState === 'initial')          nextState = await handleInitialMessage(db, phone, text);
            else if (nextState === 'menu')             nextState = await handleMenuSelection(db, phone, text);
            else if (nextState === 'selecting_date')   nextState = await handleDateSelection(db, phone, text, collectedData);
            else if (nextState === 'selecting_time')   nextState = await handleTimeSelection(db, phone, text, collectedData);
            else if (nextState === 'payment_method')   nextState = await handlePaymentMethod(db, phone, text, collectedData);
            else if (nextState === 'medical_aid_select') nextState = await handleMedicalAidSelection(db, phone, text, collectedData);
            else if (nextState === 'membership_number')  nextState = await handleMembershipNumber(db, phone, text, collectedData);
            else if (nextState === 'patient_name')     nextState = await handlePatientName(db, phone, text, collectedData);
            else if (nextState === 'confirm_details') {
              const t = text.toLowerCase();
              if (t === '1' || t.includes('confirm') || t.includes('yes') || t.includes('booking')) {
                await createAppointment(db, {
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
          console.error('Conversation error:', err);
        }
      }
    }
  }
}

app.post('/confirm-appointment', authMiddleware, (req, res) => confirmAppointmentHandler(db, req, res));

app.get('/services', async (req, res) => {
  try {
    res.json({ success: true, data: await getServices(db) });
  } catch (err) {
    console.error('get-services error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/medical-aids', async (req, res) => {
  try {
    res.json({ success: true, data: await getMedicalAids(db) });
  } catch (err) {
    console.error('get-medical-aids error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/booked-slots', async (req, res) => {
  try {
    res.json({ success: true, data: await getBookedSlots(db) });
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
      .limit(1).get();
    if (!conflict.empty) {
      return res.status(409).json({ success: false, error: 'This time slot is already booked. Please choose another time.' });
    }

    const apt = await createAppointment(db, {
      phone, patient_name, date, time,
      payment_method:    payment_method || 'cash',
      medical_aid:       medical_aid || null,
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

app.get('/', (req, res) => res.json({ ok: true, service: 'WhatsApp Booking System (Meta Cloud API)', v: 3 }));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
