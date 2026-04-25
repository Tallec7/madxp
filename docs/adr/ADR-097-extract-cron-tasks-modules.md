# ADR-097: Extraction des CRON tasks vers `cron-tasks/`

**Date** : 2026-04-25
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`central-server/src/services/cron-scheduler.service.ts` atteignait 1036 lignes (>2.5× la limite documentée de 400), avec 7 task executors hétérogènes (`executeReportTask`, `executeCleanupTask`, `executeAggregationTask`, `executeBackupTask`, `executeObjectiveCheckTask`, `executePdfReportTask`, `executeMatchAutoCloseTask`) plus 2 helpers (`gatherReportData`, `cleanupConfigHistory`) inlinés au milieu du code de scheduling. Audit Lead Dev 2026-04-25 a identifié le fichier comme P1, dans la même série que ADR-096 (split socket.service).

Le mix créait deux problèmes : (1) le switch `executeSchedule()` était dupliqué dans `runNow()`, créant un risque de drift ; (2) toucher la logique d'une task (ex. ajouter Slack à `objective_check`) imposait de scroller 1000 lignes de code adjacent non lié.

## Décision

Extraire les 7 executors dans `central-server/src/cron-tasks/` (un fichier par `task_type`), centraliser le routing dans une `TASK_EXECUTORS` table, et conserver `cron-scheduler.service.ts` comme orchestrateur (lifecycle, scheduling, dispatch, execution tracking, API CRUD). Les types `RecurringSchedule` + `ExecutionResult` migrent dans `cron-tasks/types.ts` et sont re-exportés depuis `cron-scheduler.service.ts` pour préserver la compatibilité des imports externes.

## Alternatives rejetées

- **Garder inliné** : rejeté car limite 400 lignes très largement dépassée, et le pattern Phase 7.2 / ADR-096 (handlers/) prouve que l'extraction marche bien sur ce repo.
- **Extraire dans `services/cron-tasks/`** plutôt que `src/cron-tasks/` : rejeté car les tasks ne sont pas des "services" au sens singleton classique — ce sont des fonctions stateless. Un répertoire racine séparé reflète mieux la sémantique.
- **Étendre une interface `Task` partagée avec un méthode `execute()`** : rejeté comme over-engineering pour 7 fonctions sans état partagé. Le dispatch table `TASK_EXECUTORS: Record<CronTaskType, fn>` est explicite et type-safe sans abstraction supplémentaire.

## Conséquences

- **+** `cron-scheduler.service.ts` passe de 1036 → 486 lignes (-550 / -53%). Le fichier est désormais un orchestrateur lisible qui ne contient plus de logique métier de tâches.
- **+** Chaque task est isolée (~30-150 lignes), testable indépendamment, et a un seul scope cognitif clair.
- **+** Le switch dispatch est centralisé dans `TASK_EXECUTORS` (1 source de vérité, vs 2 switches dupliqués entre `executeSchedule` + `runNow` avant).
- **+** Au passage de l'extraction, l'inclusion de l'alerte Slack at_risk dans `objective-check.task.ts` (perdue avec la suppression du worktree post-PR #600) est de retour avec son `alertNotifier.sendSlackNotification()` groupé par site.
- **−** 2 smoke tests existants (`smoke-analytics-sponsors`, `smoke-adr093-match-sessions`) lisaient `cron-scheduler.service.ts` via `fs.readFileSync` pour assert la présence de `calculate_*` et `recordMatchSessionAutoclosed`. Mis à jour pour lire les task files dédiés.
- **−** Légère friction pour l'import : les helpers tests qui voulaient appeler `cronSchedulerService.executeXTask` (privé) doivent maintenant importer la fonction du task file. Aucun test existant n'utilisait ce pattern, donc impact nul.

## Fichiers impactés

- `central-server/src/cron-tasks/types.ts` — nouveau, types partagés
- `central-server/src/cron-tasks/{report,cleanup,objective-check,aggregation,backup,pdf-report,match-autoclose}.task.ts` — 7 nouveaux fichiers (605 lignes au total)
- `central-server/src/services/cron-scheduler.service.ts` — 1036 → 486 lignes
- `central-server/src/__tests__/smoke/smoke-analytics-sponsors.test.ts` — 2 assertions lisent désormais `cron-tasks/aggregation.task.ts`
- `central-server/src/__tests__/smoke/smoke-adr093-match-sessions.test.ts` — assertion lit désormais `cron-tasks/match-autoclose.task.ts` et vérifie le mapping dans `TASK_EXECUTORS`
