# 🚀 START HERE - Guide de Navigation Documentation NEOPRO

**Vous êtes perdu dans la documentation ? Ce guide est fait pour vous !**

---

## 🎯 Quel est votre profil ?

### 👨‍💻 Je suis développeur et je veux...

#### Démarrer sur le projet général NEOPRO

→ **[README.md](../README.md)** (racine du projet)

- Configuration nouveau club (remote vs local)
- Mise à jour boîtier
- Commandes rapides

→ **[CLUB-SETUP-README.md](../raspberry/scripts/CLUB-SETUP-README.md)** (Setup club complet)

- Méthode remote (sans dépendance locale) ✅
- Méthode local (développement) 🔧

#### Comprendre l'architecture globale

→ **[REFERENCE.md](REFERENCE.md)**

- Architecture complète
- Serveur central, boîtiers, sync
- API et WebSocket

#### Démarrer sur le module Analytics Sponsors (NOUVEAU)

→ **[ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)**

- Setup en < 1 heure
- Tests rapides
- Checklist premier jour

#### Résoudre un problème

→ **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

- Problèmes courants
- Solutions pas à pas
- Diagnostic complet
- Sections 29-30 : validation post-OTA et canary monitoring (v3.116+)

#### Valider un déploiement OTA

→ **[REFERENCE.md](REFERENCE.md)** (section "Validation post-OTA")

- Checks critiques et warnings
- Script `validate-pi.sh` (SSH/JSON/quiet)
- Admin API `POST /api/system/validate`
- Canary monitoring (surveillance 5 min post-deploy)

---

### 🎯 Je veux comprendre le module Analytics Sponsors

**Point d'entrée unique** : **[ANALYTICS_SPONSORS_README.md](ANALYTICS_SPONSORS_README.md)**

Puis selon vos besoins :

| Document                                                                         | Quand l'utiliser                         |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| **[ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)** | Premier jour, setup environnement        |
| **[IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md)** | Comprendre backend (DB, API)             |
| **[TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)**         | Comprendre tracking boîtiers TV          |
| **[PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)**                                 | Modifier/comprendre génération PDF       |
| **[AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)**         | Voir progression, roadmap phases futures |

---

### 🏗️ Je veux installer/déployer

#### Nouveau boîtier Raspberry Pi

**RECOMMANDÉ - Setup remote (22 min) :**
→ **[ONLINE_INSTALLATION.md](ONLINE_INSTALLATION.md)** - Installation complète sans dépendance locale

**Autres méthodes :**
→ **[GOLDEN_IMAGE.md](guides/GOLDEN_IMAGE.md)** si vous avez une image (10 min)
→ **[INSTALLATION_COMPLETE.md](guides/INSTALLATION_COMPLETE.md)** installation manuelle (45 min)

**Configuration du club :**
→ **[CLUB-SETUP-README.md](../raspberry/scripts/CLUB-SETUP-README.md)** - Remote vs Local

#### Serveur central

→ **[DEPLOY_CENTRAL_SERVER.md](deployment/DEPLOY_CENTRAL_SERVER.md)**

- Déploiement Railway
- Configuration Supabase
- Variables d'environnement

---

### 📊 Je veux comprendre le business

→ **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md)**

- Executive Summary
- Modèle économique
- Roadmap produit

### 🎯 Je suis Chef de Projet / Product Owner

→ **[SAFe Neopro](safe/README.md)** - Framework SAFe Essential complet 🆕

- 21 Epics, 35 Features, 40 User Stories avec WSJF
- Roadmap PI (3 incréments de 6 semaines)
- Value Streams : [OVS1 Club to Screen](safe/OVS1-CLUB-TO-SCREEN.md) · [OVS2 Sponsor to Impression](safe/OVS2-SPONSOR-TO-IMPRESSION.md)
- [Portfolio visuel](safe/PORTFOLIO.md) avec Gantt, trajectoire ARR, croissance clubs

---

## 📚 Documents par Thématique

### Module Analytics Sponsors (COMPLET)

**6 documents dédiés** - Tous dans `docs/`

1. **[ANALYTICS_SPONSORS_README.md](ANALYTICS_SPONSORS_README.md)** ⭐ **START HERE**
   - Vue d'ensemble
   - Architecture
   - Quick start

2. **[ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)**
   - Guide démarrage développeur
   - Setup < 1h

3. **[IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md)**
   - Schéma DB
   - API endpoints

4. **[TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)**
   - Architecture tracking TV
   - Flux de données

5. **[PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)**
   - Génération PDF
   - Graphiques Chart.js

6. **[AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)**
   - Suivi progression
   - Roadmap futures phases

**Résumés** :

- **[WEEK_3_SUMMARY.md](../WEEK_3_SUMMARY.md)** - Résumé semaine 3
- **[DOCUMENTATION_COMPLETE.md](../DOCUMENTATION_COMPLETE.md)** - Certificat complétion
- **[changelog/2025-12-14_analytics-sponsors.md](changelog/2025-12-14_analytics-sponsors.md)** - Changelog détaillé

---

### Installation & Configuration

| Document                                                 | Usage                                 |
| -------------------------------------------------------- | ------------------------------------- |
| **[INSTALLATION_COMPLETE.md](INSTALLATION_COMPLETE.md)** | Installation Raspberry Pi depuis zéro |
| **[GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)**                   | Déploiement rapide avec image         |
| **[CONFIGURATION.md](CONFIGURATION.md)**                 | Fichiers config, personnalisation     |
| **[DEPLOY_CENTRAL_SERVER.md](DEPLOY_CENTRAL_SERVER.md)** | Déploiement serveur central           |

---

### Architecture & Technique

| Document                                                 | Usage                            |
| -------------------------------------------------------- | -------------------------------- |
| **[REFERENCE.md](REFERENCE.md)**                         | Documentation technique complète |
| **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)**         | Architecture synchronisation     |
| **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md)** | Vision business et technique     |

---

### Support & Dépannage

| Document                                     | Usage                   |
| -------------------------------------------- | ----------------------- |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Guide dépannage complet |
| **[TESTING_GUIDE.md](TESTING_GUIDE.md)**     | Procédures de test      |

---

## 🗂️ Documents à IGNORER (obsolètes ou très spécifiques)

Ces documents sont conservés pour historique mais **ne pas utiliser** :

- `AUDIT_*.md` - Audits spécifiques à une date
- `CORRECTIONS*.md` - Corrections ponctuelles
- `CHANGELOG-*.md` - Ancien format changelog (utiliser `changelog/` à la place)
- `FIX_*.md` - Fixes spécifiques déjà appliqués
- `SYNC_AGENT_FIX.md` - Fix déjà intégré
- `admin-console-dev.md` - Dev specifique
- `proposition-*.md` - Propositions archivées

**Pour les changelogs** : Utiliser `changelog/` directory

---

## 🎓 Parcours Recommandés

### Parcours 1 : Nouveau Développeur Backend

1. **[README.md](../README.md)** (15 min) - Contexte général
2. **[REFERENCE.md](REFERENCE.md)** (30 min) - Architecture
3. **[ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)** (1h) - Setup Analytics Sponsors
4. **Commencer à coder** ✅

**Temps total** : ~2 heures

---

### Parcours 2 : Nouveau Développeur Frontend

1. **[README.md](../README.md)** (15 min) - Contexte général
2. **[ANALYTICS_SPONSORS_README.md](ANALYTICS_SPONSORS_README.md)** (20 min) - Module Analytics
3. **[ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)** (1h) - Setup
4. **Commencer à coder** ✅

**Temps total** : ~1h30

---

### Parcours 3 : Chef de Projet / Product Owner

1. **[SAFe Neopro](safe/README.md)** (20 min) - Framework SAFe, Epics, Roadmap PI 🆕
2. **[Portfolio SAFe](safe/PORTFOLIO.md)** (15 min) - Vue d'ensemble, Gantt, métriques ARR
3. **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md) §13** (15 min) - Vision Analytics Sponsors
4. **[AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)** (10 min) - État projet
5. **Prêt à planifier** ✅

**Temps total** : ~1 heure

---

### Parcours 4 : Installation Boîtier

**Avec image Golden** :

1. **[GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)** (10 min lecture + flash)
2. **Boîtier prêt** ✅

**Sans image** :

1. **[INSTALLATION_COMPLETE.md](INSTALLATION_COMPLETE.md)** (45 min)
2. **[CONFIGURATION.md](CONFIGURATION.md)** (10 min)
3. **Boîtier prêt** ✅

---

### Parcours 5 : Dépannage

1. **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Chercher votre problème
2. Si Analytics Sponsors : **[TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)** section "Troubleshooting"
3. **GitHub Issues** si pas de solution

---

## 🔍 Navigation Rapide par Mot-Clé

| Je cherche...            | Document                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **API endpoints**        | [REFERENCE.md](REFERENCE.md) ou [IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md) |
| **Base de données**      | [IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md)                                 |
| **Graphiques Chart.js**  | [PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)                                                                 |
| **PDF génération**       | [PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)                                                                 |
| **Tracking impressions** | [TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)                                         |
| **Synchronisation**      | [SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)                                                                 |
| **Installer boîtier**    | [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md) ou [INSTALLATION_COMPLETE.md](INSTALLATION_COMPLETE.md)                   |
| **Déployer serveur**     | [DEPLOY_CENTRAL_SERVER.md](DEPLOY_CENTRAL_SERVER.md)                                                         |
| **Erreur/Bug**           | [TROUBLESHOOTING.md](TROUBLESHOOTING.md)                                                                     |
| **Tests**                | [TESTING_GUIDE.md](TESTING_GUIDE.md)                                                                         |
| **Business/Roadmap**     | [BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md)                                                         |
| **Configuration**        | [CONFIGURATION.md](CONFIGURATION.md)                                                                         |
| **Premier jour dev**     | [ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md)                                 |

---

## 📋 Checklist "Je suis prêt"

Cochez au fur et à mesure :

**Développeur Analytics Sponsors** :

- [ ] Lu ANALYTICS_SPONSORS_README.md
- [ ] Setup environnement (ONBOARDING guide)
- [ ] Tests rapides réussis
- [ ] Build TypeScript OK
- [ ] Première modification testée
- ✅ **Prêt à coder !**

**Chef de Projet** :

- [ ] Lu BUSINESS_PLAN_COMPLET.md §13
- [ ] Lu AVANCEMENT_ANALYTICS_SPONSORS.md
- [ ] Compris roadmap phases 4-5
- ✅ **Prêt à planifier !**

**Ops/Installation** :

- [ ] Choix méthode (Golden Image ou Installation complète)
- [ ] Guide suivi pas à pas
- [ ] Configuration personnalisée
- [ ] Tests de connexion OK
- ✅ **Boîtier prêt !**

---

## 💡 Conseils

### ✅ À FAIRE

- **Commencer par ce guide (START_HERE.md)**
- **Suivre les parcours recommandés** selon votre profil
- **Utiliser INDEX.md** pour navigation générale
- **Bookmarker les docs** que vous utilisez souvent

### ❌ À NE PAS FAIRE

- Lire tous les documents dans l'ordre alphabétique
- Commencer par les documents d'audit (AUDIT\_\*.md)
- Lire les documents de corrections ponctuelles (FIX\_\*.md)
- Se perdre dans changelog/ (sauf besoin spécifique)

---

## 🆘 Toujours Perdu ?

### Option 1 : INDEX.md

**[INDEX.md](INDEX.md)** - Table des matières complète avec descriptions

### Option 2 : Par Composant

| Composant         | README                                                        |
| ----------------- | ------------------------------------------------------------- |
| Projet général    | [README.md](../README.md)                                     |
| Central Server    | [central-server/README.md](../central-server/README.md)       |
| Central Dashboard | [central-dashboard/README.md](../central-dashboard/README.md) |
| Raspberry         | [raspberry/README.md](../raspberry/README.md)                 |

### Option 3 : Demander de l'aide

- GitHub Issues
- Team chat
- Documentation manquante ? Créer une issue !

---

## 🎯 Résumé Ultra-Rapide

**Pour 90% des cas** :

| Vous êtes...                       | Lisez...                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| **Nouveau dev Analytics Sponsors** | [ONBOARDING_DEV_ANALYTICS_SPONSORS.md](ONBOARDING_DEV_ANALYTICS_SPONSORS.md) |
| **Nouveau dev général**            | [README.md](../README.md) puis [REFERENCE.md](REFERENCE.md)                  |
| **Chef de projet**                 | [AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)         |
| **Ops installation**               | [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)                                           |
| **Bug/Problème**                   | [TROUBLESHOOTING.md](TROUBLESHOOTING.md)                                     |

---

**Dernière mise à jour** : 19 Février 2026
**Maintenu par** : Équipe NEOPRO
**Feedback** : GitHub Issues

**🚀 Bonne navigation dans la documentation NEOPRO !**
