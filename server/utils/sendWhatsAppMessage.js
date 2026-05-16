const axios = require('axios');
const { validatePhone, validateText, formatPhoneE164 } = require('./validators');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

async function sendWhatsAppMessage(phone, text, retries = 2) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) throw new Error('WhatsApp config not set');
  if (!validatePhone(phone)) throw new Error('Invalid phone number format');
  if (!validateText(text)) throw new Error('Invalid text (empty or too long)');

  const formattedPhone = formatPhoneE164(phone);
  if (!formattedPhone) throw new Error('Could not format phone number');

  const url = `https://graph.facebook.com/v15.0/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    text: { body: text },
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      });

      if (res.data.error) {
        throw new Error(`WhatsApp API error: ${JSON.stringify(res.data.error)}`);
      }
      return res.data;
    } catch (err) {
      lastError = err;
      if (attempt < retries && err.response?.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

module.exports = { sendWhatsAppMessage };
