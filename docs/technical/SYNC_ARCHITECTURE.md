# NEOPRO - Architecture de Synchronisation

> **Document de référence technique et fonctionnel**
> Version 1.0 - 9 Décembre 2025

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Les Acteurs (Personas)](#2-les-acteurs-personas)
3. [Types de Contenu](#3-types-de-contenu)
4. [Flux de Synchronisation](#4-flux-de-synchronisation)
5. [Règles de Merge](#5-règles-de-merge)
6. [Scénarios d'Usage](#6-scénarios-dusage)
7. [Implémentation Technique](#7-implémentation-technique)
8. [FAQ](#8-faq)

---

## 1. Vue d'ensemble

### 1.1 Le Problème Initial

Les boîtiers NEOPRO dans les clubs peuvent être :

- **Offline pendant des semaines** (pas de connexion internet permanente)
- **Modifiés localement** par l'opérateur du club
- **Mis à jour depuis le central** par l'équipe NEOPRO

Sans architecture de synchronisation intelligente, les modifications locales sont écrasées lors de la prochaine synchronisation centrale.

### 1.2 La Solution : Merge Intelligent

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVEUR CENTRAL NEOPRO                       │
│                                                                 │
│  ┌─────────────────────┐      ┌─────────────────────┐          │
│  │ Contenu NEOPRO      │      │ Miroir Config Clubs │          │
│  │ (Annonceurs, MAJ)   │      │ (lecture du Pi)     │          │
│  │ VERROUILLÉ          │      │                     │          │
│  └──────────┬──────────┘      └──────────▲──────────┘          │
│             │                            │                      │
└─────────────┼────────────────────────────┼──────────────────────┘
              │ PUSH                       │ PULL (quand connecté)
              ▼                            │
┌─────────────────────────────────────────────────────────────────┐
│                      BOÎTIER CLUB (Raspberry Pi)                │
│                                                                 │
│  ┌─────────────────────┐      ┌─────────────────────┐          │
│  │ ANNONCES NEOPRO     │      │ CONTENU CLUB        │          │
│  │ Lecture seule       │      │ Modifiable          │          │
│  │ Catégorie verrouillée│      │ par l'opérateur     │          │
│  └─────────────────────┘      └─────────────────────┘          │
│                                                                 │
│              └───────────┬────────────────┘                     │
│                          ▼                                      │
│                  configuration.json                             │
│                          │                                      │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ADMIN UI LOCALE (port 8080)                               │ │
│  │ • Voit tout le contenu                                    │ │
│  │ • Modifie uniquement les catégories "Club"                │ │
│  │ • ANNONCES NEOPRO = lecture seule, non supprimable        │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Les Acteurs (Personas)

### 2.1 Équipe NEOPRO (Administrateur Central)

**Qui** : L'entreprise NEOPRO qui gère le système pour tous les clubs clients

**Accès** : Dashboard Central (https://dashboard.neopro.fr)

**Responsabilités** :

- Gérer la flotte de tous les boîtiers clubs
- Déployer du contenu vers un ou plusieurs clubs
- Pousser les mises à jour logicielles
- Surveiller l'état de santé des boîtiers (CPU, température, disque)
- Gérer les alertes et incidents
- Diffuser les annonces nationales des partenaires NEOPRO

**Cas d'usage typiques** :

| Scénario                                    | Action                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Nouveau partenaire national (ex: Décathlon) | Upload vidéo → Sélectionner "Tous les clubs" → Déployer dans catégorie "ANNONCES NEOPRO" |
| Mise à jour logicielle                      | Créer package → Sélectionner groupes → Déployer avec rollback automatique                |
| Club en surchauffe                          | Recevoir alerte → Diagnostiquer → Envoyer commande de reboot                             |
| Nouveau club client                         | Créer le site → Générer API key → Configurer le boîtier                                  |

### 2.2 Opérateur Club (Jean, régisseur au Stade Français)

**Qui** : La personne responsable de l'affichage le jour du match dans le club

**Accès** : Admin UI Locale (http://neopro.local:8080)

**Responsabilités** :

- Préparer le contenu pour les matchs à domicile
- Ajouter des vidéos spécifiques au club (hommages, annonces speaker)
- Organiser les catégories de vidéos
- Utiliser la télécommande pendant le match

**Ce qu'il PEUT faire** :

- Uploader des vidéos dans les catégories du club
- Créer/modifier/supprimer des catégories et sous-catégories club
- Réorganiser l'ordre des vidéos
- Redémarrer les services locaux

**Ce qu'il NE PEUT PAS faire** :

- Modifier ou supprimer le contenu "ANNONCES NEOPRO"
- Modifier les paramètres système poussés par NEOPRO
- Accéder aux autres clubs

**Cas d'usage typiques** :

| Scénario                  | Action                                                   |
| ------------------------- | -------------------------------------------------------- |
| Hommage joueur ce soir    | Upload vidéo "Hommage Bertrand" → Catégorie "INFOS_CLUB" |
| Nouveau sponsor local     | Upload vidéo sponsor → Catégorie "SPONSORS_LOCAUX"       |
| Annonce speaker           | Upload annonce → Catégorie "ANIMATIONS"                  |
| Réorganiser pour le match | Modifier l'ordre des sous-catégories                     |

### 2.3 Partenaire National (Décathlon, Orange, etc.)

**Qui** : Annonceur qui paye NEOPRO pour diffuser du contenu sur tous les clubs

**Accès** : Aucun accès direct (passe par l'équipe NEOPRO)

**Workflow** :

1. Partenaire envoie sa vidéo à NEOPRO
2. NEOPRO upload sur le dashboard central
3. NEOPRO déploie vers tous les clubs (ou un groupe ciblé)
4. La vidéo apparaît dans "ANNONCES NEOPRO" sur chaque boîtier
5. L'opérateur club voit la vidéo mais ne peut pas la supprimer

---

## 3. Types de Contenu

### 3.1 Tableau Récapitulatif

| Type                | Propriétaire | Stockage Central   | Stockage Local               | Modifiable par Club | Supprimable par Club |
| ------------------- | ------------ | ------------------ | ---------------------------- | ------------------- | -------------------- |
| **Annonces NEOPRO** | NEOPRO       | DB + FTP Hostinger | configuration.json + /videos | Non                 | Non                  |
| **Contenu Club**    | Club         | Miroir (lecture)   | configuration.json + /videos | Oui                 | Oui                  |
| **Config Système**  | NEOPRO       | DB                 | configuration.json           | Non                 | Non                  |

### 3.2 Contenu NEOPRO (Verrouillé)

**Définition** : Contenu poussé par l'équipe NEOPRO centrale, non modifiable par les clubs.

**Exemples** :

- Vidéos partenaires nationaux (Décathlon, Orange...)
- Animations NEOPRO (logo, transitions)
- Annonces réglementaires

**Caractéristiques** :

- Catégorie dédiée : `ANNONCES_NEOPRO` (ou nom configurable)
- Flag `locked: true` dans la configuration
- L'admin UI affiche ces éléments en lecture seule
- Icône cadenas visible pour l'opérateur

**Structure dans configuration.json** :

```json
{
  "categories": [
    {
      "id": "annonces_neopro",
      "name": "ANNONCES NEOPRO",
      "locked": true,
      "owner": "neopro",
      "subcategories": [
        {
          "id": "partenaires_nationaux",
          "name": "Partenaires",
          "locked": true,
          "videos": [
            {
              "path": "videos/ANNONCES_NEOPRO/decathlon_2024.mp4",
              "locked": true,
              "deployed_at": "2024-12-01T10:00:00Z",
              "expires_at": "2025-01-31T23:59:59Z"
            }
          ]
        }
      ]
    }
  ]
}
```

### 3.3 Contenu Club (Éditable)

**Définition** : Contenu créé localement par l'opérateur du club.

**Exemples** :

- Hommages joueurs
- Annonces speaker
- Sponsors locaux
- Animations personnalisées

**Caractéristiques** :

- Catégories créées par l'opérateur ou par NEOPRO (mais éditables)
- Pas de flag `locked` ou `locked: false`
- Pleinement modifiable via l'admin UI
- Synchronisé vers le central quand connecté (pour visibilité NEOPRO)

**Structure dans configuration.json** :

```json
{
  "categories": [
    {
      "id": "infos_club",
      "name": "INFOS CLUB",
      "locked": false,
      "owner": "club",
      "subcategories": [
        {
          "id": "hommages",
          "name": "Hommages",
          "videos": [
            {
              "path": "videos/INFOS_CLUB/hommage_bertrand.mp4",
              "added_at": "2024-12-09T14:30:00Z",
              "added_by": "local"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 4. Flux de Synchronisation

### 4.1 Direction des Flux

```
                    CENTRAL                         LOCAL (Pi)

Contenu NEOPRO:     ────────────────────────────►   Lecture seule
                    PUSH (déploiement)

Contenu Club:       ◄────────────────────────────   Modifiable
                    PULL (miroir, lecture seule)    Source de vérité

Métriques:          ◄────────────────────────────
                    PULL (heartbeat toutes les 30s)

Commandes:          ────────────────────────────►   Exécution
                    PUSH (reboot, restart, etc.)
```

### 4.2 Événements de Synchronisation

| Événement                    | Direction          | Déclencheur                    | Action                                                            |
| ---------------------------- | ------------------ | ------------------------------ | ----------------------------------------------------------------- |
| **Connexion du Pi**          | Bidirectionnel     | Pi se connecte au central      | Échange état complet + traitement pending (queue + config)        |
| **Déploiement vidéo NEOPRO** | Central → Local    | Admin NEOPRO clique "Déployer" | Download + merge config                                           |
| **Modification locale**      | Local → Central    | Opérateur modifie via Admin UI | Upload état vers central                                          |
| **sync_local_state**         | Local → Central    | Connexion + changement vidéos  | Config + liste vidéos + stockage                                  |
| **Heartbeat**                | Local → Central    | Timer 30s                      | Métriques système + statut kiosk + recording state + player state |
| **screenshot-request**       | Central → Local    | Dashboard cloud remote         | Capture JPEG du player TV via canvas.drawImage()                  |
| **Commande admin**           | Central → Local    | Admin NEOPRO envoie commande   | Exécution sur Pi                                                  |
| **sync_profiles**            | Central → Local    | Admin déploie profils          | Écriture profiles/ + clubs.json                                   |
| **switch_profile**           | Central → Local    | Admin change profil actif      | Activation profil + merge config                                  |
| **profile-switch**           | Local (front→back) | Remote sélectionne un profil   | Activation profil + reload TV                                     |

> **Note** : Le heartbeat (30s) envoie les métriques système + le statut kiosk Chromium (lu depuis `/home/pi/neopro/data/kiosk-status.json`, écrit par `kiosk-watchdog.sh`) + le recording state analytics (`{ isRecording, isManualOverride }`, récupéré depuis le local server) + le player state TV (`{ currentVideo, progress, phase, isPlaying, loopIndex, ... }`, récupéré depuis le local server via callback `get-player-state`). Le recording state et le player state sont stockés en mémoire côté central (Maps éphémères) et exposés dans `GET /api/remote/:siteId/state` pour la cloud remote. Le player state est aussi broadcasté en temps réel vers la room `dashboard` via l'événement `player_state_updated`. La liste des vidéos est synchronisée via `sync_local_state` à la connexion et lors de changements détectés par le VideoWatcher.
>
> **Screenshot à la demande** : Le dashboard cloud peut demander un screenshot de la TV via `POST /api/remote/:siteId/command` avec `type: 'screenshot'`. Le flux est : central → sync-agent → local server (broadcast) → TV component (canvas.drawImage, JPEG 480p quality 0.5, ~30-50KB) → local server → sync-agent (relay bidirectionnel éphémère) → central → dashboard room via Socket.IO `screenshot-data`. Rate-limited à 1 capture/seconde côté Pi.

### 4.3 Processus de Synchronisation Détaillé

#### Étape 1 : Connexion du Pi au Central

```
Pi                                              Central
│                                                    │
│  ──── WebSocket connect + auth ────────────────►  │
│       (siteId, apiKey)                            │
│                                                    │
│  ◄──── Authentification OK ────────────────────   │
│                                                    │
│  ──── État local complet ──────────────────────►  │
│       (configuration.json, liste vidéos)          │
│                                                    │
│  ◄──── Contenu NEOPRO à synchroniser ──────────   │
│       (vidéos à ajouter/supprimer)                │
│                                                    │
│  ──── Confirmation sync terminée ──────────────►  │
│                                                    │
```

#### Étape 2 : Merge de la Configuration

Le merge est géré par `config-merge.js` et traite plusieurs champs :

```javascript
// Algorithme de merge complet
function mergeConfigurations(localConfig, neoProContent) {
  const result = JSON.parse(JSON.stringify(localConfig)); // Deep clone

  // 1. Préserver les paramètres locaux (settings, siteId, apiKey, etc.)
  const preservedLocalSettings = {};
  for (const key of LOCAL_ONLY_SETTINGS) {
    if (localConfig[key] !== undefined) {
      preservedLocalSettings[key] = localConfig[key];
    }
  }

  // 2. Fusionner les sponsors (central = source de vérité)
  if (neoProContent.sponsors !== undefined) {
    result.sponsors = mergeSponsors(localConfig.sponsors, neoProContent.sponsors);
  }

  // 3. Remplacer timeCategories et categoryMappings (gérés par le central)
  if (neoProContent.timeCategories !== undefined) {
    result.timeCategories = neoProContent.timeCategories;
  }
  if (neoProContent.categoryMappings !== undefined) {
    result.categoryMappings = neoProContent.categoryMappings;
  }

  // 4. Fusionner les catégories
  if (neoProContent.categories !== undefined) {
    result.categories = mergeCategories(localConfig.categories, neoProContent.categories);
  }

  // 5. Restaurer les paramètres locaux protégés
  for (const [key, value] of Object.entries(preservedLocalSettings)) {
    result[key] = value;
  }

  return result;
}
```

#### Merge des Sponsors (Boucle par défaut)

Le central est la **source de vérité** pour les sponsors :

```javascript
function mergeSponsors(localSponsors, centralSponsors) {
  const result = [];
  const processedPaths = new Set();

  // 1. Appliquer tous les sponsors du central
  for (const sponsor of centralSponsors) {
    const isNeopro = sponsor.locked || sponsor.owner === 'neopro';
    result.push({
      ...sponsor,
      locked: isNeopro,
      owner: isNeopro ? 'neopro' : sponsor.owner || 'club',
    });
    if (sponsor.path) processedPaths.add(sponsor.path);
  }

  // 2. Préserver les sponsors Club locaux NON présents dans le central
  for (const sponsor of localSponsors) {
    if (!sponsor.locked && sponsor.owner !== 'neopro' && !processedPaths.has(sponsor.path)) {
      result.push(sponsor);
    }
  }

  return result;
}
```

---

## 5. Règles de Merge

### 5.1 Principe Fondamental

> **Le contenu NEOPRO (verrouillé) est toujours contrôlé par le central.**
> **Le contenu Club (non verrouillé) est préservé sauf s'il est modifié depuis le central.**

### 5.2 Modes de Déploiement

Le dashboard central propose deux modes de déploiement :

| Mode      | Comportement                                                                 | Usage                                |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `merge`   | Fusionne le contenu NEOPRO avec la config locale, préserve les paramètres Pi | **Recommandé** - Usage courant       |
| `replace` | Écrase tout le `configuration.json` du Pi                                    | Réinitialisation complète uniquement |

> **Note** : Le mode `merge` est le mode par défaut depuis janvier 2026. Le mode `replace` peut perdre des paramètres locaux (settings, siteId, etc.).

### 5.3 Tableau des Règles par Champ

| Champ              | Comportement en mode `merge`                           |
| ------------------ | ------------------------------------------------------ |
| `sponsors`         | Central = source de vérité + sponsors locaux préservés |
| `categories`       | Fusion NEOPRO/Club (locked prend le dessus)            |
| `timeCategories`   | Remplacement complet par le central                    |
| `categoryMappings` | Remplacement complet par le central                    |
| `settings`         | **JAMAIS écrasé** - Protégé localement                 |
| `siteId`, `apiKey` | **JAMAIS écrasé** - Identifiants du boîtier            |

### 5.4 Tableau des Règles pour les Catégories

| Situation                                 | Contenu NEOPRO        | Contenu Club   | Résultat                               |
| ----------------------------------------- | --------------------- | -------------- | -------------------------------------- |
| Central ajoute une vidéo NEOPRO           | Nouvelle vidéo        | -              | Ajoutée dans catégorie verrouillée     |
| Central supprime une vidéo NEOPRO expirée | Vidéo à supprimer     | -              | Supprimée du Pi                        |
| Central modifie une catégorie NEOPRO      | Modification          | -              | Appliquée (écrase)                     |
| Opérateur ajoute une vidéo club           | -                     | Nouvelle vidéo | Préservée, remontée au central         |
| Opérateur supprime une vidéo club         | -                     | Suppression    | Supprimée, central notifié             |
| Opérateur modifie catégorie club          | -                     | Modification   | Préservée, remontée au central         |
| Conflit : même ID catégorie               | Catégorie verrouillée | Catégorie club | Central gagne (verrouillé prioritaire) |

### 5.5 Gestion des Conflits

**Conflit de nommage** : Si NEOPRO crée une catégorie avec le même ID qu'une catégorie club existante :

1. La catégorie NEOPRO (verrouillée) prend le dessus
2. La catégorie club est renommée automatiquement (ajout suffixe `_club`)
3. L'opérateur est notifié du changement

**Conflit de suppression** : Si l'opérateur tente de supprimer du contenu NEOPRO :

1. L'action est bloquée côté Admin UI
2. Message d'erreur : "Ce contenu est géré par NEOPRO et ne peut pas être supprimé"

### 5.6 Nommage des vidéos déployées

Depuis décembre 2025, les vidéos poussées depuis le central conservent leur nom d'origine (ex. `Golden Cup.mp4`) au lieu d'un UUID Supabase illisible :

- **Sanitisation automatique** : caractères interdits (`<>:"/\|?*`), accents et espaces multiples sont nettoyés, l'extension reste en `.mp4`.
- **Conflits évités** : si un fichier existe déjà dans la catégorie ciblée, le sync-agent ajoute un suffixe (`Golden Cup (1).mp4`) avant l'écriture.
- **Traçabilité** : `configuration.json` stocke désormais le `filename` final _et_ le `name` (sans extension) pour que la télécommande et l'analytics puissent afficher un intitulé utilisateur.
- **Suppression sûre** : la commande `delete_video` s'appuie sur ce `filename` final tout en restant rétro-compatible avec les anciennes entrées basées sur `path`.

👉 Résultat : les opérateurs voient les mêmes intitulés sur le dashboard central, la télécommande et dans les exports analytics, ce qui simplifie le support.

---

## 6. Scénarios d'Usage

### 6.1 Scénario : Campagne Nationale Décathlon

**Contexte** : Décathlon veut diffuser une vidéo promo sur tous les clubs NEOPRO pendant 2 mois.

**Étapes** :

1. **NEOPRO reçoit la vidéo** de Décathlon
2. **NEOPRO upload** sur le dashboard central
3. **NEOPRO configure** :
   - Catégorie cible : `ANNONCES_NEOPRO`
   - Date d'expiration : +2 mois
   - Cibles : Tous les clubs (ou groupe "Premium")
4. **NEOPRO déploie**
5. **Sync-agents** des Pi connectés reçoivent la commande `deploy_video`
   - Si le site est **online** : commande envoyée immédiatement
   - Si le site est **offline** : commande mise en queue via `sendOrQueue()`, envoyée automatiquement à la reconnexion
6. **Pi télécharge** la vidéo depuis Supabase
7. **Pi merge** la config : vidéo ajoutée dans catégorie verrouillée
8. **Opérateur Jean** voit la nouvelle vidéo avec un cadenas dans l'Admin UI
9. **Après 2 mois** : NEOPRO envoie commande de suppression automatique

### 6.2 Scénario : Hommage Local le Jour du Match

**Contexte** : Jean veut diffuser un hommage à Bertrand, ancien joueur décédé.

**Étapes** :

1. **Jean** se connecte à `http://neopro.local:8080`
2. **Jean upload** la vidéo "hommage_bertrand.mp4"
3. **Jean sélectionne** la catégorie "INFOS_CLUB" → sous-catégorie "Hommages"
4. **Admin server** :
   - Sauvegarde le fichier dans `/videos/INFOS_CLUB/hommage_bertrand.mp4`
   - Met à jour `configuration.json`
5. **Pendant le match** : Jean déclenche la vidéo via la télécommande
6. **Quand le Pi se reconnecte** au central (si internet disponible) :
   - Sync-agent envoie l'état local au central
   - Central stocke en miroir (pour visibilité NEOPRO)
7. **Si NEOPRO pousse une mise à jour** : la vidéo de Jean est préservée

### 6.3 Scénario : Boîtier Offline Pendant 1 Mois

**Contexte** : Le club de Villeneuve n'a pas internet. Jean modifie la config localement.

**Semaine 1-4 (Offline)** :

1. Jean ajoute 5 vidéos locales
2. Jean réorganise ses catégories
3. Tout fonctionne en local
4. Le central ne voit pas ces modifications

**Pendant ce temps (côté NEOPRO)** :

1. NEOPRO veut pousser une nouvelle vidéo sponsor
2. Le site étant offline, la commande est mise en **file d'attente** (Command Queue)
3. La commande reste stockée en base PostgreSQL avec priorité et expiration optionnelle

**Reconnexion (Semaine 5)** :

1. Pi se connecte au central
2. **`processPendingOnReconnect(siteId)`** s'exécute automatiquement :
   - Commandes en queue (`pending_commands`) envoyées par priorité
   - Déploiements de contenu en attente relancés
   - Mises à jour logicielles en attente relancées
   - **Config pending** (`pending_config_version_id`) envoyée via `triggerPendingConfigSync()`
   - La vidéo sponsor est déployée automatiquement
3. Pi envoie son état complet (config + liste vidéos)
4. Central compare avec son dernier miroir
5. Central identifie les changements :
   - 5 nouvelles vidéos ajoutées par Jean
   - 1 vidéo sponsor ajoutée par la queue
   - Réorganisation catégories
6. Central met à jour le miroir
7. L'équipe NEOPRO peut voir sur le dashboard ce qu'il y a sur le Pi

> **Note** : Les commandes "temps réel" (logs, diagnostic réseau) ne peuvent pas être mises en queue et nécessitent une connexion active. Voir [COMMAND_QUEUE.md](COMMAND_QUEUE.md) pour la liste complète.

### 6.4 Scénario : Déploiement multi-vidéos depuis le central

**Contexte** : L'équipe marketing publie un pack de 5 vidéos sponsor qu'elle veut pousser sur un groupe de sites en une seule opération.

**Étapes :**

1. **Opérateur** sélectionne plusieurs vidéos dans l'onglet _Déployer_ (liste multisélection ou bouton 🚀 sur chaque carte).
2. **Dashboard central** affiche le récapitulatif des vidéos retenues et permet de retirer une entrée individuellement.
3. **Opérateur** choisit la cible (site ou groupe) et clique sur **Lancer le déploiement**.
4. **Front Angular** envoie une requête par vidéo (séquentiellement) et affiche une synthèse : succès partiels, erreurs par vidéo.
5. **Historique** se peuple immédiatement avec les déploiements créés, ce qui facilite le suivi temps réel.

👉 Cette fonctionnalité réduit les clics répétitifs lorsqu'on doit pousser plusieurs vidéos sur une même cible et offre un feedback clair en cas d'échec partiel.

---

## 7. Implémentation Technique

### 7.1 Structure de Données

#### configuration.json (sur le Pi)

```json
{
  "version": "2.0",
  "site_id": "club_stade_francais",
  "last_sync": "2024-12-09T15:00:00Z",
  "last_local_change": "2024-12-09T14:30:00Z",

  "categories": [
    {
      "id": "annonces_neopro",
      "name": "ANNONCES NEOPRO",
      "icon": "megaphone",
      "locked": true,
      "owner": "neopro",
      "visible_to_club": true,
      "editable_by_club": false,
      "subcategories": [
        {
          "id": "partenaires_nationaux",
          "name": "Partenaires Nationaux",
          "locked": true,
          "videos": [
            {
              "id": "decathlon_noel_2024",
              "path": "videos/ANNONCES_NEOPRO/decathlon_noel.mp4",
              "name": "Décathlon - Noël 2024",
              "locked": true,
              "deployed_at": "2024-12-01T10:00:00Z",
              "deployed_by": "neopro_admin",
              "expires_at": "2025-01-31T23:59:59Z"
            }
          ]
        }
      ]
    },
    {
      "id": "infos_club",
      "name": "INFOS CLUB",
      "icon": "info",
      "locked": false,
      "owner": "club",
      "subcategories": [
        {
          "id": "hommages",
          "name": "Hommages",
          "locked": false,
          "videos": [
            {
              "id": "hommage_bertrand_2024",
              "path": "videos/INFOS_CLUB/hommage_bertrand.mp4",
              "name": "Hommage Bertrand",
              "locked": false,
              "added_at": "2024-12-09T14:30:00Z",
              "added_by": "local_admin"
            }
          ]
        }
      ]
    }
  ],

  "settings": {
    "club_name": "Stade Français",
    "locked_settings": {
      "neopro_category_id": "annonces_neopro",
      "min_neopro_display_time": 5
    },
    "club_settings": {
      "theme": "dark",
      "logo_path": "assets/logo_club.png"
    }
  }
}
```

#### Table `site_configurations` (Central - PostgreSQL)

```sql
CREATE TABLE site_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),

  -- Miroir de la config locale (lecture seule pour NEOPRO)
  local_config JSONB NOT NULL,
  local_config_hash VARCHAR(64),
  last_local_sync TIMESTAMPTZ,

  -- Contenu NEOPRO à pousser vers ce site
  neopro_content JSONB NOT NULL DEFAULT '{"categories": []}',
  neopro_content_version INTEGER DEFAULT 1,

  -- Métadonnées
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 API Sync Agent

#### VideoWatcher (Surveillance des vidéos locales)

Le module `video-watcher.js` surveille le dossier `/home/pi/neopro/videos` et déclenche une synchronisation lorsque des fichiers sont ajoutés, modifiés ou supprimés.

**Caractéristiques** :

- Surveillance récursive avec `fs.watch({ recursive: true })`
- Debounce de 2 secondes pour éviter les appels redondants
- Hash SHA-256 de la liste pour détecter les vrais changements
- Extraction automatique de la catégorie/sous-catégorie depuis le chemin

```javascript
// raspberry/sync-agent/src/watchers/video-watcher.js
const VideoWatcher = require('./watchers/video-watcher');

const watcher = new VideoWatcher('/home/pi/neopro/videos', async () => {
  // Callback appelé quand la liste des vidéos change
  await syncLocalState();
});
watcher.start();
```

**Structure retournée par `scanVideos()`** :

```javascript
[
  {
    filename: 'hommage_bertrand.mp4',
    path: 'videos/INFOS_CLUB/hommages/hommage_bertrand.mp4',
    category: 'INFOS_CLUB',
    subcategory: 'hommages',
    size: 12345678,
    lastModified: '2024-12-09T14:30:00Z',
  },
];
```

#### Événement : `sync_local_state` (Pi → Central)

```javascript
// Envoyé par le Pi à chaque connexion et après chaque modification locale/vidéo
socket.emit('sync_local_state', {
  siteId: 'club_stade_francais',
  configHash: 'sha256:abc123...', // Hash de configuration.json
  config: {
    /* configuration.json complète */
  },
  videos: [
    {
      filename: 'hommage.mp4',
      path: 'videos/INFOS_CLUB/hommage.mp4',
      category: 'INFOS_CLUB',
      subcategory: null,
      size: 12345678,
      lastModified: '2024-12-09T14:30:00Z',
    },
  ],
  storage: {
    total: 32000000000, // Espace total en bytes
    used: 8000000000,
    free: 24000000000,
  },
  timestamp: '2024-12-09T15:00:00Z',
});
```

**Stockage côté central** :

Les données vidéos sont enrichies dans `local_config_mirror` (JSONB) :

```javascript
// central-server/src/services/socket.service.ts
const enrichedConfig = {
  ...config,
  _localVideos: videos || [],
  _localStorage: storage || null,
  _lastVideoSync: timestamp,
};
// UPDATE sites SET local_config_mirror = $1 WHERE id = $2
```

**Exposition via API** :

```
GET /api/sites/:id/local-content
→ { localVideos, localStorage, lastVideoSync, configuration, ... }
```

#### Événement : `neopro_sync` (Central → Pi)

```javascript
// Envoyé par le Central quand il y a du contenu NEOPRO à synchroniser
socket.emit('neopro_sync', {
  version: 5,
  actions: [
    {
      type: 'add_video',
      category_id: 'annonces_neopro',
      subcategory_id: 'partenaires_nationaux',
      video: {
        id: 'decathlon_noel_2024',
        name: 'Décathlon - Noël 2024',
        url: 'https://kalonpartners.bzh/neopro-video/decathlon_noel.mp4',
        expires_at: '2025-01-31T23:59:59Z',
      },
    },
    {
      type: 'remove_video',
      video_id: 'orange_promo_expired',
    },
  ],
});
```

### 7.3 Admin UI - Gestion des Verrous

```typescript
// admin-server.js - Vérification avant modification

function canModifyCategory(category, user) {
  if (category.locked && category.owner === 'neopro') {
    return {
      allowed: false,
      reason: 'Cette catégorie est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

function canDeleteVideo(video, category) {
  if (video.locked || category.locked) {
    return {
      allowed: false,
      reason: 'Ce contenu est géré par NEOPRO et ne peut pas être supprimé.',
    };
  }
  return { allowed: true };
}
```

```html
<!-- Admin UI - Affichage avec cadenas -->
<div class="category" :class="{ 'locked': category.locked }">
  <span class="category-name">{{ category.name }}</span>
  <span v-if="category.locked" class="lock-icon" title="Géré par NEOPRO"> 🔒 </span>
</div>
```

---

## 8. FAQ

### Q: Que se passe-t-il si le Pi est toujours offline ?

**R**: Le Pi fonctionne en totale autonomie. L'opérateur peut modifier la config locale sans problème. Quand il se reconnectera, le merge préservera ses modifications et ajoutera le contenu NEOPRO en attente.

### Q: NEOPRO peut-il voir ce qu'il y a sur un Pi offline ?

**R**: Non, pas en temps réel. NEOPRO voit le dernier état synchronisé (miroir). Dès que le Pi se reconnecte, le miroir est mis à jour.

### Q: Que se passe-t-il si une vidéo NEOPRO expire ?

**R**: Deux options :

1. **Suppression automatique** : Le sync-agent vérifie les dates d'expiration et supprime localement
2. **Commande centrale** : NEOPRO envoie une commande de suppression explicite

### Q: L'opérateur peut-il cacher une catégorie NEOPRO ?

**R**: Non, les catégories verrouillées ne peuvent pas être cachées. Cela garantit la visibilité des annonceurs nationaux.

### Q: Comment gérer un conflit de stockage (disque plein) ?

**R**: Le sync-agent vérifie l'espace disponible avant de télécharger. Si insuffisant :

1. Alerte envoyée au central
2. Téléchargement reporté
3. NEOPRO notifié pour action (nettoyage distant ou contact club)

### Q: Comment fonctionnent les profils multi-config ?

**R**: Un site peut avoir N profils de configuration (ex: "Standard", "Tournoi U15", "Match Pro"). Chaque profil contient une configuration complète (sponsors, catégories, vidéos). Le flux :

1. L'admin crée/modifie des profils via `/api/sites/:siteId/profiles`
2. `POST .../profiles/sync` envoie la commande `sync_profiles` au Pi
3. Le sync-agent écrit chaque profil dans `profiles/{id}.json` + génère `profiles/clubs.json`
4. Le staff local sélectionne un profil via la télécommande (même UI que le mode démo)
5. Le Pi active le profil : merge dans `configuration.json` + reload de la TV

**Sites mono-config** : Aucun changement visible. Un seul profil "Par défaut" est auto-créé, le sélecteur n'apparaît pas.

### Q: L'opérateur peut-il réorganiser l'ordre des catégories NEOPRO ?

**R**: À définir. Options :

- **Strict** : Non, l'ordre est imposé par NEOPRO
- **Souple** : Oui, l'opérateur peut réorganiser mais pas modifier le contenu

### Q: Pourquoi mes modifications de config réapparaissent après un refresh ?

**R**: Ce problème a été résolu en v2.42.x. Il s'agissait d'une **race condition** :

1. Vous déployez une config (ex: suppression de 2 vidéos)
2. Le Pi reçoit la commande et met à jour `configuration.json`
3. Mais immédiatement après, le Pi envoie son `sync_local_state` avec l'ancienne config
4. Le cloud stocke cette ancienne config dans `local_config_mirror`
5. Quand vous rafraîchissez, vous voyez l'ancienne config

**Solution implémentée** : Blocage temporaire de 60 secondes après envoi d'une commande `update_config`. Pendant ce temps, le cloud ne met à jour que les métadonnées (`_localVideos`, etc.) sans écraser la config principale.

---

## Mise à jour OTA (Software Update)

Le déploiement OTA est le seul flux qui met à jour le **code** du Pi (sync-agent, webapp, server, admin, config).

### Flow complet

```
Dashboard ──POST /api/update-deployments──▶ Central Server
                                               │
                                               ├─ 1. applyPreUpdateMigration(siteId)
                                               │      └─ remote_shell: sudo chown -R pi:pi VERSION/release.json
                                               │
                                               ├─ 2. await delay(5s)  ← évite race condition
                                               │
                                               └─ 3. sendOrQueue('update_software', { version, updateUrl, ... })
                                                      │
                                          Pi (sync-agent)
                                               │
                                               ├─ Download .tar.gz depuis CDN
                                               ├─ Extraction dans /tmp
                                               ├─ fixFileOwnership(VERSION, release.json)
                                               │      └─ sudo chown -R pi:pi (doit matcher sudoers -R)
                                               ├─ fs.copy() des fichiers extraits
                                               ├─ npm install
                                               ├─ Installation sudoers + systemd services
                                               ├─ Restart services
                                               └─ emit update_progress { progress: 100, completed: true }
```

### Pré-migration (serveur → Pi)

Envoyée via `remote_shell` **avant** l'OTA pour corriger les problèmes hérités :

| Migration        | Commande                                   | Objectif                                        |
| ---------------- | ------------------------------------------ | ----------------------------------------------- |
| 1. Fix ownership | `sudo chown -R pi:pi VERSION release.json` | Fichiers root:root → pi:pi (legacy sudo cp/tee) |
| 2. Patch legacy  | `sed 's/sudo cp/cp/g; s/sudo tee/tee/g'`   | Retirer sudo cp/tee bloqués par NoNewPrivileges |

**Pièges connus :**

- La commande `chown` doit utiliser `-R` pour matcher la règle sudoers (sinon refus silencieux)
- La migration 2 ne doit **pas** remplacer `sudo chown` (nécessaire dans `fixFileOwnership()`)
- Sans le délai de 5s, les deux commandes s'exécutent en parallèle côté Pi (race condition)

### Monitoring

Métrique Prometheus : `neopro_ota_errors_total{error_type}` avec labels `permission`, `timeout`, `network`, `disk_full`, `cancelled`, `other`.

## Historique des Versions

| Version | Date       | Auteur        | Modifications                                                               |
| ------- | ---------- | ------------- | --------------------------------------------------------------------------- |
| 1.0     | 2024-12-09 | Claude/NEOPRO | Création initiale                                                           |
| 1.1     | 2025-12-16 | Claude/NEOPRO | Ajout Command Queue pour sites offline                                      |
| 1.2     | 2026-01-06 | Claude/NEOPRO | Ajout VideoWatcher et sync_local_state avec vidéos                          |
| 1.3     | 2026-01-07 | Claude/NEOPRO | Documentation merge sponsors, modes merge/replace, fix                      |
| 1.4     | 2026-01-08 | Claude/NEOPRO | `deploy_video` utilise `sendOrQueue()` (offline support)                    |
| 1.5     | 2026-01-24 | Claude/NEOPRO | Fix race condition sync_local_state après update_config                     |
| 1.6     | 2026-02-12 | Claude/NEOPRO | Ajout multi-config profiles (sync_profiles, switch_profile, profile-switch) |
| 1.7     | 2026-02-15 | Claude/NEOPRO | Ajout section OTA : pré-migration, race condition, monitoring               |

---

_Document généré pour le projet NEOPRO - Confidentiel_
