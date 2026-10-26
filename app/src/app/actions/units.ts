'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { MembershipRole, MembershipStatus } from '@/lib/access';
import { MEMBERSHIP_ROLE_LEVEL } from '@/lib/access';

export type UnitActionState = { ok: boolean; error?: string };

/** Resolve the caller's DB-truth profile (never trust the browser). */
async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single();
  return profile ? { supabase, ...profile } : null;
}

/** Server-side mirror of can_grant_role_in_unit(): returns MY active level in
 *  the unit (0 when none). Global admins get max. RLS + trigger enforce again —
 *  this only produces friendly errors before hitting the DB. */
async function myUnitLevel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  globalRole: string,
  unitId: string,
): Promise<number> {
  if (globalRole === 'admin') return 7;
  const { data } = await supabase
    .from('unit_memberships')
    .select('member_role, status')
    .eq('unit_id', unitId)
    .eq('member_id', actorId)
    .maybeSingle();
  if (!data || data.status !== 'active') return 0;
  return MEMBERSHIP_ROLE_LEVEL[data.member_role as MembershipRole] ?? 0;
}

// ---------------------------------------------------------------- units -----

export async function createUnit(_prev: UnitActionState, formData: FormData): Promise<UnitActionState> {
  const ctx = await me();
  if (!ctx) return { ok: false, error: 'Please sign in again.' };
  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'group');
  const description = String(formData.get('description') ?? '').trim() || null;
  const parentId = String(formData.get('parent_id') ?? '') || null;
  if (!name) return { ok: false, error: 'Name is required.' };
  // Groups may be created by stewards; branches are admin-only (mirrors RLS).
  if (kind === 'branch' && ctx.role !== 'admin')
    return { ok: false, error: 'Only an app admin can create family branches.' };
  if (kind !== 'branch' && kind !== 'group') return { ok: false, error: 'Unknown unit kind.' };
  if (kind === 'group' && ctx.role !== 'admin' && ctx.role !== 'treasurer')
    return { ok: false, error: 'Only a treasurer or admin can create groups/divisions.' };

  const { error } = await ctx.supabase.from('org_units').insert({
    kind,
    name,
    description,
    parent_id: parentId,
    scope: kind === 'branch' ? 'branch' : 'branch',
    created_by: ctx.id,
  });
  if (error) return { ok: false, error: friendly(error.message, 'create group') };
  revalidatePath('/units');
  return { ok: true };
}

export async function setUnitStatus(unitId: string, status: 'active' | 'archived'): Promise<UnitActionState> {
  const ctx = await me();
  if (!ctx) return { ok: false, error: 'Please sign in again.' };
  if (ctx.role !== 'admin' && ctx.role !== 'treasurer')
    return { ok: false, error: 'Only a treasurer or admin can archive or restore units.' };
  const { error } = await ctx.supabase.from('org_units').update({ status }).eq('id', unitId);
  if (error) return { ok: false, error: friendly(error.message, 'update unit') };
  revalidatePath('/units');
  return { ok: true };
}

// ----------------------------------------------------------- memberships ----

export async function grantMembership(input: {
  unitId: string;
  memberId: string;
  role: MembershipRole;
}): Promise<UnitActionState> {
  const ctx = await me();
  if (!ctx) return { ok: false, error: 'Please sign in again.' };
  const level = await myUnitLevel(ctx.supabase, ctx.id, ctx.role, input.unitId);
  const want = MEMBERSHIP_ROLE_LEVEL[input.role] ?? 0;
  if (level < want)
    return { ok: false, error: 'You can only grant roles up to your own level in this unit.' };
  if (input.memberId === ctx.id && want > MEMBERSHIP_ROLE_LEVEL.viewer)
    return { ok: false, error: 'You cannot grant yourself a role above viewer.' };

  const { error } = await ctx.supabase.from('unit_memberships').upsert(
    {
      unit_id: input.unitId,
      member_id: input.memberId,
      member_role: input.role,
      status: 'active',
      granted_by: ctx.id,
    },
    { onConflict: 'unit_id,member_id' },
  );
  if (error) return { ok: false, error: friendly(error.message, 'grant membership') };
  revalidatePath(`/units/${input.unitId}`);
  return { ok: true };
}

export async function updateMembership(input: {
  unitId: string;
  membershipId: string;
  role?: MembershipRole;
  status?: MembershipStatus;
}): Promise<UnitActionState> {
  const ctx = await me();
  if (!ctx) return { ok: false, error: 'Please sign in again.' };
  const level = await myUnitLevel(ctx.supabase, ctx.id, ctx.role, input.unitId);
  if (level === 0) return { ok: false, error: 'You are not an active member of this unit.' };

  const patch: Record<string, unknown> = {};
  if (input.role) {
    const want = MEMBERSHIP_ROLE_LEVEL[input.role] ?? 0;
    if (want > level) return { ok: false, error: 'You can only grant roles up to your own level in this unit.' };
    patch.member_role = input.role;
  }
  if (input.status) patch.status = input.status;
  if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to change.' };

  const { error } = await ctx.supabase.from('unit_memberships').update(patch).eq('id', input.membershipId);
  if (error) return { ok: false, error: friendly(error.message, 'update membership') };
  revalidatePath(`/units/${input.unitId}`);
  return { ok: true };
}

export async function removeMembership(input: {
  unitId: string;
  membershipId: string;
}): Promise<UnitActionState> {
  const ctx = await me();
  if (!ctx) return { ok: false, error: 'Please sign in again.' };
  const level = await myUnitLevel(ctx.supabase, ctx.id, ctx.role, input.unitId);
  if (level === 0) return { ok: false, error: 'You are not an active member of this unit.' };
  const { error } = await ctx.supabase.from('unit_memberships').delete().eq('id', input.membershipId);
  if (error) return { ok: false, error: friendly(error.message, 'remove membership') };
  revalidatePath(`/units/${input.unitId}`);
  return { ok: true };
}

function friendly(msg: string, what: string): string {
  if (/row-level security|permission/i.test(msg)) return `Not allowed to ${what} (access denied).`;
  if (/duplicate key/i.test(msg)) return `Already exists — nothing changed.`;
  return msg.slice(0, 200) || `Could not ${what}.`;
}
