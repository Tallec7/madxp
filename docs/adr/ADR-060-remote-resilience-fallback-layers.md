# ADR-060: Fallback télécommande — 3 couches (cloud → LAN auto → QR hotspot + PWA queue)

**Date** : 2026-04-18
**Statut** : Accepté (complet — 3 couches implémentées, hotspot Pi + PWA livrés)
**Format** : Léger
**Phase** : 3 du plan refonte télécommande (dépend de ADR-059)

---

## Contexte

Les clubs ont un WiFi instable (salle de sport, sous-sol béton, CPL vieillissant). Aujourd'hui, si le dashboard cloud perd la connexion, la télécommande est **muette** jusqu'au retour réseau — un match en cours ne peut plus être piloté. Les 3 modes de défaillance observés sur le terrain : (1) box internet KO, Pi toujours sur LAN ; (2) Pi isolé, pas de LAN, pas d'internet ; (3) remote qui sort du WiFi (déplacement staff).

## Décision

Implémenter un **fallback en 3 couches** activé automatiquement selon la connectivité détectée :

1. **LAN auto** : découverte `neopro.local` (mDNS) → bascule URL silencieuse `cloud → http://neopro.local` quand le Pi est atteignable en LAN mais le cloud KO.
2. **QR hotspot** : le Pi expose un hotspot WiFi de secours ; la TV affiche un QR code avec les credentials, le remote scanne → bascule transport `hotspot://`.
3. **PWA + offline queue** : Service Worker + IndexedDB pour bufferiser les commandes quand aucun transport ne fonctionne, rejouées en ordre avec séquence number (ADR-059) dès reconnexion.

Un bandeau statut évolutif informe l'utilisateur (`cloud` / `LAN` / `hotspot` / `offline`).

## Alternatives rejetées

- **Bluetooth LE direct remote↔Pi** : rejeté — portée limitée (10m), pairing complexe, UX smartphone pénible.
- **SMS fallback** : latence + coût + pas de support par opérateur fiable en France rurale.
- **Ignorer le mode offline** : inacceptable pour un club dont le match doit se jouer malgré tout.

## Conséquences

- Résilience réelle : un match peut continuer même avec internet coupé.
- Complexité transport : 3 codepaths à maintenir (cloud WS, LAN HTTP, offline queue).
- Sécurité hotspot : WPA2 avec PSK rotatif journalier (logs admin).
- PWA nécessite HTTPS stable côté dashboard — déjà le cas (Hostinger SSL).

## Fichiers implémentés (Phase 1 — couches 1+3 dashboard)

- `central-dashboard/src/app/features/remote/services/transport-resilience.service.ts` (nouveau) — probe mDNS `neopro.local`, mode `cloud`/`lan`/`offline`, `getApiBaseUrl()`.
- `central-dashboard/src/app/features/remote/services/offline-queue.service.ts` (nouveau) — buffer localStorage FIFO, `drain()` sur reconnexion.
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — abonnement `transport.mode$`, drain automatique, exposition `transportMode` + `offlinePendingCount`.

## Fichiers implémentés (Phase 2 — couche 2 hotspot Pi + PWA dashboard)

- `raspberry/server/services/hotspot.service.js` — lecture status hotspot depuis `configuration.json.hotspot`, génération payload QR `WIFI:T:WPA;...` (rotation PSK restée côté sync-agent).
- `raspberry/server/routes/hotspot.js` — routes `GET /api/hotspot/status` (sans password) + `GET /api/hotspot/qr-payload` (avec password, local uniquement).
- `raspberry/src/app/components/hotspot-qr/hotspot-qr.component.ts` — overlay TV, fetch status + rendu QR via `qrcode` (data URL PNG), polling 60s tant que visible.
- `raspberry/src/app/components/tv/tv.component.{ts,html}` — intégration overlay, déclenchement via `?fallback=hotspot`.
- `central-dashboard/src/manifest.webmanifest` — manifest PWA (name, icons, theme `#0b1020`, display standalone).
- `central-dashboard/src/sw.js` — Service Worker v1 : navigate network-first + shell fallback, assets same-origin stale-while-revalidate, API **network-only** (aucune mise en cache des réponses `/api/*`).
- `central-dashboard/src/index.html` — `<link rel="manifest">` + enregistrement SW conditionnel (try/catch silencieux).
- `central-dashboard/angular.json` — copie `manifest.webmanifest` et `sw.js` en racine du build.

## Runbook tests terrain

- `docs/technical/REMOTE_FIELD_TESTS_T1-T15.md` — Phase 6 : banc de test, 15 tests structurés (T1-T15), critères tolérance, procédure post-tests.

## Garde-fous anti-régression

- Smoke test : `TransportResilienceService` + `OfflineQueueService` présents et câblés dans le composant.
- Smoke test : route `/api/hotspot/status` montée dans `server.js` + `hotspot.service.js` existant.
- Smoke test : `manifest.webmanifest` + `sw.js` copiés en assets angular + référencés dans `index.html`.
- Test terrain : couper internet box → vérifier bascule LAN <3s + reconnexion cloud auto au retour (T5).
- Test terrain : scan QR depuis iPhone, connexion hotspot < 15s, remote opérationnelle (T6).
- Sécurité SW : jamais de cache sur `/api/*` — vérifié par invariant statique dans `sw.js` (`isApiRequest` → return avant respondWith).
