import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  attemptPhonePasswordSignIn,
  PHONE_SIGN_IN_REJECTED,
  resolvePhoneLoginEmail,
  PHONE_SIGN_IN_UNAVAILABLE,
  serviceRolePhoneLookup,
  UNKNOWN_PHONE_LOGIN_EMAIL,
  type PhoneAccountLookup,
  type PhoneDirectory,
} from './phone-login';

const ADMIN_PHONE = '918837306849';
const ADMIN_EMAIL = 'family-admin@example.com';
const SHADOW_PHONE = '918787438094';
const SHADOW_EMAIL = `OFH-${SHADOW_PHONE}@phone.invalid`;

function lookupFor(emailByPhone: Record<string, string | null>): PhoneAccountLookup {
  return {
    async profileIdForPhone(phone) {
      if (!(phone in emailByPhone)) return null;
      const email = emailByPhone[phone];
      return email === null ? `directory-${phone}` : `user-${phone}`;
    },
    async emailForUserId(userId) {
      const phone = userId.replace(/^user-/, '').replace(/^directory-/, '');
      if (userId.startsWith('directory-')) return null;
      return emailByPhone[phone] ?? null;
    },
  };
}

function directory(opts: {
  profileId?: string | null;
  email?: string | null;
  profileError?: string;
  userError?: { message: string; status?: number; code?: string } | null;
  onProfile?: (phone: string) => void;
  onUser?: (id: string) => void;
}): PhoneDirectory {
  return {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(columns) {
          assert.equal(columns, 'id');
          return {
            eq(column, value) {
              assert.equal(column, 'phone_normalized');
              opts.onProfile?.(value);
              return {
                async maybeSingle() {
                  if (opts.profileError) return { data: null, error: { message: opts.profileError } };
                  return {
                    data: opts.profileId ? { id: opts.profileId } : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(userId) {
          opts.onUser?.(userId);
          if (opts.userError) return { data: { user: null }, error: opts.userError };
          return { data: { user: { email: opts.email ?? null } }, error: null };
        },
      },
    },
  };
}

test('email-based account signs in with the real auth email', async () => {
  const seen: string[] = [];
  const result = await attemptPhonePasswordSignIn(
    lookupFor({ [ADMIN_PHONE]: ADMIN_EMAIL }),
    async (email, password) => {
      seen.push(`${email}|${password}`);
      assert.equal(email, ADMIN_EMAIL);
      return null;
    },
    ADMIN_PHONE,
    'correct-password',
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, [`${ADMIN_EMAIL}|correct-password`]);
});

test('phone-shadow account signs in with OFH-<phone>@phone.invalid', async () => {
  const seen: string[] = [];
  const result = await attemptPhonePasswordSignIn(
    lookupFor({ [SHADOW_PHONE]: SHADOW_EMAIL }),
    async (email) => {
      seen.push(email);
      return null;
    },
    SHADOW_PHONE,
    'shadow-password',
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, [SHADOW_EMAIL]);
});

test('unknown number and a wrong password share one message and the email stays off it', async () => {
  const attempted: string[] = [];
  const signIn = async (email: string) => {
    attempted.push(email);
    return { message: 'Invalid login credentials' };
  };
  const wrongPassword = await attemptPhonePasswordSignIn(
    lookupFor({ [ADMIN_PHONE]: ADMIN_EMAIL }),
    signIn,
    ADMIN_PHONE,
    'nope',
  );
  const unknown = await attemptPhonePasswordSignIn(
    lookupFor({}),
    signIn,
    '919999999999',
    'nope',
  );
  assert.equal(wrongPassword.ok, false);
  assert.equal(unknown.ok, false);
  if (!wrongPassword.ok && !unknown.ok) {
    assert.equal(wrongPassword.error, PHONE_SIGN_IN_REJECTED);
    assert.equal(unknown.error, wrongPassword.error);
    assert.equal(wrongPassword.error.includes(ADMIN_EMAIL), false);
    assert.equal(unknown.error.includes('@'), false);
  }
  assert.deepEqual(attempted, [ADMIN_EMAIL, UNKNOWN_PHONE_LOGIN_EMAIL]);
});

test('a directory-only profile with that phone fails like an unknown number', async () => {
  const attempted: string[] = [];
  const result = await attemptPhonePasswordSignIn(
    lookupFor({ '919111111111': null }),
    async (email) => {
      attempted.push(email);
      return { message: 'Invalid login credentials' };
    },
    '919111111111',
    'nope',
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, PHONE_SIGN_IN_REJECTED);
  assert.deepEqual(attempted, [UNKNOWN_PHONE_LOGIN_EMAIL]);
});

test('service-role lookup reads profiles.phone_normalized then auth.users email', async () => {
  const phones: string[] = [];
  const ids: string[] = [];
  const emailAccount = serviceRolePhoneLookup(
    directory({
      profileId: 'admin-id',
      email: ADMIN_EMAIL,
      onProfile: (phone) => phones.push(phone),
      onUser: (id) => ids.push(id),
    }),
  );
  assert.equal(await resolvePhoneLoginEmail(emailAccount, ADMIN_PHONE), ADMIN_EMAIL);

  const shadow = serviceRolePhoneLookup(
    directory({ profileId: 'shadow-id', email: SHADOW_EMAIL }),
  );
  assert.equal(await shadow.profileIdForPhone(SHADOW_PHONE), 'shadow-id');
  assert.equal(await shadow.emailForUserId('shadow-id'), SHADOW_EMAIL);

  const missing = serviceRolePhoneLookup(directory({ profileId: null }));
  assert.equal(await missing.profileIdForPhone('910000000000'), null);

  const noLogin = serviceRolePhoneLookup(
    directory({ profileId: 'dir-only', userError: { message: 'User not found', status: 404 } }),
  );
  assert.equal(await noLogin.emailForUserId('dir-only'), null);

  assert.deepEqual(phones, [ADMIN_PHONE]);
  assert.deepEqual(ids, ['admin-id']);
});

test('lookup failures become the unavailable message and do not attempt sign-in', async () => {
  let attempts = 0;
  const profileDown = await attemptPhonePasswordSignIn(
    serviceRolePhoneLookup(directory({ profileError: 'permission denied' })),
    async () => {
      attempts += 1;
      return null;
    },
    ADMIN_PHONE,
    'secret',
  );
  const authDown = await attemptPhonePasswordSignIn(
    serviceRolePhoneLookup(directory({ profileId: 'admin-id', userError: { message: 'bad gateway', status: 500 } })),
    async () => {
      attempts += 1;
      return null;
    },
    ADMIN_PHONE,
    'secret',
  );
  assert.deepEqual(profileDown, { ok: false, error: PHONE_SIGN_IN_UNAVAILABLE });
  assert.deepEqual(authDown, { ok: false, error: PHONE_SIGN_IN_UNAVAILABLE });
  assert.equal(attempts, 0);
});

test('migration 0018 drops the anon phone RPC and does not grant normalize_phone to anon', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const sql = readFileSync(join(root, 'supabase/migrations/0018_phone_login_lookup.sql'), 'utf8');
  assert.match(sql, /drop function if exists public\.shadow_email_for_phone\(text\)/i);
  assert.match(sql, /revoke execute on function public\.normalize_phone\(text\) from anon/i);
  assert.doesNotMatch(sql, /grant execute on function public\.normalize_phone\(text\) to anon/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test('roster seed creates an email identity and empty GoTrue token strings', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const seed = readFileSync(join(root, 'supabase/seed_roster.sql'), 'utf8');
  assert.match(seed, /insert into auth\.identities/i);
  assert.match(seed, /'email'/);
  assert.match(seed, /provider_id/);
  assert.match(seed, /email_verified/);
  assert.match(seed, /confirmation_token = coalesce\(confirmation_token, ''\)/);
  assert.match(seed, /recovery_token = coalesce\(recovery_token, ''\)/);
  assert.match(seed, /email_change_token_new = coalesce\(email_change_token_new, ''\)/);
  assert.match(seed, /email_change = coalesce\(email_change, ''\)/);
  assert.doesNotMatch(seed, /insert into public\.profiles \([^)]*phone_normalized/);
});
