# ADR-066: Rename `Video` → `PiConfigVideoEntry` dans l'app Raspberry

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

L'app Angular Raspberry (`raspberry/src/`) exportait une `interface Video` dans
`app/interfaces/video.interface.ts`. Ce `Video` représente une entrée locale
dans le fichier `configuration.json` du Pi (avec `path` filesystem, `video_id`
d'enrichissement runtime, etc.) — un concept fondamentalement différent du
`Video` canonique du dashboard (`central-dashboard/src/app/core/models/video.model.ts`)
et du `Video` backend (`central-server/src/types/index.ts`), qui modélisent tous
deux la row de la table DB `videos`.

Trois interfaces partageaient donc le même nom pour trois contrats distincts.
Pas de collision technique aujourd'hui (apps Angular séparées qui ne compilent
pas ensemble), mais dette de nommage qui compose avec la croissance de la
codebase et viole la discipline posée par ADR-064 côté dashboard.

## Décision

Renommer l'interface Pi en `PiConfigVideoEntry` (nommage explicite du concept :
entrée locale dans la config Pi). Ajouter une JSDoc en tête du fichier qui
documente la distinction avec le `Video` canonique. Ajouter un smoke guard
(`ADR-066`) qui interdit toute future `interface Video` dans `raspberry/src/app`.

## Alternatives rejetées

- **Garder `Video` + commentaire JSDoc** : zéro coût immédiat mais dette qui
  grossit avec la codebase. Friction d'onboarding (grep `Video` → 3 résultats
  avec 3 contrats). Viole la discipline ADR-064.
- **Fusionner avec le `Video` canonique** : impossible — ce sont deux concepts
  (row DB vs entrée config filesystem). Les merger forcerait des champs
  optionnels partout et affaiblirait le typage.

## Conséquences

- 9 fichiers touchés (1 interface + 8 consommateurs), ~40 occurrences renommées.
- Nommage cohérent à travers les 3 tiers (dashboard, backend, Pi) : un seul
  `Video` = row DB, tout autre concept a son propre nom.
- Smoke guard `ADR-066` empêche la régression.
- Aucun impact runtime, aucun changement de contrat API.

## Fichiers impactés

- `raspberry/src/app/interfaces/video.interface.ts` — rename + JSDoc.
- `raspberry/src/app/interfaces/category.interface.ts` — import + usage.
- `raspberry/src/app/interfaces/command.interface.ts` — import + usage.
- `raspberry/src/app/components/tv/tv.component.ts` — 4 usages.
- `raspberry/src/app/components/remote/remote.component.ts` — 11 usages.
- `raspberry/src/app/services/manual-video.service.ts` — 4 usages.
- `raspberry/src/app/services/analytics.service.ts` — 6 usages.
- `raspberry/src/app/services/analytics.service.spec.ts` — 7 usages.
- `raspberry/src/app/services/tv-sync.service.ts` — 2 usages.
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts` — nouveau
  describe `Raspberry PiConfigVideoEntry naming guard (ADR-066)`.
