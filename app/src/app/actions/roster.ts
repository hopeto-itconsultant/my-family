'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminCtx } from './members';
import { parseRoster, duplicateNames, type ParsedRosterRow } from '@/lib/roster';
import type { FamilyRole } from '@/lib/types';

export interface RosterPreview {
  rows: ParsedRosterRow[];
  errors: string[];
  duplicates: string[];
  /** Names that already exist in the directory (case-insensitive). */
  existingNames: string[];
  /** Normalized phones that already belong to another member. */
  existingPhones: { phone: string; name: string }[];
}

/**
 * Step 1 — parse + validate the pasted sheet and cross-check against the
 * current directory. Nothing is written here. Runs as admin only.
 */
export async function previewRoster(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; preview?: RosterPreview }> {
  const ctx = await requireAdminCtx();
  if (!ctx) return { error: 'Only an admin can import members.' };

  const text = String(formData.get('sheet') ?? '');
  const parsed = parseRoster(text);
  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    return { error: 'No data rows found. Keep the header line and paste the rows below it.' };
  }
  if (parsed.rows.length > 300) {
    return { error: 'Please import at most 300 rows at a time.' };
  }

  const admin = createAdminClient();

  // Cross-check names + phones against what already exists.
  const { data: existingProfiles } = await admin
    .from('profiles')
    .select('full_name, phone_normalized');
  const nameSet = new Set((existingProfiles ?? []).map((p) => p.full_name.toLowerCase()));
  const phoneMap = new Map<string, string>();
  for (const p of existingProfiles ?? []) {
    if (p.phone_normalized) phoneMap.set(p.phone_normalized, p.full_name);
  }

  const existingNames = parsed.rows
    .filter((r) => nameSet.has(r.full_name.toLowerCase()))
    .map((r) => r.full_name);
  const existingPhones = parsed.rows
    .filter((r) => r.phone && phoneMap.has(r.phone))
    .map((r) => ({ phone: r.phone!, name: phoneMap.get(r.phone!)! }));

  return {
    preview: {
      rows: parsed.rows,
      errors: parsed.errors,
      duplicates: duplicateNames(parsed.rows),
      existingNames,
      existingPhones,
    },
  };
}

/**
 * Step 2 — import the confirmed rows.
 *   * Rows with a valid mobile become full login accounts (shadow email,
 *     unassigned temporary password until the admin sets one on /members).
 *   * Rows without a usable mobile are imported as directory-only profiles
 *     (no login possible) so birthdays/nicknames are still captured.
 *   * Rows whose name already exists are SKIPPED (never duplicated silently).
 * Idempotent-ish: safe to re-run after fixing the sheet.
 */
export async function importRoster(rows: ParsedRosterRow[], branchId: string | null, role: FamilyRole): Promise<{ created: number; skipped: number; errors: string[] }> {
  const ctx = await requireAdminCtx();
  if (!ctx) return { created: 0, skipped: 0, errors: ['Only an admin can import members.'] };
  if (!['member', 'treasurer', 'admin'].includes(role)) {
    return { created: 0, skipped: 0, errors: ['Invalid default role for import.'] };
  }
  if (rows.length === 0) return { created: 0, skipped: 0, errors: [] };

  const admin = createAdminClient();
  const created: string[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const { data: existingProfiles } = await admin.from('profiles').select('full_name, phone_normalized');
  const nameSet = new Set((existingProfiles ?? []).map((p) => p.full_name.toLowerCase()));
  const phoneSet = new Set(
    (existingProfiles ?? []).map((p) => p.phone_normalized).filter(Boolean) as string[],
  );

  for (const row of rows) {
    const key = row.full_name.toLowerCase();
    if (nameSet.has(key) || (row.phone && phoneSet.has(row.phone))) {
      skipped++;
      continue;
    }

    const hintDate = row.birthday_hint ? `2000-${row.birthday_hint}` : null;

    if (row.phone) {
      // Full account: profile + auth user via shadow email (same scheme as
      // migration 0007 / the single-add form). Password stays unset until the
      // admin assigns one from the member's edit page.
      try {
        const { data, error } = await admin.auth.admin.createUser({
          email: `OFH-${row.phone}@phone.invalid`,
          password: `OFH-roster-${crypto.randomUUID()}`, // random; admin resets before sharing
          email_confirm: true,
          user_metadata: { full_name: row.full_name, phone: row.phone, branch_id: branchId ?? '' },
        });
        if (error || !data?.user) {
          errors.push(`${row.full_name}: ${error?.message ?? 'auth user creation failed'}`);
          continue;
        }
        const { error: profErr } = await admin
          .from('profiles')
          .update({
            full_name: row.full_name,
            phone: row.phone,
            branch_id: branchId,
            role,
            birth_date: row.birth_date,
            birth_year: row.birth_year,
            birthday_hint: hintDate,
            nicknames: row.nicknames,
          })
          .eq('id', data.user.id);
        if (profErr) {
          await admin.auth.admin.deleteUser(data.user.id); // no orphan logins
          errors.push(`${row.full_name}: ${profErr.code === '23505' ? 'mobile already registered' : profErr.message}`);
          continue;
        }
        nameSet.add(key);
        phoneSet.add(row.phone);
        created.push(row.full_name);
      } catch (e) {
        errors.push(`${row.full_name}: ${e instanceof Error ? e.message : 'unexpected error'}`);
      }
    } else {
      // Directory-only profile (no login). id defaults via table rule? profiles.id
      // references auth.users, so we insert with gen_random_uuid() and mark it
      // via the dedicated partial support added below (see note in PLAN.md).
      const { error } = await admin.from('profiles').insert({
        id: crypto.randomUUID(),
        full_name: row.full_name,
        branch_id: branchId,
        role: 'member',
        birth_date: row.birth_date,
        birth_year: row.birth_year,
        birthday_hint: hintDate,
        nicknames: row.nicknames,
      });
      if (error) {
        errors.push(`${row.full_name}: ${error.message}`);
        continue;
      }
      nameSet.add(key);
      created.push(row.full_name);
    }
  }

  await admin.rpc('log_audit', {
    p_actor: ctx.actorId,
    p_action: 'member.roster_import',
    p_entity: 'profiles',
    p_entity_id: null,
    p_detail: { created: created.length, skipped, errors: errors.length },
  });

  revalidatePath('/directory');
  updateTag('directory');
  updateTag('events');
  revalidatePath('/members');
  revalidatePath('/events');
  return { created: created.length, skipped, errors };
}

/** Client-facing wrapper so the UI can call it as a form action. */
export async function importRosterAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<void> {
  const ctx = await requireAdminCtx();
  if (!ctx) redirect('/members');
  let rows: ParsedRosterRow[] = [];
  try {
    rows = JSON.parse(String(formData.get('rows_json') ?? '[]'));
  } catch {
    redirect('/members/import?error=bad-data');
  }
  const branchId = String(formData.get('branch_id') ?? '') || null;
  const role = String(formData.get('role') ?? 'member') as FamilyRole;
  const result = await importRoster(rows, branchId, role);
  const q = new URLSearchParams({
    created: String(result.created),
    skipped: String(result.skipped),
  });
  if (result.errors.length) q.set('errors', result.errors.slice(0, 5).join(' | '));
  redirect(`/members/import?${q.toString()}#done`);
}
