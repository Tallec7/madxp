---
phase: quick-260507-les
plan: 01
subsystem: dashboard / templates / observability
tags: [adr-055, audit-p0-4, rollback, dashboard, smoke]
requirements: [AUDIT-P0-4]
tech_stack:
  added:
    - Prometheus Counter `neopro_template_rollback_total{success}`
    - Angular standalone component `TemplateVersionsDrawerComponent`
    - Grafana panel "Templates rollback" on NeoPro Blind Spots
  patterns:
    - typed-name confirm modal (PR #882 — DELETE template)
    - data-service alias wrappers (`getVersions` / `setDefaultVersion`)
    - file-based smoke guard (deleg. from PR #882 smoke-template-delete pattern)
key_files:
  created:
    - .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md
    - central-dashboard/src/app/features/content/remotion-templates/template-versions-drawer.component.ts
    - central-server/src/__tests__/smoke/smoke-template-versioning-ui.test.ts
  modified:
    - central-server/src/services/metrics.service.ts
    - central-server/src/controllers/remotion-templates.controller.ts
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/template-grid.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
    - docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json
decisions:
  - Skip backend route gap-fill (no PATCH /default-version) — reuse ADR-055 endpoint
  - Drawer is a NEW component (template-versions-drawer) coexisting with existing dropdown (template-versions)
  - Output renamed `closed` to avoid Angular DOM `close` collision
metrics:
  tasks_completed: 5
  commits: 5
  smoke_tests_added: 8
  smoke_total_pass: 2123
---

# Quick task 260507-les: Template versioning UI — Drawer historique + rollback

Audit P0 #4 (`templates-remotion-audit-2026-05-07`) — un super_admin
peut maintenant rollback un template depuis le dashboard sans accès SQL,
via un drawer ouvert depuis n'importe quelle card avec confirmation
typed-name (cohérent avec la modale "Supprimer" PR #882).

## What was built

- **Affordance card** : badge `📜 versions` + bouton `📜 Historique`
  visible aux admins sur les templates publiés.
- **Drawer right-side** : liste DESC des snapshots ADR-055 avec leur
  `created_at` + `snapshot_reason` traduit (initial / pre-update /
  backfill). La 1ʳᵉ ligne est marquée "version actuelle" et n'a pas
  de bouton Restaurer.
- **Confirm modal typed-name** : pour rollback un snapshot, le
  super_admin doit taper `restaurer` (pattern aligné sur la modale
  Supprimer PR #882, plus simple que retaper le nom du template car
  un snapshot n'a pas de nom métier propre).
- **Métrique Prometheus** `neopro_template_rollback_total{success}`
  wirée sur les 4 chemins du contrôleur (success commit, 404 template,
  404 version, catch).
- **Panel Grafana** sur NeoPro Blind Spots → spike `success=false`
  signale un drawer cassé ou un desync UI vs snapshots DB.
- **Smoke test** (8 assertions) : routes ADR-055, métriques, service,
  card, drawer, parent wiring, grid relay, non-régression PR #882.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aria-label backslash-escape inutilisable**

- **Found during:** Task 3 commit (eslint Angular template parser)
- **Issue:** `[attr.aria-label]="'Voir l\\'historique...'"` ne parse pas
- **Fix:** Sortie en méthode `historyButtonLabel(name)` qui retourne
  une template string
- **Files:** template-card.component.ts
- **Commit:** f01b7541

**2. [Rule 1 - Bug] Output `close` collide avec DOM event natif**

- **Found during:** Task 4 commit (eslint @angular-eslint/no-output-native)
- **Issue:** `@Output() close = new EventEmitter<void>()` shadow le
  bouton DOM `<button>.close`
- **Fix:** Renommé en `closed` côté drawer + wire-up parent HTML
- **Files:** template-versions-drawer.component.ts, remotion-templates.component.html
- **Commit:** f01b7541

**3. [Rule 2 - Critical] Métrique non graphée**

- **Found during:** post-Task 5 `npm run test:smoke` final
- **Issue:** `smoke-metrics-observability` exige tout `neopro_*` registered
  d'apparaître dans un dashboard Grafana ou une rule Prometheus
- **Fix:** Panel "Templates rollback" ajouté à NeoPro Blind Spots
- **Files:** docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json
- **Commit:** 5af432e9

**4. [Rule 4 - Architectural decision documented in audit, not asked to user]**

Plan théorique référençait ADR-108 (`PATCH /default-version`, semver
`v{N}` badge, `is_default` field). En réalité ADR-108 est en stand-by
côté backend (repo écrit, routes orphelines) et la production utilise
ADR-055 (snapshots `props_schema`/`default_props` via trigger SQL +
`POST /:id/versions/:versionId/restore`). Décision documentée dans
AUDIT-NOTES.md (Task 1) : ne pas wirer un nouvel endpoint redondant,
réutiliser l'existant via des alias sémantiques côté data-service
(`setDefaultVersion` → `restoreVersion`). Le badge `v{N}` est remplacé
par un marqueur `📜 versions` (pas de version semver disponible).

### Auth gates

Aucune.

## Verification

- [x] `npm run test:smoke` → 2123/2123 vert (62 suites, dont
      smoke-template-delete intact + smoke-template-versioning-ui +8)
- [x] `npx jest smoke/smoke-template-versioning-ui` → 8/8 vert
- [x] `npx jest smoke/smoke-metrics-observability` → 1/1 vert
- [x] `npx tsc --noEmit -p tsconfig.app.json` (dashboard) → 0 erreur
- [ ] `ng build` non exécuté (Node 18 vs 20 requis sur l'environnement
      d'exécution — TypeScript pure-check est passé)
- [ ] Validation visuelle super_admin manuelle (pending UAT)

## Self-Check: PASSED

- ✅ AUDIT-NOTES.md exists (37ae3c62)
- ✅ Metric counter + recordTemplateRollback present (bd9b17e5)
- ✅ Drawer component file exists with required testids (f01b7541)
- ✅ Smoke test file exists and passes (451cf30a)
- ✅ Grafana panel added (5af432e9)
- ✅ All 5 commits in branch claude/template-versioning-ui

## Commits

| Hash     | Type  | Subject                                               |
| -------- | ----- | ----------------------------------------------------- |
| 37ae3c62 | docs  | audit existing template versioning surface            |
| bd9b17e5 | feat  | wire neopro_template_rollback_total metric on restore |
| f01b7541 | feat  | expose version badge + history drawer trigger on card |
| 451cf30a | test  | smoke test versioning UI wiring (audit P0 #4)         |
| 5af432e9 | chore | add neopro_template_rollback_total panel (Grafana)    |

## Story Card

```markdown
## Story 2026-05-07-template-rollback-ui

**En tant que** : super_admin
**Je veux** : rollback un template depuis la card sans passer par SQL
**Pour** : auditer et reproduire un rollback en 30s, traçable via Prometheus

**Livré** :

- Badge "📜 versions" + bouton "📜 Historique" sur card (admin)
- Drawer historique côté droit avec liste snapshots ADR-055
- Restore avec modale typed-name (pattern PR #882)
- Métrique `neopro_template_rollback_total{success}` + panel Grafana
- Smoke test 8 assertions (file-based, no DB)

**Vérifié par** : `npm run test:smoke` 2123/2123, dont
`smoke-template-versioning-ui` (8 nouveaux tests).
**Risque résiduel** : pas de version semver côté template
(ADR-108 stand-by) — le badge dit "versions" pas "v1.2". UAT
visuel super_admin pending.
**Next** : —
```
