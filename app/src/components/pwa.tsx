'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 9 PWA glue:
 *  - Registers /sw.js once per session.
 *  - Watches beforeinstallprompt so "Add to Home Screen" works on Chrome/Android
 *    and shows a small in-app hint (iOS users get the Share → Add to Home Screen tip).
 *  - Renders a persistent offline banner whenever connectivity drops.
 * No secrets or data are stored here; caching policy lives in sw.js.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaClient() {
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

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

    const bip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', bip);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setInstallEvent(null);
    });
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', bip);
      window.removeEventListener('appinstalled', () => {});
    };
  }, []);

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone);

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

      {!offline && installEvent && !installed && (
        <div className="fixed bottom-24 inset-x-3 z-40 mx-auto max-w-md rounded-xl bg-stone-900 text-white p-3 flex items-center justify-between gap-3 shadow-lg">
          <p className="text-sm">Install <b>Our Family Home</b> for one-tap access.</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setInstallEvent(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10"
            >
              Later
            </button>
            <button
              onClick={async () => {
                await installEvent?.prompt();
                setInstallEvent(null);
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-teal-500 font-semibold"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {!offline && isIOS && !installed && (
        <p className="fixed bottom-24 inset-x-0 z-30 mx-auto w-fit rounded-full bg-stone-900/90 text-white text-[11px] px-4 py-1.5">
          📲 iPhone: Share → “Add to Home Screen” to install
        </p>
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
