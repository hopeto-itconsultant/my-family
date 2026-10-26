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
  birth_date?: string | null;       // 'YYYY-MM-DD' (migration 0009)
  anniversary_date?: string | null; // 'YYYY-MM-DD' (migration 0009)
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

// Treasurer records payments manually as either cash or UPI/online (0008).
export type PaymentMethod = 'cash' | 'upi_online';

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '💵 Cash',
  upi_online: '📱 UPI / Online',
};

export interface Contribution {
  id: string;
  member_id: string;
  amount_paise: number;
  month_ref: string | null; // YYYY-MM pledge period (null = voluntary gift)
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

// ---- Phase 8: bank reconciliation ------------------------------------------
export interface StatementBatch {
  id: string;
  label: string;
  imported_by: string;
  imported_at: string;
  row_count: number;
}

export interface StatementRowView {
  id: string;
  batch_id: string;
  txn_date: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amount_paise: number; // signed: + credit (money in), − debit (money out)
  matched_kind: 'contribution' | 'expense' | null;
  matched_id: string | null;
  matched_at: string | null;
  statement_batches: { label: string } | null;
}

/** A verified contribution or paid expense offered as a match candidate. */
export interface LedgerCandidate {
  kind: 'contribution' | 'expense';
  id: string;
  label: string;
  sub: string;
  amount_paise: number;
  occurred_at: string;
  direction: 'in' | 'out';
}

/** Output of reconcile_as_of() — all values integer paise. */
export interface ReconcileReport {
  bank_in_paise: number;
  bank_out_paise: number;
  bank_net_paise: number;
  ledger_verified_in_paise: number;
  ledger_paid_out_paise: number;
  ledger_balance_paise: number;
  diff_in_paise: number;
  diff_out_paise: number;
  unmatched_bank_rows: number;
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
