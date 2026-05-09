---
phase: 07-cloud-api-sync-agent
plan: 02
subsystem: api
tags: [command-queue, receiver, sync-agent, jest, typescript]

# Dependency graph
requires:
  - phase: 04-data-receiver-model
    provides: siteRepository.updateDisplays + getDisplays, DisplayConfig JSONB schema
  - phase: 05-detect-receivers
    provides: receiver-detected/receiver-disconnected whitelist in sync-agent
provides:
  - PATCH /api/sites/:id/displays émet receiver_assignment_updated via commandQueueService après save
  - 'receiver_assignment_updated' whitelisté dans DEFAULT_ALLOWED_COMMANDS du sync-agent Pi
  - Test Jest 3/3 couvrant emission, payload sans receiver, et résilience erreur queue
affects:
  - 07-cloud-03 (CLOUD-03 : handler agent.js consommera receiver_assignment_updated)
  - 07-cloud-04 (dashboard : peut afficher la propagation)

# Tech tracking
tech-stack:
  added: []
  patterns: [best-effort command queue (try/catch autour de sendOrQueue, ne bloque pas HTTP), pattern update_config réutilisé pour receiver_assignment_updated]

key-files:
  created:
    - central-server/src/__tests__/sites-displays-emit-command.test.ts
  modified:
    - central-server/src/controllers/sites.controller.ts
    - raspberry/sync-agent/src/config.js

key-decisions:
  - 'Émission inconditionnelle : pas de condition sur la présence de receiver dans le payload — le Pi reçoit toujours le tableau complet après PATCH (cohérent avec update_config)'
  - 'Best-effort : erreur commandQueueService.sendOrQueue loggée en warn sans bloquer la réponse HTTP 200 — la DB est déjà à jour, le Pi rattrapera au prochain reconnect'
  - 'node_modules symlink pour tests worktree : ln -sf main/central-server/node_modules vers worktree (ts-jest absent en global)'

patterns-established:
  - 'Pattern best-effort queue : try/catch autour de sendOrQueue, logger.warn sur erreur, jamais de throw vers le client HTTP'

requirements-completed:
  - CLOUD-02
  - CLOUD-03

# Metrics
duration: 35min
completed: 2026-05-07
---

# Phase 07 Plan 02: PATCH displays → receiver_assignment_updated emit Summary

**updateSiteDisplays étendu pour émettre receiver_assignment_updated via commandQueueService après chaque PATCH, avec whitelist sync-agent et 3 tests Jest verts**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-07T09:35:00Z
- **Completed:** 2026-05-07T10:10:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Controller `updateSiteDisplays` émet `receiver_assignment_updated` après `siteRepository.updateDisplays` (best-effort, ne bloque pas la réponse)
- `DEFAULT_ALLOWED_COMMANDS` du sync-agent inclut `'receiver_assignment_updated'` (le Pi peut maintenant recevoir cette commande sans la rejeter)
- 3 tests Jest verts : emission avec receiver, payload sans receiver (cohérence update_config), résilience erreur queue

## Task Commits

1. **Task 1: updateSiteDisplays — emit receiver_assignment_updated après save** - `4028ec94` (feat)
2. **Task 2: Sync-agent whitelist — DEFAULT_ALLOWED_COMMANDS** - `47bc573c` (feat)
3. **Task 3: Test Jest — PATCH displays appelle sendOrQueue** - `0d96e2e1` (test)

## Files Created/Modified

- `central-server/src/controllers/sites.controller.ts` - Ajout try/catch sendOrQueue après updateDisplays (+8 lignes)
- `raspberry/sync-agent/src/config.js` - Ajout 'receiver_assignment_updated' dans DEFAULT_ALLOWED_COMMANDS (+2 lignes)
- `central-server/src/__tests__/sites-displays-emit-command.test.ts` - 3 tests Jest (nouveau fichier, 107 lignes)

## Decisions Made

- Émission inconditionnelle — pas de condition sur la présence de `receiver` dans le payload. Le Pi reçoit toujours l'état complet des displays, cohérent avec le pattern `update_config`.
- Best-effort queue — erreur `sendOrQueue` loggée en `warn`, jamais de throw vers le client HTTP. La DB est déjà à jour ; le Pi rattrapera au prochain reconnect.
- Tests via node_modules symlink — `ts-jest` absent globalement, résolu par `ln -sf` du dossier `node_modules` de main neopro vers la worktree.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Jest worktree**: `node_modules` absent dans la worktree `nifty-ellis-756b56` (ts-jest, supertest). Résolu par symlink `central-server/node_modules` depuis le repo principal. Non-bloquant, résolu avant le commit Task 3.
- **UUID validation**: Le test initial utilisait `'test-site-id'` comme siteId mais `validateParams(paramSchemas.id)` impose un UUID v4. Corrigé avec `'550e8400-e29b-41d4-a716-446655440099'`.
- **Role**: `requireRole('admin')` sur la route PATCH — token initial `super_admin` accepté (super_admin satisfait le guard), mais mockResolvedValue retournait 0 calls. Résolu en passant `role: 'admin'` dans `generateToken`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLOUD-02 + CLOUD-03 complets : le cloud propage `receiver_assignment_updated` et le sync-agent l'accepte
- Plan 03 (07-cloud-03) peut implémenter le handler `agent.js` qui consomme cette commande pour mettre à jour `configuration.json` côté Pi
- Aucun blocker

---

_Phase: 07-cloud-api-sync-agent_
_Completed: 2026-05-07_
