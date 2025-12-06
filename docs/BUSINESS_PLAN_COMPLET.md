# NEOPRO - Business Plan & Roadmap Technique Complète

> **Document de référence pour investisseurs, CTO et COO**
> Version 1.0 - 6 Décembre 2025
> Classification : Confidentiel

---

## Table des Matières

1. [Executive Summary](#1-executive-summary)
2. [Le Produit](#2-le-produit)
3. [Architecture Technique](#3-architecture-technique)
4. [Analyse Technique Actuelle](#4-analyse-technique-actuelle)
5. [Roadmap Phase 1 (0-3 mois)](#5-roadmap-phase-1-0-3-mois)
6. [Roadmap Phase 2 (3-12 mois)](#6-roadmap-phase-2-3-12-mois)
7. [Roadmap Phase 3 (1-3 ans)](#7-roadmap-phase-3-1-3-ans)
8. [Modèle Économique](#8-modèle-économique)
9. [Budget & Ressources](#9-budget--ressources)
10. [KPIs & Métriques](#10-kpis--métriques)
11. [Risques & Mitigations](#11-risques--mitigations)
12. [Processus Opérationnels](#12-processus-opérationnels)
13. [Annexes](#13-annexes)

---

# 1. Executive Summary

## 1.1 Le Problème

Les clubs sportifs amateurs et semi-professionnels (volleyball, handball, basketball, football) manquent d'outils modernes pour :
- **Animer les matchs** avec du contenu vidéo dynamique
- **Valoriser leurs sponsors** de manière professionnelle
- **Gérer facilement** l'affichage sur les écrans du gymnase
- **Centraliser la gestion** quand ils ont plusieurs sites

Les solutions existantes sont soit trop chères (€500-2000+), soit trop complexes, soit inadaptées au contexte sportif amateur.

## 1.2 La Solution NEOPRO

**NEOPRO est un système TV interactif clé-en-main pour clubs sportifs** combinant :

| Composant | Description |
|-----------|-------------|
| **Hardware** | Raspberry Pi pré-configuré (€80), plug & play |
| **Affichage TV** | Lecteur vidéo plein écran avec boucle sponsors automatique |
| **Télécommande** | Interface mobile pour déclencher les vidéos en temps réel |
| **Dashboard Central** | Gestion de flotte multi-clubs depuis le cloud |

## 1.3 Chiffres Clés

| Métrique | Actuel | Cible 12 mois | Cible 3 ans |
|----------|--------|---------------|-------------|
| Clubs actifs | ~10 pilotes | 300-500 | 5,000+ |
| MRR | €0 | €30-50K | €200-400K |
| ARR | €0 | €400-600K | €2-5M |
| Équipe | 1-2 | 8-10 | 25-30 |
| Pays | France | FR + BE/CH/DE | 5+ pays EU |

## 1.4 Investissement Recherché

| Phase | Montant | Usage |
|-------|---------|-------|
| Seed | €500K - €1M | Consolidation technique + premiers clients |
| Series A (18 mois) | €3-5M | Scale commercial + international |

## 1.5 Points Forts

- ✅ **Produit fonctionnel** - V1 en production, pas un prototype
- ✅ **Coût hardware faible** - Raspberry Pi vs solutions pro
- ✅ **Stack moderne** - Angular 20, Node.js, PostgreSQL, Socket.IO
- ✅ **Architecture scalable** - Fleet management cloud-native
- ✅ **Marché fragmenté** - Peu de concurrence directe sur le segment amateur

## 1.6 Points d'Attention

- ⚠️ **0 tests automatisés** - Dette technique à résorber
- ⚠️ **Pas de CI/CD** - Pipeline à mettre en place
- ✅ **Vulnérabilités sécurité** - 4/5 corrections critiques effectuées (reste HttpOnly cookies)
- ⚠️ **Équipe à construire** - Recrutements clés en Phase 1

---

# 2. Le Produit

## 2.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         ÉCOSYSTÈME NEOPRO                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   BOÎTIER   │    │ TÉLÉCOMMANDE│    │  DASHBOARD  │        │
│   │  (Rasp Pi)  │    │  (Mobile)   │    │  (Central)  │        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│          │                  │                  │                │
│          │    Socket.IO     │                  │                │
│          │◄────────────────►│                  │                │
│          │                                     │                │
│          │         WebSocket + REST API        │                │
│          │◄───────────────────────────────────►│                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 Composants

### 2.2.1 Boîtier Raspberry Pi (Local)

**Matériel :**
- Raspberry Pi 4 (4GB RAM)
- Carte SD 32GB+
- Alimentation 5V/3A
- Câble HDMI

**Logiciels :**
- Application Angular (affichage TV + télécommande)
- Serveur Socket.IO (communication temps réel)
- Interface admin (port 8080)
- Sync Agent (connexion cloud)
- Nginx (serveur web)

**Fonctionnalités :**
- Mode kiosk (affichage automatique)
- Boucle sponsors automatique
- Télécommande via smartphone
- Gestion vidéos locale
- Hotspot WiFi dédié
- mDNS (neopro.local)

### 2.2.2 Serveur Central (Cloud)

**Infrastructure :**
- Hébergé sur Render.com
- PostgreSQL managé
- WebSocket pour temps réel

**Fonctionnalités :**
- Dashboard de gestion flotte
- Monitoring temps réel (CPU, RAM, température)
- Déploiement de contenu à distance
- Mises à jour OTA
- Gestion utilisateurs (RBAC)
- Alertes automatiques

### 2.2.3 Applications

| Application | Port | Usage |
|-------------|------|-------|
| TV Display | 80 | Affichage plein écran vidéos |
| Remote Control | 80 | Télécommande smartphone |
| Admin Interface | 8080 | Gestion locale du boîtier |
| Socket.IO Server | 3000 | Communication temps réel |

## 2.3 Parcours Utilisateur

### Match Day (Opérateur)

```
1. Connexion télécommande (neopro.local/remote)
   └── Mot de passe club

2. Sélection période
   ├── Avant-match → Vidéos d'ambiance, sponsors
   ├── Match → Jingles buts, temps morts, animations
   └── Après-match → Remerciements, sponsors

3. Déclenchement vidéo
   └── Tap sur vidéo → Affichage immédiat sur TV

4. Retour boucle sponsors automatique
   └── Entre les vidéos déclenchées
```

### Administration (Gestionnaire)

```
1. Accès interface admin (neopro.local:8080)
   ├── Dashboard système (CPU, RAM, temp)
   ├── Gestion vidéos (upload, catégories)
   ├── Configuration (mot de passe, club info)
   └── Mises à jour logicielles

2. Accès dashboard central (cloud)
   ├── Vue flotte complète
   ├── Statut online/offline
   ├── Déploiement contenu
   └── Alertes et métriques
```

## 2.4 Fonctionnalités Implémentées

### Côté Club (✅ Fait)

| Feature | Statut | Description |
|---------|--------|-------------|
| Mode TV kiosk | ✅ | Affichage automatique sans intervention |
| Boucle sponsors | ✅ | Rotation automatique partenaires |
| Télécommande temps réel | ✅ | Latence < 100ms |
| Catégorisation vidéos | ✅ | Avant-match / Match / Après-match |
| Interface admin | ✅ | Gestion complète locale |
| Upload vidéos | ✅ | Drag & drop, formats multiples |
| Monitoring système | ✅ | CPU, RAM, température, disque |
| WiFi hotspot | ✅ | NEOPRO-[CLUB] |

### Côté Central (✅ Fait)

| Feature | Statut | Description |
|---------|--------|-------------|
| Dashboard flotte | ✅ | Vue temps réel tous sites |
| Enregistrement sites | ✅ | Auto-registration avec API key |
| Métriques historiques | ✅ | Graphiques CPU, RAM, etc. |
| Alertes automatiques | ✅ | Température, disque, offline |
| Groupes de sites | ✅ | Par région, sport, custom |
| Déploiement contenu | ✅ | Push vidéos vers sites |
| Mises à jour OTA | ✅ | Avec rollback automatique |
| Gestion utilisateurs | ✅ | Admin, operator, viewer |

### À Développer (Phase 2+)

| Feature | Phase | Description |
|---------|-------|-------------|
| App mobile native | 2 | iOS/Android télécommande |
| API publique | 2 | Intégrations tierces |
| Marketplace vidéos | 2 | Templates et animations |
| Intégration scoreboards | 2 | Sync avec systèmes de score |
| Multi-écrans | 2 | Plusieurs TV par site |
| White-label | 2 | Personnalisation fédérations |
| AR overlays | 3 | Réalité augmentée |
| Publicité programmatique | 3 | Revenus pub automatisés |

---

# 3. Architecture Technique

## 3.1 Stack Technologique

### Frontend

| Composant | Technologie | Version |
|-----------|-------------|---------|
| App principale | Angular | 20.3.0 |
| Dashboard central | Angular | 17.0.0 |
| Lecteur vidéo | Video.js | 8.23.4 |
| Charts | Chart.js + ng2-charts | 4.4.1 |
| Maps | Leaflet | 1.9.4 |
| Real-time client | Socket.IO Client | 4.7.2 |

### Backend

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Runtime | Node.js | 18+ LTS |
| Framework | Express.js | 4.18.2 |
| Real-time | Socket.IO | 4.7.2 |
| Database | PostgreSQL | 15 |
| Auth | JWT (jsonwebtoken) | 9.0.2 |
| Validation | Joi | 17.11.0 |
| Logging | Winston | 3.11.0 |
| Security | Helmet + express-rate-limit | 7.1.0 |

### Infrastructure

| Composant | Solution |
|-----------|----------|
| Hosting cloud | Render.com |
| Database | PostgreSQL (Render managed) |
| Hardware local | Raspberry Pi 4 |
| Web server local | Nginx |
| Process manager | Systemd |
| DNS local | Avahi (mDNS) |

## 3.2 Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVEUR CENTRAL (Cloud)                           │
│                              Render.com                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                                                                        ││
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ ││
│  │  │  Central Server  │  │  Central Dashboard│  │  PostgreSQL DB      │ ││
│  │  │  (Node/Express)  │  │  (Angular 17)     │  │                     │ ││
│  │  │                  │  │                   │  │  • users            │ ││
│  │  │  • REST API      │  │  • Fleet overview │  │  • sites            │ ││
│  │  │  • WebSocket     │  │  • Metrics charts │  │  • groups           │ ││
│  │  │  • Auth JWT      │  │  • Content deploy │  │  • videos           │ ││
│  │  │  • Rate limiting │  │  • User mgmt      │  │  • metrics          │ ││
│  │  │                  │  │                   │  │  • alerts           │ ││
│  │  └────────┬─────────┘  └───────────────────┘  └──────────────────────┘ ││
│  │           │                                                            ││
│  └───────────┼────────────────────────────────────────────────────────────┘│
└──────────────┼──────────────────────────────────────────────────────────────┘
               │
               │ WebSocket (wss) + REST API (https)
               │
      ┌────────┴────────┬─────────────────┬─────────────────┐
      │                 │                 │                 │
      ▼                 ▼                 ▼                 ▼
┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
│  CLUB A   │    │  CLUB B   │    │  CLUB C   │    │  CLUB N   │
│  Rasp Pi  │    │  Rasp Pi  │    │  Rasp Pi  │    │  Rasp Pi  │
└─────┬─────┘    └───────────┘    └───────────┘    └───────────┘
      │
      │  Architecture locale détaillée
      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RASPBERRY PI (neopro.local)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SYNC AGENT (systemd)                        │   │
│  │  • Connexion WebSocket serveur central                              │   │
│  │  • Heartbeat toutes les 30s                                         │   │
│  │  • Exécution commandes distantes                                    │   │
│  │  • Déploiement vidéos/mises à jour                                  │   │
│  │  • Collecte métriques système                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────┐  ┌───────────────────────────────────────┐  │
│  │   NGINX (Port 80)         │  │   ADMIN SERVER (Port 8080)            │  │
│  │                           │  │                                       │  │
│  │   Sert l'app Angular:     │  │   Interface d'administration:         │  │
│  │   • /login                │  │   • Dashboard système                 │  │
│  │   • /tv (video player)    │  │   • Gestion vidéos                    │  │
│  │   • /remote (télécommande)│  │   • Configuration                     │  │
│  │                           │  │   • Logs                              │  │
│  └───────────────────────────┘  └───────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SOCKET.IO SERVER (Port 3000)                     │   │
│  │                                                                     │   │
│  │   Communication temps réel entre TV et Télécommande:                │   │
│  │   • play-video    : Déclencher une vidéo                           │   │
│  │   • pause/resume  : Contrôle lecture                               │   │
│  │   • stop          : Arrêter et retour sponsors                     │   │
│  │   • video-status  : État actuel du player                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         STOCKAGE LOCAL                              │   │
│  │                                                                     │   │
│  │   /home/pi/neopro/                                                  │   │
│  │   ├── webapp/           (Application Angular)                       │   │
│  │   ├── videos/           (Vidéos du club)                           │   │
│  │   │   ├── sponsors/                                                 │   │
│  │   │   ├── jingles/                                                  │   │
│  │   │   └── ambiance/                                                 │   │
│  │   ├── server/           (Socket.IO server)                         │   │
│  │   ├── admin/            (Interface admin)                          │   │
│  │   ├── sync-agent/       (Agent synchronisation)                    │   │
│  │   └── logs/             (Logs applicatifs)                         │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SERVICES SYSTEMD                            │   │
│  │                                                                     │   │
│  │   • neopro-app.service   → Socket.IO server (port 3000)            │   │
│  │   • neopro-admin.service → Admin interface (port 8080)             │   │
│  │   • neopro-sync.service  → Sync agent (connexion cloud)            │   │
│  │   • nginx.service        → Web server (port 80)                    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3.3 Schéma Base de Données

```sql
-- Tables principales

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     users       │     │     sites       │     │     groups      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (UUID) PK    │     │ id (UUID) PK    │     │ id (UUID) PK    │
│ email           │     │ name            │     │ name            │
│ password_hash   │     │ api_key         │     │ description     │
│ full_name       │     │ status          │     │ type            │
│ role            │     │ last_seen       │     │ created_at      │
│ created_at      │     │ ip_address      │     └─────────────────┘
└─────────────────┘     │ version         │            │
                        │ metadata (JSON) │            │
                        │ created_at      │     ┌──────┴──────┐
                        └─────────────────┘     │ site_groups │
                               │                ├─────────────┤
                               │                │ site_id FK  │
                        ┌──────┴──────┐         │ group_id FK │
                        │             │         └─────────────┘
                        ▼             ▼
              ┌─────────────┐  ┌─────────────┐
              │   metrics   │  │   alerts    │
              ├─────────────┤  ├─────────────┤
              │ id PK       │  │ id PK       │
              │ site_id FK  │  │ site_id FK  │
              │ cpu_usage   │  │ type        │
              │ memory_usage│  │ severity    │
              │ temperature │  │ message     │
              │ disk_usage  │  │ resolved_at │
              │ uptime      │  │ created_at  │
              │ recorded_at │  └─────────────┘
              └─────────────┘

┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│     videos      │     │ content_deployments │     │  software_updates   │
├─────────────────┤     ├─────────────────────┤     ├─────────────────────┤
│ id (UUID) PK    │     │ id PK               │     │ id PK               │
│ name            │     │ video_id FK         │     │ version             │
│ description     │     │ target_type         │     │ changelog           │
│ file_size       │     │ target_id           │     │ download_url        │
│ duration        │     │ status              │     │ checksum            │
│ storage_path    │     │ created_at          │     │ created_at          │
│ thumbnail_path  │     └─────────────────────┘     └─────────────────────┘
│ created_at      │
└─────────────────┘
```

## 3.4 Flux de Communication

### TV ↔ Télécommande (Local)

```
┌──────────────┐                    ┌──────────────┐
│  TÉLÉCOMMANDE │                    │      TV      │
│   (Browser)   │                    │   (Browser)  │
└───────┬───────┘                    └───────┬──────┘
        │                                    │
        │  1. Connexion Socket.IO            │
        ├───────────────────────────────────►│
        │                                    │
        │  2. Sélection vidéo                │
        │     emit('play-video', {id})       │
        ├───────────────────────────────────►│
        │                                    │
        │  3. Vidéo démarre                  │
        │     emit('video-status', {...})    │
        │◄───────────────────────────────────┤
        │                                    │
        │  4. Fin vidéo                      │
        │     → Retour boucle sponsors       │
        │                                    │
```

### Sync Agent ↔ Serveur Central

```
┌──────────────┐                    ┌──────────────┐
│  SYNC AGENT  │                    │   CENTRAL    │
│  (Rasp Pi)   │                    │   SERVER     │
└───────┬───────┘                    └───────┬──────┘
        │                                    │
        │  1. Connexion WebSocket            │
        │     (authenticate with API key)    │
        ├───────────────────────────────────►│
        │                                    │
        │  2. Heartbeat (30s)                │
        │     {cpu, ram, temp, disk, uptime} │
        ├───────────────────────────────────►│
        │                                    │
        │  3. Commande distante              │
        │     (reboot, deploy, update)       │
        │◄───────────────────────────────────┤
        │                                    │
        │  4. Résultat commande              │
        ├───────────────────────────────────►│
        │                                    │
```

---

# 4. Analyse Technique Actuelle

## 4.1 Points Positifs

| Domaine | Évaluation | Détails |
|---------|------------|---------|
| **Architecture** | ✅ Solide | Séparation claire des responsabilités, scalable |
| **Stack** | ✅ Moderne | Angular 20, Node 18, PostgreSQL 15, Socket.IO 4.7 |
| **Documentation** | ✅ Bonne | README, REFERENCE, TROUBLESHOOTING bien structurés |
| **UX produit** | ✅ Fonctionnel | Workflow clair, temps réel efficace |
| **Déploiement** | ✅ Automatisé | Scripts setup-new-club.sh, deploy-remote.sh |

## 4.2 Dette Technique Critique

### 4.2.1 Absence de Tests (CRITIQUE)

```
Situation actuelle:
├── Tests unitaires: 0
├── Tests intégration: 0
├── Tests E2E: 0
├── Couverture: 0%
└── Impact: Régression possible à chaque déploiement
```

**Fichiers configurés mais vides :**
- `central-server/package.json` → `"test": "jest"` (Jest installé, 0 tests)
- `central-dashboard/package.json` → `"test": "ng test"` (Karma configuré, 0 tests)

### 4.2.2 Absence de CI/CD (CRITIQUE)

```
Situation actuelle:
├── GitHub Actions: Aucun workflow
├── GitLab CI: Non configuré
├── Pre-commit hooks: Non configurés
├── Linting automatique: Non appliqué
└── Impact: Code non validé avant déploiement
```

### 4.2.3 Vulnérabilités Sécurité

| Vulnérabilité | Fichier | Sévérité | Statut |
|---------------|---------|----------|--------|
| ~~JWT secret par défaut~~ | `central-server/src/middleware/auth.ts:6` | ~~🔴 CRITIQUE~~ | ✅ CORRIGÉ - Erreur si JWT_SECRET manquant |
| ~~TLS désactivé~~ | `central-server/src/config/database.ts:11-28` | ~~🔴 CRITIQUE~~ | ✅ CORRIGÉ - TLS activé en production, CA configurable |
| ~~Credentials admin en dur~~ | `central-server/src/scripts/init-db.sql` | ~~🔴 CRITIQUE~~ | ✅ CORRIGÉ - Script `npm run create-admin` sécurisé |
| Token localStorage | `central-dashboard/src/app/core/services/auth.service.ts:26` | 🟠 HAUTE | ⏳ À migrer vers HttpOnly cookies |
| ~~API key non hashée~~ | `central-server/src/services/socket.service.ts:68-71` | ~~🟠 HAUTE~~ | ✅ CORRIGÉ - SHA256 hash + timing-safe compare |

### 4.2.4 Autres Problèmes

| Problème | Impact | Effort fix |
|----------|--------|------------|
| Pagination manquante API | Performance dégradée avec volume | 2-3 jours |
| Versions Angular divergentes (17 vs 20) | Maintenance complexe | 1 semaine |
| Pas de Redis pour Socket.IO | Ne scale pas horizontalement | 2-3 jours |
| Logs non centralisés | Debugging difficile | 1-2 jours |
| Pas de monitoring APM | Pas de visibilité performance | 1-2 jours |

## 4.3 Évaluation Globale

| Critère | Note | Commentaire |
|---------|------|-------------|
| Fonctionnalité | 8/10 | Produit complet et utilisable |
| Qualité code | 5/10 | Lisible mais sans tests |
| Sécurité | 7/10 | Vulnérabilités critiques corrigées, reste HttpOnly cookies |
| Scalabilité | 6/10 | Architecture OK, infra à renforcer |
| Maintenabilité | 5/10 | Doc OK, mais pas de tests ni CI |
| **GLOBAL** | **6.2/10** | **Produit viable avec fondations sécurité solides** |

---

# 5. Roadmap Phase 1 (0-3 mois)

## 5.1 Objectifs

> **Mission : Transformer le prototype en produit production-ready**

| Objectif | Métrique cible |
|----------|----------------|
| Qualité | Couverture tests > 60% |
| Sécurité | 0 vulnérabilité critique/haute |
| Ops | CI/CD fonctionnel |
| Produit | 20 clubs pilotes actifs |
| Business | NPS pilotes > 40 |

## 5.2 Semaines 1-4 : Fondations

### Semaine 1 : CI/CD & Sécurité Critique

| Jour | Tâche | Livrable |
|------|-------|----------|
| 1-2 | Audit sécurité complet | Rapport vulnérabilités |
| 2 | Fix JWT secret fallback | PR merged |
| 3 | Fix TLS PostgreSQL | PR merged |
| 3 | Supprimer credentials init-db.sql | PR merged |
| 4-5 | Setup GitHub Actions basique | Pipeline qui build + lint |

**GitHub Actions workflow cible :**
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### Semaine 2 : Tests Backend

| Jour | Tâche | Livrable |
|------|-------|----------|
| 1 | Config Jest central-server | jest.config.js fonctionnel |
| 2-3 | Tests AuthController | 80%+ couverture auth |
| 4 | Tests SitesController | 80%+ couverture sites |
| 5 | Tests ContentController | 80%+ couverture content |

**Structure tests cible :**
```
central-server/src/
├── controllers/
│   ├── auth.controller.ts
│   └── auth.controller.test.ts  ← NOUVEAU
├── services/
│   ├── socket.service.ts
│   └── socket.service.test.ts   ← NOUVEAU
└── middleware/
    ├── auth.ts
    └── auth.test.ts             ← NOUVEAU
```

### Semaine 3 : Tests Frontend & Intégration

| Jour | Tâche | Livrable |
|------|-------|----------|
| 1 | Config Karma central-dashboard | Tests Angular fonctionnels |
| 2-3 | Tests services Angular | AuthService, ApiService testés |
| 4-5 | Tests intégration API | Endpoints critiques couverts |

### Semaine 4 : Sécurité Avancée

| Jour | Tâche | Livrable |
|------|-------|----------|
| 1-2 | Migrer JWT vers HttpOnly cookies | PR merged |
| 3 | Hasher API keys en base | Migration DB + code |
| 4 | Rate limiting par utilisateur | Config améliorée |
| 5 | npm audit clean | 0 vulnérabilités high/critical |

## 5.3 Semaines 5-8 : Monitoring & Documentation

### Semaine 5-6 : Observabilité

| Tâche | Outil | Effort |
|-------|-------|--------|
| Logging centralisé | Logtail ou Papertrail | 4h |
| Alerting Slack | Webhooks | 2h |
| Health checks enrichis | Endpoint /health | 4h |
| Uptime monitoring | UptimeRobot | 1h |
| Error tracking | Sentry | 4h |

### Semaine 7-8 : Documentation

| Document | Contenu | Effort |
|----------|---------|--------|
| OpenAPI spec | Swagger pour toutes les API | 2 jours |
| CONTRIBUTING.md | Guide contribution développeur | 4h |
| SECURITY.md | Politique sécurité, reporting | 4h |
| ADR template | Architecture Decision Records | 2h |
| Onboarding dev | Nouveau développeur autonome en 1 semaine | 1 jour |

## 5.4 Semaines 9-12 : Produit & Onboarding

### Améliorations UX

| Feature | Description | Effort |
|---------|-------------|--------|
| Wizard onboarding | Configuration guidée premier club | 3 jours |
| Loading states | Spinners, skeletons | 1 jour |
| Pagination API | Limit/offset sur tous les endpoints | 2 jours |

## 5.5 Livrables Phase 1

| Livrable | Critère d'acceptation |
|----------|----------------------|
| Pipeline CI/CD | Build + lint + test sur chaque PR |
| Couverture tests | > 60% backend, > 40% frontend |
| Sécurité | 0 vulnérabilité OWASP critical/high |
| Monitoring | Logs centralisés + alertes Slack |
| Documentation | OpenAPI + CONTRIBUTING + SECURITY |
| Produit | 20 clubs pilotes avec NPS > 40 |

## 5.6 Équipe Phase 1

| Rôle | Profil | Coût mensuel |
|------|--------|--------------|
| Dev Backend Senior | Node.js, PostgreSQL, Jest | €5-7K |
| Dev Frontend Senior | Angular, TypeScript, Jasmine | €5-7K |
| DevOps (50%) | CI/CD, monitoring, infra | €2-3K |

**Budget total Phase 1 : €45-50K**

---

# 6. Roadmap Phase 2 (3-12 mois)

## 6.1 Objectifs

> **Mission : Atteindre le Product-Market Fit et scaler**

| Objectif | Métrique cible |
|----------|----------------|
| Revenue | MRR €30-50K |
| Clients | 300-500 clubs payants |
| Croissance | +15% MoM |
| Rétention | Churn < 5%/mois |
| Tech | Uptime 99.5% |

## 6.2 Mois 4-6 : Scalabilité

### Infrastructure

| Tâche | Description | Effort |
|-------|-------------|--------|
| Redis adapter Socket.IO | Clustering multi-instances | 2-3 jours |
| Database partitioning | Table metrics partitionnée par mois | 2 jours |
| CDN vidéos | Cloudflare R2 ou AWS S3 + CloudFront | 3-5 jours |
| Read replicas | PostgreSQL réplication | 1 jour |
| Docker | Containerisation complète | 3 jours |

### Architecture Socket.IO avec Redis

```javascript
// central-server/src/services/socket.service.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

## 6.3 Mois 6-8 : Features Majeures

### Application Mobile

| Composant | Technologie | Effort |
|-----------|-------------|--------|
| App télécommande | React Native ou Flutter | 4-6 semaines |
| Push notifications | Firebase Cloud Messaging | 1 semaine |
| Deep linking | Universal links | 2 jours |

### API Publique v1

| Feature | Description | Effort |
|---------|-------------|--------|
| Versioning API | Prefix `/api/v1/` | 1 jour |
| OAuth2 | Authentification partenaires | 1 semaine |
| Webhooks | Events push | 3 jours |
| Rate limiting plans | Free/Pro/Enterprise | 2 jours |
| SDK JavaScript | Package npm client | 1 semaine |
| Documentation API | Portail développeur | 1 semaine |

## 6.4 Mois 8-10 : Intégrations & Marketplace

### Intégrations Scoreboards

| Intégration | Protocole | Effort |
|-------------|-----------|--------|
| API générique | REST polling | 1 semaine |
| Sportradar | WebSocket feed | 2 semaines |
| Triggers automatiques | Goal = vidéo auto | 3 jours |

### Marketplace Vidéos

| Composant | Description | Effort |
|-----------|-------------|--------|
| Catalogue templates | Animations pré-faites | 2 jours |
| Upload vendeurs | Multi-tenancy | 1 semaine |
| Paiement | Stripe Connect | 1 semaine |
| DRM basique | Signed URLs | 2 jours |

## 6.5 Mois 10-12 : Sécurité & Compliance

### Certifications

| Action | Effort | Coût |
|--------|--------|------|
| RGPD compliance | DPO, registre, process | 2 semaines + €5K |
| Pentest externe | Audit par cabinet | 1 semaine + €10K |
| SOC 2 Type 1 (préparation) | Documentation | 1 mois |

### Sécurité Avancée

| Feature | Description | Effort |
|---------|-------------|--------|
| MFA admins | TOTP avec speakeasy | 3 jours |
| WAF | Cloudflare rules | 2 jours |
| SAST dans CI | SonarQube ou Snyk | 1 jour |
| Secret rotation | Processus documenté | 2 jours |

## 6.6 Équipe Phase 2

| Rôle | Nombre | Focus |
|------|--------|-------|
| CTO/Tech Lead | 1 | Architecture, recrutement |
| Dev Backend Senior | 2 | API, Socket.IO, intégrations |
| Dev Frontend Senior | 1 | Dashboard, UX |
| Dev Mobile | 1 | iOS/Android |
| DevOps/SRE | 1 | Infra, CI/CD, monitoring |
| QA Engineer | 1 | Tests auto, E2E |
| Customer Success | 1 | Onboarding, support |

**Masse salariale : €35-50K/mois**

## 6.7 Budget Phase 2

| Poste | 9 mois |
|-------|--------|
| Salaires | €400K |
| Infrastructure | €10K |
| Services (pentest, légal) | €30K |
| Marketing | €35K |
| **Total** | **€475-550K** |

---

# 7. Roadmap Phase 3 (1-3 ans)

## 7.1 Objectifs

> **Mission : Devenir le leader européen de l'affichage dynamique sportif**

| Objectif | Métrique cible |
|----------|----------------|
| Revenue | ARR €2-5M |
| Clients | 5,000+ clubs |
| International | 5+ pays EU |
| Équipe | 25-30 personnes |
| Compliance | SOC 2 Type 2 + ISO 27001 |

## 7.2 Architecture Enterprise

### Multi-Tenancy Avancé

| Feature | Description | Effort |
|---------|-------------|--------|
| Isolation données | Row-level security PostgreSQL | 2-3 semaines |
| Custom domains | SSL wildcard, DNS automation | 1 semaine |
| SSO enterprise | SAML 2.0, OIDC, Active Directory | 3 semaines |
| White-label complet | Branding, emails, domaines | 2 semaines |

### Infrastructure Multi-Région

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE MULTI-RÉGION                           │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────────────────┐
                        │    GLOBAL LOAD BALANCER     │
                        │      (Cloudflare/AWS)       │
                        └──────────────┬──────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
   ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
   │   EU-WEST-1   │           │  EU-CENTRAL-1 │           │     UK-1      │
   │   (Primary)   │           │  (Secondary)  │           │   (Standby)   │
   │   Frankfurt   │           │    Paris      │           │    London     │
   └───────┬───────┘           └───────┬───────┘           └───────┬───────┘
           │                           │                           │
   ┌───────▼───────┐           ┌───────▼───────┐           ┌───────▼───────┐
   │  K8s Cluster  │           │  K8s Cluster  │           │  K8s Cluster  │
   │   (x3-10)     │           │   (x2-5)      │           │   (x1-2)      │
   └───────┬───────┘           └───────┬───────┘           └───────┬───────┘
           │                           │                           │
           ▼                           ▼                           ▼
   ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
   │  PostgreSQL   │◄─────────►│   Read        │◄─────────►│   Read        │
   │   Primary     │ Streaming │   Replica     │ Streaming │   Replica     │
   └───────────────┘           └───────────────┘           └───────────────┘
```

## 7.3 Expansion Internationale

### Marchés Cibles

| Pays | Timeline | Taille marché | Approche |
|------|----------|---------------|----------|
| 🇧🇪 Belgique | M1-3 | ~5K clubs | Francophone, frontalier |
| 🇨🇭 Suisse | M1-3 | ~3K clubs | Francophone, haut pouvoir achat |
| 🇩🇪 Allemagne | M6-12 | ~90K clubs | Plus grand marché EU |
| 🇬🇧 UK | M12-18 | ~50K clubs | Post-Brexit, anglophone |
| 🇪🇸 Espagne | M12-18 | ~40K clubs | Culture sport forte |
| 🇮🇹 Italie | M18-24 | ~35K clubs | Culture sport forte |

### Localisation

| Tâche | Effort | Coût |
|-------|--------|------|
| Framework i18n (ngx-translate) | 1 semaine | - |
| Traduction DE/EN/ES/IT | 2 semaines/langue | €5K/langue |
| Adaptation légale | 1 semaine/pays | €2K/pays |
| Support multilingue | Recrutement | Variable |

## 7.4 Features Avancées

### Intelligence Artificielle

| Feature | Technologie | Effort |
|---------|-------------|--------|
| Recommendations vidéos | Collaborative filtering | 1 mois |
| Auto-tagging contenu | Vision AI (Google/AWS) | 2 semaines |
| Analytics prédictives | Time-series forecasting | 1 mois |
| Chatbot support | LLM fine-tuned | 1 mois |

### Réalité Augmentée

| Feature | Plateforme | Effort |
|---------|-----------|--------|
| AR overlays live | WebXR / ARKit | 2-3 mois |
| Stats temps réel superposées | Computer vision | 2 mois |
| Expérience second écran | Mobile AR | 1 mois |

### Publicité Programmatique

| Composant | Description | Effort |
|-----------|-------------|--------|
| Ad server intégré | Gestion inventaire pub | 2 mois |
| Header bidding | Prebid.js integration | 1 mois |
| Analytics annonceurs | Dashboard ROI | 1 mois |
| Ciblage géographique | Pub locale par région | 2 semaines |

## 7.5 Certifications

| Certification | Timeline | Coût |
|---------------|----------|------|
| SOC 2 Type 2 | 6-12 mois | €50-100K |
| ISO 27001 | 12-18 mois | €30-50K |
| GDPR audit externe | 2-3 mois | €10-20K |

## 7.6 Organisation Cible (30 personnes)

```
CEO
├── CTO (1)
│   ├── Engineering Manager (1)
│   │   ├── Backend Team (4)
│   │   ├── Frontend Team (3)
│   │   ├── Mobile Team (2)
│   │   └── QA Team (2)
│   ├── DevOps/SRE (2)
│   └── Security Engineer (1)
│
├── COO (1)
│   ├── Customer Success (3)
│   ├── Support (2)
│   └── Operations (1)
│
├── VP Sales (1)
│   ├── Sales France (2)
│   ├── Sales DACH (2)
│   └── Partnerships (1)
│
├── VP Marketing (1)
│   ├── Product Marketing (1)
│   ├── Content/Growth (1)
│   └── Events (1)
│
└── CFO/Admin (1)
    └── HR/Admin (1)
```

## 7.7 Budget Phase 3 (Annuel)

| Poste | Année 2 | Année 3 |
|-------|---------|---------|
| Masse salariale | €800K | €1.5M |
| Infrastructure | €80K | €150K |
| Certifications | €80K | €30K |
| International | €150K | €300K |
| Marketing | €150K | €250K |
| R&D Hardware | €50K | €100K |
| Légal/Compliance | €50K | €80K |
| Buffer (10%) | €140K | €190K |
| **Total** | **€1.5M** | **€2.6M** |

---

# 8. Modèle Économique

## 8.1 Sources de Revenus

### Revenue Streams

| Stream | Description | % Revenue cible |
|--------|-------------|-----------------|
| **Hardware** | Vente kit Raspberry Pi configuré | 20% |
| **SaaS** | Abonnement mensuel par site | 60% |
| **Services Pro** | Installation, formation, support premium | 15% |
| **Marketplace** | Commission sur ventes templates | 5% |

### Pricing Suggéré

| Plan | Prix/mois | Fonctionnalités |
|------|-----------|-----------------|
| **Starter** | €19 | 1 site, features de base, support email |
| **Pro** | €39 | 1 site, toutes features, support prioritaire |
| **Business** | €29/site | Multi-sites, dashboard central, API |
| **Enterprise** | Sur devis | White-label, SSO, SLA garanti |

### Hardware

| Produit | Prix | Marge |
|---------|------|-------|
| Kit NEOPRO Basic | €149 | 40% |
| Kit NEOPRO Pro (+ boîtier) | €199 | 45% |
| Installation sur site | €200-500 | 60% |

## 8.2 Projections Financières

### Hypothèses

| Métrique | Valeur |
|----------|--------|
| ARPU (Average Revenue Per User) | €35/mois |
| CAC (Customer Acquisition Cost) | €200 |
| Churn mensuel | 3-5% |
| Cycle de vente | 2-4 semaines |
| LTV (Lifetime Value) | €840 (24 mois) |
| LTV/CAC | 4.2x |

### Projections

| Métrique | M6 | M12 | M24 | M36 |
|----------|-----|-----|-----|-----|
| Clubs actifs | 100 | 400 | 1,500 | 5,000 |
| MRR | €3.5K | €14K | €52K | €175K |
| ARR | €42K | €168K | €630K | €2.1M |
| Croissance MoM | 25% | 15% | 10% | 8% |

## 8.3 Unit Economics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UNIT ECONOMICS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ACQUISITION                          MONÉTISATION                         │
│   ┌─────────────────┐                  ┌─────────────────┐                 │
│   │ CAC = €200      │                  │ ARPU = €35/mois │                 │
│   │                 │                  │                 │                 │
│   │ • Marketing: €80│                  │ • SaaS: €29     │                 │
│   │ • Sales: €100   │                  │ • Services: €6  │                 │
│   │ • Onboard: €20  │                  │                 │                 │
│   └─────────────────┘                  └─────────────────┘                 │
│                                                                             │
│   RÉTENTION                            MARGE                                │
│   ┌─────────────────┐                  ┌─────────────────┐                 │
│   │ Churn = 4%/mois │                  │ Gross Margin    │                 │
│   │                 │                  │ = 75%           │                 │
│   │ LTV = 24 mois   │                  │                 │                 │
│   │ = €840          │                  │ LTV/CAC = 4.2x  │                 │
│   └─────────────────┘                  └─────────────────┘                 │
│                                                                             │
│   PAYBACK PERIOD = 6 mois                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 9. Budget & Ressources

## 9.1 Récapitulatif par Phase

| Phase | Durée | Budget | Équipe | Focus |
|-------|-------|--------|--------|-------|
| **Phase 1** | 0-3 mois | €50K | 3-4 | Consolidation technique |
| **Phase 2** | 3-12 mois | €500K | 8-10 | Scale & PMF |
| **Phase 3** | 1-3 ans | €2-3M/an | 25-30 | Expansion EU |

## 9.2 Détail Phase 1 (€50K)

| Poste | Mensuel | 3 mois |
|-------|---------|--------|
| Dev Backend Senior | €6,000 | €18,000 |
| Dev Frontend Senior | €5,500 | €16,500 |
| DevOps (50%) | €2,500 | €7,500 |
| **Sous-total RH** | €14,000 | €42,000 |
| Infrastructure | €120 | €360 |
| Outils (GitHub, Sentry) | €80 | €240 |
| Hardware pilotes (10 Pi) | - | €1,000 |
| Buffer (10%) | - | €4,400 |
| **Total** | | **€48,000** |

## 9.3 Détail Phase 2 (€500K)

| Poste | Mensuel | 9 mois |
|-------|---------|--------|
| CTO/Tech Lead | €8,000 | €72,000 |
| Dev Backend x2 | €11,000 | €99,000 |
| Dev Frontend | €5,500 | €49,500 |
| Dev Mobile | €6,000 | €54,000 |
| DevOps/SRE | €6,500 | €58,500 |
| QA Engineer | €4,500 | €40,500 |
| Customer Success | €4,000 | €36,000 |
| **Sous-total RH** | €45,500 | €409,500 |
| Infrastructure | €950 | €8,550 |
| Services (pentest, légal) | - | €30,000 |
| Marketing | €3,500 | €31,500 |
| Buffer (10%) | - | €48,000 |
| **Total** | | **€527,550** |

## 9.4 Coûts Infrastructure Détaillés

### Phase 1

| Service | Usage | Coût/mois |
|---------|-------|-----------|
| Render.com Starter | Central server + DB | €14 |
| GitHub Pro | 2 devs | €8 |
| Sentry | Error tracking | €26 |
| Logtail | Logging | €0 (free) |
| UptimeRobot | Monitoring | €0 (free) |
| **Total** | | **€48** |

### Phase 2

| Service | Usage | Coût/mois |
|---------|-------|-----------|
| Render.com Pro | Multi-services | €150 |
| Redis Cloud | Socket.IO adapter | €50 |
| Cloudflare Pro | CDN + WAF | €50 |
| AWS S3 + CloudFront | Vidéos | €100 |
| Datadog | APM + Logs | €200 |
| Sentry Team | Error tracking | €50 |
| **Total** | | **€600** |

### Phase 3

| Service | Usage | Coût/mois |
|---------|-------|-----------|
| Kubernetes (managed) | Multi-région | €2,000 |
| PostgreSQL (replicated) | Primary + 2 replicas | €500 |
| Redis Cluster | HA Socket.IO | €200 |
| Cloudflare Enterprise | Full stack | €500 |
| AWS (S3, CloudFront, etc.) | Assets | €500 |
| Datadog Enterprise | Full observability | €1,000 |
| **Total** | | **€4,700** |

---

# 10. KPIs & Métriques

## 10.1 Métriques par Phase

### Phase 1 - Consolidation

| Catégorie | KPI | Objectif |
|-----------|-----|----------|
| **Qualité** | Couverture tests | > 60% |
| **Qualité** | Bugs critiques ouverts | 0 |
| **Sécurité** | Vulnérabilités OWASP | 0 critical/high |
| **Ops** | Temps CI/CD | < 10 min |
| **Produit** | Clubs pilotes actifs | 20 |
| **Produit** | NPS pilotes | > 40 |

### Phase 2 - Croissance

| Catégorie | KPI | Objectif |
|-----------|-----|----------|
| **Revenue** | MRR | €30-50K |
| **Revenue** | Clubs payants | 300-500 |
| **Growth** | Croissance MoM | > 15% |
| **Retention** | Churn mensuel | < 5% |
| **Produit** | Feature adoption | > 50% |
| **Tech** | Uptime | > 99.5% |
| **Tech** | Latence P95 | < 200ms |

### Phase 3 - Expansion

| Catégorie | KPI | Objectif |
|-----------|-----|----------|
| **Revenue** | ARR | €2-5M |
| **Clients** | Clubs actifs | 5,000+ |
| **International** | Pays actifs | 5+ |
| **Enterprise** | Contrats fédérations | 3+ |
| **Team** | Effectif | 25-30 |
| **Tech** | Uptime | > 99.95% |
| **Compliance** | Certifications | SOC2 + ISO27001 |

## 10.2 Dashboard Métriques

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD MÉTRIQUES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BUSINESS                              TECHNIQUE                            │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐      │
│  │ MRR          │ €35,420      │      │ Uptime       │ 99.7%        │      │
│  │ Clubs actifs │ 412          │      │ Latence P95  │ 145ms        │      │
│  │ Churn        │ 3.2%         │      │ Erreurs/jour │ 23           │      │
│  │ NPS          │ 52           │      │ Déploiements │ 8/semaine    │      │
│  └─────────────────────────────┘      └─────────────────────────────┘      │
│                                                                             │
│  PRODUIT                               ÉQUIPE                               │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐      │
│  │ DAU/MAU      │ 42%          │      │ Vélocité     │ 45 pts       │      │
│  │ Vidéos/jour  │ 1,230        │      │ Bugs ouverts │ 12           │      │
│  │ Sessions/j   │ 3.2          │      │ Tech debt    │ 18%          │      │
│  │ Feature use  │ 67%          │      │ eNPS         │ 48           │      │
│  └─────────────────────────────┘      └─────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 10.3 SLA Cibles

| Métrique | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|
| Uptime | 99.0% | 99.5% | 99.95% |
| Latence P95 | < 500ms | < 200ms | < 100ms |
| MTTR (P1) | < 8h | < 2h | < 30min |
| Temps réponse support P1 | < 4h | < 1h | < 15min |
| Temps réponse support P2 | < 24h | < 8h | < 4h |

---

# 11. Risques & Mitigations

## 11.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Faille sécurité critique | Moyenne | Critique | Tests sécu, pentest, bug bounty |
| Panne serveur central | Faible | Critique | Multi-AZ, DR, monitoring 24/7 |
| Incompatibilité mise à jour Pi | Moyenne | Élevé | Tests staging, rollback auto |
| Surcharge Socket.IO | Moyenne | Élevé | Redis cluster, rate limiting |
| Corruption données | Faible | Critique | Backups, replication, audits |

## 11.2 Risques Business

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Churn élevé | Moyenne | Élevé | NPS, customer success, features |
| Concurrent bien financé | Moyenne | Moyen | Exécution rapide, partenariats |
| Difficulté recrutement | Élevée | Moyen | Employer branding, remote-first |
| Burn rate excessif | Faible | Critique | Budget mensuel, runway 18+ mois |
| Échec levée de fonds | Moyenne | Critique | Bootstrap, diversification |

## 11.3 Risques Opérationnels

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Panne hardware Pi | Moyenne | Faible | Stock spare, RMA rapide |
| Problème réseau club | Élevée | Faible | Mode offline, hotspot dédié |
| Formation insuffisante | Moyenne | Moyen | Documentation, vidéos, support |
| Surcharge support | Moyenne | Moyen | FAQ, chatbot, self-service |

## 11.4 Matrice des Risques

```
                            IMPACT
                   Faible    Moyen    Élevé    Critique
              ┌─────────┬─────────┬─────────┬─────────┐
    Élevée    │ Réseau  │Recrut.  │         │         │
              │ club    │         │         │         │
              ├─────────┼─────────┼─────────┼─────────┤
P   Moyenne   │ Panne   │ Support │ Socket  │ Faille  │
R             │ Pi      │ Formati.│ Churn   │ sécu    │
O             │         │ Concur. │ Update  │         │
B   ├─────────┼─────────┼─────────┼─────────┼─────────┤
A   Faible    │         │         │         │ Panne   │
              │         │         │         │ serveur │
              │         │         │         │ Data    │
              │         │         │         │ Funding │
              └─────────┴─────────┴─────────┴─────────┘
```

---

# 12. Processus Opérationnels

## 12.1 Déploiement Nouveau Club

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROCESSUS DÉPLOIEMENT NOUVEAU CLUB                       │
└─────────────────────────────────────────────────────────────────────────────┘

ÉTAPE 1: PRÉPARATION (J-7)
├── Commande Raspberry Pi 4 (4GB RAM)
├── Carte SD 32GB+ classe 10
├── Flash Raspberry Pi OS Lite 64-bit
└── Installation dépendances (Node, Nginx, etc.)

ÉTAPE 2: COLLECTE INFO (J-1)
├── Nom technique club (ex: CESSON)
├── Nom complet (ex: CESSON Handball)
├── Coordonnées contact
├── Sports pratiqués
├── Mot de passe (12+ caractères)
└── Vidéos sponsors

ÉTAPE 3: DÉPLOIEMENT (J)
├── ./raspberry/scripts/setup-new-club.sh
│   ├── Création configuration JSON
│   ├── Build Angular
│   ├── Transfert SSH
│   ├── Enregistrement serveur central
│   └── Installation services
├── Copie vidéos
└── Tests fonctionnels

ÉTAPE 4: VALIDATION (J)
├── [ ] Login fonctionne
├── [ ] /tv affiche sponsors
├── [ ] /remote contrôle TV
├── [ ] Interface admin accessible
├── [ ] Site visible dashboard central
└── [ ] WiFi hotspot opérationnel

ÉTAPE 5: FORMATION (J+1)
├── Formation utilisateur (1-2h)
├── Documentation remise
├── Contacts support
└── PV réception signé
```

## 12.2 Gestion des Incidents

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROCESSUS INCIDENT P1/P2                                 │
└─────────────────────────────────────────────────────────────────────────────┘

T+0      DÉTECTION
         ├── Alerte monitoring automatique
         ├── OU signalement client
         └── Création ticket incident

T+5min   TRIAGE
         ├── Classification priorité
         ├── Assignation ingénieur
         └── Notification équipe si P1

T+15min  DIAGNOSTIC
         ├── Analyse logs
         ├── Root cause identification
         └── Évaluation impact

T+30min  COMMUNICATION
         ├── Status page update
         ├── Notification clients
         └── ETA résolution

T+Xmin   RÉSOLUTION
         ├── Fix appliqué
         ├── Validation
         └── Monitoring 24h

T+24h    POST-MORTEM
         ├── Timeline
         ├── Root cause analysis
         ├── Actions correctives
         └── Mise à jour runbooks
```

## 12.3 Priorités Incidents

| Priorité | Description | Temps réponse | Temps résolution |
|----------|-------------|---------------|------------------|
| **P1** | Service totalement down | < 15 min | < 4h |
| **P2** | Feature majeure impactée | < 1h | < 8h |
| **P3** | Feature secondaire impactée | < 4h | < 24h |
| **P4** | Cosmétique, amélioration | < 24h | Best effort |

## 12.4 Release Process

```
┌────────────────────────────────────���────────────────────────────────────────┐
│                         PROCESSUS DE RELEASE                                │
└─────────────────────────────────────────────────────────────────────────────┘

1. DÉVELOPPEMENT
   ├── Feature branch
   ├── Tests locaux
   ├── PR + code review
   └── Merge to main

2. CI/CD
   ├── Build automatique
   ├── Tests automatiques
   ├── Security scan
   └── Deploy staging

3. VALIDATION STAGING
   ├── Tests QA (24-48h)
   ├── Tests regression
   └── Go/No-go

4. PRODUCTION
   ├── Wave 1: 10% (canary)
   ├── Monitoring 24h
   ├── Wave 2: 50%
   ├── Monitoring 24h
   └── Wave 3: 100%

5. POST-RELEASE
   ├── Monitoring 72h
   ├── Feedback collection
   └── Hotfix si nécessaire
```

---

# 13. Annexes

## 13.1 Glossaire

| Terme | Définition |
|-------|------------|
| ARR | Annual Recurring Revenue - Revenus récurrents annuels |
| CAC | Customer Acquisition Cost - Coût d'acquisition client |
| Churn | Taux d'attrition des clients |
| LTV | Lifetime Value - Valeur vie client |
| MRR | Monthly Recurring Revenue - Revenus récurrents mensuels |
| MTTR | Mean Time To Recovery - Temps moyen de résolution |
| NPS | Net Promoter Score - Score de recommandation |
| OTA | Over-The-Air - Mise à jour à distance |
| PMF | Product-Market Fit - Adéquation produit-marché |
| RACI | Responsible, Accountable, Consulted, Informed |
| SLA | Service Level Agreement |
| Sync Agent | Service Raspberry Pi communiquant avec le cloud |

## 13.2 Liens Utiles

| Ressource | URL |
|-----------|-----|
| Dashboard Central | https://neopro-central.onrender.com |
| API Central | https://neopro-central-server.onrender.com |
| Documentation | docs/REFERENCE.md |
| Troubleshooting | docs/TROUBLESHOOTING.md |

## 13.3 Contacts

| Rôle | Email | Téléphone |
|------|-------|-----------|
| Fondateur | contact@neopro.fr | - |
| Support technique | support@neopro.fr | - |
| Commercial | sales@neopro.fr | - |

## 13.4 Template Incident Report

```markdown
# Incident Report - [INC-XXXX]

## Résumé
- **Date/Heure:** YYYY-MM-DD HH:MM UTC
- **Durée:** X heures Y minutes
- **Sévérité:** P1/P2/P3
- **Impact:** X clubs affectés

## Timeline
| Heure | Événement |
|-------|-----------|
| HH:MM | Détection |
| HH:MM | Investigation |
| HH:MM | Root cause identifiée |
| HH:MM | Fix déployé |
| HH:MM | Service restauré |

## Root Cause
[Description technique]

## Actions Préventives
- [ ] Action 1 - Owner - Deadline
- [ ] Action 2 - Owner - Deadline
```

## 13.5 Checklist Nouveau Développeur

```
JOUR 1-2: SETUP
├── [ ] Accès GitHub, Slack, Notion
├── [ ] Clone repos + npm install
├── [ ] Docker-compose up
├── [ ] Lire README.md
└── [ ] Premier PR (fix typo)

JOUR 3-5: ARCHITECTURE
├── [ ] Lire docs/REFERENCE.md
├── [ ] Parcourir structure code
├── [ ] Comprendre flux Socket.IO
└── [ ] Premier bug fix (P4)

SEMAINE 2: AUTONOMIE
├── [ ] Feature simple assignée
├── [ ] Code review reçue/donnée
├── [ ] Déploiement staging
└── [ ] Feedback onboarding
```

---

# Conclusion

## Recommandation Investisseur

> **RECOMMANDATION : INVESTIR avec due diligence technique**
>
> Le projet NEOPRO présente un potentiel significatif sur un marché fragmenté avec peu de concurrence directe. Le produit est fonctionnel et répond à un besoin réel des clubs sportifs amateurs.
>
> **Points forts :**
> - Produit fonctionnel en production
> - Stack technique moderne et scalable
> - Coût hardware faible (Raspberry Pi)
> - Marché adressable important (180K+ clubs en France)
>
> **Points d'attention :**
> - Dette technique à résorber (tests, CI/CD, sécurité)
> - Équipe à construire
> - Pas encore de revenus récurrents
>
> **Investissement recommandé :** €500K - €1M en Seed
>
> **Conditions :**
> - Recrutement CTO dans les 60 jours
> - Couverture tests > 60% dans les 90 jours
> - 50 clubs payants dans les 6 mois

## Recommandation CTO/COO

> **OPPORTUNITÉ : Excellente avec défis stimulants**
>
> Ce projet offre l'opportunité de construire une équipe et des processus from scratch sur une base technique solide. Les 3 premiers mois de consolidation sont critiques pour transformer ce prototype avancé en produit enterprise-ready.
>
> **Quick wins (30 premiers jours) :**
> 1. Mettre en place CI/CD basique
> 2. Corriger les 3 vulnérabilités sécurité critiques
> 3. Ajouter tests sur les endpoints auth
> 4. Centraliser les logs
> 5. Monitorer l'uptime

---

**Document préparé par :** Analyse Claude Code
**Version :** 1.0
**Date :** 6 Décembre 2025
**Classification :** Confidentiel

---

*Ce document constitue une analyse exhaustive du projet NEOPRO et sert de référence pour les décisions stratégiques, techniques et opérationnelles.*
