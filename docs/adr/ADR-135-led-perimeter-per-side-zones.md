# ADR-135: LED périmétrique — pliage par côté + zones de contenu

**Date** : 2026-06-03
**Statut** : Accepté
**Format** : Léger

> Lié à : [PROP-014 §5](../proposals/PROP-014-led-perimeter-content-pipeline.md) (zones par côté), [ADR-134](ADR-134-led-perimeter-render-directly-folded.md) (rendu plié), [SPIKE-003](../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) (limites processeur). Décision **partielle** : pose le **modèle de données**, la **géométrie de pliage par côté** et l'**UX**. Le **rendu runtime** d'un canvas multi-zones (studio Remotion / Pi compose N sources) est cadré ici mais détaillé à l'implémentation, en PRs incrémentales.

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
