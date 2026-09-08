const admin = require('firebase-admin');

// No insecure fallback: DOCTOR_AUTH_TOKEN is validated as present in
// index.js's requiredEnvVars at boot, so the app never runs without it.
const DOCTOR_TOKEN = process.env.DOCTOR_AUTH_TOKEN;

// Accepts either:
//  - the static DOCTOR_AUTH_TOKEN — for machine-to-machine callers that
//    can't do an interactive login (n8n's daily-summary/reminder workflows
//    hitting /appointments/today and /appointments/tomorrow), or
//  - a Firebase ID token for an account with the `doctor` custom claim —
//    obtained interactively via Firebase Auth sign-in on the dashboard.
//    Short-lived and never baked into a build, unlike the old
//    REACT_APP_DOCTOR_TOKEN it replaces.
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (DOCTOR_TOKEN && token === DOCTOR_TOKEN) {
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.doctor === true) {
      req.doctorUid = decoded.uid;
      return next();
    }
  } catch {
    // Invalid/expired ID token — fall through to 401 below.
  }

  return res.status(401).json({ success: false, error: 'Unauthorized' });
}

module.exports = { authMiddleware };
