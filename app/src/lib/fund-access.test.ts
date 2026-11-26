// Mission Fund write gate. Mirrors public.can_write_fund() in migration 0017.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canWriteFund, FUND_WRITE_DENIED } from './fund-access';
import { isFinanceRole, type FamilyRole } from './types';

const ROLES: FamilyRole[] = ['member', 'treasurer', 'admin'];

test('admin and treasurer may change the fund; a plain member is view-only', () => {
  assert.equal(canWriteFund('admin'), true);
  assert.equal(canWriteFund('treasurer'), true);
  assert.equal(canWriteFund('member'), false);
});

test('isFinanceRole stays aligned with canWriteFund', () => {
  for (const role of ROLES) {
    assert.equal(isFinanceRole(role), canWriteFund(role));
  }
});

test('the denial shown by server actions names both roles', () => {
  assert.match(FUND_WRITE_DENIED, /treasurer/i);
  assert.match(FUND_WRITE_DENIED, /admin/i);
  assert.equal(canWriteFund('member') ? null : FUND_WRITE_DENIED, FUND_WRITE_DENIED);
  assert.equal(canWriteFund('admin') ? null : FUND_WRITE_DENIED, null);
  assert.equal(canWriteFund('treasurer') ? null : FUND_WRITE_DENIED, null);
});

test('migration 0017 locks writes to treasurer or admin and does not rewrite fund rows', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    join(here, '../../../supabase/migrations/0017_fund_writes_treasurer_and_admin.sql'),
    'utf8',
  );
  assert.match(sql, /can_write_fund/);
  assert.match(sql, /contrib_insert_finance/);
  assert.match(sql, /contrib_update_finance/);
  assert.match(sql, /contrib_delete_finance/);
  assert.match(sql, /expense_insert_finance/);
  assert.match(sql, /expense_update_finance/);
  assert.match(sql, /expense_delete_finance/);
  // Family-wide read policies from 0004 stay in place.
  assert.doesNotMatch(sql, /drop policy[^;]*contrib_read/i);
  assert.doesNotMatch(sql, /drop policy[^;]*expense_read/i);
  // No bulk rewrite of money already recorded. Row changes inside the
  // guarded functions are `where id = p_id` transitions, not data fixes.
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(contributions|expenses)\s*;/i);
  assert.doesNotMatch(sql, /truncate\s+/i);
  assert.doesNotMatch(sql, /drop\s+table\s+public\.(contributions|expenses)/i);
});
