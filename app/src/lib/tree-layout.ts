// Positions a family tree for the visual canvas.
// Generations run top to bottom. Spouses share a row. Siblings sit together.
// Disconnected families stack vertically. People with no edges are "unlinked"
// and are not given a card on the canvas.

import type { FamilyRelation, RelationKind } from '@/lib/types';

export const CARD_W = 156;
export const CARD_H = 64;
export const SPOUSE_GAP = 22;
export const SIBLING_GAP = 16;
export const FAMILY_GAP = 48;
export const ROW_GAP = 120;
export const COMPONENT_GAP = 56;
export const CANVAS_PAD = 28;

export interface LayoutPerson {
  id: string;
  name: string;
}

/** Directory row passed to the canvas. Layout itself only reads id and name. */
export interface TreePerson extends LayoutPerson {
  branch: string | null;
  nicknames: string[];
  deceased: boolean;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  generation: number;
  component: number;
}

/** Parent links point parent -> child. Spouse and sibling links are undirected. */
export interface LayoutLink {
  relationId: string;
  kind: RelationKind;
  fromId: string;
  toId: string;
}

export interface LayoutComponent {
  index: number;
  top: number;
  bottom: number;
  title: string;
}

export interface FamilyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  unlinked: string[];
  components: LayoutComponent[];
  width: number;
  height: number;
  hasCycle: boolean;
}

interface Household {
  id: string;
  members: string[];
  gen: number;
  component: number;
  parentHH: string | null;
  childHHs: string[];
  width: number;
  left: number;
}

export function layoutFamilyTree(
  people: LayoutPerson[],
  relations: FamilyRelation[],
): FamilyLayout {
  const nameOf = new Map<string, string>();
  for (const p of people) nameOf.set(p.id, p.name);
  const byName = (a: string, b: string) =>
    (nameOf.get(a) ?? a).localeCompare(nameOf.get(b) ?? b);

  const parentsOf = new Map<string, string[]>();
  const spouseAdj = new Map<string, Set<string>>();
  const siblingAdj = new Map<string, Set<string>>();
  const links: LayoutLink[] = [];
  const linked = new Set<string>();
  const seen = new Set<string>();

  const touch = (id: string) => {
    if (!parentsOf.has(id)) parentsOf.set(id, []);
    if (!spouseAdj.has(id)) spouseAdj.set(id, new Set());
    if (!siblingAdj.has(id)) siblingAdj.set(id, new Set());
    if (!nameOf.has(id)) nameOf.set(id, 'Family member');
  };

  for (const r of relations) {
    if (!r.from_member || !r.to_member || r.from_member === r.to_member) continue;
    if (r.kind !== 'parent' && r.kind !== 'spouse' && r.kind !== 'sibling') continue;
    touch(r.from_member);
    touch(r.to_member);
    if (r.kind === 'parent') {
      const key = `P:${r.from_member}>${r.to_member}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parents = parentsOf.get(r.from_member)!;
      if (!parents.includes(r.to_member)) parents.push(r.to_member);
      links.push({
        relationId: r.id,
        kind: 'parent',
        fromId: r.to_member,
        toId: r.from_member,
      });
    } else {
      const lo = r.from_member < r.to_member ? r.from_member : r.to_member;
      const hi = r.from_member < r.to_member ? r.to_member : r.from_member;
      const key = `${r.kind}:${lo}-${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const adj = r.kind === 'spouse' ? spouseAdj : siblingAdj;
      adj.get(lo)!.add(hi);
      adj.get(hi)!.add(lo);
      links.push({ relationId: r.id, kind: r.kind, fromId: lo, toId: hi });
    }
    linked.add(r.from_member);
    linked.add(r.to_member);
  }

  const unlinked = people
    .map((p) => p.id)
    .filter((id) => !linked.has(id))
    .sort(byName);

  const ids = [...linked];
  if (ids.length === 0) {
    return {
      nodes: [],
      links: [],
      unlinked,
      components: [],
      width: 0,
      height: 0,
      hasCycle: false,
    };
  }

  const compOf = componentsOf(ids, parentsOf, spouseAdj, siblingAdj);
  const { gen, hasCycle } = assignGenerations(ids, parentsOf, spouseAdj, siblingAdj);
  const households = buildHouseholds(ids, gen, compOf, spouseAdj, nameOf);
  attachParents(households, parentsOf, siblingAdj, nameOf);
  const compIndexes = [...new Set(ids.map((id) => compOf.get(id) ?? 0))];
  compIndexes.sort((a, b) => {
    const na = ids.filter((id) => compOf.get(id) === a).sort(byName)[0] ?? '';
    const nb = ids.filter((id) => compOf.get(id) === b).sort(byName)[0] ?? '';
    return byName(na, nb);
  });

  const labeled = compIndexes.length > 1;
  const nodes: LayoutNode[] = [];
  const components: LayoutComponent[] = [];
  let cursorY = 0;
  let width = 0;

  compIndexes.forEach((comp, index) => {
    const placed = placeComponent({
      comp,
      index,
      originY: cursorY,
      labeled,
      households,
      gen,
      nameOf,
      siblingAdj,
    });
    nodes.push(...placed.nodes);
    components.push({
      index,
      top: cursorY,
      bottom: cursorY + placed.height,
      title: placed.title,
    });
    width = Math.max(width, placed.width);
    cursorY += placed.height;
    if (index < compIndexes.length - 1) cursorY += COMPONENT_GAP;
  });

  if (hasCycle) separateOverlaps(nodes);
  let maxRight = CANVAS_PAD;
  let maxBottom = CANVAS_PAD;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.w + CANVAS_PAD);
    maxBottom = Math.max(maxBottom, n.y + n.h + CANVAS_PAD);
  }

  return {
    nodes,
    links,
    unlinked,
    components,
    width: nodes.length ? maxRight : 0,
    height: nodes.length ? Math.max(maxBottom, cursorY) : 0,
    hasCycle,
  };
}

function componentsOf(
  ids: string[],
  parentsOf: Map<string, string[]>,
  spouseAdj: Map<string, Set<string>>,
  siblingAdj: Map<string, Set<string>>,
): Map<string, number> {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) {
    for (const p of parentsOf.get(id) ?? []) union(id, p);
    for (const s of spouseAdj.get(id) ?? []) union(id, s);
    for (const s of siblingAdj.get(id) ?? []) union(id, s);
  }
  const rootToIndex = new Map<string, number>();
  const out = new Map<string, number>();
  for (const id of ids) {
    const root = find(id);
    let index = rootToIndex.get(root);
    if (index === undefined) {
      index = rootToIndex.size;
      rootToIndex.set(root, index);
    }
    out.set(id, index);
  }
  return out;
}

function assignGenerations(
  ids: string[],
  parentsOf: Map<string, string[]>,
  spouseAdj: Map<string, Set<string>>,
  siblingAdj: Map<string, Set<string>>,
): { gen: Map<string, number>; hasCycle: boolean } {
  const gen = new Map<string, number>();
  let hasCycle = false;
  const visiting = new Set<string>();
  const done = new Set<string>();

  const genOf = (id: string): number => {
    if (done.has(id)) return gen.get(id) ?? 0;
    if (visiting.has(id)) {
      hasCycle = true;
      return 0;
    }
    visiting.add(id);
    let g = 0;
    for (const p of parentsOf.get(id) ?? []) g = Math.max(g, genOf(p) + 1);
    visiting.delete(id);
    done.add(id);
    gen.set(id, g);
    return g;
  };
  for (const id of ids) genOf(id);

  if (hasCycle) return { gen, hasCycle };

  const limit = Math.max(ids.length, 1);
  const groups = (adj: Map<string, Set<string>>): string[][] => {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const stack = [id];
      const group: string[] = [];
      seen.add(id);
      while (stack.length) {
        const cur = stack.pop()!;
        group.push(cur);
        for (const next of adj.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      if (group.length > 1) out.push(group);
    }
    return out;
  };

  const spouseGroups = groups(spouseAdj);
  const siblingGroups = groups(siblingAdj);

  for (let round = 0; round < limit; round++) {
    let changed = false;
    const bump = (group: string[]) => {
      const max = Math.max(...group.map((id) => gen.get(id) ?? 0));
      if (max > limit) {
        hasCycle = true;
        return;
      }
      for (const id of group) {
        if ((gen.get(id) ?? 0) !== max) {
          gen.set(id, max);
          changed = true;
        }
      }
    };
    for (const group of spouseGroups) bump(group);
    if (hasCycle) break;
    for (const group of siblingGroups) bump(group);
    if (hasCycle) break;

    let guard = 0;
    let progressed = true;
    while (progressed && guard++ <= limit) {
      progressed = false;
      for (const id of ids) {
        for (const p of parentsOf.get(id) ?? []) {
          const need = (gen.get(p) ?? 0) + 1;
          if ((gen.get(id) ?? 0) < need) {
            if (need > limit) {
              hasCycle = true;
              progressed = false;
              break;
            }
            gen.set(id, need);
            progressed = true;
            changed = true;
          }
        }
        if (hasCycle) break;
      }
    }
    if (hasCycle || !changed) break;
    if (round === limit - 1) hasCycle = true;
  }

  if (!hasCycle) return { gen, hasCycle };

  // A spouse/sibling constraint fought a parent edge. Fall back to parent depth
  // so the canvas still draws instead of walking generations forever.
  const fallback = new Map<string, number>();
  const visiting2 = new Set<string>();
  const done2 = new Set<string>();
  const again = (id: string): number => {
    if (done2.has(id)) return fallback.get(id) ?? 0;
    if (visiting2.has(id)) return 0;
    visiting2.add(id);
    let g = 0;
    for (const p of parentsOf.get(id) ?? []) g = Math.max(g, again(p) + 1);
    visiting2.delete(id);
    done2.add(id);
    fallback.set(id, g);
    return g;
  };
  for (const id of ids) again(id);
  return { gen: fallback, hasCycle: true };
}

function buildHouseholds(
  ids: string[],
  gen: Map<string, number>,
  compOf: Map<string, number>,
  spouseAdj: Map<string, Set<string>>,
  nameOf: Map<string, string>,
): Map<string, Household> {
  const byName = (a: string, b: string) =>
    (nameOf.get(a) ?? a).localeCompare(nameOf.get(b) ?? b);
  const keyOf = (id: string) => `${compOf.get(id) ?? 0}:${gen.get(id) ?? 0}`;
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (keyOf(a) !== keyOf(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) {
    for (const s of spouseAdj.get(id) ?? []) {
      if (ids.includes(s)) union(id, s);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root);
    if (list) list.push(id);
    else groups.set(root, [id]);
  }

  const households = new Map<string, Household>();
  let n = 0;
  for (const members of groups.values()) {
    const ordered = orderSpouses(members, spouseAdj, byName);
    const id = `h${n++}`;
    households.set(id, {
      id,
      members: ordered,
      gen: gen.get(ordered[0]) ?? 0,
      component: compOf.get(ordered[0]) ?? 0,
      parentHH: null,
      childHHs: [],
      width: 0,
      left: 0,
    });
  }
  return households;
}

function orderSpouses(
  ids: string[],
  spouseAdj: Map<string, Set<string>>,
  byName: (a: string, b: string) => number,
): string[] {
  if (ids.length <= 2) return [...ids].sort(byName);
  const inGroup = new Set(ids);
  const neighbors = (id: string) =>
    [...(spouseAdj.get(id) ?? [])].filter((s) => inGroup.has(s));
  const endpoints = ids.filter((id) => neighbors(id).length <= 1).sort(byName);
  let cur = endpoints[0] ?? [...ids].sort(byName)[0];
  const ordered: string[] = [];
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    ordered.push(cur);
    seen.add(cur);
    cur = neighbors(cur).find((s) => !seen.has(s)) ?? '';
  }
  for (const id of [...ids].sort(byName)) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

function attachParents(
  households: Map<string, Household>,
  parentsOf: Map<string, string[]>,
  siblingAdj: Map<string, Set<string>>,
  nameOf: Map<string, string>,
) {
  const hhOf = new Map<string, Household>();
  for (const hh of households.values()) {
    for (const id of hh.members) hhOf.set(id, hh);
  }
  const label = (hh: Household) =>
    [...hh.members].map((id) => nameOf.get(id) ?? id).sort()[0] ?? hh.id;

  const choose = (votes: Map<string, number>): string | null => {
    let best: string | null = null;
    let bestN = 0;
    for (const [id, n] of votes) {
      if (!households.has(id)) continue;
      if (
        n > bestN ||
        (n === bestN && best && label(households.get(id)!) < label(households.get(best)!))
      ) {
        best = id;
        bestN = n;
      }
    }
    return best;
  };

  for (const hh of households.values()) {
    const votes = new Map<string, number>();
    for (const member of hh.members) {
      for (const parentId of parentsOf.get(member) ?? []) {
        const parentHH = hhOf.get(parentId);
        if (!parentHH || parentHH.id === hh.id) continue;
        if (parentHH.component !== hh.component) continue;
        votes.set(parentHH.id, (votes.get(parentHH.id) ?? 0) + 1);
      }
    }
    hh.parentHH = choose(votes);
  }

  // A sibling who was never given a parent edge still sits with the sibling
  // who was, as long as that does not pull them onto the parent's own row.
  for (const hh of households.values()) {
    if (hh.parentHH) continue;
    const votes = new Map<string, number>();
    for (const member of hh.members) {
      for (const sib of siblingAdj.get(member) ?? []) {
        const sibHH = hhOf.get(sib);
        if (!sibHH || sibHH.id === hh.id || !sibHH.parentHH) continue;
        if (sibHH.gen !== hh.gen) continue;
        if (sibHH.component !== hh.component) continue;
        votes.set(sibHH.parentHH, (votes.get(sibHH.parentHH) ?? 0) + 1);
      }
    }
    const attach = choose(votes);
    if (attach && attach !== hh.id) hh.parentHH = attach;
  }

  const state = new Map<string, 0 | 1 | 2>();
  const dfs = (id: string) => {
    const st = state.get(id) ?? 0;
    if (st === 2) return;
    if (st === 1) return;
    state.set(id, 1);
    const hh = households.get(id)!;
    const parentId = hh.parentHH;
    if (parentId && households.has(parentId)) {
      if (state.get(parentId) === 1) hh.parentHH = null;
      else dfs(parentId);
    }
    state.set(id, 2);
  };
  for (const hh of households.values()) dfs(hh.id);

  for (const hh of households.values()) hh.childHHs = [];
  for (const hh of households.values()) {
    if (!hh.parentHH) continue;
    const parent = households.get(hh.parentHH);
    if (!parent || parent.id === hh.id) {
      hh.parentHH = null;
      continue;
    }
    parent.childHHs.push(hh.id);
  }

  const childKey = (id: string) => {
    const hh = households.get(id)!;
    const names = hh.members
      .filter((member) => {
        const votes = parentsOf.get(member) ?? [];
        return votes.some((p) => hhOf.get(p)?.id === hh.parentHH);
      })
      .map((member) => nameOf.get(member) ?? member)
      .sort();
    if (names.length) return names[0];
    return [...hh.members].map((member) => nameOf.get(member) ?? member).sort()[0] ?? id;
  };
  for (const hh of households.values()) {
    hh.childHHs.sort((a, b) => childKey(a).localeCompare(childKey(b)) || a.localeCompare(b));
  }
}

function cardsWidth(hh: Household): number {
  const n = hh.members.length;
  return n * CARD_W + Math.max(0, n - 1) * SPOUSE_GAP;
}

function placeComponent(input: {
  comp: number;
  index: number;
  originY: number;
  labeled: boolean;
  households: Map<string, Household>;
  gen: Map<string, number>;
  nameOf: Map<string, string>;
  siblingAdj: Map<string, Set<string>>;
}): { nodes: LayoutNode[]; width: number; height: number; title: string } {
  const { comp, index, originY, labeled, households, nameOf, siblingAdj } = input;
  const list = [...households.values()].filter((hh) => hh.component === comp);
  if (list.length === 0) return { nodes: [], width: 0, height: 0, title: 'Family' };

  const byId = new Map(list.map((hh) => [hh.id, hh]));
  const measure = (hh: Household, stack: Set<string>): number => {
    if (stack.has(hh.id)) return cardsWidth(hh);
    stack.add(hh.id);
    let inner = 0;
    hh.childHHs.forEach((childId, i) => {
      const child = byId.get(childId);
      if (!child) return;
      inner += measure(child, stack);
      if (i > 0) inner += SIBLING_GAP;
    });
    stack.delete(hh.id);
    hh.width = Math.max(cardsWidth(hh), inner);
    return hh.width;
  };

  const place = (hh: Household, left: number, stack: Set<string>) => {
    if (stack.has(hh.id)) return;
    stack.add(hh.id);
    hh.left = left;
    const kids = hh.childHHs.map((id) => byId.get(id)).filter((k): k is Household => Boolean(k));
    if (kids.length) {
      const inner =
        kids.reduce((sum, k) => sum + k.width, 0) + SIBLING_GAP * Math.max(0, kids.length - 1);
      let x = left + (hh.width - inner) / 2;
      for (const kid of kids) {
        place(kid, x, stack);
        x += kid.width + SIBLING_GAP;
      }
    }
    stack.delete(hh.id);
  };

  const roots = list.filter((hh) => !hh.parentHH || !byId.has(hh.parentHH));
  for (const hh of roots) measure(hh, new Set());

  const sibRoot = siblingComponent(list.flatMap((hh) => hh.members), siblingAdj);
  const rootParent = new Map(roots.map((hh) => [hh.id, hh.id]));
  const findRoot = (x: string): string => {
    const p = rootParent.get(x) ?? x;
    if (p === x) return x;
    const r = findRoot(p);
    rootParent.set(x, r);
    return r;
  };
  const unionRoot = (a: string, b: string) => {
    const ra = findRoot(a);
    const rb = findRoot(b);
    if (ra !== rb) rootParent.set(ra, rb);
  };
  const shareSibling = (a: Household, b: Household) => {
    for (const m of a.members) {
      for (const n of b.members) {
        const cm = sibRoot.get(m);
        if (cm && cm === sibRoot.get(n) && m !== n) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      if (shareSibling(roots[i], roots[j])) unionRoot(roots[i].id, roots[j].id);
    }
  }
  const clusters = new Map<string, Household[]>();
  for (const root of roots) {
    const key = findRoot(root.id);
    const arr = clusters.get(key);
    if (arr) arr.push(root);
    else clusters.set(key, [root]);
  }
  const hhName = (hh: Household) =>
    [...hh.members].map((id) => nameOf.get(id) ?? id).sort()[0] ?? hh.id;
  const orderedClusters = [...clusters.values()]
    .map((group) => group.sort((a, b) => hhName(a).localeCompare(hhName(b))))
    .sort((a, b) => hhName(a[0]).localeCompare(hhName(b[0])));

  let x = CANVAS_PAD;
  let prevCluster: Household[] | null = null;
  for (const cluster of orderedClusters) {
    for (const root of cluster) {
      if (prevCluster) x += prevCluster === cluster ? SIBLING_GAP : FAMILY_GAP;
      place(root, x, new Set());
      x += root.width;
      prevCluster = cluster;
    }
  }
  const width = Math.max(x + CANVAS_PAD, CANVAS_PAD * 2 + CARD_W);

  const gens = list.map((hh) => hh.gen);
  const minGen = Math.min(...gens);
  const maxGen = Math.max(...gens);
  const topPad = CANVAS_PAD + (labeled ? 22 : 0);
  const height = topPad + (maxGen - minGen) * ROW_GAP + CARD_H + CANVAS_PAD;

  const nodes: LayoutNode[] = [];
  for (const hh of list) {
    const y = originY + topPad + (hh.gen - minGen) * ROW_GAP;
    const cw = cardsWidth(hh);
    let cx = hh.left + (hh.width - cw) / 2;
    for (const id of hh.members) {
      nodes.push({
        id,
        x: cx,
        y,
        w: CARD_W,
        h: CARD_H,
        generation: hh.gen,
        component: index,
      });
      cx += CARD_W + SPOUSE_GAP;
    }
  }

  const topHouseholds = list.filter((hh) => hh.gen === minGen);
  const titleNames = (topHouseholds.length ? topHouseholds : list)
    .flatMap((hh) => hh.members)
    .map((id) => nameOf.get(id) ?? id)
    .sort((a, b) => a.localeCompare(b));
  const title =
    titleNames.length <= 2
      ? titleNames.join(' & ') || 'Family'
      : `${titleNames[0]} & ${titleNames[1]}`;

  return { nodes, width, height, title };
}

function siblingComponent(ids: string[], siblingAdj: Map<string, Set<string>>): Map<string, string> {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const id of ids) {
    for (const sib of siblingAdj.get(id) ?? []) {
      if (!parent.has(sib)) continue;
      const ra = find(id);
      const rb = find(sib);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const out = new Map<string, string>();
  for (const id of ids) out.set(id, find(id));
  return out;
}

function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function separateOverlaps(nodes: LayoutNode[]) {
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (!overlaps(a, b)) continue;
        if (a.x <= b.x) b.x = a.x + a.w + SIBLING_GAP;
        else a.x = b.x + b.w + SIBLING_GAP;
        moved = true;
      }
    }
    if (!moved) break;
  }
}
