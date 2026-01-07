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

**Prérequis :** Le Raspberry Pi doit avoir été configuré avec `install.sh` ou `setup.sh`

**Il existe 2 méthodes :**

#### ✅ Méthode Remote (RECOMMANDÉE - Production)

**Sans dépendance au dossier Neopro local** - Fonctionne depuis n'importe quel ordinateur :

```bash
# Télécharger le script
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
chmod +x setup-remote-club.sh

# Lancer la configuration
./setup-remote-club.sh
```

**Avantages :**

- ✅ Aucune dépendance locale (pas besoin du projet Neopro)
- ✅ Télécharge depuis GitHub Releases (toujours à jour)
- ✅ Rapide : 2-5 minutes
- ✅ Installation terrain facilitée

#### 🔧 Méthode Local (Développement)

**Nécessite le dossier Neopro complet** - Pour développement et tests :

```bash
./raspberry/scripts/setup-new-club.sh
```

**Avantages :**

- ✅ Build local (modifications custom possibles)
- ✅ Tests de développement

---

Les deux scripts vont :

- Collecter les infos du club (nom, localisation, contact)
- Créer le mot de passe d'accès
- Déployer sur le Raspberry Pi
- Configurer le WiFi hotspot
- Connecter au serveur central (optionnel)

**Informations à préparer :**

- Nom du club (ex: CESSON, RENNES)
- Ville et région
- Email de contact
- Mot de passe (12+ caractères)
- Adresse du Pi (neopro.local par défaut)

📖 **[Guide complet des deux méthodes](raspberry/scripts/CLUB-SETUP-README.md)**

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

| Interface | URL                        | Description           |
| --------- | -------------------------- | --------------------- |
| Login     | http://neopro.local/login  | Page de connexion     |
| TV        | http://neopro.local/tv     | Affichage télévision  |
| Remote    | http://neopro.local/remote | Télécommande mobile   |
| Admin     | http://neopro.local:8080   | Administration locale |

**WiFi :** NEOPRO-[NOM_DU_CLUB]

**Dashboard central :** https://neopro-admin.kalonpartners.bzh

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

| Composant          | Technologies                                              |
| ------------------ | --------------------------------------------------------- |
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS                        |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, ngx-translate (i18n: EN/FR/ES) |
| Backend API        | Node.js 20+, Express 4.18, TypeScript strict              |
| Base de données    | PostgreSQL 15 (Supabase)                                  |
| Stockage vidéos    | FTP (Hostinger) + Supabase Storage (fallback)             |
| WebSocket          | Socket.IO 4.8                                             |
| Cache              | Redis (Upstash) - optionnel                               |
| Auth               | JWT HttpOnly cookie + Bearer token + MFA (TOTP)           |
| Logs               | Winston + Logtail (Better Stack)                          |
| Tests              | Jest + Supertest (API), Karma (Angular), Playwright (E2E) |

---

## Développement local

### Prérequis

- Node.js 20+ (LTS recommandé)
- npm 10+
- Angular CLI 20+
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

| Commande                          | Description                 |
| --------------------------------- | --------------------------- |
| `npm start`                       | Frontend Raspberry (dev)    |
| `npm run start:central`           | Dashboard central (dev)     |
| `npm run build`                   | Build les 2 projets Angular |
| `npm run build:raspberry`         | Build pour déploiement Pi   |
| `npm run build:central`           | Build dashboard             |
| `npm run deploy:raspberry <host>` | Déployer sur un Pi          |
| `npm test`                        | Tests (tous les projets)    |
| `npm run test:raspberry`          | Tests frontend Raspberry    |
| `npm run test:central`            | Tests dashboard             |
| `npm run test:server`             | Tests API (Jest)            |
| `npm run lint`                    | Linting                     |
| `npm run server`                  | Serveur Socket.IO local     |

---

## Déploiement

### Cloud

| Service              | Hébergeur | URL                                    |
| -------------------- | --------- | -------------------------------------- |
| API (central-server) | Render    | https://neopro-central.onrender.com    |
| Dashboard admin      | Hostinger | https://neopro-admin.kalonpartners.bzh |

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

## Sécurité

### Authentification

| Interface         | Méthode         | Stockage             |
| ----------------- | --------------- | -------------------- |
| Dashboard Central | HttpOnly Cookie | Serveur (cookie)     |
| Admin Raspberry   | Session Cookie  | Local (session)      |
| Webapp Raspberry  | JWT (mémoire)   | Configuration locale |

### Bonnes pratiques

1. **Première connexion Admin Raspberry** : Définir un mot de passe fort (12+ caractères)
2. **CORS** : Toujours configurer `ALLOWED_ORIGINS` en production
3. **HTTPS** : Utiliser un reverse proxy (nginx) avec certificat SSL
4. **Mots de passe** : Ne jamais utiliser le mot de passe par défaut

### Variables d'environnement

```bash
# === OBLIGATOIRES ===
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=minimum-32-caracteres-random
ALLOWED_ORIGINS=https://dashboard.example.com

# === BASE DE DONNÉES ===
DATABASE_SSL=true

# === STOCKAGE VIDÉOS ===
FTP_HOST=ftp.example.com
FTP_USER=xxx
FTP_PASSWORD=xxx
FTP_PUBLIC_URL=https://cdn.example.com/videos
# Fallback Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# === EMAIL (password reset, alertes) ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASSWORD=xxx

# === OPTIONNEL ===
LOG_LEVEL=info              # debug, info, warn, error
LOGTAIL_TOKEN=xxx           # Logs centralisés
REDIS_URL=redis://xxx       # Pour Socket.IO multi-instance
NODE_ENV=production
```

**Documentation complète des variables :** [CLAUDE.md](CLAUDE.md#variables-denvironnement)

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

| Document                                                       | Description                      |
| -------------------------------------------------------------- | -------------------------------- |
| [docs/INDEX.md](docs/INDEX.md)                                 | Index de toute la documentation  |
| [docs/REFERENCE.md](docs/REFERENCE.md)                         | Documentation technique complète |
| [docs/INSTALLATION_COMPLETE.md](docs/INSTALLATION_COMPLETE.md) | Installation Raspberry Pi        |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)             | Dépannage approfondi             |
| [docs/GOLDEN_IMAGE.md](docs/GOLDEN_IMAGE.md)                   | Création d'image golden          |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md)                 | Guide de configuration           |
| [docs/SYNC_ARCHITECTURE.md](docs/SYNC_ARCHITECTURE.md)         | Architecture de synchronisation  |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)                 | Guide des tests                  |
| [GUIDE_MISE_EN_PRODUCTION.md](GUIDE_MISE_EN_PRODUCTION.md)     | Mise en production cloud         |

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

**Version :** 2.6.1
**Licence :** MIT
**Dernière mise à jour :** 7 janvier 2026
