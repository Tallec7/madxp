---
phase: 03-gate-publication
plan: 03
subsystem: backend-test-render
tags: [test-render, render-queue, ftp, adr-054, adr-055, adr-110, pub-02]
requires:
  - Plan 03-01 (neopro_templates.test_render_at / test_render_status / test_render_url)
  - ADR-054 (remotion_render_jobs queue + async worker)
  - ADR-055 (template versions + render artifact lifecycle)
  - templateStudioRepository.findV2ById (existing)
provides:
  - POST /api/remotion-templates/:id/test-render (super_admin, sealed body)
  - templateStudioRepository.updateTestRenderTracking({ status, url?, at? })
  - remotionRenderJobRepository.markCompletedWithoutVideo (FK-safe completion)
  - Worker branch on title prefix `test-render:` → /test-renders/{templateId}/{ts}.mp4
  - testRenderSchemas Joi (uuid params + Joi.object({}).unknown(false))
affects:
  - Plan 03-04 (wizard step 5 wires the toggle "Aperçu live / Rendu de test" to this endpoint)
  - CRON `test_render_cleanup` (Plan 01) sweeps the FTP artifacts after 7d
tech-stack:
  added: []
  patterns:
    - 'Title prefix discriminator (`test-render:<id>:<ts>`) — single render queue, two flows'
    - 'Server-side fixture injection (no body, no client surface — TEST_RENDER_FIXTURES const)'
    - 'FK-safe completion (markCompletedWithoutVideo: video_id stays NULL on test renders)'
    - 'Tracking columns updated at every transition (queued → rendering → success | failed)'
key-files:
  created:
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render.test.ts
  modified:
    - central-server/src/controllers/remotion-templates.controller.ts
    - central-server/src/middleware/validation.ts
    - central-server/src/repositories/remotion-render-job.repository.ts
    - central-server/src/repositories/template-studio.repository.ts
    - central-server/src/routes/remotion-templates.routes.ts
    - central-server/src/services/remotion-render-worker.service.ts
decisions:
  - 'Joi schemas live in middleware/validation.ts (real path), not validation/schemas.ts (PLAN.md alias). Already documented in Plan 02 deviation list — same path mismatch.'
  - 'Repository getStudioView is a controller helper, not a repo method — used findV2ById (TemplateV2) instead. Same adapter as Plan 02.'
  - 'FK-safe test-render completion via new markCompletedWithoutVideo (NOT markCompleted with a fake UUID). neopro_templates.test_render_url is the source of truth for the URL — remotion_render_jobs.video_url is only set so the dashboard polling exits with status=completed.'
  - 'No new render queue or job table — title prefix `test-render:` discriminates against production renders. Adding a job_kind column would have inflated the schema for a single boolean concern.'
  - 'Test render skips findPublishedById (admin can test an unpublished draft). Production render path remains gated.'
  - 'Body schema is `Joi.object({}).unknown(false)` — fixtures are server-only. Stripping the surface area keeps the audit trail clean and prevents fixture poisoning.'
  - 'route mount uses validateParams + validate (existing middleware contracts) rather than a fictional `validate(schema, "params")` overload — both schemas referenced via `testRenderSchemas.params` and `testRenderSchemas.body`.'
metrics:
  duration: ~25 min
  completed: 2026-05-05
  tasks: 2
  files_created: 1
  files_modified: 6
  commits: 2
---

# Phase 3 Plan 03: Async Test Render Backend — Summary

**One-liner:** POST /api/remotion-templates/:id/test-render (super_admin, sealed body) → enqueue dans `remotion_render_jobs` avec discriminateur `title: 'test-render:'`, fixtures serveur, upload FTP `/test-renders/`, persistence test_render_status sur `neopro_templates`. Smoke 5/5 RED→GREEN.

## What Was Built

Backend foundations pour PUB-02 (test render asynchrone Phase 3) :

1. **Repository `updateTestRenderTracking`** — méthode unique dynamique sur les 3 colonnes Plan 01 (`test_render_status`, optionally `test_render_url`, `test_render_at`). Single parameterized UPDATE, table cible `neopro_templates`.

2. **Joi `testRenderSchemas`** — exporté depuis `middleware/validation.ts`. Body sealed (`Joi.object({}).unknown(false)`) pour empêcher toute injection de props côté client.

3. **Controller `createTestRender`** — `findV2ById(id)` (404 si missing) → build defaults via `view.options[].defaultValue ?? values[0]` → `remotionRenderJobRepository.create({ title: 'test-render:<id>:<ts>', props, requested_for_site_id: null })` → tracking `queued` + Winston `info`. 500 + Winston `error` au catch.

4. **Route** — `POST /api/remotion-templates/:id/test-render` montée AVANT `/render` (collision-safe), guards `authenticate + requireRole('super_admin') + validateParams(testRenderSchemas.params) + validate(testRenderSchemas.body) + sensitiveRateLimit`.

5. **Worker hook** — `processJob` détecte `job.title.startsWith('test-render:')` :
   - **Démarrage** : tracking → `rendering`
   - **Template lookup** : `findById` (pas `findPublishedById` — admin teste un draft)
   - **Success** : upload FTP `test-renders/{templateId}/{ts}.mp4`, tracking → `success` + url + at, `markCompletedWithoutVideo` (FK-safe — video_id NULL).
   - **Failure** : tracking → `failed` + at, Winston `error` structuré, `markFailed` standard.

6. **Repo helper `markCompletedWithoutVideo`** — nouveau sur `remotion-render-job.repository.ts` : UPDATE `status='completed'` + `progress=100` + `video_id=NULL` + `video_url=$1`. Permet au dashboard polling de sortir sans violer la FK `video_id REFERENCES videos(id)`.

7. **Smoke 5/5 file-based** — verrouille le contrat (Joi schema, route mount, controller fixtures + title prefix, repo SQL, worker branch + FTP path).

## Tasks Completed

| Task | Name                                                       | Commit   | Files                                                                                                                                                                              |
| ---- | ---------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | RED smoke — 5 contracts test render endpoint + worker hook | 6cadcb03 | smoke-template-studio-v3-test-render.test.ts                                                                                                                                       |
| 2    | Schema + repo + controller + route + worker hook (GREEN)   | 7429da37 | validation.ts, template-studio.repository.ts, remotion-render-job.repository.ts, remotion-templates.controller.ts, remotion-templates.routes.ts, remotion-render-worker.service.ts |

## Verification

- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render\b'` → **10/10 GREEN** (5 cron Plan 01 + 5 endpoint Plan 03)
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-'` → **45/45 GREEN** (8 suites, no regression)
- `cd central-server && npx tsc --noEmit` → **clean**
- `npm run test:smoke:smart` → **517/517 GREEN** (smart smoke selected smoke-server-core, smoke-consistency, smoke-dashboard-guards, smoke-remotion sur le diff)
- `grep -c console.log` (controller + worker + repo) → **0**
- `grep -c "import.*config/database"` controller → **0** (pattern repository respecté)

## Deviations from Plan

### Adaptations vs Plan

- **Plan référence `validation/schemas.ts`** : le vrai fichier est `middleware/validation.ts`. Même adaptation que Plan 02. Ajout de `testRenderSchemas` en top-level export juste avant `paramSchemas`.
- **Plan référence `getStudioView` repository** : c'est `findV2ById` qui existe en repo (`getStudioView` est un controller helper). Même adapter que Plan 02 — utilise `view.options[].defaultValue` + `values[0]` fallback pour computer les defaults.
- **Plan référence `validate(schema, 'params')` / `validate(schema, 'body')`** : signature inexistante dans `middleware/validation.ts`. Utilisation de `validateParams(testRenderSchemas.params)` + `validate(testRenderSchemas.body)` (les deux schemas sont bien référencés depuis le route file, smoke contract préservé).
- **Plan référence `requireSuperAdmin`** : middleware inexistant ; le pattern projet est `authenticate + requireRole('super_admin')` (cohérent avec les routes `/library/upload`, `/assets/:assetId` Plan 01).

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FK violation sur `markCompleted` pour les test renders**

- **Found during:** Task 2 implementation review (avant smoke run)
- **Issue:** `remotionRenderJobRepository.markCompleted` exige un `video_id` non null mais les test renders n'insèrent PAS de row `videos` (cycle de vie distinct, sweep par CRON Plan 01). Passer un UUID placeholder violerait `video_id REFERENCES videos(id) ON DELETE SET NULL`.
- **Fix:** Nouvelle méthode `markCompletedWithoutVideo({ video_url, file_size })` qui UPDATE `video_id = NULL`. Le dashboard polling sort sur `status=completed` sans FK error.
- **Files modified:** central-server/src/repositories/remotion-render-job.repository.ts
- **Commit:** 7429da37

### Authentication Gates

None.

### Architectural Changes Considered

None — pattern title-prefix discriminator est le moins invasif (zéro nouvelle table, zéro nouvelle colonne sur `remotion_render_jobs`). Toute extension future (stamping ou analytics dédiées) pourra ajouter un `job_kind` ENUM si nécessaire, sans casser ce contrat.

## Self-Check: PASSED

- FOUND: central-server/src/**tests**/smoke/smoke-template-studio-v3-test-render.test.ts
- FOUND: central-server/src/middleware/validation.ts (testRenderSchemas added)
- FOUND: central-server/src/repositories/template-studio.repository.ts (updateTestRenderTracking added)
- FOUND: central-server/src/repositories/remotion-render-job.repository.ts (markCompletedWithoutVideo added)
- FOUND: central-server/src/controllers/remotion-templates.controller.ts (createTestRender + TEST_RENDER_FIXTURES added)
- FOUND: central-server/src/routes/remotion-templates.routes.ts (POST /:id/test-render mounted)
- FOUND: central-server/src/services/remotion-render-worker.service.ts (test-render branch added)
- FOUND: commit 6cadcb03 (Task 1 RED)
- FOUND: commit 7429da37 (Task 2 GREEN)
- VERIFIED: smoke 5/5 plan-03 GREEN (10/10 incl. cron Plan 01)
- VERIFIED: full v3 smokes 45/45 GREEN (no regression)
- VERIFIED: tsc --noEmit clean
- VERIFIED: smart smoke 517/517 GREEN
- VERIFIED: 0 console.log dans controller / worker / repo
- VERIFIED: 0 import config/database dans controller (repository pattern strict)
