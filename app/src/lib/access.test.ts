// Unit tests for the access-control Phase 2 pure helpers (src/lib/access.ts).
// Run with: npm test   (mirrors SQL membership_role_level from migration 0014)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_ROLE_LEVEL,
  grantableRoles,
  canManageMemberships,
  sortUnits,
} from './access';

test('role ladder matches migration 0014 exactly', () => {
  assert.deepEqual(MEMBERSHIP_ROLE_LEVEL, {
    viewer: 1, contributor: 2, editor: 3, reviewer: 4,
    treasurer: 5, coordinator: 6, administrator: 7,
  });
});

test('grantableRoles never includes a role above your own', () => {
  const roles = grantableRoles(MEMBERSHIP_ROLE_LEVEL.editor);
  assert.ok(roles.includes('viewer') && roles.includes('editor'));
  assert.ok(!roles.includes('reviewer') && !roles.includes('administrator'));
});

test('a viewer may only hand out viewer', () => {
  assert.deepEqual(grantableRoles(1), ['viewer']);
});

test('canManageMemberships requires ACTIVE coordinator+ status', () => {
  assert.equal(canManageMemberships('coordinator', 'active'), true);
  assert.equal(canManageMemberships('administrator', 'active'), true);
  assert.equal(canManageMemberships('coordinator', 'suspended'), false); // revocation cuts authority
  assert.equal(canManageMemberships('coordinator', 'revoked'), false);
  assert.equal(canManageMemberships('coordinator', 'invited'), false);
  assert.equal(canManageMemberships('editor', 'active'), false); // UI hides manage below coordinator
  assert.equal(canManageMemberships(null, null), false);
});

test('sortUnits puts family-wide first, then branches, then groups alphabetically', () => {
  const units = [
    { scope: 'branch', kind: 'group', name: 'Zebra Committee' },
    { scope: 'family', kind: 'group', name: 'Shared Family' },
    { scope: 'branch', kind: 'branch', name: 'Patel side' },
    { scope: 'branch', kind: 'branch', name: 'Ahmed side' },
  ];
  assert.deepEqual(sortUnits(units).map((u) => u.name), [
    'Shared Family', 'Ahmed side', 'Patel side', 'Zebra Committee',
  ]);
});
