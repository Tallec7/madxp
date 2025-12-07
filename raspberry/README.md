# Raspberry Pi - Composants Neopro

## 📋 Commandes essentielles

| Action | Commande | Où |
|--------|----------|-----|
| **Mise à jour** | `npm run deploy:raspberry` | Mac |
| **Nouveau club** | `./raspberry/scripts/setup-new-club.sh` | Mac |
| **Supprimer un club** | `./raspberry/scripts/delete-club.sh` | Mac |
| **Backup un club** | `./raspberry/scripts/backup-club.sh` | Mac |
| **Restaurer un club** | `./raspberry/scripts/restore-club.sh` | Mac |
| **Nouveau Pi** | `sudo ./install.sh CLUB WIFI_PASS` | Pi |

---

## 📂 Structure

```
raspberry/
├── scripts/                  # Scripts de déploiement
│   ├── setup-new-club.sh    # ⭐ Configuration nouveau club
│   ├── delete-club.sh       # Suppression d'un club
│   ├── backup-club.sh       # Sauvegarde d'un club
│   ├── restore-club.sh      # Restauration d'un club
│   ├── build-raspberry.sh   # Build Angular pour Pi
│   ├── deploy-remote.sh     # Déploiement SSH
│   ├── diagnose-pi.sh       # Diagnostic complet
│   └── README.md            # Documentation scripts
│
├── config/
│   ├── systemd/             # Services systemd
│   │   ├── neopro-app.service
│   │   ├── neopro-admin.service
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
│   ├── admin-server-demo.js
│   └── public/
│
├── sync-agent/              # Agent de synchronisation central
│   ├── src/
│   │   ├── agent.js
│   │   ├── analytics.js
│   │   ├── config.js
│   │   └── commands/
│   ├── scripts/
│   │   ├── register-site.js
│   │   ├── install-service.js
│   │   └── diagnose.js
│   └── README.md
│
├── monitoring/              # Monitoring (optionnel)
│   ├── client/
│   └── server/
│
├── tools/                   # Outils SD card
│   ├── clone-sd-card.sh
│   ├── prepare-image.sh
│   └── recovery.sh
│
├── configs/                 # Configurations des clubs (généré)
├── deploy/                  # Fichiers de déploiement (généré)
│
└── install.sh               # Installation système initiale
```

---

## 🚀 Guide rapide

### Mettre à jour un boîtier existant

```bash
npm run deploy:raspberry
```

### Configurer un nouveau club

```bash
./raspberry/scripts/setup-new-club.sh
```

### Installer un nouveau Raspberry Pi

1. **Sur le Pi** : `sudo ./install.sh MONCLUB MotDePasseWiFi123`
2. **Sur Mac** : `./raspberry/scripts/setup-new-club.sh`

---

## 📋 Documentation détaillée

| Document | Description |
|----------|-------------|
| [scripts/README.md](scripts/README.md) | Guide des scripts de déploiement |
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
| neopro-kiosk | - | Mode kiosk Chromium |
| neopro-sync | - | Agent synchronisation |

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
