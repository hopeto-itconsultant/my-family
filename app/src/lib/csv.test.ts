// Unit tests for the Phase 8 statement CSV parser — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitCsvLine, parseAmountRupees, parseStatementCsv, suggestLabel } from './csv';

test('splitCsvLine handles quoted commas and escaped quotes', () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('"say ""hi""",2'), ['say "hi"', '2']);
});

test('parseAmountRupees strips separators, keeps sign, rejects junk', () => {
  assert.equal(parseAmountRupees('1,500.00'), '1500.00');
  assert.equal(parseAmountRupees('-₹2,300'), '-2300');
  assert.equal(parseAmountRupees('+500'), '500');
  assert.equal(parseAmountRupees('abc'), null);
  assert.equal(parseAmountRupees('0'), null);
  assert.equal(parseAmountRupees('10.999'), null); // >2 decimals rejected
});

test('parses a standard amount-column export (ISO dates)', () => {
  const csv = [
    'Date,Narration,Reference,Amount',
    '2026-10-02,UPI/CREDIT/RAMESH/5041,504123456789,"2,500.00"',
    '2026-10-05,CHARGEBACK,, -100.00',
    '2026-10-09,NEFT DR SBI/SURESH,UTR987,"-1,200.00"',
  ].join('\n');
  const r = parseStatementCsv(csv);
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].amountRupees, '2500.00');
  assert.equal(r.rows[1].amountRupees, '-100.00');
  assert.equal(r.rows[2].reference, 'UTR987');
});

test('parses DD/MM/YYYY + separate Debit/Credit columns', () => {
  const csv = [
    'Txn Date,Description,Ref No.,Debit,Credit',
    '05/10/2026,ATM WITHDRAWAL,ATM1,5,000.00,', // thousands comma inside quoted field below instead
  ].join('\n');
  // The line above intentionally uses a quoted amount to exercise quoting:
  const good = [
    'Txn Date,Description,Ref No.,Debit,Credit',
    '05/10/2026,ATM WITHDRAWAL,ATM1,"5,000.00",',
    '07/10/2026,UPI CR Latha,,,3,000.00'.replace('3,000.00', '"3,000.00"'),
  ].join('\n');
  void csv;
  const r = parseStatementCsv(good);
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].date, '2026-10-05');
  assert.equal(r.rows[0].amountRupees, '-5000.00'); // debit → negative
  assert.equal(r.rows[1].amountRupees, '3000.00');  // credit → positive
});

test('skips preamble/footer junk but never guesses bad rows', () => {
  const csv = [
    'SBI ACCOUNT STATEMENT',
    'Account: xxxx1234',
    '',
    'Date,Narration,Amount',
    '2026-10-02,GOOD ROW,100.00',
    'not-a-date,BAD DATE,50.00',
    '2026-10-03,BAD AMOUNT,xy z',
    '--- end of statement ---',
  ].filter((l) => l.trim().length > 0).join('\n');
  const r = parseStatementCsv(csv);
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 3); // header-pre lines are filtered empty; bad date + bad amount + footer
});

test('missing header yields a clear fatal error', () => {
  const r = parseStatementCsv('1,2,3\n4,5,6');
  assert.ok(r.error);
  assert.match(r.error!, /header row/i);
});

test('suggestLabel includes file name and date range', () => {
  const label = suggestLabel('october_2026.csv', [
    { date: '2026-10-09', description: 'x', reference: '', amountRupees: '1' },
    { date: '2026-10-02', description: 'y', reference: '', amountRupees: '-1' },
  ]);
  assert.equal(label, 'october 2026 (2026-10-02 → 2026-10-09)');
});
