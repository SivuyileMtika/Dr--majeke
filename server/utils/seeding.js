const admin = require('firebase-admin');

const DEFAULT_MEDICAL_AIDS = [
  { name: 'Discovery Health', code: 'DISCOVERY', contact: '+27124001000', plans: ['KeyCare Core', 'KeyCare Plus', 'Essential', 'Classic', 'Comprehensive', 'Executive'] },
  { name: 'Medshield', code: 'MEDSHIELD', contact: '+27105222222', plans: ['MediValue', 'MediBonus', 'MediCore', 'MediElite'] },
  { name: 'Bonitas', code: 'BONITAS', contact: '+27119020000', plans: ['BonEssential', 'BonCap', 'Primary', 'Standard', 'Select'] },
  { name: 'MOMENTUM Health', code: 'MOMENTUM', contact: '+27829800800', plans: ['Ingwe', 'Evolve', 'Myriad', 'Summit', 'Custom'] },
  { name: 'Fedhealth', code: 'FEDHEALTH', contact: '+27110240000', plans: ['Flexifed 1', 'Flexifed 2', 'Maxima Entrant', 'Maxima Traditional', 'Maxima Exec'] },
  { name: 'Ampath Health', code: 'AMPATH', contact: '+27315017000', plans: ['Standard', 'Plus', 'Comprehensive'] },
  { name: 'Sizwe Medical Fund', code: 'SIZWE', contact: '+27119880000', plans: ['Navigator', 'Khula', 'Physio Plus', 'Hospital Plan'] },
  { name: 'GEMS', code: 'GEMS', contact: '+27861666846', plans: ['Emerald', 'Ruby', 'Diamond', 'Sapphire'] },
];

const DEFAULT_SERVICES = [
  { name: 'General Consultation', price: 250, duration_minutes: 30, description: 'Initial consultation with doctor' },
  { name: 'Follow-up Appointment', price: 150, duration_minutes: 30, description: 'Follow-up visit' },
  { name: 'Surgery Consultation', price: 500, duration_minutes: 45, description: 'Pre-surgery consultation' },
];

async function seedMedicalAids(db) {
  for (const aid of DEFAULT_MEDICAL_AIDS) {
    const snap = await db.collection('medical_aids').where('code', '==', aid.code).get();
    if (snap.empty) {
      await db.collection('medical_aids').add(aid);
      console.log(`Added medical aid: ${aid.name}`);
    } else if (!snap.docs[0].data().plans) {
      await snap.docs[0].ref.update({ plans: aid.plans });
      console.log(`Updated plans for: ${aid.name}`);
    }
  }
}

async function seedServices(db) {
  for (const service of DEFAULT_SERVICES) {
    const snap = await db.collection('services').where('name', '==', service.name).get();
    if (snap.empty) {
      await db.collection('services').add(service);
      console.log(`Added service: ${service.name}`);
    }
  }
}

async function seedTimeSlots(db, days = 7, startHour = 9, endHour = 17, intervalMinutes = 30) {
  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    const snap = await db.collection('time_slots').where('date', '==', dateStr).get();
    if (!snap.empty) {
      console.log(`Slots already exist for ${dateStr}, skipping...`);
      continue;
    }

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += intervalMinutes) {
        const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        await db.collection('time_slots').add({
          date: dateStr,
          time,
          duration_minutes: intervalMinutes,
          status: 'available',
          booked_by_phone: null,
          booked_at: null,
        });
      }
    }
    console.log(`Created ${Math.ceil((endHour - startHour) * 60 / intervalMinutes)} slots for ${dateStr}`);
  }
}

module.exports = { seedMedicalAids, seedServices, seedTimeSlots };
