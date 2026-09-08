'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseIndex,
  isValidSAID,
  isValidPassport,
  isValidMembershipNumber,
} = require('../services/messageRouter');

test('parseIndex only treats whole-string digits as an index', () => {
  // The bug this guards against: parseInt("09:00", 10) === 9, which used to
  // get treated as menu index 9 instead of failing to match — see the
  // "wrong time booked" fix earlier in this repo's history.
  assert.equal(Number.isNaN(parseIndex('09:00')), true);
  assert.equal(Number.isNaN(parseIndex('10:30')), true);
  assert.equal(Number.isNaN(parseIndex('1Life')), true); // a real SA medical scheme name
  assert.equal(parseIndex('7'), 7);
  assert.equal(parseIndex('12'), 12);
});

test('isValidSAID accepts a known-valid test ID and validates the check digit', () => {
  assert.equal(isValidSAID('8001015009087'), true);
  assert.equal(isValidSAID('8001015009088'), false); // wrong check digit
});

test('isValidSAID rejects malformed input', () => {
  assert.equal(isValidSAID('379586'), false);       // too short
  assert.equal(isValidSAID('8013015009087'), false); // month 13 doesn't exist
  assert.equal(isValidSAID('Fvhth'), false);         // not numeric
});

test('isValidPassport accepts a plausible alphanumeric passport number', () => {
  assert.equal(isValidPassport('A1234567'), true);
  assert.equal(isValidPassport('Fvhth'), false); // too short
});

test('isValidMembershipNumber requires at least one digit', () => {
  assert.equal(isValidMembershipNumber('Duvuc'), false); // no digit at all
  assert.equal(isValidMembershipNumber('379586'), true);
  assert.equal(isValidMembershipNumber('DS12345'), true);
  assert.equal(isValidMembershipNumber('ab'), false); // too short
});
