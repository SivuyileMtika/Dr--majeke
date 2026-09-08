'use strict';

// Integration-style tests: boot a real Express app (cookie-parser + the
// actual auth router, backed by fakeFirestore) on an ephemeral port and
// exercise it with the platform's built-in fetch — no supertest needed.
//
// NOTE: requires express/cookie-parser/bcryptjs/jsonwebtoken installed
// (server/node_modules). Could not be run in this environment at the time
// this file was written (local disk was full, blocking npm install — see
// the commit message); verified instead via live curl smoke tests against
// the Railway deployment. Run `npm test` locally once dependencies are
// installed to confirm.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { createFakeFirestore } = require('./fakeFirestore');
const { createAuthRouter, sessionMiddleware, requireAuth } = require('../modules/auth');

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-secret-not-for-production';

let baseUrl;
let server;
let db;

before(async () => {
  db = createFakeFirestore();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use('/api/v1/auth', createAuthRouter(db));
  app.get('/api/v1/protected', requireAuth(db), (req, res) => res.json({ success: true, patient_id: req.patient.id }));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

// Minimal cookie-jar helper: fetch doesn't persist cookies across calls by
// default, so extract Set-Cookie and pass it back explicitly.
function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

test('register creates a patient, sets a session cookie, and rejects a short password', async () => {
  const tooShort = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email: 'short@example.com', phone: '0821234567', password: 'short' }),
  });
  assert.equal(tooShort.status, 400);

  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sivuyile', email: 'sivuyile@example.com', phone: '0821234567', password: 'a-real-password' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.patient.id, 'P-000001');
  assert.equal(body.patient.password_hash, undefined); // never leaked
  assert.ok(extractCookie(res)?.startsWith('mtika_session='));
});

test('registering the same email twice fails with EMAIL_TAKEN', async () => {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other', email: 'sivuyile@example.com', phone: '0839999999', password: 'a-real-password' }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, 'EMAIL_TAKEN');
});

test('login rejects a wrong password without revealing whether the account exists', async () => {
  const wrongPassword = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sivuyile@example.com', password: 'wrong-password' }),
  });
  const unknownEmail = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever12345' }),
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  const [wrongBody, unknownBody] = await Promise.all([wrongPassword.json(), unknownEmail.json()]);
  assert.deepEqual(wrongBody, unknownBody); // identical response either way
});

test('login with the right password sets a session that /me and a protected route accept', async () => {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sivuyile@example.com', password: 'a-real-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = extractCookie(login);
  assert.ok(cookie);

  const me = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.patient.email, 'sivuyile@example.com');

  const protectedRes = await fetch(`${baseUrl}/api/v1/protected`, { headers: { Cookie: cookie } });
  assert.equal(protectedRes.status, 200);
});

test('protected routes reject requests with no session and logout clears it', async () => {
  const noAuth = await fetch(`${baseUrl}/api/v1/auth/me`);
  assert.equal(noAuth.status, 401);

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sivuyile@example.com', password: 'a-real-password' }),
  });
  const cookie = extractCookie(login);

  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  const clearedCookie = extractCookie(logout);
  assert.ok(clearedCookie); // Set-Cookie present clearing/expiring the session

  // A brand new request with the *old* pre-logout cookie value still
  // verifies fine server-side (JWTs aren't server-tracked / revoked on
  // logout — logout only clears the client's cookie). This is a known,
  // deliberate limitation for Phase 0: acceptable since sessions expire
  // after 30 days and there's no sensitive server-side session state to
  // revoke yet; documented in server/ARCHITECTURE.md.
  const stillValidUntilExpiry = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(stillValidUntilExpiry.status, 200);
});
