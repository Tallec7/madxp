# Analyse Stratégique Produit - MADXP

> **Date** : 26 décembre 2025
> **Auteur** : Audit Product Strategy
> **Version** : 1.3
> **Statut** : Analyse complète basée sur le code source
> **Alignement** : Business Plan v1.6 + Implémentations Dec 25-26 + Nouveaux Usages

---

## Changelog v1.3

> **MAJEUR** : Identification de 6 nouveaux usages potentiels justifiés par l'infrastructure existante

| Section | Modification                                                                  |
| ------- | ----------------------------------------------------------------------------- |
| Phase 2 | Ajout **U8-U13** : 6 nouveaux usages avec evidence code                       |
| Phase 3 | Ajout **30+ fonctionnalités complémentaires** marquées (nouvel usage)         |
| Phase 3 | Chaque usage avec **justification par l'existant** et **standards de marché** |
| Phase 3 | Distinction explicite **hypothèses** vs **données vérifiables**               |

### Nouveaux usages identifiés (v1.3)

| Usage                              | Enabler existant                            | Standard marché           |
| ---------------------------------- | ------------------------------------------- | ------------------------- |
| **U8 - Intelligence Campagnes**    | `sponsor_impressions` granulaires           | Google Ads, Facebook Ads  |
| **U9 - Engagement Spectateurs**    | WebSocket + Redis scaling                   | Twitch Polls, Slido       |
| **U10 - Contenu Contextuel**       | `event_type`, `period` metadata             | DOOH programmatique       |
| **U11 - Business Intelligence**    | `club_daily_stats` complet                  | Google Analytics, Tableau |
| **U12 - Automatisation Marketing** | `scheduler.service.ts` + `email.service.ts` | HubSpot, Mailchimp        |
| **U13 - Intégrations Partenaires** | Webhook Slack, API REST                     | Zapier, Make              |

---

## Changelog v1.2

> **MAJEUR** : Réévaluation complète des gaps suite aux implémentations du 25-26 décembre 2025

| Section  | Modification                                                      |
| -------- | ----------------------------------------------------------------- |
| Phase 0  | Ajout **capacités multi-tenant** implémentées                     |
| Phase 1  | **L3 Alerting** : email notifications FAIT, objectifs/SMS restent |
| Phase 1  | **L4 Accès sponsor** : portail lecture seule FAIT, gestion reste  |
| Phase 3  | **Refonte complète** : distinction FAIT vs VRAIMENT MANQUANT      |
| Phase 3  | Clarification **Deployment scheduler ≠ Playlist scheduler**       |
| Phase 4  | Mise à jour roadmap avec **Quick Wins déjà réalisés**             |
| Synthèse | Nouvelles priorités P0 (score overlay seul)                       |

### Implémentations détectées (25-26 déc.)

| Feature                   | Fichiers                       | Impact                  |
| ------------------------- | ------------------------------ | ----------------------- |
| Portail Sponsor (lecture) | `sponsor-portal.controller.ts` | L4 partiellement résolu |
| Portail Agence (lecture)  | `agency.controller.ts`         | Nouveau portail         |
| Notifications email       | `email.service.ts`             | L3 partiellement résolu |
| Deployment scheduling     | `scheduler.service.ts`         | ≠ Playlist scheduling   |
| Rôles sponsor/agency      | `types/index.ts`, `auth.ts`    | Multi-tenant résolu     |

---

## Changelog v1.1

| Section  | Modification                                                     |
| -------- | ---------------------------------------------------------------- |
| Phase 0  | Ajout positionnement **Two-Sided Marketplace**                   |
| Phase 1  | Nouvel usage actuel **E - Production Vidéo**                     |
| Phase 2  | Enrichissement **U1 - Réseau Annonceurs** avec modèle économique |
| Phase 2  | Détail **U3 - Fan Engagement** avec fonctionnalités BP           |
| Phase 3  | Ajout fonctionnalités **Production Vidéo**                       |
| Phase 4  | Intégration **Seuils Critiques Réseau** (15/30/100/300 clubs)    |
| Phase 4  | Alignement **Pricing** Bronze/Silver/Gold (€50/€80/€120)         |
| Synthèse | Mise à jour recommandations avec modèle annonceurs               |

---

## Table des matières

1. [Phase 0 - Compréhension de l'existant](#phase-0--compréhension-de-lexistant)
2. [Phase 1 - Usages actuels & latents](#phase-1--usages-actuels--latents)
3. [Phase 2 - Nouveaux usages potentiels](#phase-2--nouveaux-usages-potentiels)
4. [Phase 3 - Fonctionnalités nécessaires par usage](#phase-3--fonctionnalités-nécessaires-par-usage)
5. [Phase 4 - Roadmap fonctionnelle](#phase-4--roadmap-fonctionnelle)
6. [Synthèse exécutive](#synthèse-exécutive)

---

# PHASE 0 — Compréhension de l'existant

## 1. Ce que le produit permet de faire aujourd'hui

### Description fonctionnelle

**MADXP** est une plateforme SaaS de gestion d'écrans TV interactifs pour clubs sportifs, composée de :

| Composant               | Fonction                           | Technologie                     |
| ----------------------- | ---------------------------------- | ------------------------------- |
| **Raspberry Pi (Edge)** | Affichage TV + télécommande locale | Angular 20 + Node.js + Video.js |
| **Central Server**      | API backend + WebSocket temps réel | Express.js + PostgreSQL + Redis |
| **Central Dashboard**   | Console d'administration web       | Angular 20                      |

### Positionnement stratégique : Two-Sided Marketplace

> **Référence** : Business Plan v1.6, Section 1.2

MADXP se positionne comme le **premier réseau publicitaire sportif amateur en France**, opérant une marketplace double-face :

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TWO-SIDED MARKETPLACE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   CÔTÉ 1 : CLUBS                    CÔTÉ 2 : ANNONCEURS            │
│   ─────────────────                 ──────────────────              │
│   • Abonnement plateforme           • Diffusion sur réseau         │
│   • €50-120/mois                    • €250/mois                    │
│   • Analytics + rapports            • Présence multi-clubs         │
│   • Production vidéo (option)       • Analytics campagnes          │
│                                                                     │
│                    ┌─────────────────┐                              │
│                    │     MADXP      │                              │
│                    │  Garde 90%      │                              │
│                    │  Reverse 10%    │                              │
│                    └─────────────────┘                              │
│                                                                     │
│   EFFET RÉSEAU :                                                    │
│   Plus clubs → Plus audience → CPM attractif → Plus annonceurs     │
│                       ↓                                             │
│   Revenus augmentent → Reverse clubs → Clubs payent moins          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| Segment        | TAM France                      | Objectif 2026       | Objectif 2028        |
| -------------- | ------------------------------- | ------------------- | -------------------- |
| **Clubs**      | €5,2M (13,000 clubs × €400/an)  | €53K (35 clubs)     | €450K (300 clubs)    |
| **Annonceurs** | €1,2M (150 annonceurs × €8K/an) | €16K (6 annonceurs) | €80K (25 annonceurs) |
| **TOTAL**      | **€6,4M**                       | **€69K**            | **€530K**            |

### Capacités observées dans le code

#### A. Gestion de parc d'écrans distribués

- **Enregistrement de sites** : Création/modification de sites avec métadonnées (nom club, localisation, sports, modèle hardware)
- **Monitoring temps réel** : Métriques CPU, RAM, température, disque, uptime via heartbeats WebSocket
- **Statuts de connexion** : online, offline, maintenance, error
- **Groupement** : Organisation par sport, géographie, version logicielle, ou personnalisé

#### B. Distribution de contenu vidéo

- **Upload vidéos** : Single et bulk upload vers Supabase Storage
- **Catégorisation** : sponsor, jingle, ambiance, other (catégories analytics)
- **Déploiement ciblé** : Vers site individuel ou groupe
- **Suivi de déploiement** : pending → in_progress → completed/failed
- **Déploiement Canary** : Rollout progressif avec rollback automatique

#### C. Mises à jour logicielles

- **Gestion versions** : Upload packages, changelogs, flags critiques
- **Déploiement OTA** : Mise à jour à distance des Raspberry Pi
- **Historique** : Tracking des versions installées par site

#### D. Analytics et reporting

- **Sessions club** : Tracking des sessions d'utilisation (durée, vidéos jouées)
- **Video plays** : Enregistrement de chaque lecture (catégorie, durée, trigger auto/manuel)
- **Stats quotidiennes** : Agrégation daily_stats par club
- **Sponsor impressions** : Tracking des impressions publicitaires
- **Rapports PDF** : Génération de rapports club (6 pages)

#### E. Interface locale (Raspberry Pi)

- **Affichage TV** : Lecteur vidéo plein écran avec boucle automatique
- **Télécommande web** : Interface mobile pour contrôler l'affichage
- **Score en live** : Overlay optionnel du score (feature premium en développement)
- **Gestion phases** : avant-match, match, après-match, neutre
- **Admin locale** : Interface http://192.168.4.1/admin pour actions système

#### F. Sécurité et administration

- **RBAC** : 3 rôles (admin, operator, viewer)
- **MFA** : Authentification TOTP optionnelle
- **Audit logs** : Traçabilité des actions
- **Row-Level Security** : Isolation des données via Supabase RLS

---

## 2. Usages principaux identifiés

| Usage                         | Description                                                | Observé dans                                      |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| **Diffusion sponsors**        | Afficher les pubs des sponsors locaux sur écran TV du club | `sponsor-analytics.service.ts`, catégories vidéos |
| **Animation matchs**          | Diffuser contenu avant/pendant/après les matchs            | Phases temporelles, télécommande                  |
| **Valorisation partenariats** | Prouver l'impact des diffusions aux sponsors (analytics)   | PDF reports, sponsor stats                        |
| **Gestion multi-sites**       | Opérer un parc d'écrans depuis une console centrale        | Dashboard, groupes, déploiements                  |
| **Maintenance à distance**    | Surveiller et dépanner les équipements à distance          | Métriques, alertes, commandes                     |

---

## 3. Limites fonctionnelles actuelles observables

> **v1.2** : Mise à jour suite aux implémentations du 25-26 décembre 2025

### Limites techniques

| Limite                                     | Evidence dans le code                                                    | Impact                                               | Statut v1.2                   |
| ------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------- |
| **Pas de planification horaire playlists** | Aucune table `schedules` pour playlists horaires                         | Les clubs doivent déclencher manuellement les vidéos | ❌ Reste                      |
| **Analytics sans audience réelle**         | `audience_estimate` (estimation manuelle), pas d'intégration billetterie | ROI sponsors approximatif                            | ❌ Reste                      |
| ~~**Pas de multi-tenant sponsor**~~        | ~~Sponsors créés par admins~~                                            | ~~Dépendance au club pour rapports~~                 | ✅ **FAIT** (portail lecture) |
| **Score manuel uniquement**                | Saisie manuelle depuis télécommande, pas d'API fédérations               | Friction opérationnelle                              | ❌ Reste                      |
| ~~**Pas d'alertes proactives**~~           | ~~Table `alerts` existe mais pas de notifications~~                      | ~~Détection tardive~~                                | ✅ **FAIT** (email)           |
| **Pas de benchmarking**                    | Données par club isolées                                                 | Pas de comparaison inter-clubs                       | ❌ Reste                      |
| **Overlay score incomplet**                | UI télécommande terminée, overlay TV non implémenté                      | Feature premium incomplète                           | ❌ Reste                      |

### Nouvelles capacités multi-tenant (Dec 2025)

| Capacité                  | Description                                          | Fichiers                       |
| ------------------------- | ---------------------------------------------------- | ------------------------------ |
| **Portail Sponsor**       | Dashboard, vidéos, sites, stats (lecture seule)      | `sponsor-portal.controller.ts` |
| **Portail Agence**        | Dashboard clubs gérés, alertes, stats                | `agency.controller.ts`         |
| **Rôles étendus**         | `sponsor`, `agency` en plus de admin/operator/viewer | `types/index.ts`               |
| **Notifications Email**   | Alertes, déploiements, rapports                      | `email.service.ts`             |
| **Deployment Scheduling** | Programmer déploiement contenu à date future         | `scheduler.service.ts`         |

### Limites UX

| Limite                           | Evidence                                          | Impact                     |
| -------------------------------- | ------------------------------------------------- | -------------------------- |
| **Télécommande basique**         | Interface fonctionnelle mais peu d'automatisation | Charge opérationnelle club |
| **Pas de favoris/raccourcis**    | Navigation par catégories uniquement              | Temps de sélection élevé   |
| **Configuration manuelle score** | Saisie équipes à chaque match                     | Répétitivité               |

### Limites business model

| Limite                            | Evidence                                                    | Impact                             |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| **Feature premium non monétisée** | `liveScoreEnabled` boolean, mais pas de gestion abonnements | Pas de revenus récurrents visibles |
| **Pas d'API partenaires**         | Pas d'OAuth, pas de portail développeurs                    | Écosystème fermé                   |

---

# PHASE 1 — Usages actuels & usages latents

## 1. Usages actuels (factuels)

### Usage A : Diffusion publicitaire locale

| Aspect                   | Détail                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Description**          | Les clubs diffusent les vidéos de leurs sponsors locaux sur l'écran TV                    |
| **Evidence code**        | `sponsors` table, `sponsor_videos`, `sponsor_impressions`, `sponsor-analytics.service.ts` |
| **Fréquence observée**   | Jours de match principalement (phases temporelles)                                        |
| **Profils utilisateurs** | Responsable club (télécommande), Gestionnaire MADXP (dashboard)                           |

### Usage B : Animation événementielle

| Aspect                   | Détail                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| **Description**          | Diffuser du contenu d'ambiance adapté aux moments du match         |
| **Evidence code**        | `timeCategories` (before/during/after), catégories jingle/ambiance |
| **Fréquence observée**   | Événements sportifs                                                |
| **Profils utilisateurs** | Responsable club                                                   |

### Usage C : Monitoring opérationnel

| Aspect                   | Détail                                                          |
| ------------------------ | --------------------------------------------------------------- |
| **Description**          | Surveiller l'état du parc d'écrans, diagnostiquer les problèmes |
| **Evidence code**        | Métriques heartbeat, statuts, `remote_commands`, logs           |
| **Fréquence observée**   | Continue (heartbeats toutes les X secondes)                     |
| **Profils utilisateurs** | Opérateur MADXP, Admin                                          |

### Usage D : Reporting sponsors

| Aspect                   | Détail                                                     |
| ------------------------ | ---------------------------------------------------------- |
| **Description**          | Générer des rapports pour prouver la valeur aux sponsors   |
| **Evidence code**        | `pdf-report.service.ts`, `sponsor_impressions`, export CSV |
| **Fréquence observée**   | Mensuelle/trimestrielle (hypothèse)                        |
| **Profils utilisateurs** | Gestionnaire commercial                                    |

### Usage E : Production vidéo professionnelle

> **Référence** : Business Plan v1.6, Section 2.7 - Différenciateur majeur

| Aspect                   | Détail                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| **Description**          | Produire des vidéos de célébration joueurs et contenus professionnels pour les clubs |
| **Evidence**             | BP v1.6 détaille les packs Bronze/Silver/Gold (€800-€2,000)                          |
| **Fréquence observée**   | Ponctuelle (début de saison, événements)                                             |
| **Profils utilisateurs** | Clubs (clients), Équipe MADXP (production)                                           |

**Offres Production Vidéo (BP v1.6)** :

| Pack          | Prix   | Contenu                                                           | Marge |
| ------------- | ------ | ----------------------------------------------------------------- | ----- |
| **Bronze**    | €800   | 10 vidéos 30s (contenu club fourni), motion design basique        | 56%   |
| **Silver** ⭐ | €1,500 | Shooting 1h30 + 10 vidéos 30s + 1 présentation, motion design pro | 32%   |
| **Gold**      | €2,000 | Shooting 2h + 15 vidéos + interviews, révisions illimitées        | 30%   |

**Valeur stratégique** :

- Argument commercial massue : _"Vos joueurs comme des pros"_
- Différenciateur vs concurrence (intégration automatique plateforme)
- Source de revenus complémentaires (~€12,800 en 2026)
- Prévision : 53% des clubs adoptent (16/30)

---

## 2. Usages latents identifiés

### Usage latent L1 : Scoring automatique en temps réel

| Aspect            | Détail                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Statut**        | Partiellement couvert                                                                                          |
| **Evidence**      | UI télécommande score terminée (`BACKLOG.md`), overlay TV non implémenté, intégrations externes non présentes  |
| **Frein actuel**  | Saisie manuelle fastidieuse, pas de connexion aux tableaux d'affichage                                         |
| **Potentiel**     | Automatisation complète = différenciation majeure                                                              |
| **Justification** | Le backlog mentionne explicitement "Score en Live Phase 2" avec intégrations API fédérations et tableaux Bodet |

### Usage latent L2 : Programmation automatique de playlists

| Aspect            | Détail                                                          |
| ----------------- | --------------------------------------------------------------- |
| **Statut**        | Non abouti (feature en pause)                                   |
| **Evidence**      | "Mode Programmation" listé dans `BACKLOG.md` section "En pause" |
| **Frein actuel**  | Déclenchement manuel obligatoire                                |
| **Potentiel**     | Ritualisation (avant-match automatique à H-30, mi-temps, etc.)  |
| **Justification** | Infrastructure phases temporelles existe, manque le scheduler   |

### Usage latent L3 : Alerting proactif et objectifs

> **v1.2** : PARTIELLEMENT RÉSOLU - Notifications email implémentées

| Aspect                | Détail                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| **Statut**            | ✅ Email FAIT / ❌ Objectifs & SMS restent                             |
| **Evidence v1.2**     | `email.service.ts` : alertes critiques/warning, déploiements, rapports |
| **Frein résiduel**    | Pas de SMS, pas d'objectifs configurables (ex: 40h écran/mois)         |
| **Potentiel restant** | Objectifs = gamification + engagement proactif                         |
| **Justification**     | Email = quick win fait, SMS/Objectifs = P1-P2                          |

**Ce qui est FAIT (Dec 2025):**

- ✅ `sendAlertNotification()` - critical/warning/info avec templates HTML
- ✅ `sendDeploymentNotification()` - started/completed/failed
- ✅ `sendSummaryReport()` - rapport périodique

**Ce qui reste à faire:**

- ❌ Notifications SMS (Twilio)
- ❌ Objectifs configurables par club
- ❌ Scheduling automatique des rapports périodiques

### Usage latent L4 : Accès sponsor self-service

> **v1.2** : PARTIELLEMENT RÉSOLU - Portail lecture seule implémenté

| Aspect                | Détail                                                           |
| --------------------- | ---------------------------------------------------------------- |
| **Statut**            | ✅ Consultation FAIT / ❌ Gestion reste                          |
| **Evidence v1.2**     | `sponsor-portal.controller.ts` : dashboard, sites, vidéos, stats |
| **Frein résiduel**    | Sponsors ne peuvent pas uploader créas, pas de facturation       |
| **Potentiel restant** | Autonomie complète = scale annonceurs                            |
| **Justification**     | Lecture = quick win fait, Écriture = Phase U1 complète           |

**Ce qui est FAIT (Dec 2025):**

- ✅ `GET /api/sponsor/dashboard` - KPIs 30 jours, tendances 7 jours
- ✅ `GET /api/sponsor/sites` - sites de diffusion avec contrats
- ✅ `GET /api/sponsor/videos` - vidéos avec stats impressions
- ✅ `GET /api/sponsor/stats` - stats détaillées par période

**Ce qui reste à faire:**

- ❌ Upload créas publicitaires
- ❌ Gestion campagnes (start/stop/pause)
- ❌ Facturation automatisée par impressions
- ❌ Rotation intelligente des créas

### Usage latent L5 : Benchmarking inter-clubs

| Aspect            | Détail                                                            |
| ----------------- | ----------------------------------------------------------------- |
| **Statut**        | Données présentes, comparaison absente                            |
| **Evidence**      | `club_daily_stats` agrège par site, mais pas de vues comparatives |
| **Frein actuel**  | Chaque club voit ses données isolément                            |
| **Potentiel**     | Gamification, motivation, insights sectoriels                     |
| **Justification** | "Benchmark Anonymisé" en P2 dans le backlog                       |

### Usage latent L6 : A/B testing créas publicitaires

| Aspect            | Détail                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| **Statut**        | Non implémenté, prévu                                                   |
| **Evidence**      | Tables `ab_test_campaigns`, `ab_test_variants` décrites dans BACKLOG.md |
| **Frein actuel**  | Impossible de comparer l'efficacité de différentes versions d'une pub   |
| **Potentiel**     | Optimisation continue des campagnes sponsors                            |
| **Justification** | Feature P3 documentée avec calcul statistique prévu                     |

### Usage latent L7 : Intégration billetterie pour audience réelle

| Aspect            | Détail                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Statut**        | Estimation manuelle uniquement                                                        |
| **Evidence**      | `audience_estimate` dans `club_sessions`, intégrations Weezevent/Ticketmaster prévues |
| **Frein actuel**  | Audience déclarée ≠ audience réelle                                                   |
| **Potentiel**     | Crédibilité analytics, tarification dynamique sponsors                                |
| **Justification** | "Intégrations Billetterie" dans backlog long terme                                    |

---

# PHASE 2 — Nouveaux usages potentiels

## Usage potentiel U1 : Réseau publicitaire annonceurs (CÔTÉ 2 MARKETPLACE)

> **Usage stratégique validé par BP v1.6 - Section 2.5 & 2.6**

| Aspect                      | Détail                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Groupes par géographie, analytics sponsors, déploiement multi-sites, infrastructure de tracking                                                             |
| **Description**             | MADXP opère le seul réseau publicitaire sportif amateur en France, permettant aux annonceurs régionaux/nationaux de diffuser sur tous les clubs partenaires |
| **Valeur utilisateur**      | 1 contrat = présence automatique sur 30+ salles, CPM attractif (€8-12 vs €15-25 digital)                                                                    |
| **Valeur business**         | €250/mois × annonceurs, MADXP garde 90%, source de revenus récurrents majeure                                                                               |
| **Risque si non adressé**   | Marché vierge capté par un concurrent                                                                                                                       |

### Modèle économique annonceurs (BP v1.6)

```
ANNONCEUR paie €250/mois
        ↓
Vidéos diffusées sur tous clubs partenaires (max 3/club)
        ↓
MADXP garde 90% (€225/mois)
        ↓
CLUBS reçoivent 10% (€25/mois × 6 annonceurs = €1,800/an passifs)
```

### Cibles annonceurs prioritaires

| Tier  | Profil    | Exemples                                 | Budget          | Objectif 2026      |
| ----- | --------- | ---------------------------------------- | --------------- | ------------------ |
| **1** | Régionaux | Decathlon Nantes, Crédit Mutuel Bretagne | €250-500/mois   | 3-6                |
| **2** | Nationaux | McDonald's, Nike, Orange                 | €500-2,000/mois | 0 (2027)           |
| **3** | Locaux    | Restaurants, PME                         | €100-250/mois   | Self-service 2027+ |

### Seuils critiques réseau

| Seuil         | Clubs                                              | Impact stratégique |
| ------------- | -------------------------------------------------- | ------------------ |
| **15 clubs**  | Lancement réseau annonceurs (reach minimal viable) |
| **30 clubs**  | Scale annonceurs régionaux (CPM compétitif)        |
| **100 clubs** | Attractivité annonceurs nationaux                  |
| **300 clubs** | Pricing premium (quasi-monopole)                   |

### Arguments vs publicité digitale

| Critère          | Digital Display     | MADXP                        |
| ---------------- | ------------------- | ---------------------------- |
| **CPM**          | €15-25              | €8-12                        |
| **Attention**    | Faible (ad-block)   | Captive (salle)              |
| **Ciblage**      | Imprécis (cookies)  | Hyper-local garanti          |
| **Fraude**       | Risque élevé (bots) | Zéro (spectateurs physiques) |
| **Brand safety** | Variable            | 100% sport amateur           |

**Fonctionnalités enablers existantes :**

- Groupes géographiques
- Sponsor analytics agrégées (`sponsor_impressions`)
- Déploiement par groupe
- Rapports PDF automatiques

**Gap à combler :**

- Portail annonceur self-service
- Dashboard consolidé multi-clubs
- Facturation automatisée par impressions
- Gestion droits annonceur (nouveau rôle)

---

## Usage potentiel U2 : Monétisation DOOH (Digital Out-Of-Home)

> **Usage potentiel suggéré (extension de l'existant)**

| Aspect                      | Détail                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Tracking impressions, audience estimée, infrastructure déploiement                |
| **Description**             | Vendre de l'espace publicitaire programmatique à des annonceurs nationaux via DSP |
| **Valeur utilisateur**      | Revenus passifs pour les clubs sans démarche commerciale                          |
| **Valeur business**         | Commission sur transactions, scale massif                                         |
| **Risque si non adressé**   | Les clubs restent dépendants des sponsors locaux limités                          |

**Prérequis business :**

- Volume minimum ~100 sites (mentionné dans BACKLOG.md "rejeté" mais pertinent à moyen terme)
- Audience vérifiable

---

## Usage potentiel U3 : Fan engagement interactif

> **Usage potentiel validé par BP v1.6 - Section 1.2 (Fonctionnalités Match)**

| Aspect                      | Détail                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Infrastructure WebSocket temps réel, télécommande accessible aux spectateurs potentiels |
| **Description**             | Permettre aux spectateurs d'interagir (votes, quiz, réactions) via leur smartphone      |
| **Valeur utilisateur**      | Expérience match enrichie, engagement communauté                                        |
| **Valeur business**         | Différenciation produit, données first-party, upsell                                    |
| **Risque si non adressé**   | Produit perçu comme simple diffuseur passif                                             |

### Fonctionnalités prévues (BP v1.6)

| Catégorie                  | Fonctionnalités                                  |
| -------------------------- | ------------------------------------------------ |
| **Engagement Spectateurs** | Jeux-concours QR code (vote meilleur joueur)     |
|                            | Sondages en direct mi-temps                      |
|                            | Feed réseaux sociaux sur écran                   |
| **Affichage Dynamique**    | Annonces joueurs (vidéos célébrations 5-10s)     |
|                            | Affichage buteurs temps réel (1 clic smartphone) |
|                            | Faits de jeu (cartons, temps-morts)              |

**Fonctionnalités enablers existantes :**

- WebSocket bidirectionnel
- Interface web mobile
- Phases temporelles
- QR code pour accès télécommande

---

## Usage potentiel U4 : Affichage dynamique multi-écrans

> **Usage potentiel suggéré (extension de l'existant)**

| Aspect                      | Détail                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Architecture multi-sites, groupes, déploiement synchronisé                                        |
| **Description**             | Gérer plusieurs écrans dans un même club (entrée, buvette, vestiaires) avec contenus différenciés |
| **Valeur utilisateur**      | Couverture complète du lieu, messages contextuels                                                 |
| **Valeur business**         | Plus d'écrans = plus d'abonnements                                                                |
| **Risque si non adressé**   | Limité à 1 écran/club = potentiel bridé                                                           |

**Gap à combler :**

- Concept de "zones" au sein d'un site
- Playlists différenciées par zone

---

## Usage potentiel U5 : Services aux fédérations sportives

> **Usage potentiel suggéré (extension de l'existant)**

| Aspect                      | Détail                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Groupes par sport, données agrégées, infrastructure centralisée                                               |
| **Description**             | Les fédérations utilisent MADXP pour diffuser du contenu institutionnel et collecter des analytics sectoriels |
| **Valeur utilisateur**      | Communication unifiée vers tous les clubs affiliés                                                            |
| **Valeur business**         | Contrats B2B fédérations, légitimité sectorielle                                                              |
| **Risque si non adressé**   | Opportunité captée par des acteurs institutionnels                                                            |

---

## Usage potentiel U6 : Formation et sensibilisation

> **Usage potentiel suggéré (extension de l'existant)**

| Aspect                      | Détail                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Catégories de contenu flexibles, déploiement ciblé                                      |
| **Description**             | Diffuser des messages de prévention (santé, fair-play, sécurité) pendant les événements |
| **Valeur utilisateur**      | Rôle sociétal, image positive                                                           |
| **Valeur business**         | Partenariats institutionnels (ministères, assurances, mutuelles)                        |
| **Risque si non adressé**   | Perception uniquement commerciale                                                       |

---

## Usage potentiel U7 : Franchise et white-label

> **Usage potentiel suggéré (extension de l'existant)**

| Aspect                      | Détail                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Architecture multi-tenant, rôles RBAC, isolation des données                                            |
| **Description**             | Licencier la plateforme à des partenaires (équipementiers, intégrateurs) qui l'opèrent sous leur marque |
| **Valeur utilisateur**      | Accès à une solution clé-en-main                                                                        |
| **Valeur business**         | Revenus de licence, expansion géographique sans coût commercial                                         |
| **Risque si non adressé**   | Croissance limitée à la capacité commerciale propre                                                     |

---

## Usage potentiel U8 : Intelligence Campagnes Publicitaires

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Infrastructure analytics granulaire existante                                                                           |
| **Evidence code**           | `sponsor_impressions` avec `completion_rate`, `event_type`, `period`, `position_in_loop` ; `sponsor_daily_stats` agrégé |
| **Standard de marché**      | Google Ads, Facebook Ads Manager, LinkedIn Campaign Manager proposent des insights d'optimisation automatiques          |
| **Description**             | Transformer les données brutes d'impressions en insights actionnables pour optimiser les campagnes                      |
| **Valeur utilisateur**      | Annonceurs optimisent leurs créas sans expertise analytics                                                              |
| **Valeur business**         | Rétention annonceurs, justification premium pricing                                                                     |

**Justification par l'existant :**

```typescript
// sponsor_impressions - Données disponibles dans la base
{
  completion_rate: number,      // ✅ Permet de scorer les vidéos
  event_type: 'match' | 'training' | 'tournament',  // ✅ Corrélation performance/contexte
  period: 'pre_match' | 'halftime' | 'post_match',  // ✅ Optimal timing
  position_in_loop: number,     // ✅ Fatigue publicitaire
  audience_estimate: number     // ✅ CPM réel calculable
}
```

---

## Usage potentiel U9 : Engagement Spectateurs Temps Réel (extension U3)

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | WebSocket bidirectionnel production-ready                                                                        |
| **Evidence code**           | `socket.service.ts` (1,065 lignes) avec Redis adapter, `score-update.handler.ts`, commandes typées avec timeouts |
| **Standard de marché**      | Twitch Polls, YouTube Super Chat, Slido, Kahoot                                                                  |
| **Description**             | Permettre aux spectateurs d'interagir en temps réel (votes, quiz, réactions) via QR code                         |
| **Valeur utilisateur**      | Expérience match gamifiée, engagement communauté                                                                 |
| **Valeur business**         | Données first-party, différenciation, upsell premium                                                             |

**Justification par l'existant :**

```typescript
// socket.service.ts - Infrastructure disponible
- Socket.IO avec Redis adapter (scaling horizontal) ✅
- Authentification API key avec bcrypt ✅
- Broadcast vers sites/groupes avec tracking succès/échec ✅
- score-update handler avec acknowledgment ✅
- Zombie detection (ping/pong 25s) ✅
```

**Hypothèse :** L'accès spectateur via QR code nécessiterait un mode "public" non authentifié, non présent actuellement.

---

## Usage potentiel U10 : Contenu Contextuel Dynamique

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Métadonnées contextuelles déjà trackées                                                              |
| **Evidence code**           | `event_type`, `period` dans impressions ; phases temporelles (before/during/after) dans télécommande |
| **Standard de marché**      | DOOH programmatique (Broadsign, Vistar), signalétique contextuelle                                   |
| **Description**             | Adapter automatiquement le contenu diffusé selon le contexte (match, météo, audience)                |
| **Valeur utilisateur**      | Pertinence accrue, moins de travail manuel                                                           |
| **Valeur business**         | Premium contextuel, différenciation technique                                                        |

**Justification par l'existant :**

```typescript
// Données contextuelles disponibles
event_type: 'match' | 'training' | 'tournament' | 'other'; // ✅
period: 'pre_match' | 'halftime' | 'post_match' | 'loop'; // ✅
audience_estimate: number; // ✅
timeCategories: 'before' | 'during' | 'after'; // ✅ (télécommande)
```

**Information non disponible dans le dépôt :** Intégration API météo, détection automatique de phase.

---

## Usage potentiel U11 : Business Intelligence & Tableaux de Bord Interactifs

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Modèle de données analytics complet                                                         |
| **Evidence code**           | `club_daily_stats` (12+ métriques agrégées), `sponsor_daily_stats`, API dashboard existante |
| **Standard de marché**      | Google Analytics 4, Tableau, Power BI, Mixpanel                                             |
| **Description**             | Dashboards interactifs avec drill-down, trends, anomalies vs PDF statiques                  |
| **Valeur utilisateur**      | Self-service analytics, insights temps réel                                                 |
| **Valeur business**         | Réduction support, justification premium                                                    |

**Justification par l'existant :**

```sql
-- club_daily_stats - Données disponibles
sessions_count, screen_time_seconds, videos_played,
manual_triggers, auto_plays,
sponsor_plays, jingle_plays, ambiance_plays,
avg_cpu, avg_memory, avg_temperature, max_temperature,
uptime_percent, incidents_count
-- Toutes agrégées par site/date ✅
```

---

## Usage potentiel U12 : Automatisation Marketing & Lifecycle

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Scheduler database-driven, email service avec templates                                  |
| **Evidence code**           | `scheduler.service.ts` (254 lignes), `email.service.ts` (348 lignes) avec templates HTML |
| **Standard de marché**      | HubSpot, Mailchimp, Intercom, Customer.io                                                |
| **Description**             | Séquences emails automatisées (onboarding, inactivité, rapports périodiques)             |
| **Valeur utilisateur**      | Communication proactive sans effort                                                      |
| **Valeur business**         | Réduction churn, engagement automatisé                                                   |

**Justification par l'existant :**

```typescript
// email.service.ts - Templates disponibles
sendAlertNotification()      // ✅ Template alert prêt
sendDeploymentNotification() // ✅ Template deployment prêt
sendSummaryReport()          // ✅ Template rapport prêt

// scheduler.service.ts - Infrastructure disponible
- Check toutes les 60 secondes ✅
- Database-driven (facile à étendre) ✅
- Support scheduled_at future ✅
```

**Gap identifié :** Pas de recurring scheduling (cron-like), seulement one-shot.

---

## Usage potentiel U13 : Intégrations Écosystème Partenaires

> **Usage potentiel suggéré (extension de l'existant) - v1.2**

| Aspect                      | Détail                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Ce qui le rend possible** | Architecture API REST, multi-tenant                                                             |
| **Evidence code**           | API documentée OpenAPI, rôles étendus (sponsor, agency), webhooks Slack dans `alert.service.ts` |
| **Standard de marché**      | Zapier, Make, API publiques partenaires                                                         |
| **Description**             | Webhooks sortants et API OAuth pour intégrations tierces (billetterie, CRM, réseaux sociaux)    |
| **Valeur utilisateur**      | Données dans leurs outils existants                                                             |
| **Valeur business**         | Écosystème, stickiness, partenariats                                                            |

**Justification par l'existant :**

```typescript
// alert.service.ts - Webhook Slack existant
siteOffline(); // Envoie vers Slack ✅
highTemperature(); // Envoie vers Slack ✅
lowDiskSpace(); // Envoie vers Slack ✅
```

**Information non disponible dans le dépôt :** Intégrations billetterie (Weezevent), fédérations (FFHB), réseaux sociaux.

---

# PHASE 3 — Fonctionnalités nécessaires par usage

## Pour Usage E : Production Vidéo

> **Référence** : BP v1.6 Section 2.7

### Fonctionnalités existantes contributives

- ✅ Upload vidéos vers plateforme (`content.controller.ts`)
- ✅ Catégorisation des vidéos
- ✅ Déploiement automatique vers sites

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                      | Description                                              | Effort |
| ----------------------------------- | -------------------------------------------------------- | ------ |
| **F.E.1 - Workflow production**     | Suivi des commandes vidéo (brief → shooting → livraison) | Moyen  |
| **F.E.2 - Templates motion design** | Bibliothèque de templates réutilisables                  | Moyen  |
| **F.E.3 - Galerie assets club**     | Stockage photos/vidéos sources par club                  | Faible |
| **F.E.4 - Média Day multi-équipes** | Gestion des shootings groupés (prévu €2,500/journée)     | Moyen  |

---

## Pour U1 : Réseau publicitaire annonceurs

> **v1.2** : Analyse révisée post-implémentations Dec 2025

### Fonctionnalités existantes contributives

- ✅ Groupes géographiques (`groups` avec type='geography')
- ✅ Sponsor analytics (`sponsor_impressions`, `sponsor-analytics.service.ts`)
- ✅ Déploiement par groupe (`content_deployments` avec `target_type='group'`)
- ✅ Rapports PDF (`pdf-report.service.ts`)
- ✅ **[NOUVEAU]** Portail sponsor lecture (`sponsor-portal.controller.ts`)
- ✅ **[NOUVEAU]** Rôle `sponsor` avec isolation JWT (`auth.ts`)
- ✅ **[NOUVEAU]** Dashboard consolidé multi-clubs (stats 30j agrégées)

### Matrice FAIT vs RESTE (v1.2)

| Fonctionnalité                   | v1.1        | v1.2           | Détail                   |
| -------------------------------- | ----------- | -------------- | ------------------------ |
| **F1.1 - Portail annonceur**     | ❌ Manquant | ⚠️ **PARTIEL** | Lecture ✅ / Écriture ❌ |
| **F1.2 - Dashboard consolidé**   | ❌ Manquant | ✅ **FAIT**    | `getSponsorDashboard()`  |
| **F1.3 - Facturation auto**      | ❌ Manquant | ❌ **RESTE**   | Prioritaire pour scale   |
| **F1.4 - Rôle annonceur**        | ❌ Manquant | ✅ **FAIT**    | `sponsor` dans UserRole  |
| **F1.5 - Rotation intelligente** | ❌ Manquant | ❌ **RESTE**   | Max 3 créas/club         |

### Gaps RÉELS restants pour U1

| Fonctionnalité                         | Description                                       | Effort | Priorité |
| -------------------------------------- | ------------------------------------------------- | ------ | -------- |
| **F1.1b - Upload créas annonceur**     | Permettre aux sponsors d'uploader leurs vidéos    | Moyen  | **P1**   |
| **F1.1c - Gestion campagnes**          | Start/pause/stop campagnes, targeting géo         | Moyen  | **P2**   |
| **F1.3 - Facturation par impressions** | Calcul automatique basé sur `sponsor_impressions` | Élevé  | **P1**   |
| **F1.5 - Rotation équitable**          | Distribution fair-share des créas (max 3/club)    | Moyen  | **P2**   |
| **F1.6 - Contrats et devis**           | Génération devis, gestion contrats                | Moyen  | **P2**   |

---

## Pour U2 : Monétisation DOOH

### Fonctionnalités existantes contributives

- ✅ Tracking impressions (`sponsor_impressions`)
- ✅ Audience estimée (`audience_estimate` dans `club_sessions`)
- ✅ Infrastructure de déploiement

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                            | Description                                                    | Effort     |
| ----------------------------------------- | -------------------------------------------------------------- | ---------- |
| **F2.1 - Intégration SSP/DSP**            | Connexion aux plateformes programmatiques (Google DV360, etc.) | Très élevé |
| **F2.2 - Audience vérifiée**              | Intégration billetterie + capteurs (proof of play)             | Élevé      |
| **F2.3 - Slots publicitaires temps réel** | Gestion des créneaux disponibles en temps réel                 | Élevé      |
| **F2.4 - Reporting DOOH standards**       | Métriques conformes aux standards IAB DOOH                     | Moyen      |

---

## Pour U3 : Fan engagement interactif

### Fonctionnalités existantes contributives

- ✅ WebSocket bidirectionnel (`socket.service.ts`)
- ✅ Interface mobile (`remote.component.ts`)
- ✅ Phases temporelles (`timeCategories`)

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                      | Description                                       | Effort |
| ----------------------------------- | ------------------------------------------------- | ------ |
| **F3.1 - Mode spectateur**          | Accès public (QR code) à une interface simplifiée | Moyen  |
| **F3.2 - Système de votes/quiz**    | Création et affichage de sondages temps réel      | Moyen  |
| **F3.3 - Affichage résultats live** | Visualisation des votes sur l'écran TV            | Moyen  |
| **F3.4 - Gamification**             | Points, classements, récompenses                  | Élevé  |

---

## Pour U4 : Affichage multi-écrans

### Fonctionnalités existantes contributives

- ✅ Architecture multi-sites
- ✅ Déploiement ciblé

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                          | Description                                            | Effort |
| --------------------------------------- | ------------------------------------------------------ | ------ |
| **F4.1 - Concept de zones**             | Hiérarchie site → zones (ex: entrée, buvette, terrain) | Moyen  |
| **F4.2 - Playlists par zone**           | Contenu différencié selon l'emplacement de l'écran     | Moyen  |
| **F4.3 - Synchronisation multi-écrans** | Option de diffusion synchrone sur plusieurs écrans     | Élevé  |
| **F4.4 - Tarification multi-écrans**    | Pricing adapté au nombre d'écrans par site             | Faible |

---

## Pour Usage latent L1 : Score automatique

### Fonctionnalités existantes contributives

- ✅ UI saisie score télécommande (terminé)
- ✅ Communication WebSocket score-update
- ✅ Flag `liveScoreEnabled`

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                              | Description                                          | Effort     |
| ------------------------------------------- | ---------------------------------------------------- | ---------- |
| **F.L1.1 - Overlay TV score**               | Affichage incrusté du score sur la vidéo             | Faible     |
| **F.L1.2 - Intégration API FFHB/FFVB/FFBB** | Récupération automatique des scores fédérations      | Moyen      |
| **F.L1.3 - Intégration tableaux Bodet**     | Lecture du score depuis le tableau d'affichage local | Élevé      |
| **F.L1.4 - OCR fallback**                   | Lecture optique du tableau via caméra                | Très élevé |

---

## Pour Usage latent L2 : Programmation playlists

> **v1.2** : CLARIFICATION IMPORTANTE
>
> ⚠️ **Deployment Scheduling ≠ Playlist Scheduling**
>
> - `scheduler.service.ts` = programmer un **déploiement de contenu** pour une date future
> - Playlist scheduling = programmer **ce qui joue à quelle heure** (ex: sponsors 14h-16h)

### Fonctionnalités existantes contributives

- ✅ Phases temporelles (before/during/after)
- ✅ Catégories de contenu
- ✅ **[NOUVEAU]** Deployment scheduling (`scheduler.service.ts`) - **mais ≠ playlist**

### Ce qui est FAIT (Dec 2025) - Deployment Scheduling

```typescript
// scheduler.service.ts - Ce qui EXISTE
scheduleContentDeployment(deploymentId, scheduledAt, scheduledBy); // ✅ FAIT
cancelScheduledDeployment(deploymentId, type); // ✅ FAIT
getUpcomingScheduledDeployments(limit); // ✅ FAIT
```

**Cas d'usage couvert :** "Déployer cette vidéo sur les clubs le 15 janvier à 8h"

### Ce qui RESTE à faire - Playlist Scheduling

| Fonctionnalité                       | Description                                   | Effort | Statut       |
| ------------------------------------ | --------------------------------------------- | ------ | ------------ |
| **F.L2.1 - Scheduler playlists**     | "Sponsors de 14h à 16h, jingles de 18h à 20h" | Moyen  | ❌ **RESTE** |
| **F.L2.2 - Triggers événementiels**  | Auto-switch sur phase match (avant → pendant) | Moyen  | ❌ **RESTE** |
| **F.L2.3 - Templates programmation** | Modèles "jour de match", "entraînement"       | Faible | ❌ **RESTE** |
| **F.L2.4 - Calendrier matchs**       | Sync calendrier fédération/club               | Moyen  | ❌ **RESTE** |

### Différence conceptuelle

```
DEPLOYMENT SCHEDULING (✅ FAIT)          PLAYLIST SCHEDULING (❌ RESTE)
─────────────────────────────           ──────────────────────────────
"Quand déployer le contenu?"            "Quand jouer le contenu?"

Contenu A ──[déployer]──> Club          Contenu A ──[jouer 14h-16h]──> TV
           à date future                Contenu B ──[jouer 16h-18h]──> TV
                                        Contenu C ──[jouer si match]──> TV
```

---

## Pour Usage latent L3 : Alerting proactif

> **v1.2** : Notifications email IMPLÉMENTÉES

### Fonctionnalités existantes contributives

- ✅ Table `alerts`
- ✅ Service `alert.service.ts`
- ✅ Métriques de santé
- ✅ **[NOUVEAU]** `email.service.ts` avec templates HTML

### Ce qui est FAIT (Dec 2025) - Email Notifications

```typescript
// email.service.ts - Ce qui EXISTE
sendAlertNotification(to, { siteName, alertType, severity, message })  // ✅ FAIT
sendDeploymentNotification(to, { siteName, videoName, status })        // ✅ FAIT
sendSummaryReport(to, { period, totalSites, alertsCount, ... })        // ✅ FAIT
```

**Capacités implémentées :**

- Alertes par sévérité (critical 🔴, warning 🟠, info ℹ️)
- Templates HTML professionnels avec branding NeoPro
- Rate limiting (5 emails/sec)
- Pool de connexions SMTP

### Matrice FAIT vs RESTE (v1.2)

| Fonctionnalité                       | v1.1        | v1.2           | Détail                    |
| ------------------------------------ | ----------- | -------------- | ------------------------- |
| **F.L3.1 - Notifications email**     | ❌ Manquant | ✅ **FAIT**    | `sendAlertNotification()` |
| **F.L3.2 - Notifications SMS**       | ❌ Manquant | ❌ **RESTE**   | Twilio non intégré        |
| **F.L3.3 - Objectifs configurables** | ❌ Manquant | ❌ **RESTE**   | Table `club_objectives`   |
| **F.L3.4 - Rapports automatiques**   | ❌ Manquant | ⚠️ **PARTIEL** | Template ✅, cron ❌      |

### Gaps RÉELS restants pour L3

| Fonctionnalité              | Description                                    | Effort | Priorité |
| --------------------------- | ---------------------------------------------- | ------ | -------- |
| **F.L3.2 - SMS Twilio**     | Alertes critiques par SMS (fallback)           | Faible | P2       |
| **F.L3.3 - Objectifs club** | Config objectifs (40h/mois, 100 impressions/j) | Moyen  | **P1**   |
| **F.L3.4b - Cron rapports** | Scheduling envoi rapports hebdo/mensuels       | Faible | **P1**   |
| **F.L3.5 - Webhooks**       | Intégration Slack/Discord/Teams                | Faible | P2       |

---

## Pour Usage latent L5 : Benchmarking

### Fonctionnalités existantes contributives

- ✅ `club_daily_stats` agrégé par site
- ✅ Groupes par sport/région

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                     | Description                                  | Effort |
| ---------------------------------- | -------------------------------------------- | ------ |
| **F.L5.1 - Vue benchmark**         | Comparaison anonymisée avec clubs similaires | Moyen  |
| **F.L5.2 - Percentiles**           | Positionnement (top 10%, médiane, etc.)      | Faible |
| **F.L5.3 - Insights automatiques** | Recommandations basées sur les écarts        | Moyen  |
| **F.L5.4 - Cohort filtering**      | Segmentation par sport, taille, région       | Faible |

---

## Pour U8 : Intelligence Campagnes Publicitaires

> **v1.2** : Nouvel usage identifié basé sur infrastructure analytics existante

### Fonctionnalités existantes contributives

- ✅ `sponsor_impressions` avec `completion_rate`, `event_type`, `period`
- ✅ `sponsor_daily_stats` agrégé par vidéo/site/jour
- ✅ Calcul `position_in_loop` (fatigue publicitaire)
- ✅ `audience_estimate` pour CPM réel

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                   | Description                                                         | Effort | Priorité |
| -------------------------------- | ------------------------------------------------------------------- | ------ | -------- |
| **F.U8.1 - Scoring créas**       | Score automatique par vidéo (completion_rate × impressions × reach) | Faible | **P1**   |
| **F.U8.2 - Alertes performance** | Notification si completion_rate < seuil ou zéro impressions 7j      | Faible | **P1**   |
| **F.U8.3 - Optimal timing**      | Recommandation meilleur `period` basée sur historique               | Moyen  | P2       |
| **F.U8.4 - Fatigue detection**   | Alerte si `position_in_loop` élevé dégrade completion_rate          | Moyen  | P2       |
| **F.U8.5 - CPM calculator**      | CPM réel = coût / (impressions × audience_estimate)                 | Faible | **P1**   |

**Justification** : Données 100% disponibles dans `sponsor_impressions`, calculs simples.

---

## Pour U9 : Engagement Spectateurs Temps Réel

> **v1.2** : Extension de U3 (Fan Engagement) avec fonctionnalités détaillées

### Fonctionnalités existantes contributives

- ✅ WebSocket bidirectionnel (`socket.service.ts`)
- ✅ Redis adapter pour scaling
- ✅ Broadcast vers sites avec acknowledgment
- ✅ `score-update.handler.ts` comme modèle

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité               | Description                                                   | Effort | Priorité |
| ---------------------------- | ------------------------------------------------------------- | ------ | -------- |
| **F.U9.1 - Mode spectateur** | Accès public via QR code (authentification optionnelle)       | Moyen  | **P1**   |
| **F.U9.2 - Système votes**   | Créer/gérer/voter sur questions temps réel                    | Moyen  | P2       |
| **F.U9.3 - Affichage TV**    | Overlay résultats votes sur écran (WebSocket push)            | Moyen  | P2       |
| **F.U9.4 - Quiz gamifié**    | Questions avec timer, leaderboard, récompenses                | Élevé  | P3       |
| **F.U9.5 - Modération**      | Filtrage contenu avant affichage (mots interdits, validation) | Moyen  | P2       |

**Hypothèse** : Nécessite nouveau handler WebSocket pour votes, nouveau modèle de données `polls`.

---

## Pour U10 : Contenu Contextuel Dynamique

> **v1.2** : Automatisation basée sur les métadonnées contextuelles existantes

### Fonctionnalités existantes contributives

- ✅ `event_type` : match, training, tournament, other
- ✅ `period` : pre_match, halftime, post_match, loop
- ✅ Phases télécommande : before, during, after
- ✅ Catégories vidéos : sponsor, jingle, ambiance

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                     | Description                                                    | Effort | Priorité |
| ---------------------------------- | -------------------------------------------------------------- | ------ | -------- |
| **F.U10.1 - Règles contextuelles** | IF event_type=match AND period=halftime THEN playlist_sponsors | Moyen  | P2       |
| **F.U10.2 - Auto-phase detection** | Inférer phase depuis activité score (score change → during)    | Moyen  | P2       |
| **F.U10.3 - Contenu météo**        | Intégration API météo → adapter ambiance (pluie, soleil)       | Faible | P3       |
| **F.U10.4 - Audience-adaptive**    | Si audience_estimate > seuil → augmenter fréquence sponsors    | Moyen  | P2       |
| **F.U10.5 - Priority slots**       | Sponsors premium toujours en position 1-2 du loop              | Faible | **P1**   |

**Information non disponible** : API météo externe non intégrée.

---

## Pour U11 : Business Intelligence & Dashboards Interactifs

> **v1.2** : Évolution des PDF statiques vers dashboards self-service

### Fonctionnalités existantes contributives

- ✅ `club_daily_stats` : 12+ métriques agrégées
- ✅ `sponsor_daily_stats` : tendances par vidéo/site
- ✅ API `/analytics/clubs/:id/dashboard`
- ✅ Export CSV existant

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                     | Description                                       | Effort | Priorité |
| ---------------------------------- | ------------------------------------------------- | ------ | -------- |
| **F.U11.1 - Dashboard temps réel** | Widgets live (vs refresh manuel) via WebSocket    | Moyen  | P2       |
| **F.U11.2 - Drill-down**           | Clic sur graphe → détail par site/vidéo/jour      | Moyen  | P2       |
| **F.U11.3 - Trends YoY/MoM**       | Comparaison automatique période précédente        | Faible | **P1**   |
| **F.U11.4 - Anomaly alerts**       | Détection écarts significatifs (screen_time -50%) | Moyen  | P2       |
| **F.U11.5 - Custom reports**       | Builder de rapports personnalisés (drag & drop)   | Élevé  | P3       |

**Justification** : Données 100% disponibles, nécessite frontend enrichi.

---

## Pour U12 : Automatisation Marketing & Lifecycle

> **v1.2** : Extension du scheduler existant vers workflows marketing

### Fonctionnalités existantes contributives

- ✅ `scheduler.service.ts` : check toutes les 60s, database-driven
- ✅ `email.service.ts` : templates HTML prêts
- ✅ `sendSummaryReport()` : template rapport périodique

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                        | Description                                                  | Effort | Priorité |
| ------------------------------------- | ------------------------------------------------------------ | ------ | -------- |
| **F.U12.1 - Cron scheduling**         | Support récurrence (daily, weekly, monthly)                  | Moyen  | **P1**   |
| **F.U12.2 - Séquence onboarding**     | Emails J+1, J+7, J+30 après inscription club                 | Moyen  | P2       |
| **F.U12.3 - Alerte inactivité**       | Email si screen_time=0 depuis X jours                        | Faible | **P1**   |
| **F.U12.4 - Rapport périodique auto** | Envoi hebdo/mensuel du PDF rapport                           | Faible | **P1**   |
| **F.U12.5 - Triggers événementiels**  | Email automatique sur : nouveau sponsor, déploiement, alerte | Moyen  | P2       |

**Gap identifié** : `scheduler.service.ts` ne supporte pas les tâches récurrentes, seulement one-shot.

---

## Pour U13 : Intégrations Écosystème Partenaires

> **v1.2** : Ouverture de la plateforme vers l'écosystème externe

### Fonctionnalités existantes contributives

- ✅ Webhook Slack dans `alert.service.ts`
- ✅ API REST documentée (OpenAPI)
- ✅ Authentification JWT/API key
- ✅ Multi-tenant isolation

### Fonctionnalités complémentaires suggérées (nouvel usage)

| Fonctionnalité                        | Description                                                      | Effort | Priorité |
| ------------------------------------- | ---------------------------------------------------------------- | ------ | -------- |
| **F.U13.1 - Webhooks génériques**     | POST vers URL configurée sur événements (alert, deploy, session) | Moyen  | P2       |
| **F.U13.2 - API OAuth 2.0**           | Authentification partenaires avec scopes                         | Élevé  | P2       |
| **F.U13.3 - Intégration Weezevent**   | Sync billetterie → audience_estimate automatique                 | Moyen  | P2       |
| **F.U13.4 - Intégration fédérations** | API FFHB/FFVB/FFBB pour scores automatiques                      | Moyen  | P2       |
| **F.U13.5 - Social media feed**       | Afficher tweets/posts hashtag club sur TV                        | Moyen  | P3       |

**Information non disponible** : Spécifications APIs externes (Weezevent, fédérations).

---

# PHASE 4 — Roadmap fonctionnelle

## Seuils critiques réseau (BP v1.6)

> Les fonctionnalités sont conditionnées par le nombre de clubs actifs

| Seuil  | Clubs | Déclencheur stratégique                                    |
| ------ | ----- | ---------------------------------------------------------- |
| **S1** | 15    | Lancement réseau annonceurs (reach minimal)                |
| **S2** | 30    | Scale annonceurs régionaux, premiers revenus passifs clubs |
| **S3** | 100   | Attractivité annonceurs nationaux                          |
| **S4** | 300   | Pricing premium, quasi-monopole marché                     |

## Pricing clubs (BP v1.6)

| Offre      | Prix/mois | Inclus                                         |
| ---------- | --------- | ---------------------------------------------- |
| **Bronze** | €50       | Plateforme + support                           |
| **Silver** | €80       | Bronze + analytics avancés                     |
| **Gold**   | €120      | Silver + analytics sponsors + priorité support |

## Vue d'ensemble

> **v1.2** : Roadmap révisée post-implémentations Dec 2025

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROADMAP MADXP 2026 (v1.2)                            │
│              Alignée BP v1.6 + Implémentations Dec 2025                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✅ FAIT (Dec 2025)              │ COURT TERME (0-3 mois)                     │
│ ───────────────────             │ Objectif: 15 clubs (S1)                    │
│ • Portail sponsor lecture       │ ─────────────────────────                  │
│ • Portail agence lecture        │ • Overlay score TV (P0) ⭐                 │
│ • Notifications email           │ • Cron rapports auto (P1)                  │
│ • Deployment scheduling         │ • Objectifs clubs (P1)                     │
│ • Rôles sponsor/agency          │ • Templates programmation (P1)             │
│ • Sécurité (CORS, JWT, auth)    │ • Upload créas sponsors (P1)               │
│                                 │ • [S1] Lancement réseau annonceurs         │
├─────────────────────────────────────────────────────────────────────────────┤
│ MOYEN TERME (3-6 mois)          │ LONG TERME (6-12 mois)                     │
│ Objectif: 30 clubs (S2)         │ Objectif: 100 clubs (S3)                   │
│ ──────────────────────          │ ─────────────────────────                  │
│ • Scheduler playlists (P1)      │ • Facturation auto impressions (P2)       │
│ • Benchmarking anonymisé (P1)   │ • API OAuth partenaires (P2)              │
│ • Intégration score FFHB (P1)   │ • A/B testing créas (P2)                  │
│ • Gestion campagnes sponsors    │ • Multi-écrans / zones (P2)               │
│ • Mode spectateur MVP (P2)      │ • Intégration billetterie (P3)            │
│ • [S2] Scale annonceurs régio.  │ • [S3] Annonceurs nationaux               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quick Wins déjà réalisés (Dec 2025)

| Feature                      | Impact                 | Files                          |
| ---------------------------- | ---------------------- | ------------------------------ |
| ✅ Portail sponsor (lecture) | L4 partiel, U1 partiel | `sponsor-portal.controller.ts` |
| ✅ Portail agence (lecture)  | Nouveau segment        | `agency.controller.ts`         |
| ✅ Notifications email       | L3 partiel             | `email.service.ts`             |
| ✅ Deployment scheduling     | Automatisation         | `scheduler.service.ts`         |
| ✅ Rôles sponsor/agency      | Multi-tenant           | `types/index.ts`               |
| ✅ Sécurité renforcée        | Compliance             | CORS, JWT cookies, auth        |

---

## Détail de la roadmap

### COURT TERME (0-3 mois)

> **v1.2** : Roadmap révisée - plusieurs P0 déjà réalisés

| ID         | Fonctionnalité                  | Usage associé         | Type             | Priorité | Valeur principale      | Effort     | **Statut v1.2**  |
| ---------- | ------------------------------- | --------------------- | ---------------- | -------- | ---------------------- | ---------- | ---------------- |
| **R1**     | Overlay score TV                | L1 - Score temps réel | Amélioration     | **P0**   | Rétention              | Faible     | ❌ **RESTE**     |
| ~~**R2**~~ | ~~Notifications email alertes~~ | ~~L3 - Alerting~~     | ~~Amélioration~~ | ~~P0~~   | ~~Réduction friction~~ | ~~Faible~~ | ✅ **FAIT**      |
| **R3**     | Cron rapports PDF auto          | L3 - Alerting         | Amélioration     | **P1**   | Rétention              | Faible     | ⚠️ Template fait |
| **R4**     | Objectifs temps d'écran clubs   | L3 - Alerting         | Extension        | **P1**   | Rétention              | Moyen      | ❌ **RESTE**     |
| **R5**     | Templates de programmation      | L2 - Programmation    | Amélioration     | **P1**   | Adoption               | Faible     | ❌ **RESTE**     |
| **R5b**    | Upload créas sponsors           | U1 - Annonceurs       | Extension        | **P1**   | Scale annonceurs       | Moyen      | ❌ **NOUVEAU**   |

**Justification P0 unique (v1.2) :**

- R1 : **SEUL P0 restant** - Feature premium promise, différenciation, UI télécommande prête
- R2 : ✅ FAIT (`email.service.ts` avec templates HTML)
- R3 : Template `sendSummaryReport()` fait, manque le cron scheduling

**Nouvelle priorité P1 :**

- R5b : Upload créas sponsors = enabler pour scale annonceurs (Seuil S1)

---

### MOYEN TERME (3-6 mois)

| ID      | Fonctionnalité                        | Usage associé       | Type        | Priorité | Valeur principale | Effort |
| ------- | ------------------------------------- | ------------------- | ----------- | -------- | ----------------- | ------ |
| **R6**  | Scheduler playlists horaires          | L2 - Programmation  | Extension   | **P1**   | Adoption          | Moyen  |
| **R7**  | Benchmarking anonymisé                | L5 - Benchmark      | Nouveau cas | **P1**   | Rétention         | Moyen  |
| **R8**  | Dashboard objectifs & alertes complet | L3 - Alerting       | Extension   | **P1**   | Rétention         | Moyen  |
| **R9**  | Intégration score FFHB                | L1 - Score          | Extension   | **P1**   | Montée en gamme   | Moyen  |
| **R10** | Mode spectateur (MVP)                 | U3 - Fan engagement | Nouveau cas | **P2**   | Adoption          | Moyen  |

**Justification P1 :**

- R6-R8 : Complètent les usages latents identifiés, fort impact rétention
- R9 : Différenciation, réduction friction opérationnelle

---

### LONG TERME (6-12 mois)

| ID      | Fonctionnalité                    | Usage associé        | Type        | Priorité | Valeur principale | Effort |
| ------- | --------------------------------- | -------------------- | ----------- | -------- | ----------------- | ------ |
| **R11** | Portail sponsor self-service      | L4 - Accès sponsor   | Nouveau cas | **P2**   | Montée en gamme   | Élevé  |
| **R12** | API OAuth partenaires             | Écosystème           | Extension   | **P2**   | Montée en gamme   | Élevé  |
| **R13** | A/B testing créas sponsors        | L6 - A/B testing     | Nouveau cas | **P2**   | Montée en gamme   | Élevé  |
| **R14** | Gestion multi-écrans / zones      | U4 - Multi-écrans    | Extension   | **P2**   | Adoption          | Moyen  |
| **R15** | Intégration billetterie Weezevent | L7 - Audience réelle | Extension   | **P3**   | Montée en gamme   | Moyen  |
| **R16** | Dashboard régie régionale         | U1 - Régies          | Nouveau cas | **P3**   | Montée en gamme   | Élevé  |
| **R17** | Préparation DOOH (specs SSP)      | U2 - DOOH            | Nouveau cas | **P3**   | Montée en gamme   | Élevé  |

---

## Matrice impact/effort

```
                    EFFORT
            Faible      Moyen       Élevé
         ┌──────────┬───────────┬───────────┐
    Haut │ R1, R2   │ R7, R8    │ R11, R16  │
         │ R3, R5   │ R9        │ R17       │
IMPACT   ├──────────┼───────────┼───────────┤
  Moyen  │          │ R4, R6    │ R12, R13  │
         │          │ R10, R14  │           │
         ├──────────┼───────────┼───────────┤
    Bas  │          │ R15       │           │
         └──────────┴───────────┴───────────┘
```

**Quick wins (Faible effort + Haut impact)** : R1, R2, R3, R5
**Projets stratégiques (Effort élevé + Haut impact)** : R11, R16, R17

---

# Synthèse exécutive

> **v1.2** : Synthèse révisée post-implémentations Dec 2025

## 1. Synthèse des usages actuels

MADXP est une **two-sided marketplace** positionnée comme le **premier réseau publicitaire sportif amateur en France** :

| Usage                     | Maturité   | Couverture                     | Évolution v1.2       |
| ------------------------- | ---------- | ------------------------------ | -------------------- |
| Diffusion sponsors locaux | ⭐⭐⭐⭐   | Complète                       | =                    |
| Animation matchs          | ⭐⭐⭐     | Fonctionnelle                  | =                    |
| Monitoring parc d'écrans  | ⭐⭐⭐⭐   | Complète                       | +Alertes email       |
| Reporting sponsors        | ⭐⭐⭐⭐   | PDF + portail lecture          | **+Portail sponsor** |
| Déploiement contenu       | ⭐⭐⭐⭐⭐ | Complète + canary + scheduling | **+Scheduling**      |
| **Production vidéo**      | ⭐⭐⭐     | Service proposé (BP v1.6)      | =                    |
| **Multi-tenant**          | ⭐⭐⭐⭐   | Sponsors + Agences             | **NOUVEAU**          |

**Points forts observés (v1.2) :**

- Architecture distribuée mature (Raspberry Pi + Cloud)
- Stack technique moderne (Angular 20, Node.js, PostgreSQL)
- Analytics sponsor différenciantes
- Déploiement progressif (canary) rare dans ce marché
- **Production vidéo intégrée** : différenciateur majeur (BP v1.6)
- **Modèle two-sided** : clubs + annonceurs = 2 sources revenus
- **[NOUVEAU]** Multi-tenant avec portails dédiés (sponsors, agences)
- **[NOUVEAU]** Notifications email professionnelles
- **[NOUVEAU]** Deployment scheduling

---

## 2. Usages latents identifiés

> **v1.2** : Statut mis à jour après implémentations Dec 2025

| Usage latent                      | Maturité v1.1 | Maturité v1.2 | Priorité | Statut                             |
| --------------------------------- | ------------- | ------------- | -------- | ---------------------------------- |
| L1 - Score automatique temps réel | 70%           | 70%           | **P0**   | ❌ Overlay reste                   |
| L2 - Programmation playlists      | 40%           | 45%           | **P1**   | ⚠️ Deploy sched. ≠ Playlist sched. |
| L3 - Alerting proactif            | 60%           | **85%**       | P1       | ✅ Email fait, objectifs restent   |
| L4 - Accès sponsor self-service   | 20%           | **70%**       | P1       | ✅ Lecture fait, écriture reste    |
| L5 - Benchmarking inter-clubs     | 50%           | 50%           | **P1**   | ❌ Reste                           |
| L6 - A/B testing créas            | 10%           | 10%           | P2       | ❌ Reste                           |
| L7 - Intégration billetterie      | 0%            | 0%            | P3       | ❌ Reste                           |

**Évolutions clés v1.2 :**

- L3 : +25% grâce à `email.service.ts`
- L4 : +50% grâce à `sponsor-portal.controller.ts`

---

## 3. Nouveaux usages proposés

| Usage potentiel                | Opportunité    | Faisabilité         | Recommandation                        |
| ------------------------------ | -------------- | ------------------- | ------------------------------------- |
| **U1 - Réseau annonceurs**     | **Très haute** | Haute               | **PRIORITAIRE - Seuil S1 (15 clubs)** |
| U2 - DOOH programmatique       | Très haute     | Faible (volume S3+) | Long terme (100+ clubs)               |
| U3 - Fan engagement            | Haute          | Haute               | **Prototype H2 2026**                 |
| U4 - Multi-écrans              | Haute          | Haute               | **Développer 2026**                   |
| U5 - Services fédérations      | Haute          | Moyenne             | Opportuniste                          |
| U6 - Formation/sensibilisation | Moyenne        | Haute               | Quick win contenu                     |
| U7 - White-label               | Haute          | Moyenne             | Stratégique 2027                      |

### Focus stratégique : Réseau Annonceurs (U1)

> **TAM Annonceurs** : €1,2M ARR (BP v1.6)

| Phase       | Seuil     | Action                                     | Revenus attendus |
| ----------- | --------- | ------------------------------------------ | ---------------- |
| **2026 T2** | 15 clubs  | Lancement réseau, 3-6 annonceurs régionaux | €16K ARR         |
| **2027**    | 30 clubs  | Scale, +10 annonceurs                      | €40K ARR         |
| **2028**    | 100 clubs | Annonceurs nationaux                       | €80K ARR         |

---

## 4. Recommandations prioritaires

> **v1.2** : Recommandations révisées - certaines déjà réalisées

### ✅ FAIT (Dec 2025)

- ~~Activer notifications email~~ → `email.service.ts` ✅
- ~~Portail sponsor lecture seule~~ → `sponsor-portal.controller.ts` ✅
- ~~Deployment scheduling~~ → `scheduler.service.ts` ✅
- ~~Rôles multi-tenant~~ → sponsor/agency ✅

### Priorité 0 (immédiat - 0-1 mois)

1. **Finaliser overlay score TV** - **SEUL P0 restant**, UI télécommande prête, overlay manquant

### Priorité 1 (court terme - 1-3 mois) → Objectif S1 (15 clubs)

2. **Cron rapports PDF auto** - Template `sendSummaryReport()` fait, manque scheduling
3. **Implémenter objectifs clubs** - Table `club_objectives`, seuils configurables
4. **Upload créas sponsors** - Enabler pour scale annonceurs
5. **Templates programmation playlists** - Modèles réutilisables jour de match
6. **[S1] Lancement réseau annonceurs** - Prospection Tier 1 (15 clubs atteints)

### Priorité 2 (moyen terme - 3-6 mois) → Objectif S2 (30 clubs)

7. **Scheduler playlists horaires** - Programmer ce qui joue quand (≠ deployment)
8. **Benchmarking anonymisé** - Comparaison inter-clubs
9. **Gestion campagnes sponsors** - Start/pause/stop, targeting géo
10. **Intégrer API score FFHB** - Automatisation = montée en gamme premium
11. **[S2] Scale annonceurs régionaux** - 6+ annonceurs

---

## 5. Risques si non adressés

| Risque                                       | Usages concernés | Impact    |
| -------------------------------------------- | ---------------- | --------- |
| Churn clubs par manque d'engagement proactif | L3, L5           | **Élevé** |
| Feature premium incomplète (score)           | L1               | **Moyen** |
| Dépendance aux sponsors locaux limités       | U1, U2           | Moyen     |
| Concurrence sur automatisation               | L1, L2           | **Élevé** |
| Perception "simple diffuseur"                | U3, U6           | Moyen     |

---

## 6. Conclusion

> **v1.2** : Conclusion révisée post-implémentations Dec 2025

MADXP dispose d'une **base technique solide** et d'un **positionnement stratégique différenciant** comme **premier réseau publicitaire sportif amateur en France**.

### Constats clés (v1.2)

| Dimension             | Analyse                                           | Évolution   |
| --------------------- | ------------------------------------------------- | ----------- |
| **Modèle économique** | Two-sided marketplace validé (clubs + annonceurs) | =           |
| **TAM combiné**       | €6,4M (€5,2M clubs + €1,2M annonceurs)            | =           |
| **Différenciateur**   | Production vidéo intégrée + analytics sponsors    | =           |
| **Usages latents**    | 7 identifiés, **L3/L4 partiellement résolus**     | ↗️          |
| **Nouveaux usages**   | 7 proposés, alignés BP v1.6                       | =           |
| **Multi-tenant**      | Portails sponsor/agence opérationnels             | **NOUVEAU** |

### Avancées Dec 2025

```
┌─────────────────────────────────────────────────────────────────┐
│                   IMPLÉMENTATIONS DEC 2025                       │
├─────────────────────────────────────────────────────────────────┤
│  ✅ Portail sponsor (lecture) - Dashboard, vidéos, stats        │
│  ✅ Portail agence (lecture) - Dashboard clubs, alertes         │
│  ✅ Notifications email - Alertes, déploiements, rapports       │
│  ✅ Deployment scheduling - Programmer déploiements             │
│  ✅ Rôles sponsor/agency - JWT enrichi, isolation               │
│  ✅ Sécurité renforcée - CORS, cookies HttpOnly, auth           │
└─────────────────────────────────────────────────────────────────┘
```

### Focus stratégique 2026 (révisé)

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBJECTIFS CLÉS 2026 (v1.2)                    │
├─────────────────────────────────────────────────────────────────┤
│  IMMÉDIAT: Overlay score TV (SEUL P0 restant)                   │
│  T1-T2: S1 (15 clubs) → Upload créas, objectifs, cron rapports  │
│  T3-T4: S2 (30 clubs) → Scheduler playlists, benchmarking       │
│  ARR cible: €69K (€53K clubs + €16K annonceurs)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Recommandations finales (v1.2)

1. **~~Notifications email~~** ✅ FAIT - Focus sur overlay score TV (SEUL P0)
2. **~~Portail sponsor~~** ✅ PARTIEL - Ajouter upload créas et gestion campagnes
3. **Atteindre seuil S1** : 15 clubs = déclencheur réseau annonceurs
4. **Compléter alerting** : Cron rapports + objectifs clubs (templates prêts)
5. **Clarifier scheduling** : Deployment ≠ Playlist, implémenter playlist scheduler
6. **Capitaliser sur production vidéo** : différenciateur commercial massue

### Matrice de maturité finale (v1.2)

| Composant         | v1.1     | v1.2       | Gap restant        |
| ----------------- | -------- | ---------- | ------------------ |
| **Core Platform** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | -                  |
| **Multi-tenant**  | ⭐⭐     | ⭐⭐⭐⭐   | Upload créas       |
| **Alerting**      | ⭐⭐     | ⭐⭐⭐⭐   | Objectifs, SMS     |
| **Score Live**    | ⭐⭐⭐   | ⭐⭐⭐     | Overlay TV         |
| **Programmation** | ⭐⭐     | ⭐⭐       | Playlist scheduler |
| **Analytics**     | ⭐⭐⭐⭐ | ⭐⭐⭐⭐   | Benchmarking       |

La plateforme est **bien positionnée** et **a significativement progressé** en décembre 2025. Elle peut désormais évoluer d'un outil de diffusion vers une **marketplace d'engagement sportif complète** avec deux sources de revenus récurrents.

---

_Document mis à jour le 26 décembre 2025_
_Version 1.2 - Aligné avec Business Plan v1.6 + Implémentations Dec 2025_
