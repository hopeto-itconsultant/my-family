// Unit tests for the pure tree builder — run with: npm test (node --test via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTree, sortByName } from './tree';
import type { FamilyRelation } from './types';

const names = new Map([
  ['gp', 'Grandpa'],
  ['gm', 'Grandma'],
  ['dad', 'Dad'],
  ['aunt', 'Aunt'],
  ['me', 'Me'],
  ['sis', 'Sister'],
  ['cousin', 'Cousin'],
  ['lonely', 'Lonely Uncle'],
]);

const rel = (from_member: string, to_member: string, kind: FamilyRelation['kind']): FamilyRelation => ({
  id: `${kind}:${from_member}:${to_member}`,
  from_member,
  to_member,
  kind,
});

test('empty input yields empty model', () => {
  const t = buildTree([], new Map());
  assert.deepEqual(t.generations, []);
  assert.deepEqual(t.unconnected, []);
  assert.equal(t.hasCycle, false);
});

test('parent edges layer generations oldest-first', () => {
  // Convention: kind 'parent' rows are stored child-first (from = child, to = parent).
  const t = buildTree(
    [rel('me', 'dad', 'parent'), rel('dad', 'gp', 'parent')],
    names,
  );
  assert.equal(t.nodes.get('gp')!.gen, 0);
  assert.equal(t.nodes.get('dad')!.gen, 1);
  assert.equal(t.nodes.get('me')!.gen, 2);
  assert.equal(t.generations.length, 3);
});

test('spouses share one generation row', () => {
  const t = buildTree(
    [rel('gm', 'gp', 'spouse'), rel('dad', 'gp', 'parent')],
    names,
  );
  assert.equal(t.nodes.get('gp')!.gen, 0);
  assert.equal(t.nodes.get('gm')!.gen, 0);
  assert.deepEqual(t.generations[0], ['gm', 'gp']); // sorted by name
});

test('siblings land in the same generation and dedupe symmetric edges', () => {
  const edges = [
    rel('me', 'dad', 'parent'),
    rel('sis', 'dad', 'parent'),
    rel('sis', 'me', 'sibling'), // reversed order on purpose
    rel('me', 'sis', 'sibling'), // duplicate of the above
  ];
  const t = buildTree(edges, names);
  assert.equal(t.nodes.get('me')!.gen, t.nodes.get('sis')!.gen);
  assert.deepEqual(t.nodes.get('me')!.siblingIds, ['sis']);
  assert.deepEqual(t.nodes.get('sis')!.siblingIds, ['me']);
});

test('cycle is detected conservatively instead of hanging', () => {
  // dad is my parent, and (wrongly) I am recorded as dad's parent too.
  const t = buildTree(
    [rel('me', 'dad', 'parent'), rel('dad', 'me', 'parent')],
    names,
  );
  assert.equal(t.hasCycle, true);
  // Must still terminate with sane generations:
  for (const n of t.nodes.values()) assert.ok(n.gen >= 0 && Number.isFinite(n.gen));
});

test('unconnected members simply have no edges (directory still shows them)', () => {
  const t = buildTree(
    [rel('me', 'dad', 'parent'), rel('cousin', 'aunt', 'spouse')],
    names,
  );
  // lonely has no edges at all -> not even a node; that is fine (directory shows them).
  assert.ok(!t.nodes.has('lonely'));
  assert.ok(t.nodes.has('cousin'));
});

test('duplicate parent edges collapse', () => {
  const t = buildTree(
    [rel('me', 'dad', 'parent'), rel('me', 'dad', 'parent')],
    names,
  );
  assert.deepEqual(t.nodes.get('me')!.parentIds, ['dad']);
});

test('sortByName is locale-aware (Alice < bob < carol)', () => {
  const ids = ['b', 'a', 'C'];
  const m = new Map([['a', 'Alice'], ['b', 'bob'], ['C', 'carol']]);
  assert.deepEqual(sortByName(ids, m), ['a', 'b', 'C']);
});
