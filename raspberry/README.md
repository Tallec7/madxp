# Neopro - Installation Raspberry Pi

Ce dossier contient tous les fichiers nécessaires pour installer Neopro sur un Raspberry Pi et le configurer comme système autonome local (sans Internet).

## Architecture

```
Raspberry Pi (Serveur local)
├── Hotspot WiFi: NEOPRO-[CLUB]
├── mDNS: neopro.local
├── IP: 192.168.4.1
├── Serveur Socket.IO (port 3000)
├── Serveur Web Nginx (port 80)
└── Mode Kiosque Chromium → /tv
```

## Prérequis

- **Raspberry Pi 3B+ ou supérieur** (4GB RAM recommandé)
- **Carte microSD** 32GB minimum (64GB recommandé pour les vidéos)
- **Raspberry Pi OS Lite** ou Desktop (version Bullseye ou Bookworm)
- **Connexion HDMI** vers la TV/écran
- **Accès Internet** pour l'installation initiale (optionnel ensuite)

## Installation

### 1. Préparation de la carte SD

Flasher Raspberry Pi OS sur la carte SD avec Raspberry Pi Imager :
- OS : Raspberry Pi OS (64-bit) avec Desktop
- Configurer SSH et WiFi temporaire pour l'installation

### 2. Premier démarrage

```bash
# Connexion SSH au Raspberry Pi
ssh pi@raspberrypi.local

# Mise à jour initiale
sudo apt-get update
sudo apt-get upgrade -y
```

### 3. Copie des fichiers

```bash
# Depuis votre machine de développement
# Copier le dossier raspberry/ vers le Pi
scp -r raspberry/ pi@raspberrypi.local:~/

# Se connecter au Pi
ssh pi@raspberrypi.local
cd ~/raspberry
```

### 4. Lancement de l'installation

```bash
# Syntax: sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
sudo ./install.sh CESSON MySecurePass123
```

**Paramètres :**
- `NOM_CLUB` : Nom du club (ex: CESSON, NANTES, DEMO)
  - Sera utilisé pour le SSID WiFi : `NEOPRO-CESSON`
- `MOT_PASSE_WIFI` : Mot de passe du Hotspot WiFi (8+ caractères)

**Durée d'installation :** 15-20 minutes

### 5. Copie de l'application et des vidéos

```bash
# Copier le build Angular
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Copier les vidéos
scp -r public/videos/* pi@neopro.local:/home/pi/neopro/videos/

# Copier la configuration
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

### 6. Redémarrage final

```bash
sudo reboot
```

## Utilisation

### Connexion au système

1. **Depuis un mobile/tablette :**
   - Se connecter au WiFi : `NEOPRO-[CLUB]`
   - Mot de passe : celui défini lors de l'installation
   - Ouvrir le navigateur : `http://neopro.local`

2. **URLs disponibles :**
   - Mode TV (écran principal) : `http://neopro.local/tv`
   - Télécommande (mobile) : `http://neopro.local/remote`
   - Login : `http://neopro.local/login`

### Démarrage automatique

Le système démarre automatiquement :
- ✅ Hotspot WiFi `NEOPRO-[CLUB]`
- ✅ Serveur Node.js (Socket.IO)
- ✅ Serveur Web (Nginx)
- ✅ Mode Kiosque Chromium sur `/tv`

Aucune intervention manuelle nécessaire après le boot !

## Mise à jour

### Option 1 : Via SSH distant

```bash
# Depuis votre machine de dev
# 1. Se connecter au WiFi local du club (pas le Hotspot)
# 2. SSH vers le Raspberry Pi
ssh pi@[IP_DU_RASPBERRY]

# 3. Mettre à jour l'application
cd /home/pi/neopro
git pull  # Si configuré avec Git
# OU copier les nouveaux fichiers via SCP

# 4. Redémarrer les services
sudo systemctl restart neopro-app
sudo systemctl restart nginx
```

### Option 2 : Via interface Web Admin (Phase 2)

Interface à venir pour gérer les mises à jour via navigateur web.

## Configuration réseau

### WiFi Hotspot (par défaut)

- **SSID :** `NEOPRO-[CLUB]`
- **Mot de passe :** Défini lors de l'installation
- **IP Raspberry :** `192.168.4.1`
- **Plage DHCP :** `192.168.4.10` - `192.168.4.50`
- **DNS :** `neopro.local` → `192.168.4.1`

### WiFi Client (pour SSH distant)

Pour permettre l'accès SSH distant depuis Internet :

```bash
# Éditer la configuration WiFi
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf

# Ajouter le réseau du club
network={
    ssid="WiFi_Club"
    psk="MotDePasseClub"
    priority=10
}

# Redémarrer
sudo reboot
```

Le Raspberry Pi aura alors 2 connexions :
- **wlan0 :** Hotspot (192.168.4.1)
- **wlan1 :** Client WiFi (IP du réseau local)

## Dépannage

### Le Hotspot ne fonctionne pas

```bash
# Vérifier les services
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Redémarrer
sudo systemctl restart hostapd dnsmasq
```

### neopro.local ne fonctionne pas

```bash
# Vérifier Avahi
sudo systemctl status avahi-daemon

# Vérifier le hostname
hostname -f  # Doit afficher "neopro"

# Alternative : utiliser l'IP directe
http://192.168.4.1
```

### L'application ne démarre pas

```bash
# Vérifier le service
sudo systemctl status neopro-app

# Voir les logs
sudo journalctl -u neopro-app -f

# Redémarrer
sudo systemctl restart neopro-app
```

### Mode Kiosque ne s'affiche pas

```bash
# Vérifier le service
sudo systemctl status neopro-kiosk

# Redémarrer le mode graphique
sudo systemctl restart lightdm
```

## Logs

```bash
# Application Node.js
sudo journalctl -u neopro-app -f

# Nginx
tail -f /home/pi/neopro/logs/nginx-access.log
tail -f /home/pi/neopro/logs/nginx-error.log

# Système
sudo journalctl -xe
```

## Structure des fichiers

```
/home/pi/neopro/
├── server/              # Serveur Node.js + Socket.IO
│   ├── server.js
│   └── node_modules/
├── webapp/              # Application Angular buildée
│   ├── index.html
│   └── ...
├── videos/              # Bibliothèque vidéos
│   ├── Focus-partenaires/
│   ├── Info-club/
│   └── Match_SM1/
├── logs/                # Fichiers de log
└── club-config.json     # Configuration du club
```

## Sécurité

### Changement du mot de passe par défaut

```bash
# Mot de passe utilisateur pi
passwd

# Mot de passe root (optionnel)
sudo passwd root
```

### Firewall (optionnel)

```bash
sudo apt-get install ufw
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 3000/tcp # Socket.IO
sudo ufw enable
```

## Support

Pour toute question ou problème :
- **Email :** support@neopro.fr
- **GitHub Issues :** [Créer un ticket]

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** NEOPRO / Kalon Partners
