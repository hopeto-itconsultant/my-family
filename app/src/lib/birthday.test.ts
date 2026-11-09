import { test } from 'node:test';
import assert from 'node:assert/strict';

import { memberBirthdayDefaults, resolveBirthday } from './birthday';

test('day and month without a year become a sentinel hint, not a birth date', () => {
  const r = resolveBirthday('7', '31', '', 2026);
  assert.equal(r.error, undefined);
  assert.equal(r.birthDate, null);
  assert.equal(r.birthYear, null);
  assert.equal(r.birthdayHint, '2000-07-31');
});

test('day, month, and year become a real birth date', () => {
  const r = resolveBirthday('9', '7', '1984', 2026);
  assert.equal(r.birthDate, '1984-09-07');
  assert.equal(r.birthYear, 1984);
  assert.equal(r.birthdayHint, null);
});

test('year alone stays a year, with no invented day', () => {
  const r = resolveBirthday('', '', '1948', 2026);
  assert.equal(r.birthDate, null);
  assert.equal(r.birthYear, 1948);
  assert.equal(r.birthdayHint, null);
});

test('month without a day is rejected', () => {
  const r = resolveBirthday('3', '', '', 2026);
  assert.match(r.error ?? '', /both/i);
  assert.equal(r.birthdayHint, null);
});

test('29 February is allowed when the year is unknown', () => {
  const r = resolveBirthday('2', '29', '', 2026);
  assert.equal(r.error, undefined);
  assert.equal(r.birthdayHint, '2000-02-29');
});

test('29 February is rejected in a non-leap year and kept in a leap year', () => {
  assert.match(resolveBirthday('2', '29', '2023', 2026).error ?? '', /not a real date/);
  assert.equal(resolveBirthday('2', '29', '2024', 2026).birthDate, '2024-02-29');
});

test('31 April is rejected', () => {
  assert.match(resolveBirthday('4', '31', '', 2026).error ?? '', /not a real date/);
});

test('hint prefill uses day and month and ignores the sentinel year', () => {
  const d = memberBirthdayDefaults({ birthday_hint: '2000-07-31', birth_year: null, birth_date: null });
  assert.deepEqual(d, { month: 7, day: 31, year: null });
});

test('a stored full date prefills day, month, and its year', () => {
  const d = memberBirthdayDefaults({ birth_date: '1984-09-07', birth_year: 1984, birthday_hint: null });
  assert.deepEqual(d, { month: 9, day: 7, year: 1984 });
});
