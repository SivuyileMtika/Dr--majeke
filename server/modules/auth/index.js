'use strict';

// Auth Module — real, backend-controlled patient authentication for the
// website, replacing the mock in-memory user array that used to live in
// website/src/contexts/AuthContext.tsx (Phase 0 §2).
//
// Session is an httpOnly, Secure, SameSite=None JWT cookie — never a token
// held in page JS/localStorage, and passwords never leave this module as
// anything but a bcrypt hash. This module owns sessions; it delegates all
// patient-record reads/writes to the Identity module rather than touching
// Firestore directly, so there's exactly one place patient records get
// created or looked up.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const identity = require('../identity');

const COOKIE_NAME = 'mtika_session';
const JWT_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'none', maxAge: JWT_EXPIRY_SECONDS * 1000 };

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error('AUTH_JWT_SECRET is not set');
  return secret;
}

function signSession(patientId) {
  return jwt.sign({ patient_id: patientId }, getSecret(), { expiresIn: JWT_EXPIRY_SECONDS });
}

// Strips password_hash before a patient record ever reaches a response body.
function publicPatient(patient) {
  if (!patient) return null;
  const { password_hash, ...rest } = patient;
  return rest;
}

// Reads the session cookie (if any) and attaches req.patientId. Does NOT
// reject unauthenticated requests — mount globally, then use requireAuth()
// on routes that actually need a signed-in patient.
function sessionMiddleware(req, res, next) {
  req.patientId = null;
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      req.patientId = jwt.verify(token, getSecret()).patient_id;
    } catch {
      // invalid/expired token — treated as signed out, not an error
    }
  }
  next();
}

function requireAuth(db) {
  return async (req, res, next) => {
    if (!req.patientId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    const patient = await identity.getPatientById(db, req.patientId);
    if (!patient) return res.status(401).json({ success: false, error: 'Not authenticated' });
    req.patient = patient;
    next();
  };
}

function createAuthRouter(db) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    try {
      const { name, email, phone, password } = req.body || {};
      if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, error: 'name, email, phone and password are required' });
      }
      // Matches the website's existing client-side check (AuthModal.tsx) so
      // a password that passes client validation never fails here only to
      // surface as a misleading "Email already exists" (AuthModal maps any
      // non-success register() result to that one message).
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const patient = await identity.createPatientWithCredentials(db, { name, email, phone, passwordHash });

      res.cookie(COOKIE_NAME, signSession(patient.id), COOKIE_OPTS);
      return res.json({ success: true, patient: publicPatient(patient) });
    } catch (err) {
      if (err instanceof identity.IdentityError) {
        return res.status(409).json({ success: false, error: err.message, code: err.code });
      }
      console.error('register error:', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email and password are required' });
      }

      const patient = await identity.findPatientByEmail(db, email);
      const valid = patient?.password_hash ? await bcrypt.compare(password, patient.password_hash) : false;
      if (!valid) {
        // Same message either way — don't reveal whether the email exists.
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      res.cookie(COOKIE_NAME, signSession(patient.id), COOKIE_OPTS);
      return res.json({ success: true, patient: publicPatient(patient) });
    } catch (err) {
      console.error('login error:', err);
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
    res.json({ success: true });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json({ success: true, patient: publicPatient(req.patient) });
  });

  return router;
}

module.exports = { createAuthRouter, sessionMiddleware, requireAuth, signSession, publicPatient, COOKIE_NAME };
