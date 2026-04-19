/**
 * Service Worker Neopro Dashboard — PWA Phase A (installable, sans cache).
 *
 * Objectif : permettre l'installation du dashboard comme app (icône bureau/mobile,
 * splash screen, mode standalone) SANS stratégie de cache offline.
 *
 * Depuis Chrome 89 (2021), le prompt d'installation PWA ne requiert plus de
 * fetch handler — un SW enregistré + un manifest valide suffisent. On évite
 * donc le listener 'fetch' no-op (overhead inutile sur chaque navigation).
 *
 * À l'activation, tous les anciens caches sont purgés pour garantir un état
 * propre chez les users migrant depuis le SW v1 (caching) ou le kill-switch.
 *
 * Pour activer le vrai mode offline/cache plus tard : remplacer ce SW par une
 * version versionnée (voir git log) avec stratégies par type d'asset.
 */

const VERSION = 'neopro-installable-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});
