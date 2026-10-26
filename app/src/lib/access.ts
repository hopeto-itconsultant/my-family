// Access-control Phase 2 — pure helpers mirroring the SQL role ladder in
// migration 0014 (`membership_role_level`). Keep BOTH in sync; the SQL side
// is the enforcement point, this side only drives UI affordances.

export type UnitKind = 'branch' | 'group';
export type UnitScope = 'family' | 'branch' | 'selected_branches' | 'private';
export type UnitStatus = 'active' | 'archived';
export type MembershipRole =
  | 'administrator'
  | 'coordinator'
  | 'treasurer'
  | 'reviewer'
  | 'editor'
  | 'contributor'
  | 'viewer';
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';

/** Mirrors public.membership_role_level() exactly. */
export const MEMBERSHIP_ROLE_LEVEL: Record<MembershipRole, number> = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  reviewer: 4,
  treasurer: 5,
  coordinator: 6,
  administrator: 7,
};

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  administrator: 'Administrator',
  coordinator: 'Coordinator',
  treasurer: 'Treasurer',
  reviewer: 'Reviewer',
  editor: 'Editor',
  contributor: 'Contributor',
  viewer: 'Viewer',
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

/** Roles a grantor may hand out: up to their own level (never above). */
export function grantableRoles(myLevel: number): MembershipRole[] {
  return (Object.keys(MEMBERSHIP_ROLE_LEVEL) as MembershipRole[])
    .filter((r) => MEMBERSHIP_ROLE_LEVEL[r] <= myLevel)
    .sort((a, b) => MEMBERSHIP_ROLE_LEVEL[a] - MEMBERSHIP_ROLE_LEVEL[b]);
}

/** Can `myRole` manage memberships (grant/revoke/change status) of this unit?
 *  Mirrors can_grant_role_in_unit(): needs an ACTIVE membership whose level
 *  covers at least 'viewer' management rights — same predicate the RLS uses. */
export function canManageMemberships(myRole: MembershipRole | null, myStatus: MembershipStatus | null): boolean {
  if (myStatus !== 'active' || !myRole) return false;
  // Granting any role >= viewer requires level >= 1 AND the guard trigger also
  // demands your level >= granted role's level; managing statuses/removals is
  // gated by can_grant_role_in_unit(actor, unit, 'viewer') which means ANY
  // active membership could remove viewers — so we surface "manage" only from
  // coordinator upward in the UI; DB remains the real gate.
  return MEMBERSHIP_ROLE_LEVEL[myRole] >= MEMBERSHIP_ROLE_LEVEL.coordinator;
}

/** Sort units for the switcher: family-wide first, then branches, then groups. */
export function sortUnits<T extends { scope: UnitScope; kind: UnitKind; name: string }>(units: T[]): T[] {
  const rank = (u: T) => (u.scope === 'family' ? 0 : u.kind === 'branch' ? 1 : 2);
  return [...units].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
