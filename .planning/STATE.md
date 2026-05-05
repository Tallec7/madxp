# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Phase 1 — Fondations (ready to plan)

## Current Position

Phase: 1 of 3 (Fondations)
Plan: 02 of 5 — DONE (next: 03)
Status: In progress
Last activity: 2026-05-05 — Plan 02 livré (Asset Manager UI : composant dual-context modal+page, 3 endpoints library super_admin, 3 méthodes data service)

Progress: [████░░░░░░] 40% (2/5 plans of phase 1)

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: ~28 min
- Total execution time: ~55 min

**By Phase:**

| Phase         | Plans | Total   | Avg/Plan |
| ------------- | ----- | ------- | -------- |
| 01-fondations | 2/5   | ~55 min | ~28 min  |

| Phase | Plan | Duration | Tasks | Files | Date       |
| ----- | ---- | -------- | ----- | ----- | ---------- |
| 01    | 01   | ~30 min  | 4     | 9     | 2026-05-05 |
| 01    | 02   | ~25 min  | 2     | 9     | 2026-05-05 |

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

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Vérifier que central-server/Dockerfile installe déjà ffmpeg/ffprobe avant d'ajouter apt-get (SUMMARY.md gap #1)~~ ✅ Résolu plan 01 — ffmpeg déjà présent runtime stage, commentaire ajouté pour locker.
- ~~Route POST /:id/duplicate existe déjà (shallow) — le handler v3 doit la remplacer, pas en créer une nouvelle~~ ✅ Résolu plan 01 — handler `duplicateTemplate` rebranché sur `templateStudioRepository.duplicateDeep`.
- gsd-tools state advance-plan ne parse pas le format STATE.md actuel (mises à jour faites manuellement)

## Session Continuity

Last session: 2026-05-05
Stopped at: Completed 01-fondations-02-PLAN.md — 2 commits (10eda5e8, 9951e068) + SUMMARY. Ready for plan 03 (Wizard shell + Step 1 Identité).
Resume file: None
