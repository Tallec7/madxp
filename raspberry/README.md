# Raspberry Pi - Composants Neopro

## 📋 Commandes essentielles

| Action                                  | Commande                                                                                | Où           |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------ |
| **Nouveau boîtier (en ligne)** 🆕       | `curl -sSL https://tallec7.github.io/neopro/install/setup.sh \| sudo bash -s CLUB PASS` | Pi           |
| **Nouveau boîtier (avec image golden)** | Flash + `./first-boot-setup.sh`                                                         | Pi           |
| **Nouveau boîtier (sans image)**        | `./raspberry/scripts/copy-to-pi.sh` + `install.sh`                                      | Mac → Pi     |
| **Nouveau club (remote)** ✅            | `./raspberry/scripts/setup-remote-club.sh`                                              | N'importe où |
| **Nouveau club (local - dev)** 🔧       | `./raspberry/scripts/setup-new-club.sh`                                                 | Mac          |
| **Mise à jour**                         | `npm run deploy:raspberry`                                                              | Mac          |
| **Créer image golden**                  | `./raspberry/tools/prepare-golden-image.sh`                                             | Pi           |
| **Supprimer un club**                   | `./raspberry/scripts/delete-club.sh`                                                    | Mac          |
| **Backup un club**                      | `./raspberry/scripts/backup-club.sh`                                                    | Mac          |
| **Restaurer un club**                   | `./raspberry/scripts/restore-club.sh`                                                   | Mac          |

**Note :** Pour configurer un nouveau club, préférez la méthode **remote** (✅) pour la production (sans dépendance locale) et la méthode **local** (🔧) pour le développement. Voir [CLUB-SETUP-README.md](scripts/CLUB-SETUP-README.md) pour plus de détails.

---

## 📂 Structure

```
raspberry/
├── frontend/                # Application Angular (webapp TV/Remote/Login)
│   ├── app/                 # Composants Angular
│   │   ├── components/      # TV, Remote, Login
│   │   ├── services/        # Services
│   │   ├── guards/          # Auth guard
│   │   └── interfaces/      # Types TypeScript
│   ├── environments/        # Configs environnement
│   └── styles/              # SCSS
│
├── public/                  # Assets statiques
│
├── scripts/                 # Scripts Mac (déploiement)
│   ├── copy-to-pi.sh        # ⭐ Copie intelligente vers Pi
│   ├── setup-new-club.sh    # ⭐ Configuration nouveau club
│   ├── build-and-deploy.sh  # Build + déploiement
│   ├── build-raspberry.sh   # Build Angular pour Pi
│   ├── deploy-remote.sh     # Déploiement SSH
│   ├── delete-club.sh       # Suppression d'un club
│   ├── backup-club.sh       # Sauvegarde d'un club
│   ├── restore-club.sh      # Restauration d'un club
│   ├── cleanup-pi.sh        # Nettoie ~/raspberry après install
│   ├── diagnose-pi.sh       # Diagnostic complet
│   └── README.md            # Documentation scripts
│
├── tools/                   # Outils SD card / Image Golden
│   ├── prepare-golden-image.sh  # ⭐ Prépare Pi pour clonage
│   ├── clone-sd-card.sh     # Clone carte SD en image
│   ├── prepare-image.sh     # (ancien)
│   ├── recovery.sh          # Récupération système
│   ├── healthcheck.sh       # Vérification santé
│   └── README.md            # Documentation outils
│
├── config/
│   ├── systemd/             # Services systemd
│   │   ├── neopro-app.service
│   │   ├── neopro-admin.service
│   │   ├── neopro-sync-agent.service
│   │   ├── neopro-kiosk.service
│   │   ├── dnsmasq.conf
│   │   └── hostapd.conf
│   └── templates/           # Templates configuration
│       ├── TEMPLATE-configuration.json
│       └── README.md
│
├── server/                   # Serveur Socket.IO local
│   ├── server.js
│   └── package.json
│
├── admin/                    # Interface admin (port 8080)
│   ├── admin-server.js
│   └── public/
│
├── sync-agent/              # Agent de synchronisation central
│   ├── src/
│   │   ├── agent.js
│   │   ├── config.js
│   │   └── commands/
│   ├── scripts/
│   │   └── register-site.js
│   └── README.md
│
├── monitoring/              # Monitoring (optionnel)
│   ├── client/
│   └── server/
│
├── deploy/                  # Fichiers de déploiement (généré)
│
├── tsconfig.json            # Config TypeScript
├── tsconfig.app.json        # Config build
├── tsconfig.spec.json       # Config tests
├── karma.conf.js            # Config Karma
│
└── install.sh               # Installation système initiale
```

---

## 🚀 Guide rapide

### Installation en ligne (NOUVEAU - 20 min, 0 configuration)

**Installation automatique depuis Internet en une seule commande !**

```bash
# 1. Flasher Raspberry Pi OS Lite avec WiFi/SSH activé
# 2. Se connecter au Pi et lancer l'installation
ssh pi@raspberrypi.local
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD
# Optionnel : ajouter SSID/PASS du WiFi Internet si une clé USB est branchée
# curl -sSL ... | sudo bash -s CLUB_NAME PASSWORD Livebox-F730 MonPassInternet456

# Alternative (URL longue) :
curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD

# 3. Attendre 15-20 minutes
# 4. Se connecter au WiFi NEOPRO-CLUB_NAME et copier les fichiers
```

**Avantages :**

- ✅ Une seule commande à lancer
- ✅ Toujours la dernière version
- ✅ Pas besoin de copier des fichiers manuellement
- ✅ Fonctionne avec n'importe quelle carte SD ≥16GB
- ✅ 100% gratuit (hébergé sur GitHub Pages)

**Guide complet : [../docs/ONLINE_INSTALLATION.md](../docs/ONLINE_INSTALLATION.md)**

---

### Nouveau boîtier avec Image Golden (10 min)

```bash
# 1. Flasher l'image golden avec Raspberry Pi Imager
# 2. Premier boot sur le Pi
./first-boot-setup.sh
# 3. Depuis Mac
./raspberry/scripts/setup-new-club.sh
```

**Guide complet : [../docs/GOLDEN_IMAGE.md](../docs/GOLDEN_IMAGE.md)**

### Nouveau boîtier sans Image Golden (45 min)

```bash
# 1. Copier les fichiers (depuis Mac)
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# 2. Installer le système (sur le Pi)
ssh pi@raspberrypi.local
cd raspberry

# Hotspot uniquement :
sudo ./install.sh MONCLUB MotDePasseHotspot123

# Hotspot + WiFi Internet (clé USB branchée) :
sudo ./install.sh MONCLUB MotDePasseHotspot123 Livebox-F730 MonPassInternet456

# 3. Configurer le club (depuis Mac)
./raspberry/scripts/setup-new-club.sh
```

> 💡 **Dual WiFi** : Branchez une clé WiFi USB avant d'exécuter `install.sh`.  
> Le script détecte automatiquement `wlan1` et vous propose (en interactif) ou via les
> paramètres 3 & 4 de configurer le WiFi client (Internet). Vous pourrez toujours
> modifier ce WiFi plus tard depuis l'interface admin (port 8080, onglet Réseau).

### Mettre à jour un boîtier existant

```bash
npm run deploy:raspberry
```

### Créer une Image Golden

```bash
# Sur un Pi installé
sudo ./tools/prepare-golden-image.sh
sudo shutdown -h now
# Puis cloner depuis Mac
sudo ./tools/clone-sd-card.sh neopro-golden-v1.0
```

---

## 📋 Documentation détaillée

| Document                                                             | Description                                         |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| [../docs/ONLINE_INSTALLATION.md](../docs/ONLINE_INSTALLATION.md)     | **🆕 Installation en ligne** (curl depuis Internet) |
| [../docs/GOLDEN_IMAGE.md](../docs/GOLDEN_IMAGE.md)                   | **Guide Image Golden** (création + utilisation)     |
| [../docs/INSTALLATION_COMPLETE.md](../docs/INSTALLATION_COMPLETE.md) | Installation complète depuis zéro                   |
| [scripts/README.md](scripts/README.md)                               | Guide des scripts de déploiement                    |
| [tools/README.md](tools/README.md)                                   | Guide des outils (clonage, recovery)                |
| [config/templates/README.md](config/templates/README.md)             | Guide des templates de configuration                |
| [sync-agent/README.md](sync-agent/README.md)                         | Documentation sync-agent                            |
| [admin/README.md](admin/README.md)                                   | Documentation interface admin                       |
| [server/README.md](server/README.md)                                 | Documentation serveur Socket.IO                     |

---

## 🔧 Services systemd

| Service           | Port | Description                                            |
| ----------------- | ---- | ------------------------------------------------------ |
| neopro-app        | 3000 | Serveur Socket.IO                                      |
| neopro-admin      | 8080 | Interface admin                                        |
| neopro-sync-agent | -    | Agent synchronisation central                          |
| neopro-kiosk      | -    | Mode kiosk Chromium (détection automatique du binaire) |
| nginx             | 80   | Serveur web (reverse proxy)                            |
| hostapd           | -    | Point d'accès WiFi                                     |

> **Note :** Le service `neopro-kiosk` détecte automatiquement le chemin de Chromium (`/usr/bin/chromium` ou `/usr/bin/chromium-browser`) lors de l'installation via `install.sh`.

### Commandes utiles

```bash
# Status
sudo systemctl status neopro-app

# Logs
sudo journalctl -u neopro-app -f

# Redémarrer
sudo systemctl restart neopro-app
```

---

## 📚 Documentation principale

→ **[README.md principal](../README.md)** - Point d'entrée documentation
→ **[docs/INSTALLATION_COMPLETE.md](../docs/INSTALLATION_COMPLETE.md)** - Installation Raspberry Pi
→ **[docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md)** - Dépannage

---

**Dernière mise à jour :** 16 décembre 2025
