# ADR-060: Fallback télécommande — 3 couches (cloud → LAN auto → QR hotspot + PWA queue)

**Date** : 2026-04-18
**Statut** : Proposé
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

## Fichiers impactés

- `central-dashboard/src/app/features/remote/services/transport-resilience.service.ts` (nouveau).
- `central-dashboard/src/app/features/remote/services/offline-queue.service.ts` (nouveau).
- `central-dashboard/public/service-worker.js` + `manifest.json`.
- `raspberry/src/app/tv/hotspot-qr.component.ts` (nouveau, affichage QR sur TV).
- `raspberry/server/services/hotspot.service.js` — exposition PSK + rotation.

## Garde-fous anti-régression

- Smoke test : présence du Service Worker enregistré + manifest PWA valide.
- Test terrain : couper internet box → vérifier bascule LAN <3s + reconnexion cloud auto au retour.
