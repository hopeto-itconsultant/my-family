// Unit tests for the roster (spreadsheet) importer — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRoster, mapRosterCells, duplicateNames } from './roster';

test('textual birthday with year → full date + birth_year', () => {
  const r = mapRosterCells(['7 September 1984', 'Hopeto', '', '8837306849']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.birth_date, '1984-09-07');
  assert.equal(r.birth_year, 1984);
  assert.equal(r.birthday_hint, null);
});

test('birthday without year → MM-DD hint only, no invented year', () => {
  const r = mapRosterCells(['31 July', 'Akitoli', 'Akky', '878738094']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.birth_date, null);
  assert.equal(r.birth_year, null);
  assert.equal(r.birthday_hint, '07-31');
});

test('nicknames are split, trimmed and deduped', () => {
  const r = mapRosterCells(['1 July', 'Kaliho', 'Kalu, Akansha', '8014121687']);
  assert.ok(typeof r !== 'string');
  assert.deepEqual(r.nicknames, ['Kalu', 'Akansha']);
});

test('phone shorter than 10 digits is left null (not silently truncated)', () => {
  const r = mapRosterCells(['', 'Akitoli', 'Akky', '878738094']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.phone, null);
});

test('valid 10-digit phone is normalized to 91-prefixed canonical form', () => {
  const r = mapRosterCells(['4 January', 'Debu', '', '6009551002']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.phone, '916009551002');
});

test('name whitespace is collapsed', () => {
  const r = mapRosterCells(['24 March', 'Ethan ', '', '']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.full_name, 'Ethan');
});

test('slash-separated multi-name kept as-is', () => {
  const r = mapRosterCells(['15 September 2018', 'Nikupu / Kurpu', '', '']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.full_name, 'Nikupu / Kurpu');
  assert.equal(r.birth_date, '2018-09-15');
});

test('unreadable birthday is reported as an error string', () => {
  const r = mapRosterCells(['31 Zuba', 'Someone', '', '']);
  assert.equal(typeof r, 'string');
});

test('impossible calendar date rejected', () => {
  const r = mapRosterCells(['30 February 2019', 'Someone', '', '']);
  assert.equal(typeof r, 'string');
});

test('numeric DD/MM/YYYY accepted', () => {
  const r = mapRosterCells(['26/04/2015', 'Vibo', '', '']);
  assert.ok(typeof r !== 'string');
  assert.equal(r.birth_date, '2015-04-26');
});

test('full TSV sheet parses; header detected; bad line reported with number', () => {
  const sheet = [
    'Birthday\tName\tNicknames-Petnames\tContactNo',
    '31 July\tAkitoli\tAkky\t878738094',
    '4 January\tDebu\t\t6009551002',
    'nonsense date\tBad Row\t\t',
  ].join('\n');
  const res = parseRoster(sheet);
  assert.equal(res.rows.length, 2);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /^Line 4:/);
});

test('duplicate names within the sheet are surfaced', () => {
  const res = parseRoster(
    'Birthday\tName\n\tMary\n21 September 1982\tmary\n',
  );
  assert.deepEqual(duplicateNames(res.rows), ['mary']);
});
