import { useEffect, useMemo, useState } from 'react';
import {
  AUDIT_LOG, CONTRIBUTIONS, EXPENSES, MEMBERS, STATUS_META, EXPENSE_STATUS_META,
  type Contribution, type ContributionStatus, type Expense, type Role,
} from './data/mockData';
import { formatPaise, paiseFromRupeeInput } from './lib/money';

/* ---------- small helpers ---------- */
const member = (id: string) => MEMBERS.find((m) => m.id === id)!;
const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Tab = 'overview' | 'contributions' | 'expenses' | 'ledger';

export default function App() {
  /* Prototype-only "signed in as" switcher to demonstrate role-based UI.
     In production this comes from Supabase Auth + a `profiles.role` column. */
  const [viewAs, setViewAs] = useState<Role>('treasurer');
  const [tab, setTab] = useState<Tab>('overview');
  const [contribs, setContribs] = useState<Contribution[]>(CONTRIBUTIONS);
  const [expenses, setExpenses] = useState<Expense[]>(EXPENSES);
  const [audit, setAudit] = useState(AUDIT_LOG);
  const [showRecordSheet, setShowRecordSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const log = (action: string, detail: string) =>
    setAudit((a) => [{ id: `a-${Date.now()}`, at: new Date().toISOString(), actorId: 'm1', action, detail }, ...a]);

  /* ---------- ledger math: ONLY verified income & paid expenses touch the balance ---------- */
  const totals = useMemo(() => {
    const verifiedIncome = contribs.filter((c) => c.status === 'verified').reduce((s, c) => s + c.amountPaise, 0);
    const pendingIncome = contribs.filter((c) => c.status === 'pending_verification').reduce((s, c) => s + c.amountPaise, 0);
    const declaredIncome = contribs.filter((c) => c.status === 'declared').reduce((s, c) => s + c.amountPaise, 0);
    const paidOut = expenses.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amountPaise, 0);
    const approvedUnpaid = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amountPaise, 0);
    const requested = expenses.filter((e) => e.status === 'submitted').reduce((s, e) => s + e.amountPaise, 0);
    return { verifiedIncome, pendingIncome, declaredIncome, paidOut, approvedUnpaid, requested, balance: verifiedIncome - paidOut };
  }, [contribs, expenses]);

  const pendingCount = contribs.filter((c) => c.status === 'pending_verification').length;
  const approvalCount = expenses.filter((e) => e.status === 'submitted').length;

  /* ---------- actions (guarded by role) ---------- */
  const canVerify = viewAs === 'treasurer' || viewAs === 'admin';

  const verify = (id: string, ref: string) => {
    setContribs((cs) => cs.map((c) => (c.id === id ? { ...c, status: 'verified' as const, reference: ref || c.reference, verifiedAt: new Date().toISOString(), verifiedBy: 'm1' } : c)));
    log('contribution.verified', `Contribution ${id} verified against bank statement${ref ? ` (ref ${ref})` : ''}`);
    setToast('Marked verified — now counted in balance');
  };
  const reject = (id: string) => {
    setContribs((cs) => cs.map((c) => (c.id === id ? { ...c, status: 'rejected' as const, verifiedBy: 'm1', note: 'Rejected by treasurer: no matching bank entry' } : c)));
    log('contribution.rejected', `Contribution ${id} rejected — excluded from balance`);
    setToast('Rejected — excluded from balance');
  };
  const recordPayment = (input: { memberId: string; kind: 'monthly' | 'voluntary'; amountPaise: number; method: Contribution['method']; month: string }) => {
    // Treasurer-recorded payments enter at pending_verification — never directly "received".
    const nc: Contribution = {
      id: `c-${Date.now()}`, ...input, reference: null, status: 'pending_verification',
      declaredAt: new Date().toISOString(), verifiedAt: null, verifiedBy: null, note: 'Recorded manually by treasurer',
    };
    setContribs((cs) => [nc, ...cs]);
    log('contribution.recorded', `Manual ${input.method} entry recorded for ${member(input.memberId).name} (${formatPaise(input.amountPaise)}) → pending verification`);
    setShowRecordSheet(false);
    setToast('Saved as PENDING — not counted until reconciled with bank statement');
  };
  const decideExpense = (id: string, approve: boolean) => {
    setExpenses((es) => es.map((e) => (e.id === id ? { ...e, status: approve ? ('approved' as const) : ('rejected' as const), approvedAt: approve ? new Date().toISOString() : null, approvedBy: approve ? 'm5' : null } : e)));
    log(approve ? 'expense.approved' : 'expense.rejected', `Expense ${id} ${approve ? 'approved' : 'rejected'} by admin`);
    setToast(approve ? 'Expense approved — disbursement pending' : 'Expense rejected');
  };
  const markPaid = (id: string) => {
    setExpenses((es) => es.map((e) => (e.id === id ? { ...e, status: 'paid' as const, receiptAttached: true } : e)));
    log('expense.paid', `Expense ${id} disbursed; receipt uploaded to private storage`);
    setToast('Marked paid — balance updated, receipt attached');
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
      {/* ===== Top bar ===== */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-sm font-bold text-white shadow-sm">OF</div>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Our Family Home</p>
              <p className="text-[11px] leading-tight text-slate-500">Mission Fund · FY 2026–27</p>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            View as
            <select value={viewAs} onChange={(e) => setViewAs(e.target.value as Role)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30">
              <option value="member">Member</option>
              <option value="coordinator">Coordinator</option>
              <option value="treasurer">Treasurer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pb-28 pt-4">
        {/* prototype banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          <b>Prototype.</b> Sample illustrative data only — no real payments. Unverified entries are never counted as received.
        </div>

        {tab === 'overview' && (
          <>
            {/* Hero balance */}
            <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 p-5 text-white shadow-lg shadow-emerald-900/10">
              <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/90">Verified available balance</p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{formatPaise(totals.balance)}</p>
              <p className="mt-1 text-xs text-emerald-100/80">Only bank-matched contributions minus paid expenses</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Verified income', totals.verifiedIncome, 'text-emerald-100'],
                  ['Paid out', totals.paidOut, 'text-orange-200'],
                  ['Pending (not counted)', totals.pendingIncome, 'text-amber-200'],
                ].map(([l, v, cls]) => (
                  <div key={l as string} className="rounded-xl bg-white/10 px-1.5 py-2.5 ring-1 ring-white/10">
                    <p className={`text-[13px] font-semibold tabular-nums ${cls}`}>{formatPaise(v as number, { compact: true })}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-emerald-100/70">{l}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Status strip */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard label="Declared / expected" value={formatPaise(totals.declaredIncome)} hint="Members have pledged — not received" tone="slate" />
              <StatCard label="Awaiting your verification" value={`${pendingCount}`} hint={pendingCount ? formatPaise(totals.pendingIncome) + ' not yet in balance' : 'All caught up'} tone="amber" />
              <StatCard label="Expenses awaiting approval" value={`${approvalCount}`} hint={totals.requested ? formatPaise(totals.requested) + ' requested' : 'None'} tone="sky" />
              <StatCard label="Approved, not disbursed" value={formatPaise(totals.approvedUnpaid)} hint="Committed but still in the fund" tone="violet" />
            </section>

            {/* Branch collection progress */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">October collection by branch</h2>
              <p className="mb-3 text-[11px] text-slate-500">Verified ÷ pledged for the current month</p>
              <div className="space-y-3">
                {Object.entries(
                  MEMBERS.reduce<Record<string, { pledged: number; verified: number }>>((acc, m) => {
                    acc[m.branch] ??= { pledged: 0, verified: 0 };
                    acc[m.branch].pledged += m.monthlyPledgePaise;
                    contribs.forEach((c) => { if (c.memberId === m.id && c.month === '2026-10' && c.status === 'verified') acc[m.branch].verified += c.amountPaise; });
                    return acc;
                  }, {})
                ).map(([branch, v]) => {
                  const pct = Math.min(100, Math.round((v.verified / v.pledged) * 100));
                  return (
                    <div key={branch}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="font-medium text-slate-700">{branch}</span>
                        <span className="tabular-nums text-slate-500">{formatPaise(v.verified, { compact: true })} / {formatPaise(v.pledged, { compact: true })} · {pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick actions for treasurer/admin */}
            {canVerify && pendingCount > 0 && (
              <button onClick={() => setTab('contributions')}
                className="flex w-full items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left shadow-sm active:scale-[0.99]">
                <div>
                  <p className="text-sm font-semibold text-amber-800">{pendingCount} payment{pendingCount > 1 ? 's' : ''} need verification</p>
                  <p className="text-[11px] text-amber-700/80">Match against the bank statement before marking as received</p>
                </div>
                <span className="text-lg text-amber-700">›</span>
              </button>
            )}
          </>
        )}

        {tab === 'contributions' && (
          <ContributionsTab
            contribs={contribs} canVerify={canVerify} onVerify={verify} onReject={reject}
            onOpenRecord={() => setShowRecordSheet(true)}
          />
        )}

        {tab === 'expenses' && (
          <ExpensesTab expenses={expenses} canApprove={viewAs === 'admin' || viewAs === 'treasurer'} onDecide={decideExpense} onMarkPaid={markPaid} />
        )}

        {tab === 'ledger' && <LedgerTab audit={audit} />}
      </main>

      {/* ===== Bottom tab bar (mobile-first) ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="relative mx-auto grid max-w-lg grid-cols-4">
          {([
            ['overview', 'Home', '⌂'],
            ['contributions', 'Fund', '₹'],
            ['expenses', 'Spending', '▤'],
            ['ledger', 'Audit', '✓'],
          ] as [Tab, string, string][]).map(([t, label, icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${tab === t ? 'text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-lg text-sm ${tab === t ? 'bg-emerald-100' : ''}`}>{icon}</span>
              {label}
              {t === 'contributions' && pendingCount > 0 && canVerify && (
                <span className="absolute right-[calc(50%-18px)] top-1.5 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-[9px] font-bold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {showRecordSheet && <RecordPaymentSheet onClose={() => setShowRecordSheet(false)} onSave={recordPayment} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="max-w-sm rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

/* ================= Sub-components ================= */

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'slate' | 'amber' | 'sky' | 'violet' }) {
  const tones = {
    slate: 'border-slate-200', amber: 'border-amber-300 bg-amber-50/60', sky: 'border-sky-200', violet: 'border-violet-200',
  };
  return (
    <div className={`rounded-2xl border bg-white p-3.5 shadow-sm ${tones[tone]}`}>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{hint}</p>
    </div>
  );
}

function Chip({ status }: { status: ContributionStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${m.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
}

function ContributionsTab(props: {
  contribs: Contribution[]; canVerify: boolean;
  onVerify: (id: string, ref: string) => void; onReject: (id: string) => void; onOpenRecord: () => void;
}) {
  const { contribs, canVerify, onVerify, onReject, onOpenRecord } = props;
  const [filter, setFilter] = useState<'all' | ContributionStatus>('all');
  const [refDraft, setRefDraft] = useState<Record<string, string>>({});
  const list = [...contribs]
    .filter((c) => filter === 'all' || c.status === filter)
    .sort((a, b) => new Date(b.declaredAt).getTime() - new Date(a.declaredAt).getTime());

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Contribution records</h2>
        {canVerify && (
          <button onClick={onOpenRecord} className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.98]">
            + Record bank/UPI payment
          </button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-slate-500">
        Family-wide visibility: every member can see all contribution records. Only <b>Verified</b> rows count toward the balance.
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['all', 'pending_verification', 'verified', 'declared', 'rejected'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 transition ${filter === f ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'}`}>
            {f === 'all' ? 'All' : STATUS_META[f].label}
          </button>
        ))}
      </div>

      <ul className="space-y-2.5">
        {list.map((c) => {
          const m = member(c.memberId);
          return (
            <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">{m.initials}</div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{m.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.kind === 'monthly' ? `Monthly · ${monthLabel(c.month)}` : 'Voluntary gift'} · {c.method === 'bank-transfer' ? 'Bank transfer' : c.method === 'upi' ? 'UPI' : 'Cash'}
                      {c.reference ? ` · ${c.reference}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${c.status === 'rejected' ? 'text-slate-400 line-through' : ''}`}>{formatPaise(c.amountPaise)}</p>
                  <Chip status={c.status} />
                </div>
              </div>
              {c.note && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">{c.note}</p>}
              {c.status !== 'verified' && c.status !== 'rejected' && (
                <p className="mt-2 text-[10px] font-medium text-amber-600">⚠ Not counted in balance until treasurer verifies against bank statement</p>
              )}
              {c.status === 'verified' && c.verifiedAt && (
                <p className="mt-2 text-[10px] text-slate-400">Verified {fmtDateTime(c.verifiedAt)} by {member(c.verifiedBy!).name} · {formatPaise(c.amountPaise)} matched</p>
              )}
              {canVerify && c.status === 'pending_verification' && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    placeholder="Bank ref / UPI txn ID" value={refDraft[c.id] ?? ''}
                    onChange={(e) => setRefDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                  <button onClick={() => onVerify(c.id, refDraft[c.id] ?? '')}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.98]">Verify</button>
                  <button onClick={() => onReject(c.id)}
                    className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 active:scale-[0.98]">Reject</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ExpensesTab(props: {
  expenses: Expense[]; canApprove: boolean;
  onDecide: (id: string, approve: boolean) => void; onMarkPaid: (id: string) => void;
}) {
  const { expenses, canApprove, onDecide, onMarkPaid } = props;
  const list = [...expenses].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Expenses & approvals</h2>
      <p className="text-[11px] text-slate-500">Approval requires admin/treasurer. Only <b>Paid</b> expenses reduce the balance. Receipts live in private Supabase Storage.</p>
      <ul className="space-y-2.5">
        {list.map((e) => {
          const req = member(e.requestedBy);
          const meta = EXPENSE_STATUS_META[e.status];
          return (
            <li key={e.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{e.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{e.category} · requested by {req.name} · {fmtDateTime(e.submittedAt)}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{e.purpose}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{formatPaise(e.amountPaise)}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${meta.chip}`}>{meta.label}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <span>{e.receiptAttached ? '🧾 Receipt attached' : '🧾 No receipt yet'}</span>
                {e.approvedAt && <span>· Approved {fmtDateTime(e.approvedAt)} by {member(e.approvedBy!).name}</span>}
              </div>
              {canApprove && e.status === 'submitted' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => onDecide(e.id, true)} className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white active:scale-[0.98]">Approve</button>
                  <button onClick={() => onDecide(e.id, false)} className="flex-1 rounded-lg border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-600 active:scale-[0.98]">Reject</button>
                </div>
              )}
              {canApprove && e.status === 'approved' && (
                <button onClick={() => onMarkPaid(e.id)} className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white active:scale-[0.98]">
                  Mark disbursed & attach receipt
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LedgerTab({ audit }: { audit: typeof AUDIT_LOG }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Audit history</h2>
      <p className="text-[11px] text-slate-500">Append-only. In production, rows are written by Postgres triggers and cannot be edited or deleted by any client role.</p>
      <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-4">
        {audit.map((a) => (
          <li key={a.id} className="relative">
            <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${a.action.includes('rejected') ? 'bg-rose-400' : a.action.includes('verified') || a.action.includes('approved') ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <p className="text-[11px] tabular-nums text-slate-400">{fmtDateTime(a.at)}</p>
            <p className="text-xs font-semibold text-slate-700"><code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">{a.action}</code></p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{a.detail}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">by {member(a.actorId).name}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordPaymentSheet(props: {
  onClose: () => void;
  onSave: (i: { memberId: string; kind: 'monthly' | 'voluntary'; amountPaise: number; method: Contribution['method']; month: string }) => void;
}) {
  const { onClose, onSave } = props;
  const [memberId, setMemberId] = useState(MEMBERS[5].id);
  const [kind, setKind] = useState<'monthly' | 'voluntary'>('monthly');
  const [method, setMethod] = useState<Contribution['method']>('upi');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('2026-10');
  const parsedPaise: number | null = (paiseFromRupeeInput(amount) ?? 0) > 0 ? paiseFromRupeeInput(amount) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
        <h3 className="text-sm font-bold">Record manual bank / UPI payment</h3>
        <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-700">
          This creates a <b>pending verification</b> record. It will NOT count toward the family balance until reconciled with the actual bank statement.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Family member">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="input">
              {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.branch}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={kind} onChange={(e) => setKind(e.target.value as 'monthly' | 'voluntary')} className="input">
                <option value="monthly">Monthly pledge</option>
                <option value="voluntary">Voluntary gift</option>
              </select>
            </Field>
            <Field label="Method">
              <select value={method} onChange={(e) => setMethod(e.target.value as Contribution['method'])} className="input">
                <option value="upi">UPI</option>
                <option value="bank-transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)">
              <input inputMode="decimal" placeholder="e.g. 1200" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
            </Field>
            <Field label="For month">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="input">
                <option value="2026-09">Sep 2026</option><option value="2026-10">Oct 2026</option><option value="2026-11">Nov 2026</option>
              </select>
            </Field>
          </div>
          {amount && parsedPaise === null && <p className="text-[11px] text-rose-600">Enter a valid amount like 1200 or 1200.50</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600">Cancel</button>
            <button disabled={parsedPaise === null} onClick={() => parsedPaise !== null && onSave({ memberId, kind, amountPaise: parsedPaise, method, month })}
              className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Save as pending
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
