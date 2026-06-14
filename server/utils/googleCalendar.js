const { google } = require('googleapis');

async function createAppointmentEvent(patientName, date, time) {
  const keyEnv     = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!keyEnv) {
    console.warn('Google Calendar: GOOGLE_SERVICE_ACCOUNT_KEY not set — skipping');
    return;
  }
  if (!calendarId) {
    console.warn('Google Calendar: GOOGLE_CALENDAR_ID not set — skipping');
    return;
  }

  let credentials;
  try {
    credentials = JSON.parse(keyEnv);
    // Railway can double-escape newlines — fix them so the key signs correctly
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    console.error('Google Calendar: GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
    return;
  }

  console.log(`Google Calendar: authenticating as ${credentials.client_email}`);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const authClient = await auth.getClient();
    const calendar   = google.calendar({ version: 'v3', auth: authClient });

    // Build SAST (+02:00) datetimes without relying on server timezone
    const pad      = (n) => String(n).padStart(2, '0');
    const [h, m]   = time.split(':').map(Number);
    const endH     = m >= 30 ? h + 1 : h;
    const endM     = m >= 30 ? m - 30 : m + 30;
    const startISO = `${date}T${pad(h)}:${pad(m)}:00+02:00`;
    const endISO   = `${date}T${pad(endH)}:${pad(endM)}:00+02:00`;

    console.log(`Google Calendar: inserting "${patientName}" ${startISO} → ${endISO} into ${calendarId}`);

    const result = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: patientName,
        start: { dateTime: startISO, timeZone: 'Africa/Johannesburg' },
        end:   { dateTime: endISO,   timeZone: 'Africa/Johannesburg' },
      },
    });

    console.log(`Google Calendar: event created — id=${result.data.id} link=${result.data.htmlLink}`);
  } catch (err) {
    console.error('Google Calendar: event creation failed —', err.message);
    if (err.response?.data) {
      console.error('Google Calendar error detail:', JSON.stringify(err.response.data));
    }
  }
}

module.exports = { createAppointmentEvent };
