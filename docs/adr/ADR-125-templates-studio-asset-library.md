# ADR-125 : Templates Studio — Asset library globale + bindings par template

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Les compositions Remotion du Templates Studio (3 templates : `but_generique`,
`entree_joueur`, `faits_de_jeu`) ont besoin d'assets statiques (textures
métalliques, lensflare WebM, watermarks, fonts custom) pour rendre leur
design final. La 1re itération hardcodait ces fichiers via `staticFile()` ou
un helper `asset()` qui résolvait les paths localement — mais les vrais
assets ne sont pas commités dans le repo (poids, droits) et vivent sur FTP
Hostinger. Résultat : les renders en prod tombaient en 404.

Il fallait un mécanisme pour qu'un designer (Daisy) puisse uploader un asset
une fois sur le FTP, le réutiliser sur N templates, et que la chaîne de
render résolve l'URL automatiquement — sans toucher au code Remotion.

## Décision

On crée une **library globale** d'assets uploadés sur FTP (table
`studio_assets`) + une table de **bindings** par template
(`studio_template_asset_bindings`, PK composite `(template_slug, asset_key)`).

- Un `manifest.json` peut déclarer un tableau `requiredAssets[]` avec
  `{ key, filename, mime }` — chaque entrée est un slot que la composition
  attend dans `props.__assets[key]`.
- Le worker `studio-render-worker.service.ts` lit les bindings DB juste
  avant `selectComposition()` / `renderMedia()` et injecte un Record
  `__assets: Record<string, string>` dans les inputProps.
- Si un slot requis n'a pas de binding actif, le render fail proprement
  avec un message FR pointant vers le panel admin
  (`Asset manquant: 'metalTexture' (metal_texture.png) — bind dans
  /templates-studio/admin/assets/faits_de_jeu`).
- L'upload côté API est **dédupliqué par checksum SHA256** : un re-upload du
  même contenu retourne la row existante sans créer de doublon FTP.
- Les routes API + UI sont restreintes aux rôles internes (super_admin /
  admin / operator). Les users `club` ne voient ni n'éditent la library —
  c'est un catalogue admin technique partagé sur la flotte.

Les 2 nouvelles pages Angular vivent sous `/templates-studio/admin/assets/` :
- `library` (grid + upload + filters par tag/mime/search)
- `:slug` (vue par template, modal "Choisir / Uploader" qui auto-bind)

## Alternatives rejetées

- **Commiter les assets dans le repo** : poids (~50-100 Mo de WebM
  lensflare), droits sur certaines textures, et chaque designer doit
  passer par un PR pour ajouter un asset → friction maximale.
- **`lftp mirror` au boot du container** : race condition (le worker peut
  démarrer avant la fin du sync), pas de UI pour ajouter / remplacer un
  asset, et zéro observabilité (un asset manquant = 404 silencieux).
- **Un asset par template (clone par slug)** : duplication FTP coûteuse
  et l'admin ne peut pas réutiliser un asset cross-templates (ex: même
  watermark sur les 3 templates).
- **Pool sans bindings (juste tag → résolution par convention)** : fragile
  (renommer un fichier casse le render), pas de typage des slots, pas
  de visibilité admin.

## Conséquences

- **Autonomie designer** : Daisy upload un fichier via le panel admin
  Angular, le bind sur 1 ou N templates, le render utilise immédiatement
  l'URL FTP — zéro intervention dev.
- **Dédup automatique** : 0 doublon FTP même si plusieurs admins
  uploadent le même fichier. Un re-upload → la row existante est réutilisée
  (`deduplicated: true` dans la réponse).
- **Fail explicite** : un slot non-bindé → message d'erreur clair pointant
  vers le panel admin (vs 404 cryptique côté navigateur Chromium).
- **Anti-drift** : les bindings vérifient que `asset_key` est déclaré dans
  `manifest.requiredAssets` (impossible de binder une clé que le worker
  n'utilisera jamais).
- **Coût** : 2 tables PG + 1 query par render (négligeable, max 10
  slots/template). 1 worker DB query par binding.
- **Évolutivité** : la table `studio_assets` peut accueillir d'autres
  consumers (Phase 1.6 fonts custom, futurs templates), elle n'est pas
  couplée à un type de template.

## Fichiers impactés

- `central-server/src/scripts/migrations/add-studio-assets.sql` — nouvelle
  migration (2 tables, 4 index).
- `central-server/src/scripts/full-schema.sql` — mirror.
- `central-server/src/repositories/templates-studio.repository.ts` —
  `studioAssetRepository` + `templateAssetBindingRepository`.
- `central-server/src/repositories/index.ts` — barrel export.
- `central-server/src/middleware/validation.ts` — schemas Joi
  (`uploadAsset`, `listAssetsQuery`, `updateAssetMetadata`, `bindAsset`)
  + paramSchemas (`assetId`, `templateSlug`, `templateSlugAndAssetKey`).
- `central-server/src/controllers/templates-studio.controller.ts` —
  8 nouveaux handlers (list/get/upload/patch/delete asset + get/upsert/delete
  binding).
- `central-server/src/routes/templates-studio.routes.ts` — 8 nouvelles
  routes derrière `requireRole('super_admin', 'admin', 'operator')`.
- `central-server/src/services/studio-render-worker.service.ts` —
  `resolveTemplateAssets()` + injection `__assets` dans inputProps.
- `central-server/templates-studio/templates/faits_de_jeu/manifest.json` —
  `requiredAssets[]` (3 slots : metalTexture, lensFlare, watermarkNeopro).
- `central-server/templates-studio/templates/faits_de_jeu/Composition.tsx` —
  consume `__assets` via props Zod, retire `staticFile()` + helper `asset()`.
- `central-server/templates-studio/templates/faits_de_jeu/asset.ts` —
  fichier supprimé.
- `central-server/templates-studio/templates/{but_generique,entree_joueur}/manifest.json` —
  `requiredAssets: []` explicite.
- `central-dashboard/src/app/features/templates-studio/admin/asset-library/` —
  nouvelle page (component + html + scss).
- `central-dashboard/src/app/features/templates-studio/admin/template-bindings/` —
  nouvelle page (component + html + scss).
- `central-dashboard/src/app/features/templates-studio/templates-studio.types.ts` —
  6 nouveaux types.
- `central-dashboard/src/app/features/templates-studio/templates-studio.service.ts` —
  8 nouvelles méthodes.
- `central-dashboard/src/app/app.routes.ts` — 3 nouvelles routes.
- `central-server/src/__tests__/smoke/smoke-templates-studio-assets.test.ts` —
  smoke file-based dédié.
