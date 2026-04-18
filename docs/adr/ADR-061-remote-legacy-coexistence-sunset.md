# ADR-061: Coexistence legacy/new télécommande + sunset 6 mois

**Date** : 2026-04-18
**Statut** : Proposé
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

## Fichiers impactés

- `central-dashboard/src/app/features/remote/remote-version-toggle.service.ts` (nouveau).
- `central-dashboard/src/app/features/remote/legacy/` — dossier préservé, build conditionnel.
- `central-server/src/repositories/remote-auth-events.repository.ts` — colonne `client_version`.
- `docs/technical/REMOTE_MIGRATION_PLAN.md` (nouveau) — runbook sunset.

## Garde-fous anti-régression

- Smoke test : les deux entry points (`/remote/v1` et `/remote/v2`) répondent 200.
- Dashboard super_admin : widget "% clubs migrés" pour suivre l'adoption.
- Alerte Grafana : si <70% des clubs sur la new à J+5 mois → escalade support.
