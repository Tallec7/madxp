# ADR-128: Templates Studio — type d'asset `directory` (séquences PNG frames)

**Date** : 2026-05-15
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Les designs originaux des templates `but_generique` et `entree_joueur` (legacy
V2, spec `studio-render-server/spec/templates/joueur_*_generique.v1.json`)
utilisent des séquences PNG frames comme **masques alpha** appliqués sur les
WebM des layers — ex: `masks/joueur-but-c-clean/frame_001.png` à
`frame_175.png` (175 frames pour 7 secondes à 25 fps).

Le Templates Studio code-driven (Phase 1.5/1.6, ADR-125 + ADR-127) ne sait
gérer que des assets `file` (1 ligne `studio_assets` = 1 fichier FTP).
Pour porter les designs V2 sans perdre la fidélité, il faut un nouveau type
d'asset : un **directory** logique qui pointe sur N PNG frames sur FTP.

## Décision

Étendre `studio_assets` avec une colonne `asset_kind TEXT NOT NULL DEFAULT
'file' CHECK (asset_kind IN ('file', 'directory'))` + 2 colonnes auxiliaires :

- `frame_count INT` : nombre de frames (NULL pour `'file'`).
- `frame_pattern TEXT` : pattern d'interpolation (ex: `'frame_{i:03d}.png'`).

Côté API, un nouvel endpoint `POST /api/templates-studio/assets/directory`
accepte un upload multipart **ZIP**, le décompresse en mémoire (`jszip`),
auto-détecte le pattern de nommage, push chaque PNG sur FTP via une connexion
réutilisée (`uploadFilesToFtpBatch` mutualise `ensureDir`), puis INSERT 1
ligne `studio_assets` avec `asset_kind='directory'` et `ftp_path` pointant
sur le préfixe de dossier (avec trailing `/`).

Le worker render (`studio-render-worker.service.ts`) résout les bindings
DB et injecte dans `props.__assets[key]` :
- une `string` (URL FTP) pour `asset_kind='file'` (legacy ADR-125 préservé) ;
- un objet `{ kind: 'directory', baseUrl, framePattern, frameCount }` pour
  `asset_kind='directory'`.

Les compositions Remotion qui consomment un slot directory savent interpoler
la frame courante via `useCurrentFrame()` + `framePattern.replace(/\{i:0(\d+)d\}/, ...)`,
puis appliquer le PNG comme masque alpha via SVG `<mask>` + `<image>` +
`<foreignObject>` (compatible headless Chrome maximum).

Pour le rendu `kind='still'` qui doit capturer une frame spécifique du reveal
(et pas la frame 0 où le masque est vide), le manifest peut spécifier
`stillFrame: number` ; le worker passe `frame: stillFrame` à `renderStill()`.

## Alternatives rejetées

- **Convertir les PNG frames en WebM avec canal alpha** : ffmpeg lourd
  (encodage VP9 alpha = 30s+ par template), perte de qualité due à la
  compression vidéo, et le designer perd le contrôle frame-by-frame du masque.
  Daisy a explicitement refusé ce compromis.
- **Directory FTP avec wildcard listing à la volée** : nécessiterait un
  `client.list(dirPath)` côté worker à chaque render, fragile (pas de
  transaction d'upload atomique : si une frame manque, le render fail
  silencieusement avec une frame transparente). Le checksum SHA256 du ZIP
  source garantit l'intégrité.
- **Sprite atlas PNG géant (grid de N frames dans 1 image)** : indexation
  complexe côté Remotion (calcul `background-position` par frame), poids
  identique au final (175 PNG concaténés), pas de gain.

## Conséquences

- **Storage FTP +25 MB par template avec masques** (vs 1 WebM ~5 MB) — coût
  acceptable pour la flotte (Hostinger illimité).
- **Bandwidth runtime équivalent** : Remotion charge frame par frame de
  toute façon ; le total téléchargé pendant le render est le même que
  pour un WebM.
- **Précision visuelle préservée** : les designers Daisy gardent leur
  workflow After Effects → export PNG sequence → ZIP → upload library.
- **Backward-compat totale** : `asset_kind` a un défaut `'file'`, les
  bindings/résolveur existants ne voient aucun changement. Le smoke test
  ADR-125 a été adapté pour valider les deux types.

## Fichiers impactés

### DB / repo
- `central-server/src/scripts/migrations/add-studio-assets-directory.sql` — nouvelle migration
- `central-server/src/scripts/full-schema.sql` — mirror des nouvelles colonnes + CHECK
- `central-server/src/repositories/templates-studio.repository.ts` — type `StudioAssetKind`, méthode `createDirectory()`

### API / controller
- `central-server/src/middleware/validation.ts` — schéma Joi `uploadAssetDirectory`
- `central-server/src/controllers/templates-studio.controller.ts` — endpoint `uploadStudioAssetDirectory` + helper `detectFramePattern`
- `central-server/src/routes/templates-studio.routes.ts` — route `POST /assets/directory` + multer 50 MB
- `central-server/src/config/ftp-storage.ts` — helper `uploadFilesToFtpBatch`

### Worker
- `central-server/src/services/studio-render-worker.service.ts` — type `DirectoryAssetRef`, branche `asset_kind === 'directory'` dans `resolveTemplateAssets`, support `manifest.stillFrame`

### Templates
- `central-server/templates-studio/templates/but_generique/manifest.json` — port V2 (1920×1080@25fps, 9 requiredAssets)
- `central-server/templates-studio/templates/but_generique/Composition.tsx` — refactor avec MaskedLayer + ClubLabel
- `central-server/templates-studio/templates/entree_joueur/manifest.json` — port V2 + `stillFrame: 174`
- `central-server/templates-studio/templates/entree_joueur/Composition.tsx` — refactor avec packshot masqué
- `central-server/templates-studio/Root.tsx` — bump `<Composition>` BUT/ENTRÉE au format V2

### Frontend
- `central-dashboard/src/app/features/templates-studio/templates-studio.types.ts` — type `StudioAssetKind` + champs directory
- `central-dashboard/src/app/features/templates-studio/templates-studio.service.ts` — `uploadStudioAssetDirectory()`
- `central-dashboard/src/app/features/templates-studio/admin/asset-library/*` — toggle file/directory mode + preview frames

### Smoke
- `central-server/src/__tests__/smoke/smoke-templates-studio-asset-directory.test.ts` — nouveau (file-based)
- `central-server/src/__tests__/smoke/smoke-templates-studio-assets.test.ts` — adapté (BUT/ENTRÉE manifests étendus)

### Doc
- `docs/templates/STUDIO-PORTING-GUIDE.md` — section "Assets directory (PNG frames)"
- `docs/specs/features/templates-studio.spec.md` — référence ADR-128
