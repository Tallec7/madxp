---
phase: 03-gate-publication
plan: 02
subsystem: backend-validation
tags: [validation, registry, publish-gate, adr-110, pub-01, test-03]
requires:
  - Plan 03-01 (test_render_at / test_render_status columns on neopro_templates)
  - templateStudioRepository.findV2ById (existing, ADR-075)
  - templateOptionsRepository.listPackshotRefs (existing, PDF JOUEUR)
provides:
  - VALIDATION_RULES registry (8 rules, extensible — add a 9th = 1 file + 1 array entry)
  - runValidation(templateId) orchestrator (parallel rule.check, sorted results)
  - GET /api/remotion-templates/:id/validation endpoint (super_admin, validateParams, adminRateLimit)
  - ValidationContext / ValidationResult / ValidationRule type contracts
affects:
  - Plan 03-04 (wizard step 5 consumes the endpoint, never reimplements logic)
tech-stack:
  added: []
  patterns:
    - 'Registry pattern (array of rule objects, no if/else dispatcher)'
    - 'Promise.all for parallel rule execution + AbortSignal.timeout(3000) for HEAD probes'
    - 'Pre-computed publishedTargets Set in orchestrator (1 SQL roundtrip vs N+1 in rule)'
    - 'FR messages co-located with the rule that emits them (no central i18n table needed yet)'
key-files:
  created:
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-validation.test.ts
    - central-server/src/services/template-validation/types.ts
    - central-server/src/services/template-validation/index.ts
    - central-server/src/services/template-validation/rules/at-least-one-layer.ts
    - central-server/src/services/template-validation/rules/assets-resolve-http-200.ts
    - central-server/src/services/template-validation/rules/fonts-known.ts
    - central-server/src/services/template-validation/rules/zones-in-safe-zone.ts
    - central-server/src/services/template-validation/rules/visible-if-keys-exist.ts
    - central-server/src/services/template-validation/rules/packshot-refs-options-match.ts
    - central-server/src/services/template-validation/rules/packshot-refs-target-published.ts
    - central-server/src/services/template-validation/rules/recent-test-render-24h.ts
  modified:
    - central-server/src/controllers/template-studio.controller.ts
    - central-server/src/routes/template-studio.routes.ts
decisions:
  - 'ValidationContext is a lightweight projection (NOT TemplateV2 directly) — rules need packshotRefs (not in TemplateV2), test_render_* columns (Plan 01), and a precomputed publishedTargets Set. Decoupling avoids inflating TemplateV2 with publish-gate concerns.'
  - 'KNOWN_FONTS list duplicated server-side mirroring FONT_FAMILIES in admin-field-editor.component.ts. Memory note 2026-05-05 confirms template_fonts table does NOT exist (planned ADR-110 v3.2). Comment in fonts-known.ts flags the manual sync requirement.'
  - 'recent_test_render_24h is a warning, not error — admin can still publish without re-rendering if she trusts the last known good state. Surfaced as orange banner, does not disable Publier.'
  - 'publishedTargets is precomputed once in the orchestrator (1 SELECT WHERE id = ANY) and shared via Set<string>. Each rule keeps O(1) lookup + zero DB IO.'
  - 'HEAD probes use 3s timeout per asset — 8 layers worst-case is 24s, still under any reasonable UX budget for the publish-gate panel. fetch is native (Node 20).'
metrics:
  duration: ~25 min
  completed: 2026-05-05
  tasks: 2
  files_created: 11
  files_modified: 2
  commits: 2
---

# Phase 3 Plan 02: Template Validation Registry — Summary

**One-liner:** Registry serveur de 8 règles extensibles (7 errors + 1 warning) + endpoint `GET /api/remotion-templates/:id/validation` + smoke RED→GREEN itérant sur le registre — source de vérité PUB-01 / TEST-03 pour Plan 04.

## What Was Built

Backend foundations pour le gate de publication (ADR-110 / PUB-01 / TEST-03) :

1. **Types contractuels** (`types.ts`) : `Severity`, `RuleId`, `ValidationContext` (projection légère, decouple de `TemplateV2`), `ValidationCheckResult`, `ValidationResult` (avec `rule_id` + `severity` injectés par l'orchestrateur), `ValidationRule`.

2. **8 fichiers de règles** dans `rules/` :
   - `at-least-one-layer.ts` (error, step 2)
   - `assets-resolve-http-200.ts` (error, step 2 ; HEAD probes parallèles + AbortSignal.timeout(3000))
   - `fonts-known.ts` (error, step 3 ; KNOWN_FONTS allowlist mirrore `FONT_FAMILIES` dashboard)
   - `zones-in-safe-zone.ts` (error, step 3 ; range [0,1] sur position x/y/width/height)
   - `visible-if-keys-exist.ts` (error, step 3 ; parser `<key> == "<value>"` + check option.values)
   - `packshot-refs-options-match.ts` (error, step 4 ; option_key+value alignement)
   - `packshot-refs-target-published.ts` (error, step 4 ; via `publishedTargets` Set précalculé)
   - `recent-test-render-24h.ts` (warning, step 5 ; `test_render_status === 'success'` AND age ≤ 24h)

3. **Orchestrateur** (`index.ts`) : `runValidation(templateId)` → 1 read consolidé via `findV2ById` + `listPackshotRefs` + 2 query inline (test_render columns + publishedTargets Set), puis `Promise.all` sur les 8 règles, retour trié errors-first. Throws `template_not_found` (controller → 404).

4. **Endpoint** : `GET /api/remotion-templates/:id/validation` mounté dans `template-studio.routes.ts` avec `requireRole('super_admin')` + `validateParams(paramSchemas.id)` + `adminRateLimit`. Controller `getValidation` mappe `template_not_found` → 404, autres errors → 500 (Winston logged), succès → 200 `{ results: ValidationResult[] }`. Métrique `neopro_template_studio_operations_total{resource=studio_view,operation=get,status}` réutilisée.

5. **Smoke 7/7** : registry shape (length=8, IDs, severity split 7/1), parametrized RED fixture par règle (8 cas), file-based contracts (route, controller, registry export). Itère sur le registre — ajouter une 9e règle = 1 fichier + 1 entrée dans `RED_FIXTURES`.

## Tasks Completed

| Task | Name                                              | Commit   | Files                                                                        |
| ---- | ------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| 1    | RED smoke — registry shape + 8 RED + endpoint     | a0a709cd | smoke-template-studio-v3-validation.test.ts                                  |
| 2    | 8 rules + types + orchestrator + endpoint (GREEN) | 1976ebca | types.ts, index.ts, 8 rules/_.ts, template-studio.controller.ts, _.routes.ts |

## Verification

- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-validation' --no-coverage --forceExit` → **7/7 GREEN**
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → **40/40 GREEN** (7 suites, no v3 regression)
- `cd central-server && npx jest --testPathPattern='smoke/smoke-(server-core|wiring|service-test-coverage|remotion|adr-refactoring)' --no-coverage --forceExit` → **495/495 GREEN** (incl. `smoke-service-test-coverage` — nouveau service couvert par le smoke registry)
- `cd central-server && npx tsc --noEmit` → **clean**
- `npm run test:smoke:smart` → 26/26 GREEN (smart smoke a sélectionné `smoke-consistency` sur le diff git)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `QueryResultRow` constraint sur `query<T>()`**

- **Found during:** Task 2 (premier `npx jest` sur smoke green)
- **Issue:** `query<{...}>()` rejette les types inline qui n'étendent pas `QueryResultRow` (signature index `[k: string]: unknown`). TS2344.
- **Fix:** Déclaration de `TemplateRenderRow` et `TemplateIdRow` interfaces extending `QueryResultRow` dans `index.ts`.
- **Files modified:** central-server/src/services/template-validation/index.ts
- **Commit:** 1976ebca

### Adaptations vs Plan

- **Plan référence `getStudioView` repository** : c'est en fait `findV2ById` qui retourne `TemplateV2`. `getStudioView` est un controller, pas une méthode repo. Adapté en utilisant `findV2ById` + `listPackshotRefs` + 2 queries directes (test_render + publishedTargets) dans le service orchestrateur.
- **Plan référence `template.packshotRefs` dans TemplateV2** : `TemplateV2` n'expose PAS `packshotRefs`. Solution : `ValidationContext` est une projection légère (NOT `TemplateV2`) qui inclut `packshotRefs`, `test_render_at`, `test_render_status`, et un `publishedTargets: Set<string>` précalculé pour O(1) lookup dans la rule. Décision documentée dans frontmatter.
- **Plan référence FONT_FAMILIES limité (8 polices)** : le vrai `FONT_FAMILIES` du dashboard contient 23 polices (Bulevar, General Sans, Anton, Bebas Neue, Oswald, Teko, Archivo Black, Russo One, Staatliches, Bungee, Abril Fatface, Inter, Roboto, Montserrat, Poppins, Open Sans, Raleway, Work Sans, Barlow, DM Sans, Nunito, Figtree, Playfair Display). KNOWN_FONTS dans `fonts-known.ts` mirrore la liste complète.

### Authentication Gates

None.

### Architectural Changes Considered

None — registry pattern est la décision figée par CONTEXT.md L26-32, l'implémentation suit strictement le contrat.

## Self-Check: PASSED

- FOUND: central-server/src/**tests**/smoke/smoke-template-studio-v3-validation.test.ts
- FOUND: central-server/src/services/template-validation/types.ts
- FOUND: central-server/src/services/template-validation/index.ts
- FOUND: central-server/src/services/template-validation/rules/at-least-one-layer.ts
- FOUND: central-server/src/services/template-validation/rules/assets-resolve-http-200.ts
- FOUND: central-server/src/services/template-validation/rules/fonts-known.ts
- FOUND: central-server/src/services/template-validation/rules/zones-in-safe-zone.ts
- FOUND: central-server/src/services/template-validation/rules/visible-if-keys-exist.ts
- FOUND: central-server/src/services/template-validation/rules/packshot-refs-options-match.ts
- FOUND: central-server/src/services/template-validation/rules/packshot-refs-target-published.ts
- FOUND: central-server/src/services/template-validation/rules/recent-test-render-24h.ts
- FOUND: commit a0a709cd (Task 1 RED)
- FOUND: commit 1976ebca (Task 2 GREEN)
- VERIFIED: smoke 7/7 GREEN
- VERIFIED: full v3 smokes 40/40 GREEN (no regression)
- VERIFIED: tsc --noEmit clean
- VERIFIED: backend wiring smokes 495/495 GREEN
- VERIFIED: 0 query() in controller (controller calls runValidation, all SQL via service)
- VERIFIED: 0 console.log in template-validation/ (Winston only via existing logger)
