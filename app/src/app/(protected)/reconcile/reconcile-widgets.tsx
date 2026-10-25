'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { useRouter } from 'next/navigation';
import { parseStatementCsv, suggestLabel, type StatementRow } from '@/lib/csv';
import { importStatementBatch, matchStatementRow, unmatchStatementRow } from '@/app/actions/reconcile';
import type { ActionResult } from '@/app/actions/fund';
import type { LedgerCandidate, StatementRowView } from '@/lib/types';
import { formatPaise } from '@/lib/money';

const inputCls = 'w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-sm bg-white';

function ErrorNote({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>;
}

// ---------------------------------------------------------------------------
// Import sheet — pick the bank's CSV export, preview rows, confirm.
// Nothing is written until "Import" is pressed, and even then only statement
// tables are touched — never the ledger.
// ---------------------------------------------------------------------------
export function ImportSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [label, setLabel] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  function handleFile(file: File) {
    setParseError(null); setRows(null); setResult(null);
    if (!/\.csv$/i.test(file.name)) { setParseError('Please choose the .csv export from your bank.'); return; }
    if (file.size > 2 * 1024 * 1024) { setParseError('Statement file must be under 2 MB.'); return; }
    file.text().then((text) => {
      const r = parseStatementCsv(text);
      if (r.error) { setParseError(r.error); return; }
      setRows(r.rows);
      setSkipped(r.skipped);
      setFileName(file.name);
      if (!label) setLabel(suggestLabel(file.name, r.rows));
    });
  }

  function submit() {
    if (!rows) return;
    setResult(null);
    start(async () => {
      const res = await importStatementBatch(label, rows);
      setResult(res);
      if (res.ok) { setOpen(false); router.refresh(); }
    });
  }

  const netPaise = useMemo(
    () => (rows ?? []).reduce((s, r) => s + Math.round(Number(r.amountRupees) * 100), 0),
    [rows],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 shadow-sm active:bg-teal-800"
      >
        ⬆️ Import bank statement (CSV)
      </button>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Import statement</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 text-xl px-2">✕</button>
            </div>
            <p className="text-xs text-stone-500">
              Download a CSV from net-banking yourself, then upload it here. Bank data stays in the
              treasurer-only workspace — it never changes contribution or expense records.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-stone-300 py-6 text-sm text-stone-500 active:bg-stone-50"
            >
              {fileName ? `📄 ${fileName}` : 'Choose CSV file…'}
            </button>
            {parseError && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{parseError}</p>}

            {rows && (
              <>
                <div className="text-sm">
                  <span className="font-semibold">{rows.length}</span> valid row{rows.length === 1 ? '' : 's'}
                  {skipped > 0 && <> · <span className="text-amber-700">{skipped} skipped (bad date/amount)</span></>}
                  {' '}· net {formatPaise(netPaise)}
                </div>
                <ul className="max-h-40 overflow-y-auto divide-y divide-stone-100 text-xs">
                  {rows.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 py-1.5">
                      <span className="truncate text-stone-600">{r.date} · {r.description}</span>
                      <span className={Number(r.amountRupees) >= 0 ? 'text-teal-700 shrink-0' : 'text-red-700 shrink-0'}>
                        {Number(r.amountRupees) >= 0 ? '+' : '−'}₹{Math.abs(Number(r.amountRupees)).toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                  {rows.length > 8 && <li className="py-1.5 text-stone-400">…and {rows.length - 8} more</li>}
                </ul>
                <label className="block text-sm font-medium text-stone-700 space-y-1">
                  Batch label
                  <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
                </label>
                <ErrorNote result={result} />
                <button
                  onClick={submit}
                  disabled={!online || isPending || label.trim().length < 3}
                  className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50"
                >
                  {isPending ? 'Importing…' : `Import ${rows.length} row${rows.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Match controls — link one bank row to one verified/paid ledger record.
// ---------------------------------------------------------------------------
export function MatchControls({
  row,
  candidates,
  alreadyMatchedIds,
}: {
  row: StatementRowView;
  candidates: LedgerCandidate[];
  alreadyMatchedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  const wantIn = row.amount_paise > 0;
  const sorted = useMemo(() => {
    const options = candidates.filter(
      (c) => c.direction === (wantIn ? 'in' : 'out') && !alreadyMatchedIds.includes(c.id),
    );
    const abs = Math.abs(row.amount_paise);
    return [...options].sort((a, b) => Math.abs(a.amount_paise - abs) - Math.abs(b.amount_paise - abs));
  }, [candidates, alreadyMatchedIds, wantIn, row.amount_paise]);

  function choose(c: LedgerCandidate) {
    setResult(null);
    start(async () => {
      const res = await matchStatementRow(row.id, c.kind, c.id);
      setResult(res);
      if (res.ok) { setOpen(false); router.refresh(); }
    });
  }

  function unmatch() {
    setResult(null);
    start(async () => {
      const res = await unmatchStatementRow(row.id);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (row.matched_id) {
    return (
      <div className="text-right space-y-1 shrink-0">
        <p className="text-xs text-teal-700 font-medium">✓ {row.matched_kind}</p>
        <button onClick={unmatch} disabled={!online || isPending} className="text-xs text-stone-500 underline">unlink</button>
        <ErrorNote result={result} />
      </div>
    );
  }

  return (
    <div className="text-right shrink-0">
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-teal-700 ring-1 ring-teal-200 rounded-lg px-2.5 py-1.5 bg-teal-50 active:bg-teal-100"
      >
        Match…
      </button>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Match bank row</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 text-xl px-2">✕</button>
            </div>
            <p className="text-sm text-stone-600">
              {row.txn_date} · {row.description}{' '}
              <b className={wantIn ? 'text-teal-700' : 'text-red-700'}>
                {formatPaise(Math.abs(row.amount_paise))} {wantIn ? 'in' : 'out'}
              </b>
            </p>
            <p className="text-xs text-stone-500">
              Matching records evidence only. The ledger entry must already be{' '}
              {wantIn ? 'verified by you as treasurer' : 'paid with a receipt'} — pending pledges can never match bank money.
            </p>
            <ErrorNote result={result} />
            {sorted.length === 0 ? (
              <p className="text-sm text-stone-500 bg-stone-50 rounded-lg px-3 py-4 text-center">
                No unmatched {wantIn ? 'verified contributions' : 'paid expenses'} to pair with this row.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {sorted.slice(0, 30).map((c) => {
                  const exact = Math.abs(c.amount_paise) === Math.abs(row.amount_paise);
                  return (
                    <li key={c.id}>
                      <button onClick={() => choose(c)} className="w-full flex items-center justify-between gap-2 py-3 text-left active:bg-stone-50">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{c.label}</span>
                          <span className="block text-xs text-stone-500 truncate">
                            {c.kind === 'contribution' ? '💛 contribution' : '🧾 expense'} · {c.sub}
                          </span>
                        </span>
                        <span className={`text-sm font-semibold shrink-0 ${exact ? 'text-teal-700' : 'text-stone-500'}`}>
                          {formatPaise(c.amount_paise)}{exact && ' ✓'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Unmatched / matched filter for the statement list. */
export function RowFilter({
  value,
  onChange,
}: {
  value: 'all' | 'unmatched' | 'matched';
  onChange: (v: 'all' | 'unmatched' | 'matched') => void;
}) {
  const opts = ['unmatched', 'matched', 'all'] as const;
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`text-xs font-semibold rounded-full px-3 py-1.5 capitalize ${
            value === o ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
