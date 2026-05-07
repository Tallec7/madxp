---
phase: quick-260507-obe
plan: 01
subsystem: remotion-templates
tags: [audit-p1-10, dashboard, central-server, smoke]
requires: ["templateStudioRepository.getTemplateUsedByCount (PR #882)", "design tokens --studio-accent-* (PR #884)"]
provides:
  - "GET /api/remotion-templates renvoie usedByCount par row"
  - "Repository findAllWithUsage / findVisibleForSiteWithUsage (1 query JOIN)"
  - "Badge UI data-testid=template-used-by-count-{id} sur template-card"
  - "Smoke garde-fou smoke-template-used-by-count (6 assertions)"
affects:
  - central-server/src/repositories/remotion-templates.repository.ts
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
tech-stack:
  added: []
  patterns: [repository-pattern, file-based-smoke, design-tokens-css-vars]
key-files:
  created:
    - central-server/src/__tests__/smoke/smoke-template-used-by-count.test.ts
  modified:
    - central-server/src/repositories/remotion-templates.repository.ts
    - central-server/src/controllers/remotion-templates.controller.ts
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
decisions:
  - "DRY avec getTemplateUsedByCount(id) : mêmes 2 sources (template_packshot_refs + render_jobs status IN ('pending','running')) pour éviter dérive entre 409 delete-guard et badge UI"
  - "1 seule query agrégée (LEFT JOIN sur sous-requête UNION ALL + GROUP BY) plutôt que N+1 — vérifié par smoke"
  - "RemotionTemplate.usedByCount typé optional (?: number) pour rétro-compat des callers qui construisent un RemotionTemplate en local (delete modal state notamment)"
  - "Badge libellé FR : 'Inutilisé' (gris/--text-muted) vs 'Utilisé par N référence(s)' (--studio-accent-*) ; tooltip natif explique la composition"
  - "Hors scope explicite : drill-down sponsors clickable, filtre 'templates inutilisés', enrichissement de getTemplate (singleton) — laissés pour quick task ultérieure"
metrics:
  duration: ~25min
  tasks_completed: 4
  files_touched: 5 (4 modifiés + 1 créé)
  completed_date: 2026-05-07
---

# Quick Task 260507-obe : Templates usedByCount expose (API + UI) Summary

Boucle l'item P1 #10 de l'audit `docs/audits/templates-remotion-audit-2026-05-07.md` :
le compteur `usedByCount` (déjà câblé côté DB via `templateStudioRepository.getTemplateUsedByCount`
pour le 409 delete-guard PR #882) est maintenant exposé en bulk dans la liste
templates et affiché en badge sur chaque card du dashboard.

## What was built

### Backend (central-server)

- `remotionTemplatesRepository.findAllWithUsage(publishedOnly)` — list templates +
  `used_by_count` en une seule query JOIN agrégée (LEFT JOIN sur sous-requête
  UNION ALL + GROUP BY). **Pas de N+1.**
- `remotionTemplatesRepository.findVisibleForSiteWithUsage(siteId, publishedOnly)` —
  variante site-scoped (globaux + scopés au site).
- `listTemplates` controller délègue aux nouvelles méthodes et mappe
  `used_by_count` (snake_case DB) → `usedByCount` (camelCase API).
- Méthodes legacy `findAll` / `findVisibleForSite` **conservées intactes** pour
  ne casser aucun consommateur (versions, render, etc.).

### Frontend (central-dashboard)

- `RemotionTemplate.usedByCount?: number` typé sur le type partagé.
- Badge `data-testid="template-used-by-count-{id}"` ajouté dans `.tpl-badges` du
  composant `template-card`, avec libellé FR :
  - **0 référence** → "Inutilisé" (gris, `var(--text-muted)`)
  - **N>0 références** → "Utilisé par N référence(s)" (accent
    `var(--studio-accent-100)` + `var(--studio-accent-700)`, post PR #884)
- Tooltip natif `title=""` explique la composition (packshots + rendus en cours).
- **Aucun hex hardcodé** ajouté — design tokens uniquement.

### Tests

- Smoke `smoke-template-used-by-count.test.ts` (file-based, 6 assertions, 3.7s) :
  - repository expose les 2 méthodes \*WithUsage
  - 1 seule query agrégée (LEFT JOIN, pas de `.map(... await query ...)`)
  - 2 sources comptées (template_packshot_refs + remotion_render_jobs)
  - controller listTemplates expose usedByCount en camelCase
  - template-card affiche le badge testid + libellé FR
  - aucun hex hardcodé dans le voisinage du badge

## Verification

| Check                                                                          | Result                                  |
| ------------------------------------------------------------------------------ | --------------------------------------- |
| `cd central-server && npx tsc --noEmit`                                        | ✅ vert                                 |
| `npx jest --testPathPattern='smoke-template-used-by-count' --forceExit`        | ✅ 6/6 verts (3.7s)                     |
| Upstream smoke (`smoke-template-delete\|smoke-template-versioning-ui\|smoke-templates-design-tokens\|smoke-remotion`) | ✅ 207/207 verts |
| `npx eslint` sur les 3 fichiers source                                         | ✅ 0 errors                             |

## Commits

| #   | Hash      | Message                                                                       |
| --- | --------- | ----------------------------------------------------------------------------- |
| 1   | `6717c4e7` | `feat(remotion-templates): expose usedByCount in repository (1 query JOIN)` |
| 2   | `788c6143` | `feat(remotion-templates): include usedByCount in GET /api/remotion-templates payload` |
| 3   | `cd62757c` | `feat(dashboard): show usedByCount badge on template-card (audit P1 #10)` |
| 4   | `f16c55d9` | `test(remotion-templates): smoke guard for usedByCount end-to-end exposure` |

## Deviations from Plan

None — plan exécuté tel qu'écrit. Une micro-décision sur le typage : le plan
suggérait de laisser `usedByCount: number` (non-optional) ; vérification du
codebase a montré que `remotion-templates.component.ts` construit déjà des
`RemotionTemplate` en local pour la modale delete (`usedByCount: 0`). Pour
éviter de devoir patcher 4 sites de construction inline, le champ est typé
**optional `?: number`** avec fallback `?? 0` côté UI. Conséquence fonctionnelle
nulle : le payload API renvoie toujours un `number`.

## Out of Scope (laissé pour plus tard)

- Drill-down clickable "voir les sponsors / les jobs en cours qui pointent ce template"
- Filtre rapide "templates inutilisés" dans la grille
- Enrichissement de `getTemplate` (singleton) — peut être une P2

## Self-Check: PASSED

Files verified:
- ✅ `central-server/src/repositories/remotion-templates.repository.ts` (modified, contains `findAllWithUsage` + `findVisibleForSiteWithUsage` + `LEFT JOIN`)
- ✅ `central-server/src/controllers/remotion-templates.controller.ts` (modified, contains `usedByCount` + `findAllWithUsage`)
- ✅ `central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts` (modified, contains `template-used-by-count-`)
- ✅ `central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts` (modified, `usedByCount?` on RemotionTemplate)
- ✅ `central-server/src/__tests__/smoke/smoke-template-used-by-count.test.ts` (created, 6 assertions verts)

Commits verified:
- ✅ `6717c4e7` (Task 1)
- ✅ `788c6143` (Task 2)
- ✅ `cd62757c` (Task 3)
- ✅ `f16c55d9` (Task 4)
