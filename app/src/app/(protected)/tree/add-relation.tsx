'use client';

import { useMemo, useState, useTransition } from 'react';
import { useOnline } from '@/components/pwa';
import { addRelation, type ActionResult } from '@/app/actions/tree';
import type { RelationKind } from '@/lib/types';

interface PersonOption {
  id: string;
  name: string;
}

const KINDS: { value: RelationKind; label: string }[] = [
  { value: 'parent', label: 'Parent ↔ child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
];

/**
 * Bottom-sheet style form (matches Mission Fund prototype patterns).
 * Server action + RLS are the real gate — this UI just collects input.
 */
export function AddRelationSheet({ people }: { people: PersonOption[] }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [kind, setKind] = useState<RelationKind>('parent');
  // For kind='parent': which person is the child? ('a' | 'b')
  const [child, setChild] = useState<'a' | 'b'>('b');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const online = useOnline();

  const sortedPeople = useMemo(
    () => [...people].sort((x, y) => x.name.localeCompare(y.name)),
    [people],
  );

  const canSubmit = a !== '' && b !== '' && a !== b && !isPending;

  function submit() {
    if (!canSubmit) return;
    setResult(null);
    startTransition(async () => {
      const res = await addRelation({
        a,
        b,
        kind,
        childIsA: kind === 'parent' ? child === 'a' : undefined,
      });
      setResult(res);
      if (res.ok) {
        setA('');
        setB('');
        setOpen(false);
      }
    });
  }

  const selectCls =
    'w-full rounded-xl border-0 bg-stone-100 px-3 py-2.5 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-teal-600';

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="shrink-0 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
      >
        + Link
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Link two relatives"
        >
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Link two relatives</h2>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full bg-stone-100 text-stone-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Relationship
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
                    {k.label}
                  </button>
                ))}
              </div>
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
                Person A
                <select className={selectCls + ' mt-1'} value={a} onChange={(e) => setA(e.target.value)}>
                  <option value="">Select…</option>
                  {sortedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
                Person B
                <select className={selectCls + ' mt-1'} value={b} onChange={(e) => setB(e.target.value)}>
                  <option value="">Select…</option>
                  {sortedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {kind === 'parent' && a && b && a !== b && (
              <fieldset className="rounded-xl bg-stone-50 ring-1 ring-stone-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Who is the child?
                </legend>
                <div className="flex gap-2">
                  {(['a', 'b'] as const).map((who) => {
                    const person = who === 'a' ? a : b;
                    const name = sortedPeople.find((p) => p.id === person)?.name ?? '';
                    return (
                      <button
                        key={who}
                        type="button"
                        onClick={() => setChild(who)}
                        className={
                          'flex-1 truncate rounded-xl px-3 py-2 text-sm font-medium ring-1 transition ' +
                          (child === who
                            ? 'bg-teal-700 text-white ring-teal-700'
                            : 'bg-white text-stone-700 ring-stone-300')
                        }
                      >
                        {name} is child
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {result && !result.ok && (
              <p className="text-sm rounded-xl bg-red-50 text-red-800 ring-1 ring-red-200 p-3">
                {result.error ?? 'Could not save the relation.'}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!online || !canSubmit}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99] transition"
            >
              {isPending ? 'Saving…' : 'Save relation'}
            </button>

            <p className="text-[11px] leading-relaxed text-stone-500">
              Relations are visible to all signed-in relatives and every change is
              recorded in the audit log. Only the treasurer and admins can edit the
              tree (enforced by database policies, not just this screen).
            </p>
          </div>
        </div>
      )}
    </>
  );
}
