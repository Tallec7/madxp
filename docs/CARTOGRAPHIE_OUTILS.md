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
  │              Watchdogs (kiosk, sync, hotspot, network)     │
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

**Gestion de flotte :**

- Vue temps réel de 50+ sites (Connected / Unstable / Offline)
- Vue cartographique des sites (Leaflet)
- Fiche site détaillée (5 onglets : État, Contenu, Paramètres, Profils, Debug)
- WiFi status : type de connexion (WiFi/Ethernet/None), signal dBm, indicateurs visuels

**Gestion de contenu :**

- Déploiement vidéo : deploy vers un site ou un groupe, suivi progression temps réel
- Retry / annulation de déploiements (boutons relancer/annuler)
- Alertes déploiements bloqués (>30min warning, >60min critical)
- Loop manager : bandeau santé pipeline, warnings validation, bouton "Répartir dans 3 phases"
- Conversion image vers vidéo (JPG/PNG/WEBP → MP4, durée configurable 5-60s)
- Multi-config profiles : N profils par site (Standard, Tournoi, Match Pro...)
- Brouillons de configuration : préparer les configs à l'avance

**Mises à jour OTA :**

- Upload de packages, déploiement canary / orchestré
- Rollback auto, reboot programmé
- Pré-migrations avant installation

**Télécommande cloud intégrée :**

- Vue live TV + screenshot à la demande (JPEG 480p, ~30-50KB, auto-refresh 5s optionnel)
- Preview télécommande sticky (FAB)
- Indicateur de commandes en attente (si site offline)

**Administration :**

- Gestion utilisateurs : RBAC (6 rôles), MFA TOTP
- Abonnements et facturation : suivi licences, push temps réel, export mensuel CSV/JSON
- File de commandes : commandes en attente pour sites offline, réconciliation à la reconnexion
- Terminal distant (remote shell) : exécution de commandes sur les Pi via WebSocket
- Configuration WiFi remote : scan réseaux et configuration wlan1 depuis l'onglet Debug

**Analytics :**

- Analytics club : santé, disponibilité, historique alertes, usage, contenu
- Analytics annonceurs : impressions, stats quotidiennes
- Auto-suggestion mapping analytics par catégorie
- Export rapports PDF (Chart.js) et Excel multi-feuilles
- Comparaison multi-sites et dashboard temps réel

**Alerting :**

- 18 seuils d'alerte (6 réactifs, 9 prédictifs, 3 kiosk)
- Multi-canal : email, Slack (Block Kit), webhook
- Test Slack webhook intégré
- Escalade vers superviseurs

---

### 2. Portail Annonceur

|            |                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------ |
| **Rôle**   | Permettre aux annonceurs d'uploader leurs vidéos pub et consulter leurs stats d'impression |
| **Public** | Annonceurs (clients publicitaires)                                                         |
| **Accès**  | Web cloud — auth JWT (rôle `advertiser`)                                                   |

**Fonctionnalités :**

- Dashboard personnel avec stats d'impressions par vidéo
- Upload direct de vidéos publicitaires avec détection de doublons
- Gestion du catalogue de vidéos (liste, suppression, association aux sites)
- Consultation des statistiques par période (date range)
- Export de rapports PDF et Excel

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
- Dashboard avec sites gérés

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

**Contrôle de match :**

- Gestion du score en temps réel (mise à jour, reset)
- Phases de match (échauffement, live, mi-temps, fin) avec dropdown de sélection
- Timer (start, pause, reset)
- Modal de configuration match : date, nom du match, estimation spectateurs (badge audience)
- Indicateur d'enregistrement (REC) avec popup inactivité (timer 15min + countdown 3min, auto-stop)

**Gestion vidéo :**

- Sélection de vidéos dans la boucle
- Recherche vidéos instantanée
- Vue "Toutes les vidéos" (accès direct)
- Boucles vidéo par phase : dropdown pour changer de phase (neutre/avant/pendant/après)

**Autres :**

- Sélecteur de profil de configuration
- Breaking news (flash info)

**Fonctionnalités spécifiques au mode cloud :**

- Vue live de l'état du player TV (vidéo en cours, progression, phase, prochaine vidéo)
- Screenshot à la demande (JPEG 480p, auto-refresh optionnel)
- Indicateur de commandes en attente (si site offline)

---

### 5. TV Player

|            |                                                                                     |
| ---------- | ----------------------------------------------------------------------------------- |
| **Rôle**   | Diffuser les boucles vidéo, scores live et contenus sponsors sur l'écran TV du club |
| **Public** | Spectateurs (usage passif — ils regardent la TV)                                    |
| **Accès**  | Chromium en mode kiosk sur le Raspberry Pi                                          |

**Lecteur vidéo :**

- Double-buffer : transitions seamless (preload 1.5s, switch 0.5s avant fin)
- Disk cache warming : prefetch des 3 prochaines vidéos (support boucles 20-100+ vidéos)
- Nettoyage GPU agressif : libération buffers decoder après chaque switch (~30-50MB stable)
- Freeze-frame pre-capture (500ms) pour transitions sans flash
- Hardware H.264 decode (Pi 4), software decode (Pi 5 avec flags spécifiques)
- Récupération auto crash GPU / decoder

**Boucles vidéo :**

- Boucles par phase de match (avant / pendant / après)
- Organisation par catégories
- Navigation dans l'index de la boucle

**Overlay score — 6 sports supportés :**

- Football, Basketball, Handball, Volleyball, Rugby, Hockey
- Périodes automatiques selon le sport
- 9 positions overlay (matrice 3x3 : top/middle/bottom × left/center/right)
- Logos d'équipes (upload base64, affichage dans overlay)
- Goal popup animations : 3 styles (Popup, Fullscreen, Slide) avec son configurable

**Affichage :**

- Timer de match
- Breaking news plein écran
- Watermark sponsor programmable avec scheduling
- Indicateur REC
- Sélecteur de profil (caché si mono-config)
- Bandeau licence (avertissement expiration, blocage complet si expiré/suspendu)

**Cloud :**

- Screenshot sur demande (JPEG 480p via canvas.drawImage)
- Broadcast état player vers le cloud (vidéo, progression, phase, position boucle)
- Offline-first : fonctionne sans internet (toutes ressources bundlées)

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
- Widget sync status : état connexion cloud, dernière sync, commandes en attente, erreurs dead-letter

**Fonctionnalités mode Tech :**

- Configuration complète (`configuration.json`)
- Réseau : scan WiFi, connexion, hotspot, diagnostics réseau
- Système : CPU, disque, services, reboot, version, logs (profondeur 24h)
- Debug bundle : dmesg kernel logs, lsusb, smart cap par service
- Backup / Restore de configuration avec auto-backup
- Mises à jour OTA : upload .tar.gz, déploiement, pré-migrations
- Traitement vidéo : compression, thumbnails, conversion
- Cache management
- Email configuration et test SMTP

---

## Outils Infrastructure (backend / automatisés)

### 7. Central Server API

|            |                                                                                   |
| ---------- | --------------------------------------------------------------------------------- |
| **Rôle**   | Orchestrer toute la logique métier, la persistance et la communication temps réel |
| **Public** | Dashboard, Pi, intégrations (pas d'utilisateur direct)                            |
| **Accès**  | REST + WebSocket (port 443)                                                       |

**Auth et sécurité :**

- JWT HttpOnly cookie + Bearer token, MFA TOTP, reset password par email
- RBAC 6 rôles avec Row-Level Security (Supabase)
- Rate limiting intelligent : 9 niveaux par type d'endpoint (auth 10/15min, upload 10/h, API 100/min, Pi analytics 500/min)
- API key par site (bcrypt hashé), PIN cloud remote (SHA-256, JWT 24h)

**Architecture :**

- 21 repositories typés (Repository Pattern, ESLint enforced, 0 query() direct)
- 9 handlers Socket.IO extraits (heartbeat, config-sync, deploy-progress, command-dispatch, health-monitor, license, network-resilience, score-update, match-config)
- Memory Manager : auto-cleanup à 93% heap, collections bornées, streaming uploads

**Fonctionnalités métier :**

- Déploiement vidéo : orchestration upload FTP, distribution vers Pi, queue system
- OTA : gestion versions, déploiement canary/orchestré, rollback, reboot programmé, pré-migrations
- Conversion image vers vidéo (ffmpeg : JPG/PNG/WEBP → MP4, 5-60s)
- Remote shell : exécution commandes sur Pi, whitelist/blacklist par rôle
- Subscription lifecycle : push temps réel du statut licence après suspend/reactivate/extend
- Alerting : 18 seuils avec agrégation horaire, escalade superviseurs
- Analytics : video plays, sessions, impressions sponsors, agrégation quotidienne
- Rapports : PDF (Chart.js), Excel multi-feuilles, CSV, pitch deck metrics SQL
- Billing : export mensuel CSV/JSON, summary multi-mois

---

### 8. Sync Agent

|            |                                                                                |
| ---------- | ------------------------------------------------------------------------------ |
| **Rôle**   | Synchroniser config, vidéos, analytics et mises à jour entre le cloud et le Pi |
| **Public** | Système (automatisé, service systemd)                                          |
| **Accès**  | Service `neopro-sync-agent.service`                                            |

**Synchronisation :**

- Heartbeat toutes les 30s (CPU, RAM, temp, disque, uptime, kiosk status, version, état player)
- Config sync : polling + merge intelligent (union sponsors/catégories, champs protégés)
- Profils : téléchargement et écriture de tous les profils sur disque
- Connexion Socket.IO locale persistante (singleton, auto-reconnect) — élimine ~120 connect/disconnect par heure

**Déploiement :**

- Download vidéos depuis FTP cloud, vérification SHA256, organisation par catégorie
- OTA : download, backup, installation, pré-migrations, rollback, reboot
- File de commandes : traitement des commandes en attente à la reconnexion

**Analytics :**

- Buffer local fichier, upload batch vers cloud
- Impressions sponsor : tracking et envoi

**Résilience :**

- Détection zombie : vérification cohérence connected flag vs socket réel, auto-reconnexion
- Grace period persistence : sauvegarde sur disque (`/tmp/neopro-watchdog-grace.json`) pour survivre aux restarts OTA
- Kiosk status JSON : lecture du fichier écrit par le watchdog, inclusion dans heartbeat

**Cloud relay :**

- Screenshot relay : relai bidirectionnel dashboard <-> TV
- Player state relay : broadcast état player vers le cloud

---

### 9. Pi Server Socket.IO

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Rôle**   | Relayer les commandes temps réel entre la télécommande et la TV |
| **Public** | Télécommande, TV Player (clients WebSocket)                     |
| **Accès**  | WebSocket port 3000                                             |

**Fonctionnalités :**

- Relay commandes télécommande -> TV (18 événements Socket.IO)
- Gestion score (mise à jour, reset)
- Phases de match (échauffement, live, mi-temps, fin)
- Timer (start, pause, reset, update)
- Options match (type, sport, configuration overlay)
- Breaking news
- Indicateur REC
- Sync TV master/slave (rôles TV, synchronisation boucle)
- HDMI CEC (allumer/éteindre TV)
- Validation licence locale
- Rechargement configuration à chaud

---

### 10. Watchdogs

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Rôle**   | Surveiller et relancer automatiquement les services critiques du Pi |
| **Public** | Système (automatisé)                                                |
| **Accès**  | Scripts bash lancés par systemd                                     |

| Watchdog                | Surveille              | Action                                                                                                        |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Kiosk Watchdog**      | Chromium (kiosk TV)    | Auto-détection Pi 4/5, GPU crash detection (>3 errors/2min), auto-restart max 3/5min, écrit kiosk-status.json |
| **Sync-Agent Guardian** | Sync-agent             | Auto-recovery crash, détection fichiers corrompus, restauration depuis version "golden"                       |
| **Network Watchdog**    | Connectivité réseau    | Recovery progressive 6 phases (Gentle → Medium → Aggressive → Modprobe → USB power-cycle), cooldown 5min      |
| **Hotspot Watchdog**    | WiFi hotspot (hostapd) | Monitoring stabilité, relance automatique                                                                     |

---

## Outils Ops (déploiement / monitoring)

### 11. Monitoring

|            |                                                         |
| ---------- | ------------------------------------------------------- |
| **Rôle**   | Surveiller la santé de l'infrastructure et de la flotte |
| **Public** | Équipe support et fondateurs                            |
| **Accès**  | Grafana (port 3000) + Prometheus (port 9090)            |

**Métriques Prometheus (30+ custom `neopro_*`) :**

- HTTP : requests total, duration p50/p95/p99 par route
- WebSocket : connections par type (pi/dashboard), disconnects par raison, reconnects
- Business : video uploads, deployments, subscription status
- Infrastructure : DB pool (idle/active/waiting), query duration, FTP operations, memory heap
- Kiosk : status, crashes, restarts
- Réseau Pi : WiFi config, heartbeats, network stability

**3 dashboards Grafana :**

- **Overview** : santé API, sites connectés, alertes actives, 5xx rate, latence p95, memory RSS
- **Infrastructure** : HTTP rate/latence par percentile, Node.js runtime (heap, event loop), auth, DB pool, FTP
- **Business & Fleet** : video uploads, fleet Pi (WebSocket par type, heartbeats), transitions vidéo, déploiements, abonnements, kiosk Chromium

**Alerting (18 seuils) :**

- _Réactifs (6)_ : CPU >80/90%, RAM >80/90%, température >70/80°C, disque >80/90%, site offline >5/30min, échec déploiement
- _Prédictifs (9)_ : inactivité >2h, tendance disque (<7j), déconnexions fréquentes >10/30h, WiFi faible <-70/-80dBm, erreurs vidéo >5/20h, tendance température >5°C/h, hotspot instable, abonnement <7/1j, déploiement bloqué >1h
- _Kiosk (3)_ : WebSocket disconnects >10/30h, video safety timeouts >3/10h, Chromium crash >1/3h

**Autres :**

- Health endpoints : `/health`, `/live`, `/ready`
- Agrégation horaire des métriques (toutes les 5min)
- Multi-canal : email (SMTP), Slack (Block Kit), webhook (POST JSON)
- Escalade vers superviseurs
- Authentification Bearer sur `/metrics`

---

### 12. Toolbox Déploiement

|            |                                                              |
| ---------- | ------------------------------------------------------------ |
| **Rôle**   | Installer, configurer et maintenir les boîtiers Raspberry Pi |
| **Public** | Techniciens Neopro                                           |
| **Accès**  | Scripts bash via SSH ou local                                |

**Scripts principaux :**

| Catégorie        | Scripts                                                    | Usage                        |
| ---------------- | ---------------------------------------------------------- | ---------------------------- |
| **Installation** | `setup.sh`, `setup-new-club.sh`, `setup-remote-club.sh`    | Setup initial Pi             |
| **Déploiement**  | `build-and-deploy.sh`, `deploy-remote.sh`, `copy-to-pi.sh` | Build + deploy               |
| **Golden Image** | `prepare-golden-image.sh`, `clone-sd-card.sh`              | Clonage rapide (10 min)      |
| **Diagnostic**   | `diagnose-pi.sh`, `backup-club.sh`, `restore-club.sh`      | Support technique            |
| **Maintenance**  | `cleanup-pi.sh`, `fix-hostname.sh`, `fix-hotspot.sh`       | Correctifs                   |
| **Vidéo**        | `compress-video.sh`, `generate-thumbnail.sh`               | Traitement vidéo             |
| **WiFi**         | `setup-wifi-client.sh`, `setup-auto-backup.sh`             | Configuration réseau, backup |

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

## Fonctionnalités par domaine métier

> Vue transversale — les mêmes fonctionnalités traversent plusieurs outils.

### Diffusion vidéo

| Fonctionnalité                                                 | Outils impliqués                   |
| -------------------------------------------------------------- | ---------------------------------- |
| Boucles vidéo par phase (avant/pendant/après match)            | Dashboard, Télécommande, TV Player |
| Double-buffer seamless (preload + switch)                      | TV Player                          |
| 6 sports supportés (foot, basket, hand, volley, rugby, hockey) | TV Player, Télécommande            |
| Score overlay (9 positions, logos équipes, goal animations)    | TV Player, Télécommande            |
| Watermark sponsor programmable                                 | TV Player, Dashboard               |
| Timer de match                                                 | Télécommande, TV Player            |
| Breaking news plein écran                                      | Télécommande, TV Player            |
| Conversion image → vidéo (JPG/PNG/WEBP → MP4)                  | Dashboard, Central Server          |

### Gestion de contenu

| Fonctionnalité                                        | Outils impliqués                                    |
| ----------------------------------------------------- | --------------------------------------------------- |
| Upload vidéo cloud (50MB, SHA256, FTP)                | Dashboard, Central Server, FTP                      |
| Upload vidéo locale                                   | Admin Panel Pi                                      |
| Déploiement vers site ou groupe                       | Dashboard, Central Server, Sync Agent               |
| Multi-config profiles (N profils par site)            | Dashboard, Central Server, Sync Agent, Télécommande |
| Brouillons de configuration                           | Dashboard, Central Server                           |
| File de commandes (offline → replay à la reconnexion) | Dashboard, Central Server, Sync Agent               |

### Live & match

| Fonctionnalité                              | Outils impliqués                           |
| ------------------------------------------- | ------------------------------------------ |
| Score temps réel                            | Télécommande → Pi Server → TV Player       |
| Phases de match                             | Télécommande → Pi Server → TV Player       |
| Configuration match (date, nom, audience)   | Télécommande → Central Server              |
| Enregistrement (REC) + auto-stop inactivité | Télécommande, TV Player                    |
| QR code accès télécommande                  | Dashboard (génération), Télécommande cloud |

### Analytics & reporting

| Fonctionnalité                         | Outils impliqués                             |
| -------------------------------------- | -------------------------------------------- |
| Tracking impressions sponsors          | TV Player → Sync Agent → Central Server      |
| Tracking video plays                   | TV Player → Sync Agent → Central Server      |
| Dashboard analytics club               | Dashboard                                    |
| Rapports PDF / Excel / CSV             | Dashboard, Central Server, Portail Annonceur |
| Stats annonceur par vidéo/site/période | Portail Annonceur, Portail Agence            |
| Métriques traction (pitch deck)        | Central Server (SQL)                         |

### Supervision & alerting

| Fonctionnalité                                     | Outils impliqués                                 |
| -------------------------------------------------- | ------------------------------------------------ |
| Heartbeat Pi (CPU, RAM, temp, disque, kiosk)       | Sync Agent → Central Server                      |
| 18 seuils d'alerte (réactifs + prédictifs + kiosk) | Central Server, Monitoring                       |
| Notifications multi-canal (email, Slack, webhook)  | Central Server                                   |
| Vue live TV + screenshot à distance                | Dashboard, Central Server, Sync Agent, TV Player |
| Terminal distant (remote shell)                    | Dashboard, Central Server, Sync Agent            |
| Grafana dashboards (3)                             | Monitoring                                       |

### Mise à jour & maintenance

| Fonctionnalité                                   | Outils impliqués                      |
| ------------------------------------------------ | ------------------------------------- |
| OTA (upload, canary, rollback, reboot programmé) | Dashboard, Central Server, Sync Agent |
| Golden Image (clonage SD card)                   | Toolbox Déploiement                   |
| Watchdogs (kiosk, sync-agent, network, hotspot)  | Watchdogs                             |
| Backup / Restore configuration                   | Admin Panel Pi                        |
| Diagnostic complet (debug bundle)                | Admin Panel Pi, Dashboard             |

### Sécurité & accès

| Fonctionnalité                      | Outils impliqués                   |
| ----------------------------------- | ---------------------------------- |
| Auth JWT + MFA TOTP                 | Dashboard, Central Server          |
| RBAC 6 rôles                        | Dashboard, Central Server          |
| PIN cloud remote (SHA-256, JWT 24h) | Télécommande cloud, Central Server |
| API key par site (bcrypt)           | Sync Agent, Central Server         |
| Rate limiting (9 niveaux)           | Central Server                     |
| Row-Level Security (multi-tenant)   | Central Server, PostgreSQL         |

### Gestion commerciale

| Fonctionnalité                  | Outils impliqués                        |
| ------------------------------- | --------------------------------------- |
| Abonnements et licences         | Dashboard, Central Server               |
| Push licence temps réel vers Pi | Central Server → Sync Agent → TV Player |
| Blocage TV si licence expirée   | TV Player                               |
| Facturation export (CSV/JSON)   | Dashboard, Central Server               |
| Portail self-service annonceurs | Portail Annonceur                       |
| Gestion multi-annonceurs        | Portail Agence                          |

---

## Parcours utilisateurs

### Jour de match (bénévole)

```
Scan QR code → Télécommande cloud → PIN (si activé) → Chargement état site
     │
     ├─→ Configurer le match (date, équipes, audience estimée)
     ├─→ Sélectionner phase "Avant-match" → TV bascule sur boucle avant-match
     ├─→ Lancer le chrono
     │
     ├─→ Phase "Match" → TV bascule sur boucle match
     │     ├─→ +1 Home / +1 Away → Score mis à jour en temps réel sur TV
     │     ├─→ Goal → Animation popup sur TV (3 styles au choix)
     │     └─→ Breaking news → Flash info plein écran
     │
     ├─→ Mi-temps → TV bascule sur boucle mi-temps
     │
     └─→ Phase "Après-match" → TV bascule sur boucle post-match
           └─→ REC auto-stop si inactivité 15min
```

**Outils traversés** : Télécommande → Central Server API → Sync Agent → Pi Server Socket.IO → TV Player

---

### Déployer du contenu (opérateur)

```
Dashboard → Upload vidéo (ou conversion image → vidéo)
     │
     ├─→ Vidéo stockée sur FTP + checksum SHA256 calculé
     │
     ├─→ Sélectionner sites/groupe → "Déployer"
     │     │
     │     ├─→ Site en ligne : commande envoyée immédiatement via Socket.IO
     │     └─→ Site offline : commande mise en file d'attente
     │
     ├─→ Sync Agent télécharge la vidéo depuis FTP
     │     ├─→ Vérification checksum SHA256
     │     └─→ Copie dans /home/pi/neopro/videos/{catégorie}/
     │
     ├─→ Configuration mise à jour → Pi Server notifie TV + Remote
     │
     └─→ Vidéo disponible dans la boucle TV et dans la télécommande
```

**Outils traversés** : Dashboard → Central Server → FTP → Sync Agent → Pi Filesystem → Pi Server → TV Player

---

### Installer un nouveau club (technicien)

```
Flash SD card → SSH sur le Pi → setup-new-club.sh
     │
     ├─→ Installation : Node.js, nginx, Chromium, services systemd
     ├─→ Génération API key → stockée dans ~/.neopro-credentials
     ├─→ Configuration hotspot WiFi (NEOPRO-CLUB)
     │
     ├─→ Enregistrement sur le Dashboard (saisie site + API key)
     │     └─→ Central Server stocke le hash de l'API key
     │
     ├─→ Sync Agent se connecte → site passe "Online" sur le Dashboard
     │     └─→ Commandes en attente traitées automatiquement
     │
     ├─→ Pousser la config initiale (catégories, logos, sponsors)
     ├─→ Déployer les premières vidéos
     │
     └─→ Premier affichage TV → club opérationnel
```

**Outils traversés** : Toolbox Déploiement → Admin Panel Pi → Dashboard → Central Server → Sync Agent → TV Player

---

### Consulter ses stats (annonceur)

```
Login portail annonceur → Dashboard personnel
     │
     ├─→ Vue d'ensemble : impressions totales, vidéos actives, sites touchés
     ├─→ Détail par vidéo / par site / par période
     ├─→ Export CSV ou rapport PDF
     │
     │   (En arrière-plan, les impressions sont trackées ainsi :)
     │
     └─→ TV joue une vidéo sponsor → impression enregistrée localement
           → Buffer fichier sur le Pi → envoi batch au cloud
           → Agrégation quotidienne → visible dans le portail
```

**Outils traversés** : TV Player → Sync Agent → Central Server → Portail Annonceur

---

### Alerte critique (support)

```
Pi offline → Central Server détecte absence de heartbeat
     │
     ├─→ Après 5min : alerte "site_offline" créée (severity: critical)
     ├─→ Notification email + Slack envoyée
     │
     ├─→ Support ouvre le Dashboard → voit 🔴 Offline
     │     ├─→ Consulte dernières métriques connues (CPU, temp, disque)
     │     └─→ Prépare commande debug bundle (sera exécutée à la reconnexion)
     │
     ├─→ Pi revient en ligne → Sync Agent se reconnecte
     │     ├─→ Commandes en attente exécutées automatiquement
     │     └─→ Déploiements en attente relancés
     │
     └─→ Support résout l'alerte manuellement dans le Dashboard
```

**Outils traversés** : Sync Agent → Central Server → Monitoring → Dashboard

---

### Mise à jour OTA (admin)

```
Dashboard → Upload package .tar.gz + changelog
     │
     ├─→ Package stocké sur FTP + checksum SHA256
     │
     ├─→ Sélectionner sites → "Déployer" (avec options : reboot, rollback auto)
     │
     ├─→ Sync Agent télécharge le package
     │     ├─→ Backup version actuelle
     │     ├─→ Vérification checksum
     │     ├─→ Exécution pré-migrations
     │     ├─→ Extraction et installation
     │     └─→ Restart services (server, kiosk, sync-agent)
     │
     ├─→ Si succès : version mise à jour dans le Dashboard
     ├─→ Si échec + rollback auto : restauration du backup
     │
     └─→ Dashboard affiche progression temps réel par site
           (Téléchargement 45% → Installation... → ✅ Terminé v3.40)
```

**Outils traversés** : Dashboard → Central Server → FTP → Sync Agent → Systemd → Watchdogs (relance auto)

---

## Flux inter-outils

### Comment les outils communiquent

```
┌────────────┐  HTTP/REST   ┌────────────────┐  Socket.IO   ┌────────────┐
│  Dashboard │ ───────────→ │ Central Server │ ───────────→ │ Sync Agent │
│  Portails  │ ←─────────── │     API        │ ←─────────── │   (Pi)     │
└────────────┘  JSON/JWT    └────────────────┘  Events      └─────┬──────┘
                                    │                              │
                                    │ SQL                    Local Socket.IO
                                    ↓                              │
                             ┌──────────────┐              ┌──────┴──────┐
                             │  PostgreSQL  │              │  Pi Server  │
                             │  (Supabase)  │              │  Socket.IO  │
                             └──────────────┘              └──────┬──────┘
                                                                  │
                                    ┌────────────────┐     ┌──────┴──────┐
                                    │  FTP Storage   │     │  TV Player  │
                                    │  (Hostinger)   │     │  + Remote   │
                                    └────────────────┘     └─────────────┘
```

### Flux principaux

| Flux                    | Chemin                                                              | Protocole                  |
| ----------------------- | ------------------------------------------------------------------- | -------------------------- |
| **Score update**        | Remote → (Central Server →) Sync Agent → Pi Server → TV             | Socket.IO                  |
| **Déploiement vidéo**   | Dashboard → API → FTP ··· Sync Agent ← FTP → Pi disk → TV           | HTTP + FTP + Socket.IO     |
| **Config change**       | Dashboard → API → Sync Agent → config.json → Pi Server → TV/Remote  | HTTP + Socket.IO + FS      |
| **OTA update**          | Dashboard → API → FTP ··· Sync Agent → install → systemd restart    | HTTP + FTP + Socket.IO     |
| **Heartbeat**           | Sync Agent → Central Server → DB + alerting                         | Socket.IO                  |
| **Screenshot**          | Dashboard → API → Sync Agent → Pi Server → TV → (retour inverse)    | Socket.IO (bidirectionnel) |
| **License push**        | Dashboard → API → Sync Agent → Pi Server → TV (bandeau/blocage)     | HTTP + Socket.IO           |
| **Analytics**           | TV → buffer fichier → Sync Agent → batch upload → API → DB          | Fichier + HTTP             |
| **Impressions sponsor** | TV → buffer local → Sync Agent → API → DB → Portail Annonceur       | Fichier + HTTP             |
| **Commande offline**    | Dashboard → API → file DB ··· (Pi reconnexion) → Sync Agent exécute | HTTP + DB + Socket.IO      |

### Modes de communication

| Entre                       | Protocole                              | Latence    |
| --------------------------- | -------------------------------------- | ---------- |
| Dashboard ↔ Central Server  | HTTP REST + WebSocket                  | ~50-200ms  |
| Central Server ↔ Sync Agent | Socket.IO (WebSocket persistant)       | ~100-500ms |
| Sync Agent ↔ Pi Server      | Socket.IO local (singleton persistant) | <5ms       |
| Remote locale ↔ TV Player   | Socket.IO local                        | <5ms       |
| Remote cloud ↔ TV Player    | HTTP → Socket.IO × 3 relais            | ~500ms-2s  |

---

**Dernière mise à jour** : 16 février 2026
