'use client';

import { usePathname } from 'next/navigation';

/** Persistent strip. Exit posts to a route the read-only gate allows through. */
export function ViewAsBanner({ name }: { name: string }) {
  const pathname = usePathname() || '/members';
  return (
    <form
      action="/view-as/exit"
      method="post"
      data-view-as-banner
      className="flex items-center gap-3 bg-amber-300 px-4 py-2 text-amber-950"
    >
      <input type="hidden" name="next" value={pathname} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">Viewing as {name} —</p>
        <p className="text-xs leading-snug text-amber-950/80">
          Read-only. Stops automatically after 30 minutes.
        </p>
      </div>
      <button
        type="submit"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-amber-950 px-4 text-sm font-bold text-amber-50 active:bg-black"
      >
        Exit
      </button>
    </form>
  );
}
