// Shared domain types — mirror of the Postgres schema (supabase/migrations).
export type FamilyRole = 'member' | 'coordinator' | 'treasurer' | 'admin';

export interface Branch {
  id: string;
  name: string;
  order_hint: number;
}

export interface Profile {
  id: string;
  full_name: string;
  branch_id: string | null;
  role: FamilyRole;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileWithBranch extends Profile {
  branches: { id: string; name: string } | null;
}

export type RelationKind = 'parent' | 'spouse' | 'sibling';

/** Row of public.family_relations. For kind='parent': from = child, to = parent. */
export interface FamilyRelation {
  id: string;
  from_member: string;
  to_member: string;
  kind: RelationKind;
}

export type EventKind = 'birthday' | 'anniversary' | 'meetup';

/** Row of public.events (with joined names resolved client-side). */
export interface FamilyEvent {
  id: string;
  kind: EventKind;
  title: string;
  occurs_on: string; // ISO date (YYYY-MM-DD)
  member_id: string | null;
  branch_id: string | null;
  venue: string | null;
  notes: string | null;
}

export const ROLE_LABELS: Record<FamilyRole, string> = {
  member: 'Member',
  coordinator: 'Coordinator',
  treasurer: 'Treasurer',
  admin: 'Admin',
};

export function isLeader(role: FamilyRole): boolean {
  return role === 'coordinator' || role === 'treasurer' || role === 'admin';
}

export function isFinanceRole(role: FamilyRole): boolean {
  return role === 'treasurer' || role === 'admin';
}
