'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, canManage } from '@/lib/session';
import type { RelationKind } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Add a relation edge. RLS is the real gate (stewards only); this check
 * merely gives a friendly error before hitting the database.
 * For kind='parent' we store from = child, to = parent (schema convention).
 */
export async function addRelation(input: {
  a: string;
  b: string;
  kind: RelationKind;
  /** for 'parent': which of a/b is the child */
  childIsA?: boolean;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManage(profile)) return { ok: false, error: 'Only the treasurer and admins can edit the family tree.' };

  const { a, b, kind } = input;
  if (!a || !b) return { ok: false, error: 'Choose two different members.' };
  if (a === b) return { ok: false, error: 'A member cannot be related to themselves.' };

  let from = a, to = b;
  if (kind === 'parent') {
    from = input.childIsA ? a : b;
    to = input.childIsA ? b : a;
  } else {
    // canonical order for symmetric kinds (matches DB CHECK + unique index)
    [from, to] = a < b ? [a, b] : [b, a];
  }

  const supabase = await createClient();
  const { error } = await supabase.from('family_relations').insert({
    from_member: from,
    to_member: to,
    kind,
    created_by: profile.id,
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That relation already exists.' };
    return { ok: false, error: 'Could not save the relation (permission or validation).' };
  }
  revalidatePath('/tree');
  updateTag('tree');
  return { ok: true };
}

export async function deleteRelation(id: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!canManage(profile)) return { ok: false, error: 'Only the treasurer and admins can edit the family tree.' };
  const supabase = await createClient();
  const { error } = await supabase.from('family_relations').delete().eq('id', id);
  if (error) return { ok: false, error: 'Could not remove the relation.' };
  revalidatePath('/tree');
  updateTag('tree');
  return { ok: true };
}
