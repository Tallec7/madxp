# ADR-111 : Dédup au niveau alertRepository (upsert + occurrences)

**Date** : 2026-05-05
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Audit DB du 2026-05-05 : **22 688 rows actives** dans `alerts`, dont 99 % sont du
spam de 4 types récurrents sur 3 Pi.

| Site | Type | Rows | Période |
|---|---|---|---|
| RACC (Saint Rogatien) | `Déploiement bloqué` | 16 912 | 2026-04-01 → 04-06 |
| NOOR | `saas_empty_profile` | 4 405 | 2026-04-12 → en cours |
| NLF (Mangin-Beaulieu) | `no_display` | 730 | 2026-04 |
| NLF | `gpu_decode_fallback` | 641 | 2026-04 |

**Cause racine** : deux paths d'insertion d'alertes coexistent.

1. `alertRepository.create()` ([alert.repository.ts:61](../../central-server/src/repositories/alert.repository.ts:61)) — INSERT brut, dédup déléguée aux callers via `existsActive()` (sponsor-alert + canary-monitor le font, OK).
2. `alertingService.createAlert()` ([alerting.service.ts:180](../../central-server/src/services/alerting.service.ts:180)) — INSERT brut **sans dédup**, utilisé par 5 endroits dans `alerting-checks.service.ts` (cron stuck-deployments, render jobs stuck, etc.). Le seul garde-fou est un cooldown in-memory `lastAlertTime: Map<string, Date>` qui se reset à chaque restart du serveur. Railway redéployant souvent, RACC s'est mangé 16k alertes en 5 jours (≈ une toutes les 25 secondes).

Le card "Sites" du dashboard affiche `4 585 ALERTES` pour RACC — visuellement
disqualifiant et opérationnellement inexploitable.

## Décision

**Dédup au niveau du repository, pas des callers.**

`alertRepository.create()` devient un upsert :
1. UPDATE prioritaire sur `(site_id, alert_type, status='active')` qui bumpe
   `last_seen_at = NOW()` et `occurrences = occurrences + 1`, et rafraîchit
   `severity / message / metadata`.
2. INSERT seulement si aucune row active n'existe déjà.

`site_id IS NOT DISTINCT FROM $1` gère correctement les alertes globales
(`site_id = NULL`).

Migration `add-alerts-dedup-columns.sql` :
- `last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()`
- `occurrences INTEGER NOT NULL DEFAULT 1`
- Index partiel `idx_alerts_dedup_active ON (site_id, alert_type) WHERE status = 'active'`

`alertingService.createAlert()` est refactoré pour passer par `alertRepository.create()` au lieu d'un INSERT brut → les 5 callers d'`alerting-checks` héritent automatiquement de la dédup. Les 2 callers historiques (sponsor-alert, canary-monitor) gardent leur `existsActive()` mais c'est désormais redondant et safe.

Métrique Prometheus `neopro_alerts_dedup_skipped_total{type}` exposée pour
détecter en prod les futurs émetteurs à haute fréquence (visible dans Grafana
"NeoPro Blind Spots").

## Alternatives rejetées

- **Cooldown in-memory généralisé sur tous les types** : ne survit pas aux restarts Railway, justement la cause racine du spam RACC.
- **Dédup au niveau de chaque caller via `existsActive()`** : pattern fragile, déjà oublié dans `alerting.service.ts` malgré la méthode existante. Le repository est le bon point d'enforcement.
- **`ON CONFLICT DO UPDATE` Postgres** : nécessite une contrainte UNIQUE qui n'a de sens que pour les alertes actives — Postgres ne supporte pas les contraintes UNIQUE partielles dans ON CONFLICT (doit passer par un INDEX UNIQUE partiel + INSERT avec WHERE clause complexe). Pour 2 queries simples, l'UPDATE-then-INSERT est plus lisible et débuggable.

## Conséquences

- **Positif** : le compteur d'alertes par site reflète la réalité opérationnelle (1 incident = 1 row, pas N rows). Les futurs émetteurs en boucle sont automatiquement neutralisés sans intervention.
- **Positif** : `occurrences` + `last_seen_at` deviennent des signaux précieux ("alerte X qui dure depuis 3 semaines avec 4 400 ré-déclenchements" = priorité d'investigation).
- **Négatif (mineur)** : le chemin `create()` fait 2 queries au lieu d'1 dans le cas "première occurrence". Latence négligeable (<1 ms) sur l'index partiel dédié.
- **Négatif (mineur)** : le `severity` peut être bumped vers le bas si un même type re-fire avec une sévérité plus basse. Acceptable car le `message` est aussi rafraîchi (état le plus récent).
- **Cleanup** : 22 688 rows passées à `resolved` le 2026-05-05 avec `metadata.resolved_reason = 'bulk_dedup_cleanup_2026-05-05'`.

## Fichiers impactés

- `central-server/src/scripts/migrations/add-alerts-dedup-columns.sql` — migration ALTER TABLE + index partiel
- `central-server/src/scripts/full-schema.sql` — snapshot synchronisé
- `central-server/src/repositories/alert.repository.ts` — `create()` devient upsert
- `central-server/src/services/alerting.service.ts` — `createAlert()` délègue au repo
- `central-server/src/services/alerting.service.test.ts` — mocks ajustés (UPDATE puis INSERT)
- `central-server/src/services/metrics.service.ts` — Counter `neopro_alerts_dedup_skipped_total`
- `central-server/src/__tests__/smoke/smoke-alerts-dedup.test.ts` — garde-fou
- `docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json` — panel "Alerts dedup skipped"
- `.claude/rules/alerts-dedup.md` — invariants smoke-enforced

## Suivi

- Issue séparée : investiguer pourquoi `saas_empty_profile` fire toujours sur NOOR (dédup masque le symptôme mais pas la cause applicative).
- Phase optionnelle : afficher `× N` à côté du type d'alerte dans la page liste (UI dashboard) quand `occurrences > 1`.
