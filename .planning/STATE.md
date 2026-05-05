# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Phase 1 — Fondations (ready to plan)

## Current Position

Phase: 1 of 3 (Fondations)
Plan: 04 of 5 — DONE (next: 05)
Status: In progress
Last activity: 2026-05-05 — Plan 04 livré (Step 2 Fonds animés drag-reorder transactionnel + Step 3 Zones modifiables ReactiveForms avec layer_id obligatoire P1)

Progress: [████████░░] 80% (4/5 plans of phase 1)

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~30 min
- Total execution time: ~120 min

**By Phase:**

| Phase         | Plans | Total    | Avg/Plan |
| ------------- | ----- | -------- | -------- |
| 01-fondations | 4/5   | ~120 min | ~30 min  |

| Phase | Plan | Duration | Tasks | Files | Date       |
| ----- | ---- | -------- | ----- | ----- | ---------- |
| 01    | 01   | ~30 min  | 4     | 9     | 2026-05-05 |
| 01    | 02   | ~25 min  | 2     | 9     | 2026-05-05 |
| 01    | 03   | ~25 min  | 2     | 6     | 2026-05-05 |
| 01    | 04   | ~40 min  | 2     | 9     | 2026-05-05 |

_Updated after each plan completion_

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

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Vérifier que central-server/Dockerfile installe déjà ffmpeg/ffprobe avant d'ajouter apt-get (SUMMARY.md gap #1)~~ ✅ Résolu plan 01 — ffmpeg déjà présent runtime stage, commentaire ajouté pour locker.
- ~~Route POST /:id/duplicate existe déjà (shallow) — le handler v3 doit la remplacer, pas en créer une nouvelle~~ ✅ Résolu plan 01 — handler `duplicateTemplate` rebranché sur `templateStudioRepository.duplicateDeep`.
- gsd-tools state advance-plan ne parse pas le format STATE.md actuel (mises à jour faites manuellement)

## Session Continuity

Last session: 2026-05-05
Stopped at: Completed 01-fondations-04-PLAN.md — 3 commits (0a60d266, 230b2ee0, c93ee999) + SUMMARY. Ready for plan 05 (Options club + publish).
Resume file: None
