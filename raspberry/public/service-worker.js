/**
 * Neopro TV — Service Worker (E-23 US-23.7.3)
 *
 * Minimal service worker enabling PWA installation on PC browsers.
 * PWA "standalone" mode bypasses the browser autoplay-with-sound restriction,
 * which is the primary reason this service worker exists.
 *
 * Caching strategy: network-first for all requests (the Pi runs a local server,
 * so offline caching adds no value — the server IS the content source).
 */

const SW_VERSION = '1.0.0';

// Install: activate immediately (no precaching needed)
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: claim all clients so the SW takes effect without page reload
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch: pass through to network (no caching — local server is always available)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
