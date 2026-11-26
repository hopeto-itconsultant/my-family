'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone, tenDigits } from '@/lib/phone';
import {
  attemptPhonePasswordSignIn,
  friendlyAuthError,
  PHONE_SIGN_IN_UNAVAILABLE,
  serviceRolePhoneLookup,
  type PhoneDirectory,
} from '@/lib/phone-login';

/**
 * Sign in with a registered mobile number + password.
 *
 * The service-role client maps profiles.phone_normalized to auth.users.email
 * (a real address or an OFH-…@phone.invalid shadow). That address is used only
 * for this request's signInWithPassword call and is never sent back to the
 * browser. Unknown numbers sign in against a dummy address so the error matches
 * a wrong password. Migration 0018 drops the old anon RPC that could not see
 * real emails and that anon could not execute.
 */
export async function signInWithPhone(formData: FormData) {
  const raw = String(formData.get('phone') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') || '/');

  if (!tenDigits(raw)) {
    redirect(`/login?error=${encodeURIComponent('Enter your 10-digit mobile number.')}`);
  }
  const normalized = normalizePhone(raw)!;

  const supabase = await createClient();
  // redirect() throws, so it stays outside this try (Next.js server functions).
  let lookup;
  let lookupUnavailable = false;
  try {
    // Cast: SupabaseClient's overloaded builders are the same calls PhoneDirectory names.
    lookup = serviceRolePhoneLookup(createAdminClient() as unknown as PhoneDirectory);
  } catch {
    lookupUnavailable = true;
  }
  if (lookupUnavailable || !lookup) {
    redirect(`/login?error=${encodeURIComponent(PHONE_SIGN_IN_UNAVAILABLE)}`);
  }

  const result = await attemptPhonePasswordSignIn(
    lookup,
    async (email, pw) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      return error ? { message: error.message } : null;
    },
    normalized,
    password,
  );
  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.error)}`);
  }
  redirect(next);
}

/** Legacy path: members invited by email can still sign in with their email. */
export async function signInWithEmail(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}&mode=email`);
  }
  redirect(String(formData.get('next') || '/'));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Members may edit their own display name / phone. Role & branch are admin-only
 *  (enforced again by RLS + DB triggers — including phone uniqueness + audit). */
export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const fullName = String(formData.get('full_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  if (!fullName) redirect('/home?error=Name+is+required');
  if (phone && !tenDigits(phone)) redirect('/home?error=Phone+must+be+a+10-digit+mobile+number');

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone: phone ? normalizePhone(phone) : null })
    .eq('id', user.id);

  if (error) {
    const msg =
      error.code === '23505'
        ? 'That mobile number is already registered to another relative.'
        : error.message;
    redirect(`/home?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath('/home');
  revalidatePath('/directory');
  redirect('/home?saved=1');
}
