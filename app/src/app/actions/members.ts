'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone, tenDigits } from '@/lib/phone';
import { parseNicknames } from '@/lib/nicknames';
import { resolveAdminPassword } from '@/lib/default-password';
import type { FamilyRole } from '@/lib/types';

export type MemberFormState = {
  ok: boolean;
  error?: string;
  /** Set when this action created or changed a login, so the admin can pass it on. */
  password?: string;
  fullName?: string;
  /** True when `password` is the standard name + birthday password rather than one the admin typed. */
  usedDefault?: boolean;
};

/** Only an admin may manage accounts. Checked against the DB row (source of
 *  truth), not just the JWT claim. Shared with the roster importer. */
export async function requireAdminCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  if (!me || me.role !== 'admin') return null;
  return { supabase, actorId: user.id };
}

const requireAdmin = requireAdminCtx;

/** Shared extraction/validation of the new profile fields (migration 0010). */
function readLifeFields(formData: FormData): {
  error?: string;
  nicknames: string[] | null;
  birthDate: string | null;
  birthYear: number | null;
  dateOfDeath: string | null;
} {
  const nicknames = parseNicknames(String(formData.get('nicknames') ?? ''));
  const birthDate = validDate(String(formData.get('birth_date') ?? ''));
  const dateOfDeath = validDate(String(formData.get('date_of_death') ?? ''));
  const yearRaw = String(formData.get('birth_year') ?? '').trim();
  let birthYear: number | null = null;
  if (yearRaw) {
    if (!/^\d{4}$/.test(yearRaw)) return { error: 'Birth year must be a 4-digit year.', nicknames, birthDate, birthYear, dateOfDeath };
    birthYear = Number(yearRaw);
    if (birthYear < 1850 || birthYear > new Date().getFullYear())
      return { error: 'Birth year must be between 1850 and this year.', nicknames, birthDate, birthYear, dateOfDeath };
  }
  // Client-side mirror of the DB trigger's consistency check.
  if (birthDate && birthYear && birthDate.slice(0, 4) !== String(birthYear))
    return { error: 'Birth year does not match the full birth date entered.', nicknames, birthDate, birthYear, dateOfDeath };
  if (birthDate && !birthYear) birthYear = Number(birthDate.slice(0, 4));
  if (dateOfDeath) {
    const refYear = birthDate ? Number(birthDate.slice(0, 4)) : birthYear;
    if (refYear && Number(dateOfDeath.slice(0, 4)) < refYear)
      return { error: 'Date of death cannot be before the birth year.', nicknames, birthDate, birthYear, dateOfDeath };
  }
  return { nicknames: nicknames.length ? nicknames : null, birthDate, birthYear, dateOfDeath };
}

// Coordinator was merged into Treasurer (migration 0015): one steward role
// manages the family app AND records all Mission Fund entries manually.
const ASSIGNABLE_ROLES: FamilyRole[] = ['member', 'treasurer', 'admin'];

function validDate(s: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Create a family member account. Mobile number is the login identity:
 * Supabase still needs an email, so we derive the private shadow email
 * (<91…>@phone.invalid — migration 0007). The signup trigger creates the
 * profile row from these metadata fields.
 */
export async function createMember(
  _prev: MemberFormState | null,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: 'Only an admin can add members. Sign in as admin.' };

  const fullName = String(formData.get('full_name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const branchId = String(formData.get('branch_id') ?? '');
  const role = String(formData.get('role') ?? 'member') as FamilyRole;
  const life = readLifeFields(formData);
  if (life.error) return { ok: false, error: life.error };

  if (!fullName) return { ok: false, error: 'Full name is required.' };
  if (!tenDigits(rawPhone))
    return { ok: false, error: 'Enter the 10-digit mobile number they will use to sign in.' };
  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'Invalid role.' };

  // Blank password → standard name + birthday password. No birthday → the admin must type one.
  const resolved = resolveAdminPassword({
    fullName,
    birthDate: life.birthDate,
    customPassword: String(formData.get('temp_password') ?? ''),
  });
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const tempPassword = resolved.password;

  const admin = createAdminClient();

  const phone = normalizePhone(rawPhone)!;
  const { data: dup } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_normalized', phone)
    .maybeSingle();
  if (dup) return { ok: false, error: `That mobile number is already registered to ${dup.full_name}.` };

  let uid: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: `OFH-${phone}@phone.invalid`,
      password: tempPassword,
      email_confirm: true, // invite-only family app; no deliverable email exists
      user_metadata: {
        full_name: fullName,
        phone,
        branch_id: branchId || '',
        created_by: ctx.actorId,
      },
    });
    if (error || !data?.user) {
      const m = (error?.message ?? '').toLowerCase();
      return {
        ok: false,
        error: m.includes('already registered')
          ? 'That mobile number or account already exists.'
          : error?.message ?? 'Could not create the account.',
      };
    }
    uid = data.user.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Service-role key missing on server.' };
  }

  // Enrich the profile row created by the signup trigger.
  const { error: profErr } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      phone,
      branch_id: branchId || null,
      role,
      birth_date: life.birthDate,
      birth_year: life.birthYear,
      anniversary_date: validDate(String(formData.get('anniversary_date') ?? '')),
      nicknames: life.nicknames,
      date_of_death: life.dateOfDeath,
    })
    .eq('id', uid);
  if (profErr) {
    // Roll back the half-created account so no orphan login exists.
    await admin.auth.admin.deleteUser(uid);
    return {
      ok: false,
      error: profErr.code === '23505'
        ? 'That mobile number is already registered to another relative.'
        : profErr.message,
    };
  }

  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.create',
    p_entity: 'profiles',
    p_entity_id: uid,
    p_detail: { full_name: fullName, role, branch_id: branchId || null, used_default: resolved.usedDefault },
  });

  revalidatePath('/directory');
  updateTag('directory');
  revalidatePath('/members');
  // Stay on the form so the admin can copy the password. A redirect would drop it.
  return { ok: true, password: tempPassword, fullName, usedDefault: resolved.usedDefault };
}

/** Admin edits an existing member's profile fields (not auth). */
export async function updateMember(
  _prev: MemberFormState | null,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: 'Only an admin can edit members.' };

  const id = String(formData.get('id') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const branchId = String(formData.get('branch_id') ?? '');
  const role = String(formData.get('role') ?? 'member') as FamilyRole;
  const life = readLifeFields(formData);
  if (life.error) return { ok: false, error: life.error };

  if (!id) return { ok: false, error: 'Missing member.' };
  if (!fullName) return { ok: false, error: 'Full name is required.' };
  if (rawPhone && !tenDigits(rawPhone))
    return { ok: false, error: 'Phone must be a 10-digit mobile number.' };
  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'Invalid role.' };

  // Multiple treasurers/stewards are allowed since migration 0015
  // (coordinator merged into treasurer); every role change is audited by the
  // profile trigger, so no app-level single-treasurer guard is needed here.

  // Runs under RLS (migration 0009 allows treasurer/admin updates); the DB
  // guard trigger audits the change and blocks invalid role edits.
  const { error } = await ctx.supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: rawPhone ? normalizePhone(rawPhone) : null,
      branch_id: branchId || null,
      role,
      birth_date: life.birthDate,
      birth_year: life.birthYear,
      anniversary_date: validDate(String(formData.get('anniversary_date') ?? '')),
      nicknames: life.nicknames,
      date_of_death: life.dateOfDeath,
    })
    .eq('id', id);
  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'That mobile number is already registered to another relative.'
        : error.message,
    };
  }

  const admin = createAdminClient();
  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.update',
    p_entity: 'profiles',
    p_entity_id: id,
    p_detail: { full_name: fullName, role, branch_id: branchId || null },
  });

  revalidatePath('/directory');
  updateTag('directory');
  revalidatePath('/members');
  redirect(`/members/${id}?saved=1`);
}

/** Reset a member's password (they keep signing in with their mobile).
 *  A blank field sets the standard name + birthday password. A typed value
 *  is used instead, when it meets the auth minimum length. */
export async function resetMemberPassword(
  _prev: MemberFormState | null,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: 'Only an admin can reset passwords.' };
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'Missing member.' };

  const { data: member, error: readErr } = await ctx.supabase
    .from('profiles')
    .select('full_name, birth_date, birthday_hint')
    .eq('id', id)
    .single();
  if (readErr || !member) return { ok: false, error: 'Member not found.' };

  const resolved = resolveAdminPassword({
    fullName: member.full_name,
    birthDate: member.birth_date,
    birthdayHint: member.birthday_hint,
    customPassword: String(formData.get('new_password') ?? ''),
  });
  if ('error' in resolved) return { ok: false, error: resolved.error };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: resolved.password });
  if (error) return { ok: false, error: error.message };

  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.password_reset',
    p_entity: 'auth.users',
    p_entity_id: id,
    p_detail: { used_default: resolved.usedDefault },
  });
  revalidatePath(`/members/${id}`);
  return {
    ok: true,
    password: resolved.password,
    fullName: member.full_name,
    usedDefault: resolved.usedDefault,
  };
}

/**
 * Give a directory-only relative (no auth.users row) a login, keeping the
 * same profile id so history stays attached. Password rules match create/reset:
 * blank → standard password; no birthday → the admin must type one.
 */
export async function linkDirectoryAccount(
  _prev: MemberFormState | null,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: 'Only an admin can create logins.' };

  const id = String(formData.get('id') ?? '');
  const rawPhone = String(formData.get('phone') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing member.' };
  if (!tenDigits(rawPhone))
    return { ok: false, error: 'Enter the 10-digit mobile number they will use to sign in.' };

  const { data: member, error: readErr } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, birth_date, birthday_hint')
    .eq('id', id)
    .single();
  if (readErr || !member) return { ok: false, error: 'Member not found.' };

  const resolved = resolveAdminPassword({
    fullName: member.full_name,
    birthDate: member.birth_date,
    birthdayHint: member.birthday_hint,
    customPassword: String(formData.get('new_password') ?? ''),
  });
  if ('error' in resolved) return { ok: false, error: resolved.error };

  const admin = createAdminClient();
  const { data: existing, error: lookupErr } = await admin.auth.admin.getUserById(id);
  if (existing?.user) return { ok: false, error: 'This relative already has a login. Use Reset password.' };
  if (lookupErr) {
    const status = 'status' in lookupErr ? Number(lookupErr.status) : 0;
    const missing = status === 404 || /not found/i.test(lookupErr.message);
    if (!missing) return { ok: false, error: lookupErr.message };
  }

  const phone = normalizePhone(rawPhone)!;
  const { data: dup } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('phone_normalized', phone)
    .neq('id', id)
    .maybeSingle();
  if (dup) return { ok: false, error: `That mobile number is already registered to ${dup.full_name}.` };

  try {
    const { data, error } = await admin.auth.admin.createUser({
      id, // same uuid as the directory row; handle_new_user keeps that profile
      email: `OFH-${phone}@phone.invalid`,
      password: resolved.password,
      email_confirm: true,
      user_metadata: {
        full_name: member.full_name,
        phone,
        created_by: ctx.actorId,
      },
    });
    if (error || !data?.user) {
      const m = (error?.message ?? '').toLowerCase();
      return {
        ok: false,
        error: m.includes('already')
          ? 'This relative already has a login. Use Reset password.'
          : error?.message ?? 'Could not create the login.',
      };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Service-role key missing on server.' };
  }

  const { error: profErr } = await admin.from('profiles').update({ phone }).eq('id', id);
  if (profErr) {
    // profiles.id no longer cascades from auth.users (migration 0014), so
    // removing the half-created login leaves the directory row in place.
    await admin.auth.admin.deleteUser(id);
    return {
      ok: false,
      error: profErr.code === '23505'
        ? 'That mobile number is already registered to another relative.'
        : profErr.message,
    };
  }

  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.link_account',
    p_entity: 'profiles',
    p_entity_id: id,
    p_detail: { full_name: member.full_name, used_default: resolved.usedDefault },
  });

  revalidatePath('/directory');
  updateTag('directory');
  revalidatePath('/members');
  revalidatePath(`/members/${id}`);
  return {
    ok: true,
    password: resolved.password,
    fullName: member.full_name,
    usedDefault: resolved.usedDefault,
  };
}

