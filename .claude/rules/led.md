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

**L'étape D est câblée depuis ADR-139**, mais derrière un interrupteur par site éteint
par défaut : `displays[].led.canvas_in.serve_folded`. Allumé, `config-secondary-variants.ts`
sert le canvas plié à la place du fichier brut. Éteint, le comportement est strictement inchangé —
c'est le cas de **Saas Lanester HB**. **Piraths Strasbourg ATH l'a ALLUMÉ le
2026-08-11** : un club de production consomme donc le canvas plié, toute régression
sur ce chemin est visible en match. `canvas_in.mode` ne pouvait PAS servir de bascule :
il vaut `'B'` par défaut Joi sur tout le parc sans que personne l'ait choisi.

**Un `band_count` figé par un installateur qui ne correspond plus au dérivé est
SIGNALÉ (`confirmedIsStale` + `logger.warn`), jamais écrasé** : la valeur figée décrit
ce qui est gravé dans le processeur.

## NE JAMAIS FAIRE (smoke test enforced)

- **Retirer le guard `if (!led?.canvas_in?.serve_folded) return;` de `substituteFoldedCanvas`**
  (`utils/config-secondary-variants.ts`), ou donner un défaut Joi à `serve_folded`. C'est le
  seul rempart entre les deux clubs LED en production et un canvas que leur processeur
  n'attend peut-être pas — ruban noir un soir de match. **Saas Lanester HB** a
  `canvas_in.band_count = 1` figé par un installateur alors que le dérivé par côté vaut 2 :
  allumer sans re-confirmer doublerait la hauteur (110 → 220 px) face à un processeur gravé
  pour 110. L'activation se fait club par club, après la mire (`npm run led:mire`).
- **Exclure une vidéo aux dimensions inconnues du bouton « Créer les variantes LED
  manquantes »** (`ribbonExclusion`, `content-variant.controller.ts`). Un `null` de
  dimensions n'est pas un `false` : tant que `backfill:video-dimensions` n'a pas tourné
  sur le site, AUCUN critère de format n'est fiable — les noms de fichiers mentent dans
  les deux sens (`STRASOL_…_1600x120px.mp4` fait 4096×1416, `CALICEO.mp4` fait 1600×120
  sans l'annoncer). Mieux vaut déclarer une variante que l'opérateur retire d'un clic
  que la sauter en silence. Même principe que `matches_expected` dans la vue Canvas.
  Et toute exclusion doit remonter son motif dans `exclusions[]` : une exclusion muette
  se lit comme « tout a été traité ».
- **Faire échouer un déploiement à cause du pliage.** Cache manquant, DB injoignable, profil
  illisible → on sert le fichier brut, on `logger.warn`, on met la fabrication en file. Le
  pliage dégrade, il ne casse jamais la diffusion.
- **Appeler `applyPerSideFold` (ffmpeg) depuis `config-secondary-variants.ts`** — le chemin de
  config _consomme_ le canvas via le cache, il ne le fabrique pas. Encoder dans une requête de
  déploiement la bloquerait plusieurs secondes à plusieurs minutes.
- **Recalculer « un côté en px » à la main** au lieu de passer par `computeSiteCanvas()`.
  Un calcul refait ignore le plafond `MAX_LED_BAND_WIDTH` et un `band_width` figé par
  un installateur. C'est précisément ce que faisait `getLedCanvasOverview` : comme cette
  vue dit aux AGENCES quel format livrer, l'écart aurait fait produire des fichiers que
  le worker ne consomme pas, sur tout club dont un côté dépasse 1920 px.
- **Retirer un champ de `computeFoldedCanvasHash`** (côtés, pitch, hauteur, largeur de bande,
  ordre, source, cadrage). L'empreinte EST le mécanisme d'invalidation : un canvas dont la clé
  a changé devient inatteignable. Retirer `height`, par exemple, ferait servir un canvas
  fabriqué pour l'ancienne hauteur de ruban.
- **Retirer `if (!v.storage_path && !v.filename) continue;`** de
  `config-secondary-variants.ts` — une variante « par côté pure » n'a ni `storage_path`
  ni `filename` ; l'injecter produit un chemin `videos-led-perimeter/null` → MP4 noir.
- **Composer un canvas (`applyPerSideFold` / `computeFoldGeometryPerSide`) ailleurs que dans
  `led-export-worker.service.ts`** et les scripts CLI/POC. La fabrication a un seul endroit.

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
**Le contrat d'entrée des processeurs est CONNU depuis le 2026-08-11.** Pas par une
mire : par un player concurrent (**B2B Alive**) qui tourne sur le matériel de Piraths
et affiche correctement. Il donne la cible sans ambiguïté :

| Ce que le processeur attend | Valeur observée chez Piraths                      |
| --------------------------- | ------------------------------------------------- |
| Canvas plié                 | **1600 × 480** (4 bandes de 120)                  |
| Largeur d'entrée            | **1600** = un côté (10 m à P6.25)                 |
| Hauteur de dalle            | **120 px** = 75 cm, PAS 160                       |
| Placement du signal         | **1:1, ancré en haut à gauche**, le reste en noir |

C'est le mode **B** : le processeur ne déplie pas, il attend un canvas déjà plié. La
question n'est donc plus « qu'attend le matériel » mais « produit-on la même chose que
B2B » — ce qui se compare entre deux navigateurs, sans hardware.

**Piraths est ACTIVÉ** depuis le 2026-08-11 (`serve_folded: true`, hauteur 120,
largeur d'entrée 1600). **Lanester reste non observé** : son `band_count` figé à 1 diverge du dérivé (2),
ne pas l'activer sans une observation équivalente.

## Quand ce garde-fou doit être révisé

Le smoke `smoke-led-canvas-invariant.test.ts` a été révisé deux fois : ADR-138 (unification
de la géométrie) puis ADR-139 (câblage de l'étape D). Il vérifie désormais :

1. le canvas est une fonction pure du terrain ;
2. le canvas plié n'est atteignable que derrière `serve_folded`, qui n'a aucun défaut ;
3. un cache manquant dégrade au lieu de casser ;
4. la fabrication reste au worker.

La prochaine révision légitime sera le jour où `serve_folded` deviendra le comportement par
défaut — ce qui suppose que la mire ait été passée sur assez de clubs pour connaître le
contrat d'entrée réel des processeurs, pas seulement de le supposer.

## Référence

- [ADR-139](../../docs/adr/ADR-139-led-serve-folded-canvas.md) — étape D derrière `serve_folded`
- Smoke : `central-server/src/__tests__/smoke/smoke-led-canvas-invariant.test.ts`
- Tests étape D : `central-server/src/utils/__tests__/config-secondary-variants-folded.test.ts`
- Maquette du parcours cible : `docs/proposals/assets/led-mockups/03-parcours-simplifie-ecrans-led.html`
