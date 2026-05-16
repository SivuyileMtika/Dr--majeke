const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

async function sendWhatsAppMessage(phone, text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) throw new Error('WhatsApp config not set');

  const url = `https://graph.facebook.com/v15.0/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    text: { body: text },
  };

  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  if (res.data.error) throw new Error(`WhatsApp API error: ${JSON.stringify(res.data.error)}`);
  return res.data;
}

async function sendWhatsAppButtons(phone, text, buttons) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) throw new Error('WhatsApp config not set');

  const url = `https://graph.facebook.com/v15.0/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map((btn, idx) => ({
          type: 'reply',
          reply: { id: `btn_${idx}`, title: btn },
        })),
      },
    },
  };

  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 10_000,
  });

  if (res.data.error) throw new Error(`WhatsApp API error: ${JSON.stringify(res.data.error)}`);
  return res.data;
}

module.exports = { sendWhatsAppMessage, sendWhatsAppButtons };
