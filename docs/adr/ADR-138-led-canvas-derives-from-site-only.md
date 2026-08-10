# ADR-138: Le canvas LED se dérive du terrain seul — pliage toujours par côté

**Date** : 2026-08-10
**Statut** : Accepté
**Format** : Léger

> Lié à : [ADR-134](ADR-134-led-perimeter-render-directly-folded.md) (rendu plié), [ADR-135](ADR-135-led-perimeter-per-side-zones.md) (pliage par côté, étape D), [ADR-137](ADR-137-display-geometry-owns-resolution.md) (la géométrie appartient à l'écran).
> Matrice des montages : `docs/proposals/assets/led-mockups/04-matrice-des-montages.html`.
> Décision **partielle** : unifie la géométrie. Elle ne câble PAS l'étape D — voir « Ce que cette décision ne fait pas ».

---

## Contexte

La géométrie du canvas processeur était choisie par le **contenu**, pas par l'**écran**. `led-export-worker.service.ts` branchait sur `side_files.length > 0` :

- variante uniforme → `computeRibbonDimensions` puis `computeFoldGeometry` (somme des côtés, découpée tous les `band_width`) ;
- variante par côté → `computeFoldGeometryPerSide` (chaque côté plié séparément).

Les deux ne donnent pas le même canvas. Sur `[40, 20, 20]` P6 / 160 rangées : **7 bandes contre 8**, soit 1920×1120 contre 1920×1280.

Or un processeur LED est configuré **une fois à l'installation**, pixel à pixel. Émettre tantôt l'un tantôt l'autre rend le second immappable — ruban noir ou décalé un soir de match.

Deux conséquences secondaires du pliage continu, aussi néfastes :

- **le contenu traverse les angles** : les coupes tombent tous les `band_width` px, jamais sur les côtés. Chez Piraths (4 × 1600 px), les coupes tombent à 1920/3840/5760 alors que les angles sont à 1600/3200/4800 — à l'inverse explicite de la règle métier PROP-014 §5 ;
- **le motif se décale** : le pavage `repeated` était calculé sur la somme des côtés, donc la cadence ne redémarrait pas aux angles.

C'était sans effet en production tant que le pliage n'est pas dans le chemin de diffusion — mais rendait l'étape D d'ADR-135 impossible à câbler sans casser un club.

## Décision

**`computeSiteCanvas(profile)` est le point d'entrée unique du canvas d'un site, et il plie TOUJOURS par côté.**

1. **Le canvas est une fonction pure du terrain** (`sides`, `pitch`, `height`, `canvas_in.band_width`). Le contenu ne choisit plus que les **sources** : `side_files[i]` pour le côté `i`, ou la même source répétée sur tous les côtés. « Uniforme » redevient une notion de contenu, plus une géométrie concurrente.

2. **Le par-côté est le sur-ensemble**, pas un mode alternatif. Il respecte les angles par construction, et le motif redémarre à chaque côté.

3. **Les deux moteurs ffmpeg fusionnent.** `buildRibbonClause` — qui portait tout le pavage (`repeated`, `scrolling`, `stretched`, `centered`) — est paramétré en labels d'entrée/sortie et réutilisé **par côté**. Aucune mise en page n'est perdue ; `stretched` reproduit exactement le comportement antérieur du chemin par côté.

4. **Un `band_count` figé qui ne correspond plus au dérivé est SIGNALÉ, jamais écrasé** (`confirmedIsStale` + `logger.warn`). La valeur figée décrit ce qui est **gravé dans le processeur** : la corriger en douce ferait diverger le canvas émis de la réalité matérielle. C'est le cas de **Saas Lanester HB** — 1 bande figée, 2 dérivées.

## Alternatives rejetées

- **Unifier vers le pliage continu (somme des côtés).** Rejeté : c'est le mode qui fait traverser les angles au contenu, à l'inverse de la règle métier. Le par-côté est le seul des deux qui soit correct.
- **Garder les deux géométries et choisir selon un flag d'écran.** Rejeté : c'est exactement le problème sous un autre nom — deux canvas possibles pour un processeur gravé une fois.
- **Corriger automatiquement un `band_count` figé devenu faux.** Rejeté : la valeur figée est un fait matériel constaté par un installateur, pas une préférence. On signale, l'humain tranche (la mire le fera).
- **Garder deux implémentations ffmpeg et se contenter d'aligner les dimensions.** Rejeté : deux moteurs à faire diverger, et le chemin par côté aurait perdu le pavage `repeated`/`scrolling`.

## Conséquences

- ✅ Un club a **un seul** canvas processeur, quel que soit son contenu. C'est le préalable indispensable à l'étape D.
- ✅ Le contenu ne traverse plus les angles, et le motif redémarre à chaque côté.
- ✅ Le chemin d'export devient unique : moins de code, une seule géométrie à raisonner.
- ⚠️ Sur un site dont le `band_count` figé était calculé sur l'ancienne géométrie (Lanester), le dérivé change. Rien n'est écrasé, mais **la config processeur est à re-confirmer** — la mire (`npm run led:mire`) le fera.
- ⚠️ `computeFoldGeometry` / `computeRibbonDimensions` restent exportés : le **ruban à plat** garde un rôle propre (ce que le club doit livrer, jugé par `validateLedFormat`), distinct du canvas processeur. Ne pas les confondre.

## Ce que cette décision ne fait PAS

Elle ne câble **pas** l'étape D d'ADR-135. Le chemin de déploiement continue d'injecter le `storage_path` brut de la variante, et le garde-fou `smoke-led-canvas-invariant` continue de l'empêcher.

La raison a changé : ce n'est plus la divergence de géométrie (corrigée ici), c'est que **le contrat d'entrée réel des processeurs n'a jamais été observé**. Le préalable est la mire sur un club réel — cf. `npm run led:mire` et la matrice des montages.

## Fichiers impactés

- `central-server/src/services/led-fold.service.ts` — `computeSiteCanvas()`, `parsePitchMm()`, `buildRibbonClause` paramétré en labels, mise en page par côté.
- `central-server/src/services/led-export-worker.service.ts` — chemin unique, `resolveGeometry` renvoie le canvas du site.
- `central-server/src/__tests__/smoke/smoke-led-canvas-invariant.test.ts` — tripwire **révisé** (il était écrit pour être revu à ce moment précis).
- `central-server/src/__tests__/smoke/smoke-led-per-side-variant.test.ts` — assertion négative contre le retour du branchement par contenu.
- `.claude/rules/led.md`, `docs/specs/features/led-perimeter.spec.md`.
