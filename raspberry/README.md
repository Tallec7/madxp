# Raspberry Pi Neopro

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

## 🚀 Guide rapide

### Mettre à jour un boîtier existant

```bash
npm run deploy:raspberry
```

C'est tout ! Cette commande build et déploie automatiquement.

### Configurer un nouveau club

```bash
./raspberry/scripts/setup-new-club.sh
```

Script interactif qui guide toute la configuration.

### Installer un nouveau Raspberry Pi

1. **Sur le Pi** : `sudo ./install.sh MONCLUB MotDePasseWiFi123`
2. **Sur Mac** : `./raspberry/scripts/setup-new-club.sh`

---

## 📂 Structure

```
raspberry/
├── install.sh              # Installation système (sur Pi)
├── scripts/
│   ├── README.md           # Documentation complète des scripts
│   ├── setup-new-club.sh   # Configuration nouveau club (sur Mac)
│   ├── delete-club.sh      # Suppression d'un club (sur Mac)
│   ├── backup-club.sh      # Sauvegarde d'un club (sur Mac)
│   ├── restore-club.sh     # Restauration d'un club (sur Mac)
│   ├── build-raspberry.sh  # Build Angular (sur Mac)
│   ├── deploy-remote.sh    # Déploiement SSH (sur Mac)
│   ├── diagnose-pi.sh      # Diagnostic (sur Pi)
│   └── ...
├── configs/                # Configurations des clubs
├── deploy/                 # Fichiers de déploiement (généré)
└── sync-agent/             # Agent de synchronisation
```

---

## 📚 Documentation détaillée

**[scripts/README.md](scripts/README.md)** - Documentation complète de tous les scripts
