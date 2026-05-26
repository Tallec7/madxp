# SPEC : Alert Repository (dédup au niveau insert)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-05
> **Code principal** :
>
> - `central-server/src/repositories/alert.repository.ts` (repository upsert + dédup)
> - `central-server/src/services/alerting.service.ts` (`createAlert` délègue au repo)
> - `central-server/src/services/alerting-checks.service.ts` (5 émetteurs cron, passe par alertingService)
> - `central-server/src/services/sponsor-alert.service.ts` + `canary-monitor.service.ts` (callers historiques avec `existsActive`)
>   **ADR liés** : ADR-111 (dédup au niveau repository)
>   **Smoke tests** :
> - `central-server/src/__tests__/smoke/smoke-alerts-dedup.test.ts` (garde-fou complet ADR-111)
>   **`.claude/rules/` lié** : `alerts-dedup.md`

## En une phrase

Le repository qui crée et dédupe les alertes système (incidents Pi, déploiements bloqués, render jobs stuck, etc.) — toute insertion sur `(site_id, alert_type)` déjà actif bumpe `occurrences` au lieu de créer une nouvelle row.

## Périmètre

- **Inclus** : toute insertion d'alerte côté backend MadXP (`alertRepository.create`), incluant les chemins via `alertingService.createAlert` (cron stuck-deployments, render jobs, kiosk crashes, etc.) et les callers historiques (`sponsor-alert.service`, `canary-monitor.service`).
- **Couvre** : la table `alerts`, son index partiel `idx_alerts_dedup_active`, les colonnes `last_seen_at` + `occurrences`, la métrique Prometheus `neopro_alerts_dedup_skipped_total`, le panel Grafana "Alerts dedup skipped".
- **Hors périmètre** : les notifications email/Slack (`alerting-notifier.service`), l'évaluation des seuils (`alerting.service.evaluateMetric`), la résolution manuelle d'alertes (UI dashboard).

## Règles métier (ce qui DOIT marcher)

- **Une alerte = un état actif d'incident** : si `(site_id, alert_type, status='active')` existe déjà, le `create()` UPDATE bumpe `last_seen_at = NOW()` + `occurrences += 1` au lieu d'INSERT.
- **`severity` et `message` sont rafraîchis** à chaque récurrence (état le plus récent de l'incident).
- **Les alertes globales (sans `site_id`) sont aussi dédupées** via `IS NOT DISTINCT FROM` (Postgres `=` ne match pas NULL).
- **Une alerte résolue n'est jamais bumpée** — la dédup filtre sur `status = 'active'`. Un nouvel incident du même type après résolution crée bien une nouvelle row.
- **Toute dédup incrémente la métrique Prometheus** `neopro_alerts_dedup_skipped_total{type}` — observabilité des émetteurs en boucle.
- **`alertingService.createAlert()` ne fait JAMAIS d'INSERT brut** — il délègue à `alertRepository.create()`. Sans cette convergence, les 5 émetteurs d'`alerting-checks` (cron stuck-deployments, render jobs stuck, etc.) recommenceraient à spammer la DB à chaque restart Railway (cooldown in-memory volatile).
- **Les callers historiques avec `existsActive()`** (`sponsor-alert.service`, `canary-monitor.service`) restent fonctionnels : la dédup au repo est désormais redondante mais idempotente et safe.

## Comportements observables

| Règle                       | Comment on vérifie                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dédup active                | `SELECT occurrences FROM alerts WHERE site_id = X AND alert_type = Y AND status = 'active'` retourne 1 row, occurrences > 1 si récurrence |
| Métrique exposée            | `curl /metrics                                                                                                                            | grep neopro_alerts_dedup_skipped_total` affiche un compteur par type |
| Panel Grafana actif         | Dashboard "NeoPro Blind Spots" → panel "Alerts dedup skipped (ADR-111)" — pic = émetteur en boucle d'un type donné                        |
| `last_seen_at` opérationnel | Pour alertes longues, `last_seen_at - created_at` mesure la durée de l'incident                                                           |
| Cleanup historique          | 22 688 rows en `status='resolved'` avec `metadata.resolved_reason='bulk_dedup_cleanup_2026-05-05'` (audit 2026-05-05)                     |

## Cas d'edge connus

- **2026-05-05** : audit DB révèle 22 688 alertes actives sur 3 Pi, dont 16 912 `Déploiement bloqué` sur RACC à cause d'un cooldown in-memory dans `alerting-checks` qui se reset à chaque redémarrage Railway. Cleanup massif + dédup au repo (ADR-111) pour neutraliser le pattern.
- **NOOR — `saas_empty_profile`** : 4 405 occurrences en 24 jours. Dédup masque le symptôme (1 row au lieu de 4 405) mais pas la cause applicative — issue séparée pour investiguer pourquoi le profil reste vide.

## Ce qui n'est PAS dans le scope

- Affichage `× N occurrences` à côté du type d'alerte dans la page liste (UI dashboard) — follow-up optionnel, pas dans la PR ADR-111.
- Auto-resolve des alertes anciennes (purge des `resolved`). Le cleanup 2026-05-05 a été fait manuellement. Une cron de purge périodique est à envisager si la table grossit.
- Notifications email/Slack des alertes (couvert par `alerting-notifier.service`).
- Évaluation des seuils métriques (couvert par `alerting.service.evaluateMetric`).
