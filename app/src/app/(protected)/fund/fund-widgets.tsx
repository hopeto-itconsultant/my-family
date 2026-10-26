'use client';

import { useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import {
  recordPayment, verifyContribution, rejectContribution, reverseContribution,
  approveExpense, rejectExpense, reverseExpense, payExpense, submitExpenseRequest,
  type ActionResult,
} from '@/app/actions/fund';
import type { Contribution, Expense, PaymentMethod, ProfileWithBranch } from '@/lib/types';
import { METHOD_LABELS } from '@/lib/types';
import { formatPaise } from '@/lib/money';

const inputCls = 'w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-sm bg-white';

function useSheet() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-stone-400 text-xl px-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>;
}

// ---------------------------------------------------------------------------
// TREASURER ONLY: record a contribution on behalf of a member. Manual entry —
// saved as PENDING until the treasurer confirms receipt and verifies it.
// ---------------------------------------------------------------------------
export function RecordPaymentSheet({ directory }: { directory: ProfileWithBranch[] }) {
  const { open, setOpen } = useSheet();
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [monthly, setMonthly] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('upi_online');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  const monthRef = new Date().toISOString().slice(0, 7); // YYYY-MM pledge bucket

  function submit() {
    setResult(null);
    start(async () => {
      const res = await recordPayment({ memberId, amountRupees: amount, monthRef: monthly ? monthRef : '', method, note });
      setResult(res);
      if (res.ok) {
        setMemberId(''); setAmount(''); setNote('');
        setTimeout(() => setOpen(false), 1200);
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold active:bg-teal-800">
        ➕ Record a payment
      </button>
      {open && (
        <Sheet title="Record a contribution (manual)" onClose={() => setOpen(false)}>
          <p className="text-xs rounded-lg bg-amber-50 text-amber-900 ring-1 ring-amber-200 px-3 py-2">
            New entries start as <b>awaiting verification</b> and are <b>not counted in the balance</b>{' '}
            until you confirm the money was actually received (UPI credit seen, or cash counted).
          </p>
          <label className="block text-xs font-medium text-stone-500">Who paid?</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputCls}>
            <option value="">Select member…</option>
            {directory.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}{p.branches?.name ? ` · ${p.branches.name}` : ''}</option>
            ))}
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
            placeholder="Amount ₹" className={inputCls} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} className="h-4 w-4 accent-teal-700" />
            Monthly contribution ({monthRef}) — untick for a voluntary gift
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`text-sm rounded-full px-3 py-1.5 ring-1 ${method === m ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-stone-600 ring-stone-300'}`}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200}
            placeholder="Note (optional) — e.g. paid by elder son on behalf" className={inputCls} />
          <ErrorNote result={result} />
          {result?.ok && <p className="text-sm text-teal-700">Saved ✓ now awaiting verification.</p>}
          <button onClick={submit} disabled={!online || !memberId || amount.trim() === '' || isPending}
            className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold disabled:opacity-40">
            {isPending ? 'Saving…' : 'Save as pending'}
          </button>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// TREASURER: verify / reject / reverse a contribution
// ---------------------------------------------------------------------------
export function VerifyControls({ c, names }: { c: Contribution; names: Record<string, string> }) {
  const { open, setOpen } = useSheet();
  const [mode, setMode] = useState<'verify' | 'reject' | 'reverse'>('verify');
  const [field, setField] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  const label = c.status === 'verified' ? 'Reverse'
    : c.status === 'rejected' || c.status === 'reversed' ? null : 'Review';
  if (!label) return null;

  function submit() {
    setResult(null);
    start(async () => {
      let res: ActionResult;
      if (mode === 'verify') res = await verifyContribution(c.id, field);
      else if (mode === 'reject') res = await rejectContribution(c.id, field);
      else res = await reverseContribution(c.id, field);
      setResult(res);
      if (res.ok) setTimeout(() => setOpen(false), 800);
    });
  }

  return (
    <>
      <button onClick={() => { setMode(c.status === 'verified' ? 'reverse' : 'verify'); setField(''); setOpen(true); }}
        className="text-xs rounded-full bg-teal-700 text-white px-3 py-1.5 shrink-0">
        {label}
      </button>
      {open && (
        <Sheet title={`${names[c.member_id] ?? 'Member'} · ${formatPaise(c.amount_paise)} · ${METHOD_LABELS[c.method] ?? c.method}`} onClose={() => setOpen(false)}>
          {c.note && <p className="text-sm text-stone-600">Note: “{c.note}”</p>}
          {c.bank_ref && <p className="text-sm text-stone-600">Stored ref: <code>{c.bank_ref}</code></p>}
          {c.status !== 'verified' && (
            <div className="flex gap-2">
              <button onClick={() => setMode('verify')} className={`text-sm rounded-full px-3 py-1.5 ring-1 ${mode === 'verify' ? 'bg-teal-700 text-white ring-teal-700' : 'ring-stone-300'}`}>✔ Confirm received</button>
              <button onClick={() => setMode('reject')} className={`text-sm rounded-full px-3 py-1.5 ring-1 ${mode === 'reject' ? 'bg-red-600 text-white ring-red-600' : 'ring-stone-300'}`}>✖ Reject</button>
            </div>
          )}
          <input value={field} onChange={(e) => setField(e.target.value)}
            placeholder={mode === 'verify' ? 'UPI RRN / bank ref, or “CASH · voucher no.”'
              : mode === 'reject' ? 'Reason for rejection' : 'Why is this reversal needed?'}
            className={inputCls} maxLength={200} />
          <p className="text-xs text-stone-500">
            Only confirm after the money is actually in hand — UPI credit seen in the app/passbook,
            or cash physically counted. This action is audited.
          </p>
          <ErrorNote result={result} />
          <button onClick={submit} disabled={!online || field.trim().length < 3 || isPending}
            className="w-full rounded-xl bg-stone-800 text-white py-3 font-semibold disabled:opacity-40">
            {isPending ? 'Working…' : mode === 'verify' ? 'Confirm received' : mode === 'reject' ? 'Reject entry' : 'Record reversal'}
          </button>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Expenses: treasurer records + controls
// ---------------------------------------------------------------------------
export function ExpenseRequestSheet() {
  const { open, setOpen } = useSheet();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  function submit() {
    setResult(null);
    start(async () => {
      const res = await submitExpenseRequest({ title, purpose, amountRupees: amount });
      setResult(res);
      if (res.ok) { setTitle(''); setPurpose(''); setAmount(''); setTimeout(() => setOpen(false), 900); }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-sm rounded-full ring-1 ring-stone-300 bg-white px-4 py-2">+ Record expense</button>
      {open && (
        <Sheet title="Record a fund expense" onClose={() => setOpen(false)}>
          <p className="text-xs text-stone-500">Goes to your own approval queue. Nothing is paid out until approved <i>and</i> a receipt is attached.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Hall booking for meet-up)" className={inputCls} maxLength={160} />
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} maxLength={600} placeholder="Purpose / justification" className={inputCls} />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount ₹" className={inputCls} />
          <ErrorNote result={result} />
          <button onClick={submit} disabled={!online || !title.trim() || !amount.trim() || isPending}
            className="w-full rounded-xl bg-teal-700 text-white py-3 font-semibold disabled:opacity-40">
            {isPending ? 'Saving…' : 'Save expense (awaiting approval)'}
          </button>
        </Sheet>
      )}
    </>
  );
}

export function ExpenseControls({ e, names, receiptUrl }: { e: Expense; names: Record<string, string>; receiptUrl: string | null }) {
  const { open, setOpen } = useSheet();
  const [mode, setMode] = useState<'approve' | 'reject' | 'pay' | 'reverse'>('approve');
  const [field, setField] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, start] = useTransition();
  const online = useOnline();

  function openAs(m: typeof mode) { setMode(m); setField(''); setFile(null); setResult(null); setOpen(true); }

  function submit() {
    setResult(null);
    start(async () => {
      let res: ActionResult;
      if (mode === 'approve') res = await approveExpense(e.id);
      else if (mode === 'reject') res = await rejectExpense(e.id, field);
      else if (mode === 'reverse') res = await reverseExpense(e.id, field);
      else res = await payExpense({ id: e.id, bankRef: field, receiptFile: file, existingReceiptPath: e.receipt_path });
      setResult(res);
      if (res.ok) setTimeout(() => setOpen(false), 800);
    });
  }

  const canApprove = e.status === 'submitted';
  const canPay = e.status === 'approved';
  const canReject = e.status === 'submitted' || e.status === 'approved';
  const canReverse = e.status === 'paid';

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {canApprove && <button onClick={() => openAs('approve')} className="text-xs rounded-full bg-teal-700 text-white px-3 py-1.5">✔ Approve</button>}
      {canReject && <button onClick={() => openAs('reject')} className="text-xs rounded-full ring-1 ring-red-200 text-red-700 px-3 py-1.5">✖ Reject</button>}
      {canPay && <button onClick={() => openAs('pay')} className="text-xs rounded-full bg-stone-800 text-white px-3 py-1.5">💸 Pay & attach receipt</button>}
      {canReverse && <button onClick={() => openAs('reverse')} className="text-xs rounded-full ring-1 ring-amber-300 text-amber-800 px-3 py-1.5">↩ Reverse</button>}
      {receiptUrl && (
        <a href={receiptUrl} target="_blank" rel="noreferrer"
          className="text-xs rounded-full ring-1 ring-stone-300 text-stone-600 px-3 py-1.5">🧾 Receipt</a>
      )}
      {open && (
        <Sheet title={`${e.title} · ${formatPaise(e.amount_paise)}`} onClose={() => setOpen(false)}>
          <p className="text-sm text-stone-600">Recorded by {names[e.requested_by] ?? 'treasurer'}{e.purpose ? ` — ${e.purpose}` : ''}</p>
          {mode === 'approve' && <p className="text-xs text-stone-500">Approval does not move money. Later payment requires a receipt + reference.</p>}
          {(mode === 'reject' || mode === 'reverse') && (
            <input value={field} onChange={(ev) => setField(ev.target.value)} className={inputCls}
              placeholder={mode === 'reject' ? 'Reason for rejection' : 'Why reverse this payment?'} maxLength={200} />
          )}
          {mode === 'pay' && (
            <>
              <input value={field} onChange={(ev) => setField(ev.target.value)} className={inputCls} placeholder="Outbound UPI/bank ref, or “CASH”" maxLength={80} />
              <input type="file" accept="image/*,application/pdf" className={inputCls}
                onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
              <p className="text-xs text-stone-500">Receipt is stored in private storage; only the treasurer can upload/manage it.</p>
            </>
          )}
          <ErrorNote result={result} />
          <button onClick={submit}
            disabled={!online || ((mode !== 'approve') && field.trim().length < 3)}
            className="w-full rounded-xl bg-stone-800 text-white py-3 font-semibold disabled:opacity-40">
            {isPending ? 'Working…' : mode === 'approve' ? 'Approve expense' : mode === 'reject' ? 'Reject' : mode === 'pay' ? 'Mark paid' : 'Record reversal'}
          </button>
        </Sheet>
      )}
    </div>
  );
}
