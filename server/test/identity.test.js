'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeFirestore } = require('./fakeFirestore');
const identity = require('../modules/identity');

test('normalizePhone handles the SA formats the WhatsApp webhook sends', () => {
  assert.equal(identity.normalizePhone('27762677268'), '+27762677268');
  assert.equal(identity.normalizePhone('0762677268'), '+27762677268');
  assert.equal(identity.normalizePhone('762677268'), '+27762677268');
  assert.equal(identity.normalizePhone('+27762677268'), '+27762677268');
  assert.equal(identity.normalizePhone(''), null);
});

test('normalizeEmail lowercases and trims, rejects non-emails', () => {
  assert.equal(identity.normalizeEmail('  Test@Example.com '), 'test@example.com');
  assert.equal(identity.normalizeEmail('not-an-email'), null);
});

test('getOrCreatePatientByPhone allocates sequential P-000001-style IDs', async () => {
  const db = createFakeFirestore();
  const a = await identity.getOrCreatePatientByPhone(db, '0762677268');
  const b = await identity.getOrCreatePatientByPhone(db, '0821234567');
  assert.equal(a.id, 'P-000001');
  assert.equal(b.id, 'P-000002');
});

test('getOrCreatePatientByPhone returns the same patient for the same phone', async () => {
  const db = createFakeFirestore();
  const first = await identity.getOrCreatePatientByPhone(db, '0762677268', { name: 'Itu' });
  const second = await identity.getOrCreatePatientByPhone(db, '27762677268'); // same number, different format
  assert.equal(first.id, second.id);
  assert.equal(second.name, 'Itu'); // untouched by the second call
});

test('findPatientByPhone / findPatientByEmail resolve via the index collections', async () => {
  const db = createFakeFirestore();
  const created = await identity.getOrCreatePatientByPhone(db, '0762677268');
  const found = await identity.findPatientByPhone(db, '+27762677268');
  assert.equal(found.id, created.id);
  assert.equal(await identity.findPatientByPhone(db, '0000000000'), null);
  assert.equal(await identity.findPatientByEmail(db, 'nobody@example.com'), null);
});

test('createPatientWithCredentials creates a brand-new patient', async () => {
  const db = createFakeFirestore();
  const patient = await identity.createPatientWithCredentials(db, {
    name: 'Sivuyile M', email: 'sivuyile@example.com', phone: '0821234567', passwordHash: 'hashed',
  });
  assert.equal(patient.id, 'P-000001');
  assert.equal(patient.source, 'website');
  const byEmail = await identity.findPatientByEmail(db, 'SIVUYILE@example.com');
  assert.equal(byEmail.id, patient.id);
});

test('createPatientWithCredentials claims an existing WhatsApp-only record for the same phone', async () => {
  const db = createFakeFirestore();
  const waPatient = await identity.getOrCreatePatientByPhone(db, '0821234567', { source: 'whatsapp' });

  const claimed = await identity.createPatientWithCredentials(db, {
    name: 'Sivuyile M', email: 'sivuyile@example.com', phone: '0821234567', passwordHash: 'hashed',
  });

  assert.equal(claimed.id, waPatient.id); // same canonical identity, not a new one
  assert.equal(claimed.source, 'merged');
  const patient = await identity.getPatientById(db, waPatient.id);
  assert.equal(patient.email, 'sivuyile@example.com');
  assert.equal(patient.password_hash, 'hashed');
});

test('createPatientWithCredentials rejects a phone that already has a password (ACCOUNT_EXISTS)', async () => {
  const db = createFakeFirestore();
  await identity.createPatientWithCredentials(db, {
    name: 'A', email: 'a@example.com', phone: '0821234567', passwordHash: 'hash1',
  });
  await assert.rejects(
    () => identity.createPatientWithCredentials(db, {
      name: 'B', email: 'b@example.com', phone: '0821234567', passwordHash: 'hash2',
    }),
    (err) => err.code === 'ACCOUNT_EXISTS'
  );
});

test('createPatientWithCredentials rejects an email already used by a different patient (EMAIL_TAKEN)', async () => {
  const db = createFakeFirestore();
  await identity.createPatientWithCredentials(db, {
    name: 'A', email: 'shared@example.com', phone: '0821111111', passwordHash: 'hash1',
  });
  await assert.rejects(
    () => identity.createPatientWithCredentials(db, {
      name: 'B', email: 'shared@example.com', phone: '0822222222', passwordHash: 'hash2',
    }),
    (err) => err.code === 'EMAIL_TAKEN'
  );
});
