/**
 * Neopro TV — Service Worker (E-23 US-23.7.3)
 *
 * Minimal service worker enabling PWA installation on PC browsers.
 * PWA "standalone" mode bypasses the browser autoplay-with-sound restriction,
 * which is the primary reason this service worker exists.
 *
 * Autoplay sound strategy:
 * - On first user interaction (click/touch), post 'audio-unlocked' to all clients
 * - Clients call AudioContext.resume() to permanently unlock audio playback
 * - This is necessary because standalone PWA mode alone is insufficient on some
 *   browsers (Chrome Android, older Safari) without a prior user gesture
 *
 * Caching strategy: network-first for all requests (the Pi runs a local server,
 * so offline caching adds no value — the server IS the content source).
 */

const SW_VERSION = '1.2.0';

// Install: activate immediately (no precaching needed)
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: claim all clients so the SW takes effect without page reload
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch: a listener must exist for PWA installability, but we deliberately
// do NOT call event.respondWith() — the browser handles every fetch natively.
// Calling respondWith(fetch(req)) looks like a no-op but is harmful: if the
// network fetch rejects, the SW turns a transient hiccup into a hard
// "network error response" that kills the page load.
self.addEventListener('fetch', () => {
  // pass-through — browser handles it
});

// Audio unlock: relay first-interaction signal from any client to all clients.
// The Angular app posts 'audio-unlock-request' on first click/touch,
// and this SW broadcasts 'audio-unlocked' to all windows so every tab
// can resume its AudioContext (required for autoplay with sound).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'audio-unlock-request') {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'audio-unlocked' });
      });
    });
  }
});
