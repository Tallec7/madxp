# ADR-088: Scoreboard live multi-vendor — validation SaaS-first (F-15.2)

**Date** : 2026-04-23
**Statut** : Accepté
**Format** : Léger

---

## Contexte

F-15.2 vise l'intégration de consoles de marque (Bodet Scorepad, Stramatel) pour afficher un scoreboard live dans les overlays Neopro. Les simulateurs `sim-bodet-scorepad` et `sim-stramatel` (PROP-003) produisent déjà des trames binaires fidèles, mais le connecteur Pi byte-level est un gros investissement (parsing LRC, frame 0x33, retry série/Ethernet) et on ne sait pas encore quel est le bon modèle de données cloud-side. On veut valider le contrat **sim/connector → cloud → dashboard** avant de plomber le Pi.

## Décision

Introduire un canal **MatchState v1** normalisé qui contourne le Pi :

1. **Modèle unifié** `ScoreboardMatchState` (basket FIBA) — 13 champs côté routes : `vendor ∈ {bodet, stramatel, manual}`, `sport = 'basketball'`, `period`, `chronoMs`, `clockRunning`, `homeScore`, `guestScore`, `homeTeamFouls`, `guestTeamFouls`, `shotClockMs`, `timeoutActive ∈ {home, guest, null}`, `timeoutRemainingMs`.
2. **Push HTTP** `POST /api/scoreboard/:siteId/state` authentifié via `authenticateSiteApiKey` (Bearer), validé Joi, guard cross-site (`req.siteId === req.params.siteId`). Pas de rate limiter global sur le mount (ADR-087).
3. **Repository in-memory** avec TTL 60s — suffisant pour le live overlay, pas besoin de persister.
4. **Broadcast Socket.IO** `socketService.emitScoreboardState(siteId, state)` → room `siteId`. Les dashboards rejoignent la room via `dashboard-subscribe-site` (pattern ADR-078).
5. **Dashboard** : route `/scoreboard-live/:siteId`, hydratation `GET /api/scoreboard/:siteId/state` + listener temps réel.
6. Les simulateurs Bodet/Stramatel exposent un module `cloud-push.js` + flags CLI (`--push-url`, `--site-id`, `--site-api-key`, `--push-interval`) qui dédupliquent les payloads identiques (JSON string) et maintiennent un seul inflight.

Le connecteur Pi (PROP-003 v2) n'est plus bloquant pour F-15.2 : quand il arrivera, il réutilise exactement le même contrat (même endpoint, même modèle, même broadcast).

## Alternatives rejetées

- **Pi-first** (connecteur serial-to-TCP + parseur byte-level) : rejeté car invalide le contrat cloud avant que le Pi soit prêt ; risque de casser le dashboard en prod quand on branche un vrai Pi.
- **WebSocket direct sim → dashboard** : rejeté car court-circuite l'auth par site, casse le multi-tenant et empêche l'audit/history futur.
- **Persistance en DB immédiate** : rejeté car le live n'a pas besoin d'historique ; le TTL 60s suffit. L'historique arrivera avec une vraie table `match_events` si F-16 le demande.

## Conséquences

- **Positif** : sim → dashboard validable en local dès aujourd'hui avec n'importe quel site SaaS ; ouvre F-15.3 (overlays TV) sans dépendance Pi ; le même endpoint accepte une future entrée `vendor: 'manual'` depuis la Remote dashboard.
- **Négatif** : état live perdu au restart du central (pas de Redis derrière le repo in-memory) — acceptable pour F-15.2, à revisiter si F-15.3 exige plusieurs instances.
- **Risque** : si plusieurs consoles poussent sur le même `siteId`, le `vendor` oscille — documenté, la solution est de contraindre une console active par site (champ à ajouter si besoin).

## Fichiers impactés

- `central-server/src/repositories/scoreboard-state.repository.ts` — repo in-memory + TTL 60s
- `central-server/src/validators/scoreboard.validator.ts` — Joi schema MatchState v1
- `central-server/src/controllers/scoreboard.controller.ts` — POST (guard cross-site) + GET
- `central-server/src/routes/scoreboard.routes.ts` — auth site-key + Joi
- `central-server/src/services/socket.service.ts` — `emitScoreboardState()`
- `central-server/src/server.ts` — mount `/api/scoreboard` hors rate limiter global
- `central-server/src/__tests__/smoke/smoke-scoreboard-saas.test.ts` — 11 tests de wiring
- `raspberry/scripts/sim-bodet-scorepad/src/cloud-push.js` + `test/cloud-push.test.js`
- `raspberry/scripts/sim-stramatel/src/cloud-push.js` + `test/cloud-push.test.js`
- `central-dashboard/src/app/features/scoreboard-live/scoreboard-live.component.ts`
- `central-dashboard/src/app/core/services/socket.service.ts` — listener + subscribe helpers
- `central-dashboard/src/app/app.routes.ts` — route `/scoreboard-live/:siteId`

## Phase 2 — Simulateur Table de marque dans le dashboard (2026-04-23)

Étendu F-15.2 avec un simulateur **interne au dashboard** (pas d'agent externe requis) pour valider le contrat sim → cloud → dashboard depuis n'importe quel navigateur authentifié.

### Ajouts

1. **Endpoint manuel** `POST /api/scoreboard/:siteId/state-manual` — mêmes payload et broadcast que Phase 1, mais authentifié via **JWT** au lieu d'`authenticateSiteApiKey`. Rôles autorisés : `admin`, `operator`, `club` (super_admin bypass implicite). Les clubs sont scopés à leur propre site via `requireRole` + guard explicite côté controller (`req.user.site_id !== siteId` → 403).
2. **Composant `ScoreboardSimulatorComponent`** (standalone, signals-based) intégré comme onglet dans `/admin/local` (LocalAdminComponent). UI temps réel : sélecteur site, vendor radio (bodet/stramatel/manual), chrono + shot-clock auto-tick 100ms, boutons scores/fautes/timeout, RESET MATCH, push auto debounced 300ms.
3. **Service `ScoreboardSimulatorService`** — wrapper ApiService pour `GET /api/sites` et `POST /scoreboard/:siteId/state-manual`.

### Pourquoi deux endpoints distincts ?

- Phase 1 (`/state`) reste réservée aux **agents externes** (sims Bodet/Stramatel, futurs connecteurs Pi) qui connaissent une `api_key` site.
- Phase 2 (`/state-manual`) est réservée aux **humains authentifiés** dans le dashboard — pas besoin de distribuer des api_key aux opérateurs.
- Mixer les deux auth schemes dans un seul handler complique la matrice sécurité et rend les smoke tests ambigus.

### Fichiers impactés (Phase 2)

- `central-server/src/controllers/scoreboard.controller.ts` — `postScoreboardStateManual`
- `central-server/src/routes/scoreboard.routes.ts` — route `/state-manual` JWT + requireRole + Joi
- `central-server/src/__tests__/smoke/smoke-scoreboard-saas.test.ts` — 2 tests de wiring Phase 2
- `central-dashboard/src/app/features/admin/local-admin/scoreboard-simulator/` — composant + service
- `central-dashboard/src/app/features/admin/local-admin/local-admin.component.ts` — intégration onglet
