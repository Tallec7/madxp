# Neopro

Système de gestion et d'affichage vidéo pour événements sportifs.

## 🎯 Vue d'ensemble

Neopro permet aux clubs sportifs de gérer l'affichage de vidéos (sponsors, buts, jingles) sur écran TV durant les matchs, avec contrôle à distance depuis mobile/tablette.

**Deux modes de déploiement :**
- **Cloud** : Application web hébergée (neopro.kalonpartners.bzh)
- **Raspberry Pi** : Solution autonome locale pour les clubs (ce repository)

## 📦 Architecture

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
│  • Monitoring Agent                                    │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Installation Raspberry Pi

### Quick Start

```bash
# 1. Flasher Raspberry Pi OS sur carte SD
# 2. Copier les fichiers
scp -r raspberry/ pi@raspberrypi.local:~/

# 3. Installer
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh NOM_CLUB MotDePasseWiFi

# 4. Copier l'application
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/
scp -r videos/* pi@neopro.local:/home/pi/neopro/videos/

# 5. Redémarrer
sudo reboot
```

**Durée totale :** 20 minutes

### Documentation complète

- **[raspberry/README.md](raspberry/README.md)** - Installation et configuration technique
- **[raspberry/GUIDE-CLUB.md](raspberry/GUIDE-CLUB.md)** - Guide utilisateur pour les clubs
- **[raspberry/GUIDE-DEMO.md](raspberry/GUIDE-DEMO.md)** - Guide démo commerciale (5 min)

## 💻 Développement local

### Prérequis

- Node.js 20+
- Angular CLI 20.3.3
- npm ou yarn

### Installation

```bash
# Cloner le repository
git clone https://github.com/Tallec7/neopro.git
cd neopro

# Installer les dépendances
npm install

# Démarrer le serveur de dev
ng serve
# App disponible sur http://localhost:4200

# Démarrer le serveur Socket.IO
cd server-render
npm install
node server.js
# Socket.IO sur http://localhost:3000
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

### Pour les clubs
- **[GUIDE-CLUB.md](raspberry/GUIDE-CLUB.md)** - Utilisation quotidienne
- **[GUIDE-DEMO.md](raspberry/GUIDE-DEMO.md)** - Démo commerciale

### Pour les développeurs
- **[raspberry/README.md](raspberry/README.md)** - Installation Raspberry Pi
- **[raspberry/admin/README.md](raspberry/admin/README.md)** - Interface admin
- **[raspberry/tools/README.md](raspberry/tools/README.md)** - Outils maintenance
- **[server-render/README.md](server-render/README.md)** - Serveur Socket.IO

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
