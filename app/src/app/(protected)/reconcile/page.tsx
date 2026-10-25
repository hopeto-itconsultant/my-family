import Link from 'next/link';
import { requireProfile } from '@/lib/session';
import { isFinanceRole, type StatementRowView } from '@/lib/types';
import { formatPaise } from '@/lib/money';
import {
  getStatementData, getLedgerCandidates, getMatchedLedgerIds, getReconcileReport,
} from '@/app/actions/reconcile';
import { ImportSheet, MatchControls } from './reconcile-widgets';
import { ReconcileClient } from './reconcile-client';

export const metadata = { title: 'Reconciliation · Our Family Home' };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ReconcilePage() {
  const profile = await requireProfile();

  // Treasurer/admin only. RLS hides the tables anyway; this keeps the UI honest.
  if (!isFinanceRole(profile.role)) {
    return (
      <main className="p-4 space-y-4 max-w-xl mx-auto">
        <h1 className="text-xl font-bold">Reconciliation</h1>
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">🔒 Treasurer-only workspace</p>
          <p>
            Bank-statement reconciliation is restricted to the treasurer and admins. The family sees
            contribution &amp; expense records on the <Link href="/fund" className="underline font-medium">Mission Fund</Link> page —
            raw bank data stays private by design (RLS on <code>statement_batches</code> / <code>bank_statement_rows</code>).
          </p>
        </div>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ batches, rows }, candidates, matchedIds, report] = await Promise.all([
    getStatementData(),
    getLedgerCandidates(),
    getMatchedLedgerIds(),
    getReconcileReport(today),
  ]);

  const unmatched = rows.filter((r) => !r.matched_id).length;

  return (
    <main className="p-4 pb-24 space-y-5 max-w-xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Bank reconciliation</h1>
        <p className="text-sm text-stone-500">
          Compare the actual bank account against the ledger. Nothing here changes money records —
          it only records evidence.
        </p>
      </header>

      {/* ---- Discrepancy report (computed in Postgres) ---- */}
      {report && (
        <section className="rounded-2xl bg-white ring-1 ring-stone-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Discrepancy report · as of {fmtDate(today)}</h2>
            {report.unmatched_bank_rows > 0 ? (
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 rounded-full px-2 py-1">
                {report.unmatched_bank_rows} bank row(s) unmatched
              </span>
            ) : (
              <span className="text-xs font-semibold bg-teal-100 text-teal-800 rounded-full px-2 py-1">all matched</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <ReportRow label="Bank money IN" value={formatPaise(report.bank_in_paise)} />
            <ReportRow label="Verified contributions" value={formatPaise(report.ledger_verified_in_paise)} />
            <ReportRow label="Bank money OUT" value={formatPaise(report.bank_out_paise)} />
            <ReportRow label="Paid expenses" value={formatPaise(report.ledger_paid_out_paise)} />
          </div>
          <div className="rounded-xl bg-stone-50 p-3 text-sm space-y-1">
            <DiffLine label="Inflow difference (bank − ledger)" paise={report.diff_in_paise} />
            <DiffLine label="Outflow difference (bank − ledger)" paise={report.diff_out_paise} />
            <div className="border-t border-stone-200 pt-1 flex justify-between font-semibold">
              <span>Ledger balance</span><span>{formatPaise(report.ledger_balance_paise)}</span>
            </div>
          </div>
          {(report.diff_in_paise !== 0 || report.diff_out_paise !== 0) && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              ⚠ Differences are expected until every bank row is matched or explained. Investigate
              before verifying new money — a credit that matches no pledge may be a mis-recorded payment.
            </p>
          )}
        </section>
      )}

      {/* ---- Import ---- */}
      <ImportSheet />

      {/* ---- Batches ---- */}
      {batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-sm text-stone-700">Imported batches</h2>
          <ul className="text-xs text-stone-500 space-y-1">
            {batches.map((b) => (
              <li key={b.id} className="flex justify-between">
                <span className="truncate">{b.label}</span>
                <span>{b.row_count} rows · {fmtDate(b.imported_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Rows with matching UI (client filter) ---- */}
      {rows.length === 0 ? (
        <section className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-2">
          <p className="text-3xl">🏦</p>
          <p className="font-semibold">No statement rows yet</p>
          <p className="text-sm text-stone-500">
            Export a CSV from your bank&apos;s net-banking portal and import it above. Suggested first run:
            last month&apos;s statement, then match each credit to a verified contribution.
          </p>
        </section>
      ) : (
        <ReconcileClient
          initialRows={rows as StatementRowView[]}
          candidates={candidates}
          matchedIds={matchedIds}
          unmatchedCount={unmatched}
        />
      )}

      <p className="text-xs text-stone-400">
        Every import/match/unmatch is written to the append-only audit log. See the fund audit trail on{' '}
        <Link href="/fund" className="underline">Mission Fund</Link>.
      </p>
    </main>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-stone-500">{label}</span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </>
  );
}

function DiffLine({ label, paise }: { label: string; paise: number }) {
  const zero = paise === 0;
  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}</span>
      <span className={`font-semibold tabular-nums ${zero ? 'text-teal-700' : 'text-red-700'}`}>
        {zero ? '✓ ₹0' : formatPaise(paise)}
      </span>
    </div>
  );
}
