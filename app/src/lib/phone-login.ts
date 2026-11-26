/**
 * Phone sign-in resolves the real auth email on the server.
 *
 * Supabase Auth signs in with an email. Family accounts may use a real email
 * (an invited admin) or a private shadow address (OFH-<phone>@phone.invalid).
 * The profile's normalized phone is the login id. Looking that phone up with
 * the anon key would publish the email, so this module is only called with the
 * service-role client from the sign-in Server Action. Callers never return the
 * address to the browser.
 *
 * An unknown number still attempts a password sign-in against a fixed dummy
 * address. GoTrue reports that the same way as a wrong password, so the
 * response does not reveal whether the number is registered.
 */

export const UNKNOWN_PHONE_LOGIN_EMAIL = 'unknown-phone@phone.invalid';

export const PHONE_SIGN_IN_UNAVAILABLE = 'Sign-in service unavailable. Try again shortly.';

export const PHONE_SIGN_IN_REJECTED = 'Mobile number or password is incorrect.';

export interface PhoneAccountLookup {
  profileIdForPhone(phoneNormalized: string): Promise<string | null>;
  /** Auth email for that user, or null when the profile has no login. */
  emailForUserId(userId: string): Promise<string | null>;
}

/**
 * Service-role client surface this lookup uses. The real client from
 * `createAdminClient()` satisfies it; tests pass a fake.
 */
export interface PhoneDirectory {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  auth: {
    admin: {
      getUserById(userId: string): Promise<{
        data: { user: { email?: string | null } | null };
        error: { message: string; status?: number; code?: string } | null;
      }>;
    };
  };
}

export function isMissingAuthUser(error: {
  message?: string;
  status?: number;
  code?: string;
}): boolean {
  if (error.status === 404 || error.code === 'user_not_found') return true;
  return (error.message ?? '').toLowerCase() === 'user not found';
}

/** profiles.phone_normalized -> auth.users.email, via the service-role client. */
export function serviceRolePhoneLookup(admin: PhoneDirectory): PhoneAccountLookup {
  return {
    async profileIdForPhone(phoneNormalized) {
      const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle();
      if (error) throw new Error('profile lookup failed');
      return data?.id ?? null;
    },
    async emailForUserId(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        if (isMissingAuthUser(error)) return null;
        throw new Error('auth user lookup failed');
      }
      const email = data.user?.email?.trim();
      return email ? email : null;
    },
  };
}

export async function resolvePhoneLoginEmail(
  lookup: PhoneAccountLookup,
  phoneNormalized: string,
): Promise<string> {
  const userId = await lookup.profileIdForPhone(phoneNormalized);
  if (!userId) return UNKNOWN_PHONE_LOGIN_EMAIL;
  const email = (await lookup.emailForUserId(userId))?.trim();
  if (!email) return UNKNOWN_PHONE_LOGIN_EMAIL;
  return email;
}

/** Map Supabase auth errors to family-friendly messages (never leak account existence). */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes('invalid login credentials') ||
    m.includes('invalid_credentials') ||
    m.includes('user not found')
  ) {
    return PHONE_SIGN_IN_REJECTED;
  }
  if (m.includes('email not confirmed')) return 'Your account is not activated yet — ask an admin.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}

export async function attemptPhonePasswordSignIn(
  lookup: PhoneAccountLookup,
  signIn: (email: string, password: string) => Promise<{ message: string } | null>,
  phoneNormalized: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let email: string;
  try {
    email = await resolvePhoneLoginEmail(lookup, phoneNormalized);
  } catch {
    return { ok: false, error: PHONE_SIGN_IN_UNAVAILABLE };
  }

  let failure: { message: string } | null;
  try {
    failure = await signIn(email, password);
  } catch {
    return { ok: false, error: PHONE_SIGN_IN_UNAVAILABLE };
  }
  if (!failure) return { ok: true };

  const error = friendlyAuthError(failure.message);
  // The query string is visible to the member. Never echo an address.
  if (error.includes('@')) return { ok: false, error: PHONE_SIGN_IN_REJECTED };
  return { ok: false, error };
}
