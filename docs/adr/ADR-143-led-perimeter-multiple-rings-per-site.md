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

- Un opérateur qui déclare un 2ᵉ ruban DOIT lui donner un type distinct (`led-perimeter-2`) — **fait respecter côté backend** depuis (#1181) : `schemas.updateDisplays` rejette un doublon exact de `type` (sauf `'tv'`, où plusieurs écrans physiques du même type sont légitimes). Côté dashboard, le bouton "+ Ajouter un écran" (#1184) auto-suffixe désormais le type quand le gabarit choisi existe déjà, au lieu de recréer le doublon que le backend refuse.
- **Gap découvert après coup (2026-08-12)** : le renommage de `type` seul ne suffit pas à rendre un 2ᵉ ruban opérationnel. `displays-editor.component.ts` comparait encore `display.type` en égalité stricte (#1185, panneau LED/profil invisible pour `led-perimeter-2`), et surtout l'outillage de fabrication en masse (`bulkCreateLedVariants`, `getLedCanvasOverview`, le détourage `detect`/`crop`) était câblé en dur sur le type exact `led-perimeter` — un 2ᵉ ruban n'avait donc AUCUN moyen de recevoir ses `video_variants`/`led_export_jobs`, et diffusait le fichier brut une seule fois (jamais plié), constaté en prod sur Piraths Strasbourg ATH. Fermé par le paramètre `display_type` (body/query/route selon l'endpoint), validé par `isLedPerimeterFamily()`.
- `video_variants` reste sans colonne `site_id` (limite connue, non traitée ici) : si une même vidéo était un jour partagée entre deux clubs `led-perimeter` aux géométries différentes, ils partageraient la même variante. Pas de cas connu actuellement.

## Fichiers impactés

- `central-server/src/controllers/content-variant.controller.ts` — checks exacts → préfixe, `.find()` → type exact ; `bulkCreateLedVariants`/`getLedCanvasOverview`/`resolveLedTarget`/`detectLedVariantCrop`/`setLedVariantCrop` scopés par `display_type` explicite (défaut `led-perimeter` pour rétrocompat)
- `central-server/src/routes/content.routes.ts` — routes crop `.../variants/led-perimeter/crop*` → `.../variants/:displayType/crop*`
- `central-server/src/utils/config-secondary-variants.ts` — `substituteFoldedCanvas` : résoudre par type exact, pas premier trouvé
- `central-server/src/middleware/validation.ts` — `schemas.updateDisplays` : rejet des doublons exacts de `type` (hors `'tv'`)
- `raspberry/src/app/components/tv/tv.component.ts` — `isPixelExactDisplay` : `=== 'led-perimeter'` → `startsWith('led-perimeter')`
- `central-dashboard/src/app/features/content/video-variant-panel.component.ts` — `isLedPerimeter()` : idem
- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` — `uniquifyType()` (auto-suffixe à l'ajout), `isLedPerimeterFamily()` (panneau/profil/résolution), bouton bulk-create scopé au ruban édité
- `central-dashboard/src/app/features/sites/components/site-settings-tab/led-canvas-overview/led-canvas-overview.component.ts` — `@Input() displayType` : une instance = un ruban (canvas overview, redo, remove, crop)
