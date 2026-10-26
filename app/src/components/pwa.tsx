'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 9 PWA glue:
 *  - Registers /sw.js once per session.
 *  - Renders a persistent offline banner whenever connectivity drops.
 * The floating "Install app" banners were removed at the family's request;
 * installation still works via the browser's own UI (Chrome address-bar icon,
 * iOS Share → Add to Home Screen) because the manifest remains in place.
 * No secrets or data are stored here; caching policy lives in sw.js.
 */

export function PwaClient() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW failure must never break the app */
      });
    }
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <>
      {offline && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-50 bg-amber-600 text-white text-center text-xs font-semibold py-1.5 shadow"
        >
          You are offline — browsing cached pages only. Payments and posts will be blocked until you reconnect.
        </div>
      )}
    </>
  );
}

/** Disable submit buttons while offline — used by mutation-heavy client forms. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
