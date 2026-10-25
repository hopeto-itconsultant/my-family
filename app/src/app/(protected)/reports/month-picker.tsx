'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/** Simple YYYY-MM stepper that rewrites the ?month= query. */
export function MonthPicker({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);

  function shift(delta: number) {
    const [y, m] = current.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    setBusy(true);
    const p = new URLSearchParams(params.toString());
    p.set('month', next);
    router.push(`/reports?${p.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => shift(-1)} disabled={busy} aria-label="Previous month"
        className="h-9 w-9 rounded-lg bg-white ring-1 ring-stone-300 font-bold active:bg-stone-100 disabled:opacity-40">‹</button>
      <span className="text-sm font-semibold tabular-nums px-1">{current}</span>
      <button onClick={() => shift(1)} disabled={busy} aria-label="Next month"
        className="h-9 w-9 rounded-lg bg-white ring-1 ring-stone-300 font-bold active:bg-stone-100 disabled:opacity-40">›</button>
    </div>
  );
}
