# Cartographie des outils Neopro

> Aperçu complet et synthétique du rôle de chaque outil, de ses fonctionnalités et de son public cible.

---

## Vue d'ensemble

```
                           OUTILS CLOUD
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │  Dashboard   │   Portail    │   Portail    │ Télécommande │
  │    Admin     │  Annonceur   │   Agence     │    (cloud)   │
  │  [admin/op]  │ [annonceur]  │  [agence]    │ [staff club] │
  └──────┬───────┴──────────────┴──────────────┴──────┬───────┘
         │                                            │
         └──────────────┬─────────────────────────────┘
                        │
                 Central Server API
                   (REST + WebSocket)
                        │
                        │ Internet
                        │
  ┌─────────────────────┼──────────────────────────────────────┐
  │              OUTILS EDGE (Raspberry Pi)                    │
  │                     │                                      │
  │              Sync Agent ←──→ Cloud                         │
  │                     │                                      │
  │  ┌──────────┬───────┴────────┬──────────────┐             │
  │  │ TV Player│  Pi Server     │  Admin Panel  │             │
  │  │  [écran] │  Socket.IO     │  Pi           │             │
  │  │          │  [relay local] │  [staff/tech] │             │
  │  └──────────┴───────┬────────┴──────────────┘             │
  │                     │                                      │
  │              Télécommande (locale)                         │
  │              [staff club]                                  │
  │                                                            │
  │              Watchdogs (kiosk, sync, hotspot)              │
  └────────────────────────────────────────────────────────────┘

                      OUTILS OPS
  ┌──────────────────┬─────────────────────┐
  │    Monitoring    │ Toolbox Déploiement  │
  │ [support/fondé]  │    [techniciens]     │
  └──────────────────┴─────────────────────┘
```

---

## Outils Produit (utilisateurs finaux)

### 1. Dashboard Admin

|            |                                                                               |
| ---------- | ----------------------------------------------------------------------------- |
| **Rôle**   | Piloter la flotte de boîtiers, le contenu vidéo, les alertes et les analytics |
| **Public** | Super Admin, Admin, Opérateurs                                                |
| **Accès**  | Web cloud — auth JWT + MFA                                                    |

**Fonctionnalités :**

- Gestion de flotte : vue temps réel de 50+ sites (Connected / Unstable / Offline)
- Fiche site détaillée (5 onglets : État, Contenu, Paramètres, Profils, Debug)
- Multi-config profiles : N profils par site (Standard, Tournoi, Match Pro...)
- Déploiement vidéo : deploy vers un site ou un groupe, suivi temps réel
- Mises à jour OTA : upload de packages, déploiement canary, rollback auto
- Vue live TV + screenshot à la demande (via télécommande cloud)
- File de commandes : commandes en attente pour sites offline
- Gestion utilisateurs : RBAC (6 rôles), MFA TOTP
- Abonnements et facturation : suivi licences, export mensuel

---

### 2. Portail Annonceur

|            |                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------ |
| **Rôle**   | Permettre aux annonceurs d'uploader leurs vidéos pub et consulter leurs stats d'impression |
| **Public** | Annonceurs (clients publicitaires)                                                         |
| **Accès**  | Web cloud — auth JWT (rôle `advertiser`)                                                   |

**Fonctionnalités :**

- Dashboard personnel avec stats d'impressions
- Upload et gestion de vidéos publicitaires
- Consultation des statistiques par période
- Export de rapports (PDF, Excel)

---

### 3. Portail Agence

|            |                                                          |
| ---------- | -------------------------------------------------------- |
| **Rôle**   | Gérer plusieurs annonceurs et voir les stats consolidées |
| **Public** | Agences publicitaires                                    |
| **Accès**  | Web cloud — auth JWT (rôle `agency`)                     |

**Fonctionnalités :**

- Vue consolidée multi-annonceurs
- Gestion du portefeuille d'annonceurs
- Stats agrégées et par annonceur

---

### 4. Télécommande

|            |                                                                               |
| ---------- | ----------------------------------------------------------------------------- |
| **Rôle**   | Contrôler la TV du club en temps réel (score, vidéos, phases de match, timer) |
| **Public** | Staff club (bénévoles, responsables sportifs)                                 |
| **Accès**  | **2 modes d'accès selon la config client**                                    |

| Mode       | URL                                          | Auth                    | Réseau                                | Cas d'usage                                   |
| ---------- | -------------------------------------------- | ----------------------- | ------------------------------------- | --------------------------------------------- |
| **Locale** | `http://neopro.local/remote`                 | Mot de passe            | Hotspot du club (WiFi NEOPRO-xxx)     | Accès direct, zéro latence                    |
| **Cloud**  | `https://dashboard.neopro.tv/remote/:siteId` | QR code + PIN optionnel | N'importe quel réseau (4G, WiFi lieu) | Mesh WiFi, isolation client, accès à distance |

**Fonctionnalités (communes aux deux modes) :**

- Gestion du score en temps réel (mise à jour, reset)
- Phases de match (échauffement, live, mi-temps, fin)
- Sélection de vidéos dans la boucle
- Timer (start, pause, reset)
- Breaking news (flash info)
- Indicateur d'enregistrement (REC)
- Sélecteur de profil de configuration

**Fonctionnalités spécifiques au mode cloud :**

- Vue live de l'état du player TV (vidéo en cours, progression, phase)
- Screenshot à la demande (JPEG 480p)
- Indicateur de commandes en attente (si site offline)

---

### 5. TV Player

|            |                                                                                     |
| ---------- | ----------------------------------------------------------------------------------- |
| **Rôle**   | Diffuser les boucles vidéo, scores live et contenus sponsors sur l'écran TV du club |
| **Public** | Spectateurs (usage passif — ils regardent la TV)                                    |
| **Accès**  | Chromium en mode kiosk sur le Raspberry Pi                                          |

**Fonctionnalités :**

- Lecteur vidéo double-buffer (transitions seamless, preload 1.5s, switch 0.5s avant fin)
- Boucles vidéo par phase (avant / pendant / après match)
- Score overlay en temps réel
- Timer de match
- Breaking news plein écran
- Watermark sponsor programmable
- Indicateur REC
- Sélecteur de profil (caché si mono-config)
- Bandeau licence (avertissement expiration, blocage si expiré)
- Screenshot sur demande cloud (JPEG 480p)
- Broadcast état player vers le cloud
- Offline-first : fonctionne sans internet (tout est bundlé)
- Récupération auto crash GPU / decoder

---

### 6. Admin Panel Pi

|            |                                                   |
| ---------- | ------------------------------------------------- |
| **Rôle**   | Configurer et diagnostiquer le boîtier localement |
| **Public** | **Dual mode** — 2 publics distincts               |
| **Accès**  | Web locale `http://neopro.local:8080` (hotspot)   |

| Mode                 | Public            | Usage                                 |
| -------------------- | ----------------- | ------------------------------------- |
| **Club** (simplifié) | Staff du club     | Ajouter du contenu vidéo au quotidien |
| **Tech** (complet)   | Technicien Neopro | Installation, maintenance, diagnostic |

**Fonctionnalités mode Club :**

- Upload de vidéos locales
- Dashboard santé simplifié
- Widget état de connexion cloud

**Fonctionnalités mode Tech :**

- Configuration complète (`configuration.json`)
- Réseau : scan WiFi, connexion, hotspot, diagnostics
- Système : CPU, disque, services, reboot, version, logs
- Backup / Restore de configuration
- Mises à jour OTA
- Cache management
- Email configuration

---

## Outils Infrastructure (backend / automatisés)

### 7. Central Server API

|            |                                                                                   |
| ---------- | --------------------------------------------------------------------------------- |
| **Rôle**   | Orchestrer toute la logique métier, la persistance et la communication temps réel |
| **Public** | Dashboard, Pi, intégrations (pas d'utilisateur direct)                            |
| **Accès**  | REST + WebSocket (port 443)                                                       |

**Fonctionnalités clés :**

- Auth : JWT HttpOnly + Bearer, MFA TOTP, reset password
- 21 repositories typés (Repository Pattern, ESLint enforced)
- 9 handlers Socket.IO (heartbeat, config-sync, deploy-progress, command-dispatch, health-monitor, license, network-resilience, score-update, match-config)
- Déploiement vidéo : orchestration upload FTP, distribution vers Pi
- OTA : gestion versions, déploiement canary/orchestré, rollback
- Alerting : 18 seuils (réactifs + prédictifs), multi-canal (email, Slack, webhook)
- Analytics : video plays, sessions, impressions sponsors, agrégation quotidienne
- Rapports : PDF (Chart.js), Excel multi-feuilles, CSV
- Rate limiting : 9 niveaux
- Memory Manager : auto-cleanup à 93% heap

---

### 8. Sync Agent

|            |                                                                                |
| ---------- | ------------------------------------------------------------------------------ |
| **Rôle**   | Synchroniser config, vidéos, analytics et mises à jour entre le cloud et le Pi |
| **Public** | Système (automatisé, service systemd)                                          |
| **Accès**  | Service `neopro-sync-agent.service`                                            |

**Fonctionnalités :**

- Heartbeat toutes les 30s (CPU, RAM, temp, disque, uptime, kiosk, version, état player)
- Config sync : polling + merge intelligent (union sponsors/catégories, champs protégés)
- Profils : téléchargement et écriture de tous les profils sur disque
- Déploiement vidéo : download FTP, vérification SHA256, organisation par catégorie
- Analytics push : buffer local fichier, upload batch vers cloud
- Impressions sponsor : tracking et envoi
- OTA : download, backup, installation, migrations, rollback, reboot
- File de commandes : traitement des commandes en attente à la reconnexion
- Détection zombie : vérification cohérence connected flag vs socket réel
- Screenshot relay : relai bidirectionnel dashboard <-> TV

---

### 9. Pi Server Socket.IO

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Rôle**   | Relayer les commandes temps réel entre la télécommande et la TV |
| **Public** | Télécommande, TV Player (clients WebSocket)                     |
| **Accès**  | WebSocket port 3000                                             |

**Fonctionnalités :**

- Relay commandes télécommande -> TV (18 événements)
- Gestion score (mise à jour, reset)
- Phases de match
- Timer (start, pause, reset, update)
- Breaking news
- Indicateur REC
- Sync TV master/slave
- HDMI CEC (allumer/éteindre TV)
- Validation licence locale

---

### 10. Watchdogs

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Rôle**   | Surveiller et relancer automatiquement les services critiques du Pi |
| **Public** | Système (automatisé)                                                |
| **Accès**  | Scripts bash lancés par systemd                                     |

| Watchdog                | Surveille           | Action                                        |
| ----------------------- | ------------------- | --------------------------------------------- |
| **Kiosk Watchdog**      | Chromium (kiosk TV) | Auto-restart crash GPU, max 3 tentatives/5min |
| **Sync-Agent Guardian** | Sync-agent          | Auto-recovery crash                           |
| **Hotspot Watchdog**    | WiFi hotspot        | Monitoring et relance                         |

---

## Outils Ops (déploiement / monitoring)

### 11. Monitoring

|            |                                                         |
| ---------- | ------------------------------------------------------- |
| **Rôle**   | Surveiller la santé de l'infrastructure et de la flotte |
| **Public** | Équipe support et fondateurs                            |
| **Accès**  | Grafana (port 3000) + Prometheus (port 9090)            |

**Fonctionnalités :**

- 30 métriques Prometheus custom (`neopro_*`) : HTTP, WebSocket, business, infra, kiosk
- 3 dashboards Grafana :
  - **Overview** : santé API, sites connectés, alertes, 5xx, latence p95
  - **Infrastructure** : HTTP rate/latence, Node.js runtime, DB pool, FTP
  - **Business & Fleet** : video uploads, heartbeats, déploiements, abonnements, kiosk
- Health endpoints : `/health`, `/live`, `/ready`
- 18 seuils d'alerte (6 réactifs, 9 prédictifs, 3 kiosk)
- Multi-canal : email, Slack, webhook

---

### 12. Toolbox Déploiement

|            |                                                              |
| ---------- | ------------------------------------------------------------ |
| **Rôle**   | Installer, configurer et maintenir les boîtiers Raspberry Pi |
| **Public** | Techniciens Neopro                                           |
| **Accès**  | Scripts bash via SSH ou local                                |

**Scripts principaux :**

| Catégorie        | Scripts                                                    | Usage                   |
| ---------------- | ---------------------------------------------------------- | ----------------------- |
| **Installation** | `setup.sh`, `setup-new-club.sh`, `setup-remote-club.sh`    | Setup initial Pi        |
| **Déploiement**  | `build-and-deploy.sh`, `deploy-remote.sh`, `copy-to-pi.sh` | Build + deploy          |
| **Golden Image** | `prepare-golden-image.sh`, `clone-sd-card.sh`              | Clonage rapide (10 min) |
| **Diagnostic**   | `diagnose-pi.sh`, `backup-club.sh`, `restore-club.sh`      | Support technique       |
| **Maintenance**  | `cleanup-pi.sh`, `fix-hostname.sh`, `fix-hotspot.sh`       | Correctifs              |
| **Vidéo**        | `compress-video.sh`, `generate-thumbnail.sh`               | Traitement vidéo        |

---

## Récapitulatif

| #   | Outil                             | Public cible                   | Type                 |
| --- | --------------------------------- | ------------------------------ | -------------------- |
| 1   | **Dashboard Admin**               | Admin, Super Admin, Opérateurs | Produit cloud        |
| 2   | **Portail Annonceur**             | Annonceurs                     | Produit cloud        |
| 3   | **Portail Agence**                | Agences publicitaires          | Produit cloud        |
| 4   | **Télécommande** (locale + cloud) | Staff club (bénévoles)         | Produit cloud + edge |
| 5   | **TV Player**                     | Spectateurs (passif)           | Produit edge         |
| 6   | **Admin Panel Pi**                | Staff club + Techniciens       | Produit edge         |
| 7   | **Central Server API**            | Machines (Dashboard, Pi)       | Infra cloud          |
| 8   | **Sync Agent**                    | Système (automatisé)           | Infra edge           |
| 9   | **Pi Server Socket.IO**           | Télécommande, TV               | Infra edge           |
| 10  | **Watchdogs**                     | Système (automatisé)           | Infra edge           |
| 11  | **Monitoring**                    | Équipe support, fondateurs     | Ops                  |
| 12  | **Toolbox Déploiement**           | Techniciens Neopro             | Ops                  |

---

**Dernière mise à jour** : 15 février 2026
