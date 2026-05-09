---
phase: 03-gate-publication
plan: 04
subsystem: dashboard-wizard-publish-gate
tags: [wizard, step-5, publish-gate, test-render, adr-110, pub-01, pub-02]
requires:
  - Plan 03-02 (GET /api/remotion-templates/:id/validation — 8-rule registry)
  - Plan 03-03 (POST /api/remotion-templates/:id/test-render — async render queue)
  - Plan 02-* (FR vocabulary blocklist + Pitfall P3 [hidden] pattern)
provides:
  - WizardStepPublishComponent (standalone OnPush, signals + input/output)
  - VALIDATION_RULE_LABELS const (8 FR labels frozen by smoke)
  - ERROR_MESSAGES.test_render_failed FR string
  - Player toggle « Aperçu live / Rendu de test » (Pitfall P3 — Player stays mounted)
  - DataService getValidation + createTestRender
  - PreviewService setMode/loadTestRenderUrl/resetTestRender (signals)
  - Deep-link 'Corriger →' with ?focus=<entityId> queryParam + scroll-into-view
affects:
  - WizardStep type extended 1..4 → 1..5 + STEP_LABELS[5] = Validation
  - Step 4 'Terminer' now advances to Step 5 instead of leaving the wizard
tech-stack:
  added: []
  patterns:
    - 'Standalone OnPush component with signal-based input/output (Angular 20 v20)'
    - '[hidden] gate on step container + sibling Player stays mounted (Pitfall P3)'
    - 'rxjs interval(2000) polling + Subscription teardown (testRenderPollSub)'
    - 'Deep-link via Router.navigate({ queryParams, queryParamsHandling: merge })'
    - 'Server snake_case → camelCase DTO co-located with the data service'
key-files:
  created:
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.html
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.scss
  modified:
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.scss
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
decisions:
  - 'Step 5 mounted via [hidden]="currentStep() !== 5" — never *ngIf (Pitfall P3, sibling Player must stay mounted to avoid GPU SharedImage leaks).'
  - 'Player toggle visible only on Step 5 via [hidden]="currentStep !== 5" too — same pattern, no DOM unmount.'
  - 'Test render polling uses existing pollRenderJob (legacy ADR-054 endpoint) — no new RenderJob method needed since the worker discriminates via title prefix `test-render:` (Plan 03-03).'
  - 'PreviewService promoted to readonly public on the wizard shell — template needs to read previewService.mode() / testRenderUrl() signals as inputs of preview panel.'
  - 'Step 4 Terminer now advances to Step 5 (gate) instead of leaving the wizard — admin must explicitly publish to exit. Cancel/Abandonner remains the bail-out path.'
  - 'Deep-link Corriger → uses Router.navigate({ queryParams: { focus: entityId }, queryParamsHandling: merge, replaceUrl: true }) — sharable URL + refresh-safe.'
  - 'errorCount filters !ok && severity===error (not all !ok) — warnings (recent_test_render_24h) do not block publish, only show banner.'
  - 'testRenderError signal cleared on each new attempt + on success — prevents stale FR toast.'
  - 'computeResumeStep refined to land on step 4 when options exist (instead of always 4) — keeps refresh consistent. Step 5 reached only via explicit Terminer click.'
metrics:
  duration: ~30 min
  completed: 2026-05-05
  tasks: 2
  files_created: 3
  files_modified: 9
  commits: 2
---

# Phase 3 Plan 04: Wizard Step 5 Publish Gate — Summary

**One-liner:** Wizard Step 5 'Validation' (`[hidden]`-mounted) consommant `GET /:id/validation` + `POST /:id/test-render`, toggle Player 'Aperçu live / Rendu de test' (Pitfall P3 préservé), bouton Publier gated sur erreurs, deep-link Corriger → step+entité fautive. PUB-01 + PUB-02 frontend complets.

## What Was Built

Frontend du gate de publication (Phase 3 success criteria #1 + #2) :

1. **`VALIDATION_RULE_LABELS`** (`vocabulary.constants.ts`) — 8 entries FR figées miroirs des `rule_id` retournés par le registre serveur Plan 03-02 (`at_least_one_layer`, `assets_resolve_http_200`, `fonts_known`, `zones_in_safe_zone`, `visible_if_keys_exist`, `packshot_refs_options_match`, `packshot_refs_target_published`, `recent_test_render_24h`). Smoke `VALIDATION_RULE_LABELS (Phase 3 PUB-01)` lock le contrat (3 nouveaux tests).

2. **`ERROR_MESSAGES.test_render_failed`** — message FR figé : « Le rendu de test a échoué — vérifiez vos fonds animés et fonts. »

3. **Type `ValidationResult`** dans `wizard-state.types.ts` (mirrors server contract `ValidationResultDto` exporté par `remotion-templates-data.service.ts`).

4. **`WizardStepPublishComponent`** — standalone OnPush avec :
   - `input.required<string>()` templateId
   - `input.required<ValidationResult[]>()` validationResults
   - `input<boolean>()` testRenderInProgress + `input<string|null>()` testRenderError
   - `output<void>()` requestTestRender + publish, `output<{step,entityId?}>()` fixHint
   - `computed()` errorCount / warningCount / canPublish / disabledTitle
   - HTML : checklist `vrow--ok|--fail|--warning` avec icônes ✓/✗/⚠ + label FR + message + bouton « Corriger → » (émis si `!ok && fixHint`). Bouton Publier disabled + tooltip FR `Corrigez d'abord les ${N} critères en rouge`. Bandeaux summary `✗ {N} critères en rouge — Corrigez d'abord` / `⚠ Pas de test de rendu récent — recommandé` / `✓ Tous les critères sont au vert`.

5. **WizardStep extension** : `1 | 2 | 3 | 4` → `1 | 2 | 3 | 4 | 5`. STEP_LABELS[5] = Validation / Rendu de test + publication. nextStep upper bound 4 → 5.

6. **Wizard shell wiring** (`studio-v3-wizard.component.ts/html`) :
   - Mount via `[hidden]="currentStep() !== 5"` (Pitfall P3 respecté).
   - Effect : sur entrée step 5 + templateId présent → `dataService.getValidation(id)`. Re-fetch sur retour ultérieur.
   - `onRequestTestRender()` : `createTestRender(id)` puis polling rxjs `interval(2000)` sur `pollRenderJob(jobId)`. Statuts `completed|success` → `previewService.loadTestRenderUrl(url)`. Statuts `failed|error` ou erreur HTTP → toast FR `ERROR_MESSAGES.test_render_failed`.
   - `onFixHint(hint)` : `Math.min(Math.max(hint.step,1),5)` clamp + `router.navigate(?focus=<entityId>)` si entityId + `setTimeout` scrollIntoView + auto-clear 4s.
   - `onPublish()` : `togglePublish(id, true)` puis navigate vers la liste. Soft-failure → re-fetch validation.
   - `onPreviewModeChange(mode)` : `previewService.setMode(mode)`.
   - Step 4 `Terminer` → `currentStep.set(5)` (avant : leave wizard).

7. **DataService extensions** :
   - `getValidation(id)` → `GET /api/remotion-templates/:id/validation` retourne `{ results: ValidationResultDto[] }`.
   - `createTestRender(id)` → `POST /api/remotion-templates/:id/test-render` body `{}`, retourne `RenderJobEnqueued` (job_id).
   - `pollRenderJob(jobId)` réutilisé tel quel (legacy ADR-054, suffit puisque worker Plan 03-03 discrimine via `title: 'test-render:'`).

8. **PreviewService extensions** :
   - `_mode = signal<PreviewMode>('live')` + `_testRenderUrl = signal<string|null>(null)` + readonly accessors.
   - `setMode(mode)` / `loadTestRenderUrl(url)` (set both) / `resetTestRender()`.

9. **Player toggle** dans `wizard-preview-panel.component.{ts,html,scss}` :
   - Nouveaux inputs : `currentStep`, `previewMode`, `testRenderUrl`, output `previewModeChange`.
   - Toggle 2 boutons `Aperçu live` / `Rendu de test` mounté via `[hidden]="currentStep !== 5"` (NEVER `*ngIf`).
   - `app-template-studio-player` reste monté en permanence ; `[hidden]="previewMode === 'test-render' && !!testRenderUrl"` quand le MP4 doit prendre le dessus.
   - `<video>` Plan 03-04 `*ngIf="testRenderUrl"` (plus rendu après premier load) + `[hidden]="previewMode !== 'test-render'"` pour basculer source. Bouton Rendu de test `[disabled]="!testRenderUrl"` tant qu'aucun rendu n'a abouti.

10. **Smoke vocabulary étendu** : 5 baseline tests + 3 nouveaux (TEST 6) — total 8/8 GREEN. Banlist VALIDATION_RULE_LABELS values empêche `'layer'`, `'slot'`, `'pix_fmt'`, `'option_key'`, `'composition_id'`, `'scaleFrom'`, `'scaleTo'`, `'durationMs'`, `'visible_if'` quoted bare.

## Tasks Completed

| Task | Name                                                                | Commit   | Files                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | RED smoke — VALIDATION_RULE_LABELS + ERROR_MESSAGES.test_render…    | 65e2a91d | smoke-template-studio-v3-vocabulary.test.ts                                                                                                                                                                          |
| 2    | Vocabulary + Step 5 component + Player toggle + dataservice (GREEN) | ff57bd29 | vocabulary.constants.ts, wizard-state.types.ts, studio-v3-wizard.{ts,html}, wizard-preview-panel.{ts,html,scss}, wizard-step-publish.{ts,html,scss}, remotion-templates-data.service.ts, remotion-preview.service.ts |

## Verification

- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-vocabulary'` → **8/8 GREEN** (5 baseline + 3 Phase 3 PUB-01)
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-'` → **48/48 GREEN** (8 suites, no v3 regression)
- `cd central-dashboard && npx tsc --noEmit -p tsconfig.json` → **clean** (exit 0)
- `npm run test:smoke:smart` → **393/393 GREEN** (smart smoke a sélectionné `smoke-dashboard-guards` + `smoke-remotion` sur le diff git)
- `node scripts/check-hardcoded-i18n.js` sur les 7 fichiers v3 modifiés → **0 nouveau hit** (2 hits pré-existants dans templates-backgrounds-manager + connection-indicator, hors scope plan 04)
- Acceptance grep checks (`grep -c VALIDATION_RULE_LABELS` / `grep -c test_render_failed` / `grep -c "wizard-step-publish"` / `grep -c '\[hidden\]="currentStep() !== 5"'` / `grep -E "\*ngIf=.currentStep\(\)" wizard-preview-panel.component.html | wc -l = 0` / `grep -c "Publier ce template"` / `grep -cE "getValidation|createTestRender"` / `grep -cE "setMode|loadTestRenderUrl"`) → **all PASS**

## Deviations from Plan

### Adaptations vs Plan

- **Plan référence `dataService.getRenderJob(jobId)`** : la méthode existante côté dashboard est `pollRenderJob(jobId)` (legacy ADR-054). Réutilisée telle quelle, suffit puisque le worker Plan 03-03 discrimine via `title.startsWith('test-render:')` côté serveur — pas besoin d'une nouvelle méthode dashboard. La snapshot retournée expose `video_url` et `status`.
- **Plan référence Pitfall P2 et P3 séparément** : la documentation projet les unifie sous "Player stays mounted, never \*ngIf". Comportement implémenté : `app-template-studio-player` reste monté ; seuls la visibilité (toggle live/test-render via `[hidden]`) et la source (signal `previewState` vs MP4 URL) varient.
- **Plan référence `goToStep` + ALL_STEPS = [1,2,3,4]`** : ALL_STEPS étendu à `[1,2,3,4,5]` + nextStep upper bound 4 → 5 (pour cohérence du stepper sidebar).
- **Plan référence `pollRenderJob` direct sur l'effect** : implémenté via `rxjs interval(2000)` + Subscription stockée dans `testRenderPollSub` pour teardown propre (cleanup dans tous les terminaisons : success / failure / error). Évite les pollings dormants si l'admin quitte step 5 avant la fin.
- **Plan référence `requestVideoFrameCallback`/transitions** : non nécessaire ici (pas de transition entre 2 `<video>` HD simultanés — Pitfall feedback Pi5 GPU SharedImage). Le Player Remotion garde son canvas et le `<video>` test-render est un nouvel élément `*ngIf` mounté à la demande, jamais 2 décodeurs HW en parallèle.
- **Plan suggère `effect on currentStep===5`** : implémenté via `effect(() => { if step===5 && id) fetchValidation(id) })`. La re-fetch se déclenche AUSSI au retour ultérieur sur step 5 (la signature de l'effect tracke `currentStep + templateId`), couvrant le besoin de re-validation après fix.

### Auto-fixed Issues

Aucune. Le plan a été exécuté tel qu'écrit ; les ajustements ci-dessus sont des adaptations au code existant (méthodes déjà nommées, types déjà exportés), pas des bugs à corriger.

### Authentication Gates

None.

### Architectural Changes Considered

None — Pitfall P3 (Player stays mounted via `[hidden]`) est la décision figée par CONTEXT.md ; toggle implémenté en respectant strictement.

## Self-Check: PASSED

- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.ts
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.html
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-step-publish.component.scss
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (VALIDATION_RULE_LABELS + test_render_failed)
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard-state.types.ts (WizardStep extended + ValidationResult)
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.ts (Step 5 wiring + onFixHint + test-render polling)
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/studio-v3-wizard.component.html (Step 5 mounted [hidden])
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.ts (previewMode + testRenderUrl inputs)
- FOUND: central-dashboard/src/app/features/content/remotion-templates/studio-v3/wizard/wizard-preview-panel.component.html (toggle [hidden]="currentStep !== 5")
- FOUND: central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (getValidation + createTestRender)
- FOUND: central-dashboard/src/app/features/content/remotion-templates/remotion-preview.service.ts (setMode + loadTestRenderUrl + resetTestRender)
- FOUND: central-server/src/**tests**/smoke/smoke-template-studio-v3-vocabulary.test.ts (8/8 tests)
- FOUND: commit 65e2a91d (Task 1 RED)
- FOUND: commit ff57bd29 (Task 2 GREEN)
- VERIFIED: smoke vocabulary 8/8 GREEN (5 baseline + 3 Phase 3 PUB-01)
- VERIFIED: full v3 smokes 48/48 GREEN (no regression)
- VERIFIED: tsc --noEmit clean (exit 0)
- VERIFIED: smart smoke 393/393 GREEN
- VERIFIED: 0 \*ngIf="currentStep…" pattern dans wizard-preview-panel.component.html (Pitfall P3)
- VERIFIED: [hidden]="currentStep() !== 5" mounté ×2 dans studio-v3-wizard.component.html (placeholder + Step 5 component)
- VERIFIED: i18n blocklist clean — 0 hit Suivant/Annuler/En cours/Supprimer dans les fichiers nouveaux
