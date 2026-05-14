# SPEC : Admin Pi Local (:8080) — Offline First

> Domaine #8 — Pi & Display (edge)  
> ADR source : ADR-001 (autonomie locale), ADR-074 (hotspot PSK), ADR-115 (auth offline)  
> Statut : Live

## En une phrase

L'admin panel Pi (`http://neopro.local:8080`) doit permettre à un opérateur de gérer le Pi localement — notamment switcher de profil multi-clubs — **sans aucune connexion internet**, en s'appuyant uniquement sur les fichiers synced lors de la dernière connexion cloud.

## Problème

Le panel admin local Pi (`http://neopro.local:8080`) est le **seul point de contrôle disponible quand le Pi est hors connexion**. Avec l'arrivée des multi-profils (v3.x), les opérateurs ne pouvaient plus switcher de profil sans internet — alors que les fichiers de profil sont stockés localement depuis le dernier sync.

## Périmètre

Ce que l'admin `:8080` **doit** pouvoir faire sans internet :

| Fonction                           | Implémenté   | Notes                                         |
| ---------------------------------- | ------------ | --------------------------------------------- |
| Voir les profils disponibles       | ✅ (v3.302+) | Lit `webapp/profiles/clubs.json`              |
| Switcher de profil                 | ✅ (v3.302+) | Écrit `active-profile` + `configuration.json` |
| Gérer catégories / time-categories | ✅           | Lit/écrit `configuration.json`                |
| Gérer les vidéos locales           | ✅           | Lecture/écriture filesystem                   |
| Gérer les sponsors locaux          | ✅           | Lit/écrit `configuration.json`                |
| Diagnostics réseau                 | ✅           | `ifconfig`, journalctl                        |
| Restart services / reboot          | ✅           | Via systemd                                   |
| Voir le statut de sync cloud       | ✅           | Lit `data/sync-history.json`                  |
| Voir les logs                      | ✅           | journalctl local                              |

Ce que l'admin `:8080` **ne fait pas** (intentionnellement) :

| Fonction                      | Pourquoi absent                                        |
| ----------------------------- | ------------------------------------------------------ |
| Télécommande (remote control) | Requiert le relay cloud WebSocket — par design         |
| Match sessions / scoreboard   | Feature cloud-only, sans impact offline                |
| Rotation PSK hotspot          | Cloud est source de vérité (ADR-074), lecture seule OK |
| Analytics / reporting         | Agrégation cloud-only                                  |
| Déploiement OTA flotte        | Fleet-wide, cloud orchestré                            |

## Multi-profils : comportement offline

### Architecture fichiers sur le Pi

```
webapp/
├── configuration.json          ← config active (source de vérité kiosk)
├── profiles/
│   ├── active-profile          ← fichier texte = ID du profil actif
│   ├── clubs.json              ← metadata [{id, name, city, sport}]
│   ├── {profileId}.json        ← config complète du profil (synced par cloud)
│   └── {profileId}.pin.json    ← metadata PIN (chmod 600, ADR-058)
```

### Switch de profil offline

1. Admin `:8080` reçoit `POST /api/profiles/:id/switch`
2. Vérifie que `profiles/{id}.json` existe (profil syncé depuis le cloud)
3. Lit la `configuration.json` courante → extrait les LOCAL_ONLY_SETTINGS
4. Lit `profiles/{id}.json` → contenu du nouveau profil
5. Fusionne : profil + LOCAL_ONLY_SETTINGS (les settings locaux ne sont jamais écrasés)
6. Écrit `configuration.json` (écriture atomique : `.tmp` + rename)
7. Écrit `profiles/active-profile` = `{id}`
8. Retourne `{ success: true, activeProfileId }`

**Invariants** du switch :

- `LOCAL_ONLY_SETTINGS` (`settings`, `siteId`, `siteName`, `clubName`, `apiKey`, `hotspot`, `localNetwork`, `localSponsors`, `featureOverrides`, `auth`) ne sont jamais écrasés par le contenu du profil cloud
- Le profil cloud est la source de vérité pour `categories`, `sponsors`, `timeCategories`
- `active-profile` reflète toujours le dernier profil switché (même offline)

### Gestion des conflits offline → resync cloud

Comportement actuel (cloud-wins) :

- Quand le Pi se reconnecte, le sync-agent reçoit `sync_profiles` du cloud
- Le `sync_profiles` réapplique le profil actif tel qu'il est en cloud
- **Les modifications locales de catégories/temps (via `:8080`) sont overridées**
- Ce comportement est intentionnel : le cloud est source de vérité du contenu

Implication pour l'opérateur :

- Les modifications de config via `:8080` sont **temporaires** — elles durent jusqu'au prochain sync cloud
- Un indicateur dans le sync-status module signale si la config locale diverge du dernier sync cloud

## Règles métier

1. **LOCAL_ONLY_KEYS** — `settings`, `siteId`, `siteName`, `clubName`, `apiKey`, `hotspot`, `localNetwork`, `localSponsors`, `featureOverrides`, `auth` ne sont jamais overridés par le contenu d'un profil cloud, ni au switch offline ni au resync cloud.
2. **Profil = fichier local** — un profil n'est activable que s'il existe en tant que `profiles/{id}.json` sur le disque. Aucun appel réseau n'est effectué au moment du switch.
3. **Cloud wins au resync** — Le prochain `sync_profiles` du cloud réapplique le profil actif en DB. Les modifications locales de `categories`/`sponsors`/`timeCategories` sont overridées. Ce comportement est intentionnel.
4. **Écriture atomique** — La mise à jour de `configuration.json` passe systématiquement par `.tmp` + `fs.rename()` pour éviter une config corrompue en cas de coupure d'alimentation.
5. **Guard path traversal** — Un `profileId` contenant `/`, `\` ou `..` est rejeté avec une erreur `400 INVALID_ID` avant toute lecture de fichier.
6. **Onglet masqué par défaut** — L'onglet « Profils » est masqué (`display: none`) si le Pi n'a qu'un seul profil (mono-club legacy). Il est affiché uniquement quand `GET /api/profiles` retourne ≥ 2 profils.

## Comportements observables

| Situation                               | Comportement attendu                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi offline, 2+ profils disponibles      | Onglet « Profils » visible, liste affichée, bouton « Activer » fonctionnel                                                                   |
| Clic « Activer » sur profil non-actif   | `POST /api/profiles/:id/switch` → CSRF requis → `configuration.json` mis à jour → `active-profile` mis à jour → notification "Profil activé" |
| Profil déjà actif                       | Bouton « Activer » absent, badge « Actif » affiché                                                                                           |
| Pi mono-club (legacy)                   | Onglet « Profils » masqué (`display: none`)                                                                                                  |
| Profil inexistant sur disque            | 404, message d'erreur dans l'UI                                                                                                              |
| profileId avec `../etc/passwd`          | 400 INVALID_ID, aucun accès fichier                                                                                                          |
| `configuration.json` absent (Pi vierge) | Switch réussit, profil appliqué tel quel sans LOCAL_ONLY_KEYS                                                                                |
| Reconnexion cloud post-switch           | Le sync-agent réapplique le profil actif (cloud wins sur categories/sponsors)                                                                |

## Cas d'edge

- **Pi vierge** (pas de `configuration.json`) : le switch applique le profil sans LOCAL_ONLY_KEYS à préserver. `{ success: true }`.
- **`clubs.json` absent** : `GET /api/profiles` retourne `[]` (Pi sans profils = legacy mono-club). Onglet masqué.
- **`active-profile` absent** : tous les profils sont marqués `isActive: false`. Le switch reste opérationnel.
- **Concurrent writes** : deux opérateurs sur deux navigateurs qui switchent simultanément — le dernier gagne (atomicité par rename garantit qu'aucun état corrompu n'est écrit).
- **Coupure alimentation pendant rename** : `fs.rename()` est atomique sur Linux — la config reste dans son état précédent ou dans le nouvel état, jamais corrompue.
- **Notification kiosk manquante** : le kiosk Angular ne reçoit pas de `config_updated` Socket.IO au moment du switch. L'opérateur doit redémarrer le kiosk pour que le nouveau profil soit pris en compte par la TV.

## Ce qui n'est PAS

- Ce n'est **pas** une synchronisation cloud — aucun appel HTTP vers le central-server lors d'un switch offline.
- Ce n'est **pas** une gestion de profils (création, modification, suppression) — les profils sont créés et gérés uniquement depuis le dashboard cloud.
- Ce n'est **pas** une garantie de persistance offline — les modifications locales (catégories, temps) sont temporaires jusqu'au prochain resync cloud.
- Ce n'est **pas** une interface de remote control — la télécommande et les scores requièrent le relay WebSocket cloud et ne sont pas exposés dans l'admin `:8080`.

## Contraintes techniques

- **Pas d'appel réseau** dans les fonctions de profil — tout passe par filesystem local
- **Écriture atomique** : `.tmp` + `fs.rename()` (ADR-028, même pattern que sync-agent)
- **Guards auth** : tous les endpoints POST sous `requireAuth + requireCsrf` (pattern admin server)
- **Pas de socket.io-client** dans admin-server (pas de dépendance) — notification via redémarrage kiosk

## Endpoints API

### Profils (existant)

```
GET  /api/profiles
     → [{ id, name, city, sport, isActive }]
     → [] si clubs.json absent (Pi sans profils = Pi mono-club legacy)

GET  /api/profiles/active
     → { id, name, city, sport, config? }

POST /api/profiles/:id/switch
     → { success: true, activeProfileId }
     → 404 si profil non trouvé sur disque
     → 400 si profileId invalide (path traversal guard)
```

### Inventaire `:8080` complet — routes existantes (au 2026-05-14)

13 fichiers de routes (`raspberry/admin/routes/`), 67 endpoints :

| Fichier | Routes principales | Statut |
|---|---|---|
| `auth.js` | `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/status`, `/api/auth/change-password` | ✅ |
| `backup.js` | `/api/backups`, `/api/backups/create`, `/api/backups/download/:filename`, `/api/backups/:filename`, `/api/backups/auto-status`, `/api/backups/auto-toggle` | ✅ |
| `cache.js` | `/api/cache/stats`, `/api/cache/clear`, `/api/cache/info` | ✅ |
| `config.js` | `/api/config`, `/api/configuration`, `/api/configuration/settings`, `/api/configuration/categories` (CRUD), `/api/configuration/phase-recap`, `/api/configuration/time-categories` (CRUD) | ✅ |
| `email.js` | `/api/email/config`, `/api/email/test`, `/api/email/send` | ✅ |
| `hotspot-dashboard.js` | `/api/hotspot/clients`, `/api/hotspot/events`, `/api/hotspot/rotate-psk`, `/api/hotspot/events/archive` | ✅ |
| `network.js` | `/api/network`, `/api/wifi/scan`, `/api/wifi/connect`, `/api/wifi/current`, `/api/wifi/bssid-lock`, `/api/hotspot/fix` | ✅ |
| `profiles.js` | `/api/profiles`, `/api/profiles/active`, `/api/profiles/:id/switch` | ⚠️ Read-only + switch uniquement |
| `sponsors.js` | `/api/sponsors/stats`, `/api/sponsors` (CRUD), `/api/sponsors/:localId` | ✅ |
| `sync-status.js` | `/api/sync-status` | ✅ |
| `system.js` | `/api/system`, `/api/version`, `/api/logs/:service`, `/api/services/:service/restart`, `/api/system/reboot`, `/api/system/shutdown`, `/api/system/apply-services`, `/api/system/fix-ownership`, `/api/system/validate` | ✅ |
| `update.js` | `/api/update` (file upload OTA local) | ✅ |
| `videos.js` | `/api/videos` (CRUD filesystem), `/api/videos/upload`, `/api/videos/upload-multiple`, `/api/thumbnails/regenerate`, `/api/videos/processing`, `/api/videos/orphans`, `/api/videos/add-to-config`, `/api/videos/reorder`, `/api/videos/move` | ✅ |

### Routes manquantes — gap de parité (à livrer Phases 2-5 d'ADR-120)

| Domaine | Route à créer | Phase ADR-120 | Pourquoi manquant aujourd'hui |
|---|---|---|---|
| Profils — création | `POST /api/profiles` | Phase 2 | Création profil = central uniquement |
| Profils — édition | `PUT /api/profiles/:id` | Phase 2 | Édition profil = central uniquement |
| Profils — suppression | `DELETE /api/profiles/:id` | Phase 2 | Suppression profil = central uniquement (garde-fou : refuser si actif) |
| Displays / receivers — assignation | `POST /api/displays/:idx/assign` | Phase 3 | ADR-114 write-through cloud→Pi uniquement |
| Displays / receivers — révocation | `DELETE /api/displays/:idx/assign` | Phase 3 | Idem |
| Conflits config | `GET /api/conflicts` | Phase 5 | Pas encore de notion de conflit (3-way merge) |

### Push-back état Pi → cloud (Phase 4 d'ADR-120)

Pas une route `:8080` mais une **commande sync-agent** qui POSTe l'état local vers le cloud au reconnect :

- `POST /api/sites/:id/pi-config-sync` (côté central-server) — payload structuré par profil avec hash + last_local_edit_at
- Authentifié via `api_key` du site
- Cloud merge selon matrice ownership ADR-120 §1 (3-way merge baseline / Pi / cloud)
- Conflits stockés dans `config_conflicts`, résolvables via UI dashboard inline onglet Content

## Open Questions

1. **Notification kiosk** : idéalement, le switch de profil devrait notifier l'app Angular TV (`config_updated` via Socket.IO). Actuellement l'admin server n'a pas de socket.io-client. À implémenter si besoin : route HTTP `POST /api/reload-config` sur le socket-server `:3000`.
2. **Modifications offline persistantes** : ~~stratégie "merge offline changes" en ADR futur~~ → **résolu par ADR-120** (Modèle C 3-way merge, Phase 4-5).

## Success Metrics

- Opérateur peut switcher de profil sur Pi offline en < 30s
- `configuration.json` correctement mis à jour après switch (vérifiable via `GET /api/configuration`)
- Le kiosk applique le nouveau profil après redémarrage
- `active-profile` cohérent avec le profil appliqué dans `configuration.json`
