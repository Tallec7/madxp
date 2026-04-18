# ADR-065: Suppression du mapper `mapVideoRowToView` (dead code)

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-064 a introduit la hiérarchie canonique `Video` (snake_case, miroir DB) +
`VideoView` (camelCase UI) + `mapVideoRowToView()` dans
`central-dashboard/src/app/core/models/video.model.ts`, avec l'idée qu'un
mapper unique convertirait les rows DB brutes en vue UI.

Audit Phase 3a (2026-04-18) : le mapper n'a **zéro consommateur** runtime.
Tous les endpoints du backend exposent des DTOs déjà camelCase (`CloudVideo`,
objets `VideoItem`-shape, `ContentVideoRow` au format mixte propre à son
endpoint). Aucune row `Video` snake_case n'arrive dans le frontend.

## Décision

Supprimer `mapVideoRowToView()` et son re-export. Conserver les interfaces
`Video` (verrou de namespace + alignement type-level avec le backend) et
`VideoView` (utilisée par `VideoItem extends VideoView`).

Si un futur endpoint renvoie une row snake_case brute, écrire un mapper
dédié au point de consommation — pas de mapper universel en amont.

## Alternatives rejetées

- **Garder le mapper "au cas où"** : dead code = dette. Le smoke guard force
  sa présence sans que rien ne force sa correction si les interfaces dérivent.
- **Supprimer aussi `Video` (snake_case)** : rejeté — l'interface sert de
  verrou de nommage (smoke test interdit toute autre `interface Video`) et
  de contrat type-level avec `central-server/src/types/index.ts`.

## Conséquences

- Moins de surface API (pas de fonction publique inutilisée).
- Convention clarifiée : le backend contractualise du camelCase pour le
  dashboard ; les mappings snake_case → camelCase restent locaux si besoin.
- Risque faible : si un nouvel endpoint renvoie du snake_case brut, il
  faudra ajouter un mapper dédié (pattern déjà implicite dans les services
  data actuels).

## Fichiers impactés

- `central-dashboard/src/app/core/models/video.model.ts` — suppression de
  `mapVideoRowToView`, doc mise à jour.
- `central-dashboard/src/app/core/models/index.ts` — suppression du re-export.
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts` —
  guards ADR-064 mis à jour pour vérifier l'**absence** du mapper.
