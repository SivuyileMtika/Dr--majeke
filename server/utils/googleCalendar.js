const { google } = require('googleapis');

function getCalendarClient() {
  const keyEnv     = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!keyEnv) {
    console.warn('Google Calendar: GOOGLE_SERVICE_ACCOUNT_KEY not set — skipping');
    return null;
  }
  if (!calendarId) {
    console.warn('Google Calendar: GOOGLE_CALENDAR_ID not set — skipping');
    return null;
  }

  let key;
  try {
    key = JSON.parse(keyEnv);
  } catch {
    console.error('Google Calendar: GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
    return null;
  }

  console.log(`Google Calendar: using service account ${key.client_email}`);

  const auth = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );

  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

async function createAppointmentEvent(patientName, date, time) {
  const client = getCalendarClient();
  if (!client) return;

  // Build datetime in SAST (UTC+2) — parse as local then shift
  const [year, month, day]   = date.split('-').map(Number);
  const [hour, minute]       = time.split(':').map(Number);

  // Construct ISO strings explicitly in +02:00
  const pad  = (n) => String(n).padStart(2, '0');
  const startISO = `${date}T${pad(hour)}:${pad(minute)}:00+02:00`;
  const endHour  = minute >= 30 ? hour + 1 : hour;
  const endMin   = minute >= 30 ? minute - 30 : minute + 30;
  const endISO   = `${date}T${pad(endHour)}:${pad(endMin)}:00+02:00`;

  console.log(`Google Calendar: creating event "${patientName}" on ${startISO}`);

  try {
    const result = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: patientName,
        start: { dateTime: startISO, timeZone: 'Africa/Johannesburg' },
        end:   { dateTime: endISO,   timeZone: 'Africa/Johannesburg' },
      },
    });
    console.log(`Google Calendar: event created — id=${result.data.id}`);
  } catch (err) {
    console.error('Google Calendar: event creation failed —', err.message);
    if (err.response?.data) {
      console.error('Google Calendar error detail:', JSON.stringify(err.response.data));
    }
  }
}

module.exports = { createAppointmentEvent };
