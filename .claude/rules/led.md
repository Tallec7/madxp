# LED périmétrique — Invariants (ADR-134 / ADR-135)

Source de vérité : [ADR-134](../../docs/adr/ADR-134-led-perimeter-render-directly-folded.md),
[ADR-135](../../docs/adr/ADR-135-led-perimeter-per-side-zones.md),
[led-perimeter.spec.md](../../docs/specs/features/led-perimeter.spec.md).

## L'invariant central

**Le canvas processeur ne dépend QUE de la géométrie du site, jamais du contenu diffusé.**

Un processeur LED (Novastar/Colorlight) est configuré **une seule fois à l'installation**,
pixel à pixel. Émettre tantôt un canvas, tantôt un autre, rend le second immappable —
ruban noir ou décalé, un soir de match.

**Depuis ADR-138, c'est tenu** : `computeSiteCanvas()` est le point d'entrée unique
et plie TOUJOURS par côté. Le contenu ne choisit plus que les SOURCES (un fichier par
côté, ou le même partout). Avant, le worker branchait sur `side_files.length > 0`
entre deux géométries donnant 7 ou 8 bandes pour le même club.

Le pliage n'est toujours PAS dans le chemin de diffusion : `config-secondary-variants.ts`
injecte le `storage_path` brut de la variante. Il ne sert qu'au bouton « Exporter le
MP4 plié » et au banc d'essai — l'étape D d'ADR-135 reste à câbler.

**Un `band_count` figé par un installateur qui ne correspond plus au dérivé est
SIGNALÉ (`confirmedIsStale` + `logger.warn`), jamais écrasé** : la valeur figée décrit
ce qui est gravé dans le processeur.

## NE JAMAIS FAIRE (smoke test enforced)

- **Importer `led-fold.service` ou `led-export-worker.service` depuis
  `utils/config-secondary-variants.ts`** — ni y appeler `computeFoldGeometry*` /
  `applyPerSideFold` / `applyFoldExport`. C'est le câblage de l'**étape D** d'ADR-135
  (diffuser le canvas composé). La divergence de géométrie est corrigée (ADR-138), mais
  le contrat d'entrée réel des processeurs n'est **toujours pas observé** : le câbler en
  aveugle reste un pari. Le préalable est la mire (`npm run led:mire`) sur un club réel.
  Rappel du risque : **Saas Lanester HB** a `canvas_in.band_count = 1` figé par un
  installateur alors que le dérivé par côté vaut 2 — servir le canvas dérivé sans
  re-confirmer doublerait la hauteur (110 → 220 px) face à un processeur gravé pour 110.
- **Retirer `if (!v.storage_path && !v.filename) continue;`** de
  `config-secondary-variants.ts` — une variante « par côté pure » n'a ni `storage_path`
  ni `filename` ; l'injecter produit un chemin `videos-led-perimeter/null` → MP4 noir.
- **Consommer `applyPerSideFold` / `computeFoldGeometryPerSide` ailleurs que dans
  `led-export-worker.service.ts`** (et les scripts CLI/POC). Un nouveau consommateur en
  production = étape D qui se câble par la bande.

## État du parc (vérifié en DB prod le 2026-08-10)

**2 sites** ont un display `type='led-perimeter'`, **les deux en `site_type='saas'`
(aucun Pi)** :

| Site                   | Côtés     | Pitch | Px / côté | Bandes                 |
| ---------------------- | --------- | ----- | --------- | ---------------------- |
| Saas Lanester HB       | 2 × 4,8 m | P10   | 480       | 1 (uniforme, **figé**) |
| Piraths Strasbourg ATH | 4 × 10 m  | P6.25 | 1600      | 4 (provisoire)         |

**Aucun CÔTÉ ne dépasse `band_width` (1920)** : le pliage par côté ne coupe donc jamais
à l'intérieur d'un côté sur le parc actuel. Attention, ça ne veut PAS dire que le pliage
est inutile — poser un ruban long et fin sur une sortie 1920×1080 en découpant le signal
en bandes est la configuration canonique d'un Novastar. Chez Piraths, 4 côtés de 1600 px
donnent 4 bandes, canvas 1920×640.

Le SPIKE-003 matériel n'a pas avancé (matériel non commandé), mais il est **remplacé par
la mire** (`npm run led:mire`) : une grille diffusée sur le ruban d'un club installé +
une photo suffisent à lire le contrat d'entrée réel du processeur, sans rien acheter.

## Quand ce garde-fou doit être révisé

Le smoke `smoke-led-canvas-invariant.test.ts` a déjà été révisé une fois (ADR-138,
unification de la géométrie). Il vérifie désormais deux invariants :

1. le canvas est une fonction pure du terrain ;
2. le chemin de déploiement reste indépendant du pliage.

Il doit être revu sciemment, dans la même PR, le jour où on câble réellement l'étape D
après validation matérielle (la mire, cf. `npm run led:mire`).

## Référence

- Smoke : `central-server/src/__tests__/smoke/smoke-led-canvas-invariant.test.ts`
- Maquette du parcours cible : `docs/proposals/assets/led-mockups/03-parcours-simplifie-ecrans-led.html`
