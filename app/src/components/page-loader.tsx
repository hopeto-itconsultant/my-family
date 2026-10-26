'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Global page-load indicator for the app shell.
 *
 * Strategy (works on plain Next.js 16 without extra deps):
 *  1. Tap feedback: the bottom tab bar highlights instantly (see
 *     NavigationShell) and we capture link clicks via delegation — the slim
 *     progress bar starts moving at once, so every tap feels acknowledged.
 *  2. Completion: when the pathname actually changes (usePathname) or the
 *     first content paint of the new route settles, the bar runs to 100% and
 *     fades. A safety timeout prevents a hanging bar on odd transitions.
 */
export function PageLoader() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'run' | 'done'>('run');
  const prevPath = useRef(pathname);
  const doneTimer = useRef<number | undefined>(undefined);

  // Start the bar on any in-app navigation intent (click on an internal link)
  // or programmatic router pushes triggered by our actions.
  useEffect(() => {
    const start = () => {
      window.clearTimeout(doneTimer.current);
      setPhase('run');
      setVisible(true);
      // Safety net: finish even if no route change follows (e.g. same-page).
      doneTimer.current = window.setTimeout(() => setPhase('done'), 2500);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const a = target?.closest?.('a');
      if (!a) return;
      try {
        const url = new URL(a.href, location.origin);
        const internal =
          url.origin === location.origin &&
          a.target !== '_blank' &&
          !a.hasAttribute('download') &&
          url.pathname !== location.pathname; // same-path links are anchors/state updates
        if (internal) start();
      } catch {
        /* malformed href — ignore */
      }
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(doneTimer.current);
    };
  }, []);

  // Route changed → let the streamed content paint, then complete the bar.
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      window.clearTimeout(doneTimer.current);
      // Small delay so RSC streaming has a moment before we hide the cue.
      doneTimer.current = window.setTimeout(() => setPhase('done'), 250);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => setVisible(false), 450);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (!visible) return null;

  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-[70] pointer-events-none">
      <div className="h-0.5 w-full overflow-hidden">
        <div
          className={
            'h-full rounded-r-full bg-teal-300 shadow-[0_0_10px_rgba(94,234,212,0.9)] transition-all ease-out ' +
            (phase === 'run'
              ? 'w-2/5 duration-[2200ms] [transition-timing-function:cubic-bezier(0.05,0.8,0.1,1)]'
              : 'w-full opacity-0 duration-300')
          }
        />
      </div>
    </div>
  );
}

/**
 * Suspense fallback for slow route segments: centered spinner that matches the
 * app shell so the screen never looks broken mid-navigation. Used from
 * loading.tsx files inside the (protected) group.
 */
export function RouteSpinner() {
  return (
    <div className="px-4 py-16 max-w-lg mx-auto flex flex-col items-center gap-3 text-stone-500">
      <span
        role="status"
        aria-label="Loading page"
        className="h-9 w-9 rounded-full border-[3px] border-teal-600/25 border-t-teal-700 animate-spin"
      />
      <p className="text-sm font-medium">Loading…</p>
    </div>
  );
}
