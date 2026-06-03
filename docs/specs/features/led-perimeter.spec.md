# SPEC : LED périmétrique (bord de terrain)

> **Owner** : Daisy
> **Statut** : En construction (PROP-014 étapes 1-3 livrées, SPIKE matériel en attente)
> **Dernière revue** : 2026-06-03
> **last_verified** : 2026-06-03
> **verified_against_commit** : 88c4ca7c
> **Proposals liées** : [PROP-014](../../proposals/PROP-014-led-perimeter-content-pipeline.md) (modèle 3 couches, data model, plan de build), [SPIKE-003](../../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) (validation matérielle `canvas_in` + mode A/B)
> **ADR liés** : [ADR-134](../../adr/ADR-134-led-perimeter-render-directly-folded.md) (studio rend directement plié), [ADR-128](../../adr/ADR-128-templates-studio-asset-directory.md) (bornes RAM render Remotion)
> **Smoke tests** : `led-fold.service.test.ts`, `display-led-profile.validation.test.ts`, `displays-editor.component.spec.ts` (bloc LED)

## En une phrase

Le LED périmétrique transforme un **motif sponsor** + un **profil de site paramétrique** (côtés, pitch, hauteur, cadence) en un **canvas vidéo plié en bandes** qu'un processeur LED (Novastar/Colorlight) déplie sur le ruban du bord de terrain — une seule surface continue ultra-wide, pas un recadrage 16:9.

## Périmètre

**Modèle 3 couches** (PROP-014 §2) : contenu logique (ruban déroulé à plat, ex. 13333×160) → transport (fichier plié en bandes, ex. 1920×1120) → physique (le processeur déplie). MadXP produit le contenu + le transport ; le processeur gère le physique.

**Services backend** :

- `central-server/src/services/led-fold.service.ts` — IP du domaine : `computeRibbonDimensions()` (profil → largeur ruban), `computeFoldGeometry()` (ruban → bandes empilées), `buildFoldFfmpegArgs()` / `applyFold()` (pliage ffmpeg crop+vstack d'une vidéo existante).
- `central-server/templates-studio/templates/led_perimeter_folded/` — composition Remotion de **production** : rend directement le canvas plié (ADR-134).
- `central-server/templates-studio/templates/led_perimeter_ribbon/` — composition **POC** (ruban plat) + outil de mesure `npm run led:ribbon-poc`.

**Données** : le profil LED vit sur `sites.displays[]` (JSONB) pour les displays de `type: 'led-perimeter'` — `{ sides, pitch, height, spacing_m, zones, canvas_in }`. Validé par `schemas.updateDisplays` (`middleware/validation.ts`).

**UI** : panneau LED du `displays-editor.component.ts` (dashboard), rendu **par type** (`led-perimeter`), pas par index.

**Hors périmètre de cette SPEC** : la mise en page par variante (`video_variants.layout`), le validateur de format à l'upload, l'export téléchargeable, le live HDMI Pi→processeur (étapes 4-6 PROP-014, à venir).

## Règles métier

- **Topologie en données, jamais en code** : un site décrit son périmètre par `sides` (1 à 8 côtés en mètres) + `pitch` (ex. `P6` = 6 mm). `largeur_ruban = Σ côtés × (1000 / pitch_mm)`. On ne code pas par cas (1 côté, 3 côtés…).
- **Espacement contraint, jamais saisie libre** : la cadence du motif (`spacing_m`) est un dropdown limité aux diviseurs alignés sur les côtés (angles alignés + répétitions entières — PROP-014 §4). Leçon anti-drift.
- **Le contenu ne traverse jamais un angle** : chaque côté est une zone naturelle. `zones: 'uniform'` (même contenu partout) ou `'per-side'` (par côté).
- **`canvas_in` = config processeur, provisoire jusqu'au SPIKE** : `band_width` (défaut 1920), `band_count` (dérivé), `order` (`top-to-bottom` | `bottom-to-top`, **même enum que `fold()`**), `mode` (`A` plug&play | `B` pixel-perfect — tranché post-SPIKE). Défauts provisoires → aucune refonte quand le SPIKE remplit les vraies valeurs.
- **Studio rend directement plié, club passe par `fold()`** (ADR-134) : le contenu généré par le studio est rendu directement dans le canvas plié (≤ `band_width × N`) ; la vidéo finie fournie par un club est pliée via ffmpeg. Ne jamais rastériser un ruban plat ultra-wide dans Chromium (OOM ≥ ~10000px).
- **`fold()` est paramétrique et pur** : la géométrie (bandes, srcX, dstY, padding dernière bande) ne dépend que de `(ribbonWidth, ribbonHeight, bandWidth, order)`.

## Comportements observables

- Saisir un profil `sides:[40,20,20] pitch:P6 height:160` dans le dashboard affiche en direct : « Ruban 13333×160 → plié en 7 bandes (canvas 1920×1120) » + badge ⏳ provisoire tant que `band_count` n'est pas confirmé.
- `computeFoldGeometry({ ribbonWidth:13344, ribbonHeight:160, bandWidth:1920 })` → 7 bandes, canvas 1920×1120, dernière bande 1824px (padding 96px).
- `npm run led:ribbon-poc --folded` rend la composition pliée à toutes les largeurs sans OOM (sortie ≤ 1920×N) ; sans `--folded`, le ruban plat échoue dès ~10000px (preuve ADR-134).
- Le panneau LED n'apparaît **que** pour un display `type: 'led-perimeter'` — une 2ᵉ TV reste inchangée.

## Cas d'edge

- **Dernière bande tronquée** : si `ribbonWidth` n'est pas multiple de `bandWidth`, la dernière bande est paddée à droite (`padRight = bandWidth − w`).
- **Ruban plus étroit qu'une bande** : `ribbonWidth < bandWidth` → 1 seule bande, paddée. Pas de `vstack` ffmpeg (cas mono-bande).
- **Profil partiel chargé** (display `led-perimeter` sans `led`) : le form applique les défauts (normalisation) pour éviter un crash de binding.
- **Périmètre très long** (≥ ~60 m P6) : le rendu plat OOM ; seul le rendu plié tient (jusqu'à 220 m mesuré). C'est la raison d'être d'ADR-134.
- **`spacing_m` non-diviseur** (valeur héritée) : le dropdown l'inclut quand même pour ne pas perdre la valeur courante, mais ne la propose pas pour un nouveau profil.

## Ce qui n'est PAS

- **Pas un recadrage 16:9** d'une vidéo TV (hypothèse ADR-029/PROP-002/PROP-010 invalidée par PROP-014).
- **Pas un pilotage dynamique du processeur** : MadXP ne parle pas à NovaLCT/ViPlex ; le processeur est configuré une fois à l'install, sa config doit matcher `canvas_in` pixel à pixel.
- **Pas de `:8080` admin local** : le LED est cloud + Pi-output, pas une feature de l'admin Pi local.
- **Pas un convertisseur magique** : MadXP plie toute vidéo (la créa club fonctionne telle quelle), donne la spec pour un rendu optimal, mais ne « répare » pas un MP4 aplati.
- **Pas de zones stitchées indépendantes** (mécanisme PROP-011 remplacé) : composition par segment sur un ruban continu unique.
