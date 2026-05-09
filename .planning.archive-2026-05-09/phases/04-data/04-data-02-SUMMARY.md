---
phase: 04-data
plan: 02
subsystem: central-server / repository-layer
tags: [milestone-v4.0, multi-screen, firestick, displays, repository-pattern, jsonb]
requires:
  - phase: 04-data-01
    provides: DisplayConfig.receiver type + Joi validator + idempotent migration
provides:
  - siteRepository.getReceiverForDisplay(siteId, displayIndex)
  - siteRepository.setReceiver(siteId, displayIndex, receiver | null)
  - 7 unit tests covering read/write/null/out-of-bounds/missing-site cases
affects:
  - Phase 5 (DETECT) — Pi-side service writes detected receivers via setReceiver
  - Phase 7 (CLOUD) — sync-agent + API routes read/write receivers via these methods
  - Future controllers manipulating receiver assignment (no JSONB plumbing required)
tech-stack:
  added: []
  patterns:
    - Repository method composition (getDisplays + updateDisplays) — zero new query() calls
    - Defensive throw on out-of-bounds index (no phantom display creation)
    - Nullable receiver write pattern (null = désassignation)
key-files:
  created: []
  modified:
    - central-server/src/repositories/site.repository.ts
    - central-server/src/repositories/site.repository.test.ts
key-decisions:
  - 'setReceiver throws on unknown displayIndex rather than silently appending — création de display reste de la responsabilité de updateDisplays'
  - 'Composition de méthodes existantes (getDisplays + updateDisplays) plutôt que requêtes JSONB jsonb_set — respect strict du repository pattern, ESLint guard satisfait'
  - 'getReceiverForDisplay retourne null pour 4 cas (site absent, index hors borne, display sans receiver, receiver null) — caller pattern uniforme'
patterns-established:
  - 'Repo composition over raw SQL: nouvelles méthodes JSONB construites par .map sur le snapshot getDisplays() puis updateDisplays()'
  - 'Test mocking via jest.mock(../config/database) avec mockResolvedValueOnce pour SELECT puis UPDATE — pattern réutilisable pour autres extensions JSONB'
requirements-completed: [DATA-03]
duration: ~12min
completed: 2026-05-06
---

# Phase 04 Plan 02: DATA — Receiver Repository Methods Summary

**siteRepository expose `getReceiverForDisplay` + `setReceiver` typés `DisplayReceiver`, composés sur les méthodes JSONB existantes (`getDisplays` + `updateDisplays`) — zéro nouveau `query()` direct, repository pattern préservé, 7 tests unitaires verts.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-05-06
- **Tasks:** 1 (TDD : RED + GREEN, pas de REFACTOR nécessaire)
- **Files modified:** 2

## Accomplishments

- `getReceiverForDisplay(siteId, displayIndex): Promise<DisplayReceiver | null>` — lit le receiver d'un display, retourne `null` pour les 4 cas absents (site inconnu, index hors borne, display sans receiver, receiver explicitement null)
- `setReceiver(siteId, displayIndex, receiver | null): Promise<void>` — écrit ou désassigne le receiver, préserve les autres displays, throw explicite si index hors borne
- 7 tests unitaires verts (4 read + 3 write) couvrant les cas listés dans le `<behavior>` du plan
- Phase 4 (DATA) complète — débloque Phase 5 (DETECT Pi-side) et Phase 7 (CLOUD API/sync-agent)

## Task Commits

| Phase TDD | Commit | Description |
|-----------|--------|-------------|
| RED       | `b54931f` | `test(04-data-02): add failing tests for getReceiverForDisplay + setReceiver` |
| GREEN     | `c9fe025` | `feat(04-data-02): add getReceiverForDisplay + setReceiver to siteRepository` |
| REFACTOR  | — (skipped, code already minimal) |

## Files Modified

- `central-server/src/repositories/site.repository.ts` — +2 méthodes (`getReceiverForDisplay`, `setReceiver`) + import `DisplayReceiver` ; section `// N-Display management` renommée `(Phase 5H + v4.0 receivers)`
- `central-server/src/repositories/site.repository.test.ts` — +1 `describe('receiver methods (v4.0 DATA-03)')` avec 7 cas

## API Surface

```typescript
// central-server/src/repositories/site.repository.ts (lignes 823-860)

async getReceiverForDisplay(
  siteId: string,
  displayIndex: number
): Promise<DisplayReceiver | null>;

async setReceiver(
  siteId: string,
  displayIndex: number,
  receiver: DisplayReceiver | null
): Promise<void>; // throws Error si displayIndex inconnu
```

## Test Coverage (7 cases, 7 GREEN)

| # | Suite | Case | Result |
|---|-------|------|--------|
| 1 | getReceiverForDisplay | retourne le receiver existant | ✅ |
| 2 | getReceiverForDisplay | retourne null si display sans receiver | ✅ |
| 3 | getReceiverForDisplay | retourne null si index hors borne | ✅ |
| 4 | getReceiverForDisplay | retourne null si site inexistant | ✅ |
| 5 | setReceiver | écrit un firestick sans toucher les autres displays | ✅ |
| 6 | setReceiver | désassigne avec null | ✅ |
| 7 | setReceiver | throw si index hors borne (pas de display fantôme) | ✅ |

Suite complète `site.repository.test.ts` : **24/24 GREEN** (17 pré-existants + 7 nouveaux).

## Decisions Made

- **Throw plutôt que silently append** sur index inconnu : la création d'un display reste de la responsabilité de `updateDisplays`. Sans cette garde, `setReceiver(99, ...)` créerait des displays fantômes invisibles dans le dashboard.
- **Composition over raw SQL** : pas de `jsonb_set('{n,receiver}', ...)` — on relit, on `.map`, on réécrit. Coût d'un round-trip supplémentaire compensé par le respect strict du repository pattern (ESLint guard `no query() outside repository` satisfait).
- **Section header renommée** : `// N-Display management (Phase 5H)` → `(Phase 5H + v4.0 receivers)` pour traçabilité historique.

## Repository Pattern Compliance

Vérification `git diff afe1823..HEAD -- central-server/src/repositories/site.repository.ts | grep "^+" | grep "query("` :

```
+   * Compose getDisplays() — pas de query() direct (repository pattern).
+   * Compose getDisplays() + updateDisplays() — pas de query() direct.
```

**Zéro nouveau `query(`** dans la diff (uniquement deux références JSDoc en commentaire). Conforme à CLAUDE.md (Repository pattern obligatoire) et ESLint guard.

## Deviations from Plan

None — plan executed exactly as written. TDD RED → GREEN, pas de REFACTOR nécessaire (le code est déjà minimal et explicite).

## Verification

- `npx jest --testPathPattern='repositories/site.repository.test' --no-coverage --forceExit` → **24/24 GREEN** (1 suite, 7 nouveaux cas DATA-03 + 17 cas pré-existants)
- `tsc --noEmit` (scope `site.repository.ts`) → **0 erreur** (les erreurs pré-existantes hors-scope `excel-export.service.ts`, `remotion-render-worker.service.ts` documentées dans Plan 01 SUMMARY restent inchangées)
- `grep -E "getReceiverForDisplay|setReceiver" site.repository.ts` → **3 occurrences** (déclarations + message d'erreur)
- `git diff` confirme zéro nouveau `query(` ajouté dans les méthodes — composition pure
- Smart smoke (`npm run test:smoke:smart`) : limitation sandbox (jest non bootable hors `node_modules/.bin`, pas de DB) — même état documenté dans Plan 01 SUMMARY, hors-scope (DEFERRED).

## Deferred Issues

- Smoke test bootstrap requires DB connection not available in sandbox env (pré-existant, non causé par ce plan ; identique au Plan 01). Vérification CI/local recommandée avant merge.

## Requirements Satisfied

- **DATA-03**: Le code applicatif peut lire et écrire le récepteur d'un display via le repository sans toucher au JSONB brut. Couverture tests : nominal, null/désassignation, out-of-bounds, site inexistant.

## Next Phase Readiness

- **Phase 5 (DETECT)** : peut consommer `setReceiver` côté Pi-side pour pousser les receivers détectés (via socket relay → handler cloud → repo).
- **Phase 7 (CLOUD)** : route `/api/sites/:id/connected-receivers` peut s'appuyer sur `getReceiverForDisplay` (lecture par display) ou parcours complet via `getDisplays`.
- **Phase 8 (DASHBOARD)** : contrôleur `/api/sites/:id/displays/:index/receiver` (PUT/DELETE) peut déléguer entièrement à `setReceiver` sans logique JSONB côté controller.

## Self-Check: PASSED

- File `.planning/phases/04-data/04-data-02-SUMMARY.md`: FOUND (this file)
- File `central-server/src/repositories/site.repository.ts` contains `async getReceiverForDisplay`: FOUND (line 828)
- File `central-server/src/repositories/site.repository.ts` contains `async setReceiver`: FOUND (line 844)
- File `central-server/src/repositories/site.repository.ts` imports `DisplayReceiver`: FOUND (line 4)
- File `central-server/src/repositories/site.repository.test.ts` contains `describe('receiver methods`: FOUND
- Commit `b54931f` (RED): FOUND
- Commit `c9fe025` (GREEN): FOUND
- Tests `site.repository.test.ts`: 24/24 GREEN

---

_Phase: 04-data_
_Plan: 02_
_Completed: 2026-05-06_
