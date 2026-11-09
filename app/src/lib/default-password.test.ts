import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_AUTH_PASSWORD_LENGTH,
  defaultMemberPassword,
  resolveAdminPassword,
} from './default-password';

test('Akitoli born 31 July → A@3107 from a sentinel hint or MM-DD', () => {
  assert.equal(defaultMemberPassword('Akitoli', { birthdayHint: '2000-07-31' }), 'A@3107');
  assert.equal(defaultMemberPassword('Akitoli', { birthdayHint: '07-31' }), 'A@3107');
});

test('Mary, 21 Sep 1982 → M@2109 and the year is ignored', () => {
  assert.equal(defaultMemberPassword('Mary', { birthDate: '1982-09-21' }), 'M@2109');
  assert.equal(defaultMemberPassword('mary', { birthDate: '2000-09-21' }), 'M@2109');
  assert.equal(
    defaultMemberPassword('Mary', { birthDate: '1982-09-21T00:00:00.000Z' }),
    'M@2109',
  );
});

test('a full birth date wins over a different hint', () => {
  assert.equal(
    defaultMemberPassword('Mary', { birthDate: '1982-09-21', birthdayHint: '2000-07-31' }),
    'M@2109',
  );
});

test('single-digit day and month are zero-padded', () => {
  assert.equal(defaultMemberPassword('Debu', { birthdayHint: '2000-01-04' }), 'D@0401');
  assert.equal(defaultMemberPassword('Hokato', { birthdayHint: '01-02' }), 'H@0201');
});

test('uses the first letter, skipping spaces and punctuation', () => {
  assert.equal(
    defaultMemberPassword('  (Deepshika) Dorothy Roy', { birthDate: '2000-03-11' }),
    'D@1103',
  );
  assert.equal(defaultMemberPassword('Nikupu / Kurpu', { birthDate: '2018-09-15' }), 'N@1509');
});

test('accepts a non-ASCII first letter and a leap-day hint', () => {
  assert.equal(defaultMemberPassword('Åsa', { birthDate: '2000-07-15' }), 'Å@1507');
  assert.equal(defaultMemberPassword('Mary', { birthdayHint: '02-29' }), 'M@2902');
  assert.equal(defaultMemberPassword('Mary', { birthdayHint: '2000-02-29' }), 'M@2902');
});

test('returns null when the name or the day and month cannot make a password', () => {
  assert.equal(defaultMemberPassword('Mary', {}), null);
  assert.equal(defaultMemberPassword('Mary', { birthDate: null, birthdayHint: null }), null);
  assert.equal(defaultMemberPassword('Mary', { birthDate: '1982' }), null);
  assert.equal(defaultMemberPassword('---', { birthDate: '1982-09-21' }), null);
  assert.equal(defaultMemberPassword('   ', { birthdayHint: '07-31' }), null);
  assert.equal(defaultMemberPassword('Mary', { birthDate: '1982-02-31' }), null);
  assert.equal(defaultMemberPassword('Mary', { birthDate: '1900-02-29' }), null);
  assert.equal(defaultMemberPassword('Mary', { birthdayHint: '13-01' }), null);
});

test('the standard password meets the auth minimum length', () => {
  const password = defaultMemberPassword('Akitoli', { birthdayHint: '2000-07-31' });
  assert.equal(password, 'A@3107');
  assert.equal(password?.length, 6);
  assert.ok(password && password.length >= MIN_AUTH_PASSWORD_LENGTH);
});

test('a typed password is kept when it is long enough', () => {
  assert.deepEqual(
    resolveAdminPassword({
      fullName: 'Mary',
      birthDate: '1982-09-21',
      customPassword: 'custom-pass',
    }),
    { password: 'custom-pass', usedDefault: false },
  );
});

test('a short typed password is rejected even when a standard one exists', () => {
  const result = resolveAdminPassword({
    fullName: 'Mary',
    birthDate: '1982-09-21',
    customPassword: 'abc',
  });
  assert.ok('error' in result);
  if ('error' in result) assert.match(result.error, /at least 6/);
});

test('a blank password falls back to the standard one', () => {
  assert.deepEqual(
    resolveAdminPassword({
      fullName: 'Akitoli',
      birthdayHint: '2000-07-31',
      customPassword: '   ',
    }),
    { password: 'A@3107', usedDefault: true },
  );
});

test('with no birthday the admin must type a password', () => {
  const result = resolveAdminPassword({ fullName: 'Mary', customPassword: '' });
  assert.ok('error' in result);
  if ('error' in result) assert.match(result.error, /birthday/i);
});
