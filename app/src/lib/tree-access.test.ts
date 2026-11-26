// Permission and canonical-edge checks for family-tree writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VIEW_AS_READ_ONLY } from './view-as-policy';
import {
  TREE_EDIT_FORBIDDEN,
  canonicalizeRelation,
  treeEditRefusal,
} from './tree-access';

const here = dirname(fileURLToPath(import.meta.url));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('members and unknown roles cannot edit the tree', () => {
  for (const role of ['member', 'coordinator', 'editor', '', null, undefined]) {
    assert.equal(treeEditRefusal(role, false), TREE_EDIT_FORBIDDEN);
  }
});

test('treasurer and admin can edit when they are not previewing a member', () => {
  assert.equal(treeEditRefusal('treasurer', false), null);
  assert.equal(treeEditRefusal('admin', false), null);
});

test('view-as blocks every role, including a steward preview', () => {
  for (const role of ['admin', 'treasurer', 'member', null]) {
    assert.equal(treeEditRefusal(role, true), VIEW_AS_READ_ONLY);
  }
});

test('parent edges are stored child-first and symmetric edges are ordered', () => {
  assert.deepEqual(canonicalizeRelation({ a: A, b: B, kind: 'parent', childIsA: true }), {
    ok: true,
    from: A,
    to: B,
    kind: 'parent',
  });
  assert.deepEqual(canonicalizeRelation({ a: A, b: B, kind: 'parent', childIsA: false }), {
    ok: true,
    from: B,
    to: A,
    kind: 'parent',
  });
  assert.deepEqual(canonicalizeRelation({ a: B, b: A, kind: 'spouse' }), {
    ok: true,
    from: A,
    to: B,
    kind: 'spouse',
  });
  assert.deepEqual(canonicalizeRelation({ a: B.toUpperCase(), b: A, kind: 'sibling' }), {
    ok: true,
    from: A,
    to: B,
    kind: 'sibling',
  });
});

test('relation input is rejected before it can reach the database', () => {
  assert.equal(canonicalizeRelation({ a: A, b: A, kind: 'spouse' }).ok, false);
  assert.equal(canonicalizeRelation({ a: '', b: B, kind: 'parent', childIsA: true }).ok, false);
  assert.equal(canonicalizeRelation({ a: 'not-a-person', b: B, kind: 'sibling' }).ok, false);
  assert.equal(canonicalizeRelation({ a: A, b: B, kind: 'cousin' }).ok, false);
  const self = canonicalizeRelation({ a: A, b: A, kind: 'parent', childIsA: true });
  assert.equal(self.ok, false);
  if (!self.ok) assert.match(self.error, /themselves/i);
});

test('tree actions ask the shared guard before every write', () => {
  const src = readFileSync(join(here, '../app/actions/tree.ts'), 'utf8');
  assert.match(src, /blockViewAsWrite/);
  assert.match(src, /treeEditRefusal/);
  for (const name of ['addRelation', 'deleteRelation', 'changeRelation']) {
    const start = src.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} should exist`);
    const next = src.indexOf('export async function', start + 10);
    const body = src.slice(start, next === -1 ? src.length : next);
    assert.match(body, /guardTreeEdit/, `${name} must refuse non-stewards and view-as`);
  }
});

test('database policies reject non-stewards and view-as writes on family_relations', () => {
  const steward = readFileSync(
    join(here, '../../../supabase/migrations/0015_merge_coordinator_into_treasurer.sql'),
    'utf8',
  );
  assert.match(steward, /function public\.is_steward\(\)/);
  assert.match(steward, /jwt_role\(\) in \('treasurer','admin'\)/);
  assert.match(steward, /create policy relations_leader_write on public\.family_relations/);
  assert.match(steward, /using \(public\.is_steward\(\)\)/);
  assert.match(steward, /with check \(public\.is_steward\(\)\)/);

  const viewAs = readFileSync(
    join(here, '../../../supabase/migrations/0019_view_as_member.sql'),
    'utf8',
  );
  assert.match(viewAs, /function public\.is_impersonating/);
  assert.match(viewAs, /'family_relations'/);
  assert.match(viewAs, /reject_view_as_write/);
  assert.match(viewAs, /Read-only while an admin is viewing as this member/);
});
