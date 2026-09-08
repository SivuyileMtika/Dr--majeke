const { sendWhatsAppMessage, sendWhatsAppButtons, sendFlowMessage } = require('../utils/whatsappButtons');
const { getServices, getMedicalAids, getAvailableDates, getAvailableSlots } = require('../utils/fireStoreHelpers');

function fmtDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function isBack(text) {
  return text.toLowerCase().trim() === 'back';
}

// WhatsApp list/button replies are matched primarily against their exact
// title text; the numeric branches below exist only as a fallback for
// plain-text numbered menus. `parseInt` parses a *leading* run of digits,
// so a title like "09:00" or "1Life" (a real SA medical scheme name) would
// silently parse as 9 or 1 and get treated as a menu INDEX instead of
// failing to match — picking the wrong item entirely. Always require the
// whole trimmed string to be digits before treating it as an index.
function parseIndex(text) {
  return /^\d+$/.test(text) ? parseInt(text, 10) : NaN;
}

// South African ID numbers are 13 digits: YYMMDD + gender/citizenship
// digits + a Luhn-style check digit. Validate the embedded birthdate and
// the check digit so obviously-fake numbers get rejected.
function isValidSAID(id) {
  if (!/^\d{13}$/.test(id)) return false;

  const mm = parseInt(id.slice(2, 4), 10);
  const dd = parseInt(id.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return false;
  const yy = parseInt(id.slice(0, 2), 10);
  const daysInMonth = new Date(2000 + yy, mm, 0).getDate();
  if (dd < 1 || dd > daysInMonth) return false;

  const digits = id.split('').map(Number);
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) oddSum += digits[i];
  let evenDigits = '';
  for (let i = 1; i < 12; i += 2) evenDigits += digits[i];
  const doubled  = String(parseInt(evenDigits, 10) * 2);
  const evenSum  = doubled.split('').reduce((sum, ch) => sum + Number(ch), 0);
  const checkDigit = (10 - ((oddSum + evenSum) % 10)) % 10;

  return checkDigit === digits[12];
}

// No single global passport format — accept a plausible alphanumeric range
// (most passport numbers are 6-9 characters) rather than a strict pattern.
function isValidPassport(text) {
  return /^[A-Za-z0-9]{6,9}$/.test(text);
}

// Membership numbers are usually numeric but some schemes prefix/suffix
// letters — require at least one digit so junk like "Duvuc" gets rejected
// while still allowing alphanumeric formats.
function isValidMembershipNumber(text) {
  return /^[A-Za-z0-9-]{4,15}$/.test(text) && /\d/.test(text);
}

async function sendMainMenu(phone) {
  await sendWhatsAppButtons(phone, "Welcome to Dr. SG Majeke's practice! What would you like to do?", [
    'Book Appointment',
    'View Price List',
  ]);
}

async function sendPaymentMenu(phone) {
  await sendWhatsAppButtons(phone, 'How will you pay?', ['Medical Aid', 'Cash', 'Back']);
}

async function sendMedicalAidList(db, phone) {
  const aids = await getMedicalAids(db);
  await sendWhatsAppButtons(phone, 'Select your medical aid:', [...aids.map(a => a.name), 'Other', 'Back']);
  return aids;
}

async function handleInitialMessage(db, phone, text) {
  await sendMainMenu(phone);
  return 'menu';
}

async function handleMenuSelection(db, phone, selection) {
  const s = selection.trim();
  if (s === '1' || s.toLowerCase().includes('book')) {
    const dates = await getAvailableDates(db);
    if (dates.length === 0) {
      await sendWhatsAppMessage(phone, 'No available appointment dates at the moment. Please call us on 089 255 0069.');
      return 'menu';
    }
    const flowId = process.env.FLOW_ID;
    if (flowId) {
      try {
        await sendFlowMessage(phone, flowId, dates);
        return 'awaiting_flow';
      } catch (err) {
        console.warn('Flow send failed, falling back to step-by-step:', err.message);
      }
    }
    await sendWhatsAppButtons(phone, 'Select an appointment date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }
  if (s === '2' || s.toLowerCase().includes('price')) {
    const services = await getServices(db);
    if (services.length === 0) {
      await sendWhatsAppMessage(phone, 'No services available at the moment.');
      return 'menu';
    }
    const priceList = services.map(svc => `${svc.name} - R${svc.price}`).join('\n');
    await sendWhatsAppMessage(phone, `Our Services:\n\n${priceList}`);
    await sendWhatsAppButtons(phone, 'What would you like to do?', ['Book Appointment', 'Back']);
    return 'menu';
  }
  await sendMainMenu(phone);
  return 'menu';
}

async function handleDateSelection(db, phone, selectedDate, conversationData) {
  if (isBack(selectedDate)) {
    await sendMainMenu(phone);
    return 'menu';
  }

  const dates = await getAvailableDates(db);
  const s = selectedDate.trim();

  let dateIndex = -1;
  const num = parseIndex(s);
  // Text fallback: Back is at position dates.length + 1
  if (!isNaN(num) && num === dates.length + 1) {
    await sendMainMenu(phone);
    return 'menu';
  }
  if (!isNaN(num) && num >= 1 && num <= dates.length) {
    dateIndex = num - 1;
  } else {
    dateIndex = dates.findIndex(d => fmtDateLabel(d).toLowerCase() === s.toLowerCase());
  }

  if (dateIndex === -1) {
    if (dates.length === 0) {
      await sendWhatsAppMessage(phone, 'No available appointment dates at the moment. Please call us on 089 255 0069.');
      return 'menu';
    }
    await sendWhatsAppButtons(phone, 'Please select a date from the list:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }

  const fullDate = dates[dateIndex];
  conversationData.selected_date = fullDate;

  const slots = await getAvailableSlots(db, fullDate);
  if (slots.length === 0) {
    await sendWhatsAppMessage(phone, `No available slots on ${fmtDateLabel(fullDate)}. Please choose another date.`);
    await sendWhatsAppButtons(phone, 'Select a different date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }

  await sendWhatsAppButtons(phone, `Available times on ${fmtDateLabel(fullDate)}:`, [...slots.map(sl => sl.time), 'Back']);
  return 'selecting_time';
}

async function handleTimeSelection(db, phone, selectedTime, conversationData) {
  if (isBack(selectedTime)) {
    const dates = await getAvailableDates(db);
    if (dates.length === 0) {
      await sendWhatsAppMessage(phone, 'No available appointment dates at the moment. Please call us on 089 255 0069.');
      return 'menu';
    }
    await sendWhatsAppButtons(phone, 'Select an appointment date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }

  if (!conversationData.selected_date) {
    const dates = await getAvailableDates(db);
    await sendWhatsAppButtons(phone, 'Select an appointment date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }

  const slots = await getAvailableSlots(db, conversationData.selected_date);
  const s = selectedTime.trim();

  const num = parseIndex(s);
  // Text fallback: Back is at position slots.length + 1
  if (!isNaN(num) && num === slots.length + 1) {
    const dates = await getAvailableDates(db);
    await sendWhatsAppButtons(phone, 'Select an appointment date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }
  const slot = (!isNaN(num) && num >= 1 && num <= slots.length)
    ? slots[num - 1]
    : slots.find(sl => sl.time === s);

  if (!slot) {
    if (slots.length === 0) {
      await sendWhatsAppMessage(phone, `No available slots on ${fmtDateLabel(conversationData.selected_date)}. Please choose another date.`);
      const dates = await getAvailableDates(db);
      await sendWhatsAppButtons(phone, 'Select a different date:', [...dates.map(fmtDateLabel), 'Back']);
      return 'selecting_date';
    }
    await sendWhatsAppButtons(phone, 'That slot is no longer available. Please choose another time:', [...slots.map(sl => sl.time), 'Back']);
    return 'selecting_time';
  }

  conversationData.selected_slot_id = slot.id;
  conversationData.selected_time    = slot.time;

  await sendPaymentMenu(phone);
  return 'payment_method';
}

async function handlePaymentMethod(db, phone, method, conversationData) {
  if (isBack(method)) {
    if (conversationData.selected_date) {
      const slots = await getAvailableSlots(db, conversationData.selected_date);
      await sendWhatsAppButtons(phone, `Available times on ${fmtDateLabel(conversationData.selected_date)}:`, [...slots.map(sl => sl.time), 'Back']);
      return 'selecting_time';
    }
    const dates = await getAvailableDates(db);
    await sendWhatsAppButtons(phone, 'Select an appointment date:', [...dates.map(fmtDateLabel), 'Back']);
    return 'selecting_date';
  }

  const m         = method.trim();
  const isMedical = m === '1' || m.toLowerCase().includes('medical');
  const isCash    = m === '2' || m.toLowerCase().includes('cash');

  if (isMedical) {
    conversationData.payment_method = 'medical_aid';
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }
  if (isCash) {
    conversationData.payment_method = 'cash';
    await sendWhatsAppMessage(phone, 'Please enter your full name:\n\nType *Back* to change payment method.');
    return 'patient_name';
  }
  await sendPaymentMenu(phone);
  return 'payment_method';
}

async function handleMedicalAidSelection(db, phone, selectedAid, conversationData) {
  if (isBack(selectedAid)) {
    await sendPaymentMenu(phone);
    return 'payment_method';
  }

  const aids = await getMedicalAids(db);
  const s    = selectedAid.trim();
  const num  = parseIndex(s);

  // Text fallback order: [aid1..aidN, Other, Back] → Other=N+1, Back=N+2
  if (!isNaN(num) && num === aids.length + 2) {
    await sendPaymentMenu(phone);
    return 'payment_method';
  }
  if (!isNaN(num) && num === aids.length + 1) {
    await sendWhatsAppMessage(phone, 'Please type the name of your medical aid:\n\nType *Back* to go back.');
    return 'medical_aid_custom';
  }

  if (s.toLowerCase() === 'other') {
    await sendWhatsAppMessage(phone, 'Please type the name of your medical aid:\n\nType *Back* to go back.');
    return 'medical_aid_custom';
  }

  const aid = (!isNaN(num) && num >= 1 && num <= aids.length)
    ? aids[num - 1]
    : aids.find(a => a.name.toLowerCase() === s.toLowerCase());

  if (!aid) {
    await sendWhatsAppButtons(phone, 'Please select your medical aid from the list:', [...aids.map(a => a.name), 'Other', 'Back']);
    return 'medical_aid_select';
  }

  conversationData.medical_aid = aid.name;
  const plans = aid.plans || [];
  if (plans.length > 0) {
    await sendWhatsAppButtons(phone, `Select your ${aid.name} plan:`, [...plans, 'Other', 'Back']);
    return 'medical_aid_plan';
  }
  await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change medical aid.');
  return 'membership_number';
}

async function handleMedicalAidPlan(db, phone, text, conversationData) {
  if (isBack(text)) {
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }

  const aids = await getMedicalAids(db);
  const selectedAid = aids.find(a => a.name === conversationData.medical_aid);
  const plans = selectedAid?.plans || [];
  const s = text.trim();
  const num = parseIndex(s);

  // Numeric Back and Other from text fallback: [plan1..planN, Other, Back]
  if (!isNaN(num) && num === plans.length + 2) {
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }
  if (!isNaN(num) && num === plans.length + 1) {
    await sendWhatsAppMessage(phone, 'Please type your plan name:\n\nType *Back* to go back.');
    return 'medical_aid_plan_custom';
  }

  if (s.toLowerCase() === 'other') {
    await sendWhatsAppMessage(phone, 'Please type your plan name:\n\nType *Back* to go back.');
    return 'medical_aid_plan_custom';
  }

  const plan = (!isNaN(num) && num >= 1 && num <= plans.length)
    ? plans[num - 1]
    : plans.find(p => p.toLowerCase() === s.toLowerCase());

  if (plan) {
    conversationData.medical_plan = plan;
    await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change plan.');
    return 'membership_number';
  }

  // If text doesn't match any plan and isn't a number, accept as custom plan
  if (isNaN(num) && s.length >= 2) {
    conversationData.medical_plan = s;
    await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change plan.');
    return 'membership_number';
  }

  await sendWhatsAppButtons(phone, `Select your ${conversationData.medical_aid} plan:`, [...plans, 'Other', 'Back']);
  return 'medical_aid_plan';
}

async function handleMedicalAidPlanCustom(db, phone, text, conversationData) {
  if (isBack(text)) {
    const aids = await getMedicalAids(db);
    const selectedAid = aids.find(a => a.name === conversationData.medical_aid);
    const plans = selectedAid?.plans || [];
    await sendWhatsAppButtons(phone, `Select your ${conversationData.medical_aid} plan:`, [...plans, 'Other', 'Back']);
    return 'medical_aid_plan';
  }
  if (!text || text.trim().length < 2) {
    await sendWhatsAppMessage(phone, 'Please type your plan name:\n\nType *Back* to go back.');
    return 'medical_aid_plan_custom';
  }
  conversationData.medical_plan = text.trim();
  await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change plan.');
  return 'membership_number';
}

async function handleMedicalAidCustom(db, phone, text, conversationData) {
  if (isBack(text)) {
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }
  if (!text || text.trim().length < 2) {
    await sendWhatsAppMessage(phone, 'Please type the name of your medical aid:\n\nType *Back* to go back.');
    return 'medical_aid_custom';
  }
  conversationData.medical_aid = text.trim();
  await sendWhatsAppMessage(phone, 'Please type your plan name (or type *None* if not applicable):\n\nType *Back* to go back.');
  return 'medical_aid_plan_custom';
}

async function handleMembershipNumber(db, phone, membershipNumber, conversationData) {
  if (isBack(membershipNumber)) {
    const aids = await getMedicalAids(db);
    const selectedAid = aids.find(a => a.name === conversationData.medical_aid);
    const plans = selectedAid?.plans || [];
    if (plans.length > 0) {
      await sendWhatsAppButtons(phone, `Select your ${conversationData.medical_aid} plan:`, [...plans, 'Other', 'Back']);
      return 'medical_aid_plan';
    }
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }
  const value = (membershipNumber || '').trim();
  if (!isValidMembershipNumber(value)) {
    await sendWhatsAppMessage(phone, 'Please enter a valid membership number (numbers, or letters and numbers, 4-15 characters):\n\nType *Back* to change plan.');
    return 'membership_number';
  }
  conversationData.membership_number = value;
  await sendWhatsAppMessage(phone, 'Please enter your full name:\n\nType *Back* to re-enter membership number.');
  return 'patient_name';
}

async function handlePatientName(db, phone, name, conversationData) {
  if (isBack(name)) {
    if (conversationData.payment_method === 'medical_aid') {
      await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change plan.');
      return 'membership_number';
    }
    await sendPaymentMenu(phone);
    return 'payment_method';
  }
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    await sendWhatsAppMessage(phone, 'Please enter your full name:');
    return 'patient_name';
  }
  conversationData.patient_name = name.trim();
  await sendWhatsAppMessage(phone, 'Please enter your South African ID number, or your passport number if you don\'t have one:\n\nType *Back* to re-enter your name.');
  return 'id_number';
}

async function handleIdNumber(db, phone, text, conversationData) {
  if (isBack(text)) {
    await sendWhatsAppMessage(phone, 'Please enter your full name:\n\nType *Back* to go back.');
    return 'patient_name';
  }
  const value = (text || '').trim();

  if (/^\d+$/.test(value)) {
    // All digits — must be a full, valid 13-digit SA ID.
    if (!isValidSAID(value)) {
      await sendWhatsAppMessage(phone, 'That doesn\'t look like a valid South African ID number. Please check and re-enter it, or send your passport number instead:\n\nType *Back* to go back.');
      return 'id_number';
    }
    conversationData.id_number = value;
  } else {
    if (!isValidPassport(value)) {
      await sendWhatsAppMessage(phone, 'Please enter a valid South African ID number, or a passport number (letters/numbers, 6-9 characters):\n\nType *Back* to go back.');
      return 'id_number';
    }
    conversationData.id_number = value.toUpperCase();
  }

  await sendWhatsAppMessage(phone, 'Please describe your reason for visit:\n\nType *Back* to re-enter ID number.');
  return 'reason_for_visit';
}

async function handleReasonForVisit(db, phone, text, conversationData) {
  if (isBack(text)) {
    await sendWhatsAppMessage(phone, 'Please enter your South African ID number, or your passport number if you don\'t have one:\n\nType *Back* to re-enter your name.');
    return 'id_number';
  }
  if (!text || text.trim().length < 2) {
    await sendWhatsAppMessage(phone, 'Please describe your reason for visit:\n\nType *Back* to go back.');
    return 'reason_for_visit';
  }
  conversationData.reason_for_visit = text.trim();

  const summary =
    `Booking Summary:\n\n` +
    `📅 Date:    ${fmtDateLabel(conversationData.selected_date)}\n` +
    `🕐 Time:    ${conversationData.selected_time}\n` +
    `👤 Name:    ${conversationData.patient_name}\n` +
    `🪪 ID:      ${conversationData.id_number}\n` +
    `💬 Reason:  ${conversationData.reason_for_visit}\n` +
    `💳 Payment: ${conversationData.payment_method === 'medical_aid'
      ? `${conversationData.medical_aid}${conversationData.medical_plan ? ` — ${conversationData.medical_plan}` : ''} (#${conversationData.membership_number})`
      : 'Cash'}`;

  await sendWhatsAppMessage(phone, summary);
  await sendWhatsAppButtons(phone, 'Confirm your booking?', ['Confirm Booking', 'Cancel', 'Back']);
  return 'confirm_details';
}

async function handleAwaitingFlow(db, phone) {
  const flowId = process.env.FLOW_ID;
  if (flowId) {
    const dates = await getAvailableDates(db);
    if (dates.length > 0) {
      await sendWhatsAppMessage(phone, 'Please use the booking form below:');
      await sendFlowMessage(phone, flowId, dates);
      return 'awaiting_flow';
    }
  }
  await sendMainMenu(phone);
  return 'menu';
}

module.exports = {
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
  // Exported for unit tests (server/test/) — pure functions, safe to test
  // in isolation without a real WhatsApp/Firestore connection.
  parseIndex,
  isValidSAID,
  isValidPassport,
  isValidMembershipNumber,
};
