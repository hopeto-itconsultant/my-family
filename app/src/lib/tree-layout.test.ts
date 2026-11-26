import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { FamilyRelation } from './types';
import {
  CANVAS_PAD,
  CARD_H,
  CARD_W,
  COMPONENT_GAP,
  FAMILY_GAP,
  ROW_GAP,
  SIBLING_GAP,
  SPOUSE_GAP,
  layoutFamilyTree,
  type LayoutNode,
} from './tree-layout';
import { SAMPLE_PEOPLE, SAMPLE_RELATIONS } from './tree-sample';

const rel = (
  from_member: string,
  to_member: string,
  kind: FamilyRelation['kind'],
): FamilyRelation => ({
  id: `${kind}:${from_member}:${to_member}`,
  from_member,
  to_member,
  kind,
});

const people = (...names: string[]) => names.map((name) => ({ id: name, name }));

function node(layout: { nodes: LayoutNode[] }, id: string): LayoutNode {
  const found = layout.nodes.find((n) => n.id === id);
  assert.ok(found, `missing node ${id}`);
  return found;
}

function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function assertNoOverlaps(nodes: LayoutNode[]) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.equal(
        overlaps(nodes[i], nodes[j]),
        false,
        `${nodes[i].id} overlaps ${nodes[j].id}`,
      );
    }
  }
}

test('no relations leaves everyone in the unlinked tray', () => {
  const layout = layoutFamilyTree(people('Ada', 'Bea'), []);
  assert.deepEqual(layout.nodes, []);
  assert.deepEqual(layout.unlinked, ['Ada', 'Bea']);
  assert.equal(layout.width, 0);
  assert.equal(layout.height, 0);
  assert.equal(layout.hasCycle, false);
});

test('parents sit above children and a couple shares one row', () => {
  const layout = layoutFamilyTree(
    people('dad', 'mom', 'me'),
    [rel('me', 'dad', 'parent'), rel('me', 'mom', 'parent'), rel('dad', 'mom', 'spouse')],
  );
  const dad = node(layout, 'dad');
  const mom = node(layout, 'mom');
  const me = node(layout, 'me');
  assert.equal(dad.y, mom.y);
  assert.ok(dad.x < mom.x);
  assert.equal(mom.x - (dad.x + dad.w), SPOUSE_GAP);
  assert.equal(me.y - dad.y, ROW_GAP);
  assert.ok(me.y >= dad.y + CARD_H);
  const mid = (n: LayoutNode) => n.x + n.w / 2;
  assert.equal(mid(me), (mid(dad) + mid(mom)) / 2);
  assertNoOverlaps(layout.nodes);
});

test('siblings are grouped under their parents', () => {
  const layout = layoutFamilyTree(
    people('dad', 'me', 'sis'),
    [
      rel('me', 'dad', 'parent'),
      rel('sis', 'dad', 'parent'),
      rel('me', 'sis', 'sibling'),
    ],
  );
  const me = node(layout, 'me');
  const sis = node(layout, 'sis');
  const dad = node(layout, 'dad');
  assert.equal(me.y, sis.y);
  assert.equal(me.generation, sis.generation);
  const left = me.x < sis.x ? me : sis;
  const right = me.x < sis.x ? sis : me;
  assert.equal(right.x - (left.x + left.w), SIBLING_GAP);
  const kidsMid = (Math.min(me.x, sis.x) + Math.max(me.x, sis.x) + CARD_W) / 2;
  assert.equal(kidsMid, dad.x + dad.w / 2);
  assert.ok(me.y > dad.y);
});

test('a parentless spouse joins their partner’s row', () => {
  const layout = layoutFamilyTree(
    people('gp', 'dad', 'mom'),
    [rel('dad', 'gp', 'parent'), rel('dad', 'mom', 'spouse')],
  );
  const dad = node(layout, 'dad');
  const mom = node(layout, 'mom');
  const gp = node(layout, 'gp');
  assert.equal(dad.y, mom.y);
  assert.ok(dad.y > gp.y);
  assert.equal(Math.abs(mom.x - dad.x), CARD_W + SPOUSE_GAP);
});

test('sibling-only people with no parents stay on one row together', () => {
  const layout = layoutFamilyTree(
    people('kai', 'lee', 'noa'),
    [rel('lee', 'kai', 'sibling'), rel('kai', 'noa', 'sibling')],
  );
  const ys = new Set(layout.nodes.map((n) => n.y));
  assert.equal(ys.size, 1);
  const xs = layout.nodes.map((n) => n.x).sort((a, b) => a - b);
  assert.equal(xs[1] - (xs[0] + CARD_W), SIBLING_GAP);
  assert.equal(xs[2] - (xs[1] + CARD_W), SIBLING_GAP);
  assert.equal(layout.components.length, 1);
});

test('a chain of three spouses stays adjacent on one row', () => {
  const layout = layoutFamilyTree(
    people('amy', 'ben', 'cleo'),
    [rel('amy', 'ben', 'spouse'), rel('ben', 'cleo', 'spouse')],
  );
  const ordered = [...layout.nodes].sort((a, b) => a.x - b.x);
  assert.deepEqual(
    ordered.map((n) => n.id),
    ['amy', 'ben', 'cleo'],
  );
  assert.equal(ordered[1].x - (ordered[0].x + ordered[0].w), SPOUSE_GAP);
  assert.equal(ordered[2].x - (ordered[1].x + ordered[1].w), SPOUSE_GAP);
  assert.equal(new Set(ordered.map((n) => n.y)).size, 1);
});

test('disconnected families stack and do not share cards', () => {
  const layout = layoutFamilyTree(
    people('ada', 'bea', 'cal', 'dee'),
    [rel('bea', 'ada', 'parent'), rel('dee', 'cal', 'spouse')],
  );
  assert.equal(layout.components.length, 2);
  const first = layout.nodes.filter((n) => n.component === 0);
  const second = layout.nodes.filter((n) => n.component === 1);
  const firstBottom = Math.max(...first.map((n) => n.y + n.h));
  const secondTop = Math.min(...second.map((n) => n.y));
  assert.ok(secondTop >= firstBottom + COMPONENT_GAP);
  assertNoOverlaps(layout.nodes);
  assert.ok(Math.abs(node(layout, 'dee').x - node(layout, 'cal').x) >= CARD_W);
  assert.equal(node(layout, 'dee').y, node(layout, 'cal').y);
});

test('people who never appear in a relation stay unlinked', () => {
  const layout = layoutFamilyTree(
    people('dad', 'me', 'lonely'),
    [rel('me', 'dad', 'parent')],
  );
  assert.deepEqual(layout.unlinked, ['lonely']);
  assert.equal(layout.nodes.some((n) => n.id === 'lonely'), false);
});

test('a parent cycle still produces a finite layout', () => {
  const layout = layoutFamilyTree(
    people('dad', 'me'),
    [rel('me', 'dad', 'parent'), rel('dad', 'me', 'parent')],
  );
  assert.equal(layout.hasCycle, true);
  assert.equal(layout.nodes.length, 2);
  for (const n of layout.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    assert.ok(n.x >= 0 && n.y >= 0);
  }
  assertNoOverlaps(layout.nodes);
});

test('duplicate edges do not stack extra cards', () => {
  const layout = layoutFamilyTree(
    people('dad', 'me'),
    [rel('me', 'dad', 'parent'), rel('me', 'dad', 'parent')],
  );
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.links.length, 1);
});

test('sample family lays out generations, a second family, and unlinked people', () => {
  const layout = layoutFamilyTree(SAMPLE_PEOPLE, SAMPLE_RELATIONS);
  assert.equal(layout.hasCycle, false);
  assert.equal(layout.components.length, 2);
  assert.deepEqual(layout.unlinked, ['nila', 'om', 'pooja']);
  assert.equal(layout.nodes.length, SAMPLE_PEOPLE.length - layout.unlinked.length);

  const arun = node(layout, 'arun');
  const bina = node(layout, 'bina');
  const chitra = node(layout, 'chitra');
  const deepak = node(layout, 'deepak');
  const esha = node(layout, 'esha');
  const gita = node(layout, 'gita');
  const ishan = node(layout, 'ishan');
  const jaya = node(layout, 'jaya');
  const kiran = node(layout, 'kiran');

  assert.equal(arun.y, bina.y);
  assert.equal(Math.abs(bina.x - arun.x), CARD_W + SPOUSE_GAP);
  assert.ok(chitra.y > arun.y);
  assert.equal(chitra.y, deepak.y);
  assert.equal(chitra.y, esha.y);
  assert.equal(gita.y, ishan.y);
  assert.ok(jaya.y > gita.y);
  assert.equal(jaya.y - arun.y, 3 * ROW_GAP);
  assert.ok(kiran.y > jaya.y);
  assertNoOverlaps(layout.nodes);

  for (const n of layout.nodes) {
    assert.ok(n.x >= CANVAS_PAD - 0.01);
    assert.equal(n.w, CARD_W);
    assert.equal(n.h, CARD_H);
  }
  // Root families inside one component are separated more widely than siblings.
  assert.ok(FAMILY_GAP > SIBLING_GAP);
});
