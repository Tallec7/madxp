# ADR-140 — Détourer les marges d'une vidéo LED, sur validation humaine

**Statut** : Accepté
**Date** : Août 2026
**Contexte** : [PROP-015](../proposals/PROP-015-led-autocrop-on-validation.md), ADR-134 (rendre directement plié), ADR-138 (le canvas se dérive du terrain seul), ADR-139 (`serve_folded`)

## Contexte

`STRASOL_2025_08_1600x120px.mp4` fait **4096 × 1416** (mesuré par ffprobe le
2026-08-11, sur le fichier réellement en production). Son nom annonce un ruban et
il n'a pas tort sur le fond : le bandeau utile mesure **4096 × 306**, ratio 13,4:1,
celui d'un côté de Piraths. Mais il est posé au centre d'un grand cadre, avec 554 px
de noir au-dessus et 556 en dessous.

Le pliage prend le fichier ENTIER. Mesuré sur ce fichier, avant/après :

|                                      | contenu utile dans une bande 1600 × 120       |
| ------------------------------------ | --------------------------------------------- |
| fichier entier (comportement actuel) | **346 × 24 px** — un trait perdu dans du noir |
| avec le rectangle détouré            | **1600 × 120 px** — la bande est pleine       |

Ce n'est pas un cas isolé : c'est ce que produit un export « propre » depuis un
outil de montage réglé sur un format standard.

## Décision

`cropdetect` mesure les marges et le système **propose**. Un humain valide, et
c'est cette validation — persistée dans `video_variants.crop` — qui détoure.

### Pourquoi ça ne peut PAS être automatique

C'est le cœur de la décision, pas une précaution :

- **Un visuel volontairement sur fond noir est indistinguable d'un export mal
  cadré.** Un sponsor dont la charte est noire se ferait rogner jusqu'à son logo,
  sans que personne ne l'ait demandé.
- **Le résultat dépend de l'image analysée.** Un fondu au noir donnerait un
  rectangle différent d'une autre frame — donc un canvas qui change sans que rien
  n'ait changé, ce qu'ADR-138 interdit.
- **ADR-139 a déjà tranché ce type d'arbitrage** avec `serve_folded` : ce qui
  modifie ce qu'un processeur reçoit ne s'active pas tout seul.

La séparation est structurelle, pas conventionnelle : `POST …/crop/detect` n'a
aucun accès en écriture (le service `led-autocrop` ne connaît même pas les
repositories), et `PUT …/crop` est le seul appelant de `updateCrop`.

### Mesurer sur plusieurs frames, et prendre l'UNION

Cinq instants répartis dans la vidéo, et l'on retient **le plus petit rectangle qui
contient le contenu de toutes les frames**.

L'intersection aurait semblé plus « précise » ; elle est exactement le piège. Sur
un fondu au noir, la frame la plus sombre dicterait le rectangle et couperait tout
le contenu des autres. L'union sous-détoure au pire — l'erreur acceptable : mieux
vaut laisser un peu de noir que rogner un logo.

Corollaire sur l'arrondi : les valeurs sont alignées au pair (contrainte chroma
4:2:0) **vers l'extérieur**, pour que l'arrondi ne devienne pas une façon détournée
de couper du contenu.

### Le `crop` entre dans l'empreinte du canvas plié

`computeFoldedCanvasHash` inclut désormais le rectangle. Sans cela, les canvas
fabriqués AVANT la validation — pliés sur le fichier entier — resteraient servis
**indéfiniment** : le cache n'a pas de TTL, c'est l'empreinte qui fait toute
l'invalidation (ADR-139). L'opérateur aurait validé un détourage sans effet visible
sur le ruban.

### Ne rien proposer là où il n'y a rien à proposer

Deux refus explicites, formulés en clair pour l'opérateur :

- **plein cadre** (moins de 2 % de marge) : un 16:9 de faits de jeu — carton jaune,
  temps mort — n'a pas de marge à retirer ;
- **détourer n'approche pas du ruban** (écart de ratio > 1,15, même tolérance que
  `led-content-fit`) : un 16:9 légèrement letterboxé reste un 16:9.

Dans les deux cas, la bonne réponse est le bouton **« Retirer »** de la vue Canvas.
Proposer un détourage y laisserait croire à une solution — pire que ne rien dire.

## Conséquences

**Ce qui change en production au merge : rien.** `crop` est NULL sur toutes les
variantes existantes, et rien ne l'écrit sans un clic. Comme `serve_folded`, la
colonne est posée, l'UI existe, le chemin est testé.

**Demander un export sans marges reste la première réponse** — c'est gratuit et ça
règle le problème pour toutes les livraisons suivantes de cette agence. Le
détourage sert quand le fichier est le seul disponible, un soir de match. La phrase
rendue à l'opérateur le dit.

**Le détourage porte sur la variante, donc sur la source uniforme.** Un côté servi
par son propre fichier (`side_files`, ADR-135) n'est pas concerné en v1.

**L'ordre des filtres ffmpeg est l'invariant à ne pas casser** : `crop` AVANT
`scale`. Détourer après aurait déjà écrasé le bandeau utile.

## Alternatives écartées

**Détourer automatiquement à l'upload.** C'est la tentation évidente et elle rogne
le premier sponsor à charte noire, sans trace.

**Ne rien faire et exiger un ré-export.** Correct sur le fond, inapplicable un soir
de match quand l'agence ne répond pas.

**Un TTL sur le cache de canvas plutôt que le `crop` dans l'empreinte.** Réintroduit
une fenêtre pendant laquelle un canvas périmé est servi, et une logique
d'expiration à maintenir — donc à oublier.

## Références

- Détection : `central-server/src/services/led-autocrop.service.ts`
- Empreinte : `central-server/src/services/led-fold.service.ts` (`computeFoldedCanvasHash`)
- Application : `central-server/src/services/led-fold.service.ts` (`buildPerSideFoldFilterGraph`) + `led-export-worker.service.ts`
- Migration : `central-server/src/scripts/migrations/add-video-variant-crop.sql`
- UI : `central-dashboard/.../led-canvas-overview/`
- Garde-fou : `central-server/src/__tests__/smoke/smoke-led-autocrop.test.ts`
