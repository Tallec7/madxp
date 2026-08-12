# ADR-143: Plusieurs rubans `led-perimeter` sur un même club — convention de nommage par famille

**Date** : 2026-08-12
**Statut** : Proposé
**Format** : Léger

---

## Contexte

Un club peut avoir plusieurs installations LED périmétriques indépendantes (ex: bord de terrain + tribune) — confirmé produit, pas un cas isolé. Piraths Strasbourg ATH en a déjà 2 en DB (`sites.displays[0]` et `[1]`, tous deux `type: 'led-perimeter'`).

Or les variantes vidéo (`video_variants.display_type`) et la substitution du canvas plié (`substituteFoldedCanvas`) sont indexées par la seule chaîne `display_type`, avec des checks à correspondance exacte (`=== 'led-perimeter'`) dupliqués à ~8 endroits (`content-variant.controller.ts`, `tv.component.ts` `isPixelExactDisplay`, `video-variant-panel.component.ts` `isLedPerimeter`). Deux displays du même type sur un site partagent donc la même variante et, pire, `substituteFoldedCanvas` prend le **premier** display `led-perimeter` trouvé (`.find()`) — un second ruban avec une géométrie différente hériterait silencieusement du pliage du premier.

## Décision

Chaque ruban additionnel sur un même club reçoit un `type` distinct par suffixe numérique : `led-perimeter`, `led-perimeter-2`, `led-perimeter-3`, etc. (contrainte DB : `display_type` ≤ 20 caractères, `^[a-z0-9-]+$` — un suffixe numérique tient large, un suffixe sémantique type `-tribune` dépasse). Chaque type garde son propre `led.canvas_in` sur son display, comme aujourd'hui.

Les ~8 checks à correspondance exacte deviennent des checks par préfixe (`startsWith('led-perimeter')`), et les `.find(d => d.type === 'led-perimeter')` cherchent désormais le type exact en cours de traitement plutôt que le premier trouvé. Chaque ruban garde ainsi son pipeline complet (rendu pixel-exact, pliage par côté, UI de variante par côté) au lieu de tout perdre comme le ferait un renommage vers un type générique (`led-banner`).

## Alternatives rejetées

- **Renommer le ruban additionnel en `led-banner`** : rejeté — perd tout le pipeline `led-perimeter` (rendu pixel-exact, pliage, UI par côté), alors que ce sont de vrais rubans périmétriques à plier.
- **Rearchitecture complète : scoper `video_variants` par `(site_id, display_index)`** : rejeté pour l'instant — nécessite une migration DB et touche 3 composants pour un gain marginal par rapport à la convention de nommage, qui suffit tant que le nombre de rubans par club reste faible (YAGNI).

## Conséquences

- Un opérateur qui déclare un 2ᵉ ruban DOIT lui donner un type distinct (`led-perimeter-2`) — pas de garde-fou UI empêchant un doublon exact aujourd'hui, à ajouter si ça arrive en pratique.
- `video_variants` reste sans colonne `site_id` (limite connue, non traitée ici) : si une même vidéo était un jour partagée entre deux clubs `led-perimeter` aux géométries différentes, ils partageraient la même variante. Pas de cas connu actuellement.

## Fichiers impactés

- `central-server/src/controllers/content-variant.controller.ts` — checks exacts → préfixe, `.find()` → type exact
- `central-server/src/utils/config-secondary-variants.ts` — `substituteFoldedCanvas` : résoudre par type exact, pas premier trouvé
- `raspberry/src/app/components/tv/tv.component.ts` — `isPixelExactDisplay` : `=== 'led-perimeter'` → `startsWith('led-perimeter')`
- `central-dashboard/src/app/features/content/video-variant-panel.component.ts` — `isLedPerimeter()` : idem
