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
    // Step-by-step fallback
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
  const num = parseInt(s, 10);
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

  const num = parseInt(s, 10);
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

  if (s.toLowerCase() === 'other') {
    await sendWhatsAppMessage(phone, 'Please type the name of your medical aid:\n\nType *Back* to go back.');
    return 'medical_aid_custom';
  }

  const num = parseInt(s, 10);
  const aid = (!isNaN(num) && num >= 1 && num <= aids.length)
    ? aids[num - 1]
    : aids.find(a => a.name.toLowerCase() === s.toLowerCase());

  if (!aid) {
    await sendWhatsAppButtons(phone, 'Please select your medical aid from the list:', [...aids.map(a => a.name), 'Other', 'Back']);
    return 'medical_aid_select';
  }
  conversationData.medical_aid = aid.name;
  await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change medical aid.');
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
  await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change medical aid.');
  return 'membership_number';
}

async function handleMembershipNumber(db, phone, membershipNumber, conversationData) {
  if (isBack(membershipNumber)) {
    await sendMedicalAidList(db, phone);
    return 'medical_aid_select';
  }
  if (!membershipNumber || membershipNumber.trim().length < 3) {
    await sendWhatsAppMessage(phone, 'Please enter a valid membership number:\n\nType *Back* to change medical aid.');
    return 'membership_number';
  }
  conversationData.membership_number = membershipNumber.trim();
  await sendWhatsAppMessage(phone, 'Please enter your full name:\n\nType *Back* to re-enter membership number.');
  return 'patient_name';
}

async function handlePatientName(db, phone, name, conversationData) {
  if (isBack(name)) {
    if (conversationData.payment_method === 'medical_aid') {
      await sendWhatsAppMessage(phone, 'Please enter your medical aid membership number:\n\nType *Back* to change medical aid.');
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

  const summary =
    `Booking Summary:\n\n` +
    `Date:    ${fmtDateLabel(conversationData.selected_date)}\n` +
    `Time:    ${conversationData.selected_time}\n` +
    `Name:    ${conversationData.patient_name}\n` +
    `Payment: ${conversationData.payment_method === 'medical_aid'
      ? `${conversationData.medical_aid} (#${conversationData.membership_number})`
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
  handleMedicalAidCustom,
  handleMembershipNumber,
  handlePatientName,
  handleAwaitingFlow,
};
