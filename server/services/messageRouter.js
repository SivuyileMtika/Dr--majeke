const { sendWhatsAppMessage, sendWhatsAppButtons } = require('../utils/whatsappButtons');
const { getServices, getMedicalAids, getNextSevenDays, getAvailableSlots } = require('../utils/fireStoreHelpers');

async function handleInitialMessage(db, phone, text) {
  const t = text.toLowerCase().trim();
  if (t === 'hi' || t === 'hello' || t === 'start') {
    await sendWhatsAppButtons(phone, 'Welcome! What would you like to do?', [
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
    const dateButtons = dates.map(d => {
      const date = new Date(d + 'T00:00:00');
      return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    });
    await sendWhatsAppButtons(phone, 'Select a date:', dateButtons);
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
  // Accept numeric reply ("1") or partial date text
  const s = selectedDate.trim();
  let dateIndex = -1;
  const numChoice = parseInt(s, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= dates.length) {
    dateIndex = numChoice - 1;
  } else {
    dateIndex = dates.findIndex(d => {
      const label = new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
      return s.includes(label) || label.includes(s) || s.includes(d.split('-')[2]);
    });
  }

  if (dateIndex === -1) {
    await sendWhatsAppMessage(phone, 'Invalid date. Please reply with the number of your chosen date.');
    return 'selecting_date';
  }

  const fullDate = dates[dateIndex];
  conversationData.selected_date = fullDate;

  const slots = await getAvailableSlots(db, fullDate);
  if (slots.length === 0) {
    await sendWhatsAppMessage(phone, 'No available slots for this date. Please select another date.');
    return 'selecting_date';
  }

  const timeButtons = slots.map(slot => slot.time);
  await sendWhatsAppButtons(phone, `Available times on ${fullDate}:`, timeButtons);
  return 'selecting_time';
}

async function handleTimeSelection(db, phone, selectedTime, conversationData) {
  if (!conversationData.selected_date) {
    await sendWhatsAppMessage(phone, 'Please select a date first.');
    return 'selecting_date';
  }

  const slots = await getAvailableSlots(db, conversationData.selected_date);
  const s = selectedTime.trim();

  // Accept numeric reply or exact time string
  let slot;
  const numChoice = parseInt(s, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= slots.length) {
    slot = slots[numChoice - 1];
  } else {
    slot = slots.find(sl => sl.time === s);
  }

  if (!slot) {
    await sendWhatsAppMessage(phone, 'Time slot no longer available. Please reply with a number from the list.');
    return 'selecting_time';
  }

  conversationData.selected_slot_id = slot.id;
  conversationData.selected_time = slot.time;

  await sendWhatsAppButtons(phone, 'How will you pay?', ['Medical Aid', 'Cash']);
  return 'payment_method';
}

async function handlePaymentMethod(db, phone, method, conversationData) {
  const m = method.trim();
  const isMedical = m === '1' || m.toLowerCase().includes('medical');
  const isCash    = m === '2' || m.toLowerCase().includes('cash');

  if (isMedical) {
    const aids = await getMedicalAids(db);
    if (aids.length === 0) {
      await sendWhatsAppMessage(phone, 'No medical aids available. Please choose Cash payment.');
      return 'payment_method';
    }
    conversationData.payment_method = 'medical_aid';
    const aidButtons = aids.map(a => a.name);
    await sendWhatsAppButtons(phone, 'Select your medical aid:', aidButtons);
    return 'medical_aid_select';
  }
  if (isCash) {
    conversationData.payment_method = 'cash';
    await sendWhatsAppMessage(phone, 'What is your full name?');
    return 'patient_name';
  }
  return 'payment_method';
}

async function handleMedicalAidSelection(db, phone, selectedAid, conversationData) {
  const aids = await getMedicalAids(db);
  const s = selectedAid.trim();

  // Accept numeric reply or exact name
  let aid;
  const numChoice = parseInt(s, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= aids.length) {
    aid = aids[numChoice - 1];
  } else {
    aid = aids.find(a => a.name.toLowerCase() === s.toLowerCase());
  }

  if (!aid) {
    await sendWhatsAppMessage(phone, 'Invalid selection. Please reply with the number of your medical aid.');
    return 'medical_aid_select';
  }
  conversationData.medical_aid = aid.name;
  await sendWhatsAppMessage(phone, 'Enter your medical aid membership number:');
  return 'membership_number';
}

async function handleMembershipNumber(db, phone, membershipNumber, conversationData) {
  if (!membershipNumber || membershipNumber.trim().length < 3) {
    await sendWhatsAppMessage(phone, 'Invalid membership number. Please enter a valid number:');
    return 'membership_number';
  }
  conversationData.membership_number = membershipNumber.trim();
  await sendWhatsAppMessage(phone, 'What is your full name?');
  return 'patient_name';
}

async function handlePatientName(db, phone, name, conversationData) {
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    await sendWhatsAppMessage(phone, 'Please enter a valid name (2-100 characters):');
    return 'patient_name';
  }
  conversationData.patient_name = name.trim();

  const dateStr = conversationData.selected_date;
  const timeStr = conversationData.selected_time;
  const date = new Date(dateStr + 'T00:00:00');
  const dateDisplay = date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const summary = `Booking Summary:\n\nDate: ${dateDisplay}\nTime: ${timeStr}\nName: ${conversationData.patient_name}\nPayment: ${conversationData.payment_method === 'medical_aid' ? conversationData.medical_aid + ' (' + conversationData.membership_number + ')' : 'Cash'}`;

  await sendWhatsAppMessage(phone, summary);
  await sendWhatsAppButtons(phone, 'Confirm your booking?', ['Confirm', 'Cancel']);
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
