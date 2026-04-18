 
/**
 * Service Worker Neopro Dashboard — ADR-060 Phase 3 couche 3 (PWA).
 *
 * Stratégies :
 * - navigate (HTML) : network-first avec fallback cache (app shell) puis page offline
 * - assets statiques (JS/CSS/fonts/images même origine) : stale-while-revalidate
 * - API REST (/api/*) : network-only — JAMAIS de cache (réponses dynamiques par rôle)
 *
 * La file d'attente offline pour les commandes remote est gérée hors SW par
 * `offline-queue.service.ts` (localStorage FIFO). Le SW ne fait que servir
 * l'app shell et les assets pour une ouverture offline de l'UI.
 */

const VERSION = 'neopro-sw-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSETS_CACHE = `${VERSION}-assets`;
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('neopro-sw-') && !name.startsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isSameOriginStatic(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.(js|css|woff2?|ttf|png|jpe?g|svg|ico|webp|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // API — network-only, jamais cacher (auth, rôles, données fraîches)
  if (isApiRequest(url)) return;

  // Navigation HTML — network-first + fallback shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined);
          return resp;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match('/')) || (await cache.match('/index.html')) || Response.error();
        }),
    );
    return;
  }

  // Assets statiques — stale-while-revalidate
  if (isSameOriginStatic(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((resp) => {
            if (resp && resp.status === 200) cache.put(request, resp.clone());
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
  }
});
