# Phase 1 - Configuration Réseau et Environnements ✅

## Résumé de la Phase 1

Cette phase configure l'infrastructure de base pour transformer Neopro en système autonome local sur Raspberry Pi.

---

## ✅ Tâches accomplies

### 1. **Environnement Raspberry Pi**
- ✅ Créé `src/environments/environment.raspberry.ts`
  - Configuration pour fonctionnement local
  - URLs pointant vers `neopro.local` et `192.168.4.1`
  - Mode production optimisé

### 2. **Serveur Socket.IO modifié**
- ✅ Modifié `server-render/server.js`
  - Ajout des origines locales dans CORS
  - Support mDNS (`neopro.local`)
  - Support IP fixe (`192.168.4.1`)

### 3. **Structure Raspberry**
```
raspberry/
├── config/                          ✅ Créé
│   ├── hostapd.conf                 ✅ Configuration Hotspot WiFi
│   ├── dnsmasq.conf                 ✅ Configuration serveur DHCP
│   ├── neopro.service               ✅ Configuration Avahi mDNS
│   ├── neopro-app.service           ✅ Service systemd application
│   └── neopro-kiosk.service         ✅ Service systemd mode kiosque
├── scripts/                         ✅ Créé
│   ├── build-raspberry.sh           ✅ Script de build pour Raspberry
│   ├── deploy-remote.sh             ✅ Script de déploiement distant
│   └── setup-wifi-client.sh         ✅ Script configuration WiFi client
├── install.sh                       ✅ Script d'installation principal
├── README.md                        ✅ Documentation complète
├── PHASE1-COMPLETE.md              ✅ Ce fichier
└── .gitignore                       ✅ Gitignore pour fichiers générés
```

### 4. **Scripts npm**
- ✅ Ajouté `npm run build:raspberry` dans `package.json`
- ✅ Ajouté `npm run deploy:raspberry` dans `package.json`

---

## 📋 Configuration créée

### Hotspot WiFi
- **SSID :** `NEOPRO-[CLUB]` (personnalisable)
- **Mot de passe :** Configurable à l'installation
- **IP Raspberry :** `192.168.4.1`
- **Plage DHCP :** `192.168.4.10` - `192.168.4.50`
- **Canal :** 6 (2.4GHz)
- **Sécurité :** WPA2

### mDNS (résolution de noms)
- **Nom local :** `neopro.local`
- **Résolution :** `neopro.local` → `192.168.4.1`
- **Services annoncés :**
  - HTTP (port 80)
  - Socket.IO (port 3000)

### Services systemd
1. **neopro-app.service**
   - Lance le serveur Node.js + Socket.IO
   - Démarrage automatique au boot
   - Redémarrage automatique en cas de crash

2. **neopro-kiosk.service**
   - Lance Chromium en mode kiosque sur `/tv`
   - Plein écran automatique
   - Désactive les popups et messages

### Serveur Web (Nginx)
- Port 80 (HTTP)
- Sert l'application Angular
- Proxy Socket.IO
- Sert les fichiers vidéos

---

## 🚀 Utilisation

### Build pour Raspberry Pi
```bash
npm run build:raspberry
```

Crée :
- `raspberry/deploy/` avec tous les fichiers
- `raspberry/neopro-raspberry-deploy.tar.gz` (archive de déploiement)

### Installation sur Raspberry Pi
```bash
# Sur le Raspberry Pi
cd ~/raspberry
sudo ./install.sh NOM_CLUB MotDePasseWiFi
```

Exemple :
```bash
sudo ./install.sh CESSON MySecurePass123
```

### Déploiement distant
```bash
npm run deploy:raspberry neopro.local
# ou
npm run deploy:raspberry 192.168.1.100
```

### Configuration WiFi client (pour SSH distant)
```bash
# Sur le Raspberry Pi
sudo ./raspberry/scripts/setup-wifi-client.sh "WiFi-Club" "password"
```

---

## 🔧 Architecture réseau finale

### Mode Hotspot seul (par défaut)
```
┌─────────────────────────────────────┐
│      Raspberry Pi (192.168.4.1)     │
│                                      │
│  wlan0: Hotspot WiFi                │
│  ├─ SSID: NEOPRO-CLUB               │
│  ├─ IP: 192.168.4.1                 │
│  └─ mDNS: neopro.local              │
└─────────────────────────────────────┘
         │
         ├─── Mobile/Tablette (Remote)
         └─── TV (Mode Kiosque via HDMI)
```

### Mode Dual WiFi (recommandé pour SSH)
```
┌─────────────────────────────────────┐
│      Raspberry Pi                    │
│                                      │
│  wlan0: Hotspot WiFi                │
│  ├─ SSID: NEOPRO-CLUB               │
│  └─ IP: 192.168.4.1                 │
│                                      │
│  wlan1: Client WiFi                 │
│  ├─ SSID: WiFi-Salle                │
│  └─ IP: 192.168.1.XXX (DHCP)        │
└─────────────────────────────────────┘
         │                      │
         │                      └─── Internet / SSH distant
         │
         └─── Mobile (Remote)
```

---

## 📝 Prochaines étapes

### Phase 2 : Interface Web Admin
- [ ] Panel d'administration
- [ ] Upload de vidéos via interface web
- [ ] Configuration système via web
- [ ] Logs en temps réel
- [ ] Gestion des mises à jour

### Phase 3 : Scripts d'installation avancés
- [ ] Image Raspberry Pi OS pré-configurée
- [ ] Script de clonage de carte SD
- [ ] Système de récupération en cas d'erreur

### Phase 4 : Système de mise à jour
- [ ] Vérification de version automatique
- [ ] Mise à jour OTA (Over-The-Air)
- [ ] Rollback en cas d'erreur

---

## 🔍 Tests recommandés

### Test 1 : Build local
```bash
npm run build:raspberry
```
Vérifier que l'archive est créée dans `raspberry/neopro-raspberry-deploy.tar.gz`

### Test 2 : Installation sur Raspberry Pi
1. Flasher Raspberry Pi OS sur carte SD
2. Copier le dossier `raspberry/` sur le Pi
3. Exécuter `sudo ./install.sh TEST TestPass123`
4. Vérifier les services : `sudo systemctl status neopro-app`

### Test 3 : Connexion Hotspot
1. Chercher le WiFi `NEOPRO-TEST`
2. Se connecter avec le mot de passe
3. Ouvrir `http://neopro.local`
4. Vérifier que l'application charge

### Test 4 : Mode Kiosque
1. Vérifier que Chromium démarre automatiquement
2. Vérifier que `/tv` s'affiche en plein écran
3. Tester la lecture vidéo

### Test 5 : Communication Socket.IO
1. Ouvrir `/remote` sur mobile
2. Sélectionner une vidéo
3. Vérifier que la TV la joue instantanément

---

## 📚 Documentation

- **README.md** : Documentation utilisateur complète
- **install.sh** : Script commenté (11 étapes)
- **Configurations** : Tous les fichiers de config sont commentés

---

## ✅ Phase 1 : TERMINÉE

Toutes les tâches de la Phase 1 sont accomplies avec succès.

Le système est prêt pour :
- ✅ Installation sur Raspberry Pi
- ✅ Fonctionnement autonome sans Internet
- ✅ Hotspot WiFi avec mDNS
- ✅ Démarrage automatique
- ✅ Déploiement distant via SSH

**Prêt pour la Phase 2 : Interface Web Admin**
