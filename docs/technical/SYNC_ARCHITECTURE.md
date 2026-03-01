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
│  │ • ANNONCES NEOPRO = lecture seule côté Pi (non supprimable par le club) │ │
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
- L'admin UI **côté Pi** affiche ces éléments en lecture seule (cadenas visible pour l'opérateur club)
- Le **Dashboard Central** a un accès complet (suppression, modification) — c'est l'outil de gestion NEOPRO

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

| Événement                      | Direction          | Déclencheur                    | Action                                                                                |
| ------------------------------ | ------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| **Connexion du Pi**            | Bidirectionnel     | Pi se connecte au central      | Échange état complet + traitement pending (queue + config)                            |
| **Déploiement vidéo NEOPRO**   | Central → Local    | Admin NEOPRO clique "Déployer" | Download + merge config                                                               |
| **Modification locale**        | Local → Central    | Opérateur modifie via Admin UI | Upload état vers central                                                              |
| **sync_local_state**           | Local → Central    | Connexion + changement vidéos  | Config + liste vidéos + stockage                                                      |
| **Heartbeat**                  | Local → Central    | Timer 30s                      | Métriques système + statut kiosk + recording state + player state                     |
| **cloud-remote-action**        | Central → Local    | Dashboard cloud remote         | Play vidéo/sponsors, relayé comme `command` au local server                           |
| **score-update** (cloud)       | Central → Local    | Dashboard cloud remote         | Mise à jour score live (homeScore, awayScore, teams)                                  |
| **score-reset** (cloud)        | Central → Local    | Dashboard cloud remote         | Reset score à 0-0                                                                     |
| **phase-change** (cloud)       | Central → Local    | Dashboard cloud remote         | Changement de phase (match, neutral, mi-temps)                                        |
| **timer-update** (cloud)       | Central → Local    | Dashboard cloud remote         | Mise à jour timer match                                                               |
| **breaking-news** (cloud)      | Central → Local    | Dashboard cloud remote         | Breaking news overlay sur TV                                                          |
| **match-info-updated** (cloud) | Central → Local    | Dashboard cloud remote         | Config match (date, nom, audience)                                                    |
| **recording-toggle** (cloud)   | Central → Local    | Dashboard cloud remote         | Toggle recording on/off                                                               |
| **screenshot-request**         | Central → Local    | Dashboard cloud remote         | Capture JPEG du player TV via canvas.drawImage()                                      |
| **screenshot-data**            | Local → Central    | Réponse screenshot             | JPEG 480p ou `{ error }` si échec (v3.49+)                                            |
| **Commande admin**             | Central → Local    | Admin NEOPRO envoie commande   | Exécution sur Pi                                                                      |
| **sync_profiles**              | Central → Local    | Admin déploie profils          | Écriture profiles/ + clubs.json                                                       |
| **switch_profile**             | Central → Local    | Admin change profil actif      | Activation profil + merge config                                                      |
| **profile-switch**             | Local (front→back) | Remote sélectionne un profil   | Activation profil + reload TV                                                         |
| **update_config (sponsors)**   | Central → Local    | Déploiement orchestré          | Merge `siteSponsors` dans `localSponsors[]` du Pi (P8)                                |
| **sponsor_ids_resolved**       | Central → Local    | Réponse à sync_local_state     | Mapping `{ localId: centralUUID }` pour sponsors locaux (P3/P9)                       |
| **content_received** (hist.)   | Local (interne)    | Après update_config réussi     | Événement sync-history.json : sponsors/catégories reçus, bannière admin Pi (F-AUD-14) |

> **Note** : Le heartbeat (30s) envoie les métriques système + le statut kiosk Chromium (lu depuis `/home/pi/neopro/data/kiosk-status.json`, écrit par `kiosk-watchdog.sh`) + le recording state analytics (`{ isRecording, isManualOverride }`, récupéré depuis le local server via connexion persistante `local-socket.js`) + le player state TV (`{ currentVideo, progress, phase, isPlaying, loopIndex, ... }`, récupéré depuis le local server via callback `get-player-state` sur la connexion persistante). Le recording state et le player state sont stockés en mémoire côté central (Maps éphémères) et exposés dans `GET /api/remote/:siteId/state` pour la cloud remote. Le player state est aussi broadcasté en temps réel vers la room `dashboard` via l'événement `player_state_updated`. La liste des vidéos est synchronisée via `sync_local_state` à la connexion et lors de changements détectés par le VideoWatcher.
>
> **Screenshot à la demande (v3.58+)** : Le dashboard cloud demande un screenshot via `POST /api/remote/:siteId/command` avec `type: 'screenshot'`. Le controller **attend la réponse du Pi** (pattern request-response HTTP, timeout 8s) au lieu de relayer via Socket.IO room. Le flux est : dashboard HTTP POST → controller attend sur `piSocket.on('screenshot-data')` → central émet `screenshot-request` → sync-agent → local server (broadcast via connexion persistante `local-socket.js`) → TV component (canvas.drawImage, JPEG 480p quality 0.5, ~30-50KB) → local server → sync-agent (relay via connexion persistante) → central → **controller retourne l'image dans la réponse HTTP**. Rate-limited à 1 capture/seconde côté Pi.
>
> **Historique** : Avant v3.58, le screenshot était relayé au dashboard via `io.to('dashboard').emit('screenshot-data', ...)`. Ce relay Socket.IO perdait silencieusement les payloads base64 (~60 KB) lorsque le dashboard utilisait le transport polling, causant des timeouts systématiques.
>
> **Gestion d'erreur screenshot (v3.49+)** : Le TV component et le sync-agent renvoient toujours une réponse `screenshot-data`, même en cas d'échec. Le champ `error` indique la cause : `no_active_video` (aucune vidéo active), `capture_failed` (canvas/video invalide), ou `timeout` (pas de réponse du local server en 10s). En v3.58+, le controller retourne directement l'erreur via HTTP (502 pour erreur Pi, 504 pour timeout). Côté central, les réponses sont instrumentées via `neopro_commands_total{type="screenshot", status="sent|received|pi_error|timeout"}` et `neopro_command_latency_seconds{type="screenshot"}`.
>
> **Cloud Remote — chaîne de relay complète (v3.69.2+)** : La télécommande cloud envoie des commandes via `POST /api/remote/:siteId/command`. Le controller mappe le `type` vers un événement Socket.IO, vérifie la room membership (anti-zombie, retourne 503 si room vide), puis émet via `io.to(siteId).emit()`. Le sync-agent (`agent.js`) écoute chaque événement et le relaie au local server via `relayToLocalServer()` (connexion persistante `local-socket.js` port 3000). Le local server (`handlers.js`) broadcast vers les clients TV/Remote. Mapping : `play-video`/`play-sponsors` → `cloud-remote-action` → relayé comme `command` ; `screenshot` → `screenshot-request` (request-response, pas relay fire-and-forget) ; tous les autres événements (`score-update`, `score-reset`, `phase-change`, `timer-update`, `breaking-news`, `match-info-updated`, `recording-toggle`) sont relayés avec le même nom. Un smoke test (#30) vérifie la complétude de la chaîne. Métriques : `neopro_commands_total{type, status="sent|error|zombie"}` — le status `zombie` est incrémenté quand le controller détecte une room vide (connexion zombie).

### 4.3 Processus de Synchronisation Détaillé

#### Étape 1 : Connexion du Pi au Central

```
Pi                                              Central
│                                                    │
│  ──── WebSocket connect + auth ────────────────►  │
│       (siteId, apiKey)                            │
│                                                    │
│  ◄──── Authentification OK ────────────────────   │  → authRetries = 0
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

**Gestion des erreurs d'authentification (v3.61+) :**

Le sync-agent distingue les erreurs d'auth permanentes des erreurs transitoires :

| Type d'erreur   | Exemples                                                  | Comportement                                       |
| --------------- | --------------------------------------------------------- | -------------------------------------------------- |
| **Permanente**  | Clé API invalide, Site non trouvé, Identifiants manquants | `process.exit(1)` immédiat                         |
| **Transitoire** | Timeout DB, surcharge serveur, pool connexions saturé     | Retry via reconnexion Socket.IO (max 5 tentatives) |

Le compteur `authRetries` est incrémenté à chaque erreur transitoire et remis à 0 après une authentification réussie. Après 5 échecs consécutifs, le processus quitte (relancé par systemd).

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

  // 2. Écran secondaire (E-22 — HDMI 1 : panneau LED, TV tribunes, écran géant)
  //    Rétrocompat: migre les anciennes clés ledEnabled/ledResolution
  if (neoProContent.secondaryDisplayEnabled !== undefined) {
    result.secondaryDisplayEnabled = neoProContent.secondaryDisplayEnabled;
    delete result.ledEnabled;
  } else if (neoProContent.ledEnabled !== undefined) {
    result.secondaryDisplayEnabled = neoProContent.ledEnabled;
    delete result.ledEnabled;
  }
  if (neoProContent.secondaryDisplayResolution !== undefined) {
    result.secondaryDisplayResolution = neoProContent.secondaryDisplayResolution;
    delete result.ledResolution;
  } else if (neoProContent.ledResolution !== undefined) {
    result.secondaryDisplayResolution = neoProContent.ledResolution;
    delete result.ledResolution;
  }

  // 3. Fusionner les sponsors (central = source de vérité)
  if (neoProContent.sponsors !== undefined) {
    result.sponsors = mergeSponsors(localConfig.sponsors, neoProContent.sponsors);
  }

  // 4. Remplacer timeCategories et categoryMappings (gérés par le central)
  if (neoProContent.timeCategories !== undefined) {
    result.timeCategories = neoProContent.timeCategories;
    // 4b. Restaurer les variantes secondaires perdues lors du remplacement
    //     Le central ne stocke pas toujours variants.secondary dans timeCategories,
    //     donc on les ré-injecte depuis la config locale (voir §5.7 defense-in-depth)
    restoreSecondaryVariants(result.timeCategories, localConfig.timeCategories);
  }
  if (neoProContent.categoryMappings !== undefined) {
    result.categoryMappings = neoProContent.categoryMappings;
  }

  // 5. Fusionner les catégories
  if (neoProContent.categories !== undefined) {
    result.categories = mergeCategories(localConfig.categories, neoProContent.categories);
  }

  // 5b. Fusionner les métadonnées sponsors (P8 — dashboard → Pi)
  if (neoProContent.siteSponsors !== undefined) {
    result.localSponsors = mergeSiteSponsors(
      localConfig.localSponsors || [],
      neoProContent.siteSponsors,
    );
  }

  // 6. Restaurer les paramètres locaux protégés
  //    (sauf localSponsors si siteSponsors présent — déjà fusionné en 5b)
  for (const [key, value] of Object.entries(preservedLocalSettings)) {
    if (key === 'localSponsors' && neoProContent.siteSponsors !== undefined) continue;
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

#### Merge des Métadonnées Sponsors (Dashboard → Pi)

Depuis P8, le payload de déploiement inclut un champ `siteSponsors` contenant les métadonnées des sponsors du site (nom, contact, vidéos associées). Ces données sont fusionnées dans `localSponsors[]` du Pi :

```javascript
// Payload envoyé par le central (dans neoProContent)
siteSponsors: [
  {
    id: 'uuid-site-sponsor', // ID central (site_sponsors.id)
    name: 'Boulangerie Dupont',
    contactEmail: 'jean@dupont.fr',
    contactPhone: '06 12 34 56 78',
    logoUrl: null,
    source: 'local', // 'local' ou 'neopro'
    videoFilenames: ['dupont_spot.mp4', 'dupont_banniere.mp4'],
    isActive: true,
  },
];

// Algorithme de merge (config-merge.js → mergeSiteSponsors)
// 1. Pour chaque sponsor central :
//    a) Chercher par centralId (lien existant)
//    b) Sinon chercher par nom (case-insensitive) pour lier un sponsor local
//    c) Sinon créer une nouvelle entrée locale avec centralId
// 2. Préserver les sponsors purement locaux (sans centralId, nom non matché)
// 3. Fusionner les videoFilenames (union des deux listes)
```

**Règles de merge** :

| Situation                                    | Résultat                                                 |
| -------------------------------------------- | -------------------------------------------------------- |
| Sponsor central avec `centralId` déjà lié    | Mise à jour nom, contact, vidéos                         |
| Sponsor central avec même nom qu'un local    | Liaison via `centralId` + mise à jour                    |
| Nouveau sponsor central                      | Création entrée locale avec `centralId`                  |
| Sponsor local sans match central             | Préservé intact                                          |
| Sponsor central supprimé (absent du payload) | Entrée locale conservée (pas de suppression destructive) |

**Monitoring** : Métrique `neopro_sponsor_sync_total{status="included"}` à chaque déploiement, `neopro_sponsor_sync_count` pour le nombre de sponsors inclus. Alerte `SponsorSyncMissing` si des déploiements se font sans données sponsors.

#### Sync Sponsors Bidirectionnelle (P9)

Depuis P9, la synchronisation des sponsors est **bidirectionnelle** et chaque direction a son propre mécanisme :

```
┌──────────────────────┐                          ┌──────────────────────┐
│   Dashboard Central  │                          │    Raspberry Pi      │
│                      │   orchestrated deploy    │                      │
│  site_sponsors (DB)  │ ──── siteSponsors[] ──►  │  localSponsors[]     │
│  source: 'neopro'    │    neoProContent.        │  source: 'neopro'    │
│                      │    siteSponsors          │  (lecture seule)     │
│                      │                          │                      │
│  site_sponsors (DB)  │ ◄─── localSponsors[] ──  │  localSponsors[]     │
│  source: 'local'     │    sync_local_state      │  source: 'local'     │
│                      │                          │  (éditable bénévole) │
│                      │ ──── mapping{} ────────► │                      │
│                      │    sponsor_ids_resolved   │  centralId = uuid    │
└──────────────────────┘                          └──────────────────────┘
```

**Direction Dashboard → Pi** (déploiement) :

1. Opérateur crée un sponsor dans le dashboard (`site_sponsors` avec `source='neopro'`)
2. Au déploiement, `getSponsorsForDeployment(siteId)` récupère les sponsors avec `videoFilenames[]`
3. `syncSponsorVideoAssociations()` extrait les couples sponsor-vidéo du config et upsert dans `site_sponsor_videos`
4. Le payload `neoProContent.siteSponsors[]` est envoyé au Pi
5. `mergeSiteSponsors()` fusionne dans `localSponsors[]` avec `source: 'neopro'`
6. Le Pi admin affiche ces sponsors en section NEOPRO (lecture seule, `LockedError` sur edit/delete)

**Direction Pi → Dashboard** (sync-agent) :

1. Bénévole crée un sponsor local depuis l'admin Pi (`source: 'local'`)
2. `sync_local_state` envoie `localSponsors[]` au central
3. `resolveLocalSponsors()` crée/matche des `site_sponsors(source='local')` en DB
4. Le central émet `sponsor_ids_resolved` avec le mapping `{ localId: centralUUID }`
5. Le Pi met à jour `centralId` dans `localSponsors[]` et `site_sponsor_id` dans `sponsors[]` + `timeCategories[].loopVideos[]`
6. Les impressions sont attribuées via `site_sponsor_id` → rapport PDF possible

**Résolution impression (3 niveaux)** :

1. `site_sponsor_id` fourni directement par le Pi (cas nominal)
2. Fallback `video_id` → JOIN `site_sponsor_videos` → `site_sponsors.id`
3. Fallback `video_filename` → JOIN `site_sponsor_videos` (par filename) → `site_sponsors.id`

**Monitoring P9** :

- `neopro_impression_resolution_total{method}` — compteur par méthode de résolution (site_sponsor_id, video_id, filename, unresolved)
- `neopro_sponsor_resolution_failures_total{operation}` — compteur d'échecs (resolve_local, resolve_impression, sync_videos)
- Alerte `SponsorResolutionFailures` — >0.05/s pendant 10 min
- Alerte `ImpressionSponsorUnresolved` — >50% non attribuées pendant 15 min

---

## 5. Règles de Merge

### 5.1 Principe Fondamental

> **Le contenu NEOPRO (verrouillé) est toujours contrôlé par le central.**
> **Le contenu Club (non verrouillé) est préservé sauf s'il est modifié depuis le central.**

### 5.2 Modes de Déploiement

Le dashboard central propose deux modes de déploiement :

| Mode      | Comportement                                                                                 | Usage                          |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `merge`   | Fusionne le contenu NEOPRO avec la config locale, préserve les paramètres Pi                 | **Recommandé** - Usage courant |
| `replace` | Remplace les champs de contenu envoyés + `restoreSecondaryVariants()` post-replace (ADR-032) | Réinitialisation de contenu    |

> **Note** : Le mode `merge` est le mode par défaut depuis janvier 2026. Le mode `replace` remplace les champs de contenu (sponsors, categories, timeCategories, etc.) mais **préserve les variantes secondaires** locales grâce à `restoreSecondaryVariants()` (ajouté dans ADR-032). Les paramètres locaux (settings, siteId, etc.) ne sont pas remplacés.

### 5.3 Tableau des Règles par Champ

| Champ              | Comportement en mode `merge`                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `sponsors`         | Central = source de vérité + sponsors locaux préservés                        |
| `siteSponsors`     | Fusionné dans `localSponsors[]` via `mergeSiteSponsors()` (P8)                |
| `categories`       | Fusion NEOPRO/Club (locked prend le dessus)                                   |
| `timeCategories`   | Remplacement complet par le central + `restoreSecondaryVariants()` post-merge |
| `categoryMappings` | Remplacement complet par le central                                           |
| `settings`         | **JAMAIS écrasé** - Protégé localement                                        |
| `siteId`, `apiKey` | **JAMAIS écrasé** - Identifiants du boîtier                                   |

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

**Conflit de suppression** : Si l'opérateur club tente de supprimer du contenu NEOPRO depuis l'admin Pi :

1. L'action est bloquée côté Admin UI du Pi
2. Message d'erreur : "Ce contenu est géré par NEOPRO et ne peut pas être supprimé"

> **Note** : Cette protection s'applique uniquement côté Pi (clubs). Le Dashboard Central permet la suppression de tout contenu, y compris NEOPRO.

### 5.6 Nommage des vidéos déployées

Depuis décembre 2025, les vidéos poussées depuis le central conservent leur nom d'origine (ex. `Golden Cup.mp4`) au lieu d'un UUID Supabase illisible :

- **Sanitisation automatique** : caractères interdits (`<>:"/\|?*`), accents et espaces multiples sont nettoyés, l'extension reste en `.mp4`.
- **Conflits évités** : si un fichier existe déjà dans la catégorie ciblée, le sync-agent ajoute un suffixe (`Golden Cup (1).mp4`) avant l'écriture.
- **Traçabilité** : `configuration.json` stocke désormais le `filename` final _et_ le `name` (sans extension) pour que la télécommande et l'analytics puissent afficher un intitulé utilisateur.
- **Suppression sûre** : la commande `delete_video` s'appuie sur ce `filename` final tout en restant rétro-compatible avec les anciennes entrées basées sur `path`.

👉 Résultat : les opérateurs voient les mêmes intitulés sur le dashboard central, la télécommande et dans les exports analytics, ce qui simplifie le support.

### 5.7 Enrichissement des Variantes Secondaires

En configuration dual-display, chaque vidéo peut posséder une **variante secondaire** (`variants.secondary`) destinée au second écran. Ces variantes sont fragiles car le remplacement complet de `timeCategories` lors du merge (voir 5.3) peut les perdre. Pour garantir leur présence, un pipeline **defense-in-depth** à 3 niveaux intervient :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  PIPELINE VARIANTES SECONDAIRES                        │
│                     (Defense-in-Depth 3 niveaux)                       │
│                                                                        │
│  Niveau 1 — Central DB (avant envoi)                                   │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  enrichConfigWithSecondaryVariants()                              │ │
│  │  → Interroge la table secondary_variants en DB                    │ │
│  │  → Injecte variants.secondary dans chaque vidéo de la config     │ │
│  │  → La config envoyée au Pi contient déjà les variantes           │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│                              ▼                                         │
│  Niveau 2 — Pi deploy-video (téléchargement)                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  deploy-video télécharge les fichiers variantes secondaires       │ │
│  │  → Stockés dans videos-secondary/ (à côté de videos/)            │ │
│  │  → Le fichier physique est présent sur disque même si la config   │ │
│  │    perd temporairement la référence                               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│                              ▼                                         │
│  Niveau 3 — Pi config-merge (restauration post-merge)                 │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  restoreSecondaryVariants()                                       │ │
│  │  → Appelé après le remplacement de timeCategories (étape 4b)     │ │
│  │  → Compare la config mergée avec la config locale précédente      │ │
│  │  → Ré-injecte variants.secondary si absent dans la nouvelle      │ │
│  │    config mais présent dans l'ancienne                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pourquoi 3 niveaux ?**

| Niveau | Composant                             | Quand il intervient                | Ce qu'il protège                                      |
| ------ | ------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| 1      | `enrichConfigWithSecondaryVariants()` | Avant l'envoi de la config au Pi   | Cas nominal : la config part complète du central      |
| 2      | `deploy-video` → `videos-secondary/`  | Lors du téléchargement des vidéos  | Fichiers physiques présents même si config incomplète |
| 3      | `restoreSecondaryVariants()`          | Après le merge de `timeCategories` | Rattrapage si le central n'a pas inclus les variantes |

Le niveau 3 est le **filet de sécurité final** : lors d'un remplacement complet de `timeCategories` par le central, les vidéos de la boucle temporelle perdent leurs `variants.secondary`. La fonction `restoreSecondaryVariants()` dans `config-merge.js` parcourt les `loopVideos` de chaque time category et restaure les variantes depuis la config locale précédente en se basant sur le `path` de la vidéo comme clé de correspondance.

> **Important (ADR-032)** : `restoreSecondaryVariants()` est appelé dans **les deux modes** de `update-config.js` : après `mergeConfigurations()` en mode `merge` ET après `applyReplaceMode()` en mode `replace`. Sans cela, tout `update_config` en mode replace écrase les variants injectées localement par `deploySecondaryVariant()`. Un monitoring post-replace (`countSecondaryVariants`) log un warning si des variants sont perdues malgré la restauration.

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

### 7.3 Admin UI Pi - Gestion des Verrous (côté club uniquement)

```typescript
// raspberry/admin - Vérification avant modification (Pi uniquement)

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
                                               │      └─ remote_shell: rm -f VERSION + diagnostic
                                               │
                                               ├─ 2. await delay(3s)  ← commandes Pi en parallèle
                                               │
                                               └─ 3. sendOrQueue('update_software', { version, updateUrl, ... })
                                                      │
                                          Pi (sync-agent)
                                               │
                                               ├─ Download .tar.gz depuis CDN
                                               ├─ SHA256 checksum verify (retry 1x on mismatch)
                                               ├─ Extraction dans /tmp
                                               ├─ fixFileOwnership(VERSION, release.json)
                                               │      └─ sudo chown -R pi:pi + try/catch non-bloquant
                                               ├─ fs.copy() des fichiers extraits
                                               ├─ npm install
                                               ├─ Installation sudoers + systemd services
                                               ├─ startServices() (restart kiosk + app + nginx)
                                               │      └─ Si scheduleReboot=false : schedule restart sync-agent (5s)
                                               │      └─ Si scheduleReboot=true  : skip restart sync-agent
                                               ├─ emit update_progress { progress: 100, completed: true }
                                               └─ Si scheduleReboot=true : spawn('shutdown -r +0')
```

### Reboot post-OTA (v3.80.5+)

Le dashboard peut demander un reboot après OTA via `scheduleReboot: true`. Le mécanisme utilise `shutdown -r +0` (géré par systemd, survit au kill du process Node) au lieu de `setTimeout` + `spawn('reboot')`.

**Race condition corrigée (v3.80.5)** : avant, `startServices()` schedulait un restart du sync-agent à t+5s et le reboot était schedulé à t+10s. Le restart tuait le process Node et détruisait le timer de reboot → le Pi ne rebootait jamais. Fix : skip le restart sync-agent quand un reboot est prévu.

```
AVANT (bug) :
  t=0s  startServices() schedule restart sync-agent à t+5s
  t=0s  scheduleReboot schedule reboot à t+10s
  t+5s  systemctl restart neopro-sync-agent → KILL process → timer reboot PERDU
  t+10s reboot ne se déclenche jamais

APRÈS (fix) :
  t=0s  startServices() détecte scheduleReboot → skip restart sync-agent
  t=0s  spawn('sudo shutdown -r +0') → reboot immédiat via systemd
```

### Pré-migration (serveur → Pi)

Envoyée via `remote_shell` **avant** l'OTA pour supprimer les fichiers VERSION root:root hérités des anciennes versions (`sudo cp/tee`).

**Stratégie en 4 niveaux** (par fichier VERSION/release.json/version.json) :

| Niveau | Commande            | Condition de succès                         |
| ------ | ------------------- | ------------------------------------------- |
| 1      | `rm -f` (sans sudo) | Dossier parent `pi:pi` (cas standard)       |
| 2      | `sudo chown pi:pi`  | `NoNewPrivileges=false` ET sudoers installé |
| 3      | `sudo rm -f`        | `NoNewPrivileges=false`                     |
| 4      | Diagnostic          | Toujours — logge permissions pour debug     |

**Pièges connus :**

- **NE PAS appeler `apply-services`** dans la pré-migration — ça restart le sync-agent et déconnecte le socket
- **NE PAS utiliser `sed`** pour patcher le code du sync-agent — casse les `sudo cp` légitimes
- Sans le délai de 3s, les commandes s'exécutent en parallèle côté Pi (race condition `socket.on('command')`)
- **`NoNewPrivileges=true`** (Pi v3.10→v3.17) bloque tous les sudo du sync-agent

**Versions Pi affectées :**

| Plage       | VERSION copy                     | try/catch | NoNewPrivileges | Impact                  |
| ----------- | -------------------------------- | --------- | --------------- | ----------------------- |
| < v3.10     | `sudo cp`                        | Non       | Non installé    | OK                      |
| v3.10→v3.17 | `fs.copy()` sans protection      | Non       | Actif           | **BLOQUÉ** (EACCES 60%) |
| v3.20+      | `fs.copy()` + `fixFileOwnership` | Oui       | Retiré          | OK                      |

> **TODO** : Supprimer `applyPreUpdateMigration()` une fois NLF Handball (v3.17.1) mis à jour.

### Admin-server fix-ownership (v3.32.1+)

Route `POST /api/system/fix-ownership` : corrige ownership dossiers + fichiers via sudo. Localhost sans auth.

### Vérification checksum avec retry

Le sync-agent vérifie le SHA256 du package téléchargé avant extraction. En cas de mismatch (corruption FTP, download partiel), il re-télécharge et retente une fois :

1. **Premier essai** : `sha256sum` + comparaison taille fichier
2. **Mismatch** : log warn avec diagnostics (checksum attendu/reçu, taille attendue/réelle), suppression du fichier corrompu
3. **Retry** : re-download complet + seconde vérification
4. **Échec final** : log error, abort OTA

Code : `raspberry/sync-agent/src/commands/update-software.js` → `verifyChecksumWithRetry()`

### Monitoring

Métrique Prometheus : `neopro_ota_errors_total{error_type}` avec labels `permission`, `timeout`, `network`, `disk_full`, `cancelled`, `other`. Le retry côté Pi réduit les erreurs checksum remontées au serveur central.

La pré-migration logge un bloc `=== PRE-MIGRATION DIAG ===` avec les permissions exactes. Visible dans Railway logs.

## Auto-optimisation canal hotspot (v3.61+)

Depuis la v3.61, le sync-agent optimise automatiquement le canal WiFi du hotspot au boot (30s après démarrage, puis toutes les heures).

### Fonctionnement

`SafeNetworkOperations.autoOptimize()` exécute `_scanAndGetBestChannel()` :

1. Lit le canal actuel depuis `/etc/hostapd/hostapd.conf`
2. Scanne les réseaux WiFi visibles via `sudo iwlist wlan0 scan`
3. Répartit les réseaux sur les 3 canaux non-overlapping (1, 6, 11) :
   - Canal 1 : réseaux sur canaux 1-3
   - Canal 6 : réseaux sur canaux 4-8
   - Canal 11 : réseaux sur canaux 9-13
4. Compare le canal actuel avec le meilleur canal

### Seuils de déclenchement

| Paramètre              | Valeur | Description                                                   |
| ---------------------- | ------ | ------------------------------------------------------------- |
| `CONGESTION_THRESHOLD` | 5      | Nombre minimum de réseaux sur le canal actuel pour déclencher |
| `MIN_IMPROVEMENT`      | 3      | Différence minimum de réseaux entre canal actuel et meilleur  |

**Exemple** : Canal 1 avec 9 réseaux, Canal 6 avec 3 → switch (9 ≥ 5 ET 9-3 ≥ 3)

### Application

L'opération utilise la matrice de sécurité du `SafeNetworkOperations` :

| Profil réseau       | Action                                 |
| ------------------- | -------------------------------------- |
| SIMPLE, ETHERNET    | Restart hostapd direct                 |
| MESH, MESH_ISOLATED | Reboot différé (évite de couper wlan1) |
| ENTERPRISE          | Restart hostapd direct                 |

### Logs

```
# Changement de canal
SafeNetworkOperations: hotspot channel congested, optimizing { currentChannel: 1, currentCount: 9, bestChannel: 6, bestCount: 3 }

# Canal OK, pas de changement
SafeNetworkOperations: hotspot channel OK { currentChannel: 6, currentCount: 2, bestChannel: 6 }
```

### Coordination inter-processus des scans wlan1 (v3.84.9+)

Deux processus scannent wlan1 au boot : `hotspot-optimizer.sh` (shell, boot +12s) et `NetworkDetector.detect()` (Node.js, boot +60s). Le RTL8192EU est single-radio : chaque `iwlist wlan1 scan` coupe le carrier ~6s. Deux scans en < 120s → Livebox déassocie le client → perte carrier 2-3 min.

**Mécanisme de cache :**

```
                    ┌─────────────────────────────┐
  Boot +12s         │  hotspot-optimizer.sh        │
  (systemd)         │  iwlist wlan1 scan           │
                    │  → écrit /tmp/neopro-wlan1-  │
                    │    scan-cache + scan-ts       │
                    └──────────────┬────────────────┘
                                   │ fichier partagé
                    ┌──────────────▼────────────────┐
  Boot +60s         │  NetworkDetector.detect()     │
  (sync-agent)      │  _readScanCache()             │
                    │  → lit le cache (TTL 120s)    │
                    │  → ZERO scan supplémentaire   │
                    └───────────────────────────────┘
```

| Fichier                        | Rôle                                    |
| ------------------------------ | --------------------------------------- |
| `/tmp/neopro-wlan1-scan-cache` | Sortie brute `iwlist wlan1 scan`        |
| `/tmp/neopro-wlan1-scan-ts`    | Timestamp epoch du scan (pour TTL 120s) |

**Code :** `network-detector.js` → `_readScanCache()` / `_writeScanCache()` / `scanWifiNetworks()`
**Shell :** `hotspot-optimizer.sh` → `perform_single_scan()` écrit le cache si `SCAN_INTERFACE=wlan1`

**Gardes de régression :** 4 smoke tests dans `smoke.test.ts` vérifient la présence du cache et la coordination inter-processus.

---

## Événements HDMI & Failover (E-23 v3.84+)

> Synchronisation des événements HDMI entre le Pi edge et le central-server.

### Nouveaux événements Socket.IO (Pi → Central)

| Événement               | Direction       | Payload                                                               | Fréquence                                     |
| ----------------------- | --------------- | --------------------------------------------------------------------- | --------------------------------------------- | ------------- |
| `hdmi-status-update`    | Pi → Dashboard  | `{ hdmi0: string, hdmi1: string, dualDisplay: bool, failover: bool }` | Toutes les 10s                                |
| `hdmi-alert`            | Pi → Central    | `{ type: 'no_display'                                                 | 'wrong_port', hdmi0: string, hdmi1: string }` | Sur événement |
| `tv-role-promotion`     | Server → Client | `{ displayType: 'tv' }` (secondary → TV complet)                      | Sur failover                                  |
| `tv-role-demotion`      | Server → Client | `{ displayType: 'secondary' }` (TV → retour secondary)                | Sur restauration                              |
| `get-connected-clients` | Central → Pi    | Callback → `[{ role, displayType, ip, userAgent, connectedAt }]`      | Sur demande                                   |

### Heartbeat enrichi

Le heartbeat 30s inclut maintenant les champs HDMI :

```json
{
  "hostname": "neopro-club",
  "uptime": 86400,
  "hdmiStatus": {
    "hdmi0": "connected",
    "hdmi1": "disconnected",
    "dualDisplay": false,
    "failover": false,
    "wrongPort": false
  },
  "connectedClients": [
    {
      "role": "master",
      "displayType": "tv",
      "ip": "127.0.0.1",
      "userAgent": "Chromium/armv7l",
      "isKiosk": true,
      "connectedAt": "2026-02-27T10:00:00Z"
    }
  ]
}
```

### Pipeline de détection

```
udev event → neopro-hdmi-notify.sh → /tmp/hdmi-changed
                                           │
kiosk-watchdog.sh (5s loop) ───────────────┤
        │                                  │
        ├── Lit sysfs /sys/class/drm/*/status
        ├── Écrit /tmp/kiosk-status.json
        ├── Active LED/buzzer selon état
        │
        ▼
hdmi.service.js._getHdmiStatus()
        │
        ▼
state.service.js._hdmiState
        │
        ├── handlers.js → hdmi-status-update (10s)
        ├── handlers.js → hdmi-alert (événementiel)
        └── sync-agent → heartbeat → central-server
                                          │
                                          ▼
                         heartbeat.handler.ts
                          ├── Met à jour sites.hdmi_status
                          └── Crée alertes (no_display, hdmi_wrong_port)
```

---

## Race Condition Master-Slave (ADR-033 v3.88.1+)

> Protection contre les messages `tv-loop-state` obsolètes (stales) qui tuent la vidéo manuelle sur le slave.

### Le problème

Quand l'utilisateur déclenche une vidéo manuelle via la télécommande :

```
Timeline:
t=0    Master émet tv-loop-state (isManualMode: false) — état boucle normal
t=10ms Serveur reçoit "action" → io.emit('action', data) à ALL (master + slave)
t=15ms Slave reçoit "action" → play() → isManualMode = true ✓
t=20ms Le tv-loop-state stale (émis à t=0) arrive au slave
       → handleMasterLoopState CAS 2 : isManualMode=true + state.isManualMode=false
       → stopManualVideoAndReturnToLoop() ✗ (trop tôt !)
```

Résultat : le slave revient à la boucle au lieu de jouer la vidéo manuelle.

### La solution (deux corrections complémentaires)

**Fix A — Master** : Émettre `tv-loop-update` avec `isManualMode: true` IMMÉDIATEMENT dans `play()`, pas seulement après le délai 2×rAF + 200ms. Le serveur met à jour `loopState` avant que le stale arrive.

**Fix B — Slave** : Ajouter `_lastActionReceivedAt = Date.now()` dans le handler `action`. Dans `handleMasterLoopState` CAS 2, ignorer les `tv-loop-state` avec `isManualMode: false` reçus dans les 2s suivant une action locale (guard anti-stale).

### Monitoring

Le guard incrémente `transitionMetrics.staleLoopStateCount` à chaque occurrence. Ce compteur :

- Est émis toutes les 30s via Socket.IO `transition-metrics` (même par le slave)
- Est agrégé dans `state.service.js` côté Pi
- Remonte au central via heartbeat → `metricsService.recordTransitionMetrics()`
- Exposé en Prometheus : `neopro_video_stale_loop_state_total`
- Loggé en `logger.warn` dans `heartbeat.handler.ts` si > 0

**Seuil d'alerte** : > 10 occurrences/heure indique un problème de latence réseau ou de timing.

### Fichiers impactés

| Fichier                                            | Modification                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `raspberry/src/app/components/tv/tv.component.ts`  | `_lastActionReceivedAt`, guard CAS 2, émission immédiate, compteur |
| `raspberry/server/services/state.service.js`       | `staleLoopStateCount` dans `_transitionMetrics`                    |
| `central-server/src/handlers/heartbeat.handler.ts` | Log warning si staleLoopStateCount > 0                             |
| `central-server/src/services/metrics.service.ts`   | Compteur Prometheus `neopro_video_stale_loop_state_total`          |

---

## Révélation Synchronisée (ADR-034 v3.89.0+)

> Synchronisation de la révélation des vidéos manuelles entre master et slaves pour éliminer le décalage visuel (~300ms → ~50ms).

### Le problème

Quand l'utilisateur déclenche une vidéo manuelle, le serveur broadcaste `action` à tous les clients simultanément. Chaque client charge et révèle la vidéo indépendamment, mais les temps de chargement diffèrent (fichiers primary vs secondary variants, Pi vs PC, réseau local) → décalage de 150ms à 450ms entre les écrans.

### La solution (preload/reveal en 2 étapes)

**Master** : Comportement inchangé — `play()` charge et révèle la vidéo normalement.

**Slaves** : Au lieu d'appeler `play()` sur `action`, appellent `preloadManualVideo()` qui prépare tout (freeze-frame, overlay noir, chargement vidéo dans le player inactif) SANS révéler.

```
Timeline:
t=0     Server: io.emit('action', X) → broadcast à ALL
t=5ms   Master: play(X) — commence le chargement
t=5ms   Slave: preloadManualVideo(X) — commence le chargement
t=50ms  Slave: vidéo prête, attend signal...
t=100ms Master: vidéo chargée + 2×rAF + 200ms → révèle !
        Master: emit tv-loop-update { isManualMode: true, manualVideoVisible: true }
t=110ms Slave: reçoit manualVideoVisible: true → revealPreloadedVideo()
        → écart ≈ 10ms (latence Socket.IO locale)
```

### Trois sous-cas dans handleMasterLoopState CAS 1

| Sous-cas | Condition                                          | Action                                                              |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| 1a       | `manualVideoVisible === false`                     | Preload (safety net si `action` manqué par le slave)                |
| 1b       | `manualVideoVisible === true` + preload en attente | `revealPreloadedVideo()` — cas normal                               |
| 1c       | `manualVideoVisible === true` + pas de preload     | `play()` directement — backward compat (vieux master sans le champ) |

### Nettoyage

Si le master revient à la boucle avant d'émettre `manualVideoVisible: true` (ex: vidéo très courte, annulation), `handleMasterLoopState` CAS 2 appelle `cleanupPreloadState()` qui stop le player préchargé et reset l'état.

### Monitoring

Deux compteurs dédiés, pipeline identique à ADR-033 :

| Métrique              | Description                         | Prometheus                           |
| --------------------- | ----------------------------------- | ------------------------------------ |
| `preloadRevealCount`  | Révélations preload→reveal réussies | `neopro_video_preload_reveal_total`  |
| `preloadCleanupCount` | Preloads avortés (retour boucle)    | `neopro_video_preload_cleanup_total` |

Pipeline : `tv.component.ts` (slave) → Socket.IO `transition-metrics` (30s) → `state.service.js` (agrégation) → heartbeat → `heartbeat.handler.ts` → `metricsService` → Prometheus.

Un ratio `preloadCleanupCount/preloadRevealCount` élevé indique des vidéos manuelles très courtes ou des annulations fréquentes — pas un bug mais une information opérationnelle utile.

### Backward compatibility

- **Vieux slaves** (sans preload) : ignorent `manualVideoVisible`, continuent à `play()` sur `action` → aucune régression
- **Vieux masters** (sans `manualVideoVisible`) : le champ est absent dans `tv-loop-state` → sous-cas 1c fait `play()` directement → aucune régression

### Fichiers impactés

| Fichier                                            | Modification                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `raspberry/src/app/services/socket.service.ts`     | `manualVideoVisible: boolean` dans `LoopState`                                       |
| `raspberry/src/app/components/tv/tv.component.ts`  | `preloadManualVideo()`, `revealPreloadedVideo()`, `cleanupPreloadState()`, compteurs |
| `raspberry/server/services/state.service.js`       | `manualVideoVisible` dans `_loopState`, compteurs dans `_transitionMetrics`          |
| `central-server/src/types/index.ts`                | `preloadRevealCount`, `preloadCleanupCount` dans `TransitionMetrics`                 |
| `central-server/src/services/metrics.service.ts`   | 2 compteurs Prometheus                                                               |
| `central-server/src/handlers/heartbeat.handler.ts` | Log info pour les compteurs ADR-034                                                  |

---

## Historique des Versions

| Version | Date       | Auteur        | Modifications                                                                                                        |
| ------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2024-12-09 | Claude/NEOPRO | Création initiale                                                                                                    |
| 1.1     | 2025-12-16 | Claude/NEOPRO | Ajout Command Queue pour sites offline                                                                               |
| 1.2     | 2026-01-06 | Claude/NEOPRO | Ajout VideoWatcher et sync_local_state avec vidéos                                                                   |
| 1.3     | 2026-01-07 | Claude/NEOPRO | Documentation merge sponsors, modes merge/replace, fix                                                               |
| 1.4     | 2026-01-08 | Claude/NEOPRO | `deploy_video` utilise `sendOrQueue()` (offline support)                                                             |
| 1.5     | 2026-01-24 | Claude/NEOPRO | Fix race condition sync_local_state après update_config                                                              |
| 1.6     | 2026-02-12 | Claude/NEOPRO | Ajout multi-config profiles (sync_profiles, switch_profile, profile-switch)                                          |
| 1.7     | 2026-02-15 | Claude/NEOPRO | Ajout section OTA : pré-migration, race condition, monitoring                                                        |
| 1.8     | 2026-02-15 | Claude/NEOPRO | Réécriture pré-migration : rm sans sudo, diagnostic, versions affectées                                              |
| 1.9     | 2026-02-15 | Claude/NEOPRO | Connexion locale persistante : relay screenshot et heartbeat via local-socket.js                                     |
| 2.0     | 2026-02-16 | Claude/NEOPRO | Screenshot error response : réponse immédiate en cas d'échec + métriques Prometheus                                  |
| 2.1     | 2026-02-17 | Claude/NEOPRO | OTA checksum retry : re-download + vérification 1x en cas de mismatch SHA256                                         |
| 2.2     | 2026-02-17 | Claude/NEOPRO | Screenshot HTTP response : remplacement du relay Socket.IO room par request-response HTTP                            |
| 2.3     | 2026-02-18 | Claude/NEOPRO | Sync sponsors Dashboard → Pi : `siteSponsors` dans payload déploiement, `mergeSiteSponsors()`, monitoring Prometheus |
| 2.4     | 2026-02-19 | Claude/NEOPRO | Auth retry transitoire (5 tentatives), auto-optimisation canal hotspot, fix daily stats `screen_time_seconds`        |
| 2.5     | 2026-02-21 | Claude/NEOPRO | Événement `content_received` dans sync-history, bannière sync contenu admin Pi, métriques sponsor health Prometheus  |
| 2.6     | 2026-02-21 | Claude/NEOPRO | Pipeline analytics unifié (video_plays), suppression sponsor-impressions.js, tables campaigns + scheduled_reports    |
| 2.7     | 2026-02-22 | Claude/NEOPRO | Cloud remote relay chain : détection zombie, fix socket.data, handler match-info-updated, monitoring Prometheus      |
| 2.8     | 2026-02-24 | Claude/NEOPRO | Fix race condition reboot post-OTA : `shutdown -r +0` via spawn, skip restart sync-agent quand reboot prévu          |
| 2.9     | 2026-02-27 | Claude/NEOPRO | E-23 : événements HDMI & failover, heartbeat enrichi (hdmiStatus, connectedClients), pipeline détection              |
| 3.0     | 2026-03-01 | Claude/NEOPRO | ADR-033 : fix race condition master-slave (guard anti-stale), monitoring staleLoopStateCount, secondary variant path |
| 3.1     | 2026-03-01 | Claude/NEOPRO | ADR-034 : révélation synchronisée preload/reveal, monitoring preloadRevealCount/preloadCleanupCount                  |

---

_Document généré pour le projet NEOPRO - Confidentiel_
