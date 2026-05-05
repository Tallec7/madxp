# Alerts Dedup — Invariants (ADR-111)

Source de vérité : ADR-111. Toute insertion d'alerte passe par `alertRepository.create()`
qui fait un upsert sur `(site_id, alert_type, status='active')`. Les emitters n'ont
plus à dédupliquer eux-mêmes — c'est centralisé au repository.

## NE JAMAIS FAIRE (smoke test enforced)

### Repository

- **Faire un INSERT brut dans `alertRepository.create()`** sans tenter d'abord un
  UPDATE de dédup. Le UPDATE doit venir AVANT le INSERT dans le source (le smoke
  vérifie l'ordre lexical).
- **Retirer le `last_seen_at = NOW()` ou le `occurrences = occurrences + 1`** du
  UPDATE — sans ça la dédup n'enregistre plus la récurrence.
- **Remplacer `IS NOT DISTINCT FROM` par `=`** dans le WHERE du UPDATE — `=`
  ne match pas `NULL` côté Postgres → les alertes globales (sans `site_id`)
  re-spammeraient.
- **Retirer le filtre `status = 'active'`** du UPDATE — sinon une nouvelle alerte
  serait fusionnée avec une vieille déjà résolue.
- **Retirer l'appel `metricsService.recordAlertDedupSkipped(input.alert_type)`**
  quand le UPDATE matche — la métrique Prometheus est l'observabilité de la
  dédup en prod (panel "Alerts dedup skipped" du dashboard "NeoPro Blind Spots").

### Service

- **Restaurer un `INSERT INTO alerts` brut dans `alertingService.createAlert()`** :
  la fonction doit déléguer à `alertRepository.create()`. Sans cette convergence,
  les 5 émetteurs d'`alerting-checks.service.ts` (cron stuck-deployments, render
  jobs, etc.) recommenceront à spammer la DB à chaque restart Railway (cooldown
  in-memory volatile).
- **Retirer l'import `alertRepository` de `alerting.service.ts`** — c'est la
  seule façon pour le service d'accéder au path déduplicé.

### Migration / schema

- **Modifier la migration `add-alerts-dedup-columns.sql`** déjà déployée. Toute
  évolution passe par une nouvelle migration (`ALTER TABLE alerts ADD COLUMN
  IF NOT EXISTS ...`).
- **Supprimer l'index partiel `idx_alerts_dedup_active`** — il est dimensionné
  pour rendre le UPDATE de dédup O(log N) sur les seules rows actives. Sans
  lui, chaque INSERT scanne potentiellement la table entière (tableau de
  +500 k rows historisées).
- **Désynchroniser `full-schema.sql`** des nouvelles colonnes / index. Le smoke
  test `smoke-alerts-dedup` vérifie que `last_seen_at`, `occurrences` et
  `idx_alerts_dedup_active` apparaissent dans le snapshot.

### Métrique

- **Retirer le Counter `neopro_alerts_dedup_skipped_total`** de
  `metrics.service.ts` ou son panel du dashboard `neopro-blind-spots-cloud.json`.
  Sans la métrique, un futur émetteur en boucle reste invisible (la dédup le
  masque côté DB, donc seul le compteur Prometheus le révèle).

## Invariants positifs (à respecter)

- **Une alerte = un état actif d'incident** : `(site_id, alert_type)` est la clé
  logique. Une nouvelle insertion sur un incident déjà actif bumpe les
  compteurs, ne crée pas une row.
- **`occurrences` est un signal de priorité** : "alerte avec 4 400 ré-déclenchements"
  = à investiguer en premier.
- **`last_seen_at` est plus opérationnel que `created_at`** pour les alertes
  longues : `created_at` reste figé à la 1ʳᵉ occurrence, `last_seen_at` montre
  si l'incident est encore vivant.

## Référence

- [ADR-111](../../docs/adr/ADR-111-alert-repository-dedup.md)
- Migration : `central-server/src/scripts/migrations/add-alerts-dedup-columns.sql`
- Smoke : `central-server/src/__tests__/smoke/smoke-alerts-dedup.test.ts`
- Métrique : `neopro_alerts_dedup_skipped_total{type}`
- Dashboard Grafana : "NeoPro Blind Spots" → panel "Alerts dedup skipped (ADR-111)"
