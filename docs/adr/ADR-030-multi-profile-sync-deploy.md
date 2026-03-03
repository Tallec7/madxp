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

## Sélection de profil côté Pi (v3.92.2)

### Flux de sélection

Quand le staff sélectionne un profil depuis la télécommande (club-selector) :

```
Remote Angular (club-selector)
  │  socket.emit('profile-switch', { profileId })
  ▼
handlers.js (Pi server)
  ├── 1. Écrire le marqueur active-profile dans profiles/
  ├── 2. Lire profiles/{profileId}.json
  ├── 3. Fusionner LOCAL_ONLY_SETTINGS depuis configuration.json
  ├── 4. Écrire la config fusionnée dans configuration.json
  └── 5. io.emit('action', { type: 'reload-config', data: mergedConfig })
           │
           ▼
        TV Angular → recharge la configuration
```

### LOCAL_ONLY_SETTINGS préservés

Ces clés sont copiées de l'ancien `configuration.json` vers la nouvelle config de profil :

- `settings` — paramètres locaux du Pi (volume, langue, etc.)
- `siteId`, `siteName`, `clubName` — identité du site
- `apiKey` — clé d'authentification vers le central
- `hotspot`, `localNetwork` — configuration réseau locale
- `localSponsors` — sponsors ajoutés localement par le club

### Bug critique corrigé (v3.92.2)

Le handler `profile-switch` broadcastait la config brute du profil **sans** :

- Fusionner les LOCAL_ONLY_SETTINGS → perte du `siteId`, `apiKey`, etc.
- Écrire dans `configuration.json` → tout `config_updated` ultérieur écrasait la sélection

**Smoke test** : vérifie que le handler contient `writeFileSync(configPath)`, `LOCAL_ONLY_SETTINGS`, et `mergedConfig`.

## UX télécommande multi-profil (v3.96.2)

### Bug 1 : Cartes time category invisibles

Quand un profil était chargé, les cartes Avant-match/Match/Après-match apparaissaient sans gradient (texte blanc sur fond transparent). Cause : `[ngClass]="timeCategory.color"` s'appuyait sur les valeurs `color` du config JSON qui ne correspondaient pas aux classes SCSS définies (`.from-blue-500`, etc.).

**Fix** : Méthode `getTimeCategoryGradientClass(timeCategory)` avec fallback par `id` :

- `before` → `from-blue-500 to-blue-600`
- `during` → `from-green-500 to-green-600`
- `after` → `from-purple-500 to-purple-600`

### Bug 2 : Impossible de changer de profil

Le seul moyen de revenir au club-selector était un bouton retour conditionnel. Aucune alternative dans le menu.

**Fix** : Ajout d'un item "Changer de profil" dans le menu trois-points du header, avec affichage du nom du profil actif dans le sous-titre.

### Smoke tests de régression (4 tests)

- `getTimeCategoryGradientClass` doit exister avec fallback before/during/after
- Template doit utiliser `getTimeCategoryGradientClass()`, pas `timeCategory.color` brut
- Template doit contenir "Changer de profil" avec `backToClubSelector()`
- `currentProfileName` doit être assigné lors de la sélection de profil

## Fichiers impactés

- `central-server/src/controllers/config-profiles.controller.ts` — deployProfile envoie aussi sync_profiles
- `raspberry/server/socket/handlers.js` — handler profile-switch avec merge + persistance configuration.json
- `raspberry/config/nginx-captive-portal.conf` — location = et location /profiles/ ajoutés
- `raspberry/config/nginx/neopro-hls.conf` — idem
- `raspberry/src/app/app.routes.ts` — catchError + fallback sur le resolver
- `raspberry/src/app/services/profile-config.service.ts` — résilience resetCache + loadProfile
- `raspberry/src/app/components/remote/remote.component.html` — bouton retour multi-profil + menu "Changer de profil" + affichage nom profil
- `raspberry/src/app/components/remote/remote.component.ts` — suppression double reload-config + `getTimeCategoryGradientClass()` + `currentProfileName`
- `central-dashboard/src/app/features/sites/components/site-profiles-tab/site-profiles-tab.component.ts` — UX Pi offline + badge actif
