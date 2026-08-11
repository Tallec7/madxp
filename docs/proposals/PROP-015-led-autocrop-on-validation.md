# PROP-015 — Détourage des marges avant pliage, sur validation

> **Statut** : Conçu, non implémenté
> **Origine** : session LED 2026-08-11, club Piraths Strasbourg ATH
> **Lié** : ADR-139 (canvas plié servi), `docs/specs/features/led-perimeter.spec.md`

## Le problème, en un exemple

`STRASOL_2025_08_1600x120px.mp4` fait **4096 × 1416**. Son nom annonce 1600 × 120, et
il n'a pas tort sur le fond : le bandeau utile a bien le ratio d'un ruban. Mais il est
posé au centre d'un grand cadre, avec des **marges noires** au-dessus et en dessous.

Le pliage prend le fichier entier. Ramené à 120 px de haut, le cadre complet passe de
4096 à ~347 px de large — et le bandeau utile, un cinquième de la hauteur, devient un
trait. Sur le ruban : un visuel minuscule perdu dans du noir.

Ce n'est pas un cas isolé : c'est ce que produit un export « propre » depuis un outil
de montage réglé sur un format standard.

## Pourquoi ça ne peut PAS être automatique

`ffmpeg` sait détecter des bandes uniformes (`cropdetect`). La tentation est de
détourer systématiquement. Elle est mauvaise :

- **Un visuel volontairement sur fond noir est indistinguable d'un export mal cadré.**
  Un sponsor dont la charte est noire se ferait rogner jusqu'à son logo.
- **Le résultat dépend de l'image analysée.** Une vidéo qui s'ouvre sur un fondu au
  noir donnerait un détourage différent d'une autre frame — donc un canvas qui change
  sans que rien n'ait changé, ce que l'invariant central interdit (ADR-138).
- **La règle `serve_folded` a déjà tranché ce type d'arbitrage** : ce qui modifie ce
  qu'un processeur reçoit ne s'active pas tout seul.

## Le design retenu : proposer, l'humain valide

Même pattern que `fit_recommendation` (le système propose un cadrage, l'opérateur
tranche) et que `serve_folded` (interrupteur explicite, aucun défaut).

1. **Détection** — à l'upload d'une variante `led-perimeter`, ou à la demande depuis
   la vue Canvas, `cropdetect` sur quelques frames réparties dans la vidéo (pas une
   seule : un fondu au noir fausserait tout). Retenir le rectangle le PLUS PETIT
   commun à toutes les frames analysées — mieux vaut sous-détourer que rogner du
   contenu.
2. **Proposition** — la vue Canvas affiche « marges détectées : 4096×1416 → 4096×285,
   soit un ratio 14,4:1 proche du ruban (13,3:1) » avec un aperçu avant/après.
3. **Validation** — l'opérateur accepte, et le rectangle est persisté sur la variante
   (`crop: { x, y, w, h }`). Aucun détourage n'est appliqué sans cet enregistrement.
4. **Pliage** — `applyPerSideFold` applique le `crop` avant la mise à l'échelle. Le
   `crop` entre dans `computeFoldedCanvasHash` : le canvas se refabrique tout seul,
   et l'ancien devient inatteignable.

## Ce que ça ne remplace pas

**Demander un export sans marges reste la bonne première réponse** — c'est gratuit et
ça règle le problème pour toutes les livraisons suivantes de cette agence. Le
détourage sert quand le fichier est le seul disponible, un soir de match.

## Point d'attention

Le `crop` ne doit PAS être proposé quand le ratio détouré s'éloigne du ruban : sur un
16:9 plein cadre (les faits de jeu), il n'y a pas de marge à retirer, et proposer un
détourage laisserait croire à une solution. Dans ce cas, la vraie réponse est de
**retirer la variante** — le bouton existe.
