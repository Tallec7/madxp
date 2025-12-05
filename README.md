# Neopro

Système de gestion et d'affichage vidéo pour événements sportifs avec gestion de flotte centralisée.

## 🎯 Vue d'ensemble

Neopro permet aux clubs sportifs de gérer l'affichage de vidéos (sponsors, buts, jingles) sur écran TV durant les matchs, avec contrôle à distance depuis mobile/tablette.

**Architecture hybride :**
- **Raspberry Pi local** : Solution autonome pour chaque club (fonctionne sans internet)
- **Gestion centralisée** : Dashboard web pour l'équipe NEOPRO
- **Synchronisation** : Déploiement de contenu et mises à jour à distance

**Nouveauté 2025** : Système complet de gestion de flotte permettant à l'équipe NEOPRO de gérer tous les boîtiers depuis un dashboard unique.

## 📦 Architecture

### Architecture globale (Nouveauté 2025)

```
┌──────────────────────────────────────────────────────────────┐
│              QUARTIER GÉNÉRAL NEOPRO                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Central Dashboard (Angular)                        │    │
│  │  • Gestion des sites                                │    │
│  │  • Déploiement de contenu                           │    │
│  │  • Mises à jour OTA                                 │    │
│  │  • Monitoring temps réel                            │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Central Server (Node.js + PostgreSQL)             │    │
│  │  • REST API + WebSocket                             │    │
│  │  • Authentification JWT                             │    │
│  │  • Stockage métriques                               │    │
│  │  • Gestion des groupes                              │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│         Hébergé sur Render.com (~$14.50/mois)              │
└──────────────────────────────────────────────────────────────┘
                          ↓ Internet (WebSocket)
              ┌───────────┴───────────┬─────────────┐
              ↓                       ↓             ↓
┌─────────────────────┐  ┌─────────────────┐  ┌──────────────┐
│   CLUB RENNES       │  │  CLUB NANTES    │  │  CLUB ...    │
│                     │  │                 │  │              │
│  Raspberry Pi       │  │  Raspberry Pi   │  │  Raspberry   │
│  ├── App locale     │  │  ├── App locale │  │  ├── App...  │
│  ├── WiFi Hotspot   │  │  ├── WiFi...    │  │  ├── WiFi... │
│  ├── Sync Agent ◄───┼──┼──┼─ Sync...◄────┼──┼──┼─ Sync...  │
│  └── TV Display     │  │  └── TV...      │  │  └── TV...   │
│                     │  │                 │  │              │
│  Autonome (offline) │  │  Autonome       │  │  Autonome    │
└─────────────────────┘  └─────────────────┘  └──────────────┘
```

### Architecture locale (par club)

```
┌─────────────────────────────────────────────────────────┐
│                    CLUB SPORTIF                         │
│                                                         │
│  Raspberry Pi (192.168.4.1 / neopro.local)            │
│  ├── WiFi Hotspot: NEOPRO-[CLUB]                      │
│  ├── TV (HDMI) → Mode Kiosque /tv                     │
│  └── Mobile/Tablette → Remote control /remote         │
│                                                         │
│  Services:                                             │
│  • Angular App (Nginx port 80)                        │
│  • Socket.IO Server (Node.js port 3000)               │
│  • Admin Interface (Express port 8080)                │
│  • Sync Agent → Connexion au serveur central          │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Installation Raspberry Pi

### Nouveau Raspberry Pi ?

**Guide complet d'initialisation :**
- **[raspberry/QUICK_SETUP.md](raspberry/QUICK_SETUP.md)** - Guide pas à pas depuis zéro (30-40 min)

### Quick Start (résumé)

```bash
# 1. Flasher Raspberry Pi OS sur carte SD avec Raspberry Pi Imager
#    - Activer SSH et WiFi temporaire dans les paramètres

# 2. Copier les fichiers
scp -r raspberry/ pi@raspberrypi.local:~/

# 3. Installer Neopro
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh NOM_CLUB MotDePasseWiFi

# 4. Copier l'application (après reboot automatique)
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/
scp -r videos/* pi@neopro.local:/home/pi/neopro/videos/
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/

# 5. Redémarrer et tester
sudo reboot
```

**Durée totale :** 30-40 minutes

### Documentation complète

- **[raspberry/QUICK_SETUP.md](raspberry/QUICK_SETUP.md)** - Guide d'initialisation complet (NOUVEAU)
- **[raspberry/README.md](raspberry/README.md)** - Documentation technique détaillée
- **[raspberry/GUIDE-CLUB.md](raspberry/GUIDE-CLUB.md)** - Guide utilisateur pour les clubs
- **[raspberry/GUIDE-DEMO.md](raspberry/GUIDE-DEMO.md)** - Guide démo commerciale (5 min)

## 💻 Développement local

### Prérequis

- Node.js 20+
- Angular CLI 20.3.3
- npm ou yarn

### 🚀 Méthode 1 : Script automatique (Recommandé)

Lance automatiquement Angular + Socket.IO + Admin Interface :

```bash
# Cloner le repository
git clone https://github.com/Tallec7/neopro.git
cd neopro

# Lancer tous les services en une commande
./dev-local.sh
```

**Le script démarre :**
- ✅ Angular dev server (port 4200)
- ✅ Socket.IO server (port 3000)
- ✅ Admin interface MODE DEMO (port 8080)

**URLs disponibles :**
- http://localhost:4200 - Application Neopro
- http://localhost:4200/tv - Mode TV
- http://localhost:4200/remote - Télécommande
- http://localhost:8080 - Interface Admin (données mockées)

Appuyez sur `Ctrl+C` pour arrêter tous les services.

### 🔧 Méthode 2 : Manuel

```bash
# Installer les dépendances
npm install
cd server-render && npm install && cd ..
cd raspberry/admin && npm install && cd ../..

# Terminal 1: Angular
ng serve
# App disponible sur http://localhost:4200

# Terminal 2: Socket.IO
cd server-render
node server.js
# Socket.IO sur http://localhost:3000

# Terminal 3: Admin Interface (mode démo)
cd raspberry/admin
node admin-server-demo.js
# Admin sur http://localhost:8080
```

### Build

```bash
# Build standard
ng build

# Build pour Raspberry Pi
npm run build:raspberry
```

### Déploiement

```bash
# Déploiement vers Raspberry Pi
npm run deploy:raspberry neopro.local
```

## 📁 Structure du projet

```
neopro/
├── src/                          # Application Angular
│   ├── app/
│   │   ├── tv/                  # Mode TV (affichage)
│   │   ├── remote/              # Télécommande mobile
│   │   └── login/               # Authentification
│   └── environments/
│       ├── environment.ts       # Dev
│       ├── environment.prod.ts  # Production cloud
│       └── environment.raspberry.ts  # Raspberry Pi
│
├── server-render/               # Serveur Socket.IO
│   ├── server.js
│   └── README.md
│
└── raspberry/                   # Système Raspberry Pi
    ├── install.sh              # Installation principale
    ├── README.md               # Doc technique
    ├── GUIDE-CLUB.md          # Guide utilisateur
    ├── GUIDE-DEMO.md          # Guide démo
    │
    ├── config/                 # Configs système
    │   ├── hostapd.conf       # WiFi hotspot
    │   ├── dnsmasq.conf       # DHCP
    │   └── *.service          # Services systemd
    │
    ├── scripts/                # Build & deploy
    │   ├── build-raspberry.sh
    │   └── deploy-remote.sh
    │
    ├── admin/                  # Interface admin web
    │   ├── admin-server.js
    │   └── public/
    │
    ├── monitoring/             # Monitoring centralisé
    │   ├── client/monitoring-agent.js
    │   └── server/monitoring-server.js
    │
    └── tools/                  # Outils maintenance
        ├── prepare-image.sh   # Préparation image SD
        ├── clone-sd-card.sh   # Clonage SD
        ├── healthcheck.sh     # Vérification système
        └── recovery.sh        # Réparation auto
```

## 🎮 Utilisation

### URLs d'accès

| Service | URL | Description |
|---------|-----|-------------|
| Application | `http://neopro.local` | Page login |
| Mode TV | `http://neopro.local/tv` | Affichage automatique |
| Remote | `http://neopro.local/remote` | Contrôle mobile |
| Admin | `http://neopro.local:8080` | Interface administration |

**Fallback IP :** `192.168.4.1` (si mDNS ne fonctionne pas)

### Workflow match

1. **Avant le match** - Allumer le Raspberry Pi (30s)
2. **TV affiche** - Boucle sponsors automatiquement
3. **Mobile** - Se connecter au WiFi NEOPRO-[CLUB]
4. **Remote** - Ouvrir neopro.local/remote
5. **Pendant le match** - Sélectionner vidéos depuis le mobile
6. **Retour auto** - Sponsors après chaque vidéo

## 🛠️ Maintenance

### Vérification système

```bash
ssh pi@neopro.local
./raspberry/tools/healthcheck.sh
```

### Réparation automatique

```bash
ssh pi@neopro.local
sudo ./raspberry/tools/recovery.sh --auto
```

### Interface Admin

- **Dashboard** : État système (CPU, RAM, température)
- **Vidéos** : Upload, gestion, suppression
- **Réseau** : Configuration WiFi
- **Logs** : Visualisation temps réel
- **Système** : Redémarrage, mise à jour OTA

## 📊 Monitoring centralisé

Le système inclut un monitoring centralisé pour superviser tous les Raspberry Pi déployés :

- Collecte de métriques toutes les 5 minutes
- Alertes email/webhook automatiques
- API REST pour gestion de flotte
- Dashboard temps réel

Voir [raspberry/monitoring/](raspberry/monitoring/) pour la configuration.

## 🔒 Sécurité

- Réseau isolé (Hotspot WiFi)
- Mot de passe WiFi personnalisé
- Validation des uploads
- Backups automatiques avant mise à jour
- SSH désactivable

## 📚 Documentation

### 🆕 Gestion de flotte (2025)
- **[QUICK_START.md](QUICK_START.md)** - Démarrage rapide : ajouter votre premier boîtier (5 min)
- **[ADMIN_GUIDE.md](ADMIN_GUIDE.md)** - Guide complet d'administration de la flotte
- **[FLEET_MANAGEMENT_SPECS.md](FLEET_MANAGEMENT_SPECS.md)** - Spécifications techniques complètes
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Résumé de l'implémentation
- **[COMPONENTS_GUIDE.md](central-dashboard/COMPONENTS_GUIDE.md)** - Guide des composants UI
- **[FINAL_UI_COMPLETION.md](FINAL_UI_COMPLETION.md)** - Statut final du projet

### Pour les clubs
- **[GUIDE-CLUB.md](raspberry/GUIDE-CLUB.md)** - Utilisation quotidienne du boîtier
- **[GUIDE-DEMO.md](raspberry/GUIDE-DEMO.md)** - Démo commerciale

### Pour les développeurs
- **[raspberry/README.md](raspberry/README.md)** - Installation Raspberry Pi
- **[raspberry/admin/README.md](raspberry/admin/README.md)** - Interface admin locale
- **[raspberry/tools/README.md](raspberry/tools/README.md)** - Outils maintenance
- **[central-server/README.md](central-server/README.md)** - Serveur central API
- **[raspberry/sync-agent/README.md](raspberry/sync-agent/README.md)** - Agent de synchronisation

## 🆘 Support

- **Email** : support@neopro.fr
- **GitHub** : [Créer une issue](https://github.com/Tallec7/neopro/issues)
- **Monitoring** : https://monitoring.neopro.fr

## 📋 Checklist déploiement club

- [ ] Image SD flashée
- [ ] Installation complète (`./install.sh`)
- [ ] Application copiée (`dist/neopro/browser/`)
- [ ] Vidéos copiées (`videos/`)
- [ ] Healthcheck OK (`./tools/healthcheck.sh`)
- [ ] Test TV (affichage sponsors)
- [ ] Test Remote (contrôle mobile)
- [ ] Interface Admin accessible

## 🧪 Tests

```bash
# Tests unitaires
ng test

# E2E tests
ng e2e

# Healthcheck système Raspberry Pi
./raspberry/tools/healthcheck.sh
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

MIT

## 👥 Auteurs

- **Neopro** - Système de gestion vidéo sportive
- **Kalon Partners** - Développement et hébergement

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Angular :** 20.3.3
**Node.js :** 20+
