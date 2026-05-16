const { sendWhatsAppMessage, sendWhatsAppButtons } = require('../utils/whatsappButtons');
const { getServices, getMedicalAids, getNextSevenDays, getAvailableSlots } = require('../utils/fireStoreHelpers');

async function handleInitialMessage(db, phone, text) {
  if (text.toLowerCase().trim() === 'hi' || text.toLowerCase().trim() === 'hello') {
    await sendWhatsAppButtons(phone, 'Welcome! What would you like to do?', [
      '📋 Book Appointment',
      '💰 View Price List',
    ]);
    return 'menu';
  }
  return 'initial';
}

async function handleMenuSelection(db, phone, selection) {
  if (selection.includes('Book')) {
    const dates = await getNextSevenDays();
    const dateButtons = dates.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    });
    await sendWhatsAppButtons(phone, 'Select a date:', dateButtons);
    return 'selecting_date';
  }
  if (selection.includes('Price')) {
    const services = await getServices(db);
    if (services.length === 0) {
      await sendWhatsAppMessage(phone, 'No services available at the moment.');
      return 'menu';
    }
    const priceList = services.map(s => `${s.name} - R${s.price}`).join('\n');
    await sendWhatsAppMessage(phone, `Our Services:\n\n${priceList}`);
    await sendWhatsAppButtons(phone, 'What would you like to do?', ['📋 Book Appointment', '← Back']);
    return 'menu';
  }
  return 'menu';
}

async function handleDateSelection(db, phone, selectedDate, conversationData) {
  const dates = await getNextSevenDays();
  const dateIndex = dates.findIndex(d => selectedDate.includes(d.split('-')[2]));
  if (dateIndex === -1) {
    await sendWhatsAppMessage(phone, 'Invalid date selected. Please try again.');
    return null;
  }
  const fullDate = dates[dateIndex];
  conversationData.selected_date = fullDate;

  const slots = await getAvailableSlots(db, fullDate);
  if (slots.length === 0) {
    await sendWhatsAppMessage(phone, 'No available slots for this date. Please select another date.');
    return 'selecting_date';
  }

  const timeButtons = slots.map(s => s.time);
  await sendWhatsAppButtons(phone, `Available times on ${fullDate}:`, timeButtons);
  return 'selecting_time';
}

async function handleTimeSelection(db, phone, selectedTime, conversationData) {
  if (!conversationData.selected_date) {
    await sendWhatsAppMessage(phone, 'Please select a date first.');
    return 'selecting_date';
  }

  const slots = await getAvailableSlots(db, conversationData.selected_date);
  const slot = slots.find(s => s.time === selectedTime);
  if (!slot) {
    await sendWhatsAppMessage(phone, 'Time slot no longer available. Please select another time.');
    return 'selecting_time';
  }

  conversationData.selected_slot_id = slot.id;
  conversationData.selected_time = selectedTime;

  await sendWhatsAppButtons(phone, 'How will you pay?', ['💳 Medical Aid', '💵 Cash']);
  return 'payment_method';
}

async function handlePaymentMethod(db, phone, method, conversationData) {
  if (method.includes('Medical')) {
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
  if (method.includes('Cash')) {
    conversationData.payment_method = 'cash';
    await sendWhatsAppMessage(phone, 'What is your full name?');
    return 'patient_name';
  }
  return 'payment_method';
}

async function handleMedicalAidSelection(db, phone, selectedAid, conversationData) {
  const aids = await getMedicalAids(db);
  const aid = aids.find(a => a.name === selectedAid);
  if (!aid) {
    await sendWhatsAppMessage(phone, 'Invalid medical aid. Please select again.');
    return 'medical_aid_select';
  }
  conversationData.medical_aid = selectedAid;
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
  const date = new Date(dateStr);
  const dateDisplay = date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const summary = `Booking Summary:
📅 ${dateDisplay}
⏰ ${timeStr}
👤 ${conversationData.patient_name}
💳 ${conversationData.payment_method === 'medical_aid' ? conversationData.medical_aid + ' (' + conversationData.membership_number + ')' : 'Cash'}`;

  await sendWhatsAppMessage(phone, summary);
  await sendWhatsAppButtons(phone, 'Confirm your booking?', ['✅ Confirm', '❌ Cancel']);
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
