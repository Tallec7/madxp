# Neopro Raspberry Pi - Documentation complète

Guide complet pour transformer Neopro en système autonome local sur Raspberry Pi.

---

## 📋 Vue d'ensemble

### Objectif
Déployer Neopro chez les clients sur Raspberry Pi avec :
- ✅ Hotspot WiFi autonome
- ✅ Fonctionnement sans Internet
- ✅ Interface web d'administration
- ✅ Mises à jour distantes via SSH
- ✅ Installation automatisée

### Architecture finale

```
┌─────────────────────────────────────────────────────────┐
│              Raspberry Pi (neopro.local)                 │
│              IP: 192.168.4.1                             │
│                                                          │
│  [WiFi Hotspot] NEOPRO-[CLUB]                           │
│   └─ wlan0: 192.168.4.1                                 │
│                                                          │
│  [WiFi Client] (optionnel - SSH distant)                │
│   └─ wlan1: IP dynamique                                │
│                                                          │
│  [Services]                                              │
│   ├─ Nginx (port 80) → Application Neopro              │
│   ├─ Node.js (port 3000) → Socket.IO                   │
│   ├─ Admin (port 8080) → Interface d'administration    │
│   ├─ Chromium → Mode TV en kiosque (/tv)               │
│   ├─ Hostapd → Hotspot WiFi                            │
│   ├─ Dnsmasq → Serveur DHCP                            │
│   └─ Avahi → Résolution mDNS (neopro.local)            │
│                                                          │
│  [Stockage]                                              │
│   ├─ /home/pi/neopro/webapp/                           │
│   ├─ /home/pi/neopro/server/                           │
│   ├─ /home/pi/neopro/admin/                            │
│   ├─ /home/pi/neopro/videos/                           │
│   └─ /home/pi/neopro/backups/                          │
└─────────────────────────────────────────────────────────┘
         │                          │
         │ HDMI                     │ WiFi Hotspot
         ▼                          ▼
   ┌──────────┐            ┌─────────────────┐
   │    TV    │            │  Mobile/Tablet  │
   │(Kiosque) │            │   (Remote +     │
   └──────────┘            │     Admin)      │
                           └─────────────────┘
```

---

## 🚀 Installation rapide (15 min)

### 1. Préparation matériel
- Raspberry Pi 4 (4GB RAM minimum)
- Carte microSD 32GB+ (classe 10/U3)
- Câble HDMI vers TV
- (Optionnel) Dongle WiFi USB pour dual WiFi

### 2. Flash Raspberry Pi OS
```bash
# Utiliser Raspberry Pi Imager
# OS: Raspberry Pi OS (64-bit) with Desktop
# Activer SSH et configurer WiFi temporaire
```

### 3. Installation
```bash
# Copier les fichiers
scp -r raspberry/ pi@raspberrypi.local:~/

# SSH vers le Pi
ssh pi@raspberrypi.local

# Lancement installation (CLUB_NAME et WIFI_PASSWORD)
cd ~/raspberry
sudo ./install.sh CESSON MySecurePass123

# Durée: 15-20 minutes
```

### 4. Déploiement de l'application
```bash
# Sur votre machine de dev
npm run build:raspberry

# Copie vers le Raspberry
scp raspberry/neopro-raspberry-deploy.tar.gz pi@raspberrypi.local:~/

# Sur le Raspberry
ssh pi@raspberrypi.local
tar -xzf neopro-raspberry-deploy.tar.gz
sudo cp -r deploy/webapp/* /home/pi/neopro/webapp/
sudo cp -r deploy/server/* /home/pi/neopro/server/
sudo cp -r deploy/videos/* /home/pi/neopro/videos/
```

### 5. Redémarrage
```bash
sudo reboot
```

✅ **Système opérationnel !**

---

## 🌐 URLs d'accès

| Service | URL | Description |
|---------|-----|-------------|
| **Application** | `http://neopro.local` | Page de login |
| **Mode TV** | `http://neopro.local/tv` | Affichage grand écran (auto) |
| **Remote** | `http://neopro.local/remote` | Télécommande mobile |
| **Admin** | `http://neopro.local:8080` | Interface d'administration |
| **IP directe** | `http://192.168.4.1` | Fallback si mDNS ne fonctionne pas |

---

## 🎛️ Interface Web Admin

### Accès
`http://neopro.local:8080`

### Fonctionnalités

#### 📊 Dashboard
- **Monitoring temps réel**
  - CPU, Mémoire, Température, Disque
  - État des services
  - Uptime
- **Rafraîchissement automatique** (5 secondes)

#### 🎬 Gestion des vidéos
- **Upload** : MP4, MKV, MOV (max 500MB)
- **Organisation** par catégories
- **Bibliothèque** : Liste complète avec taille
- **Suppression** de vidéos

#### 📡 Configuration réseau
- **WiFi Client** : Configuration pour SSH distant
- **Interfaces** : Affichage IP, MAC
- **SSID** connecté

#### 📜 Logs système
- **Application** (neopro-app)
- **Nginx**
- **Système complet**
- **100 dernières lignes**

#### ⚙️ Administration
- **Services** : Redémarrage individuel
- **Mise à jour OTA** : Upload .tar.gz
- **Backup automatique**
- **Redémarrage/Arrêt** système

---

## 🔄 Workflow opérationnel

### Usage quotidien

1. **Allumer le Raspberry Pi**
   - Démarrage automatique (30 secondes)
   - TV affiche la boucle sponsors automatiquement

2. **Contrôle depuis mobile**
   - Se connecter au WiFi `NEOPRO-[CLUB]`
   - Ouvrir `http://neopro.local/remote`
   - Sélectionner et jouer les vidéos

3. **Administration**
   - Ouvrir `http://neopro.local:8080`
   - Uploader de nouvelles vidéos
   - Vérifier l'état du système

### Mise à jour

#### Méthode 1 : Script automatique (recommandé)
```bash
# Sur votre machine de dev
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

#### Méthode 2 : Interface web
1. Ouvrir `http://neopro.local:8080`
2. Onglet "Système"
3. Upload archive `.tar.gz`
4. Backup automatique créé
5. Services redémarrés

#### Méthode 3 : SSH manuel
```bash
ssh pi@neopro.local
# Copier les fichiers
sudo systemctl restart neopro-app nginx
```

---

## 📡 Configuration WiFi client (SSH distant)

Pour permettre l'accès SSH depuis Internet :

### Méthode 1 : Interface web
1. Ouvrir `http://neopro.local:8080`
2. Onglet "Réseau"
3. Entrer SSID et mot de passe du WiFi du club
4. Cliquer "Configurer"

### Méthode 2 : Script
```bash
ssh pi@neopro.local
sudo /home/pi/raspberry/scripts/setup-wifi-client.sh "WiFi-Club" "password"
```

### Méthode 3 : Manuel
```bash
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf

# Ajouter
network={
    ssid="WiFi-Club"
    psk="password"
    priority=10
}

sudo reboot
```

Le Raspberry Pi aura alors :
- **wlan0** : Hotspot (192.168.4.1) pour le remote
- **wlan1** : Client WiFi (IP dynamique) pour SSH

---

## 🔧 Commandes utiles

### Services
```bash
# Status des services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status neopro-kiosk
sudo systemctl status nginx

# Redémarrage
sudo systemctl restart neopro-app
sudo systemctl restart neopro-admin
sudo systemctl restart nginx

# Logs
sudo journalctl -u neopro-app -f
sudo journalctl -u neopro-admin -f
```

### Réseau
```bash
# Voir les interfaces
ip addr

# WiFi connecté
iwconfig wlan0

# Redémarrer Hotspot
sudo systemctl restart hostapd dnsmasq
```

### Système
```bash
# Température CPU
cat /sys/class/thermal/thermal_zone0/temp

# Espace disque
df -h

# Uptime
uptime

# Redémarrer
sudo reboot

# Éteindre
sudo shutdown -h now
```

---

## 🐛 Dépannage

### Le Hotspot ne fonctionne pas
```bash
# Vérifier les services
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Redémarrer
sudo systemctl restart hostapd dnsmasq

# Logs
sudo journalctl -u hostapd -f
```

### neopro.local ne fonctionne pas
```bash
# Vérifier Avahi
sudo systemctl status avahi-daemon

# Vérifier hostname
hostname -f  # Doit afficher "neopro"

# Solution temporaire
# Utiliser IP directe: http://192.168.4.1
```

### L'application ne démarre pas
```bash
# Status
sudo systemctl status neopro-app

# Logs détaillés
sudo journalctl -u neopro-app -n 100

# Redémarrer
sudo systemctl restart neopro-app

# Vérifier les fichiers
ls -la /home/pi/neopro/webapp/
ls -la /home/pi/neopro/server/
```

### Mode Kiosque ne s'affiche pas
```bash
# Status
sudo systemctl status neopro-kiosk

# Redémarrer mode graphique
sudo systemctl restart lightdm

# Vérifier X11
echo $DISPLAY  # Doit afficher :0
```

### Interface admin ne charge pas
```bash
# Status
sudo systemctl status neopro-admin

# Logs
sudo journalctl -u neopro-admin -f

# Port utilisé ?
sudo netstat -tlnp | grep 8080

# Redémarrer
sudo systemctl restart neopro-admin
```

### Erreur upload vidéo
```bash
# Espace disque
df -h /home/pi/neopro/videos

# Permissions
ls -la /home/pi/neopro/videos

# Corriger
sudo chown -R pi:pi /home/pi/neopro
sudo chmod -R 755 /home/pi/neopro
```

---

## 📁 Structure des fichiers

```
/home/pi/neopro/
├── webapp/                 # Application Angular (frontend)
│   ├── index.html
│   ├── configuration.json
│   └── ...
├── server/                 # Serveur Socket.IO (backend)
│   ├── server.js
│   ├── package.json
│   └── node_modules/
├── admin/                  # Interface Web Admin
│   ├── admin-server.js
│   ├── package.json
│   ├── node_modules/
│   └── public/
│       ├── index.html
│       ├── styles.css
│       └── app.js
├── videos/                 # Bibliothèque vidéos
│   ├── Focus-partenaires/
│   ├── Info-club/
│   ├── Match_SM1/
│   └── Match_SF/
├── logs/                   # Logs Nginx
│   ├── nginx-access.log
│   └── nginx-error.log
├── backups/                # Backups automatiques
│   └── backup-YYYYMMDD-HHMMSS.tar.gz
└── club-config.json        # Configuration du club
```

---

## 🔒 Sécurité

### Recommandations

1. **Changer le mot de passe par défaut**
```bash
passwd
```

2. **Firewall (optionnel)**
```bash
sudo apt-get install ufw
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 3000/tcp # Socket.IO
sudo ufw allow 8080/tcp # Admin
sudo ufw enable
```

3. **Désactiver SSH après installation (optionnel)**
```bash
sudo systemctl disable ssh
# Réactiver quand nécessaire avec interface Admin
```

4. **Backups réguliers**
- Backup automatique avant chaque mise à jour
- Copier la carte SD tous les mois
- Conserver les 5 derniers backups

---

## 📦 Développement

### Build pour Raspberry
```bash
npm run build:raspberry
```

Crée :
- `raspberry/deploy/` avec tous les fichiers
- `raspberry/neopro-raspberry-deploy.tar.gz`

### Déploiement distant
```bash
npm run deploy:raspberry neopro.local
# ou
npm run deploy:raspberry 192.168.1.100
```

### Test en local
```bash
# Serveur principal
cd server-render
node server.js

# Serveur admin
cd raspberry/admin
npm install
npm run dev
```

---

## 📊 Spécifications techniques

### Matériel recommandé
- **Raspberry Pi** : 4B (4GB ou 8GB RAM)
- **Carte SD** : 64GB classe 10/U3
- **Dissipateur** : Recommandé
- **Dongle WiFi** : Optionnel pour dual WiFi

### Logiciels installés
- **OS** : Raspberry Pi OS 64-bit (Bullseye/Bookworm)
- **Node.js** : v18.x
- **Nginx** : 1.18+
- **Chromium** : Dernière version
- **Services** : hostapd, dnsmasq, avahi-daemon

### Ports utilisés
- **80** : Nginx (HTTP)
- **3000** : Socket.IO
- **8080** : Admin Panel
- **22** : SSH (optionnel)

---

## 📚 Documentation

- **[QUICK-START.md](./QUICK-START.md)** : Guide démarrage rapide
- **[README.md](./README.md)** : Documentation installation détaillée
- **[PHASE1-COMPLETE.md](./PHASE1-COMPLETE.md)** : Détails Phase 1
- **[PHASE2-COMPLETE.md](./PHASE2-COMPLETE.md)** : Détails Phase 2
- **[admin/README.md](./admin/README.md)** : Documentation Admin Panel

---

## ✅ Checklist déploiement

### Avant installation
- [ ] Raspberry Pi 4 (4GB+ RAM)
- [ ] Carte microSD 32GB+ (formatée)
- [ ] Câble HDMI vers TV
- [ ] Alimentation Raspberry Pi
- [ ] (Optionnel) Dongle WiFi USB

### Installation
- [ ] OS flashé avec Raspberry Pi Imager
- [ ] SSH activé
- [ ] Fichiers `raspberry/` copiés sur le Pi
- [ ] Script `install.sh` exécuté
- [ ] Application copiée dans `/home/pi/neopro/webapp/`
- [ ] Vidéos copiées dans `/home/pi/neopro/videos/`

### Vérification
- [ ] Services actifs :
  - [ ] `neopro-app`
  - [ ] `neopro-admin`
  - [ ] `neopro-kiosque`
  - [ ] `nginx`
  - [ ] `hostapd`
  - [ ] `dnsmasq`
- [ ] Hotspot WiFi visible
- [ ] Connexion à `http://neopro.local` réussie
- [ ] Admin accessible : `http://neopro.local:8080`
- [ ] Mode TV en kiosque sur écran
- [ ] Test vidéo depuis remote
- [ ] Mot de passe utilisateur `pi` changé

### Configuration optionnelle
- [ ] WiFi client configuré pour SSH distant
- [ ] IP publique notée pour accès distant
- [ ] Backup initial créé

---

## 🆘 Support

### Problèmes courants
Consultez la section **Dépannage** ci-dessus.

### Logs utiles
```bash
# Tout voir
sudo journalctl -xe

# Services spécifiques
sudo journalctl -u neopro-app -f
sudo journalctl -u neopro-admin -f
sudo journalctl -u nginx -f
```

### Contact
- **Email** : support@neopro.fr
- **GitHub** : [Créer un issue]

---

**Version :** 1.0.0 (Phase 1 + Phase 2)
**Date :** Décembre 2024
**Auteur :** Neopro / Kalon Partners
**Licence :** MIT
