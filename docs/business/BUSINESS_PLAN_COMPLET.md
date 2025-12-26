# NEOPRO - Business Plan & Roadmap Technique Complète

> **Document de référence pour investisseurs, CTO et COO**
> Version 1.6 - 26 Décembre 2025
> Classification : Confidentiel

---

## Changelog v1.6

| Section | Type | Changement |
|---------|------|------------|
| 1.1-1.2 | RÉÉCRIT | Problème (4 douleurs chiffrées) + Solution (two-sided marketplace) |
| 1.3-1.7 | RÉÉCRIT | Chiffres réalistes 2026-2028, traction actuelle, TAM combiné |
| 2.5 | NOUVEAU | Stratégie d'acquisition annonceurs |
| 2.6 | NOUVEAU | Marché annonceurs (TAM €1,2M) |
| 2.7 | NOUVEAU | Production vidéo - différenciateur majeur |
| 8.1-8.3 | RÉÉCRIT | Modèle revenus (€50-120/mois), projections réalistes, unit economics |
| 9.1-9.5 | RÉÉCRIT | Bootstrap 2026, Seed conditionnel 2027 |
| 13.7 | ENRICHI | Pricing analytics aligné (€50/€80/€120) |
| 14.0 | NOUVEAU | Offre commerciale analytics club |

**Documents de référence :**
- Executive Summary v2.1 (Décembre 2025)
- NEOPRO_Strategie_Pricing_FINALE_v4.0 (Décembre 2025)

---

## Table des Matières

1. [Executive Summary](#1-executive-summary)
   - 1.1 Le Problème (4 douleurs chiffrées)
   - 1.2 La Solution (Two-sided marketplace)
   - 1.3 Chiffres Clés
   - 1.4 Traction Actuelle
   - 1.5 Stratégie Financement
   - 1.6 Points Forts
   - 1.7 TAM Combiné
2. [Le Produit](#2-le-produit)
   - 2.1-2.4 Vue d'ensemble, composants, fonctionnalités
   - **2.5 Stratégie d'Acquisition Annonceurs** *(nouveau)*
   - **2.6 Marché Annonceurs (TAM)** *(nouveau)*
   - **2.7 Production Vidéo - Différenciateur** *(nouveau)*
3. [Architecture Technique](#3-architecture-technique)
   - 3.5 [Architecture de Synchronisation](#35-architecture-de-synchronisation)
4. [Analyse Technique Actuelle](#4-analyse-technique-actuelle)
5. [Roadmap Phase 1 (0-3 mois)](#5-roadmap-phase-1-0-3-mois)
6. [Roadmap Phase 2 (3-12 mois)](#6-roadmap-phase-2-3-12-mois)
7. [Roadmap Phase 3 (1-3 ans)](#7-roadmap-phase-3-1-3-ans)
8. [Modèle Économique](#8-modèle-économique) *(réécrit)*
   - 8.1 Sources de Revenus (Clubs + Annonceurs)
   - 8.2 Projections Financières
   - 8.3 Unit Economics
9. [Budget & Ressources](#9-budget--ressources) *(réécrit)*
   - 9.1 Stratégie Financement (Bootstrap)
   - 9.2-9.5 Équipes, Infrastructure, Seed conditionnel
10. [KPIs & Métriques](#10-kpis--métriques)
11. [Risques & Mitigations](#11-risques--mitigations)
12. [Processus Opérationnels](#12-processus-opérationnels)
13. [Analytics Sponsors & Annonceurs](#13-analytics-sponsors--annonceurs) *(enrichi)*
14. [Analytics Club](#14-analytics-club) *(enrichi)*
15. [Annexes](#15-annexes)

---

# 1. Executive Summary

## 1.1 Le Problème

Les clubs sportifs amateurs font face à **quatre douleurs majeures** qui impactent leur modèle économique et l'expérience match :

### 📉 1. EXPÉRIENCE MATCH MÉDIOCRE
- Écrans statiques (logo figé, aucun dynamisme pendant 90 min)
- Zéro engagement spectateurs (pas d'interactivité)
- Contenus amateurs (pas de vidéos professionnelles joueurs)
- **Impact** : Spectateurs désengagés, ambiance terne

### 💸 2. SPONSORS PAS VALORISÉS
- Aucune donnée mesurable pour prouver le ROI (0 rapports)
- Négociations renouvellements difficiles sans preuves
- **30-40% churn sponsors annuel** par défaut de valorisation
- **Impact financier** : Club N2 avec 5 sponsors à €3K/an risque perdre €6K-€9K annuels

### 🤯 3. GESTION TECHNIQUE COMPLEXE
- Ordinateur en bord de terrain (câbles, manipulations)
- Bénévoles débordés pendant matchs
- Changements manuels pénibles (buteurs, sponsors)
- **Impact** : Erreurs matchs, bénévoles frustrés

### 📊 4. COMMUNICATION INEFFICACE
- Contenus non professionnels
- Impossible de quantifier l'audience
- Pas de reporting automatique sponsors
- **Impact** : Sponsors mécontents, opportunités perdues

> **Les solutions existantes** sont soit trop chères (€500-2000+), soit trop complexes, soit inadaptées au contexte sportif amateur.

## 1.2 La Solution NEOPRO

**NEOPRO construit le premier réseau publicitaire sportif amateur en France**, alliant affichage dynamique professionnel et marketplace annonceurs.

### 🏀 PLATEFORME DOUBLE-FACE (TWO-SIDED MARKETPLACE)

#### CÔTÉ 1 : LES CLUBS SPORTIFS

**Hardware + Software professionnel tout-en-un :**
- Boîtier intelligent branché sur écran (10 min installation)
- Télécommande smartphone (contrôle pendant match à distance)
- Dashboard cloud (gestion contenus, analytics temps réel)
- Rapports automatiques sponsors (PDF mensuels)

**Fonctionnalités Match :**

| Catégorie | Fonctionnalités |
|-----------|-----------------|
| 📺 **Affichage Dynamique** | Annonces joueurs (vidéos célébrations 5-10s), affichage buteurs temps réel (1 clic smartphone), faits de jeu (cartons, temps-morts), informations supporters |
| 💰 **Valorisation Sponsors** | Diffusion automatique spots (rotation intelligente), analytics précis (passages, impressions, reach), rapports PDF mensuels automatiques, dashboard sponsors premium |
| 🎮 **Engagement Spectateurs** | Jeux-concours QR code (vote meilleur joueur), sondages en direct mi-temps, feed réseaux sociaux sur écran |

**Proposition de valeur clubs :**
- ✅ Expérience match professionnelle (ambiance, dynamisme)
- ✅ Valorisation sponsors mesurable (preuves ROI, renouvellements facilités)
- ✅ Gestion ultra-simple (smartphone, fini PC bord terrain)
- ✅ Revenus passifs annonceurs (€1,800/an)

#### CÔTÉ 2 : LES ANNONCEURS RÉGIONAUX/NATIONAUX

**Réseau publicitaire sportif local (unique en France) :**

| Pour qui ? | Proposition de valeur |
|------------|----------------------|
| Marques régionales (Decathlon, Crédit Mutuel, MAIF) | Accès audience captive : 15,000+ spectateurs/mois |
| Annonceurs locaux audience sportive qualifiée | Diffusion automatisée : 1 contrat = présence tous écrans |
| Sponsors hors stades professionnels | CPM attractif : €8-12 (vs €15-25 digital) |

**Modèle économique annonceurs :**
1. Annonceur paie €250/mois pour diffusion réseau
2. Vidéos passent sur tous clubs partenaires (max 3/club)
3. NEOPRO garde 90% (€225/mois), reverse 10% clubs (€25/mois)
4. Clubs touchent €1,800/an passifs via 6 annonceurs

### 🔄 EFFET RÉSEAU VERTUEUX

```
Plus clubs → Plus audience → CPM attractif → Plus annonceurs
                ↓
    Revenus augmentent → Reverse clubs → Clubs payent moins
```

### 🎯 DIFFÉRENCIATEURS STRATÉGIQUES

| # | Différenciateur | Description |
|---|----------------|-------------|
| 1 | **Solution complète expérience match** | Seul acteur combinant affichage temps réel + engagement spectateurs + analytics sponsors en UNE plateforme |
| 2 | **Seul réseau publicitaire sportif amateur France** | Marché vierge €1,2M TAM |
| 3 | **Modèle triple-win** | Clubs professionnalisent + valorisent + génèrent revenus passifs. Annonceurs accèdent audience qualifiée. NEOPRO scale ARR via deux sources revenus |
| 4 | **Barrière entrée forte** | Effet réseau two-sided, relations clubs, tech propriétaire |
| 5 | **Simplicité opérationnelle** | Plug & play 10min, smartphone 1 clic, rapports auto |

## 1.3 Chiffres Clés

| Métrique | Actuel (Dec 2025) | Fin 2026 | Fin 2027 | Fin 2028 |
|----------|-------------------|----------|----------|----------|
| Clubs actifs | 3 beta | 35 | 100 | 300 |
| Annonceurs | 0 | 6-8 | 15 | 25+ |
| MRR (récurrent) | €0 | €4,400 | €12,875 | €35,000 |
| ARR | €0 | €53K | €154K | €420K |
| Reach spectateurs | ~500/mois | 15,000/mois | 45,000/mois | 135,000/mois |
| Équipe | 2 associés | 2 (bénévoles) | 4 | 8-10 |

## 1.4 Traction Actuelle

| Indicateur | Valeur | Preuve |
|------------|--------|--------|
| **Clubs beta** | 3 (CESSON, NARH, RACC) | Contrats signés |
| **Uptime plateforme** | 98.5% | Monitoring production |
| **Hardware déployé** | €1,050 investis | 3 boîtiers à €350 |
| **Produit** | MVP complet en production | Déployé et fonctionnel |
| **Pipeline commercial** | 15 clubs qualifiés | Démonstrations planifiées Q1 2026 |

## 1.5 Stratégie Financement

| Phase | Modèle | Objectif |
|-------|--------|----------|
| **2026** | Bootstrap (autofinancement) | PMF avec 35 clubs, €53K ARR |
| **2027** | Seed €150K (si scale accéléré) | 100+ clubs, 2 commerciaux |
| **2028** | Profitabilité | €420K ARR, équipe de 8-10 |

> **Philosophie** : Bootstrap jusqu'à profitabilité. Lever uniquement si opportunité scale accéléré.

## 1.6 Points Forts

- ✅ **Produit en production** - MVP déployé, 3 clubs beta, 98.5% uptime
- ✅ **Two-sided marketplace** - Clubs + Annonceurs = 2 sources revenus récurrentes
- ✅ **Coût hardware optimisé** - Boîtier €350 (coût €150, marge 57%)
- ✅ **Stack moderne** - Angular 20, Node.js, PostgreSQL, Socket.IO
- ✅ **Marché vierge** - Aucun réseau publicitaire sportif amateur en France
- ✅ **Analytics différenciateur** - Dashboard club + rapports sponsors automatiques
- ✅ **Production vidéo intégrée** - Shooting + montage, argument commercial massue
- ✅ **230 tests automatisés** - Couverture ~67% backend, CI/CD GitHub Actions

## 1.7 TAM Combiné

| Segment | TAM France | SAM 2026 | SAM 2028 |
|---------|------------|----------|----------|
| **Clubs sportifs** | €5,2M (13,000 clubs × €400/an) | €53K (35 clubs) | €450K (300 clubs) |
| **Annonceurs** | €1,2M (150 annonceurs × €8K/an) | €16K (6 annonceurs) | €80K (25 annonceurs) |
| **TOTAL** | **€6,4M** | **€69K** | **€530K** |

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
| **Analytics Club** | ✅ | Dashboard usage, santé, export CSV (6 déc) |
| **Éditeur config avancé** | ✅ | Historique, diff, timeCategories (8 déc) |
| **CRUD vidéos inline** | ✅ | Ajouter/modifier/supprimer depuis dashboard (8 déc) |
| **Upload fichiers** | ✅ | Multer avec gestion multipart (7 déc) |
| **Toast notifications** | ✅ | Remplace alert() natifs (6 déc) |

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

## 2.5 Stratégie d'Acquisition Annonceurs

> **NEOPRO construit le seul réseau publicitaire sportif amateur en France.** Cette section détaille la stratégie d'acquisition et de gestion des annonceurs.

### 2.5.1 Cibles Annonceurs Prioritaires

#### TIER 1 - ANNONCEURS RÉGIONAUX (Q2-Q3 2026)

| Profil | Exemples | Budget moyen | Objectif 2026 |
|--------|----------|--------------|---------------|
| Enseignes sportives | Decathlon Nantes, Intersport | €250-500/mois | 2-3 |
| Banques régionales | Crédit Mutuel Bretagne, Caisse d'Épargne | €300-600/mois | 1-2 |
| Assurances | MAIF, Groupama | €250-400/mois | 1-2 |

**Total Tier 1 : 3-6 annonceurs en 2026**

#### TIER 2 - ANNONCEURS NATIONAUX (Q4 2026 - 2027)

| Profil | Exemples | Budget moyen | Objectif 2027 |
|--------|----------|--------------|---------------|
| Marques grand public | McDonald's, Orange, Carrefour | €500-1,500/mois | 3-5 |
| Équipementiers | Nike, Adidas, Puma | €800-2,000/mois | 2-3 |

**Total Tier 2 : 10-15 annonceurs en 2027**

#### TIER 3 - ANNONCEURS LOCAUX (2027+)

| Profil | Exemples | Budget moyen | Modèle |
|--------|----------|--------------|--------|
| Commerces proximité | Restaurants, magasins sport | €150-250/mois | Self-service plateforme |
| PME locales | Garages, artisans | €100-200/mois | Self-service |

### 2.5.2 Pipeline & Process de Vente Annonceurs

#### Cycle de vente (45-60 jours)

```
PROSPECTION (J0-J15)
├── Identification décideurs marketing régional
├── Pitch deck annonceurs (cas d'usage, reach, CPM)
└── Premier call découverte besoins

QUALIFICATION (J15-J30)
├── Présentation analytics réseau actuel
├── Simulation reach & impressions sur cible
└── Proposition commerciale personnalisée

NÉGOCIATION (J30-J45)
├── Test gratuit 1 mois (2-3 clubs pilotes)
├── Rapports analytics temps réel
└── Ajustements créatifs vidéos

CLOSING (J45-J60)
├── Contrat annuel reconductible
├── Onboarding : création vidéos, ciblage
└── Lancement diffusion réseau complet
```

#### Métriques de Vente

| Métrique | Valeur |
|----------|--------|
| Taux conversion prospection → client | 15-20% |
| CAC annonceur | €800 |
| LTV annonceur | €8,100 (3 ans × €225/mois) |
| LTV/CAC | **10x** |

### 2.5.3 Arguments Commerciaux Annonceurs

#### vs. Publicité Digitale Classique

| Critère | Digital Display | NEOPRO |
|---------|-----------------|--------|
| **CPM** | €15-25 | €8-12 |
| **Attention** | Faible (ad-block) | Captive (salle) |
| **Ciblage** | Imprécis (cookies) | Hyper-local garanti |
| **Fraude** | Risque élevé (bots) | Zéro (spectateurs) |
| **Brand safety** | Variable | 100% sport amateur |

#### Proposition de Valeur Unique

- *"Sponsorisez le sport amateur de votre région sans gérer 30 contrats"*
- *"1 signature = présence automatique 30+ salles sportives"*
- *"Analytics temps réel par club, région, période"*
- *"Association positive sport/jeunesse/territoire"*

### 2.5.4 Seuils Critiques Réseau

| Seuil | Clubs | Impact |
|-------|-------|--------|
| **SEUIL 1** | 15 clubs | Lancement réseau (reach minimal viable) |
| **SEUIL 2** | 30 clubs | Scale annonceurs régionaux (CPM compétitif) |
| **SEUIL 3** | 100 clubs | Attractivité annonceurs nationaux (couverture géo) |
| **SEUIL 4** | 300 clubs | Pricing premium (quasi-monopole) |

### 2.5.5 Équipe Dédiée Annonceurs

| Phase | Structure | Mission |
|-------|-----------|---------|
| **2026** | Gwenvael double casquette | Clubs + annonceurs (mi-temps chaque) |
| **2027** | +1 Commercial Annonceurs | 6 → 15 annonceurs en 12 mois |
| **2028** | Équipe structurée (3 pers.) | 1 Head + 2 Account Managers régionaux |

## 2.6 Marché Annonceurs (CÔTÉ 2)

### TAM Annonceurs

| Segment | Calcul | TAM ARR |
|---------|--------|---------|
| Publicité locale/régionale France | €3,5 Mds (Kantar) | - |
| Part sport amateur | ~1% | €35M disponible |
| **Annonceurs régionaux** | 50 × €250/mois × 90% × 12 | **€135K** |
| **Annonceurs nationaux** | 100 × €1,000/mois × 90% × 12 | **€1,08M** |
| **TOTAL TAM ANNONCEURS** | | **€1,2M ARR** |

### SAM Annonceurs par Année

| Année | Annonceurs | SAM ARR |
|-------|------------|---------|
| **2026** (Bretagne + Pays de Loire) | 6 régionaux | €16K |
| **2027** (+3 régions) | 15 (dont 3 nationaux) | €40K |
| **2028** (couverture nationale) | 25+ | €80K |

### TAM Combiné NEOPRO

| Segment | TAM ARR | SAM 2026 | SAM 2027 | SAM 2028 |
|---------|---------|----------|----------|----------|
| **Clubs** | €5,2M | €53K | €154K | €450K |
| **Annonceurs** | €1,2M | €16K | €40K | €80K |
| **TOTAL** | **€6,4M** | **€69K** | **€194K** | **€530K** |

### Stratégie Go-To-Market

| Phase | Focus | Actions |
|-------|-------|---------|
| **Phase 1 (2026)** | Clubs d'abord | Build réseau, annonceurs dès seuil 15 clubs |
| **Phase 2 (2027)** | Scale annonceurs | Expansion géo + annonceurs régionaux |
| **Phase 3 (2028)** | Pricing premium | Couverture nationale + annonceurs nationaux |

## 2.7 Production Vidéo - Différenciateur Majeur

> **La production vidéo professionnelle est un PILIER de l'offre NEOPRO**, pas une option secondaire.

### 2.7.1 Pourquoi c'est Critique

#### Problème Club

- Clubs veulent célébrations joueurs personnalisées (buts, entrées)
- Mais n'ont pas : équipement vidéo pro, compétences montage, temps

#### Solution NEOPRO

- Shooting terrain inclus dans offres Silver/Gold
- Production vidéos célébrations (5-10s par joueur)
- Photos équipe complète fournies (utilisables communication)
- Montage professionnel avec motion design

#### Impact Commercial

- Clubs ADORENT voir leurs joueurs sur écran géant
- Ambiance salle décuplée lors des buts
- **Argument massue** : *"Vos joueurs comme des pros"*

### 2.7.2 Offres Production Vidéo

#### Équipe Principale

| Pack | Prix | Contenu | Marge |
|------|------|---------|-------|
| **Bronze** | €800 | 10 vidéos 30s (contenu club fourni), motion design basique, 1 révision, livraison 7 jours | 56% |
| **Silver** ⭐ | €1,500 | Shooting 1h30 + 1 vidéo présentation + 10 vidéos 30s, motion design pro, 2 révisions, livraison 5 jours | 32% |
| **Gold** | €2,000 | Shooting 2h + 1 vidéo 60s + 15 vidéos (10×30s + 5×60s), interviews, révisions illimitées, livraison 3 jours | 30% |

#### Équipes Supplémentaires

| Option | Prix | Condition | Marge |
|--------|------|-----------|-------|
| **Équipe supp (montage seul)** | €500 | Assets shooting principal | 30% |
| **Équipe supp (avec shooting)** | €1,200 | Shooting séparé | 15% |

#### Packs Multi-Équipes (économies d'échelle)

| Pack | Prix | Contenu | Économie |
|------|------|---------|----------|
| **2 Équipes** | €2,500 | 1 shooting 2h, 20 vidéos | €500 vs 2×Silver |
| **3 Équipes** | €3,500 | 1 shooting 3h, 30 vidéos | €1,000 vs 3×Silver |
| **4 Équipes** | €4,200 | 1 shooting 4h, 40 vidéos | €1,800 vs 4×Silver |

### 2.7.3 Service Média Day

| Service | Prix | Contenu | Marge |
|---------|------|---------|-------|
| **Média Day Multi-Équipes** | €2,500/journée | Shooting 1 journée (4-6 équipes), 50+ photos HD/équipe, 1 vidéo présentation/équipe | 44% |

**Disponibilité** : Q3 2026

**Pour qui** : Clubs nombreuses équipes voulant standardiser et économiser production

### 2.7.4 Différenciation Concurrence

| Concurrent | Prix | Qualité | Intégration |
|------------|------|---------|-------------|
| Agences vidéo | €2,000-5,000 | Pro | Aucune |
| Freelances | €500-1,500 | Variable | Aucune |
| Bénévoles club | Gratuit | Amateur | Manuelle |
| **NEOPRO** | €800-2,000 | Pro | **Automatique** |

#### Avantages NEOPRO

- ✅ Intégré dans plateforme (vidéos uploadées automatiquement)
- ✅ Prix compétitifs packs multi-équipes
- ✅ Motion design standardisé pro (cohérence visuelle)
- ✅ Livraison rapide (3-7 jours vs 2-3 semaines agences)
- ✅ Photos incluses (utilisables communication club)

### 2.7.5 Prévisions 2026

| Métrique | Valeur |
|----------|--------|
| Taux adoption vidéo | 53% (16 clubs sur 30) |
| Mix packs | 50% Bronze, 35% Silver, 15% Gold |
| Revenus vidéo 2026 | ~€12,800 (amorti mensuel €1,066) |

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

## 3.5 Architecture de Synchronisation

> **Documentation complète** : Voir [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)

### Modèle de Contenu

Le système distingue deux types de contenu avec des règles de synchronisation différentes :

| Type | Propriétaire | Modifiable par Club | Direction Sync |
|------|--------------|---------------------|----------------|
| **Contenu NEOPRO** | NEOPRO Central | Non (verrouillé) | Central → Local |
| **Contenu Club** | Club local | Oui | Local → Central (miroir) |

### Cas d'Usage

**Annonceurs Nationaux** : NEOPRO déploie des vidéos partenaires (ex: Décathlon) vers tous les clubs. Ces vidéos apparaissent dans une catégorie verrouillée "ANNONCES NEOPRO" que l'opérateur club ne peut pas modifier ou supprimer.

**Contenu Local** : L'opérateur club (Jean) peut ajouter ses propres vidéos (hommages, annonces speaker) via l'Admin UI locale. Ces modifications sont préservées lors des synchronisations avec le central.

### Règles de Merge

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVEUR CENTRAL                          │
│  • Contenu NEOPRO (verrouillé) → PUSH vers les clubs       │
│  • Miroir config clubs (lecture seule) ← PULL des clubs    │
└─────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
┌───────────────────────┐    ┌───────────────────────┐
│ ANNONCES NEOPRO       │    │ CONTENU CLUB          │
│ 🔒 Lecture seule      │    │ ✏️ Modifiable         │
│ Catégorie verrouillée │    │ Préservé au merge     │
└───────────────────────┘    └───────────────────────┘
```

**Principe clé** : Les modifications locales du club sont TOUJOURS préservées lors d'une synchronisation. Le contenu NEOPRO est ajouté/mis à jour sans écraser le contenu club.

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

### 4.2.1 Tests Automatisés ✅ RÉSOLU (8 déc 2025)

```
Situation actuelle:
├── Tests unitaires: 224 tests
├── Tests intégration: Controllers testés via mocks
├── Tests E2E: 0 (non prioritaire)
├── Couverture globale: ~67%
├── Couverture controllers: ~94%
└── Impact: Base solide pour éviter les régressions
```

**Détail couverture par fichier :**

| Fichier | Tests | Couverture |
|---------|-------|------------|
| auth.controller.ts | 14 | 100% |
| auth.ts (middleware) | 13 | 97% |
| validation.ts | 25 | 100% |
| sites.controller.ts | 35 | 91% |
| groups.controller.ts | 21 | 90% |
| content.controller.ts | 25 | 93% |
| updates.controller.ts | 28 | 100% |
| analytics.controller.ts | 40 | 93% |
| config-history.controller.ts | 24 | 100% |

**Non couvert (volontairement) :**
- Routes (0%) - Simple câblage, pas de logique métier
- Services socket/deployment (0%) - WebSocket complexe, tests d'intégration nécessaires
- Config database/logger (0%) - Mockés dans les tests

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
| ~~Token localStorage~~ | `central-server/src/controllers/auth.controller.ts` | ~~🟠 HAUTE~~ | ✅ CORRIGÉ - HttpOnly cookies implémentés |
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
| Fonctionnalité | **9/10** | Produit complet avec analytics, éditeur config, CRUD vidéos |
| Qualité code | **7/10** | 230 tests, 67% couverture, 94% sur controllers |
| Sécurité | **8/10** | HttpOnly cookies, JWT sécurisé, headers Helmet |
| Scalabilité | 6/10 | Architecture OK, infra à renforcer (Redis) |
| Maintenabilité | **8/10** | Doc complète, tests solides, CI/CD opérationnel |
| **GLOBAL** | **7.6/10** | **Produit fonctionnel complet, dette technique largement résorbée** |

> **Mise à jour 8 décembre 2025 (v1.5) :**
> - Note sécurité augmentée (7→8) : HttpOnly cookies implémentés pour JWT
> - Note globale augmentée (7.4→7.6)
>
> **Mise à jour 8 décembre 2025 (v1.4) :**
> - Note qualité code augmentée (5→7) : 224 tests unitaires ajoutés avec 67% couverture globale
> - Note maintenabilité augmentée (5→8) : Base de tests solide + CI/CD GitHub Actions opérationnel
> - Note globale augmentée (6.4→7.4)

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

### Semaine 2 : Tests Backend ✅ FAIT (8 déc 2025)

| Jour | Tâche | Livrable | Statut |
|------|-------|----------|--------|
| 1 | Config Jest central-server | jest.config.js fonctionnel | ✅ |
| 2-3 | Tests AuthController | 100% couverture auth | ✅ |
| 4 | Tests SitesController | 91% couverture sites | ✅ |
| 5 | Tests ContentController | 93% couverture content | ✅ |

**Structure tests implémentée :**
```
central-server/src/
├── controllers/
│   ├── auth.controller.ts
│   ├── auth.controller.test.ts       ✅ 14 tests
│   ├── sites.controller.test.ts      ✅ 35 tests
│   ├── groups.controller.test.ts     ✅ 21 tests
│   ├── content.controller.test.ts    ✅ 25 tests
│   ├── updates.controller.test.ts    ✅ 28 tests
│   ├── analytics.controller.test.ts  ✅ 40 tests
│   └── config-history.controller.test.ts ✅ 24 tests
├── middleware/
│   ├── auth.ts
│   ├── auth.test.ts                  ✅ 13 tests
│   └── validation.test.ts            ✅ 25 tests
├── config/__mocks__/
│   ├── database.ts                   ✅ Mock DB
│   ├── logger.ts                     ✅ Mock Logger
│   └── supabase.ts                   ✅ Mock Supabase
└── __tests__/
    └── setup.ts                      ✅ Config Jest
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
| ~~1-2~~ | ~~Migrer JWT vers HttpOnly cookies~~ | ✅ FAIT - 8 déc 2025 |
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

| Livrable | Critère d'acceptation | Statut |
|----------|----------------------|--------|
| Pipeline CI/CD | Build + test sur chaque PR | ✅ GitHub Actions |
| Couverture tests | > 60% backend, > 40% frontend | ✅ 67% backend |
| Sécurité | 0 vulnérabilité OWASP critical/high | ✅ 4/5 corrigées |
| Monitoring | Logs centralisés + alertes Slack | ⏳ À faire |
| Documentation | OpenAPI + CONTRIBUTING + SECURITY | ⏳ À faire |
| Produit | 20 clubs pilotes avec NPS > 40 | ⏳ En cours |

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

> **NEOPRO génère des revenus via DEUX SOURCES RÉCURRENTES** : Abonnements Clubs (SaaS sportif) et Réseau Annonceurs (Marketplace).

## 8.1 Sources de Revenus

### 8.1.1 STREAM 1 : Abonnements Clubs (SaaS sportif)

#### Hardware (paiement unique An 1)

| Produit | Prix | Coût | Marge |
|---------|------|------|-------|
| **Boîtier principal** | €350 | €150 | 57% |
| **Boîtier supplémentaire** (2ème salle) | €250 | €100 | 60% |
| **Écran 81" professionnel** | €1,500 | €1,100 | 27% |

#### Abonnements Mensuels (3 paliers)

| Palier | Prix/mois | Hardware An 1 | Total An 1 | Marge nette |
|--------|-----------|---------------|------------|-------------|
| **Autonome** | €50/mois | €350 | €950 | 80% |
| **Professionnel** | €80/mois | €350 | €1,310 | 82% |
| **Premium** | €120/mois | €350 | €1,790 | 78% |

#### Détail des Paliers

**AUTONOME (€50/mois) :**
- ✅ Boîtier pré-configuré
- ✅ Application TV full-screen
- ✅ Télécommande smartphone
- ✅ Plateforme cloud sync auto
- ✅ Support email 48h
- ✅ Documentation complète
- ✅ Mises à jour OTA automatiques

**PROFESSIONNEL (€80/mois) = Tout Autonome + :**
- ✅ Dashboard Analytics Club Premium
  - Analytics avancés (heatmaps, engagement, trends)
  - Rapports PDF club mensuels
  - Export CSV données
  - Comparaison vs autres clubs (benchmarking)
  - Alertes automatiques
- ✅ Support prioritaire 24h

**PREMIUM (€120/mois) = Tout Professionnel + :**
- ✅ Dashboard Sponsors Premium
  - Dashboard sponsors temps réel
  - Rapports PDF sponsors mensuels
  - Certificat digital impressions
  - Accès sponsors au portail
- ✅ Pack Expérience Fan
  - Jeux-concours QR code
  - Sondages en direct
  - Feed réseaux sociaux sur écran
  - Module "Fan du match"
- ✅ Support hotline 4h

#### Upsells Haute Marge

| Catégorie | Produit | Prix | Marge |
|-----------|---------|------|-------|
| **Production Vidéo** | Bronze (10 vidéos, contenu club) | €800 | 56% |
| | Silver (shooting 1h30 + 10 vidéos) | €1,500 | 32% |
| | Gold (shooting 2h + 15 vidéos) | €2,000 | 30% |
| | Équipe supp montage seul | €500 | 30% |
| | Équipe supp avec shooting | €1,200 | 15% |
| | Pack 2 équipes | €2,500 | 31% |
| | Pack 3 équipes | €3,500 | 31% |
| | Pack 4 équipes | €4,200 | 26% |
| **Analytics** | Analytics Club Premium | €200/an | 75% |
| | Pack Sponsors Premium | €250/an | 80% |
| | Bundle Analytics+Sponsors | €400/an | 75% |
| **Engagement** | Pack Expérience Fan | €300/an | 67% |
| **Branding** | White-Label Sponsor | €1,500/an | 87% |
| **Services** | Média Day multi-équipes | €2,500/jour | 44% |
| | Location écran événements | Commission 20% | - |

**Pénétration prévue 2026 :**
- Mix paliers : 60% Autonome / 33% Pro / 7% Premium
- Taux adoption vidéo : 53% (16 clubs sur 30)
- Taux adoption analytics : 60% (18 clubs sur 30)

### 8.1.2 STREAM 2 : Réseau Annonceurs (Marketplace)

#### Modèle Économique Annonceurs

| Élément | Valeur |
|---------|--------|
| **Prix annonceur** | €250/mois |
| **Commission NEOPRO** | 90% (€225/mois par annonceur) |
| **Reverse club** | 10% (€25/mois par annonceur) |
| **Limite par club** | 3 annonceurs maximum |
| **Revenus club passifs** | €1,800/an (6 annonceurs × €25 × 12) |

#### Economics Annonceurs

- CPM facturé : €10 (moyenne spectateurs handball/basket)
- Reach estimé 30 clubs : 15,000 spectateurs/mois
- Budget annonceur €250/mois = 25,000 impressions garanties
- Scalabilité : Marge pure 90% (coûts variables ~€0)

#### Attractivité pour les Clubs

**Coût net NEOPRO avec annonceurs :**
```
€950/an (abonnement Autonome) - €1,800/an (revenus annonceurs) = -€850/an
```

> **Résultat** : Le club GAGNE de l'argent en utilisant NEOPRO !
>
> Revenus annonceurs couvrent **190% du coût abonnement**.
>
> **Argument commercial massue** : *"NEOPRO vous paie pour l'utiliser"*

### 8.1.3 Mix Revenus Projeté 2026

| Source | Revenus/mois (Q4) | % total | Marge |
|--------|-------------------|---------|-------|
| Abonnements clubs | €1,840 | 37% | 92% |
| Upsells (vidéo+analytics) | €1,208 | 25% | 65% |
| **RÉSEAU ANNONCEURS** | €1,350 | 28% | 90% |
| Hardware An 1 (amorti) | €500 | 10% | 57% |
| **TOTAL** | **€4,898** | 100% | 89% |

**ARR récurrent (hors hardware)** : €4,398/mois × 12 = **€52,776**

### 8.1.4 Projection 2027

Avec 100 clubs + 15 annonceurs :
- Abonnements clubs : €6,000/mois
- Upsells : €3,500/mois
- Annonceurs : €3,375/mois (15 × €250 × 90%)
- **TOTAL : €12,875/mois = €154K ARR**

> **Point clé** : Les annonceurs deviennent la SOURCE REVENUS #1 à partir de 2027 (scale plus rapide que clubs).

## 8.2 Projections Financières

### Objectif Fin 2026 : 30 clubs payants + 6 annonceurs

| Trimestre | Clubs | Annonceurs | Revenus/mois | Marge |
|-----------|-------|------------|--------------|-------|
| **Q1 2026** | 10 | 0 | €600 | €184 |
| **Q2 2026** | 22 | 3 | €2,075 | €1,619 |
| **Q3 2026** | 30 | 5 | €4,325 | €3,842 |
| **Q4 2026** | 35 | 6-8 | €4,898 | €4,398 |

**Détail revenus Q4 2026 :**
- Abonnements base : €1,840/mois
- Upsells vidéo (amortis) : €866/mois
- Upsells analytics (amortis) : €342/mois
- Réseau annonceurs : €1,350/mois (6 × €225)
- Hardware An 1 (amorti) : €500/mois

**ARR Fin 2026 : €53K** (~€4,400/mois récurrent hors hardware)

### Charges Mensuelles

| Type | Montant | Détail |
|------|---------|--------|
| **Fixes** | €383/mois | Hosting €50 + Adobe €83 + dev externe €250 |
| **Variables** | €3,33/club/mois | Hosting uniquement |
| **Support** | €0 | 2 associés bénévoles temps partiel |

**Résultat net projeté 2026 : €25K cash cumulé**

### Analyse de Sensibilité

| Clubs | Base | Upsells | Annonceurs | Total | Objectif |
|-------|------|---------|------------|-------|----------|
| 15 | €920 | €604 | €675 | €2,199 | ❌ -€1,8K |
| 20 | €1,227 | €806 | €900 | €2,933 | ❌ -€1,1K |
| 25 | €1,533 | €1,007 | €1,125 | €3,665 | ❌ -€335 |
| **30** | €1,840 | €1,208 | €1,350 | **€4,398** | ✅ +€398 |
| 35 | €2,147 | €1,410 | €1,575 | €5,132 | ✅ +€1,1K |

> **Conclusion** : Minimum **25-30 clubs** nécessaires pour valider objectif €4,000/mois.

### Roadmap Stratégique 2026-2028

| Phase | Clubs | Annonceurs | ARR | Focus |
|-------|-------|------------|-----|-------|
| **2026 - PMF** | 35 | 6-8 | €53K | Reach 15,000+ spectateurs/mois |
| **2027 - Scale** | 100 | 15 (dont 3 nationaux) | €154K | Expansion Nouvelle-Aquitaine + Hauts-de-France, +2 commerciaux |
| **2028 - Dominance** | 300 | 25+ | €420K | CPM premium €12-15, équipe annonceurs 1 Head + 2 AM |

## 8.3 Unit Economics

### Côté Clubs

| Métrique | Valeur |
|----------|--------|
| **CAC** | €150 (démos gratuites + warm intros) |
| **LTV** | €3,600 (3 ans × €100/mois moyen) |
| **LTV/CAC** | **24x** |
| **Payback** | 2 mois |

### Côté Annonceurs

| Métrique | Valeur |
|----------|--------|
| **CAC** | €800 (prospection B2B, négociations) |
| **LTV** | €8,100 (3 ans × €225/mois × 90%) |
| **LTV/CAC** | **10x** |
| **Payback** | 4 mois |
| **Churn attendu** | <10% annuel |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UNIT ECONOMICS v2                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CLUBS                                 ANNONCEURS                          │
│   ┌─────────────────┐                   ┌─────────────────┐                │
│   │ CAC = €150      │                   │ CAC = €800      │                │
│   │ LTV = €3,600    │                   │ LTV = €8,100    │                │
│   │ LTV/CAC = 24x   │                   │ LTV/CAC = 10x   │                │
│   │ Payback = 2 mois│                   │ Payback = 4 mois│                │
│   │ Churn = 5%/an   │                   │ Churn = 10%/an  │                │
│   └─────────────────┘                   └─────────────────┘                │
│                                                                             │
│   MARGE GLOBALE = 89% (Q4 2026)                                            │
│                                                                             │
│   TWO-SIDED NETWORK EFFECTS                                                │
│   • Plus de clubs → Plus d'audience → Plus d'annonceurs                   │
│   • Plus d'annonceurs → Revenus passifs clubs → CAC clubs réduit          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 9. Budget & Ressources

> **Philosophie : Bootstrap jusqu'à profitabilité.** Lever uniquement si opportunité de scale accéléré.

## 9.1 Stratégie Financement

### Besoin Immédiat : €0 (Bootstrap)

| Phase | Modèle | Investissement externe | Focus |
|-------|--------|------------------------|-------|
| **2026** | Autofinancement | €0 | PMF avec 35 clubs, €53K ARR |
| **2027** | Seed conditionnel | €150K (si scale accéléré) | 100+ clubs, expansion géo |
| **2028** | Profitabilité | €0 | €420K ARR, équipe de 8-10 |

### Phase Actuelle : Pre-seed Autofinancée

| Élément | Montant | Statut |
|---------|---------|--------|
| Hardware beta clubs | €1,050 investis | ✅ Fait (3 × €350) |
| Développement produit | Finalisé | ✅ MVP en production |
| Stratégie commerciale | Validée | ✅ Exécution janvier 2026 |

## 9.2 Équipe Phase 1 (Q1-Q4 2026) : Bootstrap

### Structure Actuelle

| Rôle | Personne | Temps | Coût |
|------|----------|-------|------|
| **Commercial & Ops** | Gwenvael | Mi-temps (20h/sem) | €0 (bénévole) |
| **Production vidéo** | Associé 2 | Temps partiel | €0 (bénévole) |

**Coût RH total Phase 1 : €0**

> **Modèle Lean** : 2 associés suffisent jusqu'à €50K ARR.
> Recrutement commercial junior uniquement si dépassement objectif Q4 2026.

### Utilisation Cash 2026

| Poste | Montant | Détail |
|-------|---------|--------|
| **Hardware nouveaux clients** | €10,500 | 30 clubs × €350 |
| **Marketing/prospection** | €0 | Warm intros + ligues (gratuit) |
| **Opérations** | Autofinancés | Revenus récurrents couvrent |

### Projection Trésorerie 2026

| Période | Cash flow | Cumul |
|---------|-----------|-------|
| **Jan-Mar 2026** | Négatif | Achats hardware upfront |
| **Avr-Juin 2026** | Break-even | Revenus = charges |
| **Juil-Déc 2026** | Positif €3-4K/mois | Accumulation cash |

**Résultat net 2026 : +€25K cash**

## 9.3 Équipe Phase 2 (2027) : Post-Seed Conditionnel

### Déclencheur Seed

| Condition | Valeur | Statut |
|-----------|--------|--------|
| ARR atteint | > €80K | À valider Q4 2026 |
| Pipeline annonceurs | > 10 qualifiés | À valider |
| Opportunité scale | Demande > capacité | À évaluer |

### Si Seed €150K levé (2027)

| Poste | Profil | Coût annuel |
|-------|--------|-------------|
| **Commercial Clubs** | Junior, terrain | €35K |
| **Commercial Annonceurs** | Expérience vente média | €45K |
| **Sous-total RH** | | **€80K** |
| Infrastructure | Scale | €15K |
| Marketing | Events, collaterals | €20K |
| Buffer | 20% | €35K |
| **Total** | | **€150K** |

### Objectif Post-Seed (Fin 2027)

| Métrique | Objectif |
|----------|----------|
| Clubs | 150 |
| Annonceurs | 12-15 |
| ARR | €200K |
| Équipe | 4 personnes |

## 9.4 Coûts Infrastructure (Bootstrap)

### Charges Fixes Mensuelles (2026)

| Service | Usage | Coût/mois |
|---------|-------|-----------|
| **Render.com** | Hosting serveur central | €50 |
| **Adobe Creative Cloud** | Production vidéo | €83 |
| **Développement externe** | Maintenance ponctuelle | €250 |
| **Total fixes** | | **€383/mois** |

### Charges Variables

| Élément | Coût unitaire | Échelle |
|---------|---------------|---------|
| Hosting par club | €3,33/club/mois | Linéaire |
| Bande passante vidéos | ~€0,10/Go | Négligeable |

### Projection Infrastructure 2026

| Trimestre | Clubs | Coût infra | % revenus |
|-----------|-------|------------|-----------|
| Q1 | 10 | €416 | 69% |
| Q2 | 22 | €456 | 22% |
| Q3 | 30 | €483 | 11% |
| Q4 | 35 | €500 | 10% |

> **Conclusion** : Infrastructure très scalable, coûts négligeables à scale.

## 9.5 Fundraising Futur (Conditionnel)

### Seed €150K (2027) - Si Scale Accéléré

| Élément | Valeur |
|---------|--------|
| **Montant** | €150K |
| **Valorisation pre-money** | €500K (indicatif) |
| **Dilution** | <20% |
| **Utilisation** | 2 commerciaux + expansion géo |
| **Objectif post-seed** | 150 clubs, €200K ARR fin 2027 |

### Critères Go/No-Go

| Critère | Seuil | Poids |
|---------|-------|-------|
| ARR Q4 2026 | > €80K | 30% |
| Pipeline qualifié | > 50 clubs | 25% |
| Demande annonceurs | > 10 intéressés | 25% |
| Capacité exécution | Saturée | 20% |

> **Philosophie** : Ne lever que si l'opportunité l'exige.
> Bootstrap = contrôle total + valorisation maximale future.

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

# 13. Analytics Sponsors & Annonceurs

> **Objectif : Fournir aux clubs et sponsors des données mesurables sur l'exposition des partenaires**

Cette fonctionnalité représente un **différenciateur majeur** face à la concurrence et permet de justifier la valeur des partenariats avec des données concrètes.

## 13.1 Vue d'Ensemble

### Problématique Actuelle

Les clubs sportifs amateurs peinent à :
- **Justifier leurs tarifs sponsors** auprès des partenaires
- **Renouveler les contrats** sans données de performance
- **Attirer de nouveaux sponsors** sans preuves d'exposition
- **Valoriser leur audience** lors des événements

### Solution NEOPRO Analytics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUX MÉTRIQUES SPONSORS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

BOÎTIER RASPBERRY PI                         SERVEUR CENTRAL
┌─────────────────────┐                      ┌─────────────────────────────┐
│                     │                      │                             │
│  Video Player       │                      │  Tables PostgreSQL          │
│  ├── onPlay()  ────────────────────────────►  sponsor_impressions       │
│  │   {videoId,      │   Batch toutes      │  ├── site_id                │
│  │    timestamp,    │   les 5 min         │  ├── video_id               │
│  │    duration,     │                      │  ├── played_at              │
│  │    context}      │                      │  ├── duration_played        │
│  │                  │                      │  ├── completed (bool)       │
│  ├── onComplete() ──────────────────────────► ├── event_type            │
│  │                  │                      │  ├── period                 │
│  └── onInterrupt()──────────────────────────► └── audience_estimate     │
│                     │                      │                             │
│  Local Buffer       │                      │  sponsor_analytics (agrégé) │
│  └── SQLite/JSON    │                      │  ├── daily_impressions      │
│      (offline mode) │                      │  ├── total_duration         │
│                     │                      │  └── avg_completion_rate    │
└─────────────────────┘                      └─────────────────────────────┘
```

## 13.2 Données Collectées

### Métriques de Diffusion (par vidéo sponsor)

| Métrique | Description | Usage |
|----------|-------------|-------|
| **Impressions** | Nombre total d'affichages | Volume d'exposition |
| **Durée totale** | Temps cumulé à l'écran | Valeur temps d'antenne |
| **Taux de complétion** | % vidéos vues entièrement | Qualité de l'exposition |
| **Position boucle** | Rang dans la rotation | Optimisation placement |
| **Horodatage** | Date/heure précise | Analyse temporelle |

### Métriques de Contexte

| Métrique | Description | Usage |
|----------|-------------|-------|
| **Type d'événement** | Match, entraînement, tournoi | Valorisation contexte |
| **Période** | Avant-match, mi-temps, après-match | Pics d'audience |
| **Sport** | Handball, volley, basket, etc. | Ciblage sponsors |
| **Déclenchement** | Auto vs manuel | Engagement opérateur |

### Métriques d'Audience (optionnel)

| Métrique | Source | Précision |
|----------|--------|-----------|
| **Estimation manuelle** | Saisie opérateur | Approximative |
| **Capteur présence** | Hardware additionnel | Moyenne |
| **Intégration billetterie** | API externe | Précise |

## 13.3 Architecture Technique

### Schéma Base de Données

```sql
-- Table des impressions sponsors (granulaire)
CREATE TABLE sponsor_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    video_id UUID REFERENCES videos(id),

    -- Données de diffusion
    played_at TIMESTAMP NOT NULL,
    duration_played INTEGER NOT NULL,  -- secondes
    video_duration INTEGER NOT NULL,   -- durée totale vidéo
    completed BOOLEAN DEFAULT false,
    interrupted_at INTEGER,            -- seconde d'interruption

    -- Contexte
    event_type VARCHAR(50),            -- match, training, tournament, other
    period VARCHAR(50),                -- pre_match, halftime, post_match, loop
    trigger_type VARCHAR(20),          -- auto, manual
    position_in_loop INTEGER,

    -- Audience (optionnel)
    audience_estimate INTEGER,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour requêtes analytics
CREATE INDEX idx_impressions_video ON sponsor_impressions(video_id, played_at);
CREATE INDEX idx_impressions_site ON sponsor_impressions(site_id, played_at);
CREATE INDEX idx_impressions_date ON sponsor_impressions(played_at);

-- Table agrégée (calculée quotidiennement via cron)
CREATE TABLE sponsor_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id),
    site_id UUID REFERENCES sites(id),
    date DATE NOT NULL,

    -- Métriques agrégées
    total_impressions INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    completed_plays INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2),
    unique_events INTEGER DEFAULT 0,

    -- Par période
    pre_match_plays INTEGER DEFAULT 0,
    match_plays INTEGER DEFAULT 0,
    post_match_plays INTEGER DEFAULT 0,

    -- Audience
    total_audience_estimate INTEGER DEFAULT 0,

    UNIQUE(video_id, site_id, date)
);

-- Vue pour rapports sponsors
CREATE VIEW sponsor_reports AS
SELECT
    v.name as video_name,
    v.id as video_id,
    COUNT(*) as total_impressions,
    SUM(si.duration_played) as total_screen_time_seconds,
    ROUND(AVG(CASE WHEN si.completed THEN 100 ELSE
        (si.duration_played::float / si.video_duration * 100) END), 1) as avg_completion_pct,
    COUNT(DISTINCT si.site_id) as unique_sites,
    COUNT(DISTINCT DATE(si.played_at)) as active_days,
    SUM(si.audience_estimate) as estimated_reach
FROM sponsor_impressions si
JOIN videos v ON v.id = si.video_id
GROUP BY v.id, v.name;
```

### Collecte Côté Boîtier

```typescript
// raspberry/webapp/src/app/services/sponsor-analytics.service.ts

interface SponsorImpression {
  videoId: string;
  playedAt: Date;
  durationPlayed: number;
  videoDuration: number;
  completed: boolean;
  interruptedAt?: number;
  eventType?: 'match' | 'training' | 'tournament' | 'other';
  period?: 'pre_match' | 'halftime' | 'post_match' | 'loop';
  triggerType: 'auto' | 'manual';
  positionInLoop?: number;
  audienceEstimate?: number;
}

class SponsorAnalyticsService {
  private buffer: SponsorImpression[] = [];
  private readonly BATCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Envoi batch périodique
    setInterval(() => this.flushBuffer(), this.BATCH_INTERVAL);

    // Sauvegarde locale en cas de perte connexion
    window.addEventListener('beforeunload', () => this.saveToLocalStorage());
  }

  trackImpression(impression: SponsorImpression): void {
    this.buffer.push(impression);

    // Flush immédiat si buffer trop grand
    if (this.buffer.length >= 50) {
      this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const impressions = [...this.buffer];
    this.buffer = [];

    try {
      await this.syncAgent.sendImpressions(impressions);
    } catch (error) {
      // Remettre dans le buffer et sauvegarder localement
      this.buffer = [...impressions, ...this.buffer];
      this.saveToLocalStorage();
    }
  }
}
```

### API Endpoints

```typescript
// GET /api/v1/analytics/sponsors/:sponsorId
// Récupérer les analytics d'un sponsor

// Response
{
  "period": "2025-01-01/2025-01-31",
  "summary": {
    "total_impressions": 1247,
    "total_screen_time": "18h 32min",
    "total_screen_time_seconds": 66720,
    "avg_daily_impressions": 40.2,
    "completion_rate": 94.3,
    "estimated_reach": 15600,
    "active_sites": 23,
    "active_days": 31
  },
  "by_video": [
    {
      "video_id": "uuid-1",
      "name": "Sponsor A - 15s",
      "impressions": 823,
      "screen_time_seconds": 12345,
      "completion_rate": 96.1
    },
    {
      "video_id": "uuid-2",
      "name": "Sponsor A - 30s",
      "impressions": 424,
      "screen_time_seconds": 12720,
      "completion_rate": 91.8
    }
  ],
  "by_site": [
    {
      "site_id": "uuid",
      "site_name": "Cesson Handball",
      "impressions": 312,
      "screen_time_seconds": 4680
    }
  ],
  "by_period": {
    "pre_match": 412,
    "halftime": 298,
    "post_match": 537
  },
  "by_event_type": {
    "match": 892,
    "training": 245,
    "tournament": 110
  },
  "trends": {
    "daily": [
      {"date": "2025-01-01", "impressions": 42, "screen_time": 630},
      {"date": "2025-01-02", "impressions": 38, "screen_time": 570}
    ],
    "weekly": [
      {"week": "2025-W01", "impressions": 285, "screen_time": 4275}
    ]
  }
}

// GET /api/v1/analytics/sponsors/:sponsorId/report/pdf
// Génère un rapport PDF téléchargeable

// GET /api/v1/analytics/sponsors/:sponsorId/export
// Export CSV des données brutes
// Query params: ?format=csv&from=2025-01-01&to=2025-01-31

// POST /api/v1/analytics/impressions
// Réception batch impressions depuis les boîtiers
// Body: { impressions: SponsorImpression[] }
```

## 13.4 Dashboard Sponsor

### Interface Utilisateur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NEOPRO - Rapport Sponsor : DÉCATHLON CESSON                    Jan 2025   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │   IMPRESSIONS    │ │  TEMPS D'ÉCRAN   │ │  AUDIENCE EST.   │            │
│  │      1,247       │ │    18h 32min     │ │     15,600       │            │
│  │    ▲ +12% vs M-1 │ │   ▲ +8% vs M-1   │ │   ▲ +15% vs M-1  │            │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘            │
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │  TAUX COMPLÉTION │ │  SITES ACTIFS    │ │  JOURS ACTIFS    │            │
│  │      94.3%       │ │       23         │ │       31         │            │
│  │    ▲ +2% vs M-1  │ │   ▲ +3 vs M-1    │ │   = vs M-1       │            │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  IMPRESSIONS PAR JOUR                                               │   │
│  │  60│      ╭─╮                                                       │   │
│  │  40│  ╭───╯ ╰──╮    ╭──╮    ╭──╮       ╭──╮                        │   │
│  │  20│──╯        ╰────╯  ╰────╯  ╰───────╯  ╰──                      │   │
│  │   0└────────────────────────────────────────────                    │   │
│  │     1   5    10   15   20   25   30                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │  PAR PÉRIODE            │  │  TOP SITES                              │  │
│  │                         │  │                                         │  │
│  │  ████████░░ Avant-match │  │  1. Cesson Handball      312 imp.      │  │
│  │  ██████░░░░ Mi-temps    │  │  2. Rennes Volley        287 imp.      │  │
│  │  ██████████ Après-match │  │  3. Betton Basket        198 imp.      │  │
│  │                         │  │  4. Bruz Football        156 imp.      │  │
│  └─────────────────────────┘  └─────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DÉTAIL VIDÉOS                                                      │   │
│  │  ┌────────────────────┬──────────┬──────────┬──────────┬─────────┐  │   │
│  │  │ Vidéo              │ Impress. │ Durée    │ Complet. │ Reach   │  │   │
│  │  ├────────────────────┼──────────┼──────────┼──────────┼─────────┤  │   │
│  │  │ Décathlon 15s      │ 823      │ 3h 26min │ 96.1%    │ 10,200  │  │   │
│  │  │ Décathlon 30s      │ 312      │ 2h 36min │ 91.2%    │ 3,900   │  │   │
│  │  │ Décathlon Promo    │ 112      │ 0h 56min │ 88.4%    │ 1,500   │  │   │
│  │  └────────────────────┴──────────┴──────────┴──────────┴─────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [📥 Télécharger PDF]  [📊 Export CSV]  [📧 Envoyer au sponsor]           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rapport PDF Généré

Le rapport PDF inclut :

1. **Page de garde**
   - Logo club + logo sponsor
   - Période couverte
   - Date de génération

2. **Résumé exécutif**
   - KPIs clés en grand format
   - Comparaison période précédente
   - Points forts du mois

3. **Détail des diffusions**
   - Graphique impressions/jour
   - Répartition par période
   - Performance par vidéo

4. **Couverture géographique**
   - Carte des sites (si multi-sites)
   - Top 10 sites par impressions

5. **Certificat de diffusion**
   - Attestation officielle
   - Signature numérique
   - Utilisable pour facturation

## 13.5 Fonctionnalités par Phase

### Phase 1 - MVP (2 semaines)

| Fonctionnalité | Effort | Priorité |
|----------------|--------|----------|
| Collecte impressions basique | 3-4 jours | P0 |
| Stockage PostgreSQL | 1 jour | P0 |
| API stats simples | 2 jours | P0 |
| Dashboard basique | 3-4 jours | P0 |
| Export CSV | 1 jour | P1 |

**Livrables MVP :**
- Tracking automatique de chaque diffusion vidéo
- Endpoint API pour récupérer les stats
- Page dashboard avec métriques de base
- Export CSV des données brutes

### Phase 2 - V1 Complète (4 semaines)

| Fonctionnalité | Effort | Priorité |
|----------------|--------|----------|
| Contexte événement (période, type) | 2 jours | P1 |
| Génération rapport PDF | 3 jours | P1 |
| Rapports email automatiques | 3 jours | P1 |
| Dashboard avancé avec graphiques | 1 semaine | P1 |
| Comparaison périodes | 2 jours | P2 |
| Gestion sponsors (CRUD) | 2 jours | P1 |

**Livrables V1 :**
- Contextualisation complète des impressions
- Rapports PDF professionnels
- Envoi automatique mensuel aux sponsors
- Interface graphique complète

### Phase 3 - Avancée (8 semaines)

| Fonctionnalité | Effort | Priorité |
|----------------|--------|----------|
| Estimation audience (saisie manuelle) | 2 jours | P2 |
| Capteur présence (hardware) | 2-4 semaines | P3 |
| Intégration billetterie | 2 semaines | P3 |
| Portail sponsor self-service | 2 semaines | P2 |
| A/B testing créas | 1 semaine | P3 |
| Benchmark anonymisé | 1 semaine | P3 |
| Objectifs & alertes | 3 jours | P2 |
| API partenaires OAuth | 1 semaine | P2 |

## 13.6 Valeur Business

### Pour les Clubs

| Bénéfice | Impact |
|----------|--------|
| **Justifier les tarifs** | Négociation basée sur données réelles |
| **Renouveler les contrats** | Preuve de valeur pour fidélisation |
| **Attirer nouveaux sponsors** | Dossier commercial professionnel |
| **Upsell partenaires** | Proposer plus de visibilité avec métriques |

### Pour les Sponsors

| Bénéfice | Impact |
|----------|--------|
| **ROI mesurable** | Justification interne de l'investissement |
| **Optimisation créas** | Données pour améliorer les vidéos |
| **Transparence** | Confiance dans le partenariat |
| **Reporting automatisé** | Gain de temps administratif |

### Pour NEOPRO

| Bénéfice | Impact |
|----------|--------|
| **Différenciateur majeur** | Avantage concurrentiel fort |
| **Argument de vente B2B** | Conversion clubs facilitée |
| **Upsell analytics premium** | Nouvelle source de revenus |
| **Base pub programmatique** | Préparation Phase 3 |
| **Data insights marché** | Compréhension usage agrégé |

## 13.7 Modèle de Pricing Analytics

### Offres Analytics par Palier (inclus dans abonnement)

| Palier | Prix/mois | Analytics inclus |
|--------|-----------|------------------|
| **Autonome** | €50/mois | Stats basiques (impressions, durée, reach estimé) |
| **Professionnel** | €80/mois | Tout Autonome + Analytics Club Premium complet |
| **Premium** | €120/mois | Tout Pro + Dashboard Sponsors Premium + Rapports PDF sponsors |

### Upsells Analytics (add-ons annuels)

| Module | Prix | Contenu | Marge |
|--------|------|---------|-------|
| **Analytics Club Premium** | €200/an | Heatmaps, trends, benchmarking, export CSV, alertes auto | 75% |
| **Pack Sponsors Premium** | €250/an | Dashboard sponsors temps réel, rapports PDF mensuels, certificat digital, portail sponsors | 80% |
| **Bundle Analytics+Sponsors** | €400/an | Tout Analytics Club + Pack Sponsors (économie €50) | 75% |

### Détail Pack Sponsors Premium (€250/an)

| Fonctionnalité | Description |
|----------------|-------------|
| ✅ Dashboard sponsors temps réel | Impressions, reach, durée exposition par sponsor |
| ✅ Rapports PDF sponsors mensuels | KPIs détaillés, graphiques, évolutions |
| ✅ Certificat digital impressions | Preuve officielle pour négociations |
| ✅ Accès sponsors au portail | Login personnalisé par sponsor |
| ✅ Support dédié sponsors | Assistance spécifique partenaires |

### Impact Commercial

> **Argument massue pitch clubs :**
> *"Vos sponsors reçoivent rapports PDF automatiques mensuels prouvant 312 impressions en janvier. Renouvellement contrats facilité."*

**Cas concret CESSON Handball (N3) :**
- AVANT NEOPRO : 2 sponsors perdus (pas de preuves ROI)
- AVEC NEOPRO : 5/5 sponsors renouvelés ("enfin des données !")
- +1 nouveau sponsor attiré (visibilité écran démontrée)
- **+€2,500 revenus sponsoring annuels**
- **ROI NEOPRO : 4 mois**

### Taux Adoption Prévu 2026

| Module | Adoption | Clubs concernés |
|--------|----------|-----------------|
| Analytics Club Premium | 60% | 18 clubs sur 30 |
| Pack Sponsors Premium | 40% | 12 clubs sur 30 |
| Bundle complet | 25% | 8 clubs sur 30 |

## 13.8 KPIs Module Analytics

| Métrique | Objectif M6 | Objectif M12 |
|----------|-------------|--------------|
| Clubs utilisant analytics | 60% | 85% |
| Rapports générés/mois | 200 | 1,500 |
| Sponsors avec accès portail | 50 | 500 |
| NPS sponsors | > 50 | > 60 |
| Upsell analytics premium | 20% | 35% |

## 13.9 Roadmap Intégration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROADMAP ANALYTICS SPONSORS                               │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1 (Mois 1-2)
├── Semaine 1-2: Backend
│   ├── Tables PostgreSQL
│   ├── API endpoints
│   └── Collecte sync-agent
│
├── Semaine 3-4: Frontend
│   ├── Dashboard basique
│   ├── Export CSV
│   └── Tests & déploiement

PHASE 2 (Mois 3-4)
├── Semaine 5-6: Enrichissement
│   ├── Contexte événement
│   ├── Génération PDF
│   └── Gestion sponsors
│
├── Semaine 7-8: Automatisation
│   ├── Rapports email
│   ├── Scheduler cron
│   └── Dashboard avancé

PHASE 3 (Mois 5-8)
├── Mois 5: Audience
│   ├── Estimation manuelle
│   ├── Intégration billetterie
│   └── Capteur présence (R&D)
│
├── Mois 6-7: Self-service
│   ├── Portail sponsor
│   ├── API OAuth partenaires
│   └── Objectifs & alertes
│
└── Mois 8: Optimisation
    ├── A/B testing
    ├── Benchmarks
    └── Analytics prédictives
```

---

# 14. Analytics Club

> **Objectif : Donner aux clubs une vision complète de leur utilisation du système pour optimiser l'animation des événements et justifier l'investissement.**

Cette fonctionnalité permet aux clubs de mesurer l'utilisation réelle de leur système NEOPRO et d'identifier les axes d'amélioration.

## 14.0 Offre Commerciale Analytics Club

### Inclus dans Palier Professionnel (€80/mois)

| Fonctionnalité | Description |
|----------------|-------------|
| ✅ Dashboard analytics avancé | Vue complète utilisation système |
| ✅ Heatmaps d'engagement | Pics d'activité par moment match |
| ✅ Trends et évolutions | Comparaison mois/saison |
| ✅ Top contenus par période | Vidéos les plus diffusées |
| ✅ Rapports PDF club mensuels | Export automatique |
| ✅ Export CSV données brutes | Analyses custom |
| ✅ Comparaison vs autres clubs | Benchmarking anonyme |
| ✅ Alertes automatiques | Détection problèmes, baisse engagement |

### Add-on Analytics Club Premium (€200/an)

Pour les clubs sur palier Autonome qui veulent accéder aux analytics avancés :

| Élément | Détail |
|---------|--------|
| **Prix** | €200/an (€16,67/mois) |
| **Marge** | 75% |
| **Contenu** | Toutes fonctionnalités analytics incluses dans Professionnel |
| **Cible** | Clubs Autonome (€50/mois) voulant data sans upgrader |

### Cas d'Usage Concrets

**OPTIMISATION CONTENU :**
> *"Analytics montrent vidéo célébration Joueur 7 passe 3x plus que Joueur 12 → Créer nouvelle vidéo Joueur 12 plus engageante"*

**FIABILITÉ TECHNIQUE :**
> *"Alerte automatique baisse uptime → Intervention rapide avant match"*

**BENCHMARKING :**
> *"Mon club utilise écran 60 min/match, moyenne réseau 45 min → Je suis au-dessus, sponsors contents"*

**REPORTING INTERNE :**
> *"Rapport PDF mensuel présenté au bureau directeur prouvant ROI investissement NEOPRO"*

### Taux Adoption Prévu 2026

| Segment | Adoption |
|---------|----------|
| Clubs Professionnel/Premium (analytics inclus) | 100% |
| Clubs Autonome (add-on €200/an) | 30% |
| **Total clubs avec analytics** | 60% (18 sur 30) |

## 14.1 Données Disponibles

### Données actuellement collectées (sans développement)

| Donnée | Source | Stockage |
|--------|--------|----------|
| **Statut online/offline** | Sync-Agent heartbeat | `sites.status`, `sites.last_seen_at` |
| **CPU, RAM, Température, Disque** | Sync-Agent métriques | `metrics.*` |
| **Uptime système** | Sync-Agent | `metrics.uptime` |
| **Version logicielle** | Sites | `sites.software_version` |
| **Alertes système** | Central Server | `alerts.*` |
| **Déploiements vidéos** | Central Server | `content_deployments.*` |
| **Commandes exécutées** | Central Server | `remote_commands.*` |
| **Vidéos disponibles** | Central Server | `videos.*` |

### Données à collecter (hooks existants)

| Donnée | Source | Hook à implémenter |
|--------|--------|-------------------|
| **Lecture vidéo** | TV Player | `player.on('play')`, `player.one('ended')` |
| **Erreurs lecture** | TV Player | `player.on('error')` |
| **Déclenchement manuel** | Télécommande | `launchVideo()` |
| **Navigation catégories** | Télécommande | `selectCategory()` |
| **Retour boucle sponsors** | Télécommande | `launchSponsors()` |

## 14.2 Architecture Technique

### Schéma Base de Données

```sql
-- Sessions d'utilisation (quand la TV est active)
CREATE TABLE club_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    videos_played INTEGER DEFAULT 0,
    manual_triggers INTEGER DEFAULT 0,
    auto_plays INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_club_sessions_site ON club_sessions(site_id, started_at);

-- Lectures vidéo individuelles
CREATE TABLE video_plays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    session_id UUID REFERENCES club_sessions(id),
    video_filename VARCHAR(255),
    category VARCHAR(50),           -- sponsor, jingle, ambiance
    played_at TIMESTAMP NOT NULL,
    duration_played INTEGER,        -- secondes
    video_duration INTEGER,         -- durée totale
    completed BOOLEAN DEFAULT false,
    trigger_type VARCHAR(20),       -- auto, manual
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_video_plays_site ON video_plays(site_id, played_at);
CREATE INDEX idx_video_plays_session ON video_plays(session_id);

-- Agrégats quotidiens (calculés par cron)
CREATE TABLE club_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    date DATE NOT NULL,

    -- Activité
    sessions_count INTEGER DEFAULT 0,
    screen_time_seconds INTEGER DEFAULT 0,
    videos_played INTEGER DEFAULT 0,
    manual_triggers INTEGER DEFAULT 0,

    -- Par catégorie
    sponsor_plays INTEGER DEFAULT 0,
    jingle_plays INTEGER DEFAULT 0,
    ambiance_plays INTEGER DEFAULT 0,

    -- Technique (agrégé depuis metrics)
    avg_cpu DECIMAL(5,2),
    avg_memory DECIMAL(5,2),
    avg_temperature DECIMAL(5,2),
    uptime_percent DECIMAL(5,2),
    incidents_count INTEGER DEFAULT 0,

    UNIQUE(site_id, date)
);

CREATE INDEX idx_club_daily_stats_site ON club_daily_stats(site_id, date);
```

### Collecte côté Boîtier

```typescript
// Ajout dans tv.component.ts
interface VideoPlayEvent {
  videoFilename: string;
  category: string;
  playedAt: Date;
  durationPlayed: number;
  videoDuration: number;
  completed: boolean;
  triggerType: 'auto' | 'manual';
}

// Hook sur le player Video.js existant
player.on('play', () => {
  this.currentPlayStart = new Date();
  this.trackVideoStart(video);
});

player.one('ended', () => {
  this.trackVideoEnd(video, true);
});

player.on('error', (error) => {
  this.trackVideoError(video, error);
});
```

```typescript
// Ajout dans remote.component.ts
launchVideo(video: Video) {
  this.socketService.emit('command', { type: 'video', data: video });
  // Nouveau: tracker le déclenchement manuel
  this.analyticsService.trackManualTrigger(video);
}
```

### API Endpoints

```typescript
// GET /api/v1/analytics/clubs/:siteId/health
// Dashboard santé technique
{
  "status": "healthy",
  "current": {
    "cpu": 23.5,
    "memory": 45.2,
    "temperature": 52,
    "disk_used_percent": 18
  },
  "uptime_30d": 99.2,
  "last_seen": "2025-01-28T14:32:00Z",
  "alerts_active": 0,
  "alerts_last_30d": 1
}

// GET /api/v1/analytics/clubs/:siteId/usage?from=2025-01-01&to=2025-01-31
// Statistiques d'utilisation
{
  "period": "2025-01-01/2025-01-31",
  "summary": {
    "screen_time_seconds": 171120,
    "screen_time_formatted": "47h 32min",
    "videos_played": 1847,
    "sessions_count": 24,
    "active_days": 18,
    "manual_triggers": 623,
    "auto_plays": 1224
  },
  "comparison_previous": {
    "screen_time": "+15%",
    "videos_played": "+8%",
    "sessions": "+20%"
  },
  "daily": [
    {"date": "2025-01-01", "screen_time": 7200, "videos": 87},
    {"date": "2025-01-02", "screen_time": 5400, "videos": 62}
  ]
}

// GET /api/v1/analytics/clubs/:siteId/content?from=2025-01-01&to=2025-01-31
// Analytics contenu
{
  "by_category": {
    "sponsor": {"plays": 892, "percent": 48.3},
    "jingle": {"plays": 412, "percent": 22.3},
    "ambiance": {"plays": 543, "percent": 29.4}
  },
  "top_videos": [
    {"filename": "but-celebration.mp4", "plays": 187, "category": "jingle"},
    {"filename": "decathlon-15s.mp4", "plays": 156, "category": "sponsor"}
  ],
  "never_played": [
    {"filename": "intro-match.mp4", "category": "ambiance"},
    {"filename": "sponsor-old.mp4", "category": "sponsor"}
  ],
  "completion_rate": 94.2
}

// GET /api/v1/analytics/clubs/:siteId/export?format=csv&from=2025-01-01&to=2025-01-31
// Export données brutes
```

## 14.3 Dashboard Club

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NEOPRO - Analytics : CESSON HANDBALL                           Jan 2025   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ══════════════════════════════════════════════════════════════════════════ │
│  📊 UTILISATION                                                    [Mois ▼] │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │  TEMPS D'ÉCRAN   │ │  VIDÉOS JOUÉES   │ │  JOURS ACTIFS    │            │
│  │    47h 32min     │ │     1,847        │ │    18 / 31       │            │
│  │   ▲ +15% vs M-1  │ │   ▲ +8% vs M-1   │ │   ▲ +3 vs M-1    │            │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ACTIVITÉ QUOTIDIENNE                                               │   │
│  │  4h│      ■                    ■              ■                     │   │
│  │  2h│  ■   ■   ■       ■   ■   ■   ■      ■   ■   ■   ■            │   │
│  │  0 └────────────────────────────────────────────────────            │   │
│  │     1   5    10   15   20   25   30                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ══════════════════════════════════════════════════════════════════════════ │
│  🎬 CONTENU                                                                 │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  ┌───────────────────────────┐  ┌───────────────────────────────────────┐  │
│  │  PAR CATÉGORIE            │  │  TOP 5 VIDÉOS                         │  │
│  │                           │  │                                       │  │
│  │  Sponsors   ████████ 892  │  │  1. but-celebration.mp4    187 plays │  │
│  │  Jingles    ████░░░░ 412  │  │  2. decathlon-15s.mp4      156 plays │  │
│  │  Ambiance   █████░░░ 543  │  │  3. timeout.mp4            134 plays │  │
│  │                           │  │  4. mi-temps.mp4           98 plays  │  │
│  │  Auto: 66%   Manuel: 34%  │  │  5. sponsor-boulanger.mp4  87 plays  │  │
│  └───────────────────────────┘  └───────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚠️ VIDÉOS JAMAIS JOUÉES CE MOIS                                    │   │
│  │  intro-match.mp4, sponsor-old.mp4, test-video.mp4                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ══════════════════════════════════════════════════════════════════════════ │
│  🔧 SANTÉ SYSTÈME                                                          │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │  DISPONIBILITÉ   │ │  TEMPÉRATURE MOY │ │   ESPACE DISQUE  │            │
│  │     99.2%        │ │      52°C        │ │    18% utilisé   │            │
│  │   ✓ Excellent    │ │   ✓ Normal       │ │   ✓ OK           │            │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ALERTES CE MOIS : 1                                                │   │
│  │  └─ 15 Jan 14:32 - Température élevée (72°C) - Résolu après 23min  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [📥 Export CSV]  [📊 Rapport PDF]                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 14.4 Fonctionnalités par Phase

### Phase 1 - MVP avec données existantes (1 semaine)

| Fonctionnalité | Source données | Effort |
|----------------|----------------|--------|
| Dashboard santé (CPU, RAM, temp, disque) | `metrics` existant | 2 jours |
| Historique disponibilité | `sites.status`, `last_seen_at` | 1 jour |
| Liste alertes avec historique | `alerts` existant | 1 jour |
| API endpoints santé | Central Server | 1 jour |

**Livrable :** Dashboard technique avec données déjà collectées

### Phase 2 - Tracking vidéos (2 semaines)

| Fonctionnalité | Modification requise | Effort |
|----------------|----------------------|--------|
| Tables `video_plays`, `club_sessions` | PostgreSQL | 1 jour |
| Hook TV Player (play/end/error) | `tv.component.ts` | 2 jours |
| Hook télécommande (launch) | `remote.component.ts` | 2 jours |
| Envoi analytics via sync-agent | `agent.js` | 2 jours |
| API + stockage central | Central Server | 3 jours |

**Livrable :** Tracking complet des lectures vidéo

### Phase 3 - Analytics avancées (2 semaines)

| Fonctionnalité | Description | Effort |
|----------------|-------------|--------|
| Table `club_daily_stats` + cron | Agrégats quotidiens | 2 jours |
| Comparaison périodes | M vs M-1, tendances | 2 jours |
| Export CSV | Données brutes | 1 jour |
| Dashboard Angular complet | Interface utilisateur | 4 jours |
| Vidéos jamais jouées | Analyse contenu | 1 jour |

**Livrable :** Analytics complètes avec exports

## 14.5 Fonctionnalités Futures

| Fonctionnalité | Complexité | Description |
|----------------|------------|-------------|
| **Contexte événement** | Moyenne | Saisie type match/entraînement sur télécommande |
| **Estimation audience** | Faible | Champ saisie manuelle sur télécommande |
| **Sessions détaillées** | Moyenne | Détection auto début/fin événement |
| **Heatmap horaire** | Faible | Agrégation par heure d'activité |
| **Rapport PDF mensuel** | Moyenne | Génération automatique |
| **Benchmarks anonymisés** | Élevée | Comparaison clubs similaires |
| **Alertes personnalisées** | Moyenne | Seuils configurables par club |
| **Multi-sites consolidé** | Élevée | Vue agrégée pour clubs multi-gymnases |

## 14.6 Valeur Business

### Pour les Clubs

| Bénéfice | Impact |
|----------|--------|
| **Visibilité utilisation** | Justifier l'investissement auprès du bureau |
| **Optimiser le contenu** | Identifier vidéos efficaces vs inutilisées |
| **Anticiper les problèmes** | Alertes proactives santé système |
| **Historique activité** | Preuve d'utilisation pour partenaires |

### Pour NEOPRO

| Bénéfice | Impact |
|----------|--------|
| **Réduire le churn** | Clubs engagés restent abonnés |
| **Support proactif** | Détecter clubs en difficulté |
| **Product insights** | Comprendre l'usage réel |
| **Success stories** | Données pour marketing |

## 14.7 KPIs Module Analytics Club

| Métrique | Objectif M6 | Objectif M12 |
|----------|-------------|--------------|
| Clubs consultant analytics | 50% | 80% |
| Temps moyen sur dashboard | > 2 min | > 3 min |
| Exports générés/mois | 50 | 300 |
| Clubs avec > 50% utilisation | 60% | 75% |
| Satisfaction feature (NPS) | > 40 | > 50 |

---

# 15. Annexes

## 15.1 Glossaire

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

## 15.2 Liens Utiles

| Ressource | URL |
|-----------|-----|
| Dashboard Central | https://neopro-admin.kalonpartners.bzh |
| API Central | https://neopro-central.onrender.com |
| Documentation | docs/REFERENCE.md |
| Troubleshooting | docs/TROUBLESHOOTING.md |

## 15.3 Contacts

| Rôle | Email | Téléphone |
|------|-------|-----------|
| Fondateur | contact@neopro.fr | - |
| Support technique | support@neopro.fr | - |
| Commercial | sales@neopro.fr | - |

## 15.4 Template Incident Report

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

## 15.5 Checklist Nouveau Développeur

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
**Version :** 1.4
**Date :** 15 Décembre 2025
**Mise à jour :**
- v1.4 (15 déc) : Rapport PDF Club terminé, migration DB audience/score prête, doc STATUS.md + IMPLEMENTATION_GUIDE créées
- v1.3 (8 déc) : Ajout fonctionnalités réalisées (analytics, éditeur config, CRUD vidéos, timeCategories), réévaluation note globale
- v1.2 (6 déc) : Ajout sections Analytics Sponsors (13) et Analytics Club (14)
**Classification :** Confidentiel

**Voir aussi :**
- `STATUS.md` - État complet et détaillé du projet (mise à jour quotidienne)
- `BACKLOG.md` - Roadmap features futures et sprint tracking
- `IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md` - Guide technique estimation audience + score live

---

*Ce document constitue une analyse exhaustive du projet NEOPRO et sert de référence pour les décisions stratégiques, techniques et opérationnelles.*
