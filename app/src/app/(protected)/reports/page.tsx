import { requireProfile, getDirectory } from '@/lib/session';
import { formatPaise } from '@/lib/money';
import { getFundSummary, getContributions, getExpenses } from '@/app/actions/fund';
import { MonthPicker } from './month-picker';

export const metadata = { title: 'Fund reports · Our Family Home' };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function monthLabel(ref: string): string {
  const [y, m] = ref.split('-').map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

function currentMonthRef(): string {
  // IST-anchored month bucket (matches how the family thinks about pledges)
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireProfile(); // auth gate only; reports are family-visible like /fund
  const { month } = await searchParams;
  const monthRef = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : currentMonthRef();

  const [summary, contributions, expenses, directory] = await Promise.all([
    getFundSummary(), getContributions(500), getExpenses(500), getDirectory(),
  ]);

  const nameOf = new Map(directory.map((p) => [p.id, p.full_name]));
  const branchOf = new Map(directory.map((p) => [p.id, p.branches?.name ?? '—']));

  // In-month flows use the ledger's own timestamps: verified_at / paid_at.
  // Both are nullable in the schema, so guard against null/undefined rows —
  // an unguarded .slice() here used to crash the whole page into an error screen.
  const inMonth = (iso: string | null | undefined) => !!iso && iso.slice(0, 7) === monthRef;
  const monthIn = contributions.filter((c) => c.status === 'verified' && inMonth(c.verified_at ?? c.declared_at));
  const monthOut = expenses.filter((e) => e.status === 'paid' && inMonth(e.paid_at));
  // Pledge-period view: everything declared FOR this month, regardless of when money moved.
  const pledgedFor = contributions.filter((c) => c.month_ref === monthRef);
  const pledgedVerified = pledgedFor.filter((c) => c.status === 'verified');
  const pledgedPending = pledgedFor.filter((c) => c.status === 'declared' || c.status === 'pending_verification');

  const sum = (rows: { amount_paise: number }[]) => rows.reduce((s, r) => s + r.amount_paise, 0);
  const inTot = sum(monthIn as unknown as { amount_paise: number }[]);
  const outTot = sum(monthOut as unknown as { amount_paise: number }[]);

  // Branch-wise pledge coverage for the month
  const byBranch = new Map<string, { verified: number; pending: number }>();
  for (const c of pledgedFor) {
    const b = branchOf.get(c.member_id) ?? '—';
    const cur = byBranch.get(b) ?? { verified: 0, pending: 0 };
    if (c.status === 'verified') cur.verified += c.amount_paise;
    else cur.pending += c.amount_paise;
    byBranch.set(b, cur);
  }

  return (
    <main className="p-4 pb-24 space-y-5 max-w-xl mx-auto">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Mission Fund report</h1>
          <p className="text-sm text-stone-500">{monthLabel(monthRef)} · generated {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <MonthPicker current={monthRef} />
      </header>

      {/* Print-friendly statement */}
      <section id="statement" className="rounded-2xl bg-white ring-1 ring-stone-200 p-5 space-y-4 print:ring-0 print:p-0">
        <div className="hidden print:block text-center mb-4">
          <h2 className="text-lg font-bold">Our Family Home — Mission Fund Statement</h2>
          <p className="text-sm">{monthLabel(monthRef)}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Money in" value={formatPaise(inTot)} tone="teal" />
          <Stat label="Money out" value={formatPaise(outTot)} tone="red" />
          <Stat label="Net for month" value={formatPaise(inTot - outTot)} tone={inTot - outTot >= 0 ? 'teal' : 'red'} />
        </div>

        <div className="rounded-xl bg-stone-50 p-3 text-sm flex justify-between">
          <span className="text-stone-500">Current verified balance (all time)</span>
          <span className="font-bold tabular-nums">{summary ? formatPaise(summary.balance_paise) : '—'}</span>
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-sm">Collections credited this month</h3>
          {monthIn.length === 0 ? (
            <p className="text-sm text-stone-500">No verified collections dated in {monthLabel(monthRef)}.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {monthIn.map((c) => (
                <li key={c.id} className="flex justify-between py-2 gap-2">
                  <span className="min-w-0"><span className="block truncate">{nameOf.get(c.member_id) ?? 'Member'}</span>
                    <span className="text-xs text-stone-500">{branchOf.get(c.member_id)} · {c.method.replace('_', ' ')}{c.bank_ref ? ` · ${c.bank_ref}` : ''}</span></span>
                  <span className="tabular-nums font-semibold text-teal-700 shrink-0">{formatPaise(c.amount_paise)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-sm">Payments made this month</h3>
          {monthOut.length === 0 ? (
            <p className="text-sm text-stone-500">No expense payments dated in {monthLabel(monthRef)}.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {monthOut.map((e) => (
                <li key={e.id} className="flex justify-between py-2 gap-2">
                  <span className="min-w-0"><span className="block truncate">{e.title}</span>
                    <span className="text-xs text-stone-500">{e.bank_ref ? `ref ${e.bank_ref}` : 'receipt on file'}</span></span>
                  <span className="tabular-nums font-semibold text-red-700 shrink-0">−{formatPaise(e.amount_paise)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-sm">Pledges for {monthLabel(monthRef)}</h3>
          <p className="text-sm">
            <span className="font-semibold text-teal-700">{formatPaise(sum(pledgedVerified))}</span> received ·{' '}
            <span className="font-semibold text-amber-700">{formatPaise(sum(pledgedPending))}</span> awaiting verification
            <span className="block text-xs text-stone-500 mt-0.5">Pending amounts are NOT counted in any balance.</span>
          </p>
          {byBranch.size > 0 && (
            <ul className="text-xs space-y-1.5 pt-1">
              {[...byBranch.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([b, v]) => (
                <li key={b}>
                  <div className="flex justify-between text-stone-600"><span>{b}</span><span className="tabular-nums">{formatPaise(v.verified)}{v.pending > 0 && ` (+${formatPaise(v.pending)} pending)`}</span></div>
                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${Math.min(100, Math.round((v.verified / Math.max(1, v.verified + v.pending)) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={() => window.print()}
          className="w-full rounded-xl bg-stone-800 text-white font-semibold py-3 active:bg-stone-900 print:hidden"
        >
          🖨️ Print / Save as PDF
        </button>
      </section>

      <p className="text-xs text-stone-400">
        Figures come straight from the ledger views (verified contributions & paid expenses only).
        Entries are recorded manually by the treasurer; every figure here comes from verified/paid rows only.
      </p>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'red' }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone === 'teal' ? 'text-teal-700' : 'text-red-700'}`}>{value}</p>
    </div>
  );
}
