function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const e164Regex = /^\+?1?\d{9,15}$/;
  return e164Regex.test(phone.replace(/\D/g, ''));
}

function validateText(text, maxLength = 4096) {
  if (!text || typeof text !== 'string') return false;
  return text.length > 0 && text.length <= maxLength;
}

function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  return name.length > 0 && name.length <= 100;
}

function formatPhoneE164(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned.match(/^\d{9,15}$/)) return null;
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

module.exports = { validatePhone, validateText, validateName, formatPhoneE164 };
