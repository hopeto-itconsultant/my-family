/**
 * ⚠️ PROTOTYPE DATA ONLY — these are ILLUSTRATIVE sample records used to demo the UI.
 * They are NOT real payments and must never be seeded into a production database.
 * In the production app every row below comes from Supabase tables guarded by RLS.
 *
 * Money convention: all amounts are in PAISE (integers). ₹1,200 = 120000 paise.
 */

export type Role = 'member' | 'coordinator' | 'treasurer' | 'admin';

export type PaymentMethod = 'bank-transfer' | 'upi' | 'cash';

/**
 * Lifecycle of a contribution:
 *   declared → pending_verification → verified | rejected
 * Only `verified` rows count toward the fund balance.
 */
export type ContributionStatus =
  | 'declared'              // family member claims they will pay / has paid — NOT received
  | 'pending_verification'  // bank/UPI entry recorded by treasurer — awaiting reconciliation
  | 'verified'              // matched against bank statement — counts in balance
  | 'rejected';             // not found in bank statement — excluded, reason required

export type ExpenseStatus =
  | 'submitted' // requested by coordinator/member
  | 'approved'  // approved by admin/treasurer, not yet paid
  | 'paid'      // disbursed — reduces balance
  | 'rejected';

export interface Member {
  id: string;
  name: string;
  branch: string;
  role: Role;
  initials: string;
  monthlyPledgePaise: number;
}

export interface Contribution {
  id: string;
  memberId: string;
  kind: 'monthly' | 'voluntary';
  month: string; // e.g. "2026-10" for monthly pledges
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null; // UPI txn id / bank RR number — entered by treasurer at verification
  status: ContributionStatus;
  declaredAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  note: string | null;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amountPaise: number;
  requestedBy: string; // member id
  status: ExpenseStatus;
  submittedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  receiptAttached: boolean;
  purpose: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  detail: string;
}

export const MEMBERS: Member[] = [
  { id: 'm1', name: 'Anand Sharma', branch: 'Elder · Branch A', role: 'treasurer', initials: 'AS', monthlyPledgePaise: 120000 },
  { id: 'm2', name: 'Priya Sharma-Nair', branch: 'Branch B', role: 'coordinator', initials: 'PN', monthlyPledgePaise: 120000 },
  { id: 'm3', name: 'Rakesh Sharma', branch: 'Elder · Branch A', role: 'member', initials: 'RS', monthlyPledgePaise: 100000 },
  { id: 'm4', name: 'Meera Iyer', branch: 'Branch C', role: 'member', initials: 'MI', monthlyPledgePaise: 80000 },
  { id: 'm5', name: 'Suresh Sharma', branch: 'Elder · Branch A', role: 'admin', initials: 'SS', monthlyPledgePaise: 150000 },
  { id: 'm6', name: 'Kavya Reddy', branch: 'Branch B', role: 'member', initials: 'KR', monthlyPledgePaise: 60000 },
  { id: 'm7', name: 'Deepak Sharma', branch: 'Branch C', role: 'member', initials: 'DS', monthlyPledgePaise: 100000 },
  { id: 'm8', name: 'Lakshmi Menon', branch: 'Branch D', role: 'member', initials: 'LM', monthlyPledgePaise: 50000 },
];

export const CONTRIBUTIONS: Contribution[] = [
  // ---- Verified (count toward balance) ----
  { id: 'c1', memberId: 'm1', kind: 'monthly', month: '2026-09', amountPaise: 120000, method: 'upi', reference: 'UPI-9F3A21C', status: 'verified', declaredAt: '2026-09-03T09:12:00Z', verifiedAt: '2026-09-05T10:02:00Z', verifiedBy: 'm1', note: null },
  { id: 'c2', memberId: 'm2', kind: 'monthly', month: '2026-09', amountPaise: 120000, method: 'bank-transfer', reference: 'NEFT-XK2291', status: 'verified', declaredAt: '2026-09-06T14:40:00Z', verifiedAt: '2026-09-08T08:15:00Z', verifiedBy: 'm1', note: null },
  { id: 'c3', memberId: 'm3', kind: 'monthly', month: '2026-09', amountPaise: 100000, method: 'cash', reference: null, status: 'verified', declaredAt: '2026-09-10T18:00:00Z', verifiedAt: '2026-09-11T07:30:00Z', verifiedBy: 'm1', note: 'Handed over at Navratri meet' },
  { id: 'c4', memberId: 'm5', kind: 'voluntary', month: '2026-09', amountPaise: 500000, method: 'bank-transfer', reference: 'NEFT-Y8812P', status: 'verified', declaredAt: '2026-09-14T11:20:00Z', verifiedAt: '2026-09-15T09:00:00Z', verifiedBy: 'm1', note: 'Additional donation for temple event' },
  { id: 'c5', memberId: 'm4', kind: 'monthly', month: '2026-09', amountPaise: 80000, method: 'upi', reference: 'UPI-77BC02', status: 'verified', declaredAt: '2026-09-18T20:05:00Z', verifiedAt: '2026-09-19T08:40:00Z', verifiedBy: 'm1', note: null },
  { id: 'c6', memberId: 'm7', kind: 'monthly', month: '2026-09', amountPaise: 100000, method: 'bank-transfer', reference: 'IMPS-Q0194', status: 'verified', declaredAt: '2026-09-22T10:10:00Z', verifiedAt: '2026-09-24T09:12:00Z', verifiedBy: 'm1', note: null },
  { id: 'c7', memberId: 'm6', kind: 'monthly', month: '2026-09', amountPaise: 60000, method: 'upi', reference: 'UPI-55AD71', status: 'verified', declaredAt: '2026-09-25T19:30:00Z', verifiedAt: '2026-09-26T08:05:00Z', verifiedBy: 'm1', note: null },
  { id: 'c8', memberId: 'm8', kind: 'monthly', month: '2026-09', amountPaise: 50000, method: 'upi', reference: 'UPI-C31D90', status: 'verified', declaredAt: '2026-09-28T21:00:00Z', verifiedAt: '2026-09-30T07:50:00Z', verifiedBy: 'm1', note: null },
  { id: 'c9', memberId: 'm1', kind: 'monthly', month: '2026-10', amountPaise: 120000, method: 'upi', reference: 'UPI-A1B203', status: 'verified', declaredAt: '2026-10-02T08:30:00Z', verifiedAt: '2026-10-03T09:00:00Z', verifiedBy: 'm1', note: null },
  { id: 'c10', memberId: 'm3', kind: 'monthly', month: '2026-10', amountPaise: 100000, method: 'bank-transfer', reference: 'NEFT-P55210', status: 'verified', declaredAt: '2026-10-05T12:00:00Z', verifiedAt: '2026-10-07T08:20:00Z', verifiedBy: 'm1', note: null },

  // ---- Pending verification (recorded by treasurer, NOT counted) ----
  { id: 'c11', memberId: 'm2', kind: 'monthly', month: '2026-10', amountPaise: 120000, method: 'bank-transfer', reference: null, status: 'pending_verification', declaredAt: '2026-10-08T16:45:00Z', verifiedAt: null, verifiedBy: null, note: 'Awaiting bank statement match (12–18 Oct)' },
  { id: 'c12', memberId: 'm4', kind: 'voluntary', month: '2026-10', amountPaise: 250000, method: 'upi', reference: null, status: 'pending_verification', declaredAt: '2026-10-11T19:20:00Z', verifiedAt: null, verifiedBy: null, note: 'Diwali contribution — screenshot shared with treasurer' },
  { id: 'c13', memberId: 'm7', kind: 'monthly', month: '2026-10', amountPaise: 100000, method: 'upi', reference: null, status: 'pending_verification', declaredAt: '2026-10-14T22:00:00Z', verifiedAt: null, verifiedBy: null, note: null },

  // ---- Declared by member (explicitly NOT received until verified) ----
  { id: 'c14', memberId: 'm6', kind: 'monthly', month: '2026-10', amountPaise: 60000, method: 'upi', reference: null, status: 'declared', declaredAt: '2026-10-15T20:10:00Z', verifiedAt: null, verifiedBy: null, note: '"Will pay after salary credit"' },
  { id: 'c15', memberId: 'm8', kind: 'monthly', month: '2026-10', amountPaise: 50000, method: 'upi', reference: null, status: 'declared', declaredAt: '2026-10-16T18:00:00Z', verifiedAt: null, verifiedBy: null, note: null },

  // ---- Rejected example (audit trail shows why) ----
  { id: 'c16', memberId: 'm5', kind: 'monthly', month: '2026-10', amountPaise: 150000, method: 'bank-transfer', reference: null, status: 'rejected', declaredAt: '2026-10-04T09:00:00Z', verifiedAt: null, verifiedBy: 'm1', note: 'Rejected: no matching debit in bank statement for Oct' },
];

export const EXPENSES: Expense[] = [
  { id: 'e1', title: 'Navratri community hall booking', category: 'Events', amountPaise: 1800000, requestedBy: 'm2', status: 'paid', submittedAt: '2026-09-01T10:00:00Z', approvedAt: '2026-09-02T09:00:00Z', approvedBy: 'm5', receiptAttached: true, purpose: 'Annual nine-night gathering, 60 attendees' },
  { id: 'e2', title: 'Elder medical aid — Uncle Mohan', category: 'Welfare', amountPaise: 1000000, requestedBy: 'm3', status: 'paid', submittedAt: '2026-09-12T08:30:00Z', approvedAt: '2026-09-13T10:00:00Z', approvedBy: 'm5', receiptAttached: true, purpose: 'Hospital advance, repayable family welfare support' },
  { id: 'e3', title: 'Website & hosting (annual)', category: 'Operations', amountPaise: 340000, requestedBy: 'm5', status: 'paid', submittedAt: '2026-09-20T15:00:00Z', approvedAt: '2026-09-20T18:00:00Z', approvedBy: 'm1', receiptAttached: true, purpose: 'Supabase Pro plan + Vercel hosting' },
  { id: 'e4', title: 'Diwali decoration & prasad', category: 'Events', amountPaise: 650000, requestedBy: 'm2', status: 'approved', submittedAt: '2026-10-10T11:00:00Z', approvedAt: '2026-10-12T09:00:00Z', approvedBy: 'm5', receiptAttached: false, purpose: 'Approved, disbursement pending' },
  { id: 'e5', title: 'Family meetup venue deposit', category: 'Events', amountPaise: 500000, requestedBy: 'm7', status: 'submitted', submittedAt: '2026-10-18T20:00:00Z', approvedAt: null, approvedBy: null, receiptAttached: false, purpose: 'December get-together advance booking' },
];

export const AUDIT_LOG: AuditEntry[] = [
  { id: 'a1', at: '2026-10-18T20:00:00Z', actorId: 'm7', action: 'expense.submitted', detail: 'Expense e5 "Family meetup venue deposit" ₹5,000.00 submitted for approval' },
  { id: 'a2', at: '2026-10-16T18:00:00Z', actorId: 'm8', action: 'contribution.declared', detail: 'Contribution c15 declared (monthly Oct) — not counted until verified' },
  { id: 'a3', at: '2026-10-14T22:05:00Z', actorId: 'm1', action: 'contribution.recorded', detail: 'Contribution c13 recorded via UPI, moved to pending_verification' },
  { id: 'a4', at: '2026-10-12T09:00:00Z', actorId: 'm5', action: 'expense.approved', detail: 'Expense e4 approved by admin Suresh Sharma' },
  { id: 'a5', at: '2026-10-07T08:20:00Z', actorId: 'm1', action: 'contribution.verified', detail: 'Contribution c10 verified against bank statement (ref NEFT-P55210)' },
  { id: 'a6', at: '2026-10-05T09:30:00Z', actorId: 'm1', action: 'contribution.rejected', detail: 'Contribution c16 rejected — no matching bank debit; member notified' },
  { id: 'a7', at: '2026-10-03T09:00:00Z', actorId: 'm1', action: 'reconciliation.run', detail: 'Weekly reconciliation batch matched 1 of 3 pending entries' },
];

export const STATUS_META: Record<ContributionStatus, { label: string; dot: string; chip: string }> = {
  declared: { label: 'Declared', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
  pending_verification: { label: 'Pending verification', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  verified: { label: 'Verified', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rejected', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export const EXPENSE_STATUS_META: Record<ExpenseStatus, { label: string; chip: string }> = {
  submitted: { label: 'Awaiting approval', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved: { label: 'Approved', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  paid: { label: 'Paid', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rejected', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
};
