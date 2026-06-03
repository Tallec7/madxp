# SPEC : LED périmétrique (bord de terrain)

> **Owner** : Daisy
> **Statut** : En construction (PROP-014 étapes 1-3 livrées, SPIKE matériel en attente)
> **Dernière revue** : 2026-06-03
> **last_verified** : 2026-06-03
> **verified_against_commit** : 88c4ca7c
> **Proposals liées** : [PROP-014](../../proposals/PROP-014-led-perimeter-content-pipeline.md) (modèle 3 couches, data model, plan de build), [SPIKE-003](../../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) (validation matérielle `canvas_in` + mode A/B)
> **ADR liés** : [ADR-134](../../adr/ADR-134-led-perimeter-render-directly-folded.md) (studio rend directement plié), [ADR-135](../../adr/ADR-135-led-perimeter-per-side-zones.md) (pliage par côté + zones de contenu — **conçu, pas encore implémenté**), [ADR-128](../../adr/ADR-128-templates-studio-asset-directory.md) (bornes RAM render Remotion)
> **Smoke tests** : `led-fold.service.test.ts`, `display-led-profile.validation.test.ts`, `displays-editor.component.spec.ts` (bloc LED)

## En une phrase

Le LED périmétrique transforme un **motif sponsor** + un **profil de site paramétrique** (côtés, pitch, hauteur, cadence) en un **canvas vidéo plié en bandes** qu'un processeur LED (Novastar/Colorlight) déplie sur le ruban du bord de terrain — une seule surface continue ultra-wide, pas un recadrage 16:9.

## Périmètre

**Modèle 3 couches** (PROP-014 §2) : contenu logique (ruban déroulé à plat, ex. 13333×160) → transport (fichier plié en bandes, ex. 1920×1120) → physique (le processeur déplie). MadXP produit le contenu + le transport ; le processeur gère le physique.

**Services backend** :

- `central-server/src/services/led-fold.service.ts` — IP du domaine : `computeRibbonDimensions()` (profil → largeur ruban), `computeFoldGeometry()` (ruban → bandes empilées), `validateLedFormat()` (validateur §6), `applyFold()` (pliage d'un ruban plat) et `applyFoldExport()` (adapte une vidéo quelconque au ruban via `fit` contain/cover/stretch puis plie — voie d'export vidéo club). CLI démontrable : `npm run led:export`.
- `central-server/templates-studio/templates/led_perimeter_folded/` — composition Remotion de **production** : rend directement le canvas plié (ADR-134).
- `central-server/templates-studio/templates/led_perimeter_ribbon/` — composition **POC** (ruban plat) + outil de mesure `npm run led:ribbon-poc`.

**Données** : le profil LED vit sur `sites.displays[]` (JSONB) pour les displays de `type: 'led-perimeter'` — `{ sides, pitch, height, spacing_m, zones, canvas_in }`. Validé par `schemas.updateDisplays` (`middleware/validation.ts`).

**UI** : panneau LED du `displays-editor.component.ts` (dashboard) + sélecteur de mise en page du `video-variant-panel.component.ts`, rendus **par type** (`led-perimeter`), pas par index. Aperçu schématique du canvas plié (bandes empilées) dans le panneau LED.

**Mise en page par variante** : `video_variants.layout` (`'repeated' | 'scrolling' | 'stretched'`, NULL hors LED) — `PATCH /videos/:id/variants/:displayType/layout`.

**Validateur de format à l'upload** (`validateLedFormat`) : juge le format d'une vidéo club uploadée contre le ruban du profil, retourne un `format_notice` **non bloquant**.

**Export** : moteur ffmpeg `applyFoldExport()` (vidéo club → canvas plié, `fit` dérivé du `layout` via `fitFromLayout()`) servi en **async** — table `led_export_jobs`, worker in-process `led-export-worker.service.ts` (claim `FOR UPDATE SKIP LOCKED`, `failStaleRunning` au boot, source = variante led-perimeter **sinon** binaire principal de la vidéo), `POST /videos/:id/variants/:displayType/export` (202 `{job_id}`) + `GET /led-export-jobs/:jobId` (polling), bouton + lien de téléchargement dans le panneau variantes. Le studio rend directement plié (`LedPerimeterFolded`). CLI `npm run led:export`.

**Banc d'essai** : depuis le panneau LED (`displays-editor`), l'opérateur plie une **vidéo au choix** (pas besoin de variante dédiée) avec le profil du club et la mise en page choisie (Répété/Défilant/Étalé/Centré) pour comparer le rendu avant de figer une variante — `POST /led-test-export/:siteId {video_id, layout}` réutilise le pipeline d'export (`led_export_jobs` + worker), avec réutilisation d'un ruban déjà plié pour le même `(vidéo × club × layout)`.

**Hors périmètre de cette SPEC** : le live HDMI Pi→processeur, le SPIKE matériel (`canvas_in` + mode A/B).

## Règles métier

- **Topologie en données, jamais en code** : un site décrit son périmètre par `sides` (1 à 8 côtés en mètres) + `pitch` (ex. `P6` = 6 mm). `largeur_ruban = Σ côtés × (1000 / pitch_mm)`. On ne code pas par cas (1 côté, 3 côtés…).
- **Côtés = cases éditables, pas un champ texte à virgules** : le panneau rend **une case par côté** + bouton `[+]` (1 à 8) + `✕` pour retirer (garde toujours ≥ 1), avec le périmètre total affiché en direct. La saisie « 40, 20, 20 » dans un seul champ était invisible pour un opérateur non-tech (il croyait ne pouvoir saisir qu'un côté). Modèle `sides: number[]` inchangé.
- **Pitch = menu + saisie libre** : datalist des pas courants (`P2.5…P10`) tout en gardant la saisie libre (validée `PxX`) pour un pas exotique.
- **Espacement contraint, jamais saisie libre** : la cadence du motif (`spacing_m`, libellé UI « Répétition par défaut », options « tous les X m ») est un dropdown limité aux diviseurs alignés sur les côtés (angles alignés + répétitions entières — PROP-014 §4). Leçon anti-drift.
- **Saisie en unités physiques (moldu), px en interne** : l'opérateur terrain mesure sa dalle en **cm** — le champ « Hauteur dalle » est en cm. Le modèle DB `height` reste en **rangées px** (= la matrice LED réelle, requise par le pliage/render). Conversion : `rangées = round(cm × 10 / pitch_mm)` (une dalle n'a pas de fraction de rangée → arrondi entier, le sous-libellé « = N rangées » montre le résultat effectif). Symétrique de la largeur (`côtés` en m → px). Zéro migration : `height` reste px côté serveur.
- **Le contenu ne traverse jamais un angle** : chaque côté est une zone naturelle. `zones: 'uniform'` (même contenu partout, **seul mode implémenté** : ruban continu Σ côtés, ADR-134) ou `'per-side'` (contenu + cadence par côté — **conçu dans [ADR-135](../../adr/ADR-135-led-perimeter-per-side-zones.md), pas encore câblé** : pliage par côté + `side_zones[]`). Tant que `per-side` n'est pas livré, le sélecteur « Contenu par côté » est inerte (le serveur ne le lit pas).
- **`canvas_in` = config processeur, provisoire jusqu'au SPIKE** : `band_width` (défaut 1920), `band_count` (dérivé), `order` (`top-to-bottom` | `bottom-to-top`, **même enum que `fold()`**), `mode` (`A` plug&play | `B` pixel-perfect — tranché post-SPIKE). Défauts provisoires → aucune refonte quand le SPIKE remplit les vraies valeurs.
- **Jargon processeur replié dans « Avancé »** : `band_width` × canvas (Entrée processeur), `band_count` (Bandes) et `mode` (A/B) vivent dans une section repliable. `band_count` et `mode` sont **éditables** : l'installateur fige les vraies valeurs sur place → `isCanvasProvisional` passe à `false` et le badge « ⚠️ à confirmer install » disparaît. Vider Bandes rétablit le dérivé (provisoire). `getLedCanvasHeight` = `(band_count confirmé ?? dérivé) × hauteur`.
- **Studio rend directement plié, club passe par `fold()`** (ADR-134) : le contenu généré par le studio est rendu directement dans le canvas plié (≤ `band_width × N`) ; la vidéo finie fournie par un club est pliée via ffmpeg. Ne jamais rastériser un ruban plat ultra-wide dans Chromium (OOM ≥ ~10000px).
- **`fold()` est paramétrique et pur** : la géométrie (bandes, srcX, dstY, padding dernière bande) ne dépend que de `(ribbonWidth, ribbonHeight, bandWidth, order)`.
- **Le validateur juge le FORMAT, jamais la source, et n'est JAMAIS bloquant** (PROP-014 §6) : `exact` (dimensions = profil → pliage direct), `resize` (même ratio → redimensionne), `incompatible` (ratio différent → blocs/espaces, note informative), `unknown` (dimensions illisibles). On ne refuse jamais un upload club.
- **La mise en page vit sur la variante** (`layout`), pas sur le display — par vidéo × par écran (PROP-014 §8, Option A).

## Comportements observables

- Saisir un profil via les **cases côtés** `[40][20][20][+]` (périmètre 80 m), pitch `P6` (menu + libre), hauteur **96 cm** (→ `height:160`, « = 160 rangées @ P6 ») : la section « Avancé (processeur) » montre « Entrée processeur 1920×1120 », Bandes `[7]`, Mode `[B]`, avec le badge « ⚠️ à confirmer install » tant que `band_count` n'est pas figé. Saisir `8` dans Bandes → Entrée passe à 1920×1280 et le badge disparaît.
- `computeFoldGeometry({ ribbonWidth:13344, ribbonHeight:160, bandWidth:1920 })` → 7 bandes, canvas 1920×1120, dernière bande 1824px (padding 96px).
- `npm run led:ribbon-poc --folded` rend la composition pliée à toutes les largeurs sans OOM (sortie ≤ 1920×N) ; sans `--folded`, le ruban plat échoue dès ~10000px (preuve ADR-134).
- Le panneau LED n'apparaît **que** pour un display `type: 'led-perimeter'` — une 2ᵉ TV reste inchangée.
- Uploader une vidéo club 4800×800 (6:1) sur un ruban ~83:1 affiche un avis ⚠️ « ratio incompatible → blocs/espaces » sans bloquer l'upload ; une vidéo aux dimensions exactes affiche ✅ « pliage direct ».
- Le sélecteur de mise en page (Répété/Défilant/Étalé) n'apparaît que pour les variantes `led-perimeter` et persiste via PATCH (rollback optimiste si échec).
- `npm run led:export` plie une vidéo (ex. testsrc 4800×800) au canvas exact du profil (1920×1120) — vérifié par ffprobe (`match: true`), sans OOM Chromium (ffmpeg pur).
- Cliquer « Exporter le MP4 plié » sur une variante led-perimeter enqueue un job, affiche « Export en cours… », puis un lien de téléchargement quand le worker a fini (polling 2s). Un job `processing` orphelin (crash worker) est re-queué au boot suivant.
- Dans le panneau LED, le **banc d'essai** « 🧪 Tester une vidéo » (visible seulement si un club est en contexte) plie une vidéo au choix avec la mise en page sélectionnée et affiche un lecteur + lien de téléchargement — utile pour comparer Répété/Défilant/Étalé/Centré sans créer de variante. Une vidéo sans variante led-perimeter est pliée depuis son binaire principal.

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
- **Pas (encore) de contenu par côté** : aujourd'hui un seul ruban continu Σ côtés, même contenu/cadence partout (ADR-134). Le **contenu + cadence par côté** (pliage par côté, `side_zones[]`) est **conçu dans [ADR-135](../../adr/ADR-135-led-perimeter-per-side-zones.md)** mais pas implémenté — livraison en PRs incrémentales (modèle + UI → moteur fold par côté → runtime). V1 visée = 1 vidéo par côté ; rotation multi-sponsors par côté = v2.
