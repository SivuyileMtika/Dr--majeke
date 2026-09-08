import { auth } from './firebase';

// Fetches a fresh Firebase ID token for the signed-in doctor and returns it
// as an Authorization header for calls to the server's doctor-only routes
// (e.g. /confirm-appointment). Replaces the old build-time
// REACT_APP_DOCTOR_TOKEN, which was baked as plain text into the public JS
// bundle — this token is short-lived and obtained interactively instead.
export async function getAuthHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
}
