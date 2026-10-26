import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNicknames, formatNicknames } from './nicknames';

test('parseNicknames splits on commas and trims whitespace', () => {
  assert.deepEqual(parseNicknames('Appa, Annachi ,  da '), ['Appa', 'Annachi', 'da']);
});

test('parseNicknames drops empty segments', () => {
  assert.deepEqual(parseNicknames('Mol,,,'), ['Mol']);
  assert.deepEqual(parseNicknames(' , , '), []);
  assert.deepEqual(parseNicknames(''), []);
});

test('parseNicknames deduplicates case-insensitively, keeping first spelling', () => {
  assert.deepEqual(parseNicknames('Appa, appa, APPA, Chellam'), ['Appa', 'Chellam']);
});

test('parseNicknames caps at 10 nicknames', () => {
  const many = Array.from({ length: 15 }, (_, i) => `n${i}`).join(', ');
  assert.equal(parseNicknames(many).length, 10);
});

test('parseNicknames collapses internal whitespace runs', () => {
  assert.deepEqual(parseNicknames('Chinna   Mappilai'), ['Chinna Mappilai']);
});

test('formatNicknames joins with comma-space and tolerates null/undefined', () => {
  assert.equal(formatNicknames(['Appa', 'da']), 'Appa, da');
  assert.equal(formatNicknames(null), '');
  assert.equal(formatNicknames(undefined), '');
  assert.equal(formatNicknames([]), '');
});
