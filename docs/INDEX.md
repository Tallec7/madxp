# Documentation Neopro

## 📖 Documents principaux

### Pour utiliser Neopro

1. **[README.md](../README.md)** - **COMMENCER ICI**
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

7. **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md)** - Business Plan technique
   - Executive Summary
   - Architecture technique
   - Roadmap et phases
   - Modèle économique

8. **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)** - Architecture de synchronisation *(nouveau)*
   - Modèle Central vs Local
   - Types de contenu (NEOPRO verrouillé vs Club éditable)
   - Règles de merge intelligent
   - Scénarios d'usage (annonceurs nationaux, contenu local)
   - Personas (NEOPRO, Opérateur Club, Partenaires)

### Pour les développeurs

9. **[dev/README.md](dev/README.md)** - Documentation développement
   - Configuration environnement
   - Conventions de code
   - Tests

10. **[changelog/README.md](changelog/README.md)** - Historique des modifications
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

**Dernière mise à jour :** 10 décembre 2025
