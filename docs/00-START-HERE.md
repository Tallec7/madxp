# 🚀 NEOPRO - Point de Départ

Bienvenue dans la documentation NEOPRO ! Ce fichier est votre **point d'entrée unique** pour naviguer dans toute la documentation du projet.

## 📋 Table des Matières

- [Démarrage Rapide](#-démarrage-rapide)
- [Architecture](#-architecture)
- [Guides par Rôle](#-guides-par-rôle)
- [Documentation Complète](#-documentation-complète)
- [Support](#-support)

---

## ⚡ Démarrage Rapide

### Vous êtes...

#### 👨‍💼 **Nouveau sur le projet ?**
1. Lire [Vue d'Ensemble du Projet](architecture/overview.md)
2. Comprendre l'[Architecture Globale](architecture/system-architecture.md)
3. Explorer les [Cas d'Usage](use-cases/README.md)

#### 🔧 **Installer un Raspberry Pi ?**
→ **[Guide d'Installation Raspberry Pi](quick-start/raspberry-pi-installation.md)**
- Flash SD card
- Configuration réseau
- Déploiement application
- **Durée**: ~40 minutes

#### 💻 **Développeur voulant contribuer ?**
→ **[Guide de Démarrage Développeur](development/getting-started.md)**
- Setup environnement local
- Lancer l'application en dev
- Architecture du code
- **Durée**: ~30 minutes

#### 🌐 **Déployer le serveur central ?**
→ **[Guide de Déploiement Production](deployment/cloud-deployment.md)**
- Configuration Render/Hostinger
- Variables d'environnement
- Base de données Supabase
- **Durée**: ~2 heures

#### 📊 **Utiliser le Dashboard Admin ?**
→ **[Guide d'Utilisation Dashboard](quick-start/dashboard-usage.md)**
- Connexion
- Gestion des sites
- Analytics
- **Durée**: ~15 minutes

---

## 🏗️ Architecture

### Composants Principaux

```
┌─────────────────────────────────────────────┐
│         SERVEUR CENTRAL (Cloud)             │
│  - API Express.js + PostgreSQL              │
│  - Dashboard Angular                        │
│  - Socket.IO Server                         │
└──────────────────┬──────────────────────────┘
                   │
          WebSocket + REST API
                   │
     ┌─────────────┴──────────────┐
     ▼                            ▼
┌──────────────┐         ┌──────────────┐
│ Raspberry Pi │         │ Raspberry Pi │
│  CLUB #1     │   ...   │  CLUB #N     │
│              │         │              │
│ - TV Screen  │         │ - TV Screen  │
│ - Remote App │         │ - Remote App │
│ - Sync Agent │         │ - Sync Agent │
└──────────────┘         └──────────────┘
```

**En savoir plus:** [Architecture Détaillée](architecture/system-architecture.md)

---

## 👥 Guides par Rôle

### Pour les Administrateurs Système

| Guide | Description | Temps |
|-------|-------------|-------|
| [Installation Raspberry Pi](quick-start/raspberry-pi-installation.md) | Setup complet d'un nouveau boîtier | 40 min |
| [Configuration Réseau](deployment/network-configuration.md) | WiFi, mDNS, firewall | 20 min |
| [Troubleshooting](reference/troubleshooting.md) | Résolution problèmes courants | Variable |
| [Maintenance](deployment/maintenance.md) | Mises à jour, backups, monitoring | 1h |

### Pour les Développeurs

| Guide | Description | Temps |
|-------|-------------|-------|
| [Setup Local](development/getting-started.md) | Environnement de développement | 30 min |
| [Architecture Frontend](architecture/frontend-architecture.md) | Angular Raspberry + Dashboard | 20 min |
| [Architecture Backend](architecture/backend-architecture.md) | API Node.js + PostgreSQL | 20 min |
| [Tests](development/testing-guide.md) | Jest, Karma, Playwright | 30 min |
| [Contribution](development/contributing.md) | Git workflow, PR process | 15 min |

### Pour les Utilisateurs Finaux

| Guide | Description | Temps |
|-------|-------------|-------|
| [Dashboard Admin](quick-start/dashboard-usage.md) | Utilisation interface web | 15 min |
| [Télécommande Mobile](quick-start/remote-usage.md) | Contrôle TV depuis smartphone | 10 min |
| [Gestion Contenu](quick-start/content-management.md) | Upload et organisation vidéos | 20 min |

### Pour les DevOps

| Guide | Description | Temps |
|-------|-------------|-------|
| [Déploiement Cloud](deployment/cloud-deployment.md) | Render + Hostinger | 2h |
| [Kubernetes](deployment/kubernetes-deployment.md) | Déploiement K8s | 3h |
| [Monitoring](deployment/monitoring-setup.md) | Prometheus + Grafana | 2h |
| [CI/CD](deployment/ci-cd-pipeline.md) | GitHub Actions | 1h |

---

## 📚 Documentation Complète

### Structure de la Documentation

```
docs/
├── 00-START-HERE.md              ← Vous êtes ici !
│
├── quick-start/                   ← Guides de démarrage rapide
│   ├── raspberry-pi-installation.md
│   ├── dashboard-usage.md
│   ├── remote-usage.md
│   └── content-management.md
│
├── architecture/                  ← Architecture technique
│   ├── overview.md
│   ├── system-architecture.md
│   ├── frontend-architecture.md
│   ├── backend-architecture.md
│   ├── database-schema.md
│   └── sync-architecture.md
│
├── development/                   ← Guides développement
│   ├── getting-started.md
│   ├── testing-guide.md
│   ├── contributing.md
│   ├── code-style.md
│   └── debugging.md
│
├── deployment/                    ← Déploiement et production
│   ├── cloud-deployment.md
│   ├── raspberry-deployment.md
│   ├── network-configuration.md
│   ├── kubernetes-deployment.md
│   ├── monitoring-setup.md
│   ├── ci-cd-pipeline.md
│   └── maintenance.md
│
├── reference/                     ← Documentation de référence
│   ├── api-endpoints.md
│   ├── database-schema.md
│   ├── configuration-reference.md
│   ├── troubleshooting.md
│   ├── faq.md
│   └── glossary.md
│
├── use-cases/                     ← Cas d'usage et scénarios
│   ├── README.md
│   ├── new-club-onboarding.md
│   ├── content-deployment.md
│   └── remote-troubleshooting.md
│
└── changelog/                     ← Historique des changements
    ├── 2025-12-16_analytics-sponsors.md
    ├── 2025-12-15_live-score.md
    └── ...
```

---

## 🔍 Recherche Rapide

### Par Mot-Clé

| Mot-Clé | Documentation |
|---------|---------------|
| **Installation** | [Raspberry Pi](quick-start/raspberry-pi-installation.md), [Cloud](deployment/cloud-deployment.md) |
| **Configuration** | [Configuration Reference](reference/configuration-reference.md), [Network](deployment/network-configuration.md) |
| **API** | [API Endpoints](reference/api-endpoints.md), [OpenAPI Docs](../central-server/src/docs/README.md) |
| **Database** | [Schema](reference/database-schema.md), [Migrations](architecture/database-schema.md#migrations) |
| **Tests** | [Testing Guide](development/testing-guide.md) |
| **Troubleshooting** | [Troubleshooting Guide](reference/troubleshooting.md) |
| **Analytics** | [Analytics Architecture](architecture/analytics-architecture.md) |
| **Security** | [Row-Level Security](ROW_LEVEL_SECURITY.md), [Authentication](architecture/backend-architecture.md#authentication) |
| **Live-Score** | [Live-Score Feature](changelog/2025-12-16_rls-livescore-integration.md#2-live-score-feature) |
| **OpenAPI** | [API Documentation](../central-server/src/docs/README.md), [Swagger UI](/api-docs) |

### Par Problème Courant

| Problème | Solution |
|----------|----------|
| "Le boîtier ne répond pas" | [Troubleshooting: Connectivity](reference/troubleshooting.md#connectivity-issues) |
| "Les vidéos ne se déploient pas" | [Troubleshooting: Deployments](reference/troubleshooting.md#deployment-issues) |
| "Le dashboard ne charge pas" | [Troubleshooting: Dashboard](reference/troubleshooting.md#dashboard-issues) |
| "Erreur API 401/403" | [Troubleshooting: Authentication](reference/troubleshooting.md#authentication-issues) |
| "Socket.IO déconnecté" | [Troubleshooting: WebSocket](reference/troubleshooting.md#websocket-issues) |

---

## 📖 Documentation Héritée

Les fichiers suivants sont conservés pour référence historique mais peuvent contenir des informations obsolètes:

- `INSTALLATION_COMPLETE.md` → Voir [quick-start/raspberry-pi-installation.md](quick-start/raspberry-pi-installation.md)
- `TROUBLESHOOTING.md` → Voir [reference/troubleshooting.md](reference/troubleshooting.md)
- `REFERENCE.md` → Voir [reference/](reference/)

**Note**: En cas de conflit, la nouvelle documentation dans `docs/` fait foi.

---

## 🆘 Support

### Besoin d'Aide ?

1. **Consultez d'abord:**
   - [FAQ](reference/faq.md)
   - [Troubleshooting](reference/troubleshooting.md)
   - [Index de la Documentation](INDEX.md)

2. **Outils de diagnostic:**
   ```bash
   # Raspberry Pi
   ./raspberry/scripts/diagnose-pi.sh

   # Serveur Central
   curl https://api.neopro.fr/health
   ```

3. **Logs:**
   ```bash
   # Raspberry Pi
   ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 100'

   # Dashboard
   # Voir dans le navigateur: Console (F12)
   ```

4. **Contacter le support:**
   - Email: support@neopro.fr
   - Issues GitHub: https://github.com/neopro/neopro/issues
   - Documentation: Ce fichier !

---

## 🔗 Liens Utiles

### Interfaces Web

| Interface | URL | Accès |
|-----------|-----|-------|
| Dashboard Central | https://neopro-admin.kalonpartners.bzh | Admin |
| API Central | https://neopro-central.onrender.com | Backend |
| **API Docs (Swagger)** | https://neopro-central.onrender.com/api-docs | **Public** ✨ Nouveau |
| Raspberry Login | http://neopro.local/login | Local |
| Raspberry Admin | http://neopro.local:8080 | Local |

### Dépôts & Ressources

| Ressource | Lien |
|-----------|------|
| GitHub Repository | https://github.com/neopro/neopro |
| OpenAPI Documentation | [central-server/src/docs/](../central-server/src/docs/README.md) |
| Supabase Dashboard | https://supabase.com/dashboard |
| Render Dashboard | https://render.com |

---

## 📅 Dernière Mise à Jour

**Date**: 16 décembre 2025
**Version**: 2.1
**Mainteneur**: Équipe NEOPRO

**Nouvelles fonctionnalités (v2.1):**
- ✨ **Row-Level Security (RLS)** - Isolation multi-tenant PostgreSQL
- ✨ **Live-Score en temps réel** - Affichage score sur TV via Socket.IO
- ✨ **Documentation OpenAPI** - 30+ endpoints documentés dans Swagger
- ✨ **Point d'entrée unique** - Ce fichier comme hub central de doc

---

## 🎯 Prochaines Étapes Recommandées

### Nouveaux Utilisateurs
1. ✅ Lire [Vue d'Ensemble](architecture/overview.md)
2. ✅ Choisir votre rôle ci-dessus
3. ✅ Suivre le guide correspondant

### Nouveaux Développeurs
1. ✅ Lire [Architecture Globale](architecture/system-architecture.md)
2. ✅ Setup [Environnement Local](development/getting-started.md)
3. ✅ Explorer le [Code](development/code-structure.md)
4. ✅ Lancer les [Tests](development/testing-guide.md)

### Nouveau Club
1. ✅ Préparer [Matériel Requis](quick-start/raspberry-pi-installation.md#prerequisites)
2. ✅ Suivre [Installation Complète](quick-start/raspberry-pi-installation.md)
3. ✅ Tester avec [Checklist](quick-start/raspberry-pi-installation.md#checklist)
4. ✅ Former les utilisateurs avec [Guide Dashboard](quick-start/dashboard-usage.md)

---

**Bonne navigation ! 🚀**
