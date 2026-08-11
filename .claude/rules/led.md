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

**L'étape D est câblée depuis ADR-139**, derrière un interrupteur par site sans défaut :
`displays[].led.canvas_in.serve_folded`. Allumé, `config-secondary-variants.ts` sert le
canvas plié à la place du fichier brut. Éteint, le comportement est strictement inchangé.
`canvas_in.mode` ne pouvait PAS servir de bascule : il vaut `'B'` par défaut Joi sur tout
le parc sans que personne l'ait choisi.

**Piraths Strasbourg ATH diffuse en plié depuis le 2026-08-11** (vérifié en DB prod le
2026-08-11) : `serve_folded: true`, les deux défauts de config signalés par ADR-139 sont
corrigés (`band_width` 1920 → **1600** = un côté ; un seul display `led-perimeter`, le
doublon en mode A a disparu), `band_count` figé (4) = dérivé (4). Le canvas réellement
servi mesure **1600×480** (ffprobe sur l'`output_url`), soit exactement la cible relevée
sur B2B Alive. 37 vidéos sur 37 ont leur canvas plié `ready` pour l'empreinte courante.
**Lanester reste éteint** — cf. plus bas, son `band_count` figé diverge du dérivé.

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
- **Faire échouer un déploiement à cause du pliage.** Cache manquant, DB injoignable, profil
  illisible → on sert le fichier brut, on `logger.warn`, on met la fabrication en file. Le
  pliage dégrade, il ne casse jamais la diffusion.
- **Appeler `applyPerSideFold` (ffmpeg) depuis `config-secondary-variants.ts`** — le chemin de
  config _consomme_ le canvas via le cache, il ne le fabrique pas. Encoder dans une requête de
  déploiement la bloquerait plusieurs secondes à plusieurs minutes.
- **Retirer un champ de `computeFoldedCanvasHash`** (côtés, pitch, hauteur, largeur de bande,
  ordre, source, cadrage). L'empreinte EST le mécanisme d'invalidation : un canvas dont la clé
  a changé devient inatteignable. Retirer `height`, par exemple, ferait servir un canvas
  fabriqué pour l'ancienne hauteur de ruban.
- **Retirer `if (!v.storage_path && !v.filename) continue;`** de
  `config-secondary-variants.ts` — une variante « par côté pure » n'a ni `storage_path`
  ni `filename` ; l'injecter produit un chemin `videos-led-perimeter/null` → MP4 noir.
- **Composer un canvas (`applyPerSideFold` / `computeFoldGeometryPerSide`) ailleurs que dans
  `led-export-worker.service.ts`** et les scripts CLI/POC. La fabrication a un seul endroit.
- **Retirer le verrou consultatif (`pg_try_advisory_xact_lock`) ou le comptage des jobs
  `processing` de `ledExportJobRepository.claimNextQueued()`**, ni relever
  `LED_EXPORT_MAX_CONCURRENCY` sans mesure. Un pliage ouvre **un décodeur ffmpeg par côté**
  du ruban (4 chez Piraths) : quelques jobs concurrents suffisent à faire échouer les
  décodeurs sur un conteneur Railway — « Error while opening decoder : Resource temporarily
  unavailable », **24 pliages perdus sur 52 le 2026-08-11**. `FOR UPDATE SKIP LOCKED` ne
  protège que du double-claim d'un **même** job, pas de deux jobs différents en parallèle ;
  et la garde `let ticking = false` du worker ne vit que dans **un** process, donc elle ne
  survit pas à un scale-up de replicas. **Le seul plafond qui traverse les processus est
  celui en DB.**
- **Repasser à un `-i` par côté dans `buildPerSideFoldComposeArgs`** (déduplication des
  chemins identiques), ou retirer le `split` des sources de `buildPerSideFoldFilterGraph`.
  Les côtés diffusent presque toujours le même fichier : un `-i` par côté = **un décodeur
  h264 par côté pour une seule vidéo** (4 chez Piraths). C'est le décodeur, pas le CPU, qui
  a lâché le 2026-08-11. Le `split` redistribue le flux décodé une fois — vérifié
  **pixel pour pixel** (framemd5 identique sur toutes les frames) contre le chemin à
  4 décodeurs.
- **Retirer `touchProcessing()` ou son `setInterval` dans le worker.** Le seuil d'orphelin
  (`LED_EXPORT_STALE_PROCESSING_MIN`, 15 min) est réévalué à chaque claim : sans battement
  de cœur, un pliage plus long que le seuil serait remis en file et relancé par un autre
  worker **pendant** qu'il tourne — la concurrence ffmpeg reviendrait par la porte de
  derrière, et le garde-fou fabriquerait le bug qu'il prévient.
- **Remplacer `pg_try_advisory_xact_lock` par `pg_advisory_lock` (verrou de session).**
  Derrière PgBouncer en mode transaction (`DATABASE_URL` sur `:6543`), une session Node ne
  garde pas la même connexion serveur d'une requête à l'autre : le verrou serait pris sur
  un backend et relâché sur un autre — inopérant **en silence**.

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

**Piraths est activé** (`serve_folded: true`, config 1600 × 120 par côté — cf. en-tête).
**Lanester reste non observé** : son `band_count` figé à 1 diverge du dérivé (2), ne pas
l'activer sans une observation équivalente à celle de Piraths.

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
- Concurrence du pliage : `central-server/src/repositories/led-export-job.repository.test.ts`
  (comportement) + `smoke-led-export-async.test.ts` (garde-fou fichier)
- Tests étape D : `central-server/src/utils/__tests__/config-secondary-variants-folded.test.ts`
- Maquette du parcours cible : `docs/proposals/assets/led-mockups/03-parcours-simplifie-ecrans-led.html`
