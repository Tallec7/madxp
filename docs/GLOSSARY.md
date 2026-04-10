# Glossaire Neopro

> Termes métier et techniques utilisés dans le projet Neopro.

---

## Termes Métier

### Site

Un **club sportif** géré par Neopro. Deux types existent :

- **Pi** (`site_type = 'pi'`) : équipé d'un Raspberry Pi connecté à une TV, provisionné depuis le terminal du Pi via `setup-new-club.sh` / `register-site.js`
- **SaaS** (`site_type = 'saas'`) : fonctionne dans un navigateur web, créé depuis le dashboard central

Chaque site possède un `api_key` unique (SHA256) pour l'authentification avec le serveur central. Les profils de configuration peuvent être copiés entre sites (tous types confondus) via `POST /api/sites/:id/copy-config`.

**Synonymes** : Club, Installation

**Exemple** : "Le site RENNES-VOLLEY est offline depuis 2 heures."

### Campagne (Campaign)

**Stratégie de déploiement annonceur** avec ciblage par sports, régions ou groupes. Contient des vidéos avec poids de rotation et des sites résolus dynamiquement. Statuts : `draft` → `active` → `paused` → `completed`.

**Tables** : `campaigns`, `campaign_videos`, `campaign_sites`

**Voir aussi** : Target Criteria, Advertiser

### CPM Effectif (Effective CPM)

**Coût réel pour 1000 impressions**, calculé depuis `budget_cents / (total_impressions / 1000)`. Affiché dans les stats campagne.

### Boîtier

Le **Raspberry Pi 4** physique installé dans un club. Contient l'application Angular, le serveur Socket.IO local, le sync-agent, et les vidéos.

**Chemin type** : `/home/pi/neopro/`

### Flotte

L'ensemble des boîtiers Raspberry Pi gérés depuis le dashboard central. Neopro gère actuellement 50+ boîtiers.

**Métrique clé** : Taux de disponibilité de la flotte (% sites en ligne)

### Déploiement

Action d'**envoyer une vidéo** du cloud vers un ou plusieurs Raspberry Pi. Le déploiement peut cibler un site unique ou un groupe de sites.

**États** : `pending` → `in_progress` → `completed` | `failed`

### Heartbeat

Signal envoyé **toutes les 30 secondes** par chaque Raspberry Pi au serveur central via WebSocket. Contient les métriques système (CPU, RAM, température, disque).

**Timeout** : 60 secondes (site marqué offline après 2 heartbeats manqués)

### Sync

**Synchronisation bidirectionnelle** entre le Raspberry Pi et le cloud :

- **Pi → Cloud** : Métriques, analytics, liste vidéos locales
- **Cloud → Pi** : Configuration, commandes, vidéos

### Config Mirror (Local Config Mirror)

Copie de la **configuration locale du Pi** stockée dans la base de données centrale (colonne `local_config_mirror` de la table `sites`). Permet de voir l'état réel du boîtier depuis le dashboard.

### Config Profile

**Profil de configuration** enregistré pour un site. Chaque profil contient une configuration complète (sponsors, catégories, vidéos). Permet d'avoir N configurations sélectionnables depuis la télécommande (ex: "Standard", "Tournoi U15", "Match Pro"). Table `config_profiles`. Sites mono-config : un seul profil "Par défaut", sélecteur masqué.

### VideoWatcher

Service sur le Raspberry Pi qui **surveille le dossier `/home/pi/neopro/videos/`** et remonte automatiquement la liste des vidéos présentes vers le cloud.

### LocalVideo

**Métadonnées d'une vidéo** présente physiquement sur un Raspberry Pi : filename, path, category, subcategory, size, lastModified.

---

## Termes Utilisateurs

### Super Admin

Rôle avec **accès complet** : gestion de tous les utilisateurs, sites, contenus, analytics, et configuration système.

### Admin

Rôle avec accès à **tous les sites** mais sans gestion des utilisateurs ni configuration système.

### Operator

Rôle avec accès **limité à certains clubs** assignés. Peut uploader des vidéos et gérer la configuration des sites assignés.

### Advertiser (Annonceur)

Entreprise qui **diffuse des publicités** sur les télévisions des clubs. A accès uniquement à ses propres vidéos et statistiques d'impressions.

### Agency (Agence)

Structure qui **gère plusieurs annonceurs**. Vue consolidée des statistiques de tous les annonceurs liés.

### Viewer

Rôle en **lecture seule** : peut voir les sites et statistiques mais ne peut rien modifier.

### Site Sponsor

**Sponsor local d'un club** — entité unifiée représentant un sponsor (local ou réseau NEOPRO) pour un site donné. Table `site_sponsors`. Chaque site_sponsor a un `source` (`local` ou `neopro`), des vidéos associées (`site_sponsor_videos`), et peut recevoir des impressions trackées. Permet la génération de rapports PDF par sponsor.

**Voir aussi** : Advertiser, Magic Link

### Portail Annonceur (Advertiser Portal)

**Espace authentifié pour annonceurs Neopro** (`/advertiser-portal`). Vue cross-clubs avec KPIs, sites, vidéos et campagnes. Distinct du portail sponsor local (magic link, mono-club).

**Voir aussi** : Advertiser, Campagne, Sponsor Portal

### Magic Link

**Lien d'accès token-based** permettant à un sponsor d'accéder à ses statistiques de visibilité sans compte utilisateur. Généré par l'opérateur via `POST /api/sites/:siteId/sponsors/:sponsorId/access-link`. Le token est hashé (SHA-256) et stocké dans `sponsor_access_tokens` avec une expiration de 30 jours. URL : `/sponsor-access?token=xxx`.

---

## Termes Techniques

### Target Criteria

**Critères JSONB de ciblage campagne** (`sports[]`, `regions[]`, `group_ids[]`, `min_audience`). Résolus dynamiquement via `resolveSitesByCriteria()`.

**Voir aussi** : Campagne

### Phase de Match

Moment du match qui détermine **quelle playlist de vidéos est jouée** :

| Phase             | ID        | Icône | Description                   |
| ----------------- | --------- | ----- | ----------------------------- |
| Boucle par défaut | `neutral` | -     | Hors match, playlist standard |
| Avant-match       | `before`  | 🏁    | Accueil des spectateurs       |
| Pendant le match  | `during`  | ▶️    | Mi-temps, temps morts         |
| Après-match       | `after`   | 🏆    | Célébrations, résultats       |

### TimeCategory

**Configuration d'une phase** avec ses vidéos et paramètres. Contient un `id`, `name`, `icon`, et `loopVideos[]`.

### LoopVideo

Une **vidéo dans une boucle de phase**. Structure : `{ name, path, type, weight?, pinned?, variants? }`.

- **`weight`** (1-10, défaut 1) : Facteur de pondération. Plus le poids est élevé, plus la vidéo passe souvent. Ex: sponsor Or ×4, Argent ×2, Bronze ×1.
- **`pinned`** (boolean) : Si `true`, la vidéo reste fixée à sa position d'origine dans la boucle (ex: intro Neopro toujours en 1ère position). Les vidéos épinglées ne participent pas au scheduling Bresenham.
- **`variants`** (optionnel) : chemins alternatifs par type d'écran : `{ secondary?: string }`. Si une variante `secondary` existe, l'écran secondaire utilisera ce chemin au lieu du `path` principal.

### Bresenham (smooth scheduling)

**Algorithme de distribution** des vidéos pondérées dans la boucle de lecture (v3.111+). Chaque vidéo accumule son poids à chaque itération → la vidéo avec le plus gros accumulateur est sélectionnée → son accumulateur est réduit du total. Distribue les vidéos de façon régulière sur toute la playlist (×4 = gap ~3.3, ×10 = gap ~1.8), contrairement à un algorithme greedy qui front-load le sponsor dominant. Contrainte anti-consécutif par sponsor préservée. Déterministe : même input → même output (essentiel pour la sync dual-display). Fichier : `raspberry/src/app/utils/weighted-playlist.ts`.

### CategoryMapping

**Association** entre une catégorie locale du Pi et un type analytics standardisé pour le reporting.

| Type Analytics | Couleur | Exemples                    |
| -------------- | ------- | --------------------------- |
| `sponsor`      | Bleu    | SPONSORS, PUBS, PARTENAIRES |
| `jingle`       | Vert    | JINGLES, BUTS, ANIMATIONS   |
| `ambiance`     | Violet  | AMBIANCE, MUSIQUE           |
| `other`        | Gris    | Tout le reste               |

### RemotePreview

**Simulation visuelle** de la télécommande Pi dans le dashboard central. Permet de voir et tester l'interface de contrôle.

### Écran Secondaire (Secondary Display)

**Sortie HDMI secondaire** du Raspberry Pi, alimentant un écran différent de la TV principale. Peut être un panneau LED bandeau (1920×384), un écran géant, un affichage tribunes, etc. Le terme "secondaire" remplace "LED" (trop restrictif) depuis v3.80.7.

**Architecture** : 2e instance Chromium ouverte sur `/secondary` (HDMI 1), même Angular app avec `displayType='secondary'`. Le watchdog détecte la connexion HDMI 1 via DRM (`/sys/class/drm/card1-HDMI-A-2/status`).

**Config** : Détection 100% hardware (DRM sysfs + xrandr). Les anciennes colonnes DB `secondary_display_enabled` et `secondary_display_resolution` sont DEPRECATED depuis v3.98.7 — le Pi ignore ces flags.

**Variantes** : Les vidéos peuvent avoir une variante `display_type='secondary'` dans `video_variants`, adaptée aux dimensions de l'écran secondaire.

**Synonymes historiques** : LED, panneau LED (obsolètes depuis v3.80.7)

### Double-Buffer Vidéo

Technique utilisant **deux éléments `<video>`** superposés pour éliminer les flash noirs lors des transitions. Pendant qu'une vidéo joue, la suivante est préchargée.

### Golden Image

**Image SD pré-configurée** permettant de déployer rapidement un nouveau Raspberry Pi par simple clonage de carte SD.

### Canary Deployment

**Déploiement progressif** d'une mise à jour : 10% des sites d'abord, puis 50%, puis 100%. Permet de détecter les problèmes avant impact global.

---

## Termes Infrastructure

### Central Server

**API backend** Node.js/Express hébergée sur Railway. Gère l'authentification, les données, et le protocole WebSocket.

### Central Dashboard

**Interface d'administration** Angular hébergée sur Hostinger. Permet de gérer la flotte, les contenus, et les analytics.

### Sync-Agent

**Service Node.js** sur le Raspberry Pi qui maintient la connexion WebSocket avec le cloud et exécute les commandes distantes.

### Command Queue

**File d'attente de commandes** pour les sites offline. Les commandes sont stockées et envoyées automatiquement à la reconnexion du Pi.

### RLS (Row-Level Security)

**Sécurité au niveau ligne** de PostgreSQL. Filtre automatiquement les données selon le rôle de l'utilisateur connecté.

### Correlation ID

**Identifiant unique** généré pour chaque requête HTTP. Permet de tracer une requête à travers tous les logs et services.

### Rate Limiting

**Limitation du nombre de requêtes** par utilisateur et par endpoint. Protège l'API contre les abus et les attaques DDoS.

---

## Termes Protocole Socket.IO

### Register

Événement envoyé par le Pi à la connexion pour **s'authentifier** avec son `siteId` et `apiKey`.

### Heartbeat

Événement périodique contenant les **métriques système** : CPU, mémoire, température, espace disque.

### Sync Local State

Événement contenant l'**état complet du Pi** : configuration, liste des vidéos locales, espace de stockage.

### Deploy Video

Commande du cloud vers le Pi pour **télécharger et installer une nouvelle vidéo**.

### Update Config

Commande du cloud vers le Pi pour **mettre à jour la configuration** (sponsors, catégories, paramètres).

### Sync Profiles

Commande du cloud vers le Pi pour **synchroniser tous les profils de configuration**. Écrit les profils dans `profiles/` et génère `profiles/clubs.json`.

### Switch Profile

Commande pour **changer le profil actif** d'un site. Peut être déclenchée depuis le dashboard (`switch_profile` via WebSocket) ou depuis la télécommande locale (`profile-switch` via Socket.IO local).

### Execute Command

Commande générique pour **exécuter une action** sur le Pi (restart, diagnostic, shell command).

---

## Termes Stockage

### FTP Storage

Backend de stockage **unique** sur Hostinger, unifié via `storage.service.ts`. Upload en streaming depuis le disque (zéro buffer mémoire). Les vidéos sont accessibles via URL publique `https://kalonpartners.bzh/neopro-video/`.

### Supabase Storage

_Obsolète depuis Phase 1 (février 2026)_ — Le stockage est désormais FTP uniquement. Supabase Storage n'est plus utilisé.

### Storage Path

Chemin de stockage d'une vidéo sur FTP : `filename.mp4`

---

## Termes Architecture (central-server)

### Repository Pattern

Pattern d'accès base de données utilisé dans central-server. 22 repositories héritant de `BaseRepository<T>` encapsulent toutes les requêtes SQL. Aucun `pool.query()` direct n'est autorisé dans les controllers (ESLint enforced).

### ProfileConfigService

**Service Angular** sur le Raspberry Pi qui gère la sélection et le chargement des profils de configuration en mode production. Équivalent de `DemoConfigService` pour le mode multi-config. Stocke le profil sélectionné dans `localStorage` (`neopro_selected_profile`).

### Socket Handler

Fonction spécialisée dans `src/handlers/` qui traite un événement Socket.IO spécifique. 9 handlers extraits de `socket.service.ts` lors du refactoring Phase 7.2 (heartbeat, config-sync, deploy-progress, etc.).

### BaseRepository

Classe abstraite générique fournissant les opérations CRUD communes (findById, findAll, create, update, delete, exists, count). Tous les repositories du central-server en héritent.

---

## Acronymes

| Acronyme | Signification                     |
| -------- | --------------------------------- |
| API      | Application Programming Interface |
| CLI      | Command Line Interface            |
| CORS     | Cross-Origin Resource Sharing     |
| CRUD     | Create, Read, Update, Delete      |
| E2E      | End-to-End (tests)                |
| FTP      | File Transfer Protocol            |
| JWT      | JSON Web Token                    |
| MFA      | Multi-Factor Authentication       |
| OTA      | Over-The-Air (mise à jour)        |
| PWA      | Progressive Web App               |
| RLS      | Row-Level Security                |
| TOTP     | Time-based One-Time Password      |
| WS       | WebSocket                         |

---

## Voir aussi

- [CLAUDE.md](../CLAUDE.md) - Guide technique complet
- [ARCHITECTURE.md](technical/ARCHITECTURE.md) - Architecture système
- [ONBOARDING.md](ONBOARDING.md) - Guide premier jour

---

_Dernière mise à jour : 18 mars 2026_
