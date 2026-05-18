const { sendWhatsAppMessage, sendWhatsAppButtons } = require('../utils/whatsappButtons');
const { getServices, getMedicalAids, getNextSevenDays, getAvailableSlots } = require('../utils/fireStoreHelpers');

// "2026-05-19" → "Mon, 19 May"
function fmtDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

async function handleInitialMessage(db, phone, text) {
  const t = text.toLowerCase().trim();
  if (t === 'hi' || t === 'hello' || t === 'start') {
    await sendWhatsAppButtons(phone, 'Welcome to Dr. Majeke Clinic! What would you like to do?', [
      'Book Appointment',
      'View Price List',
    ]);
    return 'menu';
  }
  return 'initial';
}

async function handleMenuSelection(db, phone, selection) {
  const s = selection.trim();
  if (s === '1' || s.toLowerCase().includes('book')) {
    const dates = await getNextSevenDays();
    await sendWhatsAppButtons(phone, 'Select an appointment date:', dates.map(fmtDateLabel));
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
  return 'menu';
}

async function handleDateSelection(db, phone, selectedDate, conversationData) {
  const dates = await getNextSevenDays();
  const s     = selectedDate.trim();

  let dateIndex = -1;
  const num = parseInt(s, 10);
  if (!isNaN(num) && num >= 1 && num <= dates.length) {
    dateIndex = num - 1;
  } else {
    dateIndex = dates.findIndex(d => fmtDateLabel(d).toLowerCase() === s.toLowerCase());
  }

  if (dateIndex === -1) {
    await sendWhatsAppButtons(phone, 'Please select a date from the list:', dates.map(fmtDateLabel));
    return 'selecting_date';
  }

  const fullDate = dates[dateIndex];
  conversationData.selected_date = fullDate;

  const slots = await getAvailableSlots(db, fullDate);
  if (slots.length === 0) {
    await sendWhatsAppMessage(phone, `No available slots on ${fmtDateLabel(fullDate)}. Please choose another date.`);
    await sendWhatsAppButtons(phone, 'Select a different date:', dates.map(fmtDateLabel));
    return 'selecting_date';
  }

  await sendWhatsAppButtons(phone, `Available times on ${fmtDateLabel(fullDate)}:`, slots.map(sl => sl.time));
  return 'selecting_time';
}

async function handleTimeSelection(db, phone, selectedTime, conversationData) {
  if (!conversationData.selected_date) {
    await sendWhatsAppMessage(phone, 'Please select a date first.');
    return 'selecting_date';
  }

  const slots = await getAvailableSlots(db, conversationData.selected_date);
  const s     = selectedTime.trim();

  const num = parseInt(s, 10);
  const slot = (!isNaN(num) && num >= 1 && num <= slots.length)
    ? slots[num - 1]
    : slots.find(sl => sl.time === s);

  if (!slot) {
    await sendWhatsAppButtons(phone, 'That slot is no longer available. Please choose another time:', slots.map(sl => sl.time));
    return 'selecting_time';
  }

  conversationData.selected_slot_id = slot.id;
  conversationData.selected_time    = slot.time;

  await sendWhatsAppButtons(phone, 'How will you pay?', ['Medical Aid', 'Cash']);
  return 'payment_method';
}

async function handlePaymentMethod(db, phone, method, conversationData) {
  const m         = method.trim();
  const isMedical = m === '1' || m.toLowerCase().includes('medical');
  const isCash    = m === '2' || m.toLowerCase().includes('cash');

  if (isMedical) {
    const aids = await getMedicalAids(db);
    if (aids.length === 0) {
      await sendWhatsAppMessage(phone, 'No medical aids available. Please choose Cash.');
      return 'payment_method';
    }
    conversationData.payment_method = 'medical_aid';
    await sendWhatsAppButtons(phone, 'Select your medical aid:', aids.map(a => a.name));
    return 'medical_aid_select';
  }
  if (isCash) {
    conversationData.payment_method = 'cash';
    await sendWhatsAppMessage(phone, 'Please enter your full name:');
    return 'patient_name';
  }
  await sendWhatsAppButtons(phone, 'How will you pay?', ['Medical Aid', 'Cash']);
  return 'payment_method';
}

async function handleMedicalAidSelection(db, phone, selectedAid, conversationData) {
  const aids = await getMedicalAids(db);
  const s    = selectedAid.trim();

  const num = parseInt(s, 10);
  const aid = (!isNaN(num) && num >= 1 && num <= aids.length)
    ? aids[num - 1]
    : aids.find(a => a.name.toLowerCase() === s.toLowerCase());

  if (!aid) {
    await sendWhatsAppButtons(phone, 'Please select your medical aid from the list:', aids.map(a => a.name));
    return 'medical_aid_select';
  }
  conversationData.medical_aid = aid.name;
  await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:');
  return 'membership_number';
}

async function handleMembershipNumber(db, phone, membershipNumber, conversationData) {
  if (!membershipNumber || membershipNumber.trim().length < 3) {
    await sendWhatsAppMessage(phone, 'Please enter a valid membership number:');
    return 'membership_number';
  }
  conversationData.membership_number = membershipNumber.trim();
  await sendWhatsAppMessage(phone, 'Please enter your full name:');
  return 'patient_name';
}

async function handlePatientName(db, phone, name, conversationData) {
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    await sendWhatsAppMessage(phone, 'Please enter your full name:');
    return 'patient_name';
  }
  conversationData.patient_name = name.trim();

  const summary =
    `Booking Summary:\n\n` +
    `Date:    ${fmtDateLabel(conversationData.selected_date)}\n` +
    `Time:    ${conversationData.selected_time}\n` +
    `Name:    ${conversationData.patient_name}\n` +
    `Payment: ${conversationData.payment_method === 'medical_aid'
      ? `${conversationData.medical_aid} (#${conversationData.membership_number})`
      : 'Cash'}`;

  await sendWhatsAppMessage(phone, summary);
  await sendWhatsAppButtons(phone, 'Confirm your booking?', ['Confirm Booking', 'Cancel']);
  return 'confirm_details';
}

module.exports = {
  handleInitialMessage,
  handleMenuSelection,
  handleDateSelection,
  handleTimeSelection,
  handlePaymentMethod,
  handleMedicalAidSelection,
  handleMembershipNumber,
  handlePatientName,
};
