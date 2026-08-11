# ADR-139 — Servir le canvas plié, derrière un interrupteur par site

**Statut** : Accepté
**Date** : Août 2026
**Contexte** : ADR-134 (rendre directement plié), ADR-135 (zones par côté, « étape D »), ADR-138 (le canvas se dérive du terrain seul)

## Contexte

Le pliage LED existait depuis ADR-134 mais ne servait qu'à deux choses : le bouton
« Exporter le MP4 plié » et le banc d'essai. La diffusion, elle, injectait toujours
le `storage_path` brut de la variante. ADR-135 appelait ce câblage « étape D » et le
laissait explicitement à faire — pas par oubli, mais parce que **le contrat d'entrée
réel des processeurs n'avait jamais été observé**.

Deux verrous ont sauté depuis :

- **ADR-138** a unifié la géométrie. Le canvas est désormais une fonction pure du
  terrain, identique quel que soit le contenu. Avant, câbler D aurait figé dans la
  diffusion une géométrie qui changeait selon la vidéo — 7 bandes un soir, 8 le
  lendemain, sur le même club.
- **La mire** (`npm run led:mire`) donne enfin un moyen de lire le contrat réel d'un
  processeur installé, sans commander de matériel : une grille numérotée sur le ruban,
  une photo, et on sait si le processeur attend un signal plié ou déplié.

## Décision

Câbler l'étape D, **derrière un interrupteur par site éteint par défaut** :
`displays[].led.canvas_in.serve_folded`.

Quand il est allumé, `enrichConfigWithDisplayVariants` remplace le chemin de la
variante `led-perimeter` par celui du canvas plié fabriqué pour ce site. Quand il est
éteint — c'est-à-dire partout aujourd'hui — le comportement est strictement inchangé.

### Pourquoi un nouveau champ plutôt que `canvas_in.mode`

`mode` ('A' = le processeur mappe, 'B' = le player pré-plie) décrivait déjà
l'intention. Il ne pouvait pas servir de bascule : **il vaut `'B'` par défaut Joi sur
tout le parc, sans que personne l'ait choisi**. S'appuyer dessus aurait allumé le
pliage chez les deux clubs LED en production le jour du déploiement, sans geste
humain. `serve_folded` n'a délibérément **aucun défaut Joi** : il ne peut pas
s'allumer tout seul.

### Le cache est clé par géométrie

Chaque canvas est stocké avec un `geometry_hash` couvrant côtés + pitch + hauteur +
largeur de bande + ordre + source + cadrage. C'est **tout** le mécanisme
d'invalidation : changer la hauteur d'un ruban rend inatteignables tous les canvas
fabriqués pour l'ancienne. Pas de TTL, pas de purge à écrire, pas de fenêtre pendant
laquelle un canvas périmé serait servi.

### Un cache manquant dégrade, il ne casse pas

Si le canvas n'existe pas encore, on sert le fichier brut et on met la fabrication en
file. Le prochain déploiement servira le plié. Idem si la DB tousse ou si le profil
est illisible : le déploiement passe, avec un `logger.warn`. **Le pliage ne doit
jamais être une raison pour qu'un club ne diffuse pas.**

La fabrication reste au worker d'export. Le chemin de config _consomme_ le canvas
(lecture de cache + mise en file) ; il ne lance jamais ffmpeg — cela bloquerait une
requête HTTP sur un encodage.

## Conséquences

**Ce qui change en production au merge : rien.** Les deux sites LED (Saas Lanester HB,
Piraths Strasbourg ATH) n'ont pas `serve_folded`. Le champ est posé, l'UI existe
(« Avancé (processeur) »), le chemin est testé — l'activation reste un geste par club.

**Observation terrain (Piraths Strasbourg ATH, 2026-08-11) — le club est en mode B.**

Une première photo du ruban montrait le contenu affiché proprement sur un panneau, ce
qui a été lu à tort comme « le processeur mappe lui-même » (mode A). C'était une
sur-lecture : un côté lisible est compatible avec les deux modes. Trois faits corrigent
cette lecture :

- **Cinq versions pliées à la main** existent en DB (`2-SIEHR-PLIE-1600x480`,
  `3-SIEHR-PLIE-1920x480`, `5-SIEHR-PLIE-100cm-1600x640`). On ne plie pas à la main un
  signal que le processeur déplie tout seul.
- **Le contenu n'apparaît que sur 1 des 4 panneaux.** La config sert le fichier brut
  1600×120 (aucune variante `led-perimeter` sur les 5 fichiers SIEHR) : envoyé à un
  processeur qui attend un canvas 4 bandes, il ne remplit qu'une bande.
- **Le nom du fichier #5 encode la géométrie dérivée du terrain** : côté = 10 m ÷ 6,25 mm
  = 1600 px, dalle = 100 cm ÷ 6,25 mm = 160 px, canvas plié = 4 × 160 = **1600×640**.

Piraths est donc le club où `serve_folded` doit être **activé** — c'est précisément le
travail manuel de pliage/ré-upload que l'étape D supprime.

**Deux défauts de config à corriger d'abord** (sans quoi activer décalerait l'image) :

- `canvas_in.band_width` vaut **1920 alors qu'un côté fait 1600 px**. À 1920, chaque
  bande traîne 320 px de padding et tout se décale face à un processeur gravé pour 1600.
- Le site porte **deux écrans `led-perimeter`** (index 0 en `mode: 'A'` avec
  `band_count: 4`, index 2 en `mode: 'B'` sans) — deux vérités contradictoires sur le
  même club.

**Vérification à coût nul avant tout code** : mettre `5-SIEHR-PLIE-100cm-1600x640.mp4`
dans la config à la place du fichier brut. S'il s'affiche sur les 4 panneaux, le mode B
et la géométrie 1600×640 sont confirmés définitivement.

**Le contrat d'entrée est connu (2026-08-11), sans mire.** Un player concurrent —
**B2B Alive** — tourne sur le matériel de Piraths et affiche correctement. C'est une
preuve plus forte qu'une mire : ce n'est pas une grille à interpréter, c'est le
résultat attendu, produit par un tiers, sur le même processeur. Cible relevée :
canvas **1600 × 480** (4 bandes de 120 px, soit 75 cm de dalle à P6.25 — et non 160),
signal rendu **1:1 ancré en haut à gauche**, le reste en noir.

Ce dernier point était invisible dans le modèle : notre player appliquait
`object-fit: contain`, qui met à l'échelle et centre. Un processeur découpant une
région fixe en pixels ne recevait donc rien d'exploitable, alors que la vidéo
paraissait parfaite dans le navigateur — un seul panneau s'allumait sur quatre.
Corrigé par la classe `tv--pixel-exact` (PR #1144).

La question résiduelle n'est plus matérielle : elle est de savoir si notre pipeline
produit le même canvas que B2B, ce qui se compare entre deux navigateurs.

**L'activation reste un geste par club.**

**Le garde-fou change de nature.** `smoke-led-canvas-invariant` interdisait au chemin
de déploiement d'importer le moteur de pliage — cette assertion devient fausse par
construction. Elle est remplacée par celle qui protège réellement la production : le
pliage est inatteignable sans `serve_folded === true`, et ce champ n'a pas de défaut.

## Alternatives écartées

**Allumer pour tout le monde et corriger au retour terrain.** Le retour terrain d'un
ruban noir, c'est un soir de match perdu chez un client.

**Attendre le SPIKE matériel.** Il est bloqué depuis des mois (matériel non commandé)
et la mire le remplace à coût nul.

**Plier à la volée dans le chemin de config.** Un encodage ffmpeg dans une requête de
déploiement — quelques secondes à quelques minutes selon la vidéo — sur un chemin
appelé à chaque config servie.

## Références

- Implémentation : `central-server/src/utils/config-secondary-variants.ts` (`substituteFoldedCanvas`)
- Empreinte : `central-server/src/services/led-fold.service.ts` (`computeFoldedCanvasHash`)
- Migration : `central-server/src/scripts/migrations/add-led-export-geometry-hash.sql`
- Tests : `central-server/src/utils/__tests__/config-secondary-variants-folded.test.ts`
- Garde-fou : `central-server/src/__tests__/smoke/smoke-led-canvas-invariant.test.ts`
- Diagnostic terrain : `npm run led:mire`
