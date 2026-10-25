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

// ---- Phase 4: prayers & achievements --------------------------------------
export type PrayerStatus = 'active' | 'answered';

export interface PrayerRequest {
  id: string;
  member_id: string;
  branch_id: string | null;
  title: string;
  detail: string | null;
  is_private: boolean;
  status: PrayerStatus;
  answered_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnsweredPrayer extends PrayerRequest {
  prayer_count: number;
}

export interface Achievement {
  id: string;
  member_id: string;
  branch_id: string | null;
  kind: string; // education | career | faith | health | service | sport | other
  title: string;
  detail: string | null;
  achieved_on: string; // ISO date
  created_by: string;
  created_at: string;
}

// ---- Phase 5: history / photos / assets -------------------------------------
export type AssetKind = 'vehicle' | 'property' | 'jewellery' | 'electronics' | 'cash' | 'other';
export type AssetOwnerType = 'member' | 'branch' | 'family';

export interface HistoryEntry {
  id: string;
  title: string;
  era: string | null;
  story: string;
  event_date: string | null;
  created_by: string;
  created_at: string;
}

export interface PhotoMeta {
  id: string;
  storage_path: string;
  caption: string | null;
  taken_on: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface FamilyAsset {
  id: string;
  kind: AssetKind;
  name: string;
  owner_type: AssetOwnerType;
  owner_member_id: string | null;
  owner_branch_id: string | null;
  purchase_year: number | null;
  value_paise: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Phase 6/7: Mission Fund --------------------------------------------------
/** declared → pending_verification → verified | rejected ; reversed from verified. */
export type ContributionStatus =
  | 'declared'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'reversed';

export type PaymentMethod = 'upi' | 'bank_transfer' | 'cash' | 'other';

export interface Contribution {
  id: string;
  member_id: string;
  amount_paise: number;
  month_ref: string; // YYYY-MM (null for voluntary gifts)
  method: PaymentMethod;
  status: ContributionStatus;
  bank_ref: string | null;
  note: string | null;
  declared_at: string;
  verified_by: string | null;
  verified_at: string | null;
  reject_reason: string | null;
}

export type ExpenseStatus =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'reversed';

export interface Expense {
  id: string;
  title: string;
  purpose: string | null;
  amount_paise: number;
  requested_by: string;
  status: ExpenseStatus;
  approved_by: string | null;
  paid_at: string | null;
  receipt_path: string | null;
  bank_ref: string | null;
  reject_reason: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  detail: Record<string, unknown>;
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
