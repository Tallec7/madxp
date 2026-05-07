# 260507-les Audit — Template Versioning Surface

> Audit Task 1 — read-only. Etat existant vs plan théorique (ADR-108) avant gap-fill UI.

## 1. Endpoints API existants

| Route                                                 | Méthode | Controller               | Repository delegate                                                                  | Validation Joi                       | Auth                  |
| ----------------------------------------------------- | ------- | ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------ | --------------------- |
| `/:id/publish`                                        | POST    | `publishTemplate`        | (gate registry, pas un repo de versioning)                                           | `validateParams(...id)`              | `requireSuperAdmin()` |
| `/:id/unpublish`                                      | POST    | `unpublishTemplate`      | —                                                                                    | `validateParams(...id)`              | `requireSuperAdmin()` |
| `/:id/versions`                                       | GET     | `listTemplateVersions`   | `remotionTemplateVersionsRepository.listByTemplate`                                  | `validateParams(...id)`              | admin / super_admin   |
| `/:id/versions/:versionId/restore`                    | POST    | `restoreTemplateVersion` | `remotionTemplateVersionsRepository.findById` + `remotionTemplatesRepository.update` | `validateParams(siteIdAndVersionId)` | admin / super_admin   |
| `/:id/default-version` (ADR-108 hypothétique du plan) | PATCH   | **n'existe pas**         | `templateVersionsRepository.setDefaultVersion` (orphelin)                            | —                                    | —                     |
| `/:id/fork` (ADR-108 hypothétique)                    | POST    | **n'existe pas**         | `templateVersionsRepository.fork` (orphelin)                                         | —                                    | —                     |

## 2. Repository surface

Deux repositories distincts, **pas le même périmètre** :

### `remotionTemplateVersionsRepository` (ADR-055 — branché aux routes)

- ✅ `listByTemplate(templateId)` — ordre DESC `created_at` (utilisé par `GET /:id/versions`)
- ✅ `findById(versionId)` — utilisé par restore
- Les snapshots capturent `props_schema` + `default_props` (pas la composition v2 layers/text_fields/image_slots).
- Snapshots auto via trigger SQL `trg_neopro_templates_snapshot` (ADR-055).

### `templateVersionsRepository` (ADR-108 — **non branché**, orphelin)

- ⚠️ `publish(templateId, publishedBy)` — snapshot de `template_layers/text_fields/image_slots/variants` (composition v2), aucune route ne l'appelle.
- ⚠️ `fork(sourceTemplateId, options)` — clone draft v2, aucune route ne l'appelle.
- ⚠️ `listByTemplate(templateId)` — disponible mais pas exposé UI.
- ⚠️ `setDefaultVersion(templateId, version)` — disponible mais pas exposé UI.

**Verdict** : ADR-108 est en stand-by côté backend (repo écrit mais pas wiré). Le pipeline live utilise ADR-055 pour l'audit/restore et `POST /:id/publish` pour le publish-gate (ADR-110 phase 03 / Plan 05 — pas de snapshot composition).

## 3. Composant `template-versions.component.ts` (état)

- **Selector** : `app-template-versions`
- **API publique** :
  - `@Input() versions: TemplateVersion[]`
  - `@Input() loading: boolean`
  - `@Input() restoringId: string | null`
  - `@Output() toggleOpen`, `@Output() restore`
- **Pattern** : dropdown/popover (pas drawer), ouvert par bouton "🕓 Historique (N)".
- **Données** : utilise `TemplateVersion` ADR-055 (champs `snapshot_reason`, `created_at`, `props_schema`, `default_props`).
- **Localisation rendue** : dans `remotion-templates.component.html` à l'intérieur du `render-panel` (visible uniquement quand un template est sélectionné, gardé par `*ngIf="isAdmin"`).
- **Pas accessible depuis la card** — il faut sélectionner le template, ouvrir le panel, puis cliquer "Historique".

## 4. Gap analysis

### Ce qui existe

- Routes `GET /:id/versions` + `POST /:id/versions/:versionId/restore` (admin / super_admin).
- Service `RemotionTemplatesDataService` expose `listVersions()` et `restoreVersion()`.
- Composant `TemplateVersionsComponent` rendant la liste avec bouton "Restaurer" par snapshot.
- Snapshot trigger DB ADR-055 garantit qu'aucun restore ne perd l'état précédent.

### Ce qui manque pour répondre à AUDIT-P0-4 ("rollback sans SQL direct accessible depuis la card")

1. **Affordance card** : aucun badge "version active" ni bouton "Historique" sur `template-card.component.ts`. L'admin doit ouvrir le render-panel pour atteindre le dropdown.
2. **Drawer cards-level** : le panel actuel est un dropdown contextuel au render-panel ; le plan demande un drawer ouvert depuis la card (`template-versions-drawer` testid).
3. **Confirm modal typed-name** : le bouton "Restaurer" est un click direct (pas de confirmation typed-name comme la modale Supprimer PR #882).
4. **Métrique Prometheus** : aucun compteur `neopro_template_rollback_total` exposé. Le restore est tracé dans Winston seulement.
5. **Type `TemplateVersion`** : pas de `version: string` semver (ADR-108) — uniquement `id`, `created_at`, `snapshot_reason`. Pas de notion `is_default` non plus. Pour le badge "v{N}", on n'a aucune valeur stable côté `RemotionTemplate` (`schema_version` = 1|2 ≠ "version applicative").
6. **Smoke test** : aucun garde-fou wiring routes versioning + testids UI.

### Conclusion Task 2 — backend gap-fill ?

**OUI partiel, NON pour les routes :**

- ❌ NE PAS créer `PATCH /:id/default-version` ni `POST /:id/fork` — ADR-108 est en stand-by, on s'aligne sur ADR-055 (`POST /:id/versions/:versionId/restore` est la sémantique réelle du rollback).
- ✅ Ajouter UNIQUEMENT le compteur Prometheus `neopro_template_rollback_total{from_version_id, to_version_id, success}` dans `metrics.service.ts` (pattern `recordTemplateDeleted`) et l'appeler depuis le contrôleur `restoreTemplateVersion` existant.
- ✅ Adapter le smoke test au binding ADR-055 réel (route `/versions/:versionId/restore`, pas `/default-version`).

**Conséquence sur les Tasks 3-5** :

- Task 3 : badge "v{N}" remplacé par badge "📜 N versions" (count des snapshots ADR-055) — pas de notion de version semver côté template.
- Task 4 : drawer accessible depuis la card, réutilise `RemotionTemplatesDataService.listVersions/restoreVersion` (déjà existants), avec confirm modal typed-name pattern PR #882.
- Task 5 : smoke teste les bindings réels (`/:id/versions/:versionId/restore`, `recordTemplateRollback`, testids drawer).
