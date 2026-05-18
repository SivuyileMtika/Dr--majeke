const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

const sidCache = new Map();

function getClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) throw new Error('Twilio credentials not set');
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

async function sendWhatsAppMessage(phone, text) {
  const client = getClient();
  return client.messages.create({
    from: `whatsapp:${FROM_NUMBER}`,
    to:   `whatsapp:${phone}`,
    body: text,
  });
}

async function sendWhatsAppButtons(phone, prompt, buttons) {
  const client = getClient();
  const key    = prompt + '\x00' + buttons.join('\x00');

  try {
    let contentSid = sidCache.get(key);

    if (!contentSid) {
      const content = buttons.length <= 3
        ? await client.content.v1.contents.create({
            friendlyName: `qr_${Date.now()}`,
            types: {
              'twilio/quick-reply': {
                body:    prompt,
                actions: buttons.map((btn, i) => ({ id: `btn_${i}`, title: btn.substring(0, 20) })),
              },
            },
          })
        : await client.content.v1.contents.create({
            friendlyName: `list_${Date.now()}`,
            types: {
              'twilio/list-picker': {
                body:     prompt,
                button:   'Select',
                sections: [{
                  items: buttons.slice(0, 10).map((btn, i) => ({ id: `item_${i}`, item: btn.substring(0, 24) })),
                }],
              },
            },
          });

      contentSid = content.sid;
      sidCache.set(key, contentSid);
    }

    return client.messages.create({
      from: `whatsapp:${FROM_NUMBER}`,
      to:   `whatsapp:${phone}`,
      contentSid,
    });
  } catch (err) {
    console.warn('Content API failed, falling back to text:', err.message);
    const numbered = buttons.map((btn, i) => `${i + 1}. ${btn}`).join('\n');
    return sendWhatsAppMessage(phone, `${prompt}\n\n${numbered}\n\nReply with the number of your choice.`);
  }
}

module.exports = { sendWhatsAppMessage, sendWhatsAppButtons };
