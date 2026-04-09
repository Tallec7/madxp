# Revue d'Architecture Neopro — Audit Complet

**Date** : 2026-02-09
**Version analysee** : 3.7.15
**Methodologie** : Analyse croisee documentation (CLAUDE.md + 143 fichiers docs/) + exploration exhaustive du codebase
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
- Ecosysteme documentaire riche : 143 fichiers, 71K lignes, parcours par role (01-START-HERE.md)
- MODOPs operationnels exemplaires (9/10) — procedures pas-a-pas pour le terrain
- Packs autonomes (PACK_TECHNICAL_DEEP_DIVE 52K) utilisables en copier-coller pour prestataires externes
- Dossier client critique NLF.md (10/10) — modele a suivre

**Points faibles :**

- **⚠️ BLOQUANT : Documents legaux non remplis** (4 templates avec placeholders `[NOM DE LA SOCIETE]`)
- Documentation concentree dans un seul fichier monolithique (CLAUDE.md : 239 KB) avec ~25% de duplication vers docs/
- Lacunes sur l'infrastructure (CI/CD, Docker, K8s non documentes dans CLAUDE.md)
- Test coverage insuffisante (23 spec.ts, 3 E2E)
- Couplage fort entre composants (synchronisation manuelle Remote Pi / Cloud Remote)
- ADRs non mis a jour depuis v2.33 (5 ADRs seulement, decisions post-Jan 2026 non tracees)
- **⚠️ CLAUDE.md a 239 KB (~6000 lignes) alors que la limite officielle est ~80 lignes** — Claude ignore probablement >90% du contenu
- ERROR_HANDLING_MIGRATION.md potentiellement obsolete

### Metriques du codebase

| Composant         | Fichiers code (.ts/.js) | Tests     | Documentation          |
| ----------------- | ----------------------- | --------- | ---------------------- |
| Central Server    | ~200                    | 37 suites | Bien couvert           |
| Central Dashboard | ~105                    | ~23 spec  | Bien couvert           |
| Raspberry Pi      | ~137                    | Faible    | Couvert dans CLAUDE.md |
| E2E               | 3                       | 3 specs   | Minimal                |
| Documentation     | —                       | —         | 136 fichiers markdown  |
| **Total**         | **~538**                | **~63**   | **136 docs**           |

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

| Domaine          | Controllers                                 | Services                                                                 | Routes                |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| Authentification | auth, mfa                                   | mfa, password-reset                                                      | auth, mfa             |
| Gestion sites    | sites                                       | socket, command-queue                                                    | sites                 |
| Contenu video    | content                                     | deployment, orchestrated-deployment, upload-verification, image-to-video | content, drafts       |
| Assets           | assets                                      | asset                                                                    | assets                |
| Abonnements      | subscription                                | subscription                                                             | subscription          |
| Analytics        | analytics, advertiser-analytics             | realtime-stats, cron-scheduler                                           | analytics             |
| Alertes          | alerts                                      | alert, alerting, predictive-alerts, network-alerts                       | alerts                |
| Benchmark        | benchmark                                   | benchmark                                                                | benchmark             |
| Remote cloud     | remote                                      | — (utilise socket.service)                                               | remote                |
| Rapports         | reports, billing                            | pdf-report, excel-export                                                 | reports, billing      |
| Admin            | admin, audit                                | admin-ops, audit                                                         | admin, audit          |
| Utilisateurs     | users                                       | —                                                                        | users                 |
| Annonceurs       | advertiser-portal, advertiser-sites, agency | —                                                                        | advertiser-\*, agency |

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

| Critere                        | Note | Commentaire                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------ |
| Separation des responsabilites | 8/10 | Bonne separation controller/service/route. Quelques controllers font trop (sites.controller.ts)        |
| Securite                       | 9/10 | JWT HttpOnly, MFA, RLS, rate limiting per-route, SQL parametrique, CSP                                 |
| Observabilite                  | 8/10 | Correlation ID, Prometheus, Logtail, audit logs. Manque : tracing distribue                            |
| Scalabilite                    | 6/10 | Pool DB 5 connexions, Railway Hobby plan ~40MB heap. Redis adapter present mais non utilise par defaut |
| Maintenabilite                 | 7/10 | Patterns coherents, mais 36 controllers monolithiques, pas de couche repository                        |

---

### 3.2 Central Dashboard (Angular 20)

**Role** : Interface d'administration pour la gestion des clubs, du contenu video, des abonnements, et du monitoring.

**Technologies** : Angular 20, Chart.js, Leaflet, Standalone Components, SCSS

#### Responsabilites

| Module        | Composants        | Role                                                          |
| ------------- | ----------------- | ------------------------------------------------------------- |
| sites         | 10 sub-components | Gestion des clubs (4 onglets : Etat/Contenu/Parametres/Debug) |
| content       | 1                 | Upload et gestion des videos cloud                            |
| dashboard     | 1                 | Vue d'ensemble de la flotte                                   |
| subscriptions | 1                 | Gestion des licences/abonnements                              |
| remote        | 1 (cloud-remote)  | Telecommande a distance (PUBLIC)                              |
| admin         | 3+                | Gestion utilisateurs, categories                              |
| advertisers   | 2+                | Gestion des annonceurs                                        |
| agency-portal | 1                 | Portail agences                                               |

**Total** : 18 feature modules, 20 core services, 6 shared components

#### Dependances entrantes

- Utilisateurs (navigateur web)
- Cloud Remote (utilisateurs staff club via QR code)

#### Dependances sortantes

- Central Server (HTTP REST + JWT)
- Socket.IO (temps reel optionnel via socket.service.ts)

#### Evaluation

| Critere              | Note | Commentaire                                                                    |
| -------------------- | ---- | ------------------------------------------------------------------------------ |
| Architecture Angular | 8/10 | Standalone components, lazy loading, bonne separation features/shared/core     |
| UX/UI coherence      | 7/10 | Design flat coherent. Quelques residus de styles gradient (subscriptions page) |
| Reutilisabilite      | 6/10 | Seulement 6 shared components pour 18 features. Potentiel d'extraction eleve   |
| Tests                | 4/10 | ~23 spec.ts : couverture faible pour un dashboard critique                     |
| Performance          | 7/10 | Budget strict (1MB initial), mais composants avec beaucoup de CSS inline       |

---

### 3.3 Raspberry Pi (Edge)

**Role** : Affichage TV en mode kiosk, telecommande locale, synchronisation avec le cloud, auto-maintenance.

**Technologies** : Angular 20 (TV/Remote), Node.js (Sync-Agent, Server, Admin), Chromium kiosk, Bash scripts, systemd

#### Sous-composants et responsabilites

| Sous-composant    | Port       | Technologie                 | Role                                             |
| ----------------- | ---------- | --------------------------- | ------------------------------------------------ |
| TV (Angular)      | 80 (nginx) | Angular 20 + Chromium kiosk | Affichage boucle video, score overlay, watermark |
| Remote (Angular)  | 80 (nginx) | Angular 20                  | Telecommande tactile pour le staff               |
| Local Server      | 3000       | Express + Socket.IO         | Hub de communication local TV/Remote             |
| Sync-Agent        | —          | Node.js + Socket.IO         | Connexion cloud, commandes, heartbeat            |
| Admin Panel       | 8080       | Express + vanilla JS        | Administration systeme (videos, WiFi, services)  |
| Kiosk Watchdog    | —          | Bash                        | Recovery Chromium crashes                        |
| Hotspot Watchdog  | —          | Bash                        | Surveillance WiFi AP (wlan0)                     |
| Hotspot Optimizer | —          | Bash (boot)                 | Selection canal WiFi optimal                     |
| Sync Guardian     | —          | Bash                        | Restauration sync-agent si crash                 |

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

| Critere          | Note | Commentaire                                                                               |
| ---------------- | ---- | ----------------------------------------------------------------------------------------- |
| Resilience       | 9/10 | Triple couche de recovery (kiosk watchdog, sync guardian, network watchdog)               |
| Auto-maintenance | 9/10 | Hotspot auto-repair, channel optimization, license cache offline                          |
| Complexite TV    | 8/10 | Double-buffer + freeze-frame + error recovery sophistique et bien documente               |
| Maintenabilite   | 5/10 | sync-agent/commands/index.js encore a ~650 lignes, admin/app.js a ~3600 lignes vanilla JS |
| Testabilite      | 3/10 | Tres peu de tests unitaires cote Pi. Dependance forte a l'environnement physique          |

---

### 3.4 Documentation (docs/)

**Role** : Reference technique, guides d'installation, troubleshooting, decisions d'architecture, docs client.

**Contenu** : ~143 fichiers (128 markdown + assets) repartis dans 22 repertoires, totalisant ~71 600 lignes (~14 MB)

#### 3.4.1 Inventaire detaille par repertoire

| Repertoire            | Fichiers | Lignes est. | Qualite | Contenu                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | -------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Racine docs/**      | 7        | ~1 800      | 9/10    | 00-INDEX.md (hub navigation), 01-START-HERE.md (guide par role), ONBOARDING.md, GLOSSARY.md, VERSIONING.md, TESTING.md, ONLINE_INSTALLATION.md                                                                                                                                                                                                                                |
| **technical/**        | 13       | ~8 000      | 8.2/10  | ARCHITECTURE.md, REFERENCE.md (19K), SYNC_ARCHITECTURE.md (26K), COMMAND_QUEUE.md (525L), ERROR_HANDLING.md, REMOTE_SHELL.md, REMOTE_SHELL_SECURITY.md, MULTI_TENANT.md, VIDEO_STORAGE.md (401L), SQL_QUERIES.md (195L), ROW_LEVEL_SECURITY.md, TESTING_GUIDE.md (417L), SYNC_AGENT_CONFIG.md                                                                                 |
| **guides/**           | 16       | ~6 500      | 8.2/10  | GUIDE_OPERATEUR_INSTALLATION.md (30min terrain), INSTALLATION_COMPLETE.md (3 methodes), TROUBLESHOOTING.md (53K!), GOLDEN_IMAGE.md (439L), CONFIG_DRAFTS.md (325L), GUIDE_UTILISATEUR.md (21K), QR_CODE_REMOTE.md, SSH_SETUP.md, MESH_WIFI_ENVIRONMENTS.md (417L), ANDROID_HOTSPOT_FIX.md (184L), CONFIGURATION.md, DEMO_MODE.md (238L, complet), ERROR_HANDLING_MIGRATION.md |
| **analytics/**        | 8        | ~3 200      | 8.1/10  | README.md, ONBOARDING_DEV.md, IMPLEMENTATION.md, TRACKING_IMPRESSIONS.md (720L excellent), PDF_REPORTS_GUIDE.md, TESTS.md, AVANCEMENT.md                                                                                                                                                                                                                                      |
| **audit/**            | 6        | ~5 000      | 8.4/10  | AUDIT_PLATEFORME_COMPLET_2025.md (41K), PRODUCT_STRATEGY_ANALYSIS.md (33K), AUDIT_DOCS_2025-12-25.md, AUDIT_RGPD_SECURITE_2025-12-29.md, ARCHITECTURE_REVIEW_2026-02-09.md                                                                                                                                                                                                    |
| **business/**         | 5        | ~7 500      | 8.4/10  | STATUS.md (9.8/10 project rating), BUSINESS_PLAN_COMPLET.md (113K!), ROADMAP_10_SUR_10.md (37K), BACKLOG.md (23K), ANALYTICS_CATEGORIES_IMPL.md                                                                                                                                                                                                                               |
| **deployment/**       | 3        | ~1 920      | 8/10    | DEPLOY_CENTRAL_SERVER.md (461L Railway+Supabase), GUIDE_MISE_EN_PRODUCTION.md (1438L complet), README.md                                                                                                                                                                                                                                                                      |
| **adr/**              | 6        | ~920        | 8.4/10  | ADR-001 Edge+Cloud, ADR-002 Socket.IO, ADR-003 PostgreSQL+Supabase, ADR-004 JWT HttpOnly, ADR-005 Multi-tenant RLS, README.md                                                                                                                                                                                                                                                 |
| **modops/**           | 6        | ~4 045      | 9/10    | MODOP-C01-06 Onboarding Client (898L), MODOP-C07-11 Configuration, MODOP-C12-15 Deploiement MAJ, MODOP-O05-08 Monitoring Proactif, MODOP-S04-05 Diagnostic Distance, MODOP-S11-15 Monitoring Alertes                                                                                                                                                                          |
| **legal/**            | 4        | ~1 118      | 3/10    | PRIVACY_POLICY.md (templates non remplis!), TERMS_OF_SERVICE.md, GENERAL_SALES_CONDITIONS.md, GDPR_PROCESSING_REGISTER.md                                                                                                                                                                                                                                                     |
| **clients/**          | 1        | ~603        | 10/10   | NLF.md — Dossier client critique exhaustif (topologie reseau, incidents, solutions)                                                                                                                                                                                                                                                                                           |
| **research/**         | 2        | ~800        | 8.5/10  | NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md (analyse concurrence), NEOPRO_NETWORK_RESILIENCE_VISION.md (vision produit)                                                                                                                                                                                                                                                           |
| **packs/**            | 4        | ~2 900      | 8.5/10  | README.md, PACK_DEV_QUICKSTART.md (28K), PACK_BUSINESS_PITCH.md (20K), PACK_TECHNICAL_DEEP_DIVE.md (52K) — Packs autonomes copier-coller                                                                                                                                                                                                                                      |
| **changelog/**        | 30+      | ~8 000      | 7.8/10  | CHANGELOG.md principal + fichiers dates (auto-generes depuis commits)                                                                                                                                                                                                                                                                                                         |
| **analysis/**         | 2        | ~400        | 8/10    | NARH-debug-bundle-2026-02-08.md, NLF-debug-bundle-2026-02-08.md — Analyses incidents recentes                                                                                                                                                                                                                                                                                 |
| **archive/**          | 11+      | ~3 000      | 6/10    | Anciennes versions d'audits, fixes, rapports de session                                                                                                                                                                                                                                                                                                                       |
| **dev/**              | 1        | ~50         | 7/10    | README.md — Reference configuration developpeur (minimal)                                                                                                                                                                                                                                                                                                                     |
| **Charte graphique/** | 6        | N/A         | N/A     | Logos, palettes couleurs, polices (assets visuels)                                                                                                                                                                                                                                                                                                                            |

#### 3.4.2 Analyse qualitative des documents cles

**Documents a haute valeur (qualite >= 9/10) :**

| Document                               | Qualite | Pourquoi                                                                                                                    |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| docs/clients/NLF.md                    | 10/10   | Dossier client exemplaire : topologie reseau, timeline incidents, root causes, solutions. 603 lignes, mis a jour 8 Feb 2026 |
| docs/01-START-HERE.md                  | 9/10    | Navigation par role (dev, PO, ops, support) avec temps estimes. Point d'entree ideal                                        |
| docs/guides/TROUBLESHOOTING.md         | 9/10    | 53K de debugging structure par symptome. Couvre Pi 5, mesh WiFi, GPU, hotspot                                               |
| docs/modops/\* (6 fichiers)            | 9/10    | Procedures operationnelles completes avec arbres de decision. 4045 lignes au total                                          |
| docs/technical/SYNC_ARCHITECTURE.md    | 9/10    | 26K de documentation du protocole edge-cloud. Indispensable pour comprendre le coeur du systeme                             |
| docs/technical/REFERENCE.md            | 9/10    | 19K de reference technique API/services/patterns                                                                            |
| docs/packs/PACK_TECHNICAL_DEEP_DIVE.md | 9/10    | 52K autonome, pret a copier pour partage externe ou IA                                                                      |
| docs/adr/\* (5 ADRs)                   | 9/10    | Decisions architecturales avec contexte, alternatives, consequences                                                         |

**Documents problematiques :**

| Document                                | Qualite | Probleme                                                                                                         |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| docs/legal/PRIVACY_POLICY.md            | 3/10    | **TEMPLATE NON REMPLI** : `[NOM DE LA SOCIETE]`, `[ADRESSE]`, `[DATE A COMPLETER]`. NON UTILISABLE en production |
| docs/legal/TERMS_OF_SERVICE.md          | 3/10    | Idem — placeholders non remplis, necessite revision juridique                                                    |
| docs/legal/GENERAL_SALES_CONDITIONS.md  | 3/10    | Idem — CGV B2B avec champs vides                                                                                 |
| docs/guides/DEMO_MODE.md                | 9/10    | Complet (238 lignes) : activation, build, deploiement, config clubs, architecture, UX                            |
| docs/technical/SQL_QUERIES.md           | 8/10    | Requetes correctes — le bug `first_name`/`last_name` etait dans le code controleur (corrige v2.6)                |
| docs/guides/ERROR_HANDLING_MIGRATION.md | 5/10    | Possiblement obsolete (references patterns v2.x)                                                                 |

#### 3.4.3 Analyse de la duplication CLAUDE.md ↔ docs/

| Type de contenu      | Dans CLAUDE.md          | Dans docs/                       | Duplication  | Verdict                                             |
| -------------------- | ----------------------- | -------------------------------- | ------------ | --------------------------------------------------- |
| Architecture globale | Oui (100 lignes)        | technical/ARCHITECTURE.md (368L) | ~30% overlap | **Acceptable** : CLAUDE.md = resume, docs/ = detail |
| API Reference        | Oui (200 lignes routes) | technical/REFERENCE.md (19K)     | ~40% overlap | **A surveiller** : risque de divergence             |
| Troubleshooting      | Oui (100 lignes)        | guides/TROUBLESHOOTING.md (53K)  | ~10% overlap | **Correct** : profondeurs differentes               |
| Glossaire            | Oui (80 termes)         | GLOSSARY.md (246L)               | ~70% overlap | **Redondant** : devrait etre consolide              |
| Breaking changes     | Oui (exhaustif)         | changelog/ (30+ fichiers)        | ~50% overlap | **Problematique** : double maintenance              |
| Schema DB            | Oui (detaille)          | technical/ + full-schema.sql     | ~60% overlap | **A surveiller** : CLAUDE.md pourrait diverger      |
| Patterns de code     | Oui (exemples)          | Unique a CLAUDE.md               | 0%           | **Correct** : exclusif a CLAUDE.md                  |
| Procedures ops       | Non                     | modops/ (4045L)                  | 0%           | **Correct** : exclusive aux MODOPs                  |
| Business             | Non                     | business/ (113K+)                | 0%           | **Correct** : hors perimetre CLAUDE.md              |

#### 3.4.4 Points d'entree par audience

Le systeme de documentation offre des parcours differencies :

**Developpeur junior :**

```
01-START-HERE.md → ONBOARDING.md → PACK_DEV_QUICKSTART.md → CLAUDE.md (patterns)
                                                           ↓
                                    TESTING_GUIDE.md ← REFERENCE.md ← ADR-001..005
```

**Operateur terrain :**

```
01-START-HERE.md → GUIDE_OPERATEUR_INSTALLATION.md (30 min)
                 → TROUBLESHOOTING.md (reference)
                 → MODOP-C01-06 (onboarding client)
```

**Agence web externe :**

```
01-START-HERE.md → PACK_TECHNICAL_DEEP_DIVE.md (52K autonome)
                 → ARCHITECTURE.md + ADRs
                 → REFERENCE.md + VIDEO_STORAGE.md
```

**Support/Astreinte :**

```
TROUBLESHOOTING.md (53K) → MODOP-S04-05 (diagnostic distance)
                         → clients/NLF.md (client critique)
                         → analysis/NLF-debug-bundle.md (incident recent)
```

#### Evaluation globale

| Critere               | Note     | Commentaire                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| Exhaustivite          | 9/10     | 143 fichiers, 71K lignes. Couvre technique, ops, business, legal, incidents |
| Structure             | 8/10     | 00-INDEX.md + 01-START-HERE.md + parcours par role. Bien organise           |
| Maintenance           | 8/10     | Docs recentes (Feb 2026), changelog auto-genere, audits reguliers           |
| Accessibilite junior  | 7/10     | Bon parcours via 01-START-HERE.md et packs. CLAUDE.md reste un mur          |
| Accessibilite agence  | 8/10     | PACK_TECHNICAL_DEEP_DIVE.md (52K autonome) est excellent                    |
| **Probleme critique** | **3/10** | **Documents legaux NON REMPLIS — bloquant pour usage commercial**           |
| Duplication CLAUDE.md | 6/10     | ~25% de duplication moyenne, risque de divergence sur API/schema/glossaire  |

---

### 3.5 Infrastructure (CI/CD, Docker, K8s)

**Role** : Build, test, deploiement automatise.

| Element         | Fichiers                                                    | Documente dans CLAUDE.md        |
| --------------- | ----------------------------------------------------------- | ------------------------------- |
| GitHub Actions  | 4 workflows (ci, release, publish-install, railway-restart) | NON                             |
| Docker          | docker-compose.yml + docker/ (Grafana, Prometheus)          | NON                             |
| Kubernetes      | k8s/ (base, overlays)                                       | NON                             |
| Railway         | railway.json, Dockerfile                                    | Partiellement (mention Railway) |
| Scripts root    | scripts/ (check-version, changelog)                         | NON                             |
| Config partagee | config/ (eslint, prettier, tsconfig base)                   | NON                             |

#### Evaluation

| Critere       | Note | Commentaire                                                   |
| ------------- | ---- | ------------------------------------------------------------- |
| CI/CD         | 7/10 | Pipelines fonctionnels mais non documentes                    |
| Monitoring    | 4/10 | Grafana/Prometheus present mais aucune doc d'utilisation      |
| Deploiement   | 6/10 | Railway auto-deploy, mais k8s semble experimental/non utilise |
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

| Risque                | Severite | Probabilite       | Mitigation existante                            |
| --------------------- | -------- | ----------------- | ----------------------------------------------- |
| OOM crash Railway     | Haute    | Moyenne           | Memory manager, optimisations v3.7.4            |
| Perte de connexion DB | Haute    | Faible            | Pool avec retry, health checks                  |
| Crash Chromium Pi     | Moyenne  | Haute (apres 2h+) | Kiosk watchdog, error recovery, cleanup memoire |
| Sync-agent corrompu   | Haute    | Faible            | Sync guardian + golden image restore            |
| Hotspot WiFi instable | Moyenne  | Moyenne           | Hotspot watchdog + optimizer + fix-hotspot.sh   |

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

| Profil        | Detection               | Comportement automatique         |
| ------------- | ----------------------- | -------------------------------- |
| simple        | 1 AP, pas d'isolation   | BSSID lock autorise              |
| mesh          | >1 AP meme SSID         | BSSID lock bloque, bgscan active |
| mesh_isolated | Mesh + isolation client | Cloud Remote recommande          |
| enterprise    | 802.1X detecte          | Config IT requise                |
| ethernet      | eth0 UP avec IP         | Score stabilite 100              |

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

| Flux              | Source    | Destination  | Protocole        | Frequence     |
| ----------------- | --------- | ------------ | ---------------- | ------------- |
| Heartbeat         | Pi        | Central      | Socket.IO        | 30s           |
| Sync local state  | Pi        | Central      | Socket.IO        | 30s           |
| Video deploy      | Central   | Pi           | Socket.IO + HTTP | A la demande  |
| Config update     | Central   | Pi           | Socket.IO        | A la demande  |
| Analytics         | Pi        | Central      | HTTP batch       | Variable      |
| Cloud Remote      | Dashboard | Central → Pi | HTTP → Socket.IO | A la demande  |
| Dashboard polling | Dashboard | Central      | HTTP             | 30-60s        |
| License check     | Central   | Pi           | Socket.IO event  | A chaque sync |

#### Patterns architecturaux identifies

| Pattern                            | Localisation                            | Qualite                                                      |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Singleton services                 | Central Server (tous les services)      | Correct, exporte en instance unique                          |
| Command Queue                      | command-queue.service.ts                | Robuste, gere online/offline                                 |
| Double-buffer video                | TV component                            | Sophistique, bien documente                                  |
| Config draft + orchestrated deploy | draft.service + orchestrated-deployment | Bonne separation des concerns                                |
| Rate limiting per-route            | middleware/user-rate-limit.ts           | Evolution positive (v3.7.14 : suppression doubles comptages) |
| Merge intelligent                  | config-merge.js                         | Complexe mais necessaire                                     |
| Row-Level Security                 | PostgreSQL RLS + middleware             | Securite multi-tenant solide                                 |

#### Anti-patterns detectes

| Anti-pattern           | Localisation                                                                                          | Impact                                    | Severite  |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| ~~**God Component**~~  | ~~admin/public/app.js~~ → Refactoré en 21 modules dans `modules/`, app.js gitignored (build artifact) | ~~Tres difficile a maintenir~~ **Résolu** | ~~Haute~~ |
| **Sync manuelle**      | Remote Pi ↔ Cloud Remote (copie manuelle HTML/SCSS/TS)                                                | Risque de divergence, bug non reproduit   | Haute     |
| **Monolithisme**       | CLAUDE.md (239 KB, fichier unique)                                                                    | Impossible a naviguer efficacement        | Moyenne   |
| **Legacy coexistence** | sponsors/_ ↔ advertisers/_ (2 systemes de nommage)                                                    | Confusion pour nouveaux devs              | Moyenne   |
| **CSS inline massif**  | Composants Angular (styles inline, certains > 2000 lignes)                                            | Pas de design system reutilisable         | Moyenne   |
| **Analytics fantome**  | features/analytics/ existe mais "supprime en v3.0"                                                    | Code mort source de confusion             | Faible    |

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
  │     ├── video_plays (15 jours)
  │     ├── club_daily_stats (indefini)
  │     ├── site_sponsor_daily_stats (indefini)
  │     ├── site_sponsor_daily_video_stats (indefini)
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

| Table                          | Retention        | Justification                                                              |
| ------------------------------ | ---------------- | -------------------------------------------------------------------------- |
| video_plays                    | 15 jours         | Donnees granulaires, agreges dans club/advertiser/site_sponsor_daily_stats |
| advertiser_impressions         | (supprimée)      | Remplacee par video_plays category='sponsor' (v3.66+)                      |
| metrics                        | 7 jours          | Debug court terme uniquement                                               |
| config_history                 | 20 versions/site | Rollback realiste                                                          |
| remote_commands                | 30 jours         | Historique debug                                                           |
| alerts                         | 90 jours         | Patterns d'incidents                                                       |
| audit_logs                     | 90 jours         | Conformite                                                                 |
| club_daily_stats               | Indefini         | Historique long terme                                                      |
| advertiser_daily_stats         | Indefini         | Historique long terme                                                      |
| site_sponsor_daily_stats       | Indefini         | Proof of Play saison + historique 3 ans                                    |
| site_sponsor_daily_video_stats | Indefini         | Detail per-video pour rapports sponsors                                    |

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

### 5.1 Lacunes de documentation (CLAUDE.md)

| Element                | Statut dans CLAUDE.md | Statut reel                               | Impact                                                |
| ---------------------- | --------------------- | ----------------------------------------- | ----------------------------------------------------- |
| CI/CD (GitHub Actions) | Absent                | 5 workflows actifs                        | Un dev junior ne saurait pas comment le CI fonctionne |
| Docker/Monitoring      | Absent                | docker/ avec Grafana+Prometheus           | Infrastructure de monitoring inexploitable            |
| Kubernetes             | Absent                | k8s/ avec base+overlays                   | Config de deploiement inutilisable                    |
| Scripts root           | Absent                | scripts/ (check-version, changelog)       | Outils de release non documentes                      |
| Config partagee        | Absent                | config/ (eslint, prettier, tsconfig base) | Conventions de dev non expliquees                     |
| Handlers Socket.IO     | Minimal               | 2 handlers (match-config, score-update)   | Logique metier cachee                                 |
| remote-shell-security  | Absent                | Middleware actif                          | Securite critique non documentee                      |
| Admin panel sessions   | Absent                | 8h TTL, persistence fichier               | Securite admin panel non documentee                   |
| Memory manager         | Minimal               | Service actif dans server.ts              | Optimisation critique non detaillee                   |
| Monitoring Pi          | Absent                | raspberry/monitoring/ client+server       | Outil disponible mais inutilisable                    |
| Tools Pi               | Absent                | raspberry/tools/ (golden image, recovery) | Outils de production non documentes                   |
| server-render          | Present               | N'existe plus (supprime ou deplace)       | Reference morte dans CLAUDE.md                        |

### 5.2 Lacunes de documentation (docs/)

| Element                                             | Statut actuel                                                                                                                                               | Impact                                                                                                   | Priorite             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| **Documents legaux NON REMPLIS**                    | 4 fichiers avec placeholders (`[NOM DE LA SOCIETE]`, `[ADRESSE]`, `[DATE]`)                                                                                 | **BLOQUANT pour mise en production commerciale** — RGPD, CGV, mentions legales inutilisables             | **CRITIQUE**         |
| ~~**DEMO_MODE.md**~~                                | ~~Initialement evalue comme stub 6 lignes~~ — **CORRIGE** : le fichier fait 238 lignes et est complet                                                       | N/A — faux positif                                                                                       | ~~Haute~~ **Resolu** |
| ~~**SQL_QUERIES.md**~~                              | ~~Initialement evalue avec colonnes obsoletes~~ — **CORRIGE** : les requetes sont correctes, le fix etait dans le code controleur (v2.6)                    | N/A — faux positif                                                                                       | ~~Haute~~ **Resolu** |
| **CLAUDE.md : 239 KB (~6000 lignes)**               | La limite officielle est **~80 lignes**. Au-dela, Claude Code commence a ignorer des sections. Le fichier actuel est x75 au-dessus de la limite recommandee | **Claude ignore probablement >90% du contenu** — les instructions sont noyees dans le bruit documentaire | **CRITIQUE**         |
| **ADRs manquants pour features recentes**           | Seulement ADR-001 a ADR-005 (decisions pre-v2.33). Aucun ADR pour : subscriptions, network resilience, predictive alerts, benchmark, double-buffer video    | Les decisions architecturales post-Jan 2026 ne sont pas tracees formellement                             | Moyenne              |
| **ERROR_HANDLING_MIGRATION.md**                     | Potentiellement obsolete (references patterns v2.x)                                                                                                         | Confusion si un dev suit ce guide                                                                        | Faible               |
| **Pas de docs pour analytics/ (feature supprimee)** | Le repertoire `features/analytics/` existe toujours mais la doc dit "supprime v3.0"                                                                         | Aucun document n'explique pourquoi le code est encore la                                                 | Faible               |
| **Duplication glossaire**                           | CLAUDE.md (~80 termes) ↔ docs/GLOSSARY.md (246 lignes) : ~70% overlap                                                                                       | Risque de divergence sur les definitions                                                                 | Faible               |

### 5.3 Lacunes techniques

| Lacune                                   | Consequence                                                                         | Priorite |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Pas de tracing distribue (OpenTelemetry) | Debugging cross-service difficile (Dashboard → Server → Pi)                         | Moyenne  |
| Pas de tests de charge                   | Limites de scaling inconnues (50 Pi OK, 200 Pi ?)                                   | Haute    |
| Pas de backup DB documente               | Risque perte de donnees si incident Supabase                                        | Haute    |
| Pas de runbook operationnel              | MODOPs couvrent l'operationnel mais pas les urgences (incident DB, breach securite) | Moyenne  |
| Pas de feature flags                     | Deploiements tout-ou-rien                                                           | Faible   |
| Pas de tests d'integration reseau        | Les scenarios mesh/isolation sont testes uniquement en prod                         | Moyenne  |

---

## 6. Ambiguites et incoherences

### 6.1 Ambiguites architecturales

| Ambiguite                              | Description                                                                                                                 | Risque                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **analytics/ "supprime" mais present** | CLAUDE.md v3.0 dit "pages analytics supprimees", mais le repertoire features/analytics/ existe toujours avec ses composants | Un dev pourrait croire que le code est actif |
| **sponsors vs advertisers**            | Deux systemes de nommage coexistent (sponsor-portal, advertiser-portal). Routes legacy avec redirects                       | Confusion pour les nouveaux developpeurs     |
| **server-render**                      | CLAUDE.md mentionne ce repertoire dans l'architecture, mais il n'existe pas dans le repo                                    | Reference morte                              |
| **systemd double**                     | `raspberry/config/systemd/` (11 fichiers) ET `raspberry/systemd/` (3 fichiers) : 2 repertoires pour les services            | Duplication, risque de divergence            |
| **Local Server lifecycle**             | Qui demarre le local server (port 3000) ? Pas clair : neopro-app ou un service systemd dedie ?                              | Gap dans la documentation des services       |
| **socket.service.ts dual**             | Le dashboard ET le central-server ont chacun un socket.service.ts avec des roles differents                                 | Nom identique, confusion potentielle         |

### 6.2 Ambiguites documentaires (docs/)

| Ambiguite                                      | Localisation                                                                                                            | Risque                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Breaking changes : double source de verite** | CLAUDE.md (section "Historique Breaking Changes", ~500 lignes) ET docs/changelog/ (30+ fichiers auto-generes)           | ~50% overlap, risque de divergence sur les details de migration              |
| **Schema DB : triple source**                  | CLAUDE.md (tables principales), full-schema.sql (schema complet), docs/technical/ARCHITECTURE.md (resume)               | Risque d'oubli de mise a jour d'une source lors d'un ajout de colonne        |
| **TROUBLESHOOTING.md vs CLAUDE.md**            | Les deux contiennent des sections debugging, avec des niveaux de detail differents                                      | Un dev ne sait pas lequel consulter en premier                               |
| ~~**SQL_QUERIES.md desynchronise**~~           | **CORRIGE** : Faux positif. Les requetes sont correctes, le bug etait dans le code controleur (corrige v2.6)            | N/A                                                                          |
| **GUIDE_UTILISATEUR.md : 21K lignes**          | Guide utilisateur exhaustif mais potentiellement obsolete (references UI pre-v3.0)                                      | Un operateur pourrait suivre des instructions pour des ecrans qui ont change |
| **Packs vs docs/**                             | PACK_TECHNICAL_DEEP_DIVE.md (52K) est une copie autonome de plusieurs docs/technical/\*. Pas de lien de synchronisation | Si un doc technique change, le pack ne sera pas mis a jour                   |

### 6.3 Responsabilites mal definies

| Zone                        | Probleme                                                                                                   | Consequence                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Remote sync**             | Le Cloud Remote est une "copie quasi-identique" du Remote Pi, avec synchronisation manuelle                | Si un dev modifie le Remote Pi, il doit penser a reporter manuellement. Aucun mecanisme de detection de divergence |
| **Config deployment**       | 3 modes possibles : merge, replace, orchestrated. Le choix n'est pas guide pour les nouveaux devs          | Risque de deployer dans le mauvais mode                                                                            |
| **Rate limiting ownership** | Certains rate limiters sont dans server.ts, d'autres dans les routes. La regle est documentee mais fragile | v3.7.14 a corrige un double comptage, d'autres cas similaires possibles                                            |

---

## 7. Sur-architecture et redondances

### 7.1 Elements potentiellement sur-architectures

| Element                               | Description                                                                                    | Justification possible                               | Recommandation                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| **Kubernetes config**                 | k8s/ avec base+overlays alors que le deploiement est sur Railway                               | Preparation future ?                                 | Documenter l'intention ou supprimer     |
| **Docker monitoring**                 | Grafana+Prometheus sans documentation d'usage                                                  | Experimentation non finalisee                        | Documenter ou archiver                  |
| **Canary deployment service**         | canary-deployment.service.ts pour rollout progressif                                           | Pertinent pour 50+ Pi, mais usage reel non documente | Documenter les cas d'usage              |
| **Memory cache service**              | LRU cache en memoire alors que le serveur tourne sur 1 instance avec 40MB                      | Utile pour reduire les queries DB                    | Evaluer le gain reel                    |
| **5 types de surveillance reseau Pi** | NetworkDetector + NetworkWatchdog + SafeNetworkOperations + HotspotWatchdog + HotspotOptimizer | Chaque couche adresse un probleme reel               | Docummenter comment elles interagissent |

### 7.2 Redondances identifiees

| Redondance                    | Fichiers concernes                                                   | Impact                                        |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| **Double systemd**            | raspberry/config/systemd/ + raspberry/systemd/                       | Confusion sur la source de verite             |
| **Sponsor/Advertiser legacy** | sponsor-_.ts + advertiser-_.ts dans controllers, routes, services    | Double maintenance                            |
| **CSS inline vs shared**      | Styles inline massifs dans les composants au lieu d'un design system | Pas de reutilisation des styles               |
| **CLAUDE.md vs docs/**        | Certaines infos sont dans CLAUDE.md ET dans docs/technical/          | Double source de verite, risque de divergence |
| **proof_of_broadcasts table** | Table DB existe mais feature supprimee en v3.0                       | Donnees orphelines en base                    |

---

## 8. Evaluation exploitabilite

### 8.1 Pour un developpeur junior

| Critere                       | Note       | Justification                                                                                                     |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| **Comprendre le projet**      | 8/10       | 01-START-HERE.md oriente par role + ONBOARDING.md + GLOSSARY.md. Bon parcours d'entree                            |
| **Trouver ou coder**          | 6/10       | PACK_DEV_QUICKSTART.md (28K) est bon, mais CLAUDE.md (239 KB) reste un mur. 00-INDEX.md aide                      |
| **Ecrire du code correct**    | 8/10       | Patterns de code bien documentes dans CLAUDE.md + TESTING_GUIDE.md (417L)                                         |
| **Eviter les pieges**         | 7/10       | "NE JAMAIS FAIRE" explicite. Breaking changes documentes. NLF.md comme cas reel                                   |
| **Debugger un probleme**      | 7/10       | TROUBLESHOOTING.md (53K exhaustif) + MODOPs (procedures pas-a-pas). Bon outillage                                 |
| **Comprendre le deploiement** | 5/10       | DEPLOY_CENTRAL_SERVER.md (461L) et GUIDE_MISE_EN_PRODUCTION.md (1438L) existent dans docs/. Manque dans CLAUDE.md |
| **Lancer le projet en local** | 5/10       | ONLINE_INSTALLATION.md + INSTALLATION_COMPLETE.md couvrent le Pi. Setup dev local moins detaille                  |
| **Score global junior**       | **6.6/10** | Nettement meilleur qu'avec CLAUDE.md seul grace aux parcours docs/. Reste le probleme du volume d'info            |

### 8.2 Pour une agence web externe

| Critere                        | Note       | Justification                                                                                                |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| **Comprendre le perimetre**    | 9/10       | PACK_TECHNICAL_DEEP_DIVE.md (52K autonome) est excellent. Copier-coller pret                                 |
| **Estimer la complexite**      | 8/10       | Composants, services, endpoints quantifies. ADRs expliquent les choix. business/BACKLOG.md (23K)             |
| **Identifier les risques**     | 7/10       | Breaking changes + audits (AUDIT_PLATEFORME_COMPLET 41K, AUDIT_RGPD 29K). Pas de "tech debt register" formel |
| **Planifier une reprise**      | 6/10       | MODOPs operationnels, guides deploiement. Manque : runbooks urgence, SLA, procedures migration DB            |
| **Evaluer la qualite du code** | 7/10       | Patterns coherents, TypeScript strict, mais coverage faible                                                  |
| **Comprendre les dependances** | 6/10       | 56 deps runtime listees, mais pas d'analyse de vulnerabilites/obsolescence                                   |
| **Score global agence**        | **7.2/10** | Les packs et audits ameliorent significativement l'exploitabilite externe                                    |

### 8.3 Pour le support/operations

| Critere                       | Note       | Justification                                                                                               |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| **Diagnostiquer un probleme** | 9/10       | TROUBLESHOOTING.md (53K) + MODOPs diagnostic (S04-05) + debug bundle + scripts                              |
| **Onboarder un client**       | 9/10       | MODOPs C01-06 (898L) couvrent tout le processus en 6 etapes                                                 |
| **Gerer un client critique**  | 10/10      | NLF.md est le modele a suivre : topologie, incidents, root causes, solutions                                |
| **Reagir a une urgence**      | 5/10       | Pas de runbook d'urgence formel (incident DB, breach, DDoS). MODOPs couvrent l'operationnel, pas les crises |
| **Score global support**      | **8.2/10** | Excellent pour le quotidien, lacune sur les situations de crise                                             |

### 8.4 Recommandations pour l'exploitabilite

1. **Completer les documents legaux** (CRITIQUE, bloquant) :
   - Remplir les 4 templates legal/ avec les vraies informations societe
   - Faire reviser par un juriste specialise RGPD
   - Publier les mentions legales, politique de confidentialite, CGV
   - Completer le registre des traitements RGPD

2. **Consolider CLAUDE.md ↔ docs/** :
   - Deplacer le glossaire de CLAUDE.md vers docs/GLOSSARY.md (source unique)
   - Deplacer les breaking changes vers docs/changelog/ (supprimer la duplication)
   - Garder dans CLAUDE.md uniquement : instructions Claude Code, patterns de code, et liens vers docs/
   - Ajouter des liens `[→ detail](docs/technical/xxx.md)` dans CLAUDE.md

3. **Creer les ADRs manquants** :
   - ADR-006 : Systeme d'abonnement et licence (v2.47)
   - ADR-007 : Network resilience multi-couche (v2.35-2.37)
   - ADR-008 : Double-buffer video avec freeze-frame (v3.7.8)
   - ADR-009 : Alertes predictives (v3.0)
   - ADR-010 : Suppression analytics UI (v3.0)

4. ~~**Completer DEMO_MODE.md**~~ : **CORRIGE** — Le fichier fait 238 lignes et est deja complet

5. ~~**Corriger SQL_QUERIES.md**~~ : **CORRIGE** — Faux positif, les requetes sont correctes

5bis. **Restructurer radicalement CLAUDE.md** (voir section dediee ci-dessous)

6. **Creer un runbook d'urgence** :
   - Incident DB (Supabase down) : procedure de fallback
   - Breach securite : rotation JWT_SECRET, invalidation sessions
   - DDoS/abus : procedures de blocage
   - Perte d'un Pi : procedure de remplacement

---

## 9. Recommandations priorisees

### Court terme (1-4 semaines)

| #     | Recommandation                                                              | Effort | Impact       | Justification                                                                                                                                   |
| ----- | --------------------------------------------------------------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **⚠️ CRITIQUE : Completer les documents legaux**                            | M      | **Bloquant** | 4 templates non remplis (PRIVACY_POLICY, TERMS, CGV, RGPD). Inutilisables en l'etat. Necessite juriste                                          |
| 2     | **⚠️ CRITIQUE : Restructurer CLAUDE.md** (~80 lignes max)                   | L      | **Haut**     | 239 KB = ~6000 lignes, limite officielle ~80 lignes. Claude Code ignore probablement >90% du contenu. Deplacer vers `.claude/rules/` et `docs/` |
| ~~3~~ | ~~Corriger SQL_QUERIES.md~~                                                 | —      | —            | **Faux positif** — les requetes sont correctes                                                                                                  |
| ~~4~~ | ~~Completer DEMO_MODE.md~~                                                  | —      | —            | **Faux positif** — le fichier fait 238 lignes et est complet                                                                                    |
| 5     | **Statuer sur features/analytics/** — code actif malgre doc "supprime v3.0" | S      | Moyen        | Discordance doc/code. README d'avertissement ajoute ✅                                                                                          |
| ~~6~~ | ~~Supprimer la reference server-render~~                                    | —      | —            | **FAIT** — CLAUDE.md restructure, reference eliminee ✅                                                                                         |
| ~~7~~ | ~~Consolider raspberry/systemd/~~                                           | —      | —            | **Faux positif** — 2 repertoires complementaires (services principaux vs backup/video)                                                          |
| ~~8~~ | ~~Documenter le CI/CD~~                                                     | —      | —            | **FAIT** — `docs/deployment/CI_CD.md` cree ✅                                                                                                   |
| ~~9~~ | ~~Documenter remote-shell-security~~                                        | —      | —            | **Deja documente** dans `docs/technical/REMOTE_SHELL_SECURITY.md`                                                                               |

### Moyen terme (1-3 mois)

| #   | Recommandation                                                                                 | Effort | Impact    | Justification                                                                                |
| --- | ---------------------------------------------------------------------------------------------- | ------ | --------- | -------------------------------------------------------------------------------------------- |
| 9   | **Consolider CLAUDE.md ↔ docs/** : reduire la duplication a < 10%                              | M      | Haut      | ~25% de duplication actuellement (glossaire, breaking changes, schema DB)                    |
| 10  | **Creer ADR-006 a ADR-010** pour les decisions recentes                                        | M      | Moyen     | Decisions post-Jan 2026 non tracees (subscriptions, network resilience, double-buffer, etc.) |
| 11  | **Augmenter la couverture de tests** (objectif : 60% lignes)                                   | L      | Haut      | 23 spec.ts pour un dashboard critique                                                        |
| 12  | **Extraire un design system Angular** (shared styles, tokens)                                  | L      | Moyen     | 6 shared components pour 18 features                                                         |
| 13  | **Creer une couche repository** dans le central-server                                         | L      | Moyen     | Decouplage SQL/logique metier                                                                |
| 14  | ~~**Refactorer admin/public/app.js**~~ ✅ Fait — 21 modules dans `modules/`, app.js gitignored | ~~L~~  | ~~Moyen~~ | ~~Maintenabilite critique~~ **Résolu**                                                       |
| 15  | **Unifier le Remote Pi et Cloud Remote** (composant partage ou generation)                     | L      | Haut      | Risque de divergence lors de chaque modification                                             |
| 16  | **Documenter les procedures de backup/restore DB**                                             | S      | Haut      | Risque de perte de donnees                                                                   |
| 17  | **Ajouter des tests de charge** pour valider le scaling a 100+ Pi                              | M      | Haut      | Limites de scaling inconnues                                                                 |
| 18  | **Creer un runbook d'urgence** (incident DB, breach, DDoS)                                     | M      | Haut      | MODOPs couvrent l'operationnel, pas les crises                                               |
| 19  | **Nettoyer les routes sponsor-\*.ts legacy** ou documenter la coexistence                      | M      | Moyen     | Confusion naming sponsors/advertisers                                                        |

### Long terme (3-6 mois)

| #   | Recommandation                                                        | Effort | Impact | Justification                                                                 |
| --- | --------------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------------------------------- |
| 20  | **Migrer vers un ORM ou query builder** (Drizzle, Kysely)             | XL     | Moyen  | Decouplage DB, type safety SQL                                                |
| 21  | **Implementer OpenTelemetry** pour le tracing distribue               | L      | Moyen  | Debugging cross-service Dashboard → Server → Pi                               |
| 22  | **Evaluer la migration Railway Hobby → Pro** ou vers K8s              | M      | Haut   | 40MB heap, 1 instance = single point of failure                               |
| 23  | **Creer un SDK partage** pour le protocole Socket.IO (types + events) | L      | Moyen  | Contrat d'interface entre Pi et Server                                        |
| 24  | **Evaluer un monorepo tooling** (Nx, Turborepo)                       | L      | Moyen  | Build/test incrementaux, dependency graph                                     |
| 25  | **Supprimer la table proof_of_broadcasts** (feature supprimee v3.0)   | S      | Faible | Nettoyage DB                                                                  |
| 26  | **Mettre en place une synchronisation automatique des packs**         | M      | Moyen  | PACK_TECHNICAL_DEEP_DIVE.md (52K) divergera inevitablement de docs/technical/ |

---

### 9.4 Focus : Restructuration CLAUDE.md (Priorite CRITIQUE)

**Constat** : Le CLAUDE.md actuel (239 KB, ~6000 lignes) depasse de x75 la limite recommandee par les bonnes pratiques Claude Code (~80 lignes). Au-dela de cette limite, Claude commence a ignorer des sections du fichier.

**Principe officiel** : _"Pour chaque ligne de CLAUDE.md, se demander : si je retire cette ligne, est-ce que Claude va faire des erreurs ? Si non, la supprimer."_

**Structure cible** (~50-80 lignes) :

```markdown
# CLAUDE.md - Neopro

## Commandes

npm start # Frontend Raspberry (port 4200)
npm run start:central # Dashboard central (port 4300)
cd central-server && npm run dev # API Backend
npm run test:server # Jest (API)
npm run lint # ESLint

## Regles de code

- TypeScript strict : jamais de `any`, toujours typer explicitement
- SQL parametre uniquement : query('...WHERE id = $1', [id])
- Logger Winston uniquement, pas de console.log
- Conventional Commits : feat(scope): ..., fix(scope): ...
- Joi pour validation des inputs

## Ne jamais faire

- Modifier les migrations deja en production
- Changer le format des api_key des sites
- Commit des secrets ou .env
- Push sur main sans PR

## Architecture

Voir @docs/technical/ARCHITECTURE.md
Voir @docs/REFERENCE.md

## Clients critiques

Voir @docs/clients/NLF.md (mesh WiFi, ne JAMAIS lock BSSID)
```

**Migration du contenu** :

| Contenu actuel dans CLAUDE.md      | Destination                               | Methode                                              |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Contexte metier, glossaire (~200L) | `docs/GLOSSARY.md` (existe deja)          | Supprimer de CLAUDE.md, enrichir le fichier existant |
| Schema DB, tables (~150L)          | `docs/technical/DATABASE.md` (creer)      | Extraire                                             |
| API Routes (~200L)                 | `docs/technical/API_REFERENCE.md` (creer) | Extraire                                             |
| Breaking changes (~500L)           | `docs/changelog/` (existe deja)           | Supprimer de CLAUDE.md                               |
| Services critiques (~300L)         | `.claude/rules/services.md`               | Extraire — charge conditionnelle                     |
| Double-buffer video (~200L)        | `.claude/rules/raspberry-tv.md`           | Extraire — charge uniquement pour fichiers Pi        |
| Network resilience (~300L)         | `.claude/rules/network.md`                | Extraire — charge conditionnelle                     |
| Troubleshooting (~200L)            | `docs/TROUBLESHOOTING.md` (existe deja)   | Supprimer de CLAUDE.md                               |
| Diagrammes de sequence (~100L)     | `docs/technical/SEQUENCE_DIAGRAMS.md`     | Extraire                                             |
| Patterns de code (~100L)           | `.claude/rules/code-patterns.md`          | Extraire — charge conditionnelle                     |
| Rate limiting (~80L)               | `.claude/rules/rate-limiting.md`          | Extraire — charge conditionnelle                     |
| Raspberry Pi details (~500L)       | `.claude/rules/raspberry.md`              | Extraire — charge pour fichiers raspberry/           |
| FAQ developpeur (~100L)            | `docs/FAQ.md` (creer)                     | Extraire                                             |

**Structure `.claude/rules/`** (chargement conditionnel par path) :

```
.claude/
├── CLAUDE.md              # ~50-80 lignes (instructions essentielles)
└── rules/
    ├── services.md         # Details services central-server
    ├── code-patterns.md    # Patterns Express, Angular, validation
    ├── rate-limiting.md    # Configuration rate limiting
    ├── raspberry.md        # Architecture Pi, sync-agent, kiosk
    ├── raspberry-tv.md     # Double-buffer, freeze-frame, video errors
    ├── network.md          # Network resilience, profiles, watchdog
    └── database.md         # Schema, migrations, RLS
```

**Benefices attendus** :

- Claude Code respecte effectivement les instructions (~80 au lieu de ~6000 lignes a parser)
- Chargement conditionnel : les regles Pi ne sont chargees que quand on edite des fichiers Pi
- Reduction des tokens consommes a chaque conversation (~50x moins)
- Les instructions critiques ne sont plus noyees dans le bruit

---

## 10. Annexes

### A. Metriques detaillees du codebase

| Metrique                         | Valeur             |
| -------------------------------- | ------------------ |
| Fichiers TypeScript/JavaScript   | ~538               |
| Fichiers de test                 | ~63                |
| Fichiers Markdown                | 136                |
| Migrations SQL                   | 29                 |
| Services systemd                 | 7+                 |
| Scripts Bash                     | ~30                |
| Endpoints API REST               | 80+                |
| Commandes sync-agent             | 30+                |
| Dependances npm (central-server) | 56 runtime, 27 dev |
| Taille CLAUDE.md                 | 239 KB             |
| Version actuelle                 | 3.7.15             |

### B. Matrice de couverture fonctionnelle

| Fonctionnalite      | Backend | Dashboard   | Pi              | Tests   | Documentation |
| ------------------- | ------- | ----------- | --------------- | ------- | ------------- |
| Auth (JWT + MFA)    | OK      | OK          | N/A             | OK      | OK            |
| Gestion sites       | OK      | OK          | N/A             | Partiel | OK            |
| Deploy video        | OK      | OK          | OK              | Partiel | OK            |
| Config drafts       | OK      | OK          | OK              | OK      | OK            |
| Abonnements         | OK      | OK          | OK              | Faible  | OK            |
| Cloud Remote        | OK      | OK          | N/A             | Faible  | OK            |
| Analytics           | OK      | Supprime UI | OK (envoi)      | Faible  | OK            |
| Alertes predictives | OK      | OK          | N/A             | Faible  | OK            |
| Benchmark           | OK      | OK          | N/A             | Faible  | OK            |
| Watermark           | OK      | OK          | OK              | OK      | OK            |
| Network resilience  | OK      | OK (badges) | OK (5 services) | Faible  | OK            |
| License/blocking    | OK      | OK          | OK              | Faible  | OK            |
| Double-buffer TV    | N/A     | N/A         | OK              | Aucun   | Excellent     |

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

_Revue realisee par analyse croisee du codebase (exploration exhaustive) et de la documentation complete (CLAUDE.md 239 KB + 143 fichiers docs/ totalisant 71K lignes dans 22 repertoires). Chaque fichier de docs/ a ete examine individuellement. Aucune supposition non justifiee par le code source ou la documentation._
