# Neopro - Système de télévision interactive pour clubs sportifs

Plateforme complète de gestion et de diffusion de contenu vidéo pour clubs sportifs, basée sur Raspberry Pi synchronisés avec un serveur central cloud.

## Table des matières

- [Démarrage rapide](#-démarrage-rapide)
- [Architecture](#-architecture-du-projet)
- [Développement local](#-développement-local)
- [Déploiement](#-déploiement)
- [Documentation](#-documentation-complète)
- [Support](#-support)

---

## Démarrage rapide

### Nouveau Raspberry Pi (première installation)

Si votre Raspberry Pi n'a jamais été configuré, suivez le guide complet :

**[Guide d'installation complète](docs/INSTALLATION_COMPLETE.md)**

Ce guide couvre :
1. Flash de la carte SD avec Raspberry Pi OS
2. Installation système (`install.sh`) - ~30 min
3. Configuration du club (`setup-new-club.sh`) - ~10 min

### Configurer un nouveau club (Pi déjà installé)

**Prérequis :** Le Raspberry Pi doit avoir été configuré avec `install.sh`

```bash
./raspberry/scripts/setup-new-club.sh
```

Le script interactif va :
- Collecter les infos du club (nom, localisation, contact)
- Créer le mot de passe d'accès
- Builder l'application Angular
- Déployer sur le Raspberry Pi
- Connecter au serveur central

**Informations à préparer :**
- Nom du club (ex: CESSON, RENNES)
- Ville et région
- Email de contact
- Mot de passe (12+ caractères)
- Adresse du Pi (neopro.local par défaut)

### Mettre à jour un boîtier existant

**Via l'interface web (recommandé) :**

1. Ouvrir `http://neopro.local:8080`
2. Modifier la configuration dans l'éditeur
3. Cliquer "Sauvegarder et Redémarrer"

**Via script :**

```bash
# Modifier la configuration
nano raspberry/config/templates/CLUB_NAME-configuration.json

# Builder et déployer
npm run deploy:raspberry neopro.local
```

---

## Accès aux interfaces

Une fois configuré, le boîtier est accessible via :

| Interface | URL | Description |
|-----------|-----|-------------|
| Login | http://neopro.local/login | Page de connexion |
| TV | http://neopro.local/tv | Affichage télévision |
| Remote | http://neopro.local/remote | Télécommande mobile |
| Admin | http://neopro.local:8080 | Administration locale |

**WiFi :** NEOPRO-[NOM_DU_CLUB]

**Dashboard central :** https://neopro-dashboard.onrender.com

---

## Architecture du projet

```
neopro/
├── raspberry/                    # Application Raspberry Pi
│   ├── frontend/                 # Angular (TV/Remote/Login)
│   ├── server/                   # Serveur Socket.IO local
│   ├── admin/                    # Interface admin (port 8080)
│   ├── sync-agent/               # Synchronisation serveur central
│   ├── scripts/                  # Scripts déploiement
│   │   ├── setup-new-club.sh     # Configuration nouveau club
│   │   ├── build-and-deploy.sh   # Build + déploiement
│   │   ├── diagnose-pi.sh        # Diagnostic complet
│   │   ├── backup-club.sh        # Sauvegarde configuration
│   │   └── restore-club.sh       # Restauration configuration
│   ├── tools/                    # Outils SD card / image golden
│   └── config/
│       ├── systemd/              # Services systemd
│       └── templates/            # Templates configuration JSON
│
├── central-server/               # API Backend (Node.js/Express)
│   ├── src/
│   │   ├── controllers/          # Logique métier
│   │   ├── routes/               # Routes API REST
│   │   ├── middleware/           # Auth, validation, rate-limit
│   │   ├── services/             # Socket.IO, email
│   │   └── scripts/              # Migrations, seeds
│   └── Dockerfile
│
├── central-dashboard/            # Dashboard admin (Angular 17)
│   └── src/
│       ├── app/
│       │   ├── features/         # Sites, Dashboard, Admin
│       │   └── core/             # Services, guards, models
│       └── environments/
│
├── server-render/                # Serveur Socket.IO cloud
│
├── e2e/                          # Tests E2E (Playwright)
├── docker/                       # Config monitoring (Prometheus/Grafana)
├── k8s/                          # Configuration Kubernetes
├── docs/                         # Documentation (180+ fichiers)
│
├── render.yaml                   # Déploiement Render.com
├── docker-compose.yml            # Stack développement local
├── angular.json                  # Configuration Angular CLI
└── .env.example                  # Template variables d'environnement
```

### Technologies

| Composant | Technologies |
|-----------|-------------|
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS |
| Frontend Dashboard | Angular 17, Chart.js, Leaflet |
| Backend API | Node.js 18+, Express, PostgreSQL, Redis |
| WebSocket | Socket.IO 4.7 |
| Base de données | Supabase (PostgreSQL) |
| Cache | Redis (Upstash) |
| Tests | Jest, Karma, Playwright |

---

## Développement local

### Prérequis

- Node.js 20+
- Angular CLI 20.3.3
- Docker (optionnel, pour la stack complète)

### Configuration

```bash
# Cloner le projet
git clone <repo-url>
cd neopro

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs
```

### Démarrage

**Option 1 : Script automatique**
```bash
./dev-local.sh
```

**Option 2 : Manuel**
```bash
# Terminal 1 - Frontend Raspberry (port 4200)
npm start

# Terminal 2 - Dashboard central (port 4300)
npm run start:central

# Terminal 3 - Socket.IO server (port 3000)
cd server-render && node server.js

# Terminal 4 - Admin interface (port 8080)
cd raspberry/admin && node admin-server-demo.js
```

**Option 3 : Docker Compose (stack complète)**
```bash
docker-compose up -d
```
Services : PostgreSQL (5432), Redis (6379), API (3001), Prometheus (9090), Grafana (3000)

### Commandes npm

| Commande | Description |
|----------|-------------|
| `npm start` | Frontend Raspberry (dev) |
| `npm run start:central` | Dashboard central (dev) |
| `npm run build` | Build les 2 projets Angular |
| `npm run build:raspberry` | Build pour déploiement Pi |
| `npm run build:central` | Build dashboard |
| `npm run deploy:raspberry <host>` | Déployer sur un Pi |
| `npm test` | Tests (tous les projets) |
| `npm run test:raspberry` | Tests frontend Raspberry |
| `npm run test:central` | Tests dashboard |
| `npm run test:server` | Tests API (Jest) |
| `npm run lint` | Linting |
| `npm run server` | Serveur Socket.IO local |

---

## Déploiement

### Cloud (Render.com)

| Service | Type | Description |
|---------|------|-------------|
| neopro-central-server | Web Service | API REST + WebSocket |
| neopro-dashboard | Static Site | Dashboard admin Angular |

Configuration : voir `render.yaml`

**Guide complet :** [GUIDE_MISE_EN_PRODUCTION.md](GUIDE_MISE_EN_PRODUCTION.md)

### Raspberry Pi

```bash
# Nouveau club
./raspberry/scripts/setup-new-club.sh

# Mise à jour
npm run deploy:raspberry neopro.local

# Image golden (déploiement en masse)
./raspberry/tools/prepare-golden-image.sh
./raspberry/tools/clone-sd-card.sh
```

---

## Dépannage rapide

### Le boîtier ne répond pas

```bash
# Vérifier la connectivité
ping neopro.local

# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'

# Diagnostic complet
ssh pi@neopro.local 'cd /home/pi/neopro && ./scripts/diagnose-pi.sh'

# Redémarrer
ssh pi@neopro.local 'sudo reboot'
```

### Le site n'apparaît pas sur le dashboard central

```bash
# Vérifier le sync-agent
ssh pi@neopro.local 'sudo systemctl status neopro-sync'

# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 50'

# Réenregistrer le site
ssh pi@neopro.local 'cd /home/pi/neopro/sync-agent && sudo node scripts/register-site.js && sudo systemctl restart neopro-sync'
```

### Services systemd

```bash
# Statut des services
sudo systemctl status neopro-app      # Application principale
sudo systemctl status neopro-admin    # Interface admin
sudo systemctl status neopro-sync     # Sync-agent
sudo systemctl status neopro-kiosk    # Mode kiosk (Chromium)

# Redémarrer un service
sudo systemctl restart neopro-app
```

---

## Documentation complète

| Document | Description |
|----------|-------------|
| [docs/INDEX.md](docs/INDEX.md) | Index de toute la documentation |
| [docs/REFERENCE.md](docs/REFERENCE.md) | Documentation technique complète |
| [docs/INSTALLATION_COMPLETE.md](docs/INSTALLATION_COMPLETE.md) | Installation Raspberry Pi |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Dépannage approfondi |
| [docs/GOLDEN_IMAGE.md](docs/GOLDEN_IMAGE.md) | Création d'image golden |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Guide de configuration |
| [docs/SYNC_ARCHITECTURE.md](docs/SYNC_ARCHITECTURE.md) | Architecture de synchronisation |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Guide des tests |
| [GUIDE_MISE_EN_PRODUCTION.md](GUIDE_MISE_EN_PRODUCTION.md) | Mise en production cloud |

---

## Checklist nouveau club

- [ ] Script `setup-new-club.sh` exécuté
- [ ] Application accessible sur http://neopro.local/login
- [ ] Login fonctionne avec le mot de passe configuré
- [ ] Pages /tv et /remote accessibles
- [ ] Interface admin accessible (port 8080)
- [ ] Site visible sur le dashboard central (statut: En ligne)
- [ ] Vidéos du club copiées et configurées
- [ ] WiFi NEOPRO-[CLUB] fonctionnel
- [ ] Utilisateurs formés

---

## Support

- **Diagnostic automatique :** `./raspberry/scripts/diagnose-pi.sh`
- **Documentation :** [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Logs application :** `ssh pi@neopro.local 'sudo journalctl -u neopro-app -f'`
- **Logs sync :** `ssh pi@neopro.local 'sudo journalctl -u neopro-sync -f'`

---

**Version :** 2.0
**Licence :** MIT
**Dernière mise à jour :** 14 décembre 2025
