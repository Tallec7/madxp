# ADR-030: Deploy profile déclenche automatiquement sync_profiles

**Date** : 2026-02-24
**Statut** : Accepté
**Format** : Léger

---

## Contexte

La feature multi-profils (E-04) avait un bug critique en production : le deploy d'un profil via `deployProfile()` ne créait jamais le dossier `profiles/` sur le Pi. Seule l'action manuelle "Sync" (endpoint séparé) le faisait. Or les admins cliquent naturellement sur "Deploy", pas "Sync". Résultat : le club-selector ne s'affichait jamais sur la remote du Pi.

Deuxième problème : Nginx cachait tous les `.json` 30 jours (regex `~*` gagne sur prefix match), rendant les profils invisibles même après sync.

## Décision

1. **Deploy = deploy + sync** : `deployProfile()` envoie `triggerPendingConfigSync` (configuration active) **puis** `sync_profiles` (tous les profils) quand le site a >1 profil. Le Pi reçoit ainsi toujours le dossier `profiles/`.
2. **Nginx exact match** : `location = /configuration.json` et `location /profiles/` avec `no-cache` placés **avant** la regex `~* \.(json)$` pour court-circuiter le cache 30 jours.
3. **Fallback résilient** : Le resolver Angular a un `catchError` qui clear la sélection localStorage et fallback sur `/configuration.json` si le profil n'existe plus.

## Alternatives rejetées

- **Forcer l'admin à cliquer Sync après Deploy** : rejeté car UX confuse et source d'erreurs récurrentes
- **Fusionner deploy et sync en un seul endpoint** : rejeté car le deploy sans profils (site mono-config) ne doit pas envoyer de sync_profiles inutile

## Conséquences

- Le déploiement d'un profil est atomique du point de vue de l'admin (1 clic = config + profils)
- Légère augmentation du payload réseau (sync_profiles envoie tous les profils à chaque deploy)
- Les fichiers JSON dynamiques sur le Pi ne sont plus cachés par Nginx

## Fichiers impactés

- `central-server/src/controllers/config-profiles.controller.ts` — deployProfile envoie aussi sync_profiles
- `raspberry/config/nginx-captive-portal.conf` — location = et location /profiles/ ajoutés
- `raspberry/config/nginx/neopro-hls.conf` — idem
- `raspberry/src/app/app.routes.ts` — catchError + fallback sur le resolver
- `raspberry/src/app/services/profile-config.service.ts` — résilience resetCache + loadProfile
- `raspberry/src/app/components/remote/remote.component.html` — bouton retour multi-profil
- `raspberry/src/app/components/remote/remote.component.ts` — suppression double reload-config
- `central-dashboard/src/app/features/sites/components/site-profiles-tab/site-profiles-tab.component.ts` — UX Pi offline + badge actif
