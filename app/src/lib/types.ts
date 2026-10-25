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
