'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { blockViewAsWrite } from '@/lib/view-as-session';
import {
  canonicalizeRelation,
  isMemberId,
  treeEditRefusal,
} from '@/lib/tree-access';
import type { RelationKind } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

type Gate =
  | {
      ok: true;
      profileId: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; error: string };

/**
 * View-as is checked before the role so a preview of a treasurer still
 * refuses. RLS (is_steward + the view-as trigger) is the backstop.
 */
async function guardTreeEdit(): Promise<Gate> {
  const readOnly = await blockViewAsWrite();
  const profile = await requireProfile();
  const refusal = treeEditRefusal(profile.role, readOnly !== null);
  if (refusal) return { ok: false, error: refusal };
  return { ok: true, profileId: profile.id, supabase: await createClient() };
}

function refreshTree() {
  revalidatePath('/tree');
  updateTag('tree');
}

/**
 * Add a relation edge. For kind='parent' we store from = child, to = parent.
 */
export async function addRelation(input: {
  a: string;
  b: string;
  kind: RelationKind;
  /** for 'parent': which of a/b is the child */
  childIsA?: boolean;
}): Promise<ActionResult> {
  const gate = await guardTreeEdit();
  if (!gate.ok) return gate;

  const edge = canonicalizeRelation(input);
  if (!edge.ok) return edge;

  const { error, data } = await gate.supabase
    .from('family_relations')
    .insert({
      from_member: edge.from,
      to_member: edge.to,
      kind: edge.kind,
      created_by: gate.profileId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That relation already exists.' };
    return { ok: false, error: 'Could not save the relation (permission or validation).' };
  }
  refreshTree();
  return { ok: true, id: data.id };
}

export async function deleteRelation(id: string): Promise<ActionResult> {
  const gate = await guardTreeEdit();
  if (!gate.ok) return gate;
  if (!isMemberId(id)) return { ok: false, error: 'That relation was not found.' };
  const { error } = await gate.supabase.from('family_relations').delete().eq('id', id);
  if (error) return { ok: false, error: 'Could not remove the relation.' };
  refreshTree();
  return { ok: true, id };
}

/**
 * Replace one edge. If the new row is rejected, the previous edge is put back.
 */
export async function changeRelation(input: {
  id: string;
  a: string;
  b: string;
  kind: RelationKind;
  childIsA?: boolean;
}): Promise<ActionResult> {
  const gate = await guardTreeEdit();
  if (!gate.ok) return gate;
  if (!isMemberId(input.id)) return { ok: false, error: 'That relation was not found.' };
  const edge = canonicalizeRelation(input);
  if (!edge.ok) return edge;

  const { data: existing, error: readErr } = await gate.supabase
    .from('family_relations')
    .select('id, from_member, to_member, kind, created_by')
    .eq('id', input.id)
    .maybeSingle();
  if (readErr || !existing) return { ok: false, error: 'That relation was not found.' };
  if (
    existing.from_member === edge.from &&
    existing.to_member === edge.to &&
    existing.kind === edge.kind
  ) {
    return { ok: true, id: existing.id };
  }

  const { error: delErr } = await gate.supabase.from('family_relations').delete().eq('id', input.id);
  if (delErr) return { ok: false, error: 'Could not change the relation.' };

  const { data, error } = await gate.supabase
    .from('family_relations')
    .insert({
      from_member: edge.from,
      to_member: edge.to,
      kind: edge.kind,
      created_by: gate.profileId,
    })
    .select('id')
    .single();
  if (error || !data) {
    await gate.supabase.from('family_relations').insert({
      from_member: existing.from_member,
      to_member: existing.to_member,
      kind: existing.kind,
      created_by: existing.created_by,
    });
    if (error?.code === '23505') return { ok: false, error: 'That relation already exists.' };
    return { ok: false, error: 'Could not change the relation.' };
  }
  refreshTree();
  return { ok: true, id: data.id };
}
