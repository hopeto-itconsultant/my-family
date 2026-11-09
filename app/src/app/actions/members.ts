'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone, tenDigits } from '@/lib/phone';
import { parseNicknames } from '@/lib/nicknames';
import { resolveBirthday } from '@/lib/birthday';
import type { FamilyRole } from '@/lib/types';

export type MemberFormState = { ok: boolean; error?: string };

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

/** Shared extraction/validation of birthday (day+month), optional year, and death date. */
function readLifeFields(formData: FormData): {
  error?: string;
  nicknames: string[] | null;
  birthDate: string | null;
  birthYear: number | null;
  birthdayHint: string | null;
  dateOfDeath: string | null;
} {
  const nicknames = parseNicknames(String(formData.get('nicknames') ?? ''));
  const dateOfDeath = validDate(String(formData.get('date_of_death') ?? ''));
  const birthday = resolveBirthday(
    String(formData.get('birth_month') ?? ''),
    String(formData.get('birth_day') ?? ''),
    String(formData.get('birth_year') ?? ''),
  );
  const blank = {
    nicknames,
    birthDate: birthday.birthDate,
    birthYear: birthday.birthYear,
    birthdayHint: birthday.birthdayHint,
    dateOfDeath,
  };
  if (birthday.error) return { ...blank, error: birthday.error, birthDate: null, birthYear: null, birthdayHint: null };
  if (dateOfDeath && birthday.birthYear && Number(dateOfDeath.slice(0, 4)) < birthday.birthYear) {
    return { ...blank, error: 'Date of death cannot be before the birth year.' };
  }
  return { ...blank, nicknames: nicknames.length ? nicknames : null };
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
  const tempPassword = String(formData.get('temp_password') ?? '');

  if (!fullName) return { ok: false, error: 'Full name is required.' };
  if (!tenDigits(rawPhone))
    return { ok: false, error: 'Enter the 10-digit mobile number they will use to sign in.' };
  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'Invalid role.' };
  if (tempPassword.length < 8)
    return { ok: false, error: 'Temporary password must be at least 8 characters.' };

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
      birthday_hint: life.birthdayHint,
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
    p_detail: { full_name: fullName, role, branch_id: branchId || null },
  });

  revalidatePath('/directory');
  updateTag('directory');
  revalidatePath('/members');
  redirect('/members?created=1');
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
  const patch = {
    full_name: fullName,
    phone: rawPhone ? normalizePhone(rawPhone) : null,
    branch_id: branchId || null,
    role,
    birth_date: life.birthDate,
    birth_year: life.birthYear,
    birthday_hint: life.birthdayHint,
    anniversary_date: validDate(String(formData.get('anniversary_date') ?? '')),
    nicknames: life.nicknames,
    date_of_death: life.dateOfDeath,
  };

  // normalize_member_dates rejects a new birth_year that disagrees with the
  // previous full birth_date, even when this update clears that date. Clear
  // the date first, then store the replacement year.
  let error: { code?: string; message: string } | null = null;
  let wrote = false;
  if (life.birthDate == null && life.birthYear != null) {
    const { data: current } = await ctx.supabase
      .from('profiles')
      .select('birth_date')
      .eq('id', id)
      .maybeSingle();
    const oldYear = current?.birth_date ? Number(String(current.birth_date).slice(0, 4)) : null;
    if (oldYear != null && oldYear !== life.birthYear) {
      wrote = true;
      const cleared = await ctx.supabase
        .from('profiles')
        .update({ ...patch, birth_year: null })
        .eq('id', id);
      error = cleared.error;
      if (!error) {
        const second = await ctx.supabase
          .from('profiles')
          .update({ birth_year: life.birthYear })
          .eq('id', id);
        error = second.error;
      }
    }
  }
  if (!wrote) {
    const result = await ctx.supabase.from('profiles').update(patch).eq('id', id);
    error = result.error;
  }
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

/** Reset a member's password (they keep signing in with their mobile). */
export async function resetMemberPassword(
  _prev: MemberFormState | null,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: 'Only an admin can reset passwords.' };
  const id = String(formData.get('id') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  if (!id) return { ok: false, error: 'Missing member.' };
  if (newPassword.length < 8)
    return { ok: false, error: 'Password must be at least 8 characters.' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
  if (error) return { ok: false, error: error.message };

  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.password_reset',
    p_entity: 'auth.users',
    p_entity_id: id,
    p_detail: {},
  });
  revalidatePath(`/members/${id}`);
  return { ok: true };
}

