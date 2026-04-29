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
 * Caching strategy: aucune. Le Pi sert le contenu localement, le cache offline
 * n'a aucune valeur ici — le serveur EST la source de contenu.
 *
 * Pas de listener `fetch` : depuis Chrome 89 (2021), l'installabilité PWA ne
 * requiert plus de fetch handler (manifest + SW enregistré suffisent). Un
 * listener vide ajoute un overhead par navigation pour zéro bénéfice — voir
 * le warning Chromium "Fetch event handler is recognized as no-op".
 */

const SW_VERSION = '1.3.0';

// Install: activate immediately (no precaching needed)
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: claim all clients so the SW takes effect without page reload
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
