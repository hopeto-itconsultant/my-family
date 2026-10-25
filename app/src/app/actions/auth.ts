'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone, tenDigits } from '@/lib/phone';

/** Map Supabase auth errors to family-friendly messages (never leak account existence). */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Mobile number or password is incorrect.';
  if (m.includes('email not confirmed')) return 'Your account is not activated yet — ask an admin.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}

/**
 * Sign in with a registered mobile number + password.
 * Supabase requires an email on every user, so we resolve the phone to its
 * private shadow email (<91…>@phone.invalid) via the DB helper from migration
 * 0007. Unknown phones resolve to a constant miss value, which produces the
 * same generic error as a wrong password — no member enumeration.
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
  const { data, error: rpcError } = await supabase.rpc('shadow_email_for_phone', { p: normalized });
  if (rpcError || !data) {
    redirect(`/login?error=${encodeURIComponent('Sign-in service unavailable. Try again shortly.')}`);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: data as string,
    password,
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
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
