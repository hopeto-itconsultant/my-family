// Who may edit the family tree, and how a relation is stored.
// Pure: no cookies, no database. Server actions call these before any write.
// Postgres still enforces the same rules (is_steward() + the view-as trigger).

import type { RelationKind } from '@/lib/types';
import { VIEW_AS_READ_ONLY } from '@/lib/view-as-policy';

export const TREE_EDIT_FORBIDDEN =
  'Only the treasurer and admins can edit the family tree.';

/**
 * null when this person may write a relation. View-as wins over role so an
 * admin previewing a treasurer still gets the read-only message.
 * Steward roles match canManage() and public.is_steward() (treasurer | admin).
 */
export function treeEditRefusal(
  role: string | null | undefined,
  viewAsActive: boolean,
): string | null {
  if (viewAsActive) return VIEW_AS_READ_ONLY;
  if (role === 'admin' || role === 'treasurer') return null;
  return TREE_EDIT_FORBIDDEN;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMemberId(value: string): boolean {
  return UUID_RE.test(value);
}

export type CanonicalRelation =
  | { ok: true; from: string; to: string; kind: RelationKind }
  | { ok: false; error: string };

/**
 * Store a parent edge child-first, and a spouse/sibling edge in uuid order.
 * That matches the family_relations CHECK and unique index.
 */
export function canonicalizeRelation(input: {
  a: string;
  b: string;
  kind: string;
  /** When kind is parent, true means `a` is the child. */
  childIsA?: boolean;
}): CanonicalRelation {
  const a = input.a.trim().toLowerCase();
  const b = input.b.trim().toLowerCase();
  if (!isMemberId(a) || !isMemberId(b)) {
    return { ok: false, error: 'Choose two different members.' };
  }
  if (a === b) return { ok: false, error: 'A member cannot be related to themselves.' };
  if (input.kind !== 'parent' && input.kind !== 'spouse' && input.kind !== 'sibling') {
    return { ok: false, error: 'Choose parent, spouse, or sibling.' };
  }
  const kind = input.kind;
  if (kind === 'parent') {
    const childIsA = input.childIsA === true;
    return { ok: true, from: childIsA ? a : b, to: childIsA ? b : a, kind };
  }
  const [from, to] = a < b ? [a, b] : [b, a];
  return { ok: true, from, to, kind };
}
