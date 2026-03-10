# Rapport de Valorisation - Application Neopro

## Objet

Estimation de la valeur de l'application Neopro en vue d'un **apport en nature** dans le cadre de la constitution d'une SAS, conformement aux articles L227-1 et D.227-3 du Code de Commerce.

**Date du rapport** : 4 mars 2026
**Application** : Neopro - Plateforme SaaS d'affichage interactif et broadcasting pour clubs sportifs
**Methode** : Audit technique + Estimation par le cout de reproduction + Methode des comparables

> **Note de transparence** : Ce logiciel a ete co-developpe par un developpeur senior et l'outil d'IA generative Claude Code (Anthropic). Ce rapport en tient compte dans l'estimation du cout de reproduction. Voir section 3.6 pour l'analyse d'impact detaillee.

---

## 1. Synthese Executive

| Indicateur                    | Valeur                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Produit**                   | Plateforme SaaS d'affichage interactif pour clubs sportifs                      |
| **Architecture**              | 3-tiers : Dashboard Cloud (Angular 20) + API (Express/PG) + Edge (Raspberry Pi) |
| **Differenciation technique** | Edge computing offline-first, dual-display HDMI, gestion de flotte OTA          |
| **Sites en production**       | 4-5 clubs sportifs                                                              |
| **Stade**                     | Early production (produit operationnel, traction initiale)                      |
| **Tests automatises**         | 3 259 (Jest, Karma, Playwright, smoke)                                          |
| **Debut du developpement**    | Decembre 2025                                                                   |
| **Duree de developpement**    | ~3 mois intensifs                                                               |
| **Mode de developpement**     | Dev senior + IA generative (Claude Code)                                        |
| **Commits git**               | 1 829                                                                           |

---

## 2. Audit Technique Detaille

### 2.1 Architecture Globale

```
+-------------------+         +--------------------+         +-------------------+
|   Dashboard       |  --API->|  Central Server    |  --WS-->|  Raspberry Pi     |
|   (Angular 20)    |         |  (Express/PG)      |         |  dans le club     |
+-------------------+         +--------------------+         +-------------------+
     Admin SaaS                    Cloud (Railway)                Edge Device
     40+ composants                50+ services                   Sync-Agent
     Hostinger                     PostgreSQL (Supabase)          TV App Angular
                                   FTP (Hostinger)                Admin local
                                   Prometheus/Grafana             Shell scripts
```

**Points differenciants de l'architecture** :

- **Edge Computing** : logique embarquee sur Raspberry Pi (offline-first, sync asynchrone)
- **Multi-display** : gestion dual-HDMI avec variants video par ecran (TV + LED/panneau)
- **Real-time** : Socket.IO bidirectionnel Cloud <-> Pi avec file d'attente offline
- **Multi-tenant** : 6 roles utilisateurs avec RLS PostgreSQL

### 2.2 Perimetre Fonctionnel par Tier

| Tier                             | Role                  | Fonctionnalites cles                                                                                |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| **Central Server** (API backend) | Cloud, business logic | Auth MFA, multi-tenant 6 roles, deploiement video, analytics, portails sponsors, alerting predictif |
| **Central Dashboard** (Angular)  | Administration SaaS   | Gestion flotte, editeur config, deploiement, monitoring, portails annonceurs/agences                |
| **Raspberry Pi** (Edge)          | Boitier dans le club  | Sync offline-first, playback dual-display, telecommande, watchdog, hotspot WiFi                     |
| **DevOps**                       | Infrastructure        | CI/CD GitHub Actions, Prometheus/Grafana, migrations SQL, scripts maintenance                       |

> **Volume de code** (indicatif, non determinant pour la valorisation) : ~223k lignes source, ~55k lignes de tests, repartis sur 812 fichiers. Le detail par langage est en Annexe B.

### 2.3 Indicateurs de Qualite du Code (criteres objectifs)

| Critere                      | Indicateur mesurable                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Typage**                   | TypeScript `strict: true`, `noImplicitAny`, `noImplicitReturns` — 0 `any` autorise (ESLint enforced) |
| **Couverture de tests**      | 3 259 tests automatises sur 4 frameworks (Jest 2 474, Karma 520, Playwright E2E, smoke 533)          |
| **Logging**                  | Winston + Logtail — 0 `console.log` dans le backend (ESLint enforced)                                |
| **Validation**               | Joi sur tous les endpoints API (validation avant traitement)                                         |
| **Architecture**             | Repository pattern — 0 acces direct a la DB dans les controllers (ESLint enforced)                   |
| **Securite**                 | JWT HttpOnly, MFA TOTP, bcrypt, rate limiting, Helmet, parametres SQL (0 injection)                  |
| **CI/CD**                    | GitHub Actions, semantic release, pre-commit hooks (husky + lint-staged)                             |
| **Monitoring**               | Prometheus + Grafana + Alertmanager, 30+ metriques custom                                            |
| **Regles de non-regression** | 47 regles "NE JAMAIS FAIRE" documentees et testees par smoke tests                                   |

> **Note** : Ces indicateurs sont factuels et verifiables dans le code source. Les regles d'architecture sont appliquees par ESLint et les smoke tests.

### 2.4 Integrations Externes

| Service        | Technologie              | Usage                            |
| -------------- | ------------------------ | -------------------------------- |
| PostgreSQL     | `pg` 8.11.3 via Supabase | Base de donnees principale       |
| FTP Hostinger  | `basic-ftp` 5.1.0        | Stockage videos/assets           |
| Socket.IO      | `socket.io` 4.7.2        | Communication temps reel         |
| Redis          | `redis` 5.10.0           | Clustering Socket.IO (optionnel) |
| SMTP           | `nodemailer` 7.0.12      | Emails transactionnels           |
| Prometheus     | `prom-client` 15.1.3     | Metriques d'observabilite        |
| Logtail        | `@logtail/node` 0.5.2    | Logging centralise               |
| Railway        | PaaS                     | Hebergement API                  |
| GitHub Actions | CI/CD                    | Integration continue             |

---

## 3. Inventaire des Modules Metier et Estimation du Cout de Reproduction

### 3.1 Methodologie

L'estimation est basee sur le **cout de reproduction a neuf** : combien couterait le developpement from scratch de chaque module par une equipe qualifiee.

Deux scenarios sont presentes :

- **Scenario A - Traditionnel** : reproduction par une equipe de developpeurs humains sans assistance IA
- **Scenario B - Realiste 2026** : reproduction par un developpeur senior assiste par IA generative (reflet des conditions actuelles du marche)

**Hypotheses Scenario A (traditionnel)** :

- Equipe de developpement senior (5+ ans d'experience)
- TJM de reference : **450EUR** (standard), **550EUR** (complexe/edge), **350EUR** (tests/docs)
- 1 jour = 7 heures productives

**Hypotheses Scenario B (avec IA)** :

- 1 developpeur senior + Claude Code / outil IA equivalent
- TJM de reference : **550EUR** (profil senior capable de piloter l'IA efficacement)
- Multiplicateur de productivite IA : variable selon le type de tache (voir 3.5)

### 3.2 Detail par Module - Scenario A (Traditionnel, sans IA)

#### A. Central Server - API Backend (57 612 lignes source + 35 988 lignes tests)

| Module                                                                                    | Complexite | Jours/H | TJM | Cout EUR    |
| ----------------------------------------------------------------------------------------- | ---------- | ------- | --- | ----------- |
| **Auth & MFA** (JWT, RBAC 6 roles, TOTP, reset password)                                  | Complexe   | 20      | 550 | 11 000      |
| **Sites Management** (CRUD, API keys SHA256, status tracking, multi-tenant)               | Moyen      | 12      | 450 | 5 400       |
| **Video Content & Deployment** (upload, checksum, variants, orchestration, retry, canary) | Complexe   | 35      | 550 | 19 250      |
| **Config & Drafts** (multi-profils, draft workflow, enrichissement pipeline 3 etapes)     | Complexe   | 25      | 550 | 13 750      |
| **Subscription & Licensing** (plans, grace period, enforcement, cache Pi)                 | Moyen      | 15      | 450 | 6 750       |
| **Analytics & Monitoring** (health dashboard, video plays, sessions, daily stats, cron)   | Complexe   | 20      | 550 | 11 000      |
| **Advertiser & Agency Portal** (dashboards, magic links, auto-resolution, network stats)  | Complexe   | 25      | 550 | 13 750      |
| **Software Updates** (versioning, rollout, canary, rollback, progress)                    | Moyen      | 15      | 450 | 6 750       |
| **Remote Control** (command queue, priority, offline queue, timeout, dispatcher)          | Moyen      | 12      | 450 | 5 400       |
| **Alerting & Predictive** (alerts multi-type, severite, predictif, circuit breaker)       | Complexe   | 18      | 550 | 9 900       |
| **Groups & Targeting** (groupes dynamiques, ciblage deploiement)                          | Simple     | 5       | 450 | 2 250       |
| **Audit & Compliance** (audit trail, entity tracking, diffs JSON)                         | Simple     | 5       | 450 | 2 250       |
| **Playlist & Scheduler** (planification, cron, timezone, historique)                      | Moyen      | 10      | 450 | 4 500       |
| **Reports & Exports** (PDF, Excel, monthly reports, email)                                | Moyen      | 12      | 450 | 5 400       |
| **Storage Service** (FTP Hostinger, streaming, retry, verification, metrics)              | Moyen      | 8       | 450 | 3 600       |
| **SAFe Portfolio** (Epic/Feature/Story, velocity, markdown sync)                          | Moyen      | 10      | 450 | 4 500       |
| **Admin & System Ops** (user mgmt, health, cache, restart)                                | Simple     | 5       | 450 | 2 250       |
| **Objectives & Benchmarks** (KPIs, fleet benchmarks)                                      | Simple     | 4       | 450 | 1 800       |
| **Socket.IO Service** (Redis adapter, heartbeat, event routing)                           | Moyen      | 8       | 550 | 4 400       |
| **Metrics Prometheus** (30+ metriques custom, HTTP/DB/FTP/business)                       | Moyen      | 8       | 550 | 4 400       |
| **DB & Infrastructure** (pool, circuit breaker, migrations, RLS)                          | Complexe   | 15      | 550 | 8 250       |
| **Middleware** (validation Joi, error handler, rate limit, CORS, auth)                    | Moyen      | 8       | 450 | 3 600       |
| **Tests Central Server** (1 941 tests Jest + 533 smoke)                                   | Tests      | 25      | 350 | 8 750       |
| **Sous-total Central Server**                                                             |            | **340** |     | **158 900** |

#### B. Central Dashboard - Angular Admin (76 202 lignes source + 6 647 lignes tests)

| Module                                                                     | Complexite | Jours/H | TJM | Cout EUR   |
| -------------------------------------------------------------------------- | ---------- | ------- | --- | ---------- |
| **Sites Feature** (liste, detail, config editor, content viewer)           | Complexe   | 20      | 450 | 9 000      |
| **Content Feature** (upload video, variants, deploiement, progress)        | Complexe   | 18      | 450 | 8 100      |
| **Analytics Feature** (graphiques, health club, tendances, Chart.js)       | Complexe   | 15      | 450 | 6 750      |
| **Advertiser/Sponsor/Agency Portals** (3 portals, dashboards, magic links) | Complexe   | 20      | 450 | 9 000      |
| **Subscriptions** (gestion licences, renouvellement, suspension)           | Moyen      | 8       | 450 | 3 600      |
| **Updates Feature** (software update mgmt, deploiement)                    | Moyen      | 8       | 450 | 3 600      |
| **Groups Feature** (groupes, batch operations)                             | Simple     | 5       | 450 | 2 250      |
| **Dashboard KPIs** (overview flotte, statuts, cartes)                      | Moyen      | 10      | 450 | 4 500      |
| **Auth Feature** (login, MFA, password reset, guards)                      | Moyen      | 8       | 450 | 3 600      |
| **Remote Feature** (telecommande preview)                                  | Moyen      | 5       | 450 | 2 250      |
| **SAFe Feature** (roadmap, sprint tracker, proposals)                      | Moyen      | 10      | 450 | 4 500      |
| **Network Analytics** (cross-site sponsor performance)                     | Moyen      | 8       | 450 | 3 600      |
| **Layout & Navigation** (sidebar, header, responsive)                      | Moyen      | 8       | 450 | 3 600      |
| **Core Services** (HTTP client, interceptors, state management)            | Moyen      | 10      | 450 | 4 500      |
| **Shared Components** (data tables, charts, modals, pipes)                 | Moyen      | 12      | 450 | 5 400      |
| **Legal** (CGU, politique confidentialite)                                 | Simple     | 2       | 350 | 700        |
| **Tests Dashboard** (520 tests Karma)                                      | Tests      | 10      | 350 | 3 500      |
| **Sous-total Dashboard**                                                   |            | **177** |     | **78 450** |

#### C. Raspberry Pi - Edge Computing (59 471 lignes source + 11 780 lignes tests)

| Module                                                                                       | Complexite | Jours/H | TJM | Cout EUR    |
| -------------------------------------------------------------------------------------------- | ---------- | ------- | --- | ----------- |
| **Sync-Agent** (connexion cloud, heartbeat, analytics, watchers, offline queue)              | Complexe   | 30      | 550 | 16 500      |
| **Command Handlers** (13 handlers : config, software, video, shell, hotspot, hostname, etc.) | Complexe   | 25      | 550 | 13 750      |
| **Network Watchdog** (monitoring wlan0/wlan1, recovery, grace period)                        | Complexe   | 15      | 550 | 8 250       |
| **TV App Angular** (playback video, double-buffer, freeze-frame, watermark)                  | Complexe   | 25      | 550 | 13 750      |
| **Remote App Angular** (telecommande, phases match, club-selector, multi-profil)             | Complexe   | 15      | 550 | 8 250       |
| **Dual Display** (master/slave coordination, variants, xrandr, preload)                      | Complexe   | 20      | 550 | 11 000      |
| **Admin Interface** (12 routes : config, network, videos, sponsors, system, etc.)            | Moyen      | 15      | 450 | 6 750       |
| **Pi Server** (Express local, Socket.IO, HDMI detection, license cache)                      | Moyen      | 10      | 450 | 4 500       |
| **Kiosk Watchdog** (Chromium fullscreen, window stacking, lxpanel, GPU recovery)             | Complexe   | 15      | 550 | 8 250       |
| **Hotspot Optimizer** (WiFi scan cache, RTL8192EU stability)                                 | Complexe   | 8       | 550 | 4 400       |
| **Network Scripts** (safe operations, detector, diagnostics)                                 | Moyen      | 8       | 450 | 3 600       |
| **Video Processing** (encoding, compression, thumbnails, secondary variants)                 | Moyen      | 8       | 450 | 3 600       |
| **License Enforcement** (cache 7j, banner, block screen, suppression)                        | Moyen      | 5       | 450 | 2 250       |
| **Backup & Recovery** (local backup, golden config, sync guardian)                           | Moyen      | 5       | 450 | 2 250       |
| **Tests Pi** (71 tests Socket + 194 tests Admin + specs)                                     | Tests      | 10      | 350 | 3 500       |
| **Sous-total Raspberry Pi**                                                                  |            | **234** |     | **110 600** |

#### D. DevOps, Infrastructure & Documentation

| Module                                                                     | Complexite | Jours/H | TJM | Cout EUR   |
| -------------------------------------------------------------------------- | ---------- | ------- | --- | ---------- |
| **CI/CD GitHub Actions** (5 workflows, parallel testing, semantic release) | Moyen      | 8       | 450 | 3 600      |
| **Docker Compose** (Prometheus + Alertmanager + Grafana)                   | Moyen      | 5       | 450 | 2 250      |
| **Grafana Dashboards** (provisioning, alerting rules)                      | Moyen      | 5       | 450 | 2 250      |
| **Database Migrations** (66 fichiers SQL, schema complet)                  | Moyen      | 10      | 450 | 4 500      |
| **Scripts Shell** (47 scripts, deploy, install, maintenance)               | Moyen      | 15      | 450 | 6 750      |
| **ESLint & Pre-commit** (husky, lint-staged, rules custom)                 | Simple     | 3       | 350 | 1 050      |
| **Documentation technique** (CLAUDE.md, ADR, guides, REFERENCE.md)         | Moyen      | 10      | 350 | 3 500      |
| **E2E Tests Playwright** (multi-navigateur)                                | Moyen      | 8       | 350 | 2 800      |
| **Sous-total DevOps**                                                      |            | **64**  |     | **26 700** |

### 3.3 Recapitulatif Scenario A (Traditionnel, sans IA)

| Composant                   | Jours/Homme | Cout EUR    |
| --------------------------- | ----------- | ----------- |
| Central Server (API)        | 340         | 158 900     |
| Central Dashboard (Angular) | 177         | 78 450      |
| Raspberry Pi (Edge)         | 234         | 110 600     |
| DevOps & Infrastructure     | 64          | 26 700      |
| **TOTAL**                   | **815**     | **374 650** |

Avec ajustement +20% (conception, integration, knowledge accumule) : **449 580 EUR**

### 3.4 Fourchette Scenario A

| Scenario             | Coefficient | Valeur          |
| -------------------- | ----------- | --------------- |
| **Fourchette basse** | x0.60       | **269 748 EUR** |
| **Valeur centrale**  | x0.75       | **337 185 EUR** |
| **Fourchette haute** | x0.90       | **404 622 EUR** |

---

### 3.5 Scenario B - Cout de Reproduction Realiste 2026 (avec IA)

#### Contexte

L'application a ete co-developpee par un developpeur senior et l'outil d'IA generative Claude Code (Anthropic). En 2026, les outils de developpement assiste par IA sont largement accessibles, et un commissaire aux apports evaluant le cout de reproduction doit prendre en compte les **conditions actuelles du marche**.

Plusieurs etudes sur la productivite des outils d'IA generative de code (dont Ziegler et al., 2022 — "Productivity Assessment of Neural Code Completion", GitHub / Microsoft Research) rapportent des gains significatifs sur les taches de developpement standard, avec des amplitudes variables selon les metriques et le protocole (completion rate, task time, perceived productivity). En revanche, pour le debug hardware, l'integration terrain et les problemes edge, le gain est sensiblement inferieur.

**Hypotheses retenues** — deux blocs de productivite :

| Bloc                                | Composants                        | Gain IA | Justification                                                                                                  |
| ----------------------------------- | --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| **Software (cloud + dashboard)**    | Central Server, Dashboard Angular | +50%    | Dev standard (CRUD, API, UI) — hypothese haute, coherente avec la litterature sur les outils de completion IA  |
| **Edge / hardware / debug terrain** | Raspberry Pi, DevOps & Infra      | +25%    | Debug WiFi RTL8192EU, GPU V3D, xrandr dual-display, kiosk Chromium — l'IA aide peu sur les problemes materiels |

#### Estimation avec IA

**Bloc 1 — Software (cloud + dashboard) : +50%**

| Composant                   | Jours trad. | Avec IA (+50%) | TJM | Cout EUR  |
| --------------------------- | ----------- | -------------- | --- | --------- |
| Central Server (API)        | 340         | 227            | 550 | 124 850   |
| Central Dashboard (Angular) | 177         | 118            | 550 | 64 900    |
| _Sous-total Software_       | _517_       | _345_          |     | _189 750_ |

**Bloc 2 — Edge / hardware / debug terrain : +25%**

| Composant               | Jours trad. | Avec IA (+25%) | TJM | Cout EUR  |
| ----------------------- | ----------- | -------------- | --- | --------- |
| Raspberry Pi (Edge)     | 234         | 187            | 550 | 102 850   |
| DevOps & Infrastructure | 64          | 51             | 550 | 28 050    |
| _Sous-total Edge_       | _298_       | _238_          |     | _130 900_ |

| **TOTAL avec IA** | **815** | **583** | | **320 650** |

> **Note** : Le TJM unique de 550 EUR reflete le profil senior capable de piloter efficacement l'IA pour du code production-grade. C'est un profil plus rare et plus cher qu'un dev classique.

#### Decotes et ajustements

| Facteur                        | Coefficient | Justification                                    |
| ------------------------------ | ----------- | ------------------------------------------------ |
| Decote early stage (4-5 sites) | -25%        | Traction initiale limitee, pas de flotte etablie |
| Decote marche niche            | -10%        | Clubs sportifs amateurs/semi-pros, TAM restreint |
| **Valeur ajustee**             | **x0.65**   |                                                  |

|                       | Valeur          |
| --------------------- | --------------- |
| Cout brut avec IA     | 320 650 EUR     |
| Apres decotes (x0.65) | **208 423 EUR** |

#### Fourchette Scenario B

| Scenario             | Coefficient | Valeur          |
| -------------------- | ----------- | --------------- |
| **Fourchette basse** | x0.55       | **176 358 EUR** |
| **Valeur centrale**  | x0.65       | **208 423 EUR** |
| **Fourchette haute** | x0.75       | **240 488 EUR** |

### 3.6 Note sur le Co-developpement avec IA

Le developpement assiste par IA reduit le temps de production mais **ne change pas la valeur fonctionnelle** du logiciel : il rend le meme service qu'il ait ete code a la main ou avec IA.

Ce que l'IA ne peut pas reproduire dans ce projet :

- Le **savoir-faire hardware** : debug WiFi RTL8192EU, GPU V3D Pi 5, dual-display xrandr — acquis par des semaines de tests terrain
- Les **decisions d'architecture** : 3-tiers, edge offline-first, sync asynchrone — decisions humaines
- La **validation terrain** : 4-5 sites operationnels en clubs reels
- Le **knowledge capitalise** : 47 regles "NE JAMAIS FAIRE" issues de l'experience production

Source productivite IA : Bird, C. et al. (2023). "Productivity Assessment of Neural Code Completion", GitHub / Microsoft Research. https://github.blog/research/developer-productivity/

---

## 4. Marche Cible et Barrieres a l'Entree

### 4.1 Marche Adressable

| Segment                                        | Volume estime                   | Source                                                           | Fiabilite       |
| ---------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- | --------------- |
| Clubs sportifs amateurs en France              | ~180 000 associations sportives | CNOSF, 22 fev. 2024                                              | Donnee publique |
| Dont clubs avec local/salle equipe TV          | ~30 000 - 50 000                | **Hypothese interne** (gymnases, salles, clubhouses)             | A affiner       |
| Clubs semi-pros / amateurs de niveau regional+ | ~5 000 - 10 000                 | **Hypothese interne** basee sur les federations (FFF, LNR, FFHB) | A affiner       |
| Marche europeen (equivalent)                   | x5 a x10 du marche francais     | **Hypothese interne** (structure sportive comparable)            | A valider       |

**TAM France realiste** (hypothese interne — clubs equipes TV avec budget communication) : ~10 000 clubs
**Revenu potentiel** a 200 EUR/mois/club : **24M EUR ARR** sur le TAM France

> **Analyse de sensibilite** : Si le TAM reel est de 5 000 clubs (hypothese basse), l'ARR potentiel serait de 12M EUR. Si 15 000 clubs (hypothese haute), 36M EUR. Dans tous les cas, le marche depasse largement le seuil de viabilite pour un SaaS vertical.

Le marche de l'affichage dynamique DOOH (Digital Out-Of-Home) global est estime a **20,74 milliards USD** en 2024, en croissance (Grand View Research, Digital Out-Of-Home Market Size Report, 2024). La niche sportive amateur est un segment non adresse par les acteurs majeurs.

### 4.2 Barrieres a l'Entree (Moat Technique)

La vraie valeur de Neopro reside dans la **complexite de l'integration hardware + logiciel** :

| Barriere                         | Difficulte de reproduction | Detail                                                                                                                                     |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Edge computing offline-first** | Elevee                     | Architecture de sync asynchrone avec file d'attente offline, reconnexion automatique, resolution de conflits — rare dans le SaaS classique |
| **Dual-display HDMI**            | Elevee                     | Coordination master/slave, variants video par ecran, preload synchronise, gestion xrandr — pas de librairie standard                       |
| **WiFi embarque (RTL8192EU)**    | Tres elevee                | Hotspot + client simultane sur dongle USB, stabilite carrier, cache scan inter-processus — 47 regles de non-regression issues du terrain   |
| **Kiosk Chromium Pi**            | Elevee                     | Fullscreen multi-ecran, window stacking, GPU V3D recovery, watchdog — specifique au hardware Pi                                            |
| **OTA fleet management**         | Moyenne                    | Deploiement canary, rollback, progress tracking — complexe mais documentable                                                               |
| **Telecommande temps reel**      | Moyenne                    | Socket.IO local, phases de match, multi-profil, club-selector                                                                              |

> **Un concurrent voulant reproduire Neopro devrait resoudre les memes problemes hardware** — meme avec IA, le debug RTL8192EU, xrandr dual-display et GPU V3D necessite des semaines de tests sur materiel reel.

### 4.3 Solutions Comparables sur le Marche

| Solution           | Segment                | Valorisation / Levee  | Comparabilite avec Neopro                                  |
| ------------------ | ---------------------- | --------------------- | ---------------------------------------------------------- |
| **Yodeck** (Grece) | Digital signage simple | Levee 3.5M USD        | Fonctionnellement proche mais sans edge computing ni sport |
| **OptiSigns**      | Digital signage        | Levee 3M USD          | SaaS cloud-only, pas de Pi, pas de sport                   |
| **ScreenCloud**    | Digital signage PME    | Levee 10M USD Serie A | Plus mature, pas verticalise sport                         |
| **Rise Vision**    | Education/Sport        | Communautaire         | Open-source, pas de hardware integre                       |
| **Broadsign**      | DOOH enterprise        | Rachete ~150M USD     | Incomparable (enterprise, millions d'ecrans)               |

> **Limites des comparables** : ces entreprises operent a des stades de maturite tres differents (millions d'ecrans, equipes de 20-100 personnes). La comparaison directe est fragile — elle sert principalement a situer un ordre de grandeur.

### 4.4 Estimation par Comparables

| Methode                                    | Base                         | Calcul                                                     | Valeur                   |
| ------------------------------------------ | ---------------------------- | ---------------------------------------------------------- | ------------------------ |
| **Multiple ARR** (SaaS early stage x5-x10) | 12 000 EUR ARR (4-5 sites)   | 12k x 5 a 12k x 10                                         | **60 000 - 120 000 EUR** |
| **Ratio fonctionnel** vs Yodeck pre-seed   | Yodeck levee 3.5M a maturite | Neopro = ~5% de la couverture marche _(hypothese interne)_ | **80 000 - 150 000 EUR** |

> **L'ARR actuel est tres faible** (12k EUR). La valeur repose sur la technologie et le potentiel, pas sur le revenu. C'est normal a ce stade (early production).

### 4.5 Fourchette de Valorisation (Methode Comparables)

| Scenario             | Valeur      |
| -------------------- | ----------- |
| **Fourchette basse** | 60 000 EUR  |
| **Valeur centrale**  | 100 000 EUR |
| **Fourchette haute** | 150 000 EUR |

---

## 5. Synthese de Valorisation

### 5.1 Tableau Recapitulatif

| Methode                               | Fourchette basse | Valeur centrale | Fourchette haute |
| ------------------------------------- | ---------------- | --------------- | ---------------- |
| **Cout reprod. traditionnel (Sc. A)** | 269 748 EUR      | 337 185 EUR     | 404 622 EUR      |
| **Cout reprod. avec IA (Sc. B)**      | 176 358 EUR      | 208 423 EUR     | 240 488 EUR      |
| **Comparables marche**                | 60 000 EUR       | 100 000 EUR     | 150 000 EUR      |

### 5.2 Methode de Valorisation Retenue

Pour un apport en nature en 2026, le commissaire aux apports regardera principalement :

1. **Le cout de reproduction realiste (Scenario B)** — ce qu'il couterait concretement a un tiers de reproduire l'equivalent avec les outils actuels (IA incluse)
2. **Les comparables et la traction** — pour ancrer la valeur dans la realite economique (ARR, sites, stade)
3. **Les barrieres a l'entree** — ce qui rend la reproduction plus difficile que la theorie

La **valeur economique** (comparables, ARR 12k EUR) tire vers le bas (60k-150k EUR).
Le **cout de reproduction** tire vers le haut (176k-240k EUR).

La valeur retenue doit refuser la surestimation tout en reconnaissant que le produit est fonctionnel et deploye.

### 5.3 Valorisation Recommandee pour l'Apport en Nature

|                              | Valeur                |
| ---------------------------- | --------------------- |
| **Valorisation recommandee** | **130 000 EUR**       |
| Fourchette acceptable        | 100 000 - 150 000 EUR |

### 5.4 Justification de la Valeur Retenue

La valorisation de **130 000 EUR** est justifiee par :

1. **Produit fonctionnel en production** : 4-5 sites operationnels en clubs sportifs. Ce n'est pas un prototype mais un produit deployable et deploye, avec une base utilisateur reelle.

2. **Qualite technique verifiable** : TypeScript strict, 3 259 tests automatises, architecture repository pattern, monitoring Prometheus, CI/CD. Faible dette technique = actif durable.

3. **Barrieres a l'entree significatives** : L'integration hardware (Raspberry Pi dual-HDMI, WiFi RTL8192EU, GPU V3D, kiosk Chromium) cree une complexite non triviale. Les 47 regles de non-regression issues du terrain representent un savoir-faire acquis par l'experience production — meme avec IA, un concurrent devrait redcouvrir ces problemes.

4. **Positionnement prudent** : La valeur retenue de 130k EUR se situe volontairement sous le plancher du cout de reproduction avec IA decote (176k EUR fourchette basse) afin de refleter le risque de marche et le stade early production. Elle reste dans la fourchette haute des comparables (100k-150k EUR).

5. **Transparence sur le mode de developpement** : Le co-developpement avec IA est explicitement pris en compte (Scenario B, source : Ziegler et al., 2022). La valeur retenue est inferieure au cout de reproduction brut.

6. **Prudence early stage** : Avec seulement 4-5 sites et un ARR de ~12k EUR, la traction est reelle mais limitee. La valorisation reflete ce stade precoce.

### 5.5 Considerations pour le Commissaire aux Apports

- **Seuil de nomination** : La designation d'un commissaire aux apports est obligatoire sauf decision unanime des associes lorsque (i) la valeur de chaque apport en nature n'excede pas 30 000 EUR et (ii) l'ensemble des apports en nature ne represente pas plus de la moitie du capital social (art. L227-1 C. Com. + D.227-3 decret 2017-630 ; synthese : Bpifrance Creation)
- **Ce que le commissaire analyse** : En pratique, le commissaire evalue notamment (i) la valeur economique (revenus, traction), (ii) la transferabilite et la propriete des droits, et (iii) le cout et le risque de reproduction (source : cadre general Infogreffe / greffe du tribunal de commerce)
- **Methode privilegiee** : Le cout de reproduction (Scenario B) comme reference, croise avec les comparables
- **Point de vigilance IA** : Ce rapport presente les deux scenarios (avec/sans IA) pour permettre au commissaire de choisir selon sa doctrine
- **Decote prudentielle probable** : Le commissaire appliquera typiquement une decote de 10-20%, situant la valeur entre **105 000 et 130 000 EUR**
- **Documentation a fournir** : Acces au depot Git (1 829 commits), metriques de tests, acces de demonstration, et ce rapport

### 5.6 Synthese Visuelle

```
Cout reproduction traditionnel (Sc. A)
|-----[270k]=============[337k]=============[405k]-----|

Cout reproduction avec IA (Sc. B)
|------[176k]========[208k]========[240k]------|

Comparables marche (ARR, stade)
|--[60k]======[100k]======[150k]--|

                  Valeur recommandee
                        |
                   [130 000 EUR]
                   |============|
                 [100k]      [150k]
               fourchette acceptable
```

---

## Annexes

### A. Statistiques du Projet

| Metrique                   | Valeur                                 |
| -------------------------- | -------------------------------------- |
| Premier commit             | 3 decembre 2025                        |
| Commits totaux             | 1 829                                  |
| Tests automatises          | 3 259                                  |
| Migrations SQL             | 66                                     |
| Scripts shell              | 47                                     |
| Sites en production        | 4-5                                    |
| Dependencies de production | 22+ (central-server)                   |
| Mode de developpement      | Dev senior + Claude Code (IA)          |
| Volume de code (indicatif) | ~223k lignes source, ~55k lignes tests |

### B. Repartition par Langage

| Langage             | Fichiers | Lignes  |
| ------------------- | -------- | ------- |
| TypeScript (source) | 330      | 139 661 |
| TypeScript (tests)  | 112      | 46 910  |
| JavaScript (source) | 120      | 34 294  |
| JavaScript (tests)  | 25       | 8 406   |
| SCSS/CSS            | 24       | 15 739  |
| Shell (bash)        | 47       | 17 152  |
| HTML                | 15       | 6 165   |
| SQL                 | 66       | 8 683   |
| Python              | 2        | 1 282   |
| Config (JSON/YAML)  | 71       | 16 367  |

### C. TJM de Reference

**Scenario A (traditionnel)** :

| Profil                                     | TJM applique | Justification                                                               |
| ------------------------------------------ | ------------ | --------------------------------------------------------------------------- |
| Dev senior fullstack (5+ ans)              | 450 EUR      | Mediane marche freelance Paris 2025-2026 pour profil Node.js/Angular senior |
| Dev senior specialise (edge/IoT/real-time) | 550 EUR      | Expertise rare : edge computing, hardware Pi, protocoles temps reel         |
| Dev junior/documentation/tests             | 350 EUR      | Tests unitaires, documentation technique, E2E                               |

**Scenario B (avec IA)** :

| Profil                                  | TJM applique | Justification                                                                  |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| Dev senior + IA (profil "10x engineer") | 550 EUR      | Profil rare capable de piloter efficacement l'IA pour du code production-grade |

Sources TJM : Malt, Comet, Creme de la Creme - barometres freelance 2025-2026.

### D. Liste des Modules Metier Evalues

**Central Server (19 modules)** : Auth/MFA, Sites, Video/Deployment, Config/Drafts, Subscription/License, Analytics, Advertiser/Agency/Sponsor Portals, Software Updates, Remote Control, Alerting/Predictive, Groups, Audit, Scheduler, Reports, Storage, SAFe, Admin, Objectives, Middleware/Infra

**Dashboard (17 features)** : Sites, Content, Analytics, Advertisers, Sponsor/Advertiser/Agency Portals, Subscriptions, Updates, Groups, Dashboard KPIs, Auth, Remote, SAFe, Network Analytics, Layout, Core/Shared, Legal

**Raspberry Pi (15 modules)** : Sync-Agent, Command Handlers (13), Network Watchdog, TV App, Remote App, Dual Display, Admin Interface, Pi Server, Kiosk Watchdog, Hotspot Optimizer, Network Scripts, Video Processing, License Enforcement, Backup/Recovery

**DevOps (8 composants)** : CI/CD, Docker, Grafana, Migrations, Scripts, ESLint, Documentation, E2E

### E. Note sur la Propriete Intellectuelle et l'IA

Le co-developpement avec Claude Code (Anthropic) s'inscrit dans le cadre contractuel suivant :

- **Conditions applicables** : Les conditions d'utilisation d'Anthropic (Consumer Terms of Service / Commercial Terms, consultables sur anthropic.com/policies) prevoient que les outputs generes par l'outil sont cessibles a l'utilisateur, sous reserve des conditions du contrat applicable
- **Nature de la contribution humaine** : Le developpeur humain est a l'origine des specifications fonctionnelles, des choix d'architecture, de la validation et des decisions de conception. L'IA a ete utilisee comme outil d'assistance a la production de code
- **Originalite** : Le code integre des choix techniques specifiques au projet (architecture 3-tiers, edge computing Pi, protocoles real-time) qui constituent une creation intellectuelle propre
- **Qualification juridique** : En l'etat actuel du droit francais, la qualification de l'apport de l'IA dans la creation logicielle n'est pas definitivement tranchee. Le present rapport retient l'hypothese prudente que l'IA constitue un outil de production, l'auteur intellectuel restant le developpeur humain

> **Recommandation** : Il est conseille a l'apporteur de conserver une copie des conditions contractuelles applicables au moment du developpement (version en vigueur dec. 2025 - mars 2026) et de les joindre au dossier d'apport.

---

### F. Sources et References

| Ref  | Source                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [1]  | Code de Commerce, art. L227-1 + D.227-3 — Apport en nature SAS, derogation commissaire. https://www.legifrance.gouv.fr                        |
| [2]  | IFRS IAS 38 — Actifs incorporels. https://www.ifrs.org/issued-standards/list-of-standards/ias-38-intangible-assets/                           |
| [3]  | Damodaran, A. (2020). Investment Valuation. NYU Stern.                                                                                        |
| [4]  | Ziegler, A. et al. (2022). "Productivity Assessment of Neural Code Completion". GitHub / Microsoft Research. https://arxiv.org/abs/2205.06537 |
| [5]  | OpenView Partners (2024). SaaS Benchmarks. https://openviewpartners.com                                                                       |
| [6]  | Grand View Research (2024). Digital Out-Of-Home (DOOH) Market Size Report.                                                                    |
| [7]  | Malt, Comet, Creme de la Creme — Barometres freelance 2025-2026 (TJM references).                                                             |
| [8]  | CNOSF (22 fev. 2024). Nombre d'associations sportives en France. https://cnosf.franceolympique.com                                            |
| [9]  | Bpifrance Creation. Apports en nature dans une SAS. https://bpifrance-creation.fr                                                             |
| [10] | Infogreffe. Commissaire aux apports — role et designation. https://www.infogreffe.fr                                                          |

---

_Ce rapport a ete produit sur la base d'une analyse automatisee du code source et de l'architecture du projet. Il constitue une base de travail pour le commissaire aux apports et ne se substitue pas a l'evaluation officielle requise par la loi._
