# ADR-078: SaaS match state autoritatif + dashboard room subscription

**Date** : 2026-04-20
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-059 a introduit un broadcast `state-sync` autoritatif sur le Pi (`raspberry/server/services/state.service.js` + `state-broadcaster.js`) pour que les remotes voient toutes le même état. Deux failles sont restées sur les sites SaaS (ADR-037, pas de Pi) :

1. Aucun owner d'état côté cloud → chaque remote cloud mutait son état local, divergence entre utilisateurs regardant le même site.
2. Le dashboard cloud ne rejoignait jamais la room `siteId` dans `socket.service.ts` → `io.to(siteId).emit('state-sync')` ne touchait aucune remote cloud, même en mode Pi.

## Décision

Le central server devient autoritatif pour l'état de match des sites `site_type='saas'`, en miroir du Pi :

- Nouveau service singleton `saas-match-state.service.ts` (score, phase, timer, options, seq monotone par siteId).
- `remote.controller.ts` mute le state via `applySaasMatchMutation()` après chaque commande SaaS, puis broadcast `state-sync` dans la room `siteId`.
- `GET /api/remote/:siteId/state` renvoie `matchState` pour le late-join HTTP.
- `socket.service.ts` expose `dashboard-subscribe-site` / `dashboard-unsubscribe-site` pour que la remote dashboard rejoigne la room `siteId` (fix latent ADR-059 pour Pi ET SaaS).
- `cloud-remote.component.ts` subscribe à l'init, unsubscribe au destroy, applique `state.matchState` reçu en HTTP.

## Alternatives rejetées

- **Angular SaaS TV autoritative** : rejeté car la TV peut être fermée, aucun owner garanti.
- **CRDT côté client** : rejeté, overkill pour un état simple (score/phase/timer).
- **Étendre `saasStates` (tv-instances) au match state** : rejeté, séparation des responsabilités (tv master/slave vs match state).

## Conséquences

- Deux utilisateurs ouvrant la même remote SaaS voient maintenant le même état en temps réel + late-join cohérent.
- L'état SaaS vit en mémoire process → perdu au restart central-server (acceptable pour matchs <2h ; pas de persistance DB).
- Le smoke test `smoke-adr-refactoring` verrouille la structure (non-régression).

## Fichiers impactés

- `central-server/src/services/saas-match-state.service.ts` — nouveau singleton autoritatif.
- `central-server/src/controllers/remote.controller.ts` — `applySaasMatchMutation()` + broadcast `state-sync` + `matchState` dans `/state`.
- `central-server/src/services/socket.service.ts` — handlers `dashboard-subscribe-site` / `dashboard-unsubscribe-site`.
- `central-dashboard/src/app/core/services/remote.service.ts` — champ `matchState` sur `RemoteState`.
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — subscribe/unsubscribe room + apply `state.matchState`.
- `central-server/src/__tests__/smoke/smoke-adr-refactoring.test.ts` — regression guards ADR-078.
