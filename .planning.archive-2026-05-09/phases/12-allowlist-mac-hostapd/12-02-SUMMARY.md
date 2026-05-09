---
phase: 12-allowlist-mac-hostapd
plan: '02'
subsystem: central-dashboard
tags:
  - angular
  - displays-editor
  - firestick
  - ux
  - badge
  - phase12
dependency_graph:
  requires:
    - 12-01-server-unknown-firestick-metric (ReceiverInfo.displayIndex populated by API)
  provides:
    - Badge ambre Non assigné dans le dropdown receiver du displays-editor
  affects:
    - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/
    - central-dashboard/src/app/core/models/index.ts
tech_stack:
  added:
    - ReceiverInfo.displayIndex field (optional, nullable)
  patterns:
    - Helper TS isUnknownFirestick() pour guard de template Angular
    - CSS class inline dans @Component decorator
    - data-testid pour test isolation
key_files:
  created: []
  modified:
    - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
    - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
    - central-dashboard/src/app/core/models/index.ts
decisions:
  - "Tests utilisent .click() DOM au lieu de component.openReceiverDropdown() direct — l'appel direct passe null comme event.currentTarget → getBoundingClientRect() TypeError"
  - 'ReceiverInfo.displayIndex ajouté au modèle comme champ optionnel nullable (backward-compat avec tous les sites existants)'
  - 'Badge inséré AVANT receiver-mac dans le dropdown uniquement — pas dans la display row principale (qui garde le badge vert/rouge existant)'
metrics:
  duration: '~25 minutes'
  completed_date: '2026-05-08'
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 12 Plan 02: Dashboard Unknown Firestick Badge Summary

**One-liner:** Badge ambre "Non assigné" dans le dropdown receiver du displays-editor pour Fire Sticks détectés sur le hotspot mais pas encore assignés à un display.

## What Was Built

L'admin ouvre le dropdown receiver d'un display non assigné et voit immédiatement si des Fire Sticks sont en attente d'assignation sur le hotspot Pi, signalés par un badge ambre distinct du vert (assigné) et du rouge (stale).

### Composants livrés

1. **`isUnknownFirestick(r: ReceiverInfo): boolean`** — Helper TS public dans `DisplaysEditorComponent`. Retourne `true` SSI `r.kind === 'firestick' && r.displayIndex === null`. Les `kind='browser'` (téléphones bénévoles) retournent toujours `false`.

2. **Template binding** — Span inséré avant `<span class="receiver-mac">` dans le `*ngFor` du dropdown receiver, gardé par `*ngIf="isUnknownFirestick(r)"` avec `data-testid="receiver-badge-unknown"`.

3. **CSS `.receiver-badge--unknown`** — Ambre #fef3c7/#92400e (Tailwind amber-100/800), bordure #fbbf24, distincte du vert (#dcfce7) et du stale gris.

4. **`ReceiverInfo.displayIndex?: number | null`** — Champ ajouté au modèle `core/models/index.ts` (optionnel, backward-compat).

5. **4 tests Karma verts** — describe `Phase 12 OBSERVE — badge ambre Non assigné` : isUnknownFirestick helper + présence/absence badge selon kind et displayIndex.

### Résultats de vérification

- `grep "isUnknownFirestick"` → 2 matches (definition + template `*ngIf`) ✅
- `grep "receiver-badge--unknown"` → 2 matches (template class + styles) ✅
- `grep "Non assigné"` → 1 match ✅
- `grep 'data-testid="receiver-badge-unknown"'` → 1 match ✅
- `grep "background: #fef3c7"` → 1 match ✅
- 17/17 tests Karma verts (13 existants Phase 8+11 intacts + 4 nouveaux Phase 12) ✅
- Smoke tests : tous passés ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing field] ReceiverInfo.displayIndex absent du modèle**

- **Found during:** Task 1 — TypeScript compilation
- **Issue:** `ReceiverInfo` dans `core/models/index.ts` n'avait pas de champ `displayIndex`. Le helper `isUnknownFirestick(r: ReceiverInfo)` ne pouvait pas accéder à `r.displayIndex` sans erreur TS.
- **Fix:** Ajout de `displayIndex?: number | null` à l'interface `ReceiverInfo` avec `lastSeenAt: string | number` (élargi pour accepter epoch ms des tests).
- **Files modified:** `central-dashboard/src/app/core/models/index.ts`
- **Commit:** 86e4d1a1

**2. [Rule 1 - Bug] Tests utilisaient component.openReceiverDropdown() direct**

- **Found during:** Task 2 — RED phase (3 FAILED)
- **Issue:** Appel direct `component.openReceiverDropdown(new MouseEvent('click'), 1)` passe `event.currentTarget = null` → `getBoundingClientRect()` TypeError. Les tests du plan utilisaient cette pattern non testable.
- **Fix:** Remplacement par `.querySelector('.receiver-badge--unassigned').click()` pour simuler l'interaction DOM réelle.
- **Files modified:** `displays-editor.component.spec.ts`
- **Commit:** 86e4d1a1

## Self-Check: PASSED

- FOUND: central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
- FOUND: central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
- FOUND: central-dashboard/src/app/core/models/index.ts
- FOUND: commit 86e4d1a1
