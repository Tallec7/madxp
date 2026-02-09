# Revue d'Architecture Neopro — Audit Complet

**Date** : 2026-02-09
**Version analysee** : 3.7.15
**Methodologie** : Analyse croisee documentation (CLAUDE.md) + exploration exhaustive du codebase
**Perimetre** : Documentation, architecture systeme/reseau/applicative/donnees, exploitabilite

---

## Table des matieres

1. [Resume executif](#1-resume-executif)
2. [Vue d'ensemble du systeme](#2-vue-densemble-du-systeme)
3. [Analyse par brique](#3-analyse-par-brique)
   - 3.1 Central Server (API Backend)
   - 3.2 Central Dashboard (Angular 20)
   - 3.3 Raspberry Pi (Edge)
   - 3.4 Documentation (docs/)
   - 3.5 Infrastructure (CI/CD, Docker, K8s)
4. [Analyse par profil](#4-analyse-par-profil)
   - 4.1 Profil systeme
   - 4.2 Profil reseau
   - 4.3 Profil applicatif
   - 4.4 Profil donnees
5. [Lacunes identifiees](#5-lacunes-identifiees)
6. [Ambiguites et incoherences](#6-ambiguites-et-incoherences)
7. [Sur-architecture et redondances](#7-sur-architecture-et-redondances)
8. [Evaluation exploitabilite](#8-evaluation-exploitabilite)
9. [Recommandations priorisees](#9-recommandations-priorisees)
10. [Annexes](#10-annexes)

---

## 1. Resume executif

### Verdict global

Le projet Neopro est un systeme de TV interactive pour clubs sportifs, architecturalement mature et fonctionnellement complet. La documentation principale (CLAUDE.md, 239 KB) constitue un document de reference remarquablement detaille, couvrant l'essentiel de l'architecture, des patterns de code, et de l'historique des changements.

**Points forts :**
- Alignement documentation/code a ~95%
- Architecture 3-tiers claire (Cloud / Dashboard / Edge)
- Couverture fonctionnelle tres large (50+ endpoints API, 30+ commandes Pi)
- Historique des breaking changes exhaustif (facilite le debugging)
- Patterns de code coherents et bien documentes

**Points faibles :**
- Documentation concentree dans un seul fichier monolithique (CLAUDE.md : 239 KB)
- Lacunes sur l'infrastructure (CI/CD, Docker, K8s non documentes dans CLAUDE.md)
- Test coverage insuffisante (23 spec.ts, 3 E2E)
- Couplage fort entre composants (synchronisation manuelle Remote Pi / Cloud Remote)
- Certaines briques non documentees (monitoring Pi, handlers Socket.IO)

### Metriques du codebase

| Composant | Fichiers code (.ts/.js) | Tests | Documentation |
|-----------|------------------------|-------|---------------|
| Central Server | ~200 | 37 suites | Bien couvert |
| Central Dashboard | ~105 | ~23 spec | Bien couvert |
| Raspberry Pi | ~137 | Faible | Couvert dans CLAUDE.md |
| E2E | 3 | 3 specs | Minimal |
| Documentation | — | — | 136 fichiers markdown |
| **Total** | **~538** | **~63** | **136 docs** |

---

## 2. Vue d'ensemble du systeme

### Architecture globale

```
                    INTERNET
                       |
    ┌──────────────────┼──────────────────┐
    |                  |                  |
    v                  v                  v
┌─────────┐    ┌─────────────┐    ┌──────────────┐
│Dashboard │    │Central      │    │ FTP/Supabase │
│Angular 20│◄──►│Server       │◄──►│ Storage      │
│(Hostinger)│   │(Railway)    │    │ (Hostinger)  │
└─────────┘    └──────┬──────┘    └──────────────┘
                      │
                      │ Socket.IO (WebSocket)
                      │
            ┌─────────┼─────────┐
            │         │         │
            v         v         v
       ┌────────┐ ┌────────┐ ┌────────┐
       │  Pi 1  │ │  Pi 2  │ │  Pi N  │   (50+ boitiers)
       │ Club A │ │ Club B │ │ Club N │
       └────────┘ └────────┘ └────────┘
```

### Composants par site (Raspberry Pi)

```
┌─────────────────────────────────────────────────────┐
│                  Raspberry Pi                        │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ TV (Angular) │  │Remote(Angular│                 │
│  │ :4200/tv     │  │ :4200/remote │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │   BroadcastChannel   │                     │
│         └──────────┬───────────┘                     │
│                    │ Socket.IO                       │
│         ┌──────────v───────────┐                     │
│         │  Local Server :3000  │                     │
│         └──────────┬───────────┘                     │
│                    │ relay                           │
│         ┌──────────v───────────┐                     │
│         │   Sync-Agent         │──► Central Server   │
│         └──────────────────────┘    (Socket.IO)      │
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────┐     │
│  │ Admin :8080  │  │ Scripts (setup, diag, fix)│     │
│  └──────────────┘  └──────────────────────────┘     │
│                                                      │
│  Services systemd:                                   │
│  neopro-app, neopro-sync-agent, neopro-admin,       │
│  neopro-kiosk, hotspot-watchdog, hotspot-optimizer,  │
│  sync-guardian                                       │
└─────────────────────────────────────────────────────┘
```

---

## 3. Analyse par brique

### 3.1 Central Server (API Backend)

**Role** : API REST + WebSocket hub pour la gestion de la flotte de Pi, le stockage de donnees, et l'orchestration des deploiements.

**Technologies** : Node.js 18+, Express 4.18, TypeScript strict, PostgreSQL 15, Socket.IO 4.7, Redis (optionnel)

#### Responsabilites

| Domaine | Controllers | Services | Routes |
|---------|------------|----------|--------|
| Authentification | auth, mfa | mfa, password-reset | auth, mfa |
| Gestion sites | sites | socket, command-queue | sites |
| Contenu video | content | deployment, orchestrated-deployment, upload-verification, image-to-video | content, drafts |
| Assets | assets | asset | assets |
| Abonnements | subscription | subscription | subscription |
| Analytics | analytics, advertiser-analytics | realtime-stats, cron-scheduler | analytics |
| Alertes | alerts | alert, alerting, predictive-alerts, network-alerts | alerts |
| Benchmark | benchmark | benchmark | benchmark |
| Remote cloud | remote | — (utilise socket.service) | remote |
| Rapports | reports, billing | pdf-report, excel-export | reports, billing |
| Admin | admin, audit | admin-ops, audit | admin, audit |
| Utilisateurs | users | — | users |
| Annonceurs | advertiser-portal, advertiser-sites, agency | — | advertiser-*, agency |

**Total** : 36 controllers, 52+ services, 33 fichiers routes, 12 middleware

#### Dependances entrantes
- Dashboard Angular (HTTP REST + JWT cookie)
- Raspberry Pi Sync-Agent (Socket.IO + API key)
- Cloud Remote (HTTP REST sans auth, rate-limited)
- Cron interne (daily stats, cleanup, alerts)

#### Dependances sortantes
- PostgreSQL (Supabase) : persistence
- FTP Hostinger : stockage videos
- Supabase Storage : stockage fallback
- Redis Upstash : Socket.IO adapter (optionnel)
- SMTP : emails (password reset, alertes)
- Logtail : logs centralises

#### Evaluation

| Critere | Note | Commentaire |
|---------|------|-------------|
| Separation des responsabilites | 8/10 | Bonne separation controller/service/route. Quelques controllers font trop (sites.controller.ts) |
| Securite | 9/10 | JWT HttpOnly, MFA, RLS, rate limiting per-route, SQL parametrique, CSP |
| Observabilite | 8/10 | Correlation ID, Prometheus, Logtail, audit logs. Manque : tracing distribue |
| Scalabilite | 6/10 | Pool DB 5 connexions, Railway Hobby plan ~40MB heap. Redis adapter present mais non utilise par defaut |
| Maintenabilite | 7/10 | Patterns coherents, mais 36 controllers monolithiques, pas de couche repository |

---

### 3.2 Central Dashboard (Angular 20)

**Role** : Interface d'administration pour la gestion des clubs, du contenu video, des abonnements, et du monitoring.

**Technologies** : Angular 20, Chart.js, Leaflet, Standalone Components, SCSS

#### Responsabilites

| Module | Composants | Role |
|--------|-----------|------|
| sites | 10 sub-components | Gestion des clubs (4 onglets : Etat/Contenu/Parametres/Debug) |
| content | 1 | Upload et gestion des videos cloud |
| dashboard | 1 | Vue d'ensemble de la flotte |
| subscriptions | 1 | Gestion des licences/abonnements |
| remote | 1 (cloud-remote) | Telecommande a distance (PUBLIC) |
| admin | 3+ | Gestion utilisateurs, categories |
| advertisers | 2+ | Gestion des annonceurs |
| agency-portal | 1 | Portail agences |

**Total** : 18 feature modules, 20 core services, 6 shared components

#### Dependances entrantes
- Utilisateurs (navigateur web)
- Cloud Remote (utilisateurs staff club via QR code)

#### Dependances sortantes
- Central Server (HTTP REST + JWT)
- Socket.IO (temps reel optionnel via socket.service.ts)

#### Evaluation

| Critere | Note | Commentaire |
|---------|------|-------------|
| Architecture Angular | 8/10 | Standalone components, lazy loading, bonne separation features/shared/core |
| UX/UI coherence | 7/10 | Design flat coherent. Quelques residus de styles gradient (subscriptions page) |
| Reutilisabilite | 6/10 | Seulement 6 shared components pour 18 features. Potentiel d'extraction eleve |
| Tests | 4/10 | ~23 spec.ts : couverture faible pour un dashboard critique |
| Performance | 7/10 | Budget strict (1MB initial), mais composants avec beaucoup de CSS inline |

---

### 3.3 Raspberry Pi (Edge)

**Role** : Affichage TV en mode kiosk, telecommande locale, synchronisation avec le cloud, auto-maintenance.

**Technologies** : Angular 20 (TV/Remote), Node.js (Sync-Agent, Server, Admin), Chromium kiosk, Bash scripts, systemd

#### Sous-composants et responsabilites

| Sous-composant | Port | Technologie | Role |
|---------------|------|-------------|------|
| TV (Angular) | 80 (nginx) | Angular 20 + Chromium kiosk | Affichage boucle video, score overlay, watermark |
| Remote (Angular) | 80 (nginx) | Angular 20 | Telecommande tactile pour le staff |
| Local Server | 3000 | Express + Socket.IO | Hub de communication local TV/Remote |
| Sync-Agent | — | Node.js + Socket.IO | Connexion cloud, commandes, heartbeat |
| Admin Panel | 8080 | Express + vanilla JS | Administration systeme (videos, WiFi, services) |
| Kiosk Watchdog | — | Bash | Recovery Chromium crashes |
| Hotspot Watchdog | — | Bash | Surveillance WiFi AP (wlan0) |
| Hotspot Optimizer | — | Bash (boot) | Selection canal WiFi optimal |
| Sync Guardian | — | Bash | Restauration sync-agent si crash |

**Total** : 9 sous-composants, 14 services Angular, 30+ commandes sync-agent, 7 services systemd

#### Dependances entrantes
- Central Server (Socket.IO : commandes, deploiements, config)
- Utilisateurs staff (hotspot WiFi : /remote, admin :8080)
- QR Code Cloud Remote (via Central Server relay)

#### Dependances sortantes
- Central Server (heartbeat, sync_local_state, analytics)
- FTP/Supabase (telechargement videos)
- HDMI-CEC (detection etat TV)
- wlan0 (hotspot AP)
- wlan1 ou eth0 (connexion Internet)

#### Evaluation

| Critere | Note | Commentaire |
|---------|------|-------------|
| Resilience | 9/10 | Triple couche de recovery (kiosk watchdog, sync guardian, network watchdog) |
| Auto-maintenance | 9/10 | Hotspot auto-repair, channel optimization, license cache offline |
| Complexite TV | 8/10 | Double-buffer + freeze-frame + error recovery sophistique et bien documente |
| Maintenabilite | 5/10 | sync-agent/commands/index.js encore a ~650 lignes, admin/app.js a ~3600 lignes vanilla JS |
| Testabilite | 3/10 | Tres peu de tests unitaires cote Pi. Dependance forte a l'environnement physique |

---

### 3.4 Documentation (docs/)

**Role** : Reference technique, guides d'installation, troubleshooting, decisions d'architecture, docs client.

**Contenu** : 136 fichiers markdown repartis dans 22 repertoires

| Repertoire | Fichiers | Contenu |
|-----------|----------|---------|
| technical/ | 14 | Architecture, sync, error handling, reference API |
| guides/ | 14 | Installation, troubleshooting, configuration |
| changelog/ | 36 | Historique des versions (auto-genere) |
| business/ | 6 | Business plan, roadmap |
| audit/ | 4 | Rapports d'audit |
| clients/ | 1 | Fiche client critique (NLF) |
| research/ | 2 | Analyse industrie WiFi mesh |
| adr/ | 5 | Architecture Decision Records |
| legal/ | 4 | CGU, confidentialite, RGPD |
| modops/ | 4 | Procedures operationnelles |
| archive/ | 11 | Ancienne documentation |
| analysis/ | 2 | Debug bundles clients |

#### Evaluation

| Critere | Note | Commentaire |
|---------|------|-------------|
| Exhaustivite | 8/10 | Tres complet sur l'applicatif. Lacunes sur l'infrastructure |
| Structure | 6/10 | 136 fichiers mais navigation difficile. 00-INDEX.md est le seul point d'entree |
| Maintenance | 7/10 | Changelog auto-genere. CLAUDE.md mis a jour regulierement |
| Accessibilite junior | 5/10 | CLAUDE.md est un mur de 239KB. Pas de "getting started" simple |

---

### 3.5 Infrastructure (CI/CD, Docker, K8s)

**Role** : Build, test, deploiement automatise.

| Element | Fichiers | Documente dans CLAUDE.md |
|---------|----------|--------------------------|
| GitHub Actions | 5 workflows (ci, release, release-webapp, publish-install, railway-restart) | NON |
| Docker | docker-compose.yml + docker/ (Grafana, Prometheus) | NON |
| Kubernetes | k8s/ (base, overlays) | NON |
| Railway | railway.json, Dockerfile | Partiellement (mention Railway) |
| Scripts root | scripts/ (check-version, changelog) | NON |
| Config partagee | config/ (eslint, prettier, tsconfig base) | NON |

#### Evaluation

| Critere | Note | Commentaire |
|---------|------|-------------|
| CI/CD | 7/10 | Pipelines fonctionnels mais non documentes |
| Monitoring | 4/10 | Grafana/Prometheus present mais aucune doc d'utilisation |
| Deploiement | 6/10 | Railway auto-deploy, mais k8s semble experimental/non utilise |
| Documentation | 2/10 | Lacune majeure : aucune section infrastructure dans CLAUDE.md |

---

## 4. Analyse par profil

### 4.1 Profil systeme

#### Points forts
- **Services systemd bien structures** : 7 services systemd avec dependencies claires (kiosk, sync-agent, admin, hotspot-watchdog, optimizer, guardian)
- **Graceful shutdown** : SIGTERM handlers dans le central-server, fermeture propre des pools DB et Socket.IO
- **Health checks** : `/health`, `/live`, `/ready` pour Kubernetes/Railway
- **Memory management** : Memory-manager.service.ts avec pression-based cleanup adapte au Railway Hobby plan
- **Watchdog multi-couche** : Kiosk watchdog (Chromium), sync guardian (agent.js), hotspot watchdog (wlan0)

#### Points faibles
- **Single point of failure** : Railway Hobby plan = 1 seule instance, pas de HA
- **Pool DB minimal** : 5 connexions max, risque de saturation en charge
- **Pas de load balancer** : Redis adapter present mais non active par defaut
- **Logging distribue partiel** : Logtail cote serveur, mais logs Pi locaux uniquement (pas de centralisation Pi → cloud)

#### Risques identifies

| Risque | Severite | Probabilite | Mitigation existante |
|--------|----------|-------------|---------------------|
| OOM crash Railway | Haute | Moyenne | Memory manager, optimisations v3.7.4 |
| Perte de connexion DB | Haute | Faible | Pool avec retry, health checks |
| Crash Chromium Pi | Moyenne | Haute (apres 2h+) | Kiosk watchdog, error recovery, cleanup memoire |
| Sync-agent corrompu | Haute | Faible | Sync guardian + golden image restore |
| Hotspot WiFi instable | Moyenne | Moyenne | Hotspot watchdog + optimizer + fix-hotspot.sh |

---

### 4.2 Profil reseau

#### Architecture reseau du Pi

```
┌──────────────────────────────────────────┐
│              Raspberry Pi                 │
│                                           │
│  wlan0 (integre) ─── Hotspot AP          │
│    │                  SSID: NEOPRO-XXX    │
│    │                  IP: 192.168.4.1     │
│    │                  Port 80 (nginx)     │
│    │                  Port 3000 (socket)  │
│    │                  Port 8080 (admin)   │
│    │                                      │
│    │     ┌──────────────────────┐         │
│    └────►│ Appareils staff club │         │
│          │ /remote, /admin      │         │
│          └──────────────────────┘         │
│                                           │
│  wlan1 (dongle USB) ─── WiFi Client      │
│    │                    ou                │
│  eth0 ──────────────── Ethernet           │
│    │                                      │
│    └──► Internet ──► Central Server       │
│              (Socket.IO + HTTP)            │
└──────────────────────────────────────────┘
```

#### Detection de profil reseau (v2.35+)

| Profil | Detection | Comportement automatique |
|--------|-----------|-------------------------|
| simple | 1 AP, pas d'isolation | BSSID lock autorise |
| mesh | >1 AP meme SSID | BSSID lock bloque, bgscan active |
| mesh_isolated | Mesh + isolation client | Cloud Remote recommande |
| enterprise | 802.1X detecte | Config IT requise |
| ethernet | eth0 UP avec IP | Score stabilite 100 |

#### Points forts
- **Detection automatique** : NetworkDetector classifie le reseau au boot + toutes les heures
- **Matrice de securite** : SafeNetworkOperations bloque les operations dangereuses par profil
- **Auto-recovery** : NetworkWatchdog (3 boucles : hotspot 30s, internet 60s, cloud 30s)
- **Rollback reseau** : Sauvegarde config avant operations risquees, rollback en 30s
- **Cloud Remote** : Contourne l'isolation client en passant par Internet

#### Points faibles
- **Pas de monitoring reseau centralise** : Les alertes reseau sont evaluees toutes les 4h cote serveur, pas en temps reel
- **Dependance hotspot** : Si wlan0 tombe, les utilisateurs locaux perdent l'acces /remote
- **mDNS fragile** : `neopro.local` depend d'Avahi, pas toujours fiable sur Android/Windows

---

### 4.3 Profil applicatif

#### Flux de donnees principaux

| Flux | Source | Destination | Protocole | Frequence |
|------|--------|-------------|-----------|-----------|
| Heartbeat | Pi | Central | Socket.IO | 30s |
| Sync local state | Pi | Central | Socket.IO | 30s |
| Video deploy | Central | Pi | Socket.IO + HTTP | A la demande |
| Config update | Central | Pi | Socket.IO | A la demande |
| Analytics | Pi | Central | HTTP batch | Variable |
| Cloud Remote | Dashboard | Central → Pi | HTTP → Socket.IO | A la demande |
| Dashboard polling | Dashboard | Central | HTTP | 30-60s |
| License check | Central | Pi | Socket.IO event | A chaque sync |

#### Patterns architecturaux identifies

| Pattern | Localisation | Qualite |
|---------|-------------|---------|
| Singleton services | Central Server (tous les services) | Correct, exporte en instance unique |
| Command Queue | command-queue.service.ts | Robuste, gere online/offline |
| Double-buffer video | TV component | Sophistique, bien documente |
| Config draft + orchestrated deploy | draft.service + orchestrated-deployment | Bonne separation des concerns |
| Rate limiting per-route | middleware/user-rate-limit.ts | Evolution positive (v3.7.14 : suppression doubles comptages) |
| Merge intelligent | config-merge.js | Complexe mais necessaire |
| Row-Level Security | PostgreSQL RLS + middleware | Securite multi-tenant solide |

#### Anti-patterns detectes

| Anti-pattern | Localisation | Impact | Severite |
|-------------|-------------|--------|----------|
| **God Component** | admin/public/app.js (3600 lignes vanilla JS) | Tres difficile a maintenir | Haute |
| **Sync manuelle** | Remote Pi ↔ Cloud Remote (copie manuelle HTML/SCSS/TS) | Risque de divergence, bug non reproduit | Haute |
| **Monolithisme** | CLAUDE.md (239 KB, fichier unique) | Impossible a naviguer efficacement | Moyenne |
| **Legacy coexistence** | sponsors/* ↔ advertisers/* (2 systemes de nommage) | Confusion pour nouveaux devs | Moyenne |
| **CSS inline massif** | Composants Angular (styles inline, certains > 2000 lignes) | Pas de design system reutilisable | Moyenne |
| **Analytics fantome** | features/analytics/ existe mais "supprime en v3.0" | Code mort source de confusion | Faible |

---

### 4.4 Profil donnees

#### Schema relationnel (tables principales)

```
users (7 roles)
  |
  ├── sites (50+ clubs)
  │     ├── metrics (7 jours retention)
  │     ├── config_history (20 versions/site)
  │     ├── config_drafts (1/site UNIQUE)
  │     ├── content_deployments
  │     ├── orchestrated_deployments
  │     ├── remote_commands (30 jours)
  │     ├── alerts (90 jours)
  │     ├── club_sessions
  │     ├── video_plays (90 jours)
  │     ├── club_daily_stats (indefini)
  │     └── subscription_history
  │
  ├── videos
  │     ├── content_deployments
  │     └── advertiser_videos (M:N)
  │
  ├── advertisers
  │     ├── advertiser_videos (M:N)
  │     ├── advertiser_sites (M:N)
  │     ├── advertiser_impressions (90 jours)
  │     └── advertiser_daily_stats (indefini)
  │
  └── agencies
        └── agency_sites (M:N)
```

#### Politique de retention

| Table | Retention | Justification |
|-------|-----------|---------------|
| video_plays | 90 jours | Donnees granulaires, agreges dans club_daily_stats |
| advertiser_impressions | 90 jours | Agreges dans advertiser_daily_stats |
| metrics | 7 jours | Debug court terme uniquement |
| config_history | 20 versions/site | Rollback realiste |
| remote_commands | 30 jours | Historique debug |
| alerts | 90 jours | Patterns d'incidents |
| audit_logs | 90 jours | Conformite |
| club_daily_stats | Indefini | Historique long terme |
| advertiser_daily_stats | Indefini | Historique long terme |

#### Points forts
- **Politique de retention documentee et implementee** (cron a 3h du matin)
- **Buffers Pi avec limite** (50K evenements FIFO)
- **Agregation quotidienne** pre-calculee (evite le calcul temps reel)
- **RLS multi-tenant** : Filtrage automatique par role PostgreSQL
- **29 migrations SQL** avec historique complet

#### Points faibles
- **Pas de couche repository** : Les controllers font directement `query()` → couplage SQL/logique metier
- **Pas de schema validation cote DB** : JSONB utilise pour config, metadata sans contraintes
- **Migration manuelle** : `npm run db:migrate` execute les scripts, pas d'outil de migration versionne (type Flyway/Knex)
- **Pas de backup automatise documente** : Supabase fait probablement des backups, mais pas explicite

---

## 5. Lacunes identifiees

### 5.1 Lacunes de documentation

| Element | Statut dans CLAUDE.md | Statut reel | Impact |
|---------|----------------------|-------------|--------|
| CI/CD (GitHub Actions) | Absent | 5 workflows actifs | Un dev junior ne saurait pas comment le CI fonctionne |
| Docker/Monitoring | Absent | docker/ avec Grafana+Prometheus | Infrastructure de monitoring inexploitable |
| Kubernetes | Absent | k8s/ avec base+overlays | Config de deploiement inutilisable |
| Scripts root | Absent | scripts/ (check-version, changelog) | Outils de release non documentes |
| Config partagee | Absent | config/ (eslint, prettier, tsconfig base) | Conventions de dev non expliquees |
| Handlers Socket.IO | Minimal | 2 handlers (match-config, score-update) | Logique metier cachee |
| remote-shell-security | Absent | Middleware actif | Securite critique non documentee |
| Admin panel sessions | Absent | 8h TTL, persistence fichier | Securite admin panel non documentee |
| Memory manager | Minimal | Service actif dans server.ts | Optimisation critique non detaillee |
| Monitoring Pi | Absent | raspberry/monitoring/ client+server | Outil disponible mais inutilisable |
| Tools Pi | Absent | raspberry/tools/ (golden image, recovery) | Outils de production non documentes |
| server-render | Present | N'existe plus (supprime ou deplace) | Reference morte dans CLAUDE.md |

### 5.2 Lacunes techniques

| Lacune | Consequence | Priorite |
|--------|------------|----------|
| Pas de tracing distribue (OpenTelemetry) | Debugging cross-service difficile (Dashboard → Server → Pi) | Moyenne |
| Pas de tests de charge | Limites de scaling inconnues (50 Pi OK, 200 Pi ?) | Haute |
| Pas de backup DB documente | Risque perte de donnees si incident Supabase | Haute |
| Pas de runbook operationnel | Procedures d'urgence non formalisees | Moyenne |
| Pas de feature flags | Deploiements tout-ou-rien | Faible |
| Pas de tests d'integration reseau | Les scenarios mesh/isolation sont testes uniquement en prod | Moyenne |

---

## 6. Ambiguites et incoherences

### 6.1 Ambiguites architecturales

| Ambiguite | Description | Risque |
|-----------|------------|--------|
| **analytics/ "supprime" mais present** | CLAUDE.md v3.0 dit "pages analytics supprimees", mais le repertoire features/analytics/ existe toujours avec ses composants | Un dev pourrait croire que le code est actif |
| **sponsors vs advertisers** | Deux systemes de nommage coexistent (sponsor-portal, advertiser-portal). Routes legacy avec redirects | Confusion pour les nouveaux developpeurs |
| **server-render** | CLAUDE.md mentionne ce repertoire dans l'architecture, mais il n'existe pas dans le repo | Reference morte |
| **systemd double** | `raspberry/config/systemd/` (11 fichiers) ET `raspberry/systemd/` (3 fichiers) : 2 repertoires pour les services | Duplication, risque de divergence |
| **Local Server lifecycle** | Qui demarre le local server (port 3000) ? Pas clair : neopro-app ou un service systemd dedie ? | Gap dans la documentation des services |
| **socket.service.ts dual** | Le dashboard ET le central-server ont chacun un socket.service.ts avec des roles differents | Nom identique, confusion potentielle |

### 6.2 Responsabilites mal definies

| Zone | Probleme | Consequence |
|------|----------|-------------|
| **Remote sync** | Le Cloud Remote est une "copie quasi-identique" du Remote Pi, avec synchronisation manuelle | Si un dev modifie le Remote Pi, il doit penser a reporter manuellement. Aucun mecanisme de detection de divergence |
| **Config deployment** | 3 modes possibles : merge, replace, orchestrated. Le choix n'est pas guide pour les nouveaux devs | Risque de deployer dans le mauvais mode |
| **Rate limiting ownership** | Certains rate limiters sont dans server.ts, d'autres dans les routes. La regle est documentee mais fragile | v3.7.14 a corrige un double comptage, d'autres cas similaires possibles |

---

## 7. Sur-architecture et redondances

### 7.1 Elements potentiellement sur-architectures

| Element | Description | Justification possible | Recommandation |
|---------|------------|----------------------|----------------|
| **Kubernetes config** | k8s/ avec base+overlays alors que le deploiement est sur Railway | Preparation future ? | Documenter l'intention ou supprimer |
| **Docker monitoring** | Grafana+Prometheus sans documentation d'usage | Experimentation non finalisee | Documenter ou archiver |
| **Canary deployment service** | canary-deployment.service.ts pour rollout progressif | Pertinent pour 50+ Pi, mais usage reel non documente | Documenter les cas d'usage |
| **Memory cache service** | LRU cache en memoire alors que le serveur tourne sur 1 instance avec 40MB | Utile pour reduire les queries DB | Evaluer le gain reel |
| **5 types de surveillance reseau Pi** | NetworkDetector + NetworkWatchdog + SafeNetworkOperations + HotspotWatchdog + HotspotOptimizer | Chaque couche adresse un probleme reel | Docummenter comment elles interagissent |

### 7.2 Redondances identifiees

| Redondance | Fichiers concernes | Impact |
|-----------|-------------------|--------|
| **Double systemd** | raspberry/config/systemd/ + raspberry/systemd/ | Confusion sur la source de verite |
| **Sponsor/Advertiser legacy** | sponsor-*.ts + advertiser-*.ts dans controllers, routes, services | Double maintenance |
| **CSS inline vs shared** | Styles inline massifs dans les composants au lieu d'un design system | Pas de reutilisation des styles |
| **CLAUDE.md vs docs/** | Certaines infos sont dans CLAUDE.md ET dans docs/technical/ | Double source de verite, risque de divergence |
| **proof_of_broadcasts table** | Table DB existe mais feature supprimee en v3.0 | Donnees orphelines en base |

---

## 8. Evaluation exploitabilite

### 8.1 Pour un developpeur junior

| Critere | Note | Justification |
|---------|------|---------------|
| **Comprendre le projet** | 7/10 | Le contexte metier est bien explique dans CLAUDE.md. Le schema ASCII aide beaucoup |
| **Trouver ou coder** | 5/10 | 239 KB de CLAUDE.md sans Ctrl+F efficace. Pas de "getting started" dedie |
| **Ecrire du code correct** | 8/10 | Patterns de code bien documentes avec exemples copier-coller |
| **Eviter les pieges** | 7/10 | Section "NE JAMAIS FAIRE" tres explicite. Breaking changes bien documentes |
| **Debugger un probleme** | 6/10 | Troubleshooting exhaustif mais noye dans la masse du document |
| **Comprendre le deploiement** | 3/10 | CI/CD, Docker, Railway non documentes dans CLAUDE.md |
| **Lancer le projet en local** | 4/10 | Commandes listees mais pas de guide step-by-step "from scratch" |
| **Score global junior** | **5.7/10** | Le junior sera surcharge d'info mais manquera de guidage pratique |

### 8.2 Pour une agence web externe

| Critere | Note | Justification |
|---------|------|---------------|
| **Comprendre le perimetre** | 8/10 | Architecture, base de donnees, API tres bien documentes |
| **Estimer la complexite** | 7/10 | Nombre de composants, services, et endpoints clairement quantifiable |
| **Identifier les risques** | 6/10 | Breaking changes documentes, mais pas de "tech debt register" formel |
| **Planifier une reprise** | 5/10 | Manque : diagrammes de deploiement, runbooks, SLA, procedures de migration |
| **Evaluer la qualite du code** | 7/10 | Patterns coherents, TypeScript strict, mais coverage faible |
| **Comprendre les dependances** | 6/10 | 56 deps runtime listees, mais pas d'analyse de vulnerabilites/obsolescence |
| **Score global agence** | **6.5/10** | L'agence pourrait reprendre le projet mais avec un temps d'onboarding significatif |

### 8.3 Recommandations pour l'exploitabilite

1. **Creer un ONBOARDING.md** separe et concis (~5 pages) avec :
   - Prerequisites (Node 18, PostgreSQL, etc.)
   - Setup local step-by-step
   - Premier deploiement test
   - Architecture en 1 page (diagramme simple)
   - Liens vers les sections detaillees de CLAUDE.md

2. **Scinder CLAUDE.md** en documents thematiques :
   - `ARCHITECTURE.md` : Vue systeme
   - `API_REFERENCE.md` : Routes et formats
   - `DATABASE.md` : Schema et migrations
   - `CHANGELOG.md` : Historique (deja dans docs/changelog/)
   - `CLAUDE.md` : Garder uniquement les instructions pour Claude Code

3. **Ajouter des diagrammes d'architecture** :
   - Diagramme de deploiement (Cloud/Edge)
   - Diagramme de composants par Pi
   - Diagramme de flux de donnees
   - Diagramme de sequence pour les cas critiques

---

## 9. Recommandations priorisees

### Court terme (1-4 semaines)

| # | Recommandation | Effort | Impact | Justification |
|---|---------------|--------|--------|---------------|
| 1 | **Supprimer features/analytics/** ou documenter explicitement son statut | S | Moyen | Code mort source de confusion |
| 2 | **Documenter le CI/CD** dans CLAUDE.md (section dediee) | M | Haut | Un dev ne peut pas comprendre le pipeline actuel |
| 3 | **Consolider raspberry/systemd/** dans config/systemd/ | S | Faible | Eliminer la duplication |
| 4 | **Supprimer la reference server-render** de CLAUDE.md | S | Faible | Reference morte |
| 5 | **Creer un ONBOARDING.md** de 5 pages | M | Haut | Onboarding junior et agence |
| 6 | **Documenter le middleware remote-shell-security** | S | Moyen | Securite critique non visible |
| 7 | **Nettoyer les routes sponsor-*.ts legacy** ou documenter la coexistence | M | Moyen | Confusion naming |

### Moyen terme (1-3 mois)

| # | Recommandation | Effort | Impact | Justification |
|---|---------------|--------|--------|---------------|
| 8 | **Augmenter la couverture de tests** (objectif : 60% lignes) | L | Haut | 23 spec.ts pour un dashboard critique |
| 9 | **Extraire un design system Angular** (shared styles, tokens) | L | Moyen | 6 shared components pour 18 features |
| 10 | **Scinder CLAUDE.md** en documents thematiques | M | Haut | 239 KB est inexploitable en l'etat |
| 11 | **Creer une couche repository** dans le central-server | L | Moyen | Decouplage SQL/logique metier |
| 12 | **Refactorer admin/public/app.js** (3600 lignes vanilla JS) | L | Moyen | Maintenabilite critique |
| 13 | **Unifier le Remote Pi et Cloud Remote** (composant partage ou generation) | L | Haut | Risque de divergence lors de chaque modification |
| 14 | **Documenter les procedures de backup/restore DB** | S | Haut | Risque de perte de donnees |
| 15 | **Ajouter des tests de charge** pour valider le scaling a 100+ Pi | M | Haut | Limites de scaling inconnues |

### Long terme (3-6 mois)

| # | Recommandation | Effort | Impact | Justification |
|---|---------------|--------|--------|---------------|
| 16 | **Migrer vers un ORM ou query builder** (Drizzle, Kysely) | XL | Moyen | Decouplage DB, type safety SQL |
| 17 | **Implementer OpenTelemetry** pour le tracing distribue | L | Moyen | Debugging cross-service Dashboard → Server → Pi |
| 18 | **Evaluer la migration Railway Hobby → Pro** ou vers K8s | M | Haut | 40MB heap, 1 instance = single point of failure |
| 19 | **Creer un SDK partage** pour le protocole Socket.IO (types + events) | L | Moyen | Contrat d'interface entre Pi et Server |
| 20 | **Evaluer un monorepo tooling** (Nx, Turborepo) | L | Moyen | Build/test incrementaux, dependency graph |
| 21 | **Supprimer la table proof_of_broadcasts** (feature supprimee v3.0) | S | Faible | Nettoyage DB |

---

## 10. Annexes

### A. Metriques detaillees du codebase

| Metrique | Valeur |
|----------|--------|
| Fichiers TypeScript/JavaScript | ~538 |
| Fichiers de test | ~63 |
| Fichiers Markdown | 136 |
| Migrations SQL | 29 |
| Services systemd | 7+ |
| Scripts Bash | ~30 |
| Endpoints API REST | 80+ |
| Commandes sync-agent | 30+ |
| Dependances npm (central-server) | 56 runtime, 27 dev |
| Taille CLAUDE.md | 239 KB |
| Version actuelle | 3.7.15 |

### B. Matrice de couverture fonctionnelle

| Fonctionnalite | Backend | Dashboard | Pi | Tests | Documentation |
|----------------|---------|-----------|-----|-------|---------------|
| Auth (JWT + MFA) | OK | OK | N/A | OK | OK |
| Gestion sites | OK | OK | N/A | Partiel | OK |
| Deploy video | OK | OK | OK | Partiel | OK |
| Config drafts | OK | OK | OK | OK | OK |
| Abonnements | OK | OK | OK | Faible | OK |
| Cloud Remote | OK | OK | N/A | Faible | OK |
| Analytics | OK | Supprime UI | OK (envoi) | Faible | OK |
| Alertes predictives | OK | OK | N/A | Faible | OK |
| Benchmark | OK | OK | N/A | Faible | OK |
| Watermark | OK | OK | OK | OK | OK |
| Network resilience | OK | OK (badges) | OK (5 services) | Faible | OK |
| License/blocking | OK | OK | OK | Faible | OK |
| Double-buffer TV | N/A | N/A | OK | Aucun | Excellent |

### C. Carte des dependances inter-composants

```
CLAUDE.md (239KB)
    └── Reference pour : Central Server, Dashboard, Pi, DB, API, Patterns

Central Server
    ├── PostgreSQL (Supabase) [persistence]
    ├── FTP Hostinger [stockage video]
    ├── Supabase Storage [stockage fallback]
    ├── Redis Upstash [Socket.IO adapter, optionnel]
    ├── SMTP [emails]
    ├── Logtail [logs centralises]
    └── Socket.IO Hub ──► Pi (x50+)

Central Dashboard
    ├── Central Server [HTTP REST]
    ├── Socket.IO [temps reel, optionnel]
    └── Leaflet / Chart.js [cartographie, graphiques]

Raspberry Pi
    ├── Central Server [Socket.IO + HTTP]
    ├── FTP/Supabase [download video]
    ├── HDMI-CEC [detection TV]
    ├── wlan0 [hotspot]
    ├── wlan1/eth0 [internet]
    ├── ffprobe [duree video]
    ├── cec-client [etat TV]
    └── systemd [orchestration services]
```

---

**Fin du document**

*Revue realisee par analyse croisee du codebase (exploration exhaustive) et de la documentation (CLAUDE.md + docs/). Aucune supposition non justifiee par le code source ou la documentation.*
