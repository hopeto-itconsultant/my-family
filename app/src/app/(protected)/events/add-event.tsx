'use client';

import { useMemo, useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { createEvent, type ActionResult } from '@/app/actions/events';
import type { EventKind } from '@/lib/types';

interface PersonOption {
  id: string;
  name: string;
}
interface BranchOption {
  id: string;
  name: string;
}

const KINDS: { value: EventKind; label: string; icon: string }[] = [
  { value: 'birthday', label: 'Birthday', icon: '🎂' },
  { value: 'anniversary', label: 'Anniversary', icon: '💞' },
  { value: 'meetup', label: 'Meetup', icon: '📅' },
];

/** Bottom-sheet form to propose/add an event (RLS decides what is allowed). */
export function AddEventSheet({ people, branches }: { people: PersonOption[]; branches: BranchOption[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>('meetup');
  const [title, setTitle] = useState('');
  const [occursOn, setOccursOn] = useState('');
  const [memberId, setMemberId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [venue, setVenue] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  const sortedPeople = useMemo(
    () => [...people].sort((x, y) => x.name.localeCompare(y.name)),
    [people],
  );

  const needsMember = kind !== 'meetup';
  const canSubmit = title.trim() !== '' && occursOn !== '' && (!needsMember || memberId !== '') && !isPending;

  function submit() {
    if (!canSubmit) return;
    setResult(null);
    startTransition(async () => {
      const res = await createEvent({
        kind,
        title,
        occurs_on: occursOn,
        member_id: needsMember ? memberId : (memberId || null),
        branch_id: branchId || null,
        venue: venue || null,
      });
      setResult(res);
      if (res.ok) {
        setTitle('');
        setOccursOn('');
        setMemberId('');
        setBranchId('');
        setVenue('');
        setOpen(false);
      }
    });
  }

  const fieldCls =
    'mt-1 w-full rounded-xl border-0 bg-stone-100 px-3 py-2.5 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-teal-600';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-stone-500';

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="shrink-0 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
      >
        + Add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add event"
        >
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">New event</h2>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full bg-stone-100 text-stone-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className={labelCls}>
              Type
              <div className="mt-1 grid grid-cols-3 gap-2 normal-case tracking-normal">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={
                      'rounded-xl px-2 py-2 text-xs font-medium ring-1 transition ' +
                      (kind === k.value
                        ? 'bg-teal-700 text-white ring-teal-700'
                        : 'bg-stone-50 text-stone-700 ring-stone-300')
                    }
                  >
                    {k.icon} {k.label}
                  </button>
                ))}
              </div>
            </div>

            <label className={labelCls}>
              Title
              <input
                className={fieldCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'meetup' ? 'Family get-together, Chennai' : 'Arun’s birthday'}
              />
            </label>

            <label className={labelCls}>
              Date
              <input
                type="date"
                className={fieldCls}
                value={occursOn}
                onChange={(e) => setOccursOn(e.target.value)}
              />
            </label>

            <label className={labelCls}>
              {needsMember ? 'Honouring member *' : 'Host member (optional)'}
              <select className={fieldCls} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Select…</option>
                {sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {branches.length > 0 && (
              <label className={labelCls}>
                Branch (optional)
                <select className={fieldCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Whole family</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === 'meetup' && (
              <label className={labelCls}>
                Venue (optional)
                <input
                  className={fieldCls}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Community hall, …"
                />
              </label>
            )}

            {result && !result.ok && (
              <p className="text-sm rounded-xl bg-red-50 text-red-800 ring-1 ring-red-200 p-3">{result.error}</p>
            )}

            <button
              onClick={submit}
              disabled={!online || !canSubmit}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99] transition"
            >
              {isPending ? 'Saving…' : 'Save event'}
            </button>

            <p className="text-[11px] leading-relaxed text-stone-500">
              Coordinators can add any event. Members may add their own birthday —
              it appears once approved data lands in the shared calendar.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
