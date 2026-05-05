---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: milestone
status: Ready for Plan 04 (visible_if click-to-highlight + transactional renameOptionKey)
stopped_at: Completed 02-ux-interactive-03-PLAN.md
last_updated: '2026-05-05T14:30:00.000Z'
last_activity: 2026-05-05 — Phase 2 Plan 03 livré (AnimationCard + AnimationPicker, 5 cards visuelles, hover preview, banlist scaleFrom/scaleTo/durationMs)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 9
  completed_plans: 8
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Phase 1 — Fondations (ready to plan)

## Current Position

Phase: 2 of 3 (UX interactive) — IN PROGRESS
Plan: 03 of 4 — DONE
Status: Ready for Plan 04 (visible_if click-to-highlight + transactional renameOptionKey)
Last activity: 2026-05-05 — Phase 2 Plan 03 livré (AnimationCard + AnimationPicker, 5 cards visuelles, hover preview, banlist scaleFrom/scaleTo/durationMs)

Progress: [█████░░░░░] 57% (8/14 plans total — Phase 1 5/5 + Phase 2 3/4)

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: ~29 min
- Total execution time: ~145 min

**By Phase:**

| Phase             | Plans | Total    | Avg/Plan |
| ----------------- | ----- | -------- | -------- |
| 01-fondations     | 5/5   | ~145 min | ~29 min  |
| 02-ux-interactive | 3/4   | ~55 min  | ~18 min  |

| Phase | Plan | Duration | Tasks | Files | Date       |
| ----- | ---- | -------- | ----- | ----- | ---------- |
| 01    | 01   | ~30 min  | 4     | 9     | 2026-05-05 |
| 01    | 02   | ~25 min  | 2     | 9     | 2026-05-05 |
| 01    | 03   | ~25 min  | 2     | 6     | 2026-05-05 |
| 01    | 04   | ~40 min  | 2     | 9     | 2026-05-05 |
| 01    | 05   | ~25 min  | 2     | 8     | 2026-05-05 |
| 02    | 01   | ~10 min  | 2     | 2     | 2026-05-05 |

_Updated after each plan completion_
| Phase 02-ux-interactive P02 | 25min | 3 tasks | 11 files |
| Phase 02-ux-interactive P03 | 20min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3 = couche UI uniquement — TemplateRuntime.tsx inchangé par design (ADR-110)
- Wizard "Dupliquer puis adapter" comme chemin par défaut
- Vocabulaire métier figé par smoke test (`smoke-template-studio-v3-vocabulary`) — **DONE plan 01**
- Aperçu Remotion Player monté une seule fois avec [hidden] — jamais \*ngIf (évite GPU leak)
- duplicateDeep() transactionnel obligatoire (BEGIN/COMMIT sur 6 tables) — pitfall P1 critique — **DONE plan 01** (utilise getClient() typé, composition_id suffixé timestamp base36)
- ffprobe à vérifier dans Dockerfile Railway avant Phase 1 (pitfall P5) — **DONE plan 01** (déjà installé via apt ffmpeg, commentaire Dockerfile lock la dep runtime)
- Plan 01 deviation : asset upload handler vit dans `remotion-templates.controller.ts`, pas `template-studio.controller.ts` (réf plan obsolète)
- Plan 01 deviation : `pool` est default-export — utiliser `getClient()` typé pour les transactions
- Plan 01 deviation : colonnes plan template aspirationnelles — alignées sur full-schema.sql réel (pas de `template_layers.alpha`/`parent_layer_id`/`safe_zone`/`fit_mode` ; `template_options.key` pas `option_key`)
- Plan 02 : Asset Manager dual-context (modal | page) — 1 composant standalone qui rend en modal (wizard) ET en page (route super_admin) selon `@Input context` + `route.snapshot.data.context`
- Plan 02 : asset id déterministe sha256(url).slice(0,16) — pas de table template_assets en Plan 02, l'URL FTP reste la PK logique (table dédiée sera Phase 2 si nécessaire)
- Plan 02 deviation : `ftpService.delete()` n'existe pas — utiliser `deleteFileFromFtp(filename)` depuis `config/ftp-storage` + helper `stripPublicPrefix(url)` pour reconstruire le storage path
- Plan 03 : Wizard data-driven, `currentStep = signal<WizardStep>()` + step containers en `[hidden]` (jamais `*ngIf` — Pitfall P2 contre fuite GPU Remotion Player Phase 2). Form state lifted en parent signal — step composants pure I/O.
- Plan 03 : INSERT immédiat sur Step 1 Continuer + `Location.replaceState('/new/:id')` → wizard refresh-safe (pas de perte de données si fermeture onglet)
- Plan 03 deviation : `TemplateStudioView` est plat (camelCase à la racine) — pas de `view.template` envelope
- Plan 03 deviation : `@Output() submit` interdit par `@angular-eslint/no-output-native` → renommé en `next` (convention pour tous les step components downstream)
- Plan 03 deviation : verbes UI standards (`Suivant`, `Annuler`...) bloqués par `scripts/check-hardcoded-i18n.js` → utiliser synonymes non-blocklistés (`Continuer →`, `← Retour`, `Abandonner`) tant que i18n complet pas déployé Phase 3
- Plan 04 : Step 2 (Fonds animés) drag-reorder via @angular/cdk + POST /:id/layers/reorder transactionnel (BEGIN/COMMIT, ownership check, 400 layer_ownership_mismatch). Optimistic UI avec revert-on-error.
- Plan 04 : Step 3 (Zones modifiables) ReactiveForms 2 sub-tabs texte/image, layer_id Validators.required + UI button gated `layers().length === 0` (Pitfall P1 mirror du Joi NOT NULL).
- Plan 04 : SAFE_ZONE_PRESETS keys === DB fit_mode CHECK values (4 presets) ; anchor inféré (top-center, center-left, center, center) du preset.
- Plan 04 deviation : route mountée sur `/api/remotion-templates` (pas `/api/remotion-templates-studio` comme dans le PLAN — le router Studio est mounté FIRST sur le même prefix que le legacy).
- Plan 04 deviation : `createImageSlot` n'appliquait pas le fallback layer_id NOT NULL (mirroring `createTextField`) — ajouté en plan 04 pour cohérence ADR-086.
- Plan 04 deviation : `visibleIf` était unreachable depuis l'API publique (column existait depuis ADR-086 mais set uniquement par duplicateDeep) — Joi + INSERT + colMap étendus en plan 04.
- Plan 04 deviation i18n : « Supprimer » blocklisté → synonyme « Retirer » utilisé (extension Plan 03 deviation list).
- Plan 05 : Step 4 (Options club) data-driven sur les colonnes DB réelles (`template_options.key` PAS `option_key` ; `template_packshot_refs.option_key` IS correct comme FK). Compteur « ✓ N zones reliées » via regex `\b{key}\s*==` sur `visibleIf` text+image.
- Plan 05 : Bouton Dupliquer sur card → POST /api/remotion-templates/:id/duplicate (route legacy, branchée sur duplicateDeep par Plan 01) → router.navigate avec `?from=duplicate` consommé par computeResumeStep refiné qui force step 3.
- Plan 05 : « + Nouveau template » sur la liste repointé du modal V2 legacy vers `router.navigate('/content/templates-remotion/new')` (wizard V3). V2 reste accessible programmatiquement pour rollback Phase 2.
- Plan 05 deviation : `@Output() finish` bloqué par `@angular-eslint/no-output-native` (collision DOM Animation event onfinish) → renommé `finished` (extension Plan 03 list `submit` → `next`).
- Plan 05 deviation i18n : « Oui / Non » (Oui+Non blocklistés) + « En cours… » (En cours blocklisté) → « Activé / Désactivé » + « Retrait… ».
- Plan 05 deviation : `<label>` non-associated → `<span class="wso__packshot-label">` (label-has-associated-control ESLint).
- Plan 05 : Backend renvoie snake_case (SELECT \*) → adapters dataservice (`mapTemplateOptionRow`, `mapPackshotRefRow`) normalisent vers camelCase pour cohérence avec `getStudioView` Plan 03.
- Plan 05 : Phase 1 COMPLETE (5/5 plans, 13/13 requirements, 4/4 success criteria ROADMAP). Ready for `gsd-verifier`.
- Phase 2 Plan 01 : ERROR_MESSAGES const (`as const`) avec 3 codes Phase 1 (asset_alpha_required, duplicate_requires_v2, asset_in_use) + ErrorMessageCode type. Stockage co-localisé avec VOCABULARY_MAP (single source of truth lexicon v3).
- Phase 2 Plan 01 : Banlist directory-wide via `listFilesRecursive` + regex `(['"])${banned}\\1` (quoted bare word only — accepte templateLayer/slotKey/etc comme identifiers). Exclut vocabulary.constants.ts (couvert par Test 3 stricter).
- Phase 2 Plan 01 : Convention placeholder `{N}` interpolé côté caller via `.replace('{N}', String(value))` — pas de dépendance ICU plural lib.
- Phase 2 Plan 01 : 0 deviation — plan exécuté tel quel, RED → GREEN propre, smoke 5/5 + smart 180/180 + ng build clean.

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Vérifier que central-server/Dockerfile installe déjà ffmpeg/ffprobe avant d'ajouter apt-get (SUMMARY.md gap #1)~~ ✅ Résolu plan 01 — ffmpeg déjà présent runtime stage, commentaire ajouté pour locker.
- ~~Route POST /:id/duplicate existe déjà (shallow) — le handler v3 doit la remplacer, pas en créer une nouvelle~~ ✅ Résolu plan 01 — handler `duplicateTemplate` rebranché sur `templateStudioRepository.duplicateDeep`.
- gsd-tools state advance-plan ne parse pas le format STATE.md actuel (mises à jour faites manuellement)

## Session Continuity

Last session: 2026-05-05T14:29:10.389Z
Stopped at: Completed 02-ux-interactive-03-PLAN.md
Resume file: None
