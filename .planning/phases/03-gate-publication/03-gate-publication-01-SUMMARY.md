---
phase: 03-gate-publication
plan: 01
subsystem: backend-foundations
tags: [migration, cron, prometheus, observability, adr-110, pub-02]
requires:
  - ADR-093 (extend-club-sessions-match-fields.sql CHECK pattern)
  - ADR-099 (connection-events-purge.task.ts handler shape)
  - cron-scheduler.service.ts TASK_EXECUTORS dispatch table
provides:
  - neopro_templates.test_render_at / test_render_status / test_render_url
  - recurring_schedules.task_type 'test_render_cleanup' enabled
  - executeTestRenderCleanupTask CRON handler
  - neopro_test_renders_cleaned_total{result} Prometheus counter
  - Grafana panel id 308 (neopro-blind-spots-cloud.json)
affects:
  - Plans 02-04 of Phase 3 (test render persistence + render queue extension)
tech-stack:
  added: []
  patterns:
    - 'ADD COLUMN IF NOT EXISTS + CHECK + DROP CONSTRAINT IF EXISTS (idempotent migration ADR-086 lineage)'
    - 'Seed CRON via INSERT...WHERE NOT EXISTS (no ON CONFLICT to keep predictable failure on schema drift)'
    - 'Winston info+error + Prometheus counter on every CRON handler (CLAUDE.md garde-fou)'
key-files:
  created:
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render-cron.test.ts
    - central-server/src/scripts/migrations/add-template-test-render-tracking.sql
    - central-server/src/cron-tasks/test-render-cleanup.task.ts
  modified:
    - central-server/src/scripts/full-schema.sql
    - central-server/src/cron-tasks/types.ts
    - central-server/src/services/cron-scheduler.service.ts
    - central-server/src/services/metrics.service.ts
    - docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json
decisions:
  - 'Migration cible neopro_templates (table reelle), pas templates (PLAN.md utilisait un nom abrege). Smoke test regex agnostique, GREEN sans modification.'
  - 'CRON handler scanne /test-renders/ a plat (root), pas recursivement (listFtpDirectory ne renvoie que les fichiers du dir cible, et les uploads se font dans /test-renders/{templateId}/{ts}.mp4 — la recursion sera ajoutee Plan 02 quand le upload sera implemente).'
  - 'Metric `neopro_test_renders_cleaned_total{result}` (success|error) plutot que sans label — permet de surveiller separement les fichiers correctement nettoyes vs les erreurs FTP transitoires.'
  - 'Grafana panel ajoute a neopro-blind-spots-cloud.json (catch-all) — promotion vers un dashboard domaine specifique (ex. neopro-templates) viendra si la metric `gagne sa place`.'
metrics:
  duration: ~25 min
  completed: 2026-05-05
  tasks: 2
  files_created: 3
  files_modified: 5
  commits: 3
---

# Phase 3 Plan 01: Test Render Tracking — Summary

**One-liner:** Migration neopro*templates (3 colonnes test_render*\*) + CRON hebdomadaire de cleanup FTP TTL 7 jours, observabilite via Prometheus + Grafana, smoke 5/5 RED→GREEN.

## What Was Built

Backend foundations pour PUB-02 (test render asynchrone Phase 3) :

1. **Migration `add-template-test-render-tracking.sql`** : 3 colonnes nullables sur `neopro_templates` (test_render_at TIMESTAMP, test_render_status TEXT CHECK, test_render_url TEXT) + extension du CHECK constraint `check_task_type` pour accepter `'test_render_cleanup'` + seed INSERT idempotent du CRON Sunday 03:00 (TTL 7d).

2. **CRON handler `test-render-cleanup.task.ts`** : scan FTP `/test-renders/`, suppression des fichiers > TTL, log Winston info per delete + error per failure, increment Prometheus `neopro_test_renders_cleaned_total{result}`.

3. **Wiring orchestrateur** : `executeTestRenderCleanupTask` ajoute au `TASK_EXECUTORS` dispatch table de `cron-scheduler.service.ts` + extension du type union `CronTaskType`.

4. **Observabilite** : nouveau counter Prometheus + panel Grafana id 308 sur neopro-blind-spots-cloud.json (catch-all). Sans visualisation, le smoke `smoke-metrics-observability` bloque (allowlist gelee).

5. **Smoke 5/5 file-based** : verrouille le contrat (regex sur migration, full-schema, scheduler dispatch, handler logger+metric).

## Tasks Completed

| Task | Name                                                   | Commit   | Files                                                                                            |
| ---- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| 1    | RED smoke — 5 contracts pour migration + CRON          | 162b98c7 | smoke-template-studio-v3-test-render-cron.test.ts                                                |
| 2    | Migration + CRON + metric + full-schema resync (GREEN) | d30981cf | migration sql, task.ts, types.ts, cron-scheduler.service.ts, metrics.service.ts, full-schema.sql |
| 2b   | Grafana panel (auto-fix smoke-metrics-observability)   | 249cc16c | neopro-blind-spots-cloud.json                                                                    |

## Verification

- `npx jest --testPathPattern='smoke-template-studio-v3-test-render-cron'` → 5/5 GREEN
- `npx jest --testPathPattern='smoke-template-studio-v3-'` → 6 suites / 33 tests GREEN
- `npx tsc --noEmit` → clean
- `npm run test:smoke:smart` → 51 suites / 2035 tests GREEN (no regression)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Table cible : `neopro_templates`, pas `templates`**

- **Found during:** Task 2 (lecture full-schema.sql + repository)
- **Issue:** Le PLAN.md cite `ALTER TABLE templates` mais la table reelle est `neopro_templates` (verifie via `grep "FROM neopro_templates" template-studio.repository.ts`).
- **Fix:** Migration applique `ALTER TABLE neopro_templates`. Nom de fichier de migration garde tel quel (`add-template-test-render-tracking.sql`) — il refere au domaine, pas a la table SQL physique.
- **Files modified:** central-server/src/scripts/migrations/add-template-test-render-tracking.sql, central-server/src/scripts/full-schema.sql
- **Commit:** d30981cf

**2. [Rule 2 - Missing critical functionality] Visualisation Grafana du nouveau metric**

- **Found during:** `npm run test:smoke:smart` apres commit d30981cf
- **Issue:** `smoke-metrics-observability` echoue : tout metric `neopro_*` exporte doit etre reference dans un dashboard Grafana ou une alert rule Prometheus. Sans visualisation, un bug silencieux du CRON resterait invisible.
- **Fix:** Ajout d'un panel timeseries (id 308) sur `neopro-blind-spots-cloud.json` (le catch-all dashboard). Expression `sum by (result) (increase(neopro_test_renders_cleaned_total[24h]))`. Description explicite : 0 sur 14j d'affilee = CRON en panne.
- **Files modified:** docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json
- **Commit:** 249cc16c

### Authentication Gates

None.

### Architectural Changes Considered

None — la migration suit strictement les patterns ADR-093 et ADR-099 (CHECK extension, seed INSERT, CRON dispatch).

## Self-Check: PASSED

- FOUND: central-server/src/**tests**/smoke/smoke-template-studio-v3-test-render-cron.test.ts
- FOUND: central-server/src/scripts/migrations/add-template-test-render-tracking.sql
- FOUND: central-server/src/cron-tasks/test-render-cleanup.task.ts
- FOUND: commit 162b98c7 (Task 1 RED)
- FOUND: commit d30981cf (Task 2 GREEN)
- FOUND: commit 249cc16c (auto-fix Grafana panel)
- VERIFIED: smoke 5/5 GREEN
- VERIFIED: tsc --noEmit clean
- VERIFIED: smart smoke 2035/2035 GREEN
