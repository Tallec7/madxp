# Index de la documentation Neopro

Ce document liste tous les guides disponibles et leur objectif.

## 📚 Documentation par usage

### 🆕 Installation d'un nouveau Raspberry Pi

1. **[QUICK_SETUP.md](QUICK_SETUP.md)** ⭐ **COMMENCER ICI**
   - Guide complet d'installation depuis zéro (30-40 min)
   - Flashage de la carte SD
   - Installation du système
   - Première configuration

2. **[README.md](README.md)**
   - Documentation technique complète
   - Architecture système
   - Configuration des services

### 🔄 Mise à jour d'un boîtier existant

1. **[UPDATE_GUIDE.md](UPDATE_GUIDE.md)**
   - Comment mettre à jour l'application
   - Mise à jour des vidéos
   - Mise à jour du système

2. **Scripts de build et déploiement**
   - `npm run build:raspberry` - Build l'application
   - `npm run deploy:raspberry neopro.local` - Déploie sur le Pi

### 🔧 Reconfiguration

1. **[RECONFIGURE_GUIDE.md](RECONFIGURE_GUIDE.md)**
   - Changer le nom du club
   - Changer le SSID WiFi
   - Changer le mot de passe WiFi

2. **[AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md)** 🔐
   - Personnaliser le mot de passe de connexion
   - Configuration par club
   - Sécurité

### 🐛 Dépannage

1. **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** 🆘
   - Résolution des erreurs courantes
   - Erreur 500
   - Services qui ne démarrent pas
   - WiFi qui ne fonctionne pas
   - Commandes utiles

2. **[QUICK_FIX_500.md](QUICK_FIX_500.md)**
   - Solution rapide pour l'erreur 500
   - Problème de permissions

3. **[DEPLOY_MANUAL.md](DEPLOY_MANUAL.md)**
   - Déploiement manuel pas à pas
   - Alternative aux scripts automatiques

### 📖 Guides utilisateurs

1. **[GUIDE-CLUB.md](GUIDE-CLUB.md)**
   - Guide pour les clubs sportifs
   - Utilisation quotidienne
   - Mode TV et télécommande

2. **[GUIDE-DEMO.md](GUIDE-DEMO.md)**
   - Guide de démonstration commerciale (5 min)
   - Présentation du système aux prospects

### 🔧 Interface d'administration

1. **[admin/README.md](admin/README.md)**
   - Interface web admin (port 8080)
   - Gestion des vidéos
   - Configuration système
   - Monitoring

### 🌐 Système centralisé (Nouveau 2025)

1. **[../QUICK_START.md](../QUICK_START.md)**
   - Démarrage rapide gestion de flotte
   - Ajouter un boîtier au système central

2. **[../ADMIN_GUIDE.md](../ADMIN_GUIDE.md)**
   - Guide d'administration de la flotte
   - Dashboard central
   - Déploiement à distance

3. **[sync-agent/README.md](sync-agent/README.md)**
   - Agent de synchronisation
   - Connexion au serveur central

## 🎯 Cas d'usage rapides

### Je veux...

#### ...installer un nouveau Raspberry Pi
➡️ Lire **[QUICK_SETUP.md](QUICK_SETUP.md)**

#### ...mettre à jour l'application sur un Pi existant
```bash
npm run build:raspberry
npm run deploy:raspberry neopro.local
```
➡️ Si problème : **[UPDATE_GUIDE.md](UPDATE_GUIDE.md)**

#### ...changer le mot de passe de connexion pour un club
➡️ Lire **[AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md)**

**Solution actuelle (temporaire) :**
Le mot de passe est codé en dur : `GG_NEO_25k!`

**Pour le personnaliser :**
1. Éditer `/home/pi/neopro/webapp/configuration.json` sur le Pi
2. Ajouter :
```json
{
  "auth": {
    "password": "VotreMotDePassePersonnalise"
  }
}
```
3. Modifier `src/app/services/auth.service.ts` pour charger depuis configuration.json
4. Rebuilder et redéployer

#### ...changer le nom du club ou le WiFi
➡️ Lire **[RECONFIGURE_GUIDE.md](RECONFIGURE_GUIDE.md)**

#### ...résoudre une erreur 500
➡️ Lire **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** ou **[QUICK_FIX_500.md](QUICK_FIX_500.md)**

**Solution rapide :**
```bash
ssh pi@neopro.local
sudo chmod 755 /home/pi
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo systemctl restart nginx
```

#### ...utiliser le système au quotidien (club)
➡️ Lire **[GUIDE-CLUB.md](GUIDE-CLUB.md)**

#### ...faire une démo commerciale
➡️ Lire **[GUIDE-DEMO.md](GUIDE-DEMO.md)**

#### ...gérer plusieurs boîtiers à distance
➡️ Lire **[../ADMIN_GUIDE.md](../ADMIN_GUIDE.md)** (système centralisé)

## 📁 Structure de la documentation

```
neopro/
├── README.md                          # Vue d'ensemble générale
├── QUICK_START.md                     # Démarrage gestion de flotte
├── ADMIN_GUIDE.md                     # Guide admin flotte
│
└── raspberry/                         # Documentation Raspberry Pi
    ├── QUICK_SETUP.md                # ⭐ Installation nouveau Pi
    ├── UPDATE_GUIDE.md               # Mise à jour
    ├── RECONFIGURE_GUIDE.md          # Reconfiguration
    ├── AUTHENTICATION_GUIDE.md       # 🔐 Authentification
    ├── TROUBLESHOOTING.md            # 🆘 Dépannage
    ├── QUICK_FIX_500.md             # Fix rapide erreur 500
    ├── DEPLOY_MANUAL.md             # Déploiement manuel
    ├── DOCUMENTATION_INDEX.md        # Ce fichier
    ├── README.md                     # Doc technique
    ├── GUIDE-CLUB.md                # Guide utilisateur
    ├── GUIDE-DEMO.md                # Guide démo
    │
    ├── admin/
    │   └── README.md                # Interface admin
    │
    ├── sync-agent/
    │   └── README.md                # Agent de sync
    │
    └── scripts/
        ├── diagnose-pi.sh           # Script de diagnostic
        ├── build-raspberry.sh       # Build
        └── deploy-remote.sh         # Déploiement
```

## 🔄 Workflow type : Installation complète

### 1. Préparation (une fois)
- Lire **[QUICK_SETUP.md](QUICK_SETUP.md)**
- Préparer une carte SD avec Raspberry Pi OS

### 2. Installation initiale
```bash
# Sur le Pi
sudo ./raspberry/install.sh NOM_CLUB MotDePasseWiFi
```

### 3. Déploiement de l'application
```bash
# Depuis votre Mac
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

### 4. Personnalisation (optionnel)
- Mot de passe : **[AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md)**
- Configuration : Éditer `configuration.json`
- Vidéos : Copier dans `/home/pi/neopro/videos/`

### 5. Test et validation
```bash
# Tester les URLs
http://neopro.local/login
http://neopro.local/tv
http://neopro.local/remote
http://neopro.local:8080
```

### 6. En cas de problème
➡️ Exécuter le diagnostic : `./raspberry/scripts/diagnose-pi.sh`
➡️ Consulter **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

## 📞 Support

Si vous ne trouvez pas la réponse dans la documentation :

1. **Vérifier les logs**
   ```bash
   ssh pi@neopro.local
   sudo journalctl -u neopro-app -n 50
   sudo tail -50 /home/pi/neopro/logs/nginx-error.log
   ```

2. **Exécuter le diagnostic**
   ```bash
   ./raspberry/scripts/diagnose-pi.sh > diagnostic.log
   ```

3. **Consulter les guides de dépannage**
   - **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**
   - **[QUICK_FIX_500.md](QUICK_FIX_500.md)**

## 🆕 Nouveautés

### Décembre 2024
- ✅ Correction du bug des permissions (erreur 500)
- ✅ Amélioration du script de déploiement
- ✅ Guide d'authentification par club
- ✅ Script de diagnostic automatique
- ✅ Documentation complète de dépannage

### 2025
- 🎯 Système de gestion de flotte centralisée
- 🎯 Dashboard de monitoring
- 🎯 Mises à jour OTA (Over The Air)
- 🎯 Multi-utilisateurs avec rôles
