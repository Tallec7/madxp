# ADR-134: Rendu LED périmétrique — studio rend directement plié

**Date** : 2026-06-03
**Statut** : Accepté
**Format** : Léger

> Lié à : [PROP-014](../proposals/PROP-014-led-perimeter-content-pipeline.md) (pipeline contenu LED), [SPIKE-003](../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) (canvas_in matériel). Décision **partielle** : ne tranche QUE la stratégie de rendu studio. Le mode **A (plug & play) vs B (pixel-perfect)** reste différé post-SPIKE (PROP-014 §10) et fera l'objet d'un ADR dédié.

---

## Contexte

PROP-014 §2 modélise le ruban LED en 3 couches : contenu (déroulé à plat, ex. 13344×160), transport (plié en bandes, ex. 1920×1120), physique (le processeur déplie). PROP-014 §9/§13 supposait un pipeline _flat-puis-fold_ : générer le **ruban plat entier** via Remotion, puis le plier avec `fold()`/ffmpeg. Un POC (`npm run led:ribbon-poc`, mesuré 2026-06-03) a falsifié l'hypothèse de faisabilité : rendre un canvas plat ultra-wide dans Chromium headless **OOM dès ~10000px** (RAM-bound, « Chrome ran out of memory »), bien avant la limite canvas théorique 16384px — alors qu'un terrain handball fait déjà 13333px. Sur Railway (RAM contrainte, déjà OOM-prone cf. [ADR-128](ADR-128-templates-studio-asset-directory.md)) ce serait pire.

## Décision

Pour le **contenu généré par le studio**, on **rend directement le canvas plié** (composition Remotion `LedPerimeterFolded`, sortie `bandWidth × (bandCount·height)`, ex. 1920×1120) : la géométrie `fold()` est appliquée **au draw-time**, et chaque bande ne rend que les cellules de motif visibles dans sa fenêtre `[srcX, srcX+w]` — invariant anti-OOM : **aucun élément du DOM ne dépasse `bandWidth` en largeur**. Le ruban plat géant n'existe jamais. Validé empiriquement OK jusqu'à 220 m (ruban 36667px → canvas sortie 1920×3200), là où le rendu plat échoue dès 60 m. Le module `fold()` (crop+vstack ffmpeg) **reste** la voie pour la **vidéo finie fournie par le club** (PROP-014 §6) : ffmpeg décode un MP4 large en streaming, bien plus économe que la rastérisation DOM de Chromium. Les dimensions sont dérivées du profil LED via `calculateMetadata` Remotion (zéro hardcode).

## Alternatives rejetées

- **Flat-puis-fold (rendre le ruban plat puis plier)** : rejeté car OOM Chromium dès ~10000px → non viable aux tailles réelles de terrain, a fortiori sur Railway.
- **Rendre par segments ≤4000px puis concaténer puis plier** : rejeté (pour le studio) car plus de pièces mobiles (concat ffmpeg + fold) pour aucun gain vs le rendu direct plié, qui supprime l'intermédiaire.

## Conséquences

- ✅ Rendu studio borné en mémoire (sortie ≤ `bandWidth × N`), indépendant de la longueur du périmètre → tient sur Railway.
- ✅ `fold()` conserve un rôle clair et testé : plier une **vidéo club existante** (asymétrie assumée studio vs club).
- ⚠️ Légère duplication de la géométrie (`computeRibbonDimensions` + `computeFoldGeometry`) dans la composition Remotion : frontière de bundle webpack (la compo ne peut pas importer `src/`). Mitigé par des en-têtes « source de vérité » pointant vers `led-fold.service.ts`.
- ⚠️ La composition consomme `bandWidth`/`order` (`canvas_in`) : valeurs **provisoires** (défaut 1920 / top-to-bottom) jusqu'au SPIKE-003 ; un re-render suffit quand les vraies valeurs arrivent (pas de refonte).

## Fichiers impactés

- `central-server/templates-studio/templates/led_perimeter_folded/Composition.tsx` — composition de production (rendu plié, `calculateMetadata`).
- `central-server/templates-studio/templates/led_perimeter_ribbon/Composition.tsx` — composition POC (ruban plat, conservée comme outil de mesure).
- `central-server/templates-studio/Root.tsx` — enregistrement des deux compositions.
- `central-server/src/services/led-fold.service.ts` — `computeRibbonDimensions()` (profil → ruban) + `fold()` (voie vidéo club).
- `central-server/src/scripts/led-ribbon-poc.ts` — harnais de mesure (`npm run led:ribbon-poc [--folded]`).
