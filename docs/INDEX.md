# Documentation Neopro

## 🚀 PERDU ? COMMENCEZ ICI !

### **[START_HERE.md](START_HERE.md)** - 🎯 Guide de Navigation

**Nouveau sur le projet ?** Ce guide vous oriente selon votre profil :
- 👨‍💻 Développeur (backend, frontend, fullstack)
- 🎯 Chef de projet / Product Owner
- 🏗️ Ops / Installation
- 🆘 Dépannage

**Inclut** :
- Parcours recommandés par profil
- Navigation par mot-clé
- Documents à ignorer (obsolètes)
- Checklist "Je suis prêt"

---

## 📖 Documents principaux

### Pour utiliser Neopro

1. **[README.md](../README.md)** - Documentation Utilisateur
   - Configuration nouveau club
   - Mise à jour boîtier
   - Accès rapide aux interfaces
   - Dépannage rapide

### Pour les détails techniques

2. **[CONFIGURATION.md](CONFIGURATION.md)** - Guide des fichiers de configuration
   - `configuration.json` vs `.env` / `site.conf`
   - Ce qui est préservé lors d'une MAJ
   - Workflow de personnalisation d'un club
   - FAQ configuration

3. **[REFERENCE.md](REFERENCE.md)** - Documentation technique complète
   - Architecture détaillée
   - Configuration manuelle
   - Authentification
   - Serveur central
   - Scripts disponibles
   - API et WebSocket

4. **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Guide de dépannage
   - Problèmes de connexion
   - Erreurs 500
   - Authentification
   - Services
   - Synchronisation
   - Diagnostic complet

5. **[INSTALLATION_COMPLETE.md](INSTALLATION_COMPLETE.md)** - Installation Raspberry Pi
   - Méthode Image Golden (10 min)
   - Installation complète (45 min)
   - Configuration système

6. **[GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)** - Guide Image Golden
   - Création d'une image pré-configurée
   - Déploiement rapide de nouveaux boîtiers
   - Workflow optimal

### Architecture et Business

7. **[STATUS.md](STATUS.md)** - **État du projet (mise à jour quotidienne)**
   - Note globale : 9.2/10
   - Analytics Club (10/10)
   - Analytics Sponsors (9.5/10)
   - Features bonus et roadmap
   - Schéma base de données

8. **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md)** - Business Plan technique
   - Executive Summary
   - Architecture technique
   - Roadmap et phases
   - Modèle économique

9. **[BACKLOG.md](BACKLOG.md)** - Roadmap et Sprint Tracking
   - Features terminées récemment
   - Features en cours (Estimation audience, Score live)
   - Backlog priorisé
   - Planning sprints

10. **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)** - Architecture de synchronisation
   - Modèle Central vs Local
   - Types de contenu (NEOPRO verrouillé vs Club éditable)
   - Règles de merge intelligent
   - Scénarios d'usage (annonceurs nationaux, contenu local)
   - Personas (NEOPRO, Opérateur Club, Partenaires)

### Analytics Sponsors (Module complet)

11. **[ANALYTICS_SPONSORS_README.md](ANALYTICS_SPONSORS_README.md)** - **README Module Analytics Sponsors**
   - Vue d'ensemble et fonctionnalités
   - Architecture complète
   - Guides démarrage rapide
   - État du projet (98% conformité BP §13)

12. **[IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md)** - Guide implémentation
   - Schéma base de données
   - API endpoints détaillés
   - Intégration frontend/backend

13. **[TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)** - Tracking boîtiers TV
   - Architecture tracking temps réel
   - Service frontend Angular
   - Sync agent et serveur local
   - Flux de données end-to-end

14. **[PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)** - Rapports PDF professionnels
   - Structure 4 pages (garde, KPIs, graphiques, certificat)
   - Génération graphiques Chart.js
   - Signature numérique SHA-256
   - API et intégration

15. **[AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)** - Suivi progression
   - Planning semaines 1-3 (terminé)
   - Métriques conformité (95%)
   - Roadmap phases 4-5 (optionnel)

### Guides d'implémentation

16. **[IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md](IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md)** - **Guide Estimation Audience + Score Live**
   - Migration base de données (copy-paste ready)
   - Frontend Remote Control (badge audience + saisie score)
   - Frontend TV Player (overlay score en live)
   - Backend handlers WebSocket
   - CSS styles et test scenarios

### Pour les développeurs

17. **[dev/README.md](dev/README.md)** - Documentation développement
   - Configuration environnement
   - Conventions de code
   - Tests

18. **[changelog/README.md](changelog/README.md)** - Historique des modifications
   - Suivi des changements
   - Notes de version

---

## 🏗️ Structure du projet

```
neopro/
├── src/                          # Application Angular (webapp)
├── public/                       # Assets statiques
├── raspberry/
│   ├── scripts/                  # Scripts de déploiement
│   ├── config/
│   │   ├── systemd/             # Services systemd
│   │   └── templates/           # Templates configuration JSON
│   ├── server/                   # Serveur Socket.IO local
│   ├── admin/                    # Interface admin
│   └── sync-agent/              # Agent de synchronisation
├── central-server/               # API Backend (Render + Supabase)
├── central-dashboard/            # Dashboard admin Angular
├── server-render/                # Serveur Socket.IO cloud
├── docs/
│   ├── dev/                     # Documentation développement
│   ├── changelog/               # Historique des modifications
│   └── *.md                     # Documentation utilisateur
├── render.yaml                   # Config Render.com
├── .env.example                  # Variables d'environnement
├── .prettierrc                   # Config formatage code
└── LICENSE                       # Licence MIT
```

---

## 🚀 Déploiement

| Composant | Hébergement | Base de données |
|-----------|-------------|-----------------|
| Central Server | Render.com | Supabase (PostgreSQL) |
| Central Dashboard | Render.com (static) | - |
| Socket Server | Render.com | - |
| Raspberry Pi | Local (edge) | - |

Configuration : `render.yaml` à la racine

---

## 📋 Documentation par composant

| Composant | Documentation |
|-----------|---------------|
| Application principale | [README.md](../README.md) |
| Raspberry Pi | [raspberry/README.md](../raspberry/README.md) |
| Scripts déploiement | [raspberry/scripts/README.md](../raspberry/scripts/README.md) |
| Templates config | [raspberry/config/templates/README.md](../raspberry/config/templates/README.md) |
| Central Server | [central-server/README.md](../central-server/README.md) |
| Central Dashboard | [central-dashboard/README.md](../central-dashboard/README.md) |
| Socket Server | [server-render/README.md](../server-render/README.md) |

---

## 🚀 Par où commencer ?

### Vous avez un nouveau Raspberry Pi ?
→ **[GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)** si vous avez une image pré-configurée (10 min)
→ **[INSTALLATION_COMPLETE.md](INSTALLATION_COMPLETE.md)** pour installation depuis zéro (45 min)

### Vous voulez créer une Image Golden ?
→ **[GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)** - Guide complet

### Vous voulez mettre à jour un boîtier ?
→ **[README.md](../README.md)** section "2️⃣ Mettre à jour un boîtier existant"

### Vous avez un problème ?
→ **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

### Vous voulez comprendre en profondeur ?
→ **[REFERENCE.md](REFERENCE.md)**

### Vous voulez développer ?
→ Copiez `.env.example` vers `.env` et lancez `./dev-local.sh`

---

**Dernière mise à jour :** 15 décembre 2025 - Ajout STATUS.md, BACKLOG.md, IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md
