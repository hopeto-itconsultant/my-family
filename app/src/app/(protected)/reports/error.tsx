'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary for /reports.
 * If the ledger query or month math ever throws (unexpected null column,
 * bad ?month= value, DB hiccup), show a friendly retry card instead of
 * Next.js' generic "Application error" screen.
 */
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a server-side breadcrumb without leaking details to the UI.
    console.error('reports page failed:', error.digest ?? error.message);
  }, [error]);

  return (
    <main className="p-4 pb-24 max-w-xl mx-auto">
      <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-6 text-center space-y-3 mt-8">
        <p className="text-3xl">📊</p>
        <h1 className="text-lg font-bold">The report could not be generated</h1>
        <p className="text-sm text-stone-500">
          Something went wrong while reading the fund ledger for this month. No data was changed —
          just try again, or pick a different month.
        </p>
        <button
          onClick={reset}
          className="w-full rounded-xl bg-stone-800 text-white font-semibold py-3 active:bg-stone-900"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
