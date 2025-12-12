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

| Scénario | Action |
|----------|--------|
| Nouveau partenaire national (ex: Décathlon) | Upload vidéo → Sélectionner "Tous les clubs" → Déployer dans catégorie "ANNONCES NEOPRO" |
| Mise à jour logicielle | Créer package → Sélectionner groupes → Déployer avec rollback automatique |
| Club en surchauffe | Recevoir alerte → Diagnostiquer → Envoyer commande de reboot |
| Nouveau club client | Créer le site → Générer API key → Configurer le boîtier |

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

| Scénario | Action |
|----------|--------|
| Hommage joueur ce soir | Upload vidéo "Hommage Bertrand" → Catégorie "INFOS_CLUB" |
| Nouveau sponsor local | Upload vidéo sponsor → Catégorie "SPONSORS_LOCAUX" |
| Annonce speaker | Upload annonce → Catégorie "ANIMATIONS" |
| Réorganiser pour le match | Modifier l'ordre des sous-catégories |

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

| Type | Propriétaire | Stockage Central | Stockage Local | Modifiable par Club | Supprimable par Club |
|------|--------------|------------------|----------------|---------------------|----------------------|
| **Annonces NEOPRO** | NEOPRO | DB + Supabase | configuration.json + /videos | Non | Non |
| **Contenu Club** | Club | Miroir (lecture) | configuration.json + /videos | Oui | Oui |
| **Config Système** | NEOPRO | DB | configuration.json | Non | Non |

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

| Événement | Direction | Déclencheur | Action |
|-----------|-----------|-------------|--------|
| **Connexion du Pi** | Bidirectionnel | Pi se connecte au central | Échange état complet |
| **Déploiement vidéo NEOPRO** | Central → Local | Admin NEOPRO clique "Déployer" | Download + merge config |
| **Modification locale** | Local → Central | Opérateur modifie via Admin UI | Upload état vers central |
| **Heartbeat** | Local → Central | Timer 30s | Métriques système |
| **Commande admin** | Central → Local | Admin NEOPRO envoie commande | Exécution sur Pi |

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

```javascript
// Algorithme de merge simplifié
function mergeConfigurations(localConfig, remoteNeoProContent) {
  const result = { categories: [] };

  // 1. Préserver toutes les catégories locales non-verrouillées
  for (const localCat of localConfig.categories) {
    if (!localCat.locked) {
      result.categories.push(localCat);
    }
  }

  // 2. Ajouter/Mettre à jour les catégories NEOPRO (verrouillées)
  for (const neoProCat of remoteNeoProContent.categories) {
    const existingIndex = result.categories.findIndex(c => c.id === neoProCat.id);
    if (existingIndex >= 0) {
      result.categories[existingIndex] = neoProCat; // Remplacer
    } else {
      result.categories.push(neoProCat); // Ajouter
    }
  }

  return result;
}
```

---

## 5. Règles de Merge

### 5.1 Principe Fondamental

> **Le contenu NEOPRO (verrouillé) est toujours contrôlé par le central.**
> **Le contenu Club (non verrouillé) est toujours préservé lors du merge.**

### 5.2 Tableau des Règles

| Situation | Contenu NEOPRO | Contenu Club | Résultat |
|-----------|----------------|--------------|----------|
| Central ajoute une vidéo NEOPRO | Nouvelle vidéo | - | Ajoutée dans catégorie verrouillée |
| Central supprime une vidéo NEOPRO expirée | Vidéo à supprimer | - | Supprimée du Pi |
| Central modifie une catégorie NEOPRO | Modification | - | Appliquée (écrase) |
| Opérateur ajoute une vidéo club | - | Nouvelle vidéo | Préservée, remontée au central |
| Opérateur supprime une vidéo club | - | Suppression | Supprimée, central notifié |
| Opérateur modifie catégorie club | - | Modification | Préservée, remontée au central |
| Conflit : même ID catégorie | Catégorie verrouillée | Catégorie club | Central gagne (verrouillé prioritaire) |

### 5.3 Gestion des Conflits

**Conflit de nommage** : Si NEOPRO crée une catégorie avec le même ID qu'une catégorie club existante :
1. La catégorie NEOPRO (verrouillée) prend le dessus
2. La catégorie club est renommée automatiquement (ajout suffixe `_club`)
3. L'opérateur est notifié du changement

**Conflit de suppression** : Si l'opérateur tente de supprimer du contenu NEOPRO :
1. L'action est bloquée côté Admin UI
2. Message d'erreur : "Ce contenu est géré par NEOPRO et ne peut pas être supprimé"

### 5.4 Nommage des vidéos déployées

Depuis décembre 2025, les vidéos poussées depuis le central conservent leur nom d'origine (ex. `Golden Cup.mp4`) au lieu d'un UUID Supabase illisible :

- **Sanitisation automatique** : caractères interdits (`<>:"/\|?*`), accents et espaces multiples sont nettoyés, l'extension reste en `.mp4`.
- **Conflits évités** : si un fichier existe déjà dans la catégorie ciblée, le sync-agent ajoute un suffixe (`Golden Cup (1).mp4`) avant l'écriture.
- **Traçabilité** : `configuration.json` stocke désormais le `filename` final *et* le `name` (sans extension) pour que la télécommande et l'analytics puissent afficher un intitulé utilisateur.
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

**Reconnexion (Semaine 5)** :
1. Pi se connecte au central
2. Pi envoie son état complet (config + liste vidéos)
3. Central compare avec son dernier miroir
4. Central identifie les changements :
   - 5 nouvelles vidéos ajoutées
   - Réorganisation catégories
5. Central met à jour le miroir
6. Central vérifie s'il y a du contenu NEOPRO à pousser
7. Si oui : merge intelligent (préserve les modifs de Jean)
8. L'équipe NEOPRO peut voir sur le dashboard ce qu'il y a sur le Pi

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

#### Événement : `sync_state` (Pi → Central)

```javascript
// Envoyé par le Pi à chaque connexion et après chaque modification locale
socket.emit('sync_state', {
  site_id: 'club_stade_francais',
  config_hash: 'sha256:abc123...', // Hash de configuration.json
  config: { /* configuration.json complète */ },
  videos: [
    { path: 'videos/INFOS_CLUB/hommage.mp4', size: 12345678, hash: 'sha256:...' }
  ],
  timestamp: '2024-12-09T15:00:00Z'
});
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
        url: 'https://storage.supabase.co/videos/decathlon_noel.mp4',
        expires_at: '2025-01-31T23:59:59Z'
      }
    },
    {
      type: 'remove_video',
      video_id: 'orange_promo_expired'
    }
  ]
});
```

### 7.3 Admin UI - Gestion des Verrous

```typescript
// admin-server.js - Vérification avant modification

function canModifyCategory(category, user) {
  if (category.locked && category.owner === 'neopro') {
    return {
      allowed: false,
      reason: 'Cette catégorie est gérée par NEOPRO et ne peut pas être modifiée.'
    };
  }
  return { allowed: true };
}

function canDeleteVideo(video, category) {
  if (video.locked || category.locked) {
    return {
      allowed: false,
      reason: 'Ce contenu est géré par NEOPRO et ne peut pas être supprimé.'
    };
  }
  return { allowed: true };
}
```

```html
<!-- Admin UI - Affichage avec cadenas -->
<div class="category" :class="{ 'locked': category.locked }">
  <span class="category-name">{{ category.name }}</span>
  <span v-if="category.locked" class="lock-icon" title="Géré par NEOPRO">
    🔒
  </span>
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

### Q: L'opérateur peut-il réorganiser l'ordre des catégories NEOPRO ?

**R**: À définir. Options :
- **Strict** : Non, l'ordre est imposé par NEOPRO
- **Souple** : Oui, l'opérateur peut réorganiser mais pas modifier le contenu

---

## Historique des Versions

| Version | Date | Auteur | Modifications |
|---------|------|--------|---------------|
| 1.0 | 2024-12-09 | Claude/NEOPRO | Création initiale |

---

*Document généré pour le projet NEOPRO - Confidentiel*
