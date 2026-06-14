const { google } = require('googleapis');

function getCalendarClient() {
  const keyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!keyEnv || !calendarId) return null;

  let key;
  try {
    key = JSON.parse(keyEnv);
  } catch {
    console.error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
    return null;
  }

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

  // date = "2026-06-15", time = "09:00"
  const start = new Date(`${date}T${time}:00`);
  const end   = new Date(start.getTime() + 30 * 60 * 1000); // 30-min slot

  const fmt = (d) => d.toISOString().replace('Z', '+02:00').slice(0, 19) + '+02:00';

  try {
    await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: patientName,
        start: { dateTime: fmt(start), timeZone: 'Africa/Johannesburg' },
        end:   { dateTime: fmt(end),   timeZone: 'Africa/Johannesburg' },
      },
    });
    console.log(`Google Calendar event created: ${patientName} on ${date} at ${time}`);
  } catch (err) {
    console.error('Google Calendar event creation failed:', err.message);
  }
}

module.exports = { createAppointmentEvent };
