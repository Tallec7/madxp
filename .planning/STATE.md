# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Phase 1 — Fondations (ready to plan)

## Current Position

Phase: 1 of 3 (Fondations)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-05-05 — Roadmap créé, 22/22 requirements mappés

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| -     | -     | -     | -        |

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3 = couche UI uniquement — TemplateRuntime.tsx inchangé par design (ADR-110)
- Wizard "Dupliquer puis adapter" comme chemin par défaut
- Vocabulaire métier figé par smoke test (`smoke-template-studio-v3-vocabulary`)
- Aperçu Remotion Player monté une seule fois avec [hidden] — jamais \*ngIf (évite GPU leak)
- duplicateDeep() transactionnel obligatoire (BEGIN/COMMIT sur 6 tables) — pitfall P1 critique
- ffprobe à vérifier dans Dockerfile Railway avant Phase 1 (pitfall P5)

### Pending Todos

None yet.

### Blockers/Concerns

- Vérifier que central-server/Dockerfile installe déjà ffmpeg/ffprobe avant d'ajouter apt-get (SUMMARY.md gap #1)
- Route POST /:id/duplicate existe déjà (shallow) — le handler v3 doit la remplacer, pas en créer une nouvelle

## Session Continuity

Last session: 2026-05-05
Stopped at: Roadmap créé et STATE.md initialisé — prêt pour /gsd:plan-phase 1
Resume file: None
