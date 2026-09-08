'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFakeFirestore } = require('./fakeFirestore');

test('set/get round-trips a document', async () => {
  const db = createFakeFirestore();
  await db.collection('patients').doc('P-000001').set({ name: 'Test Patient' });
  const snap = await db.collection('patients').doc('P-000001').get();
  assert.equal(snap.exists, true);
  assert.equal(snap.data().name, 'Test Patient');
});

test('get on a missing document reports not-exists', async () => {
  const db = createFakeFirestore();
  const snap = await db.collection('patients').doc('nope').get();
  assert.equal(snap.exists, false);
});

test('add() auto-generates an id', async () => {
  const db = createFakeFirestore();
  const ref = await db.collection('appointments').add({ date: '2026-09-08' });
  assert.ok(ref.id);
  const snap = await ref.get();
  assert.equal(snap.data().date, '2026-09-08');
});

test('where + orderBy + limit filters and sorts as expected', async () => {
  const db = createFakeFirestore();
  await db.collection('time_slots').add({ date: '2026-09-08', time: '09:00', status: 'available' });
  await db.collection('time_slots').add({ date: '2026-09-08', time: '08:00', status: 'available' });
  await db.collection('time_slots').add({ date: '2026-09-08', time: '10:00', status: 'booked' });
  await db.collection('time_slots').add({ date: '2026-09-09', time: '08:00', status: 'available' });

  const snap = await db.collection('time_slots')
    .where('date', '==', '2026-09-08')
    .where('status', '==', 'available')
    .orderBy('time', 'asc')
    .get();

  assert.equal(snap.size, 2);
  assert.deepEqual(snap.docs.map(d => d.data().time), ['08:00', '09:00']);
});

test('update() merges fields and throws on a missing document', async () => {
  const db = createFakeFirestore();
  await db.collection('patients').doc('P-000001').set({ name: 'A', status: 'active' });
  await db.collection('patients').doc('P-000001').update({ status: 'inactive' });
  const snap = await db.collection('patients').doc('P-000001').get();
  assert.deepEqual(snap.data(), { name: 'A', status: 'inactive' });

  await assert.rejects(() => db.collection('patients').doc('missing').update({ x: 1 }));
});

test('runTransaction can read-then-write within one callback', async () => {
  const db = createFakeFirestore();
  const counterRef = db.collection('counters').doc('patients');
  await counterRef.set({ seq: 5 });

  const next = await db.runTransaction(async (txn) => {
    const snap = await txn.get(counterRef);
    const seq = snap.data().seq + 1;
    txn.update(counterRef, { seq });
    return seq;
  });

  assert.equal(next, 6);
  const snap = await counterRef.get();
  assert.equal(snap.data().seq, 6);
});
