// Pure family-tree builder: turns relation rows into a generation-layered view.
// Unit-tested in src/lib/tree.test.ts. No React, no Supabase — easy to reason about.

import type { FamilyRelation } from '@/lib/types';

export interface TreeNode {
  id: string;
  /** ids of parents (people one generation ABOVE this node) */
  parentIds: string[];
  spouseIds: string[];
  siblingIds: string[];
  /** assigned generation, 0 = earliest ancestors present in data */
  gen: number;
}

export interface TreeModel {
  nodes: Map<string, TreeNode>;
  /** generation index -> ordered member ids (sorted by name via orderNames) */
  generations: string[][];
  /** members with no relations at all (shown separately, never hidden) */
  unconnected: string[];
  /** true if a parent-cycle was detected and some edges were dropped */
  hasCycle: boolean;
}

/**
 * @param relations rows from family_relations (kind 'parent': from = child, to = parent)
 * @param names     id -> display name, used for deterministic ordering
 */
export function buildTree(
  relations: FamilyRelation[],
  names: Map<string, string>,
): TreeModel {
  const nodes = new Map<string, TreeNode>();
  const node = (id: string): TreeNode => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, parentIds: [], spouseIds: [], siblingIds: [], gen: 0 };
      nodes.set(id, n);
    }
    return n;
  };

  const seen = new Set<string>(); // dedupe canonicalised edges
  let hasCycle = false;

  for (const r of relations) {
    if (r.kind === 'parent') {
      // Normalise: from = child, to = parent (per schema convention).
      const key = `P:${r.from_member}>${r.to_member}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const child = node(r.from_member);
      const parent = node(r.to_member);
      if (!child.parentIds.includes(r.to_member)) child.parentIds.push(r.to_member);
    } else {
      const lo = r.from_member < r.to_member ? r.from_member : r.to_member;
      const hi = r.from_member < r.to_member ? r.to_member : r.from_member;
      const key = `${r.kind}:${lo}-${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = node(lo);
      const b = node(hi);
      if (r.kind === 'spouse') {
        if (!a.spouseIds.includes(hi)) a.spouseIds.push(hi);
        if (!b.spouseIds.includes(lo)) b.spouseIds.push(lo);
      } else {
        if (!a.siblingIds.includes(hi)) a.siblingIds.push(hi);
        if (!b.siblingIds.includes(lo)) b.siblingIds.push(lo);
      }
    }
  }

  // --- Assign generations: longest-path-from-roots, with cycle protection ---
  const genCache = new Map<string, number>();
  const visiting = new Set<string>();

  const genOf = (id: string): number => {
    const cached = genCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) {
      hasCycle = true;
      return 0; // break the cycle conservatively
    }
    visiting.add(id);
    const n = nodes.get(id)!;
    let g = 0;
    if (n.parentIds.length > 0) {
      g = Math.max(...n.parentIds.map((p) => genOf(p) + 1));
    }
    visiting.delete(id);
    genCache.set(id, g);
    n.gen = g;
    return g;
  };
  for (const id of nodes.keys()) genOf(id);

  // Spouses share the higher generation of the pair (keeps couples on one row).
  for (const n of nodes.values()) {
    for (const s of n.spouseIds) {
      const other = nodes.get(s)!;
      const top = Math.max(n.gen, other.gen);
      n.gen = top;
      other.gen = top;
      genCache.set(n.id, top);
      genCache.set(other.id, top);
    }
  }

  // Siblings must match the max generation of their shared-parent group too;
  // re-run once to stabilise (data at family scale converges immediately).
  for (const n of nodes.values()) {
    for (const s of n.siblingIds) {
      const other = nodes.get(s)!;
      const top = Math.max(n.gen, other.gen);
      n.gen = top;
      other.gen = top;
    }
  }

  // --- Bucket into generations ---
  const maxGen = Math.max(-1, ...[...nodes.values()].map((n) => n.gen));
  const buckets: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  const connected = new Set<string>();
  for (const n of nodes.values()) {
    const related =
      n.parentIds.length + n.spouseIds.length + n.siblingIds.length > 0;
    if (related) connected.add(n.id);
    buckets[n.gen].push(n.id);
  }
  const byName = (a: string, b: string) =>
    (names.get(a) ?? '').localeCompare(names.get(b) ?? '');
  for (const bucket of buckets) bucket.sort(byName);

  const unconnected = [...nodes.keys()]
    .filter((id) => !connected.has(id))
    .sort(byName);

  return { nodes, generations: buckets, unconnected, hasCycle };
}

/** Sort helper: deterministic name ordering used by the tree view. */
export function sortByName(ids: string[], names: Map<string, string>): string[] {
  return [...ids].sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''));
}
