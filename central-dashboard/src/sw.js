/**
 * Service Worker Neopro Dashboard — KILL-SWITCH.
 *
 * Le SW PWA (ADR-060 Phase 3 couche 3) est temporairement désactivé : le déploiement
 * Hostinger ne distribuait pas ce fichier de manière fiable, ce qui provoquait des
 * erreurs MIME (`unsupported MIME type 'text/html'`) chez tous les users.
 *
 * Ce SW se désinscrit lui-même et vide tous les caches à l'activation. Les anciens
 * SW installés (cachant shell/assets) sont neutralisés au prochain passage du user
 * sur le dashboard, sans intervention manuelle.
 *
 * Pour réactiver la PWA plus tard : voir git log de ce fichier et restaurer la
 * version précédente APRES avoir mis en place un déploiement fiable de `sw.js`.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })(),
  );
});
