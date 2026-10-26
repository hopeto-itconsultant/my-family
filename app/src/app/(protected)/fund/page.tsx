import Link from 'next/link';
import { requireProfile, getDirectory, canManage } from '@/lib/session';
import { isFinanceRole } from '@/lib/types';
import { formatPaise } from '@/lib/money';
import {
  getFundSummary, getContributions, getExpenses, getBranchCollection, getAuditTrail, getReceiptUrl,
} from '@/app/actions/fund';
import type { AuditRow, Contribution, Expense, ProfileWithBranch } from '@/lib/types';
import { METHOD_LABELS } from '@/lib/types';
import { RecordPaymentSheet, VerifyControls, ExpenseRequestSheet, ExpenseControls } from './fund-widgets';

export const metadata = { title: 'Mission Fund · Our Family Home' };

const STATUS_BADGE: Record<Contribution['status'], string> = {
  declared: 'bg-stone-100 text-stone-600',
  pending_verification: 'bg-amber-100 text-amber-800',
  verified: 'bg-teal-100 text-teal-800',
  rejected: 'bg-red-100 text-red-700',
  reversed: 'bg-orange-100 text-orange-800',
};
const STATUS_LABEL: Record<Contribution['status'], string> = {
  declared: 'draft', pending_verification: 'awaiting verification', verified: '✓ received',
  rejected: 'rejected', reversed: 'reversed',
};
const EXPENSE_BADGE: Record<Expense['status'], [string, string]> = {
  submitted: ['awaiting approval', 'bg-stone-100 text-stone-600'],
  approved: ['approved — not yet paid', 'bg-sky-100 text-sky-800'],
  rejected: ['rejected', 'bg-red-100 text-red-700'],
  paid: ['✓ paid out', 'bg-teal-100 text-teal-800'],
  reversed: ['reversed', 'bg-orange-100 text-orange-800'],
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

function auditLabel(a: AuditRow): string {
  const map: Record<string, string> = {
    'contribution.record': 'recorded a payment (manual)',
    'contribution.declare': 'declared a payment',
    'contribution.mark_sent': 'marked a payment as sent',
    'contribution.verify': 'verified a payment ✓',
    'contribution.reject': 'rejected a payment',
    'contribution.reverse': 'reversed a verified payment ↩',
    'expense.approve': 'approved an expense',
    'expense.reject': 'rejected an expense',
    'expense.pay': 'paid an expense (receipt attached)',
    'expense.reverse': 'reversed an expense payment ↩',
  };
  return map[a.action] ?? a.action;
}

export default async function FundPage() {
  const profile = await requireProfile();
  const isTreasurer = isFinanceRole(profile.role);

  const monthRef = new Date().toISOString().slice(0, 7);
  const [directory, summary, contributions, expenses, branchRows, audit] = await Promise.all([
    getDirectory(), getFundSummary(), getContributions(), getExpenses(),
    getBranchCollection(monthRef), isTreasurer || canManage(profile) ? getAuditTrail() : Promise.resolve([]),
  ]);

  const names: Record<string, string> = {};
  for (const p of directory as ProfileWithBranch[]) names[p.id] = p.full_name;

  // Receipt links only minted for treasurers (storage RLS would refuse others anyway).
  const receiptUrls: Record<string, string | null> = {};
  if (isTreasurer) {
    for (const e of expenses.filter((x) => x.receipt_path)) {
      receiptUrls[e.id] = await getReceiptUrl(e.receipt_path!);
    }
  }

  const mine = contributions.filter((c) => c.member_id === profile.id);
  const queue = contributions.filter((c) => c.status === 'pending_verification' || c.status === 'declared');
  const openExpenses = expenses.filter((e) => e.status === 'submitted' || e.status === 'approved');
  const ledger = contributions.filter((c) => c.status !== 'declared').slice(0, 30);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">💛 Mission Fund</h1>
        <Link href="/reports" className="text-xs font-semibold text-teal-700 ring-1 ring-teal-200 bg-teal-50 rounded-lg px-2.5 py-1.5">
          📊 Monthly report
        </Link>
      </div>

      {/* Verified balance hero */}
      <section className="rounded-3xl bg-teal-800 text-white p-5 shadow-lg">
        <p className="text-xs uppercase tracking-wide text-teal-200">Verified balance (bank-confirmed only)</p>
        <p className="text-4xl font-extrabold mt-1">{summary ? formatPaise(summary.balance_paise) : '—'}</p>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div><p className="text-[11px] text-teal-200">Received</p><p className="font-bold text-sm">{summary ? formatPaise(summary.verified_in_paise) : '—'}</p></div>
          <div><p className="text-[11px] text-teal-200">Paid out</p><p className="font-bold text-sm">{summary ? formatPaise(summary.paid_out_paise) : '—'}</p></div>
          <div><p className="text-[11px] text-teal-200">Awaiting check</p><p className="font-bold text-sm">{summary ? formatPaise(summary.awaiting_verification_paise) : '—'}</p></div>
        </div>
        <p className="text-[11px] text-teal-200/80 mt-3">
          ⚠ Payments recorded but not yet verified by the treasurer are shown to everyone as “awaiting
          verification” and are <b>never counted in the balance</b>.
        </p>
      </section>

      {/* Primary actions — only the treasurer records entries; everyone else views */}
      {isTreasurer ? (
        <div className="space-y-3">
          <RecordPaymentSheet directory={directory.filter((d) => d.role !== 'treasurer')} />
        </div>
      ) : (
        <p className="text-xs rounded-xl bg-stone-100 text-stone-600 px-4 py-3">
          👀 You can view every fund record here. All entries are recorded manually by the family
          treasurer — payments made to the treasurer (cash or UPI) appear here as “awaiting
          verification” until confirmed received.
        </p>
      )}

      {/* Branch collection progress this month */}
      {branchRows.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 space-y-2">
          <h2 className="font-semibold">Branch collection · {monthRef}</h2>
          {branchRows.map((b) => (
            <div key={b.branch_id}>
              <div className="flex justify-between text-sm">
                <span>{b.branch_name}</span>
                <span className="text-stone-500">{formatPaise(b.verified_paise ?? 0)}{b.pending_paise ? ` (+${formatPaise(b.pending_paise)} pending)` : ''}</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 mt-1">
                <div className="h-1.5 rounded-full bg-teal-600"
                  style={{ width: `${Math.min(100, ((b.verified_paise ?? 0) / Math.max(1, (b.verified_paise ?? 0) + (b.pending_paise ?? 0))) * 100)}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Treasurer queues */}
      {isTreasurer && (queue.length > 0 || openExpenses.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-semibold">🧑‍💼 Treasurer queue</h2>
          {queue.length > 0 && (
            <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 space-y-3">
              <p className="text-sm font-medium text-amber-900">{queue.length} payment(s) awaiting bank-statement check</p>
              {queue.slice(0, 8).map((c) => (
                <div key={c.id} className="bg-white rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{names[c.member_id] ?? 'Member'} · {formatPaise(c.amount_paise)}</p>
                    <p className="text-xs text-stone-500 truncate">{STATUS_LABEL[c.status]}{c.month_ref ? ` · ${c.month_ref}` : ' · voluntary'}{c.note ? ` · “${c.note}”` : ''}</p>
                  </div>
                  <VerifyControls c={c} names={names} />
                </div>
              ))}
            </div>
          )}
          {openExpenses.length > 0 && (
            <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-200 p-4 space-y-3">
              <p className="text-sm font-medium text-sky-900">Expense approvals & disbursements</p>
              {openExpenses.map((e) => (
                <div key={e.id} className="bg-white rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{e.title} · {formatPaise(e.amount_paise)}</p>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 ${EXPENSE_BADGE[e.status][1]}`}>{EXPENSE_BADGE[e.status][0]}</span>
                  </div>
                  <p className="text-xs text-stone-500">by {names[e.requested_by] ?? 'member'}{e.purpose ? ` · ${e.purpose}` : ''}</p>
                  <ExpenseControls e={e} names={names} receiptUrl={receiptUrls[e.id] ?? null} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* My contributions */}
      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">My contributions</h2>
          {mine.slice(0, 6).map((c) => (
            <div key={c.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{formatPaise(c.amount_paise)} · {c.month_ref ?? 'voluntary gift'}</p>
                <p className="text-xs text-stone-500">{fmtDateTime(c.declared_at)} · {METHOD_LABELS[c.method] ?? c.method}</p>
                {c.reject_reason && <p className="text-xs text-red-600">{c.reject_reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Family ledger (transparent records) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Family ledger</h2>
          {isTreasurer && <ExpenseRequestSheet />}
        </div>
        {ledger.length === 0 && (
          <p className="text-sm text-stone-500 rounded-xl bg-white ring-1 ring-stone-200 p-4">
            No money records yet. Every contribution the family declares will appear here instantly —
            clearly marked until the treasurer verifies it against the bank statement.
          </p>
        )}
        {ledger.map((c) => (
          <div key={c.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm truncate">{names[c.member_id] ?? 'Member'} · {formatPaise(c.amount_paise)}</p>
              <p className="text-xs text-stone-500">{METHOD_LABELS[c.method] ?? c.method} · {c.month_ref ?? 'voluntary'} · {fmtDateTime(c.declared_at)}{c.bank_ref ? ` · ref ${c.bank_ref}` : ''}</p>
            </div>
            <span className={`text-[10px] shrink-0 rounded-full px-2 py-0.5 ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          </div>
        ))}
      </section>

      {/* Paid expenses list (family-visible outcomes) */}
      {expenses.filter((e) => e.status === 'paid' || e.status === 'rejected' || e.status === 'reversed').length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Expense outcomes</h2>
          {expenses.filter((e) => ['paid', 'rejected', 'reversed'].includes(e.status)).map((e) => (
            <div key={e.id} className="rounded-2xl bg-white ring-1 ring-stone-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{e.title} · {formatPaise(e.amount_paise)}</p>
                <span className={`text-[10px] rounded-full px-2 py-0.5 ${EXPENSE_BADGE[e.status][1]}`}>{EXPENSE_BADGE[e.status][0]}</span>
              </div>
              <p className="text-xs text-stone-500">
                requested by {names[e.requested_by] ?? 'member'}{e.bank_ref ? ` · ref ${e.bank_ref}` : ''}{e.reject_reason ? ` · ${e.reject_reason}` : ''}
              </p>
              {isTreasurer && <ExpenseControls e={e} names={names} receiptUrl={receiptUrls[e.id] ?? null} />}
            </div>
          ))}
        </section>
      )}

      {/* Audit trail */}
      {audit.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">🔍 Audit trail (append-only)</h2>
          <ol className="rounded-2xl bg-white ring-1 ring-stone-200 divide-y divide-stone-100">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-xs text-stone-600">
                <span className="font-medium text-stone-800">{names[a.actor_id ?? ''] ?? 'System'}</span>{' '}
                {auditLabel(a)} · {fmtDateTime(a.at)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-[11px] text-stone-400">
        Only the treasurer records entries (manual cash/UPI-online entries only). Balance rule: verified contributions − paid expenses, computed in PostgreSQL on every visit.
        Corrections are reversals with reasons — history is never rewritten.{' '}
        <Link href="/setup" className="underline">Setup notes</Link>
      </p>
    </div>
  );
}
