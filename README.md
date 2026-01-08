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
├── raspberry/                    # Application Raspberry Pi (Edge)
│   ├── src/                      # Angular 20 (TV/Remote/Login)
│   ├── server/                   # Serveur Socket.IO local (port 3000)
│   ├── admin/                    # Interface admin locale (port 8080)
│   ├── sync-agent/               # Agent synchronisation cloud
│   │   ├── src/
│   │   │   ├── agent.js          # Point d'entrée WebSocket
│   │   │   ├── commands/         # Handlers (update_config, deploy_video)
│   │   │   ├── watchers/         # Video-watcher (surveillance vidéos)
│   │   │   └── utils/            # Config-merge, version-info
│   │   └── scripts/              # register-site.js
│   ├── scripts/                  # Scripts déploiement
│   │   ├── setup-new-club.sh     # Config nouveau club (local)
│   │   ├── setup-remote-club.sh  # Config nouveau club (remote)
│   │   ├── build-and-deploy.sh   # Build + déploiement
│   │   ├── diagnose-pi.sh        # Diagnostic complet
│   │   ├── backup-club.sh        # Sauvegarde configuration
│   │   └── restore-club.sh       # Restauration configuration
│   ├── tools/                    # Outils SD card / image golden
│   └── config/
│       ├── systemd/              # Services systemd
│       └── templates/            # Templates configuration JSON
│
├── central-server/               # API Backend (Node.js/Express/TypeScript)
│   ├── src/
│   │   ├── controllers/          # Logique métier par domaine
│   │   ├── routes/               # Routes API REST
│   │   ├── middleware/           # Auth JWT, validation Joi, rate-limit, RLS
│   │   ├── services/             # Socket.IO, email, deployment, metrics
│   │   ├── handlers/             # Socket.IO event handlers
│   │   ├── types/                # Interfaces TypeScript
│   │   ├── config/               # Database, logger, Supabase, FTP
│   │   └── scripts/              # Migrations, seeds, CLI
│   └── Dockerfile
│
├── central-dashboard/            # Dashboard admin (Angular 20)
│   └── src/
│       ├── app/
│       │   ├── features/         # Sites, Content, Analytics, Users
│       │   │   └── sites/        # Gestion sites (tabs: État/Contenu/Params/Debug)
│       │   │       └── components/  # Composants modulaires
│       │   ├── core/             # Services, guards, interceptors
│       │   └── shared/           # Composants réutilisables
│       ├── assets/i18n/          # Traductions (EN/FR/ES)
│       └── environments/
│
├── server-render/                # Serveur Socket.IO cloud
│
├── e2e/                          # Tests E2E (Playwright)
├── docker/                       # Config monitoring (Prometheus/Grafana)
├── k8s/                          # Configuration Kubernetes
├── docs/                         # Documentation (180+ fichiers)
│
├── render.yaml                   # Déploiement Render.com/Railway
├── docker-compose.yml            # Stack développement local
├── angular.json                  # Configuration Angular CLI
└── .env.example                  # Template variables d'environnement
```

### Technologies

| Composant          | Technologies                                                  |
| ------------------ | ------------------------------------------------------------- |
| Frontend Raspberry | Angular 20.3, Socket.IO client 4.8, Video.js 8.x, SCSS        |
| Frontend Dashboard | Angular 20.3, Chart.js 4.5, Leaflet, ngx-translate (EN/FR/ES) |
| Backend API        | Node.js 20+, Express 4.18, TypeScript 5.9 strict              |
| Base de données    | PostgreSQL 15 (Supabase) - Pool: 5 connexions                 |
| Stockage vidéos    | FTP (Hostinger) + Supabase Storage (fallback)                 |
| WebSocket          | Socket.IO 4.8                                                 |
| Cache              | Redis (Upstash) - optionnel, pour scaling horizontal          |
| Auth               | JWT HttpOnly cookie + Bearer token + MFA (TOTP)               |
| Logs               | Winston + Logtail (Better Stack) + Correlation ID             |
| Hébergement        | Railway (API), Hostinger (Dashboard)                          |
| Tests              | Jest + Supertest (API), Karma (Angular), Playwright (E2E)     |

### Fonctionnalités clés

- **Gestion de flotte** : 50+ boîtiers Raspberry Pi gérés depuis un dashboard central
- **Déploiement vidéo** : Upload cloud → déploiement automatique vers les Pi
- **Boucles par phase** : Playlists différentes selon la phase du match (avant/pendant/après)
- **Terminal distant** : Exécution de commandes shell sur les Pi via WebSocket (résultats asynchrones)
- **Sécurité remote shell** : Whitelist/blacklist par rôle, protection contre commandes destructives
- **Double-buffer vidéo** : Transitions sans flash entre les vidéos de la boucle
- **Analytics** : Statistiques d'impressions sponsors, exports PDF
- **Multi-tenant** : Rôles (super_admin, admin, operator, advertiser, agency)
- **i18n** : Dashboard multilingue (EN/FR/ES)

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

| Commande                          | Description                  |
| --------------------------------- | ---------------------------- |
| `npm start`                       | Frontend Raspberry (dev)     |
| `npm run start:central`           | Dashboard central (dev)      |
| `npm run build`                   | Build les 2 projets Angular  |
| `npm run build:raspberry`         | Build pour déploiement Pi    |
| `npm run build:central`           | Build dashboard              |
| `npm run deploy:raspberry <host>` | Déployer sur un Pi           |
| `npm test`                        | Tests (tous les projets)     |
| `npm run test:raspberry`          | Tests frontend Raspberry     |
| `npm run test:central`            | Tests dashboard              |
| `npm run test:server`             | Tests API (Jest)             |
| `npm run lint`                    | Linting                      |
| `npm run server`                  | Serveur Socket.IO local      |
| `npm run i18n:check`              | Vérifier synchro traductions |

### Internationalisation (i18n)

Le dashboard central supporte 3 langues : **Anglais (EN)**, **Français (FR)**, **Espagnol (ES)**.

**Fichiers de traduction :** `central-dashboard/src/assets/i18n/{en,fr,es}.json`

**Scripts de vérification :**

```bash
# Vérifier que toutes les clés sont synchronisées entre langues
npm run i18n:check

# Détecter le texte hardcodé en français dans les composants
npm run i18n:hardcoded
```

Ces vérifications sont automatiquement exécutées en pre-commit via Husky.

---

## Déploiement

### Cloud

| Service              | Hébergeur | URL                                              |
| -------------------- | --------- | ------------------------------------------------ |
| API (central-server) | Railway   | https://neopro-central-production.up.railway.app |
| Dashboard admin      | Hostinger | https://neopro-admin.kalonpartners.bzh           |

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
ssh pi@neopro.local 'sudo systemctl status neopro-sync-agent'

# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 50'

# Réenregistrer le site
ssh pi@neopro.local 'cd /home/pi/neopro/sync-agent && sudo node scripts/register-site.js && sudo systemctl restart neopro-sync-agent'
```

### Terminal distant (Remote Shell)

Le dashboard central permet d'exécuter des commandes shell directement sur les Pi connectés :

1. Ouvrir le détail d'un site sur le dashboard
2. Aller dans l'onglet **Debug**
3. Utiliser le terminal pour exécuter des commandes

**Commandes utiles :**

```bash
df -h                                    # Espace disque
du -sh /* 2>/dev/null | sort -hr | head -15  # Utilisation par dossier
cat /home/pi/neopro/webapp/configuration.json | head -50
journalctl -u neopro-app -n 50 --no-pager
systemctl status neopro-*
ls -la /home/pi/neopro/videos/
find /home/pi/neopro -name "*.js" -path "*sync*" | head -20
```

**Sécurité par rôle :**

| Rôle        | Accès                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| super_admin | Toutes commandes sauf blacklist (rm -rf autorisé sur /tmp/, /var/tmp/) |
| admin       | Whitelist étendue (systemctl, kill, curl, wget...)                     |
| operator    | Whitelist stricte (ls, cat, df, ps, journalctl, ping...)               |
| viewer      | Aucun accès terminal                                                   |

**Commandes bloquées (tous rôles) :** rm -rf (sauf chemins sûrs), mkfs, dd, shutdown, passwd, chmod 777, eval, fork bombs...

**Note :** Le site doit être connecté (statut "En ligne") pour utiliser le terminal distant. Les résultats sont transmis via WebSocket pour éviter les timeouts.

### Services systemd

```bash
# Statut des services
sudo systemctl status neopro-app         # Serveur Socket.IO local (port 3000)
sudo systemctl status neopro-admin       # Interface admin (port 8080)
sudo systemctl status neopro-sync-agent  # Sync-agent (connexion cloud)
sudo systemctl status neopro-kiosk       # Mode kiosk (Chromium)

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
- **Logs sync :** `ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -f'`

---

**Version :** 2.13.1
**Licence :** MIT
**Dernière mise à jour :** 8 janvier 2026
