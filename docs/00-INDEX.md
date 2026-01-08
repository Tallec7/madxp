# Documentation Neopro

## 🚀 PERDU ? COMMENCEZ ICI !

### **[01-START-HERE.md](01-START-HERE.md)** - 🎯 Guide de Navigation

**Nouveau sur le projet ?** Ce guide vous oriente selon votre profil :

- 👨‍💻 Développeur (backend, frontend, fullstack)
- 🎯 Chef de projet / Product Owner
- 🏗️ Ops / Installation
- 🆘 Dépannage

---

## 📚 Documentation par Thème

### 📖 [Guides Utilisateur](guides/)

Installation, configuration et utilisation de Neopro.

- [Installation en ligne (RECOMMANDÉE)](ONLINE_INSTALLATION.md) - Setup remote (~22 min)
- [Configuration d'un nouveau club](../raspberry/scripts/CLUB-SETUP-README.md) - Remote vs Local
- [Installation complète Raspberry Pi](guides/INSTALLATION_COMPLETE.md) - 3 méthodes comparées
- [Déploiement rapide via Golden Image](guides/GOLDEN_IMAGE.md) (10 min)
- [Guide utilisateur complet](guides/GUIDE_UTILISATEUR.md) (21K)
- [Troubleshooting et diagnostic](guides/TROUBLESHOOTING.md) (30K)
- [Configuration](guides/CONFIGURATION.md)

### 🔧 [Documentation Technique](technical/)

Architecture et documentation pour développeurs.

- [Architecture complète](technical/ARCHITECTURE.md) - Edge + Cloud (368 lignes)
- [Documentation de référence](technical/REFERENCE.md) (19K)
- [Architecture de synchronisation](technical/SYNC_ARCHITECTURE.md) (26K)
- [Architecture Multi-tenant](technical/MULTI_TENANT.md) - Portails Sponsor/Agence
- [Error Handling](technical/ERROR_HANDLING.md) - Correlation ID, logs structurés
- [Command Queue (sites offline)](technical/COMMAND_QUEUE.md)
- [Remote Shell](technical/REMOTE_SHELL.md) - Terminal distant sur les Pi
- [Row-Level Security](technical/ROW_LEVEL_SECURITY.md)
- [Guide des tests](technical/TESTING_GUIDE.md)
- [Boucles par Phase](../CLAUDE.md#boucles-vidéo-par-phase--new-2026-01) - Configuration N vidéos par phase
- [Mapping Analytics](../CLAUDE.md#mapping-analytics-des-catégories--new-2026-01) - Catégories → types standardisés

### 📊 [Module Analytics Sponsors](analytics/)

Documentation complète du module Analytics.

- [README Analytics](analytics/README.md) - Point d'entrée
- [Onboarding développeur](analytics/ONBOARDING_DEV.md) - Setup < 1h
- [Guide d'implémentation](analytics/IMPLEMENTATION.md) - Backend/DB
- [Tracking impressions](analytics/TRACKING_IMPRESSIONS.md) - Boîtiers TV
- [Rapports PDF](analytics/PDF_REPORTS_GUIDE.md) - Génération graphiques
- [Tests](analytics/TESTS.md)
- [Avancement](analytics/AVANCEMENT.md) - Progression semaines 1-3

### ☁️ [Déploiement](deployment/)

Guides pour déployer en production.

- [Guide mise en production](deployment/GUIDE_MISE_EN_PRODUCTION.md) (48K)
- [Déploiement serveur central](deployment/DEPLOY_CENTRAL_SERVER.md)

### 📈 [Business & Roadmap](business/)

Documentation business, stratégie et planification.

- [STATUS](business/STATUS.md) - État du projet (9.2/10) ⭐
- [Business Plan complet](business/BUSINESS_PLAN_COMPLET.md) (113K)
- [Roadmap vers le 10/10](business/ROADMAP_10_SUR_10.md) (37K)
- [Backlog](business/BACKLOG.md) - Sprint tracking (23K)

### 🔍 [Audits](audit/)

Rapports d'audit techniques et de conformité.

- [Audit RGPD/Sécurité 29 déc 2025](audit/AUDIT_RGPD_SECURITE_2025-12-29.md) - **Conformité RGPD**
- [Audit plateforme 25 déc 2025](audit/AUDIT_PLATEFORME_COMPLET_2025.md) (41K) - **Source de vérité**
- [Analyse stratégie produit](audit/PRODUCT_STRATEGY_ANALYSIS.md) (33K)
- [Audit documentation 25 déc 2025](audit/AUDIT_DOCS_2025-12-25.md) - Structure et doublons

### 📜 [Documentation Juridique](legal/)

Documents légaux et conformité RGPD.

- [Politique de Confidentialité](legal/PRIVACY_POLICY.md) - RGPD Art. 13-14
- [Conditions Générales d'Utilisation](legal/TERMS_OF_SERVICE.md) - CGU
- [Conditions Générales de Vente](legal/GENERAL_SALES_CONDITIONS.md) - CGV B2B
- [Registre des Traitements](legal/GDPR_PROCESSING_REGISTER.md) - RGPD Art. 30

### 📝 [Changelog](changelog/)

Historique des modifications et commits.

- [CHANGELOG principal](changelog/CHANGELOG.md) - Historique consolidé
- Changelogs par feature (2025-12-\*.md)

### 💻 [Documentation Développeur](dev/)

Setup environnement et conventions de code.

### 📦 [Archive](archive/)

Fichiers obsolètes et historiques.

- [Audits archivés](archive/audits/) - Anciens audits (avant 25/12)
- [Rapports temporels](archive/reports/) - Corrections et sessions
- [Fixes spécifiques](archive/fixes/) - Correctifs ponctuels
- [Commits individuels](archive/commits/) - 138 fichiers changelog granulaires

---

## 🏗️ Structure du Projet

```
neopro/
├── raspberry/                      # Edge application (Raspberry Pi)
│   ├── src/                        # Angular 20 frontend (TV/Remote/Login)
│   ├── server/                     # Socket.IO local server (port 3000)
│   ├── admin/                      # Admin interface (port 8080)
│   └── sync-agent/                 # Sync service with cloud
│       └── src/commands/           # Handlers (update_config, fix_permissions, remote_shell)
│
├── central-server/                 # Cloud API backend (Node.js 20/Express/TypeScript)
│   └── src/                        # Controllers, routes, middleware, services
├── central-dashboard/              # Cloud admin dashboard (Angular 20.3)
│   └── src/app/features/sites/     # Gestion sites (4 tabs: État/Contenu/Params/Debug)
├── server-render/                  # Cloud WebSocket server
├── e2e/                           # End-to-end tests (Playwright)
│
├── docs/                          # Documentation (vous êtes ici)
└── README.md                      # Point d'entrée principal
```

---

## 🎯 Par où commencer ?

### Nouveau Raspberry Pi ?

→ **[guides/INSTALLATION_COMPLETE.md](guides/INSTALLATION_COMPLETE.md)** (installation complète)
→ **[guides/GOLDEN_IMAGE.md](guides/GOLDEN_IMAGE.md)** (déploiement rapide)

### Problème technique ?

→ **[guides/TROUBLESHOOTING.md](guides/TROUBLESHOOTING.md)**

### Comprendre l'architecture ?

→ **[technical/ARCHITECTURE.md](technical/ARCHITECTURE.md)**
→ **[technical/REFERENCE.md](technical/REFERENCE.md)**

### Développer sur Analytics Sponsors ?

→ **[analytics/README.md](analytics/README.md)**
→ **[analytics/ONBOARDING_DEV.md](analytics/ONBOARDING_DEV.md)**

### Déployer en production ?

→ **[deployment/GUIDE_MISE_EN_PRODUCTION.md](deployment/GUIDE_MISE_EN_PRODUCTION.md)**

### Comprendre le business ?

→ **[business/STATUS.md](business/STATUS.md)**
→ **[business/BUSINESS_PLAN_COMPLET.md](business/BUSINESS_PLAN_COMPLET.md)**

---

## 📊 État du Projet

**Note globale** : 9.2/10 (voir [business/STATUS.md](business/STATUS.md))

| Module             | État          | Note   |
| ------------------ | ------------- | ------ |
| Analytics Club     | ✅ Production | 10/10  |
| Analytics Sponsors | ✅ Production | 9.5/10 |
| Synchronisation    | ✅ Production | 9/10   |
| Dashboard Admin    | ✅ Production | 9/10   |
| Raspberry Pi Edge  | ✅ Production | 9/10   |

---

## 🔗 Liens Utiles

- **Déploiement Cloud**
  - Central Server: https://neopro-central-production.up.railway.app
  - Dashboard Admin: https://neopro-admin.kalonpartners.bzh

- **GitHub**
  - Repository principal
  - Issues & Pull Requests

- **Documentation Externe**
  - [Supabase Docs](https://supabase.com/docs)
  - [Angular Docs](https://angular.dev)
  - [Socket.IO Docs](https://socket.io/docs)

---

**Dernière mise à jour** : 8 janvier 2026 - Fix bug espace disque update-software, mise à jour stack

**Version** : 2.13.1
