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

**Ce qui change en production aujourd'hui : rien.** Les deux sites LED (Saas Lanester
HB, Piraths Strasbourg ATH) n'ont pas `serve_folded`. Le champ est posé, l'UI existe
(« Avancé (processeur) »), le chemin est testé — mais il reste à activer club par club.

**Première observation terrain (Piraths Strasbourg ATH, 2026-08-11)** — photo du ruban
en fonctionnement, alimenté par le chemin actuel (fichier brut, `serve_folded` éteint) :
le contenu s'affiche en **une ligne continue, lisible, aux bonnes proportions**. Aucune
bande empilée, aucune découpe. Le processeur fait donc lui-même le mapping depuis le
signal standard qu'il reçoit — c'est le **mode A**. Conclusion opérationnelle : **ne pas
activer `serve_folded` à Piraths**. Lui envoyer un canvas empilé produirait exactement le
ruban illisible que cet interrupteur existe pour éviter. Réserves : un seul côté était
dans le champ, et le cadrage de la photo empêche de dire si le texte est tronqué par
l'écran ou par l'objectif — la mire reste utile pour la couverture des 4 côtés.

**L'activation est un geste terrain, pas une décision de bureau.** Le préalable reste
la mire sur le club concerné. Le cas de Lanester le montre : son `canvas_in.band_count`
est figé à 1 par un installateur alors que le dérivé par côté vaut 2. Allumer
`serve_folded` sans re-confirmer doublerait la hauteur du signal (110 → 220 px) face à
un processeur gravé pour 110.

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
