// View-as preview rules. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VIEW_AS_NO_LOGIN,
  VIEW_AS_NOT_ADMIN,
  VIEW_AS_READ_ONLY,
  VIEW_AS_TTL_MS,
  decideViewAsStart,
  decodeJwtPayload,
  previewBlocksMutation,
  previewDeadline,
  previewIsCurrent,
  tokenIsReadOnlyPreview,
  viewAsWriteBlocked,
} from './view-as-policy';
import { openPreview, sealPreview } from './view-as-cookie';

const here = dirname(fileURLToPath(import.meta.url));
const admin = { actorRole: 'admin', actorId: 'admin-id', subjectId: 'member-id', subjectHasLogin: true, previewActive: false };

test('only an admin can start a preview', () => {
  assert.equal(decideViewAsStart(admin), null);
  for (const actorRole of ['member', 'treasurer', 'coordinator', '', null, undefined]) {
    const error = decideViewAsStart({ ...admin, actorRole });
    assert.equal(error, VIEW_AS_NOT_ADMIN);
  }
  assert.match(decideViewAsStart({ ...admin, actorId: null }) ?? '', /sign in/i);
});

test('directory-only members and self-preview are refused', () => {
  assert.equal(decideViewAsStart({ ...admin, subjectHasLogin: false }), VIEW_AS_NO_LOGIN);
  assert.equal(decideViewAsStart({ ...admin, subjectId: admin.actorId }), 'That is already your own account.');
  assert.equal(decideViewAsStart({ ...admin, previewActive: true }), VIEW_AS_READ_ONLY);
});

test('writes are blocked while a preview is active and allowed otherwise', () => {
  assert.equal(viewAsWriteBlocked(true), VIEW_AS_READ_ONLY);
  assert.equal(viewAsWriteBlocked(false), null);
  const seal = { actorId: 'admin-id', expiresAt: 2_000 };
  assert.equal(
    previewBlocksMutation({ method: 'POST', pathname: '/fund', actorId: 'admin-id', seal, now: 1_000 }),
    true,
  );
  assert.equal(
    previewBlocksMutation({ method: 'POST', pathname: '/view-as/exit', actorId: 'admin-id', seal, now: 1_000 }),
    false,
  );
  assert.equal(
    previewBlocksMutation({ method: 'GET', pathname: '/fund', actorId: 'admin-id', seal, now: 1_000 }),
    false,
  );
  assert.equal(
    previewBlocksMutation({ method: 'POST', pathname: '/fund', actorId: 'member-id', seal, now: 1_000 }),
    false,
  );
  assert.equal(
    previewBlocksMutation({ method: 'POST', pathname: '/fund', actorId: 'admin-id', seal, now: 2_000 }),
    false,
  );
  assert.equal(previewBlocksMutation({ method: 'POST', pathname: '/fund', actorId: 'admin-id', seal: null, now: 1_000 }), false);
});

test('a preview expires after 30 minutes or when the access token does, whichever is sooner', () => {
  assert.equal(VIEW_AS_TTL_MS, 30 * 60 * 1000);
  const start = 1_000_000;
  assert.equal(previewDeadline(start, null), start + VIEW_AS_TTL_MS);
  assert.equal(previewDeadline(start, start + 60_000), start + 60_000);
  assert.equal(previewDeadline(start, start + VIEW_AS_TTL_MS + 5_000), start + VIEW_AS_TTL_MS);
  assert.equal(previewIsCurrent(start + 10, start + 9), true);
  assert.equal(previewIsCurrent(start + 10, start + 10), false);
});

test('only a boolean impersonation claim on app_metadata counts as read-only', () => {
  const token = (payload: object) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return decodeJwtPayload(`aaa.${body}.sig`);
  };
  assert.equal(tokenIsReadOnlyPreview(token({ app_metadata: { role: 'member', impersonation: true } })), true);
  assert.equal(tokenIsReadOnlyPreview(token({ app_metadata: { role: 'treasurer' } })), false);
  assert.equal(tokenIsReadOnlyPreview(token({ user_metadata: { impersonation: true } })), false);
  assert.equal(tokenIsReadOnlyPreview(token({ app_metadata: { impersonation: 'true' } })), false);
  assert.equal(decodeJwtPayload('not-a-jwt'), null);
});

test('the preview cookie round-trips and rejects tampering or the wrong key', async () => {
  const seal = {
    v: 1 as const,
    rowId: 'row',
    actorId: 'admin',
    subjectId: 'member',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 123,
  };
  const sealed = await sealPreview(seal, 'test-secret');
  assert.deepEqual(await openPreview(sealed, 'test-secret'), seal);
  assert.equal(await openPreview(sealed, 'other-secret'), null);
  const [version, iv, cipher] = sealed.split('.');
  assert.equal(await openPreview(`${version}.${iv}.${cipher.slice(0, -2)}aa`, 'test-secret'), null);
  assert.equal(await openPreview('v1.nope', 'test-secret'), null);
});

test('migration 0019 stamps impersonation from the session table, not user_metadata, and blocks writes', () => {
  const sql = readFileSync(join(here, '../../../supabase/migrations/0019_view_as_member.sql'), 'utf8');
  assert.match(sql, /create table public\.impersonation_sessions/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.impersonation_sessions from public, anon, authenticated/);
  assert.match(sql, /function public\.is_impersonating/);
  assert.match(sql, /app_metadata,impersonation/);
  assert.match(sql, /impersonation_sessions/);
  assert.match(sql, /00_view_as_readonly/);
  assert.match(sql, /reject_view_as_write/);
  assert.match(sql, /not public\.is_impersonating\(\)/);
  assert.doesNotMatch(sql, /user_metadata,impersonation/);
  assert.match(sql, /custom_access_token_hook/);
});

test('every mutating server action checks the preview before it writes', () => {
  const dir = join(here, '../app/actions');
  const mustCall = [
    'auth.ts',
    'events.ts',
    'fund.ts',
    'history.ts',
    'members.ts',
    'notifications.ts',
    'prayers.ts',
    'reconcile.ts',
    'tree.ts',
    'units.ts',
  ];
  for (const name of mustCall) {
    const src = readFileSync(join(dir, name), 'utf8');
    assert.match(src, /blockViewAsWrite/, `${name} must refuse writes during a preview`);
  }
  const roster = readFileSync(join(dir, 'roster.ts'), 'utf8');
  assert.match(roster, /requireAdminCtx/);
  const middleware = readFileSync(join(here, '../middleware.ts'), 'utf8');
  assert.match(middleware, /previewBlocksMutation/);
  const present = new Set(readdirSync(dir));
  for (const name of mustCall) assert.equal(present.has(name), true);
});
