'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, canManage } from '@/lib/session';
import type { EventKind } from '@/lib/types';
import type { ActionResult } from './tree';

export type { ActionResult };

/**
 * Create an event. RLS is the real gate: stewards (treasurer/admin) may create anything;
 * members may only add their OWN birthday (see events_insert_own_or_leader).
 */
export async function createEvent(input: {
  kind: EventKind;
  title: string;
  occurs_on: string; // YYYY-MM-DD
  member_id?: string | null;
  branch_id?: string | null;
  venue?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManage(profile) && !(input.kind === 'birthday' && input.member_id === profile.id)) {
    return { ok: false, error: 'You can only add your own birthday. Ask the treasurer to add anniversaries or meetups.' };
  }

  const title = input.title?.trim() ?? '';
  if (!title) return { ok: false, error: 'Give the event a title.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurs_on)) return { ok: false, error: 'Choose a valid date.' };
  if (input.kind !== 'meetup' && !input.member_id) {
    return { ok: false, error: 'Birthdays and anniversaries must point at a member.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('events').insert({
    kind: input.kind,
    title,
    occurs_on: input.occurs_on,
    member_id: input.kind === 'meetup' ? (input.member_id ?? null) : input.member_id,
    branch_id: input.branch_id ?? null,
    venue: input.venue?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: profile.id,
  });
  if (error) {
    return { ok: false, error: 'Could not save the event (permission or validation).' };
  }
  revalidatePath('/events');
  revalidateTag('events');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Leaders may delete anything; members may delete events that honour them
  // (mirrors events_owner_or_leader_delete — RLS enforces it either way).
  if (!canManage(profile)) {
    const { data } = await supabase.from('events').select('id, member_id').eq('id', id).single();
    if (!data || data.member_id !== profile.id) {
      return { ok: false, error: 'Only the treasurer can remove this event.' };
    }
  }
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return { ok: false, error: 'Could not remove the event.' };
  revalidatePath('/events');
  revalidateTag('events');
  revalidatePath('/');
  return { ok: true };
}
