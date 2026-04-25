# SPEC : Cron Scheduler Service

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-25
> **Code principal** :
> - `central-server/src/services/cron-scheduler.service.ts` (orchestrateur 486 lignes)
> - `central-server/src/cron-tasks/<name>.task.ts` (7 task executors)
> - `central-server/src/cron-tasks/types.ts` (types partagés)
> **ADR liés** : ADR-097 (extraction modulaire des tasks)
> **Smoke tests** :
> - `central-server/src/__tests__/smoke/smoke-analytics-sponsors.test.ts` (aggregation)
> - `central-server/src/__tests__/smoke/smoke-adr093-match-sessions.test.ts` (match auto-close)
> **`.claude/rules/` lié** : `services.md`

## En une phrase

Le service qui exécute automatiquement les tâches récurrentes du backend Neopro (rapports email, agrégation stats, nettoyage, fermeture sessions match, etc.) selon un planning configuré en DB.

## Règles métier (ce qui DOIT marcher)

- **Une tâche planifiée tourne toujours** à l'heure prévue (cron expression construite depuis la config DB `recurring_schedules`).
- **Chaque exécution est tracée** dans `recurring_schedule_executions` avec `status`, `duration_ms`, `result_summary`, `error_message`.
- **Une tâche qui échoue n'arrête pas le planificateur** : l'erreur est loggée + persistée, le `failure_count` du schedule incrémenté, le job continue.
- **Une tâche manquante (task_type inconnu)** retourne `success: false` avec message explicite — pas de crash silencieux.
- **Le service charge les schedules au boot** depuis la DB (`is_active = true`). Si la migration n'est pas appliquée, log warning et démarre sans tâche.
- **Toute tâche peut être lancée manuellement** via `runNow(scheduleId)` (UI admin), avec tracking d'exécution équivalent au mode auto.
- **Toute modification de schedule** (CRUD via API) **reconfigure le job cron** immédiatement (pas besoin de redémarrer le service).
- **Les 7 task types actifs** : `report` (rapport email hebdo/mensuel), `cleanup` (purge tables anciennes), `aggregation` (calcul stats J-1), `objective_check` (vérif objectifs club + Slack at-risk), `pdf_report` (PDF mensuels), `match_session_autoclose` (ADR-093), `backup` (NON IMPLÉMENTÉ — fail-loud explicite).

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Tâche tourne à l'heure prévue | Log Winston `info` `Executing scheduled task: <name>` à l'heure exacte |
| Exécution tracée | Row dans `recurring_schedule_executions` avec `status='success'` ou `'failed'` |
| Échec n'arrête pas le service | Le service redémarre les tâches suivantes, `failure_count` incrémenté en DB |
| `runNow` manuel | UI admin Dashboard → bouton "Run now" sur un schedule → log + row tracked |
| `match_session_autoclose` actif | Métrique Prometheus `neopro_match_sessions_autoclosed_total{reason="idle"|"absolute"}` augmente |
| `backup` fail-loud | Log Winston `warn` `[CronScheduler] Backup task triggered but not implemented` à chaque tick + `success: false` retourné |
| `objective_check` Slack | Si `config.send_alerts=true` et objectifs <50% → 1 alerte Slack par site listant ses N objectifs à risque |

## Cas d'edge connus

- **Migration `recurring_schedules` non appliquée** : `start()` log warn `migration not yet applied, service disabled` et le service ne démarre aucune tâche. Comportement volontaire pour ne pas bloquer le boot.
- **Schedule avec `cron_expression` invalide** : log error, le job n'est pas créé, mais le service continue avec les autres schedules valides.
- **Concurrent `runNow` + tick auto** : 2 exécutions en parallèle peuvent tourner. Pas de lock applicatif. Les tasks sont conçues pour être idempotentes (DELETE WHERE date <, UPDATE WHERE ended_at IS NULL, etc.).
- **Schedule désactivé en cours d'exécution** (`toggleSchedule(id, false)`) : l'exécution en cours se termine, le prochain tick n'aura pas lieu.
- **Aggregation function PG manquante** (`calculate_*` n'existent pas en DB) : retourne `success: false` avec message `Aggregation function missing` — critical data loss risk car la rétention `video_plays` est de 15j (incident 137h documenté).
- **Slack webhook absent** (`SLACK_WEBHOOK_URL` non set) : `objective_check` log les at-risk mais ne notifie pas — pas d'erreur, comportement transparent (cf. `alerting-notifier.service.ts`).
- **Task `video_ftp_audit` ajoutée hors-process** : visible dans `cron-scheduler.service.ts` ligne 31 + `types.ts`. Wire récent par une autre session, pas encore documentée dans cette SPEC — TODO.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/services.md` pour les règles techniques smoke-testées. Règles **métier** spécifiques :

- Ne **jamais** faire retourner `success: true` à `executeBackupTask` tant qu'il n'écrit rien (faux positif documenté + corrigé PR #600).
- Ne **jamais** silent-swallow les erreurs `function does not exist` dans `executeAggregationTask` (cache un data loss critique — `checkAggregationStaleness` alerte à >36h, mais si on retourne `success`, l'incident reste invisible).
- Ne **jamais** retirer la métrique `metricsService.recordMatchSessionAutoclosed` dans `executeMatchAutoCloseTask` (sans elle, un bug silencieux du CRON reste invisible — smoke test enforced).
- Ne **jamais** supprimer le seed migration de la task `match_session_autoclose` (source de vérité pour son activation par défaut sur la flotte).

## Ce qui n'est PAS dans le scope

- **Scheduling temps réel sub-minute** (high-frequency trading style) → on est sur du cron classique, granularité minute. Pas l'usage.
- **Exécution distribuée** (worker pool, plusieurs nodes) → 1 instance Railway = 1 scheduler. Si Neopro scale à plusieurs nodes, refactor nécessaire (lock distribué, leader election).
- **Triggering par événement** (webhooks, queues) → autre concern, voir `command-queue.service.ts` ou `remotion-render-worker.service.ts`.
- **UI de création de schedules par les clubs** → réservé super_admin uniquement. Les clubs ne créent pas de schedules custom.

## Évolutions possibles (backlog léger)

- [ ] Implémenter vraiment `executeBackupTask` (S3/R2 + restore testé) — cf. TECH-DEBT P0
- [ ] Ajouter un lock distribué si Neopro scale à plusieurs instances Railway
- [ ] Dashboard admin `/admin/schedules` pour visualiser exécutions historiques (existe partiellement, à enrichir)
- [ ] Métrique Prometheus globale `neopro_cron_executions_total{task_type, status}` pour dashboard Grafana
- [ ] Alerting si une tâche n'a pas tourné depuis N×expected_interval (genre `aggregation` qui n'aurait pas tourné depuis 36h → alerte)
