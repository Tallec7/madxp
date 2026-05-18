# ADR-127: Templates Studio — fonts custom dans la library d'assets

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Phase 1.5 ([ADR-125](ADR-125-templates-studio-asset-library.md)) a livré
l'asset library Studio (textures, vidéos overlay, watermarks) avec un panel
admin Angular qui upload sur FTP et binde les assets aux slots déclarés
dans `manifest.requiredAssets[]`. Mais la composition `faits_de_jeu` utilise
`font-family: 'Bulevar, sans-serif'` sans mécanisme pour charger la
`Bulevar.woff2` — résultat : fallback `sans-serif` baked dans la vidéo
finale, design tournoi cassé.

Charger une font custom dans Remotion impose une contrainte spécifique :
`renderMedia()` capture les frames dès que les assets statiques sont prêts,
sans attendre les fonts asynchrones. Sans `delayRender()`, la 1ère frame
utilise systématiquement le fallback CSS, même si la font finit par charger.

## Décision

Étendre l'asset library aux MIME `font/*` et legacy `application/[x-]font-*`,
ajouter un champ optionnel `fontFamily` au schéma de `requiredAssets[]` pour
désigner le nom CSS sous lequel enregistrer la font, et fournir un hook
React `useCustomFont` qui wrappe `FontFace` + `delayRender` /
`continueRender`. Le hook tolère url null (asset non bound) et load failure
(fallback CSS appliqué) sans crasher le render.

Cascade complète :

1. Designer upload `Bulevar.woff2` via `/templates-studio/admin/assets/library`
   (backend accepte `font/woff2`).
2. Manifest déclare `{ key: 'bulevarFont', mime: 'font/woff2', fontFamily: 'Bulevar' }`.
3. Admin bind le slot via `/templates-studio/admin/assets/faits_de_jeu`.
4. Worker render résout l'URL FTP dans `props.__assets.bulevarFont`
   (chaîne ADR-125 inchangée).
5. Composition appelle `useCustomFont('Bulevar', __assets.bulevarFont)` →
   `delayRender` bloque le render jusqu'au `FontFace.load()` → frames
   capturées avec la bonne police.

## Alternatives rejetées

- **Google Fonts via `@remotion/google-fonts`** : rejeté — Bulevar n'est pas
  dans le catalogue Google Fonts (typeface premium tournoi). On veut un
  pattern générique qui marche pour n'importe quelle font designer-sourced.
- **Font embedded en base64 dans le bundle Remotion** : rejeté — alourdit
  le bundle de ~300 KB par font, casse le pattern data-driven (le designer
  ne peut plus uploader sans rebuild Docker).
- **`<link rel="stylesheet">` injecté à la mounting** : rejeté — ne marche
  pas en environnement headless Chrome de Remotion (pas de full DOM event
  loop pour propager les `@font-face` CSS asynchrones avant la 1ère frame).

## Conséquences

- Designer peut uploader des fonts via le panel admin sans rebuild Docker
  ni `lftp manuel`.
- Le rendu est garanti correct dès la 1ère frame grâce à `delayRender`.
- L'asset library devient hétérogène (image / vidéo / font) — l'UI affiche
  une icône Aa pour les fonts (pas de preview thumbnail possible).
- Dette mineure : pas de validation backend stricte que les slots
  `mime: 'font/*'` aient un `fontFamily` — laissé au runtime du hook
  (warn console si le nom CSS est faux). Acceptable tant que la base de
  templates est petite ; à durcir si on dépasse 10 templates avec fonts.

## Fichiers impactés

- `central-server/templates-studio/lib/useCustomFont.ts` — nouveau hook React.
- `central-server/templates-studio/templates/faits_de_jeu/manifest.json` —
  ajoute slot `bulevarFont`.
- `central-server/templates-studio/templates/faits_de_jeu/Composition.tsx` —
  invoque `useCustomFont`.
- `central-server/src/controllers/templates-studio.controller.ts` — étend
  `ASSET_ALLOWED_MIMES_PREFIX` + `ASSET_ALLOWED_EXTRA_MIMES` + `extForMime`
  pour les fonts.
- `central-dashboard/src/app/features/templates-studio/admin/asset-library/*` —
  filter chip "Fonts", icône Aa, accept inputs.
- `central-dashboard/src/app/features/templates-studio/admin/template-bindings/*` —
  helper `isFontSlot`, mime expand pour le sélecteur, accept inputs upload.
- `central-dashboard/src/app/features/templates-studio/templates-studio.types.ts` —
  ajoute `RequiredAsset.fontFamily?`.
- `central-server/src/__tests__/smoke/smoke-templates-studio-fonts.test.ts` —
  smoke garde-fou (hook signature, manifest, composition, MIME, Angular).
- ~~`docs/specs/features/templates-studio.spec.md`~~ — SPEC V2 supprimée en ADR-129.
- `docs/templates/STUDIO-PORTING-GUIDE.md` — section "Fonts custom".
