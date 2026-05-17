// Thin wrapper — everything goes through whatsappButtons.js so there's one Twilio client.
const { sendWhatsAppMessage } = require('./whatsappButtons');
module.exports = { sendWhatsAppMessage };
