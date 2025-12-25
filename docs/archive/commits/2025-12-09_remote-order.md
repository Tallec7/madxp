# Ordre alphabétique pour /remote

**Date:** 2025-12-09

## Résumé

- Les listes affichées sur `/remote` (catégories, sous-catégories, vidéos) utilisent maintenant un tri alphabétique/numeric pour offrir un ordre prévisible lorsqu'on navigue dans la télécommande.

## Modifications

### RemoteComponent (RASPBERRY frontend)

- Ajout d'un helper `sortByName` pour trier les structures selon leur `name`.
- Les catégories par bloc `timeCategory`, les sous-catégories et les vidéos sont triées avant d'être affichées dans l'interface.
- Le comportement de navigation ne change pas : l'ordre d'affichage est le seul impact.

## Fichiers modifiés

- `raspberry/frontend/app/components/remote/remote.component.ts`
- `raspberry/frontend/app/components/remote/remote.component.html`
