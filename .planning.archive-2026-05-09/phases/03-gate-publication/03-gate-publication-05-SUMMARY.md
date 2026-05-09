---
phase: 03-gate-publication
plan: 05
subsystem: api
tags: [publish-gate, audit, winston, super-admin, modal, vocabulary, repository-pattern]

requires:
  - phase: 03-gate-publication-02
    provides: 'runValidation(id) registry-based + ValidationContext'
  - phase: 03-gate-publication-03
    provides: 'POST /:id/test-render async tracking'
  - phase: 03-gate-publication-04
    provides: 'Wizard Step 5 Validation UI + Player toggle + VALIDATION_RULE_LABELS FR'
provides:
  - 'POST /api/remotion-templates/:id/publish (validation-gated, 409 validation_failed if any error rule fails)'
  - 'POST /api/remotion-templates/:id/unpublish (super_admin only, structured audit)'
  - 'templateStudioRepository.updatePublishedFlag(id, published)'
  - 'Card UX unpublish via shared ConfirmDialog (FR Confirmer/Abandonner)'
  - 'MODAL_MESSAGES vocabulary block + ERROR_MESSAGES toasts (template_published / template_unpublished / validation_failed)'
  - 'Winston structured audit logs: action=template.published|unpublished + actor_id + template_id + timestamp'
affects: [phase-4-rollout, sponsor-reports, observability]

tech-stack:
  added: []
  patterns:
    - 'Repository-pattern enforcement on controllers (zero bare query() in remotion-templates.controller.ts)'
    - 'Vocabulary lexicon split: ERROR_MESSAGES (toasts) vs MODAL_MESSAGES (confirm dialogs)'
    - 'Winston structured audit logs for super_admin actions (action + actor_id + template_id + timestamp)'

key-files:
  created:
    - 'central-server/src/__tests__/smoke/smoke-template-studio-v3-publish-audit.test.ts'
  modified:
    - 'central-server/src/controllers/remotion-templates.controller.ts'
    - 'central-server/src/routes/remotion-templates.routes.ts'
    - 'central-server/src/validation/schemas.ts'
    - 'central-server/src/repositories/template-studio.repository.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/template-card.component.html'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates-list.component.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts'
    - 'central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts'

key-decisions:
  - "Publish gate côté serveur — controller refuse 409 si runValidation retourne ≥1 règle severity=error & ok=false (UI gating Plan 04 est UX, le serveur est l'autorité finale)"
  - 'Audit Winston structured (logger.info avec action/actor_id/template_id/timestamp explicites) plutôt que message string-only — facilite grep + ingestion future ELK'
  - 'Modale unpublish via ConfirmDialog partagé (réutilisé du dashboard) plutôt que window.confirm — bind FR vocabulary keys, Annuler banlisté'
  - "MODAL_MESSAGES const séparé d'ERROR_MESSAGES (les modales ne sont pas des erreurs, lexiques distincts pour smoke banlist)"
  - 'updatePublishedFlag thin method dans templateStudioRepository (single parameterized UPDATE) — controllers strict repo-pattern (CLAUDE.md NE JAMAIS FAIRE)'

patterns-established:
  - 'Audit log shape figée: action enum string + actor_id + template_id + ISO timestamp — réutilisable pour toute future action super_admin'
  - 'Validation-gated mutation: controller appelle service de validation AVANT mutation DB, retourne 409 + failed_rules sur échec'
  - 'Vocabulary lexicon split (ERROR_MESSAGES/MODAL_MESSAGES) — facilite ban-list smoke et adoption i18n future'

requirements-completed: [PUB-01]

duration: ~35 min
completed: 2026-05-05
---

# Phase 3 Plan 05: Publish/Unpublish endpoints + audit Winston + UX card unpublish — Summary

**POST /:id/publish gated par runValidation (409 validation_failed si erreur), POST /:id/unpublish super_admin only, audit Winston structured (template.published/unpublished), card UX dépublier via ConfirmDialog FR — tout via repository pattern (zero bare query() dans controllers).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-05T22:00:00Z
- **Completed:** 2026-05-05T22:35:00Z (incl. UAT human-verify)
- **Tasks:** 3 (RED smoke + GREEN implementation + Human UAT approved)
- **Files modified:** 9

## Accomplishments

- Publish/Unpublish endpoints REST production-ready, gatés validation côté serveur (autorité finale, UI Plan 04 = double-check UX)
- Audit Winston structured + observable via `grep "template.(published|unpublished)" logs/*.log` (vérifié UAT step 10)
- Card UX dépublier visible super_admin uniquement, modale FR ConfirmDialog (Confirmer/Abandonner — Annuler banlisté Phase 1)
- Repository pattern strict : `templateStudioRepository.updatePublishedFlag(id, bool)` — 0 bare query() dans controllers
- Phase 3 ROADMAP success criteria #1 (publish disabled si checklist incomplète) confirmé E2E par UAT

## Task Commits

1. **Task 1: RED smoke — publish gate + audit + unpublish (5 tests)** — `29031900` (test)
2. **Task 2: Implement publish/unpublish + dataservice + UX card** — `b4138c2b` (feat)
3. **Task 3: Human UAT — Publish flow E2E** — approved (11/11 steps OK : publish gate FR, deep-link "Corriger →", Player toggle Aperçu live/Rendu de test, modale ConfirmDialog Confirmer/Abandonner, audit logs Winston, 409 validation_failed via curl)

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP)

## Files Created/Modified

### Created

- `central-server/src/__tests__/smoke/smoke-template-studio-v3-publish-audit.test.ts` — 5 file-based tests (routes, publish controller, audit logs, unpublish controller, repo method)

### Modified

- `central-server/src/controllers/remotion-templates.controller.ts` — `publishTemplate` + `unpublishTemplate` controllers
- `central-server/src/routes/remotion-templates.routes.ts` — POST `/:id/publish` + `/:id/unpublish` routes (super_admin guard + Joi params)
- `central-server/src/validation/schemas.ts` — `publishSchemas.params` (UUID)
- `central-server/src/repositories/template-studio.repository.ts` — `updatePublishedFlag(id, published)` method
- `central-dashboard/.../template-card.component.{ts,html}` — `unpublishRequested` Output + bouton "Dépublier" + modale ConfirmDialog
- `central-dashboard/.../remotion-templates-list.component.ts` — `onUnpublishRequested(id)` handler + reload + toast
- `central-dashboard/.../remotion-templates-data.service.ts` — `publishTemplate(id)` + `unpublishTemplate(id)` Observables
- `central-dashboard/.../studio-v3/vocabulary.constants.ts` — `MODAL_MESSAGES` const + `ERROR_MESSAGES.{template_published, template_unpublished, validation_failed}`

## Decisions Made

Voir frontmatter `key-decisions`. Points-clés :

- **Publish autorité serveur** : Plan 04 UI gate est UX (boutons disabled, tooltip compte) ; controller `publishTemplate` re-runValidation et retourne 409 même si UI n'a pas affiché les rules en rouge (race possible si admin modifie via 2 onglets).
- **Audit shape figée** : `{ action, actor_id, template_id, timestamp }` plutôt que message string. Réutilisable pour future audit (e.g. `template.duplicated`, `template.assets_replaced`).
- **MODAL_MESSAGES séparé d'ERROR_MESSAGES** : les modales ne sont pas des erreurs ; smoke banlist applique des règles différentes (pas de placeholder `{N}` dans modales par exemple).

## Deviations from Plan

None — plan exécuté tel quel. RED 5/5 → GREEN 5/5 propre, tsc clean, smoke v3 régression-free.

## Issues Encountered

None.

## User Setup Required

None — pas de migration DB additionnelle (colonne `published` existe depuis ADR-110 Phase 0). Logs Winston déjà configurés (CLAUDE.md NE JAMAIS FAIRE: console.log).

## Phase 3 Closure Readiness

**Phase 3 Gate de publication : 5/5 plans COMPLETE.**

Success criteria ROADMAP atteints :

1. ✅ Bouton Publier disabled tant que checklist incomplète + retour explicite par critère (Plan 02 registry + Plan 04 UI + Plan 05 backend gate)
2. ✅ Test render avec données factices → Player intégré + template gated si rendu fail (Plan 03 backend + Plan 04 UI toggle)
3. ✅ smoke `smoke-template-studio-v3-validation` GREEN itérant sur registre (Plan 02)

Bonus livrés Plan 05 hors success criteria :

- Audit Winston (observabilité super_admin actions)
- Unpublish flow (rétractation publication)
- Modale FR ConfirmDialog (UX cohérente avec lexique figé)

**Template Studio v3 v3.0 milestone : 14/14 plans COMPLETE.** Ready for `gsd-verifier` cross-phase audit + ADR-110 Phase v3.0 close-out.

---

_Phase: 03-gate-publication_
_Completed: 2026-05-05_

## Self-Check: PASSED

- SUMMARY.md exists at expected path
- Commits 29031900 (test) + b4138c2b (feat) found in git log
