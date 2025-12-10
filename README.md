# Neopro - Système de télévision interactive pour clubs sportifs

## 🚀 Vous êtes ici pour :

### 0️⃣ TOUT NOUVEAU Raspberry Pi (première installation)

⚠️ **Si votre Raspberry Pi n'a jamais été configuré**, suivez d'abord le guide complet :

👉 **[Guide d'installation complète](docs/INSTALLATION_COMPLETE.md)**

Ce guide couvre :
1. Flash de la carte SD
2. Installation système (install.sh) - 30 min
3. Configuration du club (setup-new-club.sh) - 10 min

---

### 1️⃣ Configurer un NOUVEAU club (Raspberry Pi déjà installé)

⚠️ **Prérequis :** Le Raspberry Pi doit déjà être configuré avec `install.sh` (voir section 0️⃣)

```bash
./raspberry/scripts/setup-new-club.sh
```

**Durée : 5-10 minutes**

Ce script va tout faire automatiquement :
- ✅ Collecter les infos du club (nom, localisation, contact)
- ✅ Créer le mot de passe d'accès
- ✅ Builder l'application
- ✅ Déployer sur le Raspberry Pi
- ✅ Connecter au serveur central

**Informations à préparer :**
- Nom du club (ex: CESSON, RENNES)
- Ville, région
- Email de contact
- Mot de passe souhaité (12+ caractères)
- Adresse du Pi (neopro.local par défaut)

---

### 2️⃣ Mettre à jour un boîtier existant

#### Option A : Via l'interface web (RECOMMANDÉ)

1. Connectez-vous à `http://neopro.local:8080`
2. Modifiez la configuration dans l'éditeur
3. Cliquez sur "Sauvegarder et Redémarrer"

**C'est tout !** L'interface redémarre automatiquement avec la nouvelle config.

#### Option B : Via script (pour changements techniques)

```bash
# 1. Modifier la configuration
nano raspberry/config/templates/CLUB_NAME-configuration.json

# 2. Copier dans webapp/
mkdir -p webapp
cp raspberry/config/templates/CLUB_NAME-configuration.json webapp/configuration.json

# 3. Builder
npm run build:raspberry

# 4. Déployer
npm run deploy:raspberry neopro.local
```

---

## 📱 Accès aux interfaces

Une fois configuré, votre boîtier est accessible via :

| Interface | URL | Usage |
|-----------|-----|-------|
| **Login** | http://neopro.local/login | Page de connexion |
| **TV** | http://neopro.local/tv | Mode télévision (après login) |
| **Remote** | http://neopro.local/remote | Télécommande (après login) |
| **Admin** | http://neopro.local:8080 | Interface d'administration |

**WiFi :** NEOPRO-[NOM_DU_CLUB]

---

## 🔧 Dépannage rapide

### Le boîtier ne répond pas

```bash
# 1. Vérifier que le Pi est accessible
ping neopro.local

# 2. Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'

# 3. Redémarrer
ssh pi@neopro.local 'sudo reboot'
```

### Erreur 500 sur /tv ou /remote

```bash
# Diagnostic complet
ssh pi@neopro.local
cd /home/pi/neopro
./scripts/diagnose-pi.sh
```

### Le site n'apparaît pas sur le serveur central

```bash
# Vérifier le sync-agent
ssh pi@neopro.local 'sudo systemctl status neopro-sync'

# Voir les logs du sync
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 50'

# Réenregistrer
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js
sudo systemctl restart neopro-sync
```

---

## 📊 Serveur central

**Dashboard :** https://neopro-dashboard.onrender.com

Vous y verrez :
- 🟢 Liste des sites en ligne
- 📊 Statistiques de chaque club
- ⚠️ Alertes en cas de problème
- 📈 Métriques d'utilisation

---

## 📚 Documentation complète

| Document | Description |
|----------|-------------|
| [docs/INDEX.md](docs/INDEX.md) | Index de toute la documentation |
| [docs/REFERENCE.md](docs/REFERENCE.md) | Documentation technique complète |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Dépannage approfondi |
| [docs/INSTALLATION_COMPLETE.md](docs/INSTALLATION_COMPLETE.md) | Guide d'installation Raspberry Pi |

---

## 🏗️ Architecture du projet

```
neopro/
├── raspberry/                    # Tout ce qui tourne sur le Raspberry Pi
│   ├── frontend/                 # Application Angular (webapp TV/Remote/Login)
│   ├── public/                   # Assets statiques
│   ├── scripts/                  # Scripts de déploiement
│   │   ├── setup-new-club.sh    # ⭐ Configuration nouveau club
│   │   ├── build-and-deploy.sh  # Build + déploiement combinés
│   │   ├── build-raspberry.sh   # Build seul pour Pi
│   │   └── deploy-remote.sh     # Déploiement SSH seul
│   ├── config/
│   │   ├── systemd/             # Services systemd (*.service)
│   │   └── templates/           # Templates de configuration JSON
│   ├── server/                   # Serveur Socket.IO local
│   ├── admin/                    # Interface admin (port 8080)
│   └── sync-agent/              # Agent de synchronisation central
├── central-dashboard/            # Dashboard admin Angular (Render.com)
│   └── src/                      # Code source Angular
├── central-server/               # API Backend (Render.com + Supabase)
├── server-render/                # Serveur Socket.IO (Render.com)
├── render.yaml                   # Configuration déploiement Render.com
├── .env.example                  # Template variables d'environnement
└── docs/                         # Documentation
```

**Projets Angular :**
- `raspberry` : Interface TV/Remote/Login pour le boîtier Raspberry Pi
- `central-dashboard` : Dashboard d'administration centralisé

---

## 🆘 Support

- **Diagnostic automatique :** `./raspberry/scripts/diagnose-pi.sh`
- **Documentation :** [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Logs application :** `ssh pi@neopro.local 'sudo journalctl -u neopro-app -f'`
- **Logs sync :** `ssh pi@neopro.local 'sudo journalctl -u neopro-sync -f'`

---

## 🎯 Checklist nouveau club

- [ ] Script `setup-new-club.sh` exécuté
- [ ] Application accessible sur http://neopro.local/login
- [ ] Login fonctionne avec le mot de passe configuré
- [ ] Accès à /tv et /remote OK
- [ ] Interface admin accessible (port 8080)
- [ ] Site visible sur le dashboard central (🟢 En ligne)
- [ ] Vidéos du club copiées et configurées
- [ ] WiFi NEOPRO-[CLUB] fonctionnel
- [ ] Utilisateurs formés

---

## 💻 Développement local

### Prérequis

- Node.js 20+
- Angular CLI 20.3.3

### Configuration

```bash
# Copier le fichier d'environnement
cp .env.example .env

# Modifier avec vos valeurs (Supabase, etc.)
nano .env
```

### Démarrage rapide

```bash
# Script automatique (recommandé)
./dev-local.sh

# Ou manuel
npm install
npm start                         # Raspberry frontend http://localhost:4200
npm run start:central             # Central dashboard http://localhost:4300
cd server-render && node server.js  # Socket.IO port 3000
cd raspberry/admin && node admin-server-demo.js  # Admin port 8080
```

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm start` | Démarre le frontend Raspberry (dev) |
| `npm run start:central` | Démarre le dashboard central (dev) |
| `npm run build` | Build les 2 projets Angular |
| `npm run build:raspberry` | Build + package pour déploiement Pi |
| `npm run build:central` | Build du dashboard central |
| `npm run deploy:raspberry` | Build + déploiement sur le Pi |
| `npm test` | Lance les tests des 2 projets |
| `npm run test:raspberry` | Tests du frontend Raspberry |
| `npm run test:central` | Tests du dashboard central |
| `npm run lint` | Lint des 2 projets |

---

## 🚀 Déploiement Cloud

| Service | Hébergement | Base de données |
|---------|-------------|-----------------|
| Central Server (API) | Render.com | Supabase (PostgreSQL) |
| Central Dashboard | Render.com (static) | - |
| Socket Server | Render.com | - |

Configuration : voir `render.yaml`

---

**Version :** 1.0
**Licence :** MIT
**Dernière mise à jour :** 10 décembre 2025
