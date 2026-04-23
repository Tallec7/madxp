# ADR-090: Unified scoreboard-state sync (Remote ↔ Simulator ↔ Display)

**Date** : 2026-04-23
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-088 a introduit `scoreboard-state` (MatchState v1) pour le simulateur Table de marque et les connecteurs vendors (Bodet, Stramatel). La Remote (cloud ou locale) utilisait toujours le flux legacy `score-update` / `timer-update`. Résultat : quand le simulateur poussait un état (5-9, Q1 10:00), le moindre +/- sur la Remote écrasait l'état cloud via `score-update`, qui arrivait après `scoreboard-state` sur la TV. Les deux canaux se battaient.

## Décision

`scoreboard-state` devient la **source de vérité unique** pour le duo score/chrono, quel que soit l'émetteur (simulateur dashboard, Remote SaaS, connecteur vendor). La Remote :

- **lit** `scoreboard-state` (socket) → `applyCloudState()` sur `RemoteScoreService` et `RemoteTimerService` sans rebroadcast.
- **écrit** `scoreboard-state-push` (socket, SaaS only) sur tout changement local. Le central relay valide le payload (Joi), upsert dans `scoreboardStateRepository`, broadcast `scoreboard-state` à la room.

Le validator supporte désormais `sport: 'football' | 'basketball'` et `vendor: 'remote'` (fouls/shotClock optionnels pour football). Les flux legacy `score-update`/`timer-update` restent actifs pour compat Pi local (le sync-agent continue de relayer vers la TV).

## Alternatives rejetées

- **Readonly mirror sur la Remote** : rejeté car l'utilisateur veut pouvoir continuer à piloter depuis la Remote (fallback natif quand pas de table de marque).
- **Bannière "Live cloud" discrète en plus du Remote local** : rejeté car deux états visibles fragmentent l'UX.
- **Désactiver `score-update` legacy** : rejeté pour préserver le Pi local (la TV Pi continue d'écouter ce flux, et les matchs football existants l'utilisent).

## Conséquences

- Les Remotes SaaS, le simulateur dashboard et les connecteurs vendors convergent sur `scoreboard-state`. Dernier émetteur gagne.
- Guard anti-loop dans `applyIncomingScoreboardState` : si le state reçu vient de nous (vendor=remote) avec mêmes valeurs locales, no-op.
- Pi mode : Remote continue d'utiliser `score-update` legacy (pas de push cloud). Évolution future si besoin.
- Le Remote Pi reçoit aussi `scoreboard-state` via le relay sync-agent → server (Phase 3 ADR-088) : il se synchronise en lecture même en Pi mode.

## Fichiers impactés

- `central-server/src/validators/scoreboard.validator.ts` — accepte `football` + `remote`, défauts pour fouls/shotClock, exporte `validateScoreboardStatePush()`.
- `central-server/src/repositories/scoreboard-state.repository.ts` — `sport: basketball|football`, `vendor: ... | 'remote'`, team names optionnels.
- `central-server/src/services/socket.service.ts` — listener `scoreboard-state-push` dans `registerSaasRelay`.
- `raspberry/src/app/components/remote/remote-score.service.ts` — `applyCloudState()` + hook `onLocalChange`.
- `raspberry/src/app/components/remote/remote-timer.service.ts` — `applyCloudState()` + hook `onLocalChange`.
- `raspberry/src/app/components/remote/remote.component.ts` — subscribe `scoreboard-state`, `pushScoreboardState()`, interface `ScoreboardStateV1`.
