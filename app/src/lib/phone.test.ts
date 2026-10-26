import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone, tenDigits, formatPhoneDisplay, isValidPhoneInput } from './phone';

test('normalizePhone handles common Indian formats', () => {
  assert.equal(normalizePhone('9876543210'), '919876543210');
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizePhone('0 9876543210'), '919876543210');
  assert.equal(normalizePhone('919876543210'), '919876543210');
});

test('normalizePhone rejects short numbers', () => {
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(tenDigits('abc'), null);
});

test('formatPhoneDisplay groups digits', () => {
  assert.equal(formatPhoneDisplay('919876543210'), '+91 98765 43210');
  assert.equal(formatPhoneDisplay(null), '');
});

test('isValidPhoneInput accepts only 10-digit-capable input', () => {
  assert.equal(isValidPhoneInput('98765 43210'), true);
  assert.equal(isValidPhoneInput('98765'), false);
});
