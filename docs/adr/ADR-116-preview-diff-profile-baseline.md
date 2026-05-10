# ADR-116: Baseline du diff `previewConfigDiff` = profil édité, pas mirror Pi

**Date** : 2026-05-10
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Sur les sites multi-profils (ex : NLF avec NLF Handball + Lanester), la modal "Aperçu des changements" comparait la config du profil édité contre `local_config_mirror` — c'est-à-dire l'état actuel du `configuration.json` du Pi, qui reflète le profil **actif en TV** et non le profil **édité dans le dashboard**. Résultat : modifier 1 vidéo dans le profil non-actif générait 25 changements au lieu de 1 (diff entre les deux profils entiers).

Cause connexe (issue #961) : `applyProfile()` dans le sync-agent appelait `mergeConfigurations()` qui préservait les catégories de l'ancien profil lors d'un switch, accumulant 4+3=7 catégories dans `configuration.json` et amplifiant le bug diff.

## Décision

1. **Backend** : `previewConfigDiff` accepte un `profileId` optionnel dans le body. Quand fourni, la baseline est lue depuis `config_profiles[profileId].configuration` (après vérification `site_id === id`). Le fallback `local_config_mirror → history` reste pour les sites sans profils.
2. **Frontend** : `deployment-status.component.ts` passe `selectedProfileId` à `previewConfigDiff` via la chaîne `sites.service.ts → config-editor-data.service.ts`.
3. **Pi (sync-agent)** : `applyProfile()` dans `sync-profiles.js` zeroise `categories`, `sponsors` et `timeCategories` du localConfig avant d'appeler `mergeConfigurations()`, évitant l'accumulation inter-profils. Livré via OTA.

## Alternatives rejetées

- **Toujours utiliser le profil par défaut comme baseline** : rejeté car ne résout pas le cas où on édite le profil non-default pendant que le default est actif.
- **Corriger uniquement le Pi (sync-profiles.js)** : rejeté car le fix Pi n'arrive qu'après OTA — le fix backend/Angular est immédiat et correct indépendamment de l'état du Pi.
- **Recalculer le diff depuis config_history** : rejeté car config_history peut être absent sur des nouveaux sites.

## Conséquences

- La modal diff affiche les vraies modifs de l'utilisateur sur un profil, même si ce profil n'est pas actif sur le Pi.
- Le switch de profil via `sync_profiles` n'accumule plus les catégories entre profils (fix piloté via OTA).
- Smoke test `smoke-preview-diff-baseline-respects-profile.test.ts` verrouille le comportement.

## Fichiers impactés

- `central-server/src/controllers/config-history.controller.ts` — branche `profileId` avant fallback mirror
- `central-server/src/middleware/validation.ts` — `profileId: Joi.string().uuid().optional()` dans `previewConfigRestore`
- `central-dashboard/src/app/core/services/sites.service.ts` — signature `previewConfigDiff(id, config, profileId?)`
- `central-dashboard/src/app/features/sites/config-editor/config-editor-data.service.ts` — propagation `profileId`
- `central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts` — passe `selectedProfileId`
- `raspberry/sync-agent/src/commands/sync-profiles.js` — zeroing des champs managed avant `mergeConfigurations`
- `central-server/src/__tests__/smoke/smoke-preview-diff-baseline-respects-profile.test.ts` — nouveau smoke test
