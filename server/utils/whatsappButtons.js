const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. +14155238886

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) throw new Error('Twilio credentials not set');
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

async function sendWhatsAppMessage(phone, text) {
  const client = getClient();
  const msg = await client.messages.create({
    from: `whatsapp:${FROM_NUMBER}`,
    to:   `whatsapp:${phone}`,
    body: text,
  });
  return msg;
}

// Twilio sandbox doesn't support interactive buttons —
// send a numbered-menu text instead so patients can reply "1", "2", etc.
async function sendWhatsAppButtons(phone, prompt, buttons) {
  const numbered = buttons.map((btn, i) => `${i + 1}. ${btn}`).join('\n');
  return sendWhatsAppMessage(phone, `${prompt}\n\n${numbered}\n\nReply with the number of your choice.`);
}

module.exports = { sendWhatsAppMessage, sendWhatsAppButtons };
