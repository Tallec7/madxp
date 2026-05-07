---
phase: 260507-ong-templates-spec-export
plan: 01
subsystem: templates / backend
tags: [templates, spec-export, audit-p1-5, audit-coh-2, adr-086]
requires: [templateStudioRepository.findV2ById, templateStudioRepository.listLayers, listTextFields, listImageSlots, listVariants]
provides: [GET /api/remotion-templates/:id/spec, templateSpecBuilderService.buildSpecMarkdown]
affects: [remotion-templates.routes.ts, remotion-templates.controller.ts]
tech-added: [yaml stringify usage in services]
patterns: [repository-pattern-strict, controller-thin-delegation, file-based-smoke]
key-files-created:
  - central-server/src/services/template-spec-builder.service.ts
  - central-server/src/services/template-spec-builder.service.test.ts
  - central-server/src/services/template-spec-builder.roundtrip.test.ts
  - central-server/src/__tests__/smoke/smoke-template-spec-export.test.ts
key-files-modified:
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
decisions:
  - extractFrontmatter inlined in roundtrip test (ne pas importer import-template-spec.ts qui exécute main() à l'import)
  - Layer keys dérivées par z_index ASC en spreadsheet-style (A..Z, AA..ZZ) — déterministe et indépendant des ids DB
  - findV2ById null = 404 (couvre missing + legacy schema_version=1) — ré-export des templates legacy non supporté en v1
  - alpha: true forcé sur tous les layers exportés (champs DB non porté ; runtime traite v2 comme alpha-capable)
  - Joi UUID schema réutilisé (remotionTemplateIdParam déjà existant pour DELETE)
metrics:
  duration: ~25min
  completed: 2026-05-07
  tasks: 4
  commits: 4
  tests-added: 18 (8 unit + 2 roundtrip + 8 smoke)
---

# Quick Task 260507-ong : Templates GET /:id/spec endpoint Summary

Endpoint backend `GET /api/remotion-templates/:id/spec` qui rebuild un SPEC.md markdown depuis l'état DB courant d'un template (round-trip safe avec `npm run template:import`).

## Endpoint

```
GET /api/remotion-templates/:id/spec
Auth     : authenticate + requireRole('super_admin')
Validate : validateParams(remotionTemplateIdParam)  # Joi UUID
Rate     : adminRateLimit
Response : 200 text/markdown; charset=utf-8
           Content-Disposition: attachment; filename="<slug>-spec.md"
Errors   : 400 (UUID invalide), 401, 403, 404 (template introuvable / legacy v1), 500
```

## Round-trip prouvé

Test `template-spec-builder.roundtrip.test.ts` :

1. DB fixture (3 layers z_index 1/2/3, 2 text + 1 image slots, 1 variant)
2. → `templateSpecBuilderService.buildSpecMarkdown('t1')`
3. → `extractFrontmatter` (regex `^---\n([\s\S]*?)\n---`)
4. → `parseYaml` du frontmatter
5. Assertions :
   - `parsed.template.slug === 'joueur-test'`
   - `parsed.template.canvas.width === 1920`
   - `parsed.layers.length === 3` avec keys A/B/C dans l'ordre z_index ASC
   - `parsed.layers[0].duration_ms === 1200` (héritage durée)
   - `parsed.slots.length === 3` (2 text + 1 image)
   - `slot.position.x === 50` ← DB `position.x = 0.5` (×100)
   - `parsed.variants[0].is_default === true`
6. Shape checks alignés avec `validate()` du parser CLI (`import-template-spec.ts`)

## Mappings DB → SPEC

| DB                                      | SPEC                                  |
| --------------------------------------- | ------------------------------------- |
| `position: { x, y }` (0..1)             | `position: { x, y }` (0..100)         |
| `position: { x, y, width, height }`     | idem (×100 chacun)                    |
| `appearDuration` (secondes)             | `animation.duration_ms` (×1000)       |
| `compositionId`                         | `template.slug` + filename            |
| `layer.id` (UUID)                       | spreadsheet key A/B/C/.../Z/AA/AB/... |
| `safeTopPct/safeLeftPct/...`            | bloc `safe_zone:`                     |
| `animation: 'none'`                     | bloc animation OMIS (économie YAML)   |
| `overflow: 'hidden'`                    | omis (default)                        |
| `respectAlpha`                          | `respect_alpha`                       |
| `fontFamily`                            | `font`                                |
| `fontSize`                              | `font_size`                           |
| `align`                                 | `text_align`                          |
| `required`                              | `user_editable`                       |

## Fichiers touchés

| Fichier | LoC ajoutées |
|---------|--------------|
| `services/template-spec-builder.service.ts` | +228 (créé) |
| `services/template-spec-builder.service.test.ts` | +200 (créé) |
| `services/template-spec-builder.roundtrip.test.ts` | +250 (créé) |
| `__tests__/smoke/smoke-template-spec-export.test.ts` | +69 (créé) |
| `controllers/remotion-templates.controller.ts` | +47 (handler `exportTemplateSpec` + import) |
| `routes/remotion-templates.routes.ts` | +10 (route GET /:id/spec) |

## Tests

- 8 unit tests (`.service.test.ts`) ✅ — fixture-based, mocks repo
- 2 roundtrip tests (`.roundtrip.test.ts`) ✅ — DB fixture → markdown → parse YAML → assert structure
- 8 file-based smoke (`smoke-template-spec-export.test.ts`) ✅ — wiring guards (route, controller, service)
- 344 tests des suites smoke connexes (smoke-remotion, smoke-server-core, smoke-wiring, smoke-consistency, smoke-service-test-coverage) ✅ — pas de régression
- ESLint clean sur les 6 fichiers touchés ✅
- `npx tsc --noEmit` clean ✅

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | d85340fc | `feat(templates)` | add SPEC builder service (audit P1 #5) |
| 2 | 3ce6e022 | `feat(templates)` | expose GET /api/remotion-templates/:id/spec |
| 3 | 58f1c5a4 | `test(templates)` | SPEC export round-trip (DB → SPEC.md → parse) |
| 4 | 6147350b | `test(templates)` | smoke SPEC export endpoint + drop unused import |

## Open follow-ups

- **UI bouton "Exporter SPEC"** dans le dashboard admin Template Studio (Phase ADR-110 v3.x — hors scope cette task, backend pur uniquement).
- **Auto round-trip diff zéro** : un test E2E qui prend un SPEC.md fixture, l'importe via `template:import`, exporte via le nouvel endpoint, puis diffe les frontmatters → permettrait de détecter toute dérive de mapping. À planifier en suite.
- **Schema legacy v1 export** : aujourd'hui `findV2ById` retourne null sur schema_version=1 → 404. Ajouter un fallback "best-effort" depuis `props_schema/default_props` si demande métier (peu probable, les templates legacy seront retirés ADR-110).
- **`alpha: true` hardcodé** : tant que la DB n'expose pas le pix_fmt par layer, on assume `alpha: true`. À surveiller si une feature reposant sur l'export honorant strictement le canal alpha apparaît.
- **Variant slugify naïf** : la fonction supprime les accents Latin-1 et collapse le whitespace. Si un nom de variant contient des caractères non-ASCII non-Latin-1 (ex : émoji), le slug retombe sur `'default'`. Suffisant pour le périmètre actuel.

## Story Card

```markdown
## Story 2026-05-07-templates-spec-export

**En tant que** : super_admin
**Je veux** : exporter un SPEC.md depuis l'état DB courant d'un template Studio v2
**Pour** : re-snapshotter les templates modifiés via UI sans perdre la valeur de source de vérité des SPECs `docs/templates/*.spec.md`

**Livré** :
- GET /api/remotion-templates/:id/spec qui retourne un fichier markdown attachment
- Service builder repository-pure avec mappings DB ↔ SPEC explicites (fractions↔%, secondes↔ms, ids↔keys A/B/C)
- Round-trip prouvé : output ré-importable par `npm run template:import` (validate() shape check passé)

**Vérifié par** :
- 18 tests verts (8 unit + 2 roundtrip + 8 smoke)
- 344 smoke tests connexes verts (zéro régression)
- ESLint + tsc clean

**Risque résiduel** :
- Templates legacy schema_version=1 retournent 404 (intentionnel, périmètre v1)
- `alpha: true` forcé même sur layers sans canal alpha en DB (impact runtime nul, mais SPEC ré-importé pourrait laisser passer un layer non-alpha)

**Next** : UI bouton "Exporter SPEC" côté dashboard admin (Phase ADR-110 v3.x)
```

## Self-Check: PASSED

- All 5 created/modified files exist on disk
- All 4 commit hashes (d85340fc, 3ce6e022, 58f1c5a4, 6147350b) present in `git log --all`
- All 18 tests green ; 344 connected smoke tests green ; ESLint + tsc clean
