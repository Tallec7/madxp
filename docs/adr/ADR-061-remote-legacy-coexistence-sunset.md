# ADR-061: Coexistence legacy/new télécommande + sunset 6 mois

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger
**Phase** : 4 du plan refonte télécommande (transverse)

---

## Contexte

La refonte télécommande (ADR-058/059/060) introduit des breaking changes : protocole pub/sub (ADR-059), auth PIN par profil (ADR-058), PWA + offline queue (ADR-060). Les staff des clubs existants utilisent la télécommande actuelle au quotidien — forcer une migration instantanée = incidents en pleine saison. Inversement, maintenir deux codepaths indéfiniment = dette technique insoutenable.

## Décision

**Coexistence temporaire** : les deux UI (legacy + new) sont servies en parallèle pendant **6 mois** après mise en production de la Phase 3. Toggle **U22** dans le menu remote ("Revenir à l'ancienne version") permet le rollback individuel. Le toggle persiste en `localStorage` par `siteId`. Après 6 mois, la legacy est **retirée du bundle** (sunset), un écran de transition explique la migration forcée. Les `remote_auth_events` tracent le ratio d'usage legacy vs new pour détecter les clubs qui n'ont pas migré.

## Alternatives rejetées

- **Bascule brutale (big bang)** : rejeté — trop risqué sur la saison sportive, pas de filet de sécurité.
- **Maintien permanent de la legacy** : dette technique ingérable + 2 surfaces d'attaque sécurité à patcher.
- **Feature flag par club** : utile mais pas suffisant — le staff sur le terrain doit pouvoir switcher sans ticket support.

## Conséquences

- Adoption progressive + filet de sécurité pour les clubs conservateurs.
- Double maintenance pendant 6 mois → overhead de review + tests sur chaque PR remote.
- Métriques d'usage (`remote_auth_events.client_version`) pour piloter le sunset.
- Date de sunset **annoncée à J+0** : les clubs savent que le 1er novembre 2026 = legacy retirée.

## Fichiers implémentés

- `central-dashboard/src/app/features/remote/services/remote-version-toggle.service.ts` (nouveau) — toggle `v1`/`v2` per-siteId localStorage, sunset automatique au `2026-11-01`, `legacyAvailable`, `version$`.
- `central-server/src/repositories/remote-auth-events.repository.ts` (nouveau) — `record()`, `getMigrationStats()` (v2Ratio), `purgeOld()` rétention 90j.
- `central-server/src/scripts/migrations/add-remote-auth-events.sql` (nouveau) — table `remote_auth_events` avec colonnes `client_version`, `event_type`, index tri-colonne.
- `central-server/src/repositories/index.ts` — export `remoteAuthEventsRepository`.
- `central-server/src/services/metrics.service.ts` — `recordRemoteClientVersion()` + compteur `neopro_remote_client_version_total{version,event_type}`.
- `docker/prometheus/rules.yml` — alerte `RemoteLegacyAdoptionLow` (v2 < 70% sur 7j pendant 24h).

## Garde-fous anti-régression

- Smoke test (4 tests) : toggle service, repository, migration SQL, export index.
- Alerte Prometheus `RemoteLegacyAdoptionLow` — escalade support si < 70% v2 avant sunset.
- Date sunset gravée dans le code : `LEGACY_SUNSET_DATE = '2026-11-01'` — le toggle se désactive automatiquement.
