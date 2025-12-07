# Raspberry Pi - Composants Neopro

## 📋 Commandes essentielles

| Action | Commande | Où |
|--------|----------|-----|
| **Nouveau boîtier (avec image golden)** | Flash + `./first-boot-setup.sh` | Pi |
| **Nouveau boîtier (sans image)** | `./raspberry/scripts/copy-to-pi.sh` + `install.sh` | Mac → Pi |
| **Nouveau club** | `./raspberry/scripts/setup-new-club.sh` | Mac |
| **Mise à jour** | `npm run deploy:raspberry` | Mac |
| **Créer image golden** | `./raspberry/tools/prepare-golden-image.sh` | Pi |
| **Supprimer un club** | `./raspberry/scripts/delete-club.sh` | Mac |
| **Backup un club** | `./raspberry/scripts/backup-club.sh` | Mac |
| **Restaurer un club** | `./raspberry/scripts/restore-club.sh` | Mac |

---

## 📂 Structure

```
raspberry/
├── scripts/                  # Scripts Mac (déploiement)
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
└── install.sh               # Installation système initiale
```

---

## 🚀 Guide rapide

### Nouveau boîtier avec Image Golden (RECOMMANDÉ - 10 min)

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
sudo ./install.sh MONCLUB MotDePasseWiFi123

# 3. Configurer le club (depuis Mac)
./raspberry/scripts/setup-new-club.sh
```

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

| Document | Description |
|----------|-------------|
| [../docs/GOLDEN_IMAGE.md](../docs/GOLDEN_IMAGE.md) | **Guide Image Golden** (création + utilisation) |
| [../docs/INSTALLATION_COMPLETE.md](../docs/INSTALLATION_COMPLETE.md) | Installation complète depuis zéro |
| [scripts/README.md](scripts/README.md) | Guide des scripts de déploiement |
| [tools/README.md](tools/README.md) | Guide des outils (clonage, recovery) |
| [config/templates/README.md](config/templates/README.md) | Guide des templates de configuration |
| [sync-agent/README.md](sync-agent/README.md) | Documentation sync-agent |
| [admin/README.md](admin/README.md) | Documentation interface admin |
| [server/README.md](server/README.md) | Documentation serveur Socket.IO |

---

## 🔧 Services systemd

| Service | Port | Description |
|---------|------|-------------|
| neopro-app | 3000 | Serveur Socket.IO |
| neopro-admin | 8080 | Interface admin |
| neopro-sync-agent | - | Agent synchronisation central |
| neopro-kiosk | - | Mode kiosk Chromium |
| nginx | 80 | Serveur web (reverse proxy) |
| hostapd | - | Point d'accès WiFi |

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

**Dernière mise à jour :** 7 décembre 2025
