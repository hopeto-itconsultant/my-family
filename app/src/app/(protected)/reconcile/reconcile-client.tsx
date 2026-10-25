'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LedgerCandidate, StatementRowView } from '@/lib/types';
import { formatPaise } from '@/lib/money';
import { MatchControls, RowFilter } from './reconcile-widgets';

/**
 * Client wrapper around the server-rendered statement rows: provides the
 * unmatched/matched/all filter and refreshes row data after match actions.
 */
export function ReconcileClient({
  initialRows,
  candidates,
  matchedIds,
  unmatchedCount,
}: {
  initialRows: StatementRowView[];
  candidates: LedgerCandidate[];
  matchedIds: string[];
  unmatchedCount: number;
}) {
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched'>('unmatched');
  const router = useRouter();

  // After a match/unmatch server action mutates data, the parent RSC payload
  // changes; Next re-renders this tree with fresh props automatically when we
  // call refresh() (done inside MatchControls). Nothing extra needed here.
  useEffect(() => {
    if (unmatchedCount === 0 && filter === 'unmatched') setFilter('all');
  }, [unmatchedCount, filter]);

  const visible = initialRows.filter((r) =>
    filter === 'all' ? true : filter === 'matched' ? r.matched_id !== null : r.matched_id === null,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-stone-700">Statement rows ({initialRows.length})</h2>
        <RowFilter value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-stone-500 bg-white ring-1 ring-stone-200 rounded-xl p-4 text-center">
          {filter === 'unmatched'
            ? '🎉 Every imported bank row is matched or explained.'
            : 'Nothing in this view.'}
        </p>
      ) : (
        <ul className="rounded-2xl bg-white ring-1 ring-stone-200 divide-y divide-stone-100 overflow-hidden">
          {visible.map((r) => {
            const credit = r.amount_paise > 0;
            return (
              <li key={r.id} className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.description}</p>
                  <p className="text-xs text-stone-500">
                    {r.txn_date}
                    {r.reference && <> · {r.reference}</>}
                    {r.statement_batches?.label && (
                      <span className="hidden sm:inline"> · {r.statement_batches.label}</span>
                    )}
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${credit ? 'text-teal-700' : 'text-red-700'}`}>
                    {credit ? '+' : '−'}{formatPaise(Math.abs(r.amount_paise))}
                  </p>
                </div>
                <MatchControls row={r} candidates={candidates} alreadyMatchedIds={matchedIds} />
              </li>
            );
          })}
        </ul>
      )}
      <button onClick={() => router.refresh()} className="text-xs text-stone-400 underline">
        ↻ Refresh rows
      </button>
    </section>
  );
}
