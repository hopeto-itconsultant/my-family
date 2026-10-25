/* Our Family Home — service worker (Phase 9)
 *
 * Policy, deliberately conservative for a private app with financial data:
 *  - Supabase API calls (/auth, /rest, /storage): NETWORK ONLY. Never cached.
 *    If offline, pages show their own "offline" banner instead of stale data.
 *  - App-shell navigations: network-first with a cached fallback so an
 *    installed PWA can open the last visited protected page while offline
 *    (read-only; all mutations are blocked client-side when navigator is off).
 *  - Static assets (icons, fonts, hashed JS/CSS): cache-first, long TTL.
 */

const VERSION = 'ofh-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isSupabaseApi(url) {
  return url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/sb/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept mutations

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // 1) Auth/Postgres/Storage — always hit the network, never store family data at rest.
  if (isSupabaseApi(url)) return;

  // 2) Navigations (app shell) — network first, cache as offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline')))
    );
    return;
  }

  // 3) Same-origin static assets — cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
