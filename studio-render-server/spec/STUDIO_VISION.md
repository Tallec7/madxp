# Spec — Studio de templates clubs (V1)

> Document de cadrage produit + technique pour le Studio Neopro. Cible : SaaS multi-club self-serve à terme, V1 = outil interne Neopro.
> Stack : Angular + Node (NestJS recommandé) + Postgres + BullMQ/Redis + Remotion (worker Railway en V1), assets sur FTP.
> Document vivant — toute décision tranchée se reflète ici, pas dans les conversations.

---

## 0. Prérequis à analyser AVANT le premier commit

Le studio se branche sur un système Neopro existant. Cinq points à clarifier avec le dev Neopro avant J0, sous peine de refactor lourd :

### 0.1 Auth & Users

- [ ] Le système existant a-t-il déjà une table `users` ? Schéma exact (id, email, password hash, role) ?
- [ ] Auth gérée comment (JWT, sessions, OAuth, SSO) ?
- [ ] Peut-on **réutiliser** l'auth existante (recommandé) ou faut-il un service distinct fédéré plus tard ?
- [ ] Existe-t-il déjà des notions de **rôles / permissions** ? Si oui, on s'aligne. Sinon on introduit le RBAC ici.

### 0.2 Clubs (tenants)

- [ ] Y a-t-il déjà une entité "Club" / "Tenant" / "Organization" dans Neopro ?
- [ ] Si oui : schéma, contraintes, relations existantes — on étend, on ne duplique pas.
- [ ] Si non : on la crée ici et Neopro l'adopte plus tard.

### 0.3 Storage FTP

- [ ] Hôte, credentials, conventions de path (`/<club_slug>/<year>/...` ?)
- [ ] Quotas, politique de retention, backup ?
- [ ] URL de lecture publique pour servir les renders au front (CDN devant ? signed URLs ?)
- [ ] Format des chemins pour qu'ils restent stables si on migre vers S3 plus tard.

### 0.4 Railway

- [ ] Workspace / projet Neopro existant ou nouveau ?
- [ ] Process types disponibles (web, worker), limites RAM/CPU par plan
- [ ] Postgres et Redis managés disponibles ?
- [ ] Variables d'env, secrets management, déploiement (CLI / GitHub action / autre)

### 0.5 Billing (futur, mais structurer dès J0)

- [ ] Système de facturation existant Neopro ? (Stripe, autre)
- [ ] Si oui, peut-on logger les compteurs ici et laisser la facturation côté Neopro ?
- [ ] Modèle confirmé : **par club (abo) + par render (consommation) + par template activé (catalogue)** → on track les 3 compteurs dès J0.

**Livrable de cette phase** : un mini-doc "intégration Neopro" qui fige les conventions, validé par le dev Neopro avant tout code.

---

## 1. Vision & principes directeurs

**Vision** : un opérateur (Neopro V1, puis club V2) déclenche **1 input métier** et obtient **N visuels finis**, brandés au club, dans tous les formats nécessaires, prêts à publier.

**5 principes qui doivent guider chaque décision tech** :

1. **Tout est instance de template** — "but de match", "shooting joueur", "anniv", "résultat tournoi" sont la même chose techniquement : un **événement typé** + une **recette** (templates × formats × mapping de champs). Le batch actuel est juste le type d'événement `shooting_joueur`.
2. **Templates déclaratifs (manifest)** — chaque template Remotion vient avec un `manifest.json` qui décrit ses champs, ses bindings, ses slots sponsors, ses formats. **Aucun mapping hardcodé.** C'est le prérequis du futur éditeur no-code et la base de toute la mécanique.
3. **Multi-tenant by design, mono-tenant en V1** — toutes les tables ont `club_id` dès J1. Coût marginal de dev, débloque le SaaS sans migration.
4. **Résolution en cascade partout** — `défaut template < brand kit club < override instance`. C'est déjà ton pattern actuel (`défaut < clubs/config.json < CSV`), à généraliser.
5. **Le rendu est une commodité asynchrone** — jamais bloquant pour l'UI. Job queue + workers. L'utilisateur soumet, voit l'état, récupère les fichiers quand prêts.

---

## 2. Modèle de données (le cœur — à figer avant tout)

### 2.1 Entités principales

```
Club (tenant)
 ├── BrandKit          (1-1)
 ├── User[]            (membres avec rôles)
 ├── Player[]          (bibliothèque joueurs)
 ├── Sponsor[]         (sponsors actifs du club)
 ├── EventType[]       (types d'événements activés pour ce club)
 ├── Event[]           (instances déclenchées)
 │    └── Render[]     (1 par template×format×langue généré)
 ├── Template[]        (catalogue actif pour ce club)
 ├── SocialAccount[]   (connecteurs publication)
 └── UsageCounter      (renders, events, templates actifs - billing)

Template (catalogue global, géré côté admin Neopro)
 ├── manifest          (cf §2.4)
 ├── remotionCompoId
 └── isActive, isPremium, etc.

EventType (catalogue global)
 ├── inputSchema       (JSON Schema des champs métier)
 ├── defaultRecipe     (templates × formats par défaut)
 └── label, icon, category

Scenario (regroupement d'Events)
 ├── type              ('match_day', 'shooting_session', 'campagne'...)
 ├── metadata          (contexte partagé pour le mapping auto)
 └── Event[]
```

### 2.2 Le concept central : `Event` → `Render[]`

Un **Event** = "quelque chose à communiquer" (but, compo, signature, anniv, shooting, résultat U13...). Il porte :

- `eventTypeId` (ex. `match_goal`)
- `clubId`
- `payload` (les données métier, validées contre `EventType.inputSchema`)
- `scenarioId` (optionnel — appartient à un match-day, une session...)
- `status` (`draft`, `queued`, `rendering`, `ready`, `in_review`, `approved`, `published`, `rejected`, `archived`)
- `recipe` (résolue à la création : quels templates × formats × langues, possibilité d'override vs `defaultRecipe`)
- `createdBy`, `approvedBy`, `publishedAt`...

Quand l'Event passe en `queued`, le système crée N **Render** (un par template×format×langue de la recette), chacun avec son propre statut et son URL FTP de sortie.

**Pourquoi c'est central** : ça unifie création unitaire, batch événementiel, packs match-day, variantes auto. Ce sont juste **différents flux de création d'Events**.

### 2.3 Brand Kit (couche de résolution)

```
BrandKit
 ├── colors[]              (primary, secondary, accent, neutral...)
 ├── logos[]               (principal, monochrome clair/sombre, favicon)
 ├── fonts[]               (display, body — Google Fonts ID ou upload .woff2)
 ├── socialHandles         (insta, twitter, tiktok, facebook)
 ├── defaultLanguage
 ├── slotAssignments       (mapping slot → Sponsor)  ← cf §3.9
 └── templateOverrides[]   (par template, valeurs custom)
```

Les templates Remotion lisent les champs brand via un **résolveur unique** (existe déjà chez toi en CLI, à porter en service Node partagé front+back) :

```
valeurFinale = override(Event.payload)
            ?? override(Template.clubOverride)
            ?? BrandKit.value
            ?? Template.manifest.defaults
```

### 2.4 Le manifest de template (NOUVEAU — pierre angulaire)

Chaque template Remotion vit dans son dossier avec un `manifest.json` qui **déclare** son contrat :

```json
{
  "id": "but_generique",
  "version": "1.0.0",
  "label": "But - Générique",
  "description": "Card animée annonçant un but, version sans photo",
  "category": "match",
  "compatibleEventTypes": ["match_goal"],
  "inputSchema": {
    "type": "object",
    "required": ["scorerPlayerId", "minute"],
    "properties": {
      "scorerPlayerId": { "type": "string", "ref": "Player" },
      "minute": { "type": "integer", "minimum": 1, "maximum": 130 },
      "assistPlayerId": { "type": "string", "ref": "Player" },
      "newScore": { "type": "string", "pattern": "^\\d+-\\d+$" }
    }
  },
  "bindings": {
    "scorerName": { "source": "event.payload.scorerPlayerId", "transform": "player.fullName" },
    "scorerNumber": { "source": "event.payload.scorerPlayerId", "transform": "player.number" },
    "minute": { "source": "event.payload.minute" },
    "clubLogo": { "source": "brandKit.logos.primary" },
    "primaryColor": { "source": "brandKit.colors.primary" }
  },
  "slots": {
    "sponsor_main": {
      "type": "image",
      "required": false,
      "constraints": { "ratio": "1:1", "maxKB": 500 }
    },
    "sponsor_strip": { "type": "image", "required": false, "constraints": { "ratio": "4:1" } }
  },
  "formats": [
    { "id": "story_9_16", "width": 1080, "height": 1920, "compositionId": "ButGeneriqueStory" },
    { "id": "post_1_1", "width": 1080, "height": 1080, "compositionId": "ButGeneriquePost" },
    { "id": "post_4_5", "width": 1080, "height": 1350, "compositionId": "ButGeneriquePost45" }
  ],
  "languages": ["fr", "en"],
  "translatableFields": ["bottomBanner.text"],
  "defaults": {
    "photoZoom": 3,
    "logoScaleFrom": 0.5,
    "logoScaleTo": 2.5
  }
}
```

**Pourquoi c'est structurant dès J0** :

- L'API génère le form Angular dynamiquement depuis `inputSchema` (lib `@ngx-formly`)
- Le résolveur Brand Kit lit `bindings` sans connaître chaque template
- Les slots sponsors sont déclarés → table `Sponsor` peut s'y connecter
- Les formats sont déclarés → la matrice variantes auto se construit toute seule
- Le futur **éditeur no-code génèrera ce manifest**, le runtime n'a pas à changer

**Coût V1** : ~1-2 jours pour migrer les 4 templates existants vers ce format. Bénéfice : tout le reste devient propre.

---

## 3. Les 9 fonctionnalités V1

### 3.1 Création unitaire

**C'est quoi** : un opérateur ouvre le studio, clique "Nouveau", choisit un `EventType` (ex. "But"), remplit un formulaire auto-généré depuis `inputSchema`, voit une preview, valide.

**UI** :

- Liste des EventTypes avec recherche / filtres par catégorie
- Form auto-généré (`@ngx-formly` côté Angular, alimenté par le JSON Schema du manifest)
- Panneau de preview à droite — **Remotion Player** embarqué (rendu côté client, instantané, sans toucher au queue cloud) — cf §4.5
- Bouton "Lancer le rendu final" → crée l'Event + Renders en `queued`

**Croisement** : c'est la **brique élémentaire**. Toutes les autres features sont des manières plus rapides de créer des Events.

**Pourquoi commencer par là** : c'est l'écran qui valide toute la chaîne (modèle de données + manifest + brand kit + rendu cloud + workflow). Une fois ça solide, les autres features sont des sucres syntaxiques.

---

### 3.2 Production en masse événementielle

**C'est quoi** : **1 saisie métier → N Events automatiques**. Au lieu de créer un Event "card but", l'opérateur déclare un événement métier de plus haut niveau ("but de Mbappé 67e dans match PSG/OM") et le système génère plusieurs Events en cascade selon une **recette composite**.

**UI** :

- Onglet "Live" pendant un match : timeline + boutons rapides (But, Carton, Changement, Mi-temps, Fin)
- Chaque clic ouvre un mini-form (3-5 champs max) et crée plusieurs Events d'un coup
- File d'attente visible avec progression de chaque Render

**Modèle** :

- Concept `Scenario` (cf §2.1) = contenant d'Events liés (un match, une session de shooting, une journée d'actu)
- Recettes composites attachées au Scenario : "déclencher l'événement de type X crée les Events {A, B, C} avec mapping pré-rempli depuis le contexte du Scenario"

**Croisements** :

- Le **batch actuel = Scenario "Session de shooting"** avec EventType `shooting_joueur` et recette `[simple_generique, simple_image, but_generique, but_image]`
- Utilise la **Bibliothèque joueurs** pour auto-remplir buteur, passeur, photo, n° → 0 saisie redondante
- Hérite du **Brand Kit** pour couleurs/logo/sponsors
- Génère des Events qui suivent le **Workflow d'approbation**

---

### 3.3 Brand Kit par club

**C'est quoi** : la couche d'identité visuelle réutilisée par tous les templates. Édité une fois, propagé partout.

**UI** :

- Onglet "Identité" : color picker, upload logos (avec preview sur fond clair/sombre), choix de fonts (Google Fonts + upload custom .woff2 → FTP)
- Section "Sponsors" : grille drag&drop ordonnée (cf §3.9)
- Section "Overrides par template" : permet à un club d'ajuster un template précis (ex. taille de logo plus grande sur le template "But")

**Modèle** : table `BrandKit` 1-1 avec `Club`. Champs typés en JSON pour rester flexible.

**Croisements** :

- **Toutes** les autres features lisent le BrandKit via le résolveur
- L'admin Neopro peut imposer des verrous (ex. interdire de modifier la position du sponsor principal pour les clubs en plan basique)

---

### 3.4 Bibliothèque joueurs

**C'est quoi** : roster persistant par club (et par saison). Photo détourée + métadonnées. Réutilisé partout.

**UI** :

- Grille des joueurs avec photo, n°, poste
- Edit joueur : upload photo brute → **détourage rembg async** côté worker → URL FTP de la photo détourée stockée en DB
- Bulk import depuis CSV (continuité avec le workflow batch actuel)
- Vue saison : archivage des rosters précédents

**Modèle** :

```
Player(clubId, prenom, nom, numero, poste, dateNaissance, seasonId)
 ├── PlayerPhoto(playerId, rawUrl, cutoutUrl, status, version)
 └── PlayerStat(playerId, season, matchs, buts, assists, ...)
```

**Croisements** :

- **Création unitaire** : sélecteur "joueur" dans les forms qui auto-remplit prénom/nom/numéro/photo
- **Batch shooting** : le CSV actuel s'importe direct en `Player[]`, et le pipeline de détourage devient un worker rembg permanent
- **Packs match-day** : compo, buteurs, MOTM piochent dans le roster
- **Stats provider** (roadmap) : enrichissement auto

---

### 3.5 Packs match-day

**C'est quoi** : un **Scenario** pré-configuré "match" qui regroupe tous les Events d'une rencontre et les organise dans le temps (avant / pendant / après).

**UI** :

- Création d'un match : équipes (home/away), date, compétition, lieu → pré-rempli depuis dropdown clubs adverses (table `OpponentClub` réutilisable)
- Vue "match dashboard" en 3 colonnes (J-1, Live, Post-match)
- Chaque colonne a ses Events suggérés à créer (annonce, compo, but, mi-temps, score, MOTM, résumé)
- Bouton "Générer le pack complet" : crée tous les Events qui peuvent l'être à partir des données existantes (ex. compo dès que sélectionnée, score final auto)

**Modèle** : `Scenario(type='match_day')` avec `metadata` (équipes, date, compet) servant de contexte pour le mapping auto.

**Croisements** :

- Réutilise **Bibliothèque joueurs** pour la compo et les buteurs
- Active la **Prod en masse événementielle** pour la phase live
- Génère N Events qui suivent l'**Approbation**
- Push final via **Connecteur réseaux**

---

### 3.6 Variantes auto

**C'est quoi** : à partir d'**un seul Event**, générer plusieurs Renders pour différentes plateformes/langues/dimensions.

**Axes de variation gérés par le manifest** :

- **Format** : déclarés dans `manifest.formats[]` (story 9:16, post 1:1, post 4:5, paysage 16:9...)
- **Langue** : déclarées dans `manifest.languages[]` + `translatableFields[]`
- **Plateforme** : Insta vs Twitter (durées, watermarks différents)
- **Variante créa** : version sobre / version animée / version statique PNG

**UI** :

- Quand l'opérateur crée un Event, une section "Sorties" affiche la matrice formats×langues cochables (défauts depuis `EventType.defaultRecipe`)
- Possibilité de re-cocher après coup → relance uniquement les Renders manquants (sémaphore comme ton batch actuel)

**Modèle** : Le `Render` porte `(format, language, variant)`. La même `Event.payload` alimente plusieurs Remotion compositions.

**Croisements** :

- Augmente la valeur de **toutes** les autres features (1 Event = 5+ Renders)
- Chaque format peut avoir des overrides de brand kit (ex. logo plus petit en story)

---

### 3.7 Workflow d'approbation

**C'est quoi** : un Event/Render passe par des états avant d'être publiable.

**États** : `draft → queued → rendering → ready → in_review → approved → published`
**États d'erreur** : `failed`, `rejected`, `archived`

**Rôles (RBAC)** :

- `admin_neopro` (super-admin, gère le catalogue templates, les clubs, voit tout)
- `club_admin` (gère brand kit, joueurs, users, sponsors de son club)
- `editor` (crée des Events, soumet à validation)
- `reviewer` (approuve ou rejette, peut publier)
- `viewer` (lecture seule)

**UI** :

- Inbox des Events à valider, miniature de chaque Render, bouton ✓/✗ + commentaire
- Notifications (email + in-app) sur changement d'état
- Historique des décisions (qui a approuvé quoi quand) → audit

**Croisements** :

- Skippable en V1 mono-tenant (mode "auto-approve" configurable) mais **l'état machine doit exister en DB dès J0**
- Indispensable pour la V2 SaaS multi-club
- Connecté au **Connecteur réseaux** : seul un Event `approved` peut être publié

---

### 3.8 Connecteur réseaux

**C'est quoi** : pousser un Render approuvé directement vers Instagram, Twitter/X, TikTok, Facebook — soit immédiatement, soit planifié.

**Approche pragmatique** (du moins coûteux au plus) :

1. **V1 : Buffer/Hootsuite via API** — délègue toute la complexité OAuth/quota/refresh tokens à un tiers payant. Tu te branches sur leur API REST, le client paye son abo Buffer. Dev : 3-5 jours.
2. **V2 : Meta Graph API + X API directes** — économie pour le client, mais OAuth multi-comptes, quotas, content review = mois de dev.
3. **V3 : TikTok / YouTube Shorts** — APIs plus restreintes.

**UI** :

- Onglet "Publication" sur l'Event `approved`
- Sélecteur de comptes connectés, prévisualisation du post (caption, hashtags), timing (now / schedule)
- Caption manuelle en V1 ; Caption AI en roadmap (cf §7)

**Modèle** :

```
SocialAccount(clubId, platform, externalId, accessToken, refreshToken, ...)
Publication(renderId, socialAccountId, scheduledAt, status, externalPostId, errorMsg)
```

**Croisements** :

- Lit le **Render** finalisé via URL FTP
- Caption générée par un template texte alimenté par `Event.payload` + **Brand Kit** (handles sociaux)
- Bloqué tant que **Workflow** n'a pas passé en `approved`

---

### 3.9 Sponsor slots (NOUVEAU — structurant V1)

**C'est quoi** : un système déclaratif d'emplacements sponsors dans les templates, alimenté par une bibliothèque de sponsors gérée au niveau club. Prépare la monétisation V3 (marketplace sponsors payants).

**UI club** :

- Onglet "Sponsors" du club : liste des sponsors actifs, logo, période de validité, exclusivité catégorie (ex. "1 seul équipementier"), priorité
- Assignation par slot : "qui occupe `sponsor_main` ?", "qui occupe `sponsor_strip` ?"

**Modèle** :

```
Sponsor(clubId, name, logos[], category, contractStart, contractEnd, priority)
BrandKit.slotAssignments[]   ({ slotId: "sponsor_main", sponsorId: "...", overrides: {...} })
```

**Dans le manifest template** : les slots sont déclarés (cf §2.4 → `slots`). Le résolveur prend le sponsor assigné via `BrandKit.slotAssignments` et l'injecte aux props Remotion.

**Croisements** :

- **Brand Kit** porte l'assignation
- **Tous les templates** déclarent leurs slots dans leur manifest
- **Marketplace V3** : une affectation premium globale pourra surcharger `BrandKit.slotAssignments` (le sponsor paye Neopro pour figurer chez plusieurs clubs)

---

## 4. Architecture technique

### 4.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│  Angular SPA (admin Neopro V1 + portail club V2)    │
│  - Remotion Player embarqué (preview client)        │
└──────────────┬──────────────────────────────────────┘
               │ REST/GraphQL
┌──────────────▼──────────────────────────────────────┐
│  API Node (NestJS recommandé)                       │
│  - Auth (JWT), RBAC, middleware multi-tenant        │
│  - Resolver brand kit + manifest (lib partagée)     │
│  - Job queue producer                               │
│  - Compteurs billing (par club, render, template)   │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼─────┐   ┌──────▼──────┐
│ Postgres   │   │ Redis +     │
│ (Railway)  │   │ BullMQ      │
└────────────┘   └──────┬──────┘
                        │
            ┌───────────┼────────────┐
            │           │            │
     ┌──────▼────┐ ┌────▼─────┐ ┌────▼─────┐
     │ rembg     │ │ Remotion │ │ Social   │
     │ worker    │ │ renderer │ │ publish  │
     │ (Python)  │ │ (Node)   │ │ worker   │
     └─────┬─────┘ └────┬─────┘ └──────────┘
           │            │
           └─────┬──────┘
                 │
          ┌──────▼──────┐
          │ FTP storage │  (raw photos, cutouts, renders finaux)
          └─────────────┘
```

### 4.2 Choix techniques justifiés

| Couche      | Choix                                                              | Pourquoi                                                                                      |
| ----------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Front**   | Angular + ngx-formly + Remotion Player web                         | Stack imposée. Formly = forms auto-gen depuis JSON Schema (clé pour `EventType.inputSchema`). |
| **API**     | NestJS                                                             | Modules / DI / décorateurs RBAC = scaffold rapide, structure prête multi-tenant.              |
| **DB**      | Postgres (Railway) + Prisma ORM                                    | Schémas migrables, JSON columns pour `payload` et `manifest`.                                 |
| **Queue**   | BullMQ + Redis                                                     | Standard Node, retries, prioritization, observable. Indispensable pour les renders.           |
| **Workers** | Containers Node (Remotion) + Python (rembg) sur Railway            | Scale horizontal selon charge.                                                                |
| **Storage** | FTP (existant) — wrapper service `StorageService`                  | Permet de switcher vers S3 plus tard sans toucher au métier.                                  |
| **Auth**    | JWT + Passport (NestJS standard) ou réutilisation existante Neopro | À trancher en phase 0.                                                                        |
| **Rendu**   | Worker Node containerisé Railway en V1                             | Confirmé. Migrable vers Remotion Lambda si pic, l'abstraction `RenderService` est prête.      |

### 4.3 Multi-tenant dès J0 (sans coût V1)

- Toutes les tables métier ont `club_id NOT NULL`
- Middleware NestJS qui injecte `currentClubId` dans toutes les queries (RLS-style applicatif, pas Postgres RLS pour rester simple)
- V1 : un seul club Neopro instancié + un club par client réel — déjà multi-tenant **techniquement**, juste sans UI d'inscription
- V2 : ajout signup + billing + onboarding sans toucher au modèle

### 4.4 Compteurs billing (dès J0)

```
UsageCounter(clubId, period)
 ├── rendersCount       (incrémenté à chaque Render terminé)
 ├── eventsCount        (incrémenté à chaque Event créé)
 ├── activeTemplatesCount (recalculé via Template[] actifs du club)
 └── storageBytes       (somme des sizes des renders)
```

Hook BullMQ `on('completed')` → incrémente le compteur. Endpoint admin `/usage` qui agrège pour facturation. **Le studio expose les compteurs, la facturation reste côté Neopro existant.**

### 4.5 Preview client Remotion (dès J0)

Remotion Player web doit fonctionner dès le premier écran de création unitaire. Implications :

- Les compositions Remotion doivent être **bundle-able pour le web** (`@remotion/player`)
- Le projet `templates-remotion/` doit exposer ses compositions à la fois pour le rendu serveur (worker) ET pour le player web (front)
- Setup Webpack/Vite à prévoir en J0 ; rebuild auto à chaque ajout de template
- Les assets lourds (vidéos packshot, fonts custom) chargés depuis le FTP via URL publique

### 4.6 Réutilisation du batch existant

| Existant                        | Devient                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `batch.ts` (watch + queue)      | Producer NestJS qui crée des Events `shooting_joueur`                        |
| Sémaphore `PARALLEL`            | `BullMQ` concurrency par worker                                              |
| `rembg_worker.py`               | Container worker dédié, déclenché à l'upload photo                           |
| CSV input                       | Endpoint API d'import CSV → bulk create Events                               |
| `clubs/<slug>/config.json`      | Table `BrandKit`                                                             |
| Résolveur `défaut < club < CSV` | Service `ResolverService` partagé front+back, étendu pour lire les manifests |
| Templates Remotion existants    | Inchangés en TSX, à **doter d'un `manifest.json`** chacun                    |

**0 ligne de Remotion à réécrire** : tes templates restent tels quels, juste invoqués via API et décrits par un manifest.

---

## 5. Plan de dev par jalons

### Jalon 0 — Fondations (1.5-2 semaines)

- Réunion d'alignement Neopro (cf §0)
- Schéma Postgres + Prisma (tables : Club, BrandKit, Player, Sponsor, EventType, Event, Render, Template, Scenario, SocialAccount, UsageCounter)
- NestJS scaffold + auth (réutilisée ou nouvelle selon §0) + middleware multi-tenant
- Storage service FTP (wrapper)
- BullMQ + worker Remotion containerisé sur Railway
- **Migration des 4 templates actuels vers le format manifest**
- Setup bundle Remotion Player pour le front
- **Critère de succès** : POST `/events` avec payload de test → render Remotion lancé → fichier sur FTP → status mis à jour → compteur incrémenté

### Jalon 1 — Création unitaire (1 semaine)

- Angular SPA shell + login
- Liste EventTypes + form auto-gen Formly depuis manifest
- Preview Remotion Player intégrée
- Bouton render + suivi statuts en temps réel (WebSocket ou polling)
- **Critère** : créer un Event de type `but` depuis l'UI, voir la preview, récupérer le MP4 sur FTP

### Jalon 2 — Brand Kit + Sponsors + Bibliothèque joueurs (1.5-2 semaines)

- UI Brand Kit + résolveur côté API
- UI Sponsors + assignation aux slots
- Roster joueurs + upload photo + détourage async
- Selector "joueur" intégré aux forms (Formly custom widget)
- Import CSV joueurs (compat batch existant)
- **Critère** : créer un Event "But [joueur sélectionné]" en 3 clics, voir le sponsor principal dans le rendu

### Jalon 3 — Variantes auto + Workflow d'approbation (1.5 semaines)

- Matrice formats×langues par EventType (UI + résolveur recette)
- State machine `draft → ... → published` + RBAC NestJS
- Inbox de validation
- Notifications email basiques
- **Critère** : 1 Event → 4 Renders simultanés, validation requise avant statut `approved`

### Jalon 4 — Packs match-day + Prod en masse (2 semaines)

- Modèle `Scenario` + table `OpponentClub`
- UI match-day en 3 colonnes (J-1 / Live / Post-match)
- Recettes composites (1 saisie → N Events)
- Migration du batch shooting comme Scenario type `shooting_session`
- **Critère** : un match couvert de A à Z avec ~15 cards générées en <2 min de saisie cumulée

### Jalon 5 — Connecteur réseaux (1 semaine)

- Intégration Buffer (V1)
- UI publication + planification
- **Critère** : Event approuvé → publié sur Insta du club test

**Total V1 fonctionnelle : ~8-10 semaines** pour un dev seul à temps plein, en s'appuyant sur l'existant.

---

## 6. Décisions tranchées (référence rapide)

| Sujet                       | Décision                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Déploiement V1              | Outil interne Neopro, multi-tenant by design                                                       |
| Données match               | Saisie manuelle + import CSV, pas que match (tout type d'événement)                                |
| Rendu                       | Cloud Railway worker, FTP storage                                                                  |
| Front / API / DB            | Angular / Node (NestJS reco) / Postgres                                                            |
| Auth                        | Plug sur existant Neopro (à confirmer §0)                                                          |
| Preview Remotion Player web | Dès J0                                                                                             |
| Manifest templates          | Dès J0 (structurant)                                                                               |
| Sponsor slots               | Dès J0 (structurant)                                                                               |
| Multi-tenant                | Dès J0 (col `club_id`)                                                                             |
| Billing                     | Par club + par render + par template actif — compteurs dès J0, facturation côté Neopro             |
| Workflow d'approbation      | State machine dès J0, mode auto-approve possible en V1                                             |
| Caption AI                  | Roadmap (cf §7)                                                                                    |
| Motion design avancés       | Important — pas structurant tech (ajouts incrémentaux), mais à prioriser dans la roadmap templates |
| Éditeur no-code             | Important — la structure (manifest) est en place dès J0, l'UI est roadmap                          |
| Connecteur réseaux          | Buffer en V1                                                                                       |

---

## 7. Roadmap post-V1 (par valeur décroissante)

| #   | Feature                                | Description                                                                                                                                                                                                | Valeur     | Effort                 |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------- |
| 1   | **Éditeur de templates no-code**       | UI pour qu'un designer Neopro crée un template (génère le manifest + une composition Remotion paramétrée) sans toucher au code. Le manifest étant déjà là, c'est principalement du build d'éditeur visuel. | ⭐⭐⭐⭐⭐ | XL                     |
| 2   | **Bibliothèque motion design avancés** | Ajout itératif de templates premium (particules, 3D, transitions complexes) — différenciation premium vs Canva. Sans impact archi.                                                                         | ⭐⭐⭐⭐⭐ | M par template         |
| 3   | **Marketplace de templates**           | Catalogue où Neopro publie de nouveaux templates ; clubs activent ceux qu'ils veulent. Templates monétisables (facturé via compteur `activeTemplates`).                                                    | ⭐⭐⭐⭐⭐ | M                      |
| 4   | **Stats d'usage par club**             | Quels templates utilisés, quels Events approuvés/rejetés, time-to-publish moyen. Guide la roadmap templates et les renouvellements.                                                                        | ⭐⭐⭐⭐⭐ | S                      |
| 5   | **Caption AI**                         | Génération de légendes contextuelles (ton brand kit, langue, plateforme) via LLM, à partir du payload Event. Génère 3 variantes que le CM choisit/édite.                                                   | ⭐⭐⭐⭐   | S                      |
| 6   | **Smart cropping IA**                  | Détection visage + sujet pour cadrer auto la photo joueur. Évite les overrides `photo_x/photo_y` manuels actuels.                                                                                          | ⭐⭐⭐⭐   | M                      |
| 7   | **Sponsor marketplace V3**             | Sponsors payent Neopro pour figurer chez plusieurs clubs partenaires. Affectations premium globales surchargent `BrandKit.slotAssignments`. Modèle de revenu inversé.                                      | ⭐⭐⭐⭐   | XL (commercial > tech) |
| 8   | **A/B testing créatifs**               | Publier 2 variantes d'un même Event sur des audiences split, mesurer perf, apprendre. Nécessite analytics réseaux.                                                                                         | ⭐⭐⭐⭐   | L                      |
| 9   | **Connecteur data sportive**           | FFF, Opta, Sportradar, voire scrapers feuilles de match amateurs. Auto-remplit compo + score + buteurs.                                                                                                    | ⭐⭐⭐⭐   | L (cher en licences)   |
| 10  | **Mode collaboratif live**             | Plusieurs CM sur le même match, locking optimiste sur les Events. Utile pour gros clubs avec équipes com.                                                                                                  | ⭐⭐⭐     | M                      |
| 11  | **App mobile dédiée**                  | iOS/Android pour saisie live au bord du terrain (compo, score, mini-form ergonomique). Wrap Angular ou natif.                                                                                              | ⭐⭐⭐     | L                      |
| 12  | **Multi-saison historique**            | Archive auto fin de saison, comparaisons année N vs N-1 dans les templates ("3e but cette saison vs 7e l'an dernier").                                                                                     | ⭐⭐       | M                      |
| 13  | **Meta Graph API directe**             | Remplacer Buffer par intégrations directes Meta/X pour gros volumes.                                                                                                                                       | ⭐⭐       | L                      |
| 14  | **Webhooks sortants**                  | Notifier des systèmes tiers (CRM club, app supporters) à chaque Event publié.                                                                                                                              | ⭐⭐       | S                      |
| 15  | **API publique**                       | Pour intégrateurs / agences qui veulent piloter le studio depuis leur outil. Force-multiplier en SaaS.                                                                                                     | ⭐⭐       | M                      |
| 16  | **Mode billetterie / e-commerce**      | Lier les Events à des CTA (acheter places, merch). Le visuel devient un canal de conversion.                                                                                                               | ⭐⭐       | M                      |

---

## 8. Questions à poser au dev Neopro avant code

À transmettre tel quel au dev en charge de l'existant Neopro. Réponses requises avant J0.

### Auth & Users

1. Quel est le schéma de la table users existante (champs, types, contraintes) ?
2. Comment se fait l'authentification ? (JWT/session/OAuth, lib utilisée, durée de validité, refresh)
3. Y a-t-il un système de rôles/permissions ? Si oui, lequel ?
4. Peut-on **réutiliser le service d'auth existant** (recommandé) ou faut-il un service séparé ? Si réutilisation : endpoint de login, format du token, méthode de vérification.
5. Y a-t-il un SSO ou prévu ?

### Clubs / Tenants

6. Existe-t-il déjà une entité "Club" / "Organization" dans Neopro ? Schéma exact ?
7. Comment un user est-il lié à un ou plusieurs clubs ?
8. Y a-t-il déjà une notion de "slug" club, et est-elle stable ?
9. Si on doit créer la table Club ici, accepteriez-vous de la faire migrer côté Neopro après ?

### Infra & Storage

10. Hôte FTP, credentials d'accès dev/prod, structure de paths recommandée ?
11. Quota / retention / backup du FTP ?
12. URL publique pour servir les renders au front ? CDN ? Signed URLs ?
13. Existe-t-il déjà un service d'upload côté Neopro qu'on doit réutiliser, ou crée-t-on le nôtre ?

### Railway

14. Workspace Railway dispo ou à créer ?
15. Postgres et Redis managés disponibles dans ce workspace ?
16. Quelles limites RAM/CPU pour les workers de rendu ? (Remotion = ~1.5-2 Go par render parallèle)
17. Conventions de déploiement (CLI, GitHub Actions, autre) ?
18. Variables d'env / secrets management ?

### Billing

19. Stripe ou autre système de facturation existant ?
20. Peut-on logger les compteurs ici et laisser la facturation côté Neopro existant (recommandé) ?
21. Modèle envisagé : abo mensuel par club + consommation renders + nombre de templates actifs. Faut-il aussi un compteur stockage ?

### Tech & conventions

22. Stack actuelle (versions Node, Angular, Postgres, ORM utilisé) ?
23. Conventions de code, linter, formatter ?
24. Tests : framework imposé ? Couverture cible ?
25. Modèle de PR / CI ?
26. Y a-t-il un design system / lib de composants Angular partagée ?
27. Comment le front Angular existant communique-t-il avec ses APIs (REST/GraphQL, intercepteurs auth) ?

### Métier

28. Y a-t-il déjà des entités "Player", "Sponsor", "Match" dans l'existant ? Si oui, faut-il s'aligner ?
29. Y a-t-il une notion de "saison" déjà modélisée ?
30. Les clubs Neopro existants ont-ils déjà des sponsors gérés ailleurs ?

### Roadmap & contraintes

31. Quels clubs réels seraient pilotes du studio en V1 ? (volume attendu, exigences spécifiques)
32. Y a-t-il des contraintes réglementaires (RGPD pour photos joueurs mineurs notamment) déjà gérées ailleurs ?
33. Y a-t-il une roadmap Neopro qui pourrait impacter notre archi dans les 6 mois ?

---

## 9. Risques identifiés

| Risque                                                                       | Mitigation                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mismatch entre auth Neopro et besoins RBAC du studio                         | Phase 0 dédiée, décision tranchée avant code                                         |
| Manifests templates trop rigides pour les futurs designs                     | Versionning du manifest + champs `extra` JSON pour échappatoire                      |
| Remotion Player web ne tient pas la charge sur les templates lourds          | Fallback : preview vidéo basse résolution générée côté worker (~5s)                  |
| FTP devient le bottleneck (lectures concurrentes)                            | CDN devant le FTP (Cloudflare/Bunny), ou migration S3 anticipée                      |
| RGPD photos mineurs (clubs jeunes)                                           | Modèle `Player.consent` + workflow d'opt-out qui invalide tous les renders concernés |
| Coût Railway worker explose avec le volume                                   | Migration Remotion Lambda prévue via abstraction `RenderService`                     |
| Dette technique sur les templates existants si on ne migre pas vers manifest | Migration faite en J0, non négociable                                                |

---

## 10. Glossaire

- **Event** : instance métier d'un type d'événement (un but, un shooting, un anniv). Génère N Renders.
- **EventType** : catégorie d'événement avec son schéma d'input (`match_goal`, `shooting_joueur`, `birthday`...).
- **Render** : sortie concrète = un fichier (mp4/png) pour un couple (template, format, langue).
- **Template** : composition Remotion + manifest. Une variante visuelle réutilisable.
- **Manifest** : fichier JSON déclaratif décrivant un template (champs, bindings, slots, formats).
- **Scenario** : regroupement d'Events liés (match-day, session shooting, campagne).
- **Recipe** : table de mapping (eventType → templates × formats × langues à générer).
- **Brand Kit** : couche d'identité visuelle d'un club (couleurs, logos, fonts, sponsors).
- **Slot** : emplacement déclaré dans un template (logo principal, sponsor strip...) rempli par le résolveur.
- **Resolver** : service qui calcule la valeur finale d'un champ via la cascade `défaut < brand kit < event override`.

---

_Document à maintenir au fil des décisions. Toute modification non documentée ici n'est pas une décision._
