/**
 * Service Worker Neopro Dashboard — PWA Phase A (installable, sans cache).
 *
 * Objectif : permettre l'installation du dashboard comme app (icône bureau/mobile,
 * splash screen, mode standalone) SANS stratégie de cache offline. Chrome exige
 * un SW enregistré AVEC un listener 'fetch' pour afficher le prompt d'installation.
 *
 * Ce SW se contente d'exister : le fetch listener laisse tout passer au browser
 * (pas de cache, pas d'offline). Zéro risque de stale content ou de users coincés
 * sur une vieille version — chaque requête va directement au réseau.
 *
 * À l'activation, tous les anciens caches (kill-switch précédent ou SW v1 avec
 * caching) sont purgés pour garantir un état propre.
 *
 * Pour activer le vrai mode offline/cache plus tard : remplacer ce SW par une
 * version versionnée (voir git log) avec stratégies par type d'asset.
 */

const VERSION = 'neopro-installable-v1';

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

// Fetch listener requis par Chrome pour la popup d'installation.
// Pass-through : aucune interception, comportement réseau standard.
self.addEventListener('fetch', () => {
  // no-op
});
