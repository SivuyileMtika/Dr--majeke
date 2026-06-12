const axios = require('axios');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;

function apiUrl() {
  return `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;
}

// Meta expects E.164 without '+': '27762677268'
function normalizePhone(phone) {
  return String(phone).replace(/^\+/, '').replace(/\D/g, '');
}

async function callApi(payload) {
  const res = await axios.post(apiUrl(), payload, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  return res.data;
}

async function sendWhatsAppMessage(phone, text) {
  const to = normalizePhone(phone);
  console.log(`Sending text to ${to}: "${text.substring(0, 80)}"`);
  try {
    const data = await callApi({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
    console.log(`Sent OK: ${data.messages?.[0]?.id}`);
    return data;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`Send failed: ${detail}`);
    throw err;
  }
}

async function sendWhatsAppButtons(phone, prompt, buttons) {
  const to = normalizePhone(phone);
  try {
    let payload;

    if (buttons.length <= 3) {
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: prompt },
          action: {
            buttons: buttons.map((btn, i) => ({
              type: 'reply',
              reply: { id: `btn_${i}`, title: btn.substring(0, 20) },
            })),
          },
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: prompt },
          action: {
            button: 'Select',
            sections: [{
              rows: buttons.slice(0, 10).map((btn, i) => ({
                id: `item_${i}`,
                title: btn.substring(0, 24),
              })),
            }],
          },
        },
      };
    }

    const data = await callApi(payload);
    console.log(`Interactive sent OK: ${data.messages?.[0]?.id}`);
    return data;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.warn(`Interactive failed, falling back to text: ${detail}`);
    const numbered = buttons.map((btn, i) => `${i + 1}. ${btn}`).join('\n');
    return sendWhatsAppMessage(phone, `${prompt}\n\n${numbered}\n\nReply with the number of your choice.`);
  }
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

async function sendFlowMessage(phone, flowId, availableDates) {
  const to = normalizePhone(phone);
  console.log(`Sending flow to ${to}`);
  const data = await callApi({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Book Appointment' },
      body:   { text: 'Fill in your details to book an appointment with Dr. SG Majeke.' },
      footer: { text: 'Dr Majeke GP Practice' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token:  `${to}_${Date.now()}`,
          flow_id:     flowId,
          flow_cta:    'Book Now',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'DATE_SCREEN',
            data: {
              available_dates: availableDates.map(d => ({ id: d, title: fmtDate(d) })),
            },
          },
        },
      },
    },
  });
  console.log(`Flow sent OK: ${data.messages?.[0]?.id}`);
  return data;
}

module.exports = { sendWhatsAppMessage, sendWhatsAppButtons, sendFlowMessage };
