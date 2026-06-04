# ADR-135: LED périmétrique — pliage par côté + zones de contenu

**Date** : 2026-06-03
**Statut** : Accepté
**Format** : Léger

> Lié à : [PROP-014 §5](../proposals/PROP-014-led-perimeter-content-pipeline.md) (zones par côté), [ADR-134](ADR-134-led-perimeter-render-directly-folded.md) (rendu plié), [SPIKE-003](../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) (limites processeur). Décision **partielle** : pose le **modèle de données**, la **géométrie de pliage par côté** et l'**UX**. Le **rendu runtime** d'un canvas multi-zones (studio Remotion / Pi compose N sources) est cadré ici mais détaillé à l'implémentation, en PRs incrémentales.

---

## 🔄 Révision 2026-06-03 — le « par côté » vit sur la VARIANTE d'une vidéo, pas sur l'écran

**Validation UX avec Daisy** : choisir la vidéo de chaque côté **dans les Réglages de l'écran** (modèle initial ci-dessous, `display.led.side_zones`) est **incohérent** avec le reste de l'appli — le contenu se gère côté **Contenu** (boucle + à la demande), et la déclinaison d'une vidéo par type d'écran se fait via les **variantes (« visuel 2nd écran »)**. Le modèle de **contenu** est donc corrigé (la **géométrie** #1089 et la **compose** #1091 restent inchangées) :

- **L'écran (`display.led`) ne porte que la GÉOMÉTRIE** : `sides`, `pitch`, `height`, `spacing_m`, `canvas_in`. On **retire** `zones` et `side_zones` de l'écran.
- **Le « par côté » est une propriété de la VARIANTE led-perimeter d'une vidéo.** Pour une vidéo donnée (dans une **boucle** OU jouée **à la demande**), sa déclinaison LED est :
  - **uniforme** : 1 fichier plié, répété sur tous les côtés (comportement actuel) ;
  - **par côté** : une vidéo (de la bibliothèque) assignée à chaque côté.
- **Où on clique** : dans le panneau **variantes** de la vidéo (`video-variant-panel`, côté Contenu), pas dans les Réglages. Il connaît déjà les côtés du site (via `siteDisplays`).
- **Source de la compose** (`applyPerSideFold`, #1091) : `inputs[i]` = la vidéo assignée au côté `i` **dans la variante** (au lieu des `side_zones` de l'écran).

**Conséquences sur le code déjà livré :**

- **#1088 supersédé** : le sélecteur « vidéo par côté » + le toggle `zones` dans `displays-editor`, et le champ `led.side_zones` (modèle + Joi) → **à retirer** ; le « par côté » est reporté sur la variante. PR de rework dédiée.
- **#1089 (géométrie) + #1091 (compose ffmpeg)** : **conservés tels quels**.

**Inchangé** : pliage **par côté** (géométrie, #1089) ; **1 vidéo par côté en v1** (rotation/playlist par côté = v2) ; angles respectés.

### Modèle de stockage — un fichier uploadé par côté (validé Daisy 2026-06-03)

Le « par côté » d'une vidéo = **un fichier vidéo uploadé par côté** (pas une référence à une autre vidéo de la biblio). On **étend la variante led-perimeter existante**, sans toucher à sa contrainte d'unicité `(video_id, display_type)` :

- Nouvelle colonne **`video_variants.side_files JSONB`** (nullable). Contient un tableau `[{ side_index, filename, original_name, storage_path, file_size, checksum, mime_type, width, height }]`, un élément par côté renseigné. Migration légère (ADD COLUMN), **zéro changement de contrainte**.
- `storage_path` / `filename` rendus **nullable** (migration `DROP NOT NULL`) : une variante **par côté pure** (sans fichier « uniforme ») a `storage_path = NULL` + `side_files` rempli.
- **Mode dérivé** (pas de flag) : `side_files` non vide → **par côté** ; sinon → **uniforme** (le `storage_path` de la row, comportement actuel).
- **Upload par côté** : `POST /videos/:id/variants/led-perimeter/sides/:sideIndex` (multipart) → upload FTP → upsert l'élément `side_files[sideIndex]`. `DELETE …/sides/:sideIndex` le retire.
- **Compose** (#1091) : `inputs[i]` = `side_files[i].storage_path` (téléchargé par le worker), classés par `side_index`.

**Plan de build & état** :

- **A ✅** migration `side_files` + repo `setSideFile`/`clearSideFile` + endpoints `POST/DELETE …/sides/:sideIndex`.
- **B ✅** UI panneau variantes (`video-variant-panel`) : radio uniforme/par côté + un slot d'upload par côté.
- **C ✅** compose : le worker d'export plie PAR CÔTÉ quand la variante a des `side_files` (`computeFoldGeometryPerSide` + `applyPerSideFold`, prouvé ffmpeg #1091). Le bouton « Exporter le MP4 plié » + le polling existants servent d'aperçu téléchargeable.
- **D (partiel)** : garde-fou **anti-MP4-noir** posé — l'enrichissement de déploiement (`config-secondary-variants`) **saute** les variantes par côté sans fichier (ni `storage_path` ni `filename`), pour ne jamais injecter `videos-led-perimeter/null`. **Reste à câbler (validation matérielle)** : que le **canvas composé par site** (sortie de C) devienne le contenu led-perimeter **servi/déployé** au Pi. Non implémenté en aveugle (risque MP4 noir, cf. `feedback_no_blind_patch_cascade`).

> Lab-prouvé A→C : uploader un fichier par côté → composer → aperçu MP4 plié correct. La **diffusion réelle sur le ruban LED** (D, dernier maillon) nécessite une validation prod sur matériel.

> Le reste de l'ADR ci-dessous décrit le **modèle initial** (`side_zones` sur l'écran). Conservé pour l'historique, **supersédé sur le point « où vit le contenu par côté »** par cette révision.

---

## Contexte

Le moteur de pliage (ADR-134, `led-fold.service.ts`) traite le périmètre comme **un ruban continu unique** : `computeRibbonDimensions` calcule `largeur = Σ côtés × (1000/pitch_mm)`, puis `computeFoldGeometry` découpe ce ruban en bandes de `band_width` (1920 px par défaut).

Conséquence : **les côtés sont indistinguables après la somme**. Vérifié 2026-06-03 :

- `zones: 'per-side'` (modélisé PROP-014 §5) est un **flag mort** : `grep per-side` = 0 consommateur dans `central-server/src`, `raspberry/src` et `docs/specs`. Le sélecteur UI « Contenu par côté » écrit la valeur en base, mais aucun code ne la lit.
- Aucun **contenu** ni **cadence** par côté possible : le `spacing_m` global (contraint aux diviseurs du PGCD des côtés) s'applique à tout le ruban.
- Les bandes de transport tombent **tous les `band_width` px, pas aux angles** → le contenu traverse en réalité les angles, à l'inverse de l'intention §5 (« le contenu ne traverse jamais un angle »).

**Besoin métier** (validé avec Daisy, 2026-06-03) : afficher une **pub/vidéo différente par côté** + une **cadence de répétition différente par côté** (ex. Coca sur la tribune 40 m, Nike derrière les deux buts 20 m).

## Décision

1. **Pliage par côté** (quand `zones = 'per-side'`). On ne plie plus la somme : chaque côté `i` est plié **indépendamment** — `ribbon_i = côté_i(m) × 1000/pitch_mm`, plié en `ceil(ribbon_i / band_width)` bandes — et les blocs de bandes sont **empilés dans l'ordre des côtés**. Le canvas processeur final = `band_width × Σ(bandes de tous les côtés)`. Effet : **chaque côté est un bloc de bandes contigu** → le contenu et la cadence par côté deviennent triviaux ; bonus, le contenu **ne traverse plus un angle** (intention §5 enfin tenue). En `zones = 'uniform'` (défaut), le comportement ADR-134 (un seul ruban Σ) reste **strictement inchangé**.

2. **Modèle de données** — additif, zéro migration rigide (JSONB `displays[].led`). On **garde** `led.sides: number[]` (longueurs, inchangé) et on **ajoute** `led.side_zones?: SideZone[]`, aligné par **index** sur `sides` :

   ```ts
   interface SideZone {
     name?: string; // libellé opérateur, ex. « Tribune »
     content?: { video_id: string; storage_path: string }; // v1 : 1 vidéo
     spacing_m?: number; // cadence propre ; sinon hérite du spacing_m global
   }
   ```

   `side_zones[i]` décrit le côté `sides[i]`. Absent ⇒ hérite du contenu/cadence par défaut. Le `spacing_m` global reste la valeur de repli.

3. **Contenu v1 = 1 vidéo par côté.** L'opérateur assigne une vidéo de la bibliothèque à chaque côté (boucle sur ce côté). La **rotation/playlist de sponsors par côté** est **différée (v2)** : même structure, `content` deviendra une liste.

4. **UX.** Le mode « Contenu par côté » développe, sous le panneau LED, **un bloc par côté** (nom éditable, sélecteur vidéo, sélecteur de répétition) — cf. maquette de cette session. Repasser sur « Même contenu partout » masque le bloc et revient au ruban unique.

## Alternatives rejetées

- **Garder le pliage de la somme + mapper chaque côté en rectangles `(bande, x-range)`** : rejeté. Un côté chevauche les frontières de bandes (tous les 1920 px) → composer le contenu d'un côté = l'éclater sur **plusieurs sous-rectangles de bandes non contiguës**. Complexe et fragile. Le pliage par côté rend les côtés contigus **par construction**.
- **`sides: { length, video, spacing }[]` (objets au lieu de nombres)** : plus « propre » mais casse `computeRibbonDimensions`, le schéma Joi `updateDisplays`, le dashboard et la rétro-compat des profils existants. Le tableau parallèle `side_zones[]` aligné par index préserve tout l'existant.
- **Rotation multi-sponsors par côté dès la v1** : reporté — surdimensionné tant que « 1 pub par côté » n'est pas livré et exploité.

## Conséquences

- ✅ Contenu **et** cadence par côté ; les angles sont respectés (chaque côté plié isolément).
- ✅ `zones = 'uniform'` (défaut de toute la flotte) = ADR-134 inchangé → **zéro régression**.
- ⚠️ **Plus de bandes** (chaque côté arrondit à la bande entière → padding par côté) → canvas processeur un peu plus haut. Ex. `[40,20,20]` P6 : `4+2+2 = 8` bandes vs `7` en continu. À confronter aux limites processeur au **SPIKE-003**.
- ⚠️ Le **runtime** (studio Remotion / Pi) doit composer **N sources** dans le canvas plié, par blocs de côté. Cadré ici, **détaillé à l'implémentation** (piste probable : le studio rend chaque bloc de côté via `LedPerimeterFolded` paramétré par côté ; le pliage vidéo club via `applyFold` par segment). PRs incrémentales.
- ⚠️ `computeFoldGeometry` gagne une variante « par côté » (boucle + empilement) ; `computeRibbonDimensions` reste la voie `uniform`.

## Fichiers impactés (prévision)

- `central-server/src/services/led-fold.service.ts` — géométrie de pliage par côté (empilement des blocs).
- `central-server/src/middleware/validation.ts` — schéma `led.side_zones` dans `updateDisplays`.
- `central-dashboard/src/app/.../displays-editor/displays-editor.component.ts` — bloc « Contenu par côté ».
- `central-dashboard/src/app/core/models/index.ts` — `SideZone`, `LedProfileConfig.side_zones`.
- `docs/specs/features/led-perimeter.spec.md` — mise à jour du modèle.
- _(runtime, PRs suivantes)_ `central-server/templates-studio/…`, `raspberry/…` — composition multi-zones.
