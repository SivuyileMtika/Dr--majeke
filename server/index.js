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
  getAvailableSlots,
  getAvailableDates,
  getBookedSlots,
  getTodayAppointments,
  getTomorrowAppointments,
} = require('./utils/fireStoreHelpers');
const {
  handleInitialMessage,
  handleMenuSelection,
  handleDateSelection,
  handleTimeSelection,
  handlePaymentMethod,
  handleMedicalAidSelection,
  handleMedicalAidPlan,
  handleMedicalAidPlanCustom,
  handleMedicalAidCustom,
  handleMembershipNumber,
  handlePatientName,
  handleIdNumber,
  handleReasonForVisit,
  handleAwaitingFlow,
} = require('./services/messageRouter');
const { seedMedicalAids, seedServices, seedTimeSlots } = require('./utils/seeding');
const { authMiddleware }            = require('./middleware/auth');
const { confirmAppointmentHandler } = require('./controllers/appointmentController');
const { sendWhatsAppMessage, sendWhatsAppButtons, sendFlowMessage } = require('./utils/whatsappButtons');
const { decryptRequest, encryptResponse }     = require('./utils/flowCrypto');

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

  // Keep a rolling 15-day window of bookable slots. Without this, the window
  // only ever gets extended when the server restarts/redeploys — if the
  // service stays up for >15 days (as it did Aug 3 -> Sep 8), every future
  // date runs out and the booking flow reports "no available appointment
  // dates" until the next deploy. Re-seed daily so it self-heals.
  const reseedTimeSlots = () =>
    seedTimeSlots(db, 15, 8, 17, 30).catch(e => console.warn('Time slots seeding warning:', e.message));
  reseedTimeSlots();
  setInterval(reseedTimeSlots, 24 * 60 * 60 * 1000);
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

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

async function notifyN8n(appointmentData) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(appointmentData),
    });
    if (!res.ok) console.warn(`n8n notification returned ${res.status}`);
    else console.log('n8n notified of new appointment');
  } catch (err) {
    console.warn('n8n notification failed (non-critical):', err.message);
  }
}

// WhatsApp Flow endpoint — handles dynamic data for each screen
app.post('/flow-endpoint', async (req, res) => {
  const privateKey = process.env.FLOW_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKey) {
    console.error('FLOW_PRIVATE_KEY not set');
    return res.status(500).send('Flow key not configured');
  }
  try {
    const { decryptedBody, aesKey, iv } = decryptRequest(req.body, privateKey);
    console.log('Flow request action:', decryptedBody.action, 'screen:', decryptedBody.screen);
    const response  = await handleFlowRequest(decryptedBody);
    const encrypted = encryptResponse(response, aesKey, iv);
    res.type('text/plain').send(encrypted);
  } catch (err) {
    console.error('Flow endpoint error:', err.message);
    res.status(500).send('Error');
  }
});

async function handleFlowRequest({ action, screen, data }) {
  if (action === 'ping') {
    return { data: { status: 'active' } };
  }

  if (action === 'INIT' || (action === 'data_exchange' && screen === 'DATE_SCREEN' && !data?.selected_date)) {
    const dates = await getAvailableDates(db);
    return {
      screen: 'DATE_SCREEN',
      data: { available_dates: dates.map(d => ({ id: d, title: fmtDate(d) })) },
    };
  }

  if (action === 'data_exchange') {
    if (screen === 'DATE_SCREEN') {
      const slots = await getAvailableSlots(db, data.selected_date);
      if (slots.length === 0) {
        const dates = await getAvailableDates(db);
        return {
          screen: 'DATE_SCREEN',
          data: { available_dates: dates.map(d => ({ id: d, title: fmtDate(d) })) },
        };
      }
      return {
        screen: 'TIME_SCREEN',
        data: {
          selected_date:   data.selected_date,
          available_times: slots.map(s => ({ id: s.time, title: s.time })),
        },
      };
    }

    if (screen === 'TIME_SCREEN') {
      const aids = await getMedicalAids(db);
      return {
        screen: 'DETAILS_SCREEN',
        data: {
          selected_date:  data.selected_date,
          selected_time:  data.selected_time,
          medical_aids:   [...aids.map(a => ({ id: a.name, title: a.name })), { id: 'Other', title: 'Other' }],
        },
      };
    }
  }

  return { data: { status: 'ok' } };
}

async function processFlowCompletion(phone, nfmReply) {
  const formData = JSON.parse(nfmReply.response_json);
  const {
    selected_date,
    selected_time,
    patient_name,
    payment_method,
    medical_aid_name,
    medical_aid_other,
    membership_number,
  } = formData;

  const medicalAid = payment_method === 'medical_aid'
    ? (medical_aid_name === 'Other' ? medical_aid_other : medical_aid_name)
    : null;

  console.log(`Flow booking: ${phone} → ${selected_date} ${selected_time} for ${patient_name}`);

  const slotSnap = await db.collection('time_slots')
    .where('date', '==', selected_date)
    .where('time', '==', selected_time)
    .where('status', '==', 'available')
    .limit(1).get();

  if (slotSnap.empty) {
    await sendWhatsAppMessage(phone, `Sorry, the ${selected_time} slot on ${fmtDate(selected_date)} is no longer available. Please choose another time.`);
    const dates = await getAvailableDates(db);
    if (dates.length > 0 && process.env.FLOW_ID) {
      await sendFlowMessage(phone, process.env.FLOW_ID, dates);
    }
    return;
  }

  await markSlotPending(db, slotSnap.docs[0].id, phone);
  await createAppointment(db, {
    phone,
    patient_name:      patient_name.trim(),
    date:              selected_date,
    time:              selected_time,
    payment_method,
    medical_aid:       medicalAid || null,
    membership_number: membership_number || null,
  });
  await updateConversationState(db, phone, 'complete', {});

  const dateDisplay = new Date(selected_date + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  await sendWhatsAppMessage(phone,
    `Thank you ${patient_name.trim()}! Your booking request for ${dateDisplay} at ${selected_time} is pending doctor approval. You will receive confirmation within 24 hours.`
  );
}

const processedMsgIds = new Set();

async function processWebhook(body) {
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const messages = change.value?.messages || [];

      for (const msg of messages) {
        if (msg.id) {
          if (processedMsgIds.has(msg.id)) {
            console.log(`Duplicate webhook ignored: ${msg.id}`);
            continue;
          }
          processedMsgIds.add(msg.id);
          if (processedMsgIds.size > 500) {
            processedMsgIds.delete(processedMsgIds.values().next().value);
          }
        }

        const phoneRaw = msg.from; // '27762677268' — no +
        const phone    = `+${phoneRaw}`;
        let text = '';

        if (msg.type === 'text') {
          text = (msg.text?.body || '').trim();
        } else if (msg.type === 'interactive') {
          if (msg.interactive?.type === 'nfm_reply') {
            try {
              await processFlowCompletion(phone, msg.interactive.nfm_reply);
            } catch (err) {
              console.error('Flow completion error:', err.message);
              await sendWhatsAppMessage(phone, 'An error occurred. Please try again or send "Hi" to restart.');
            }
            continue;
          } else if (msg.interactive?.type === 'button_reply') {
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

            if      (nextState === 'awaiting_flow')         nextState = await handleAwaitingFlow(db, phone);
            else if (nextState === 'initial')              nextState = await handleInitialMessage(db, phone, text);
            else if (nextState === 'menu')                 nextState = await handleMenuSelection(db, phone, text);
            else if (nextState === 'selecting_date')       nextState = await handleDateSelection(db, phone, text, collectedData);
            else if (nextState === 'selecting_time')       nextState = await handleTimeSelection(db, phone, text, collectedData);
            else if (nextState === 'payment_method')       nextState = await handlePaymentMethod(db, phone, text, collectedData);
            else if (nextState === 'medical_aid_select')   nextState = await handleMedicalAidSelection(db, phone, text, collectedData);
            else if (nextState === 'medical_aid_plan')     nextState = await handleMedicalAidPlan(db, phone, text, collectedData);
            else if (nextState === 'medical_aid_plan_custom') nextState = await handleMedicalAidPlanCustom(db, phone, text, collectedData);
            else if (nextState === 'medical_aid_custom')   nextState = await handleMedicalAidCustom(db, phone, text, collectedData);
            else if (nextState === 'membership_number')    nextState = await handleMembershipNumber(db, phone, text, collectedData);
            else if (nextState === 'patient_name')         nextState = await handlePatientName(db, phone, text, collectedData);
            else if (nextState === 'id_number')            nextState = await handleIdNumber(db, phone, text, collectedData);
            else if (nextState === 'reason_for_visit')     nextState = await handleReasonForVisit(db, phone, text, collectedData);
            else if (nextState === 'confirm_details') {
              const t = text.toLowerCase();
              if (t === 'back') {
                await sendWhatsAppMessage(phone, 'Please describe your reason for visit:\n\nType *Back* to re-enter ID number.');
                nextState = 'reason_for_visit';
              } else if (t === '1' || t.includes('confirm') || t.includes('yes') || t.includes('booking')) {
                const apt = await createAppointment(db, {
                  phone,
                  patient_name:      collectedData.patient_name,
                  date:              collectedData.selected_date,
                  time:              collectedData.selected_time,
                  payment_method:    collectedData.payment_method,
                  medical_aid:       collectedData.medical_aid || null,
                  medical_plan:      collectedData.medical_plan || null,
                  membership_number: collectedData.membership_number || null,
                  id_number:         collectedData.id_number || null,
                  reason_for_visit:  collectedData.reason_for_visit || null,
                });
                await markSlotPending(db, collectedData.selected_slot_id, phone);
                notifyN8n({
                  appointment_id:    apt.id,
                  phone,
                  patient_name:      collectedData.patient_name,
                  date:              collectedData.selected_date,
                  time:              collectedData.selected_time,
                  payment_method:    collectedData.payment_method,
                  medical_aid:       collectedData.medical_aid || null,
                  medical_plan:      collectedData.medical_plan || null,
                  membership_number: collectedData.membership_number || null,
                  id_number:         collectedData.id_number || null,
                  reason_for_visit:  collectedData.reason_for_visit || null,
                  source:            'whatsapp',
                }).catch(() => {});
                await sendWhatsAppMessage(phone,
                  `Thank you ${collectedData.patient_name}! Your booking is pending doctor approval. You will receive confirmation within 24 hours.`
                );
                nextState = 'complete';
              } else if (t === '2' || t.includes('cancel') || t.includes('no')) {
                await sendWhatsAppMessage(phone, 'Booking cancelled.');
                await sendWhatsAppButtons(phone, "What would you like to do?", ['Book Appointment', 'View Price List']);
                nextState = 'menu';
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
    notifyN8n({
      appointment_id:    apt.id,
      phone,
      patient_name,
      date,
      time,
      payment_method:    payment_method || 'cash',
      medical_aid:       medical_aid || null,
      medical_plan:      medical_plan || null,
      membership_number: membership_number || null,
      reason_for_visit:  reason || null,
      source:            'website',
    }).catch(() => {});
    return res.json({ success: true, appointmentId: apt.id });
  } catch (err) {
    console.error('book endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// n8n schedule endpoints — returns appointments for today / tomorrow
// Protected by the same doctor auth token
app.get('/appointments/today', authMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await getTodayAppointments(db) });
  } catch (err) {
    console.error('appointments/today error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/appointments/tomorrow', authMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await getTomorrowAppointments(db) });
  } catch (err) {
    console.error('appointments/tomorrow error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/', (req, res) => res.json({ ok: true, service: 'WhatsApp Booking System (Meta Cloud API)', v: 3 }));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
