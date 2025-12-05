# Neopro - Installation Raspberry Pi

Ce dossier contient tous les fichiers nécessaires pour installer Neopro sur un Raspberry Pi et le configurer comme système autonome local (sans Internet).

## Guide de démarrage

**Nouveau Raspberry Pi ?** Suivez le guide pas à pas :
- **[QUICK_SETUP.md](QUICK_SETUP.md)** - Guide complet d'initialisation depuis zéro (30-40 min)

**Déjà installé ?** Ce README contient la documentation technique détaillée.

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

**Pour un guide détaillé pas à pas, consultez [QUICK_SETUP.md](QUICK_SETUP.md)**

Résumé technique pour utilisateurs expérimentés :

### Vue d'ensemble du processus

```
1. Flasher carte SD (Raspberry Pi Imager)
   ↓
2. Premier boot + mise à jour système
   ↓
3. Copier dossier raspberry/ via SCP
   ↓
4. Exécuter install.sh (15-20 min)
   ↓
5. Copier application + vidéos + config
   ↓
6. Reboot final
   ↓
✅ Système opérationnel
```

### 1. Préparation de la carte SD

**Outil :** [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

**Configuration minimale :**
- **OS :** Raspberry Pi OS (64-bit) avec Desktop
- **Hostname :** `raspberrypi` (sera changé en `neopro` par install.sh)
- **User :** `pi` avec mot de passe
- **SSH :** Activé (authentification par mot de passe)
- **WiFi :** Configuré temporairement pour l'installation

### 2. Premier démarrage et mise à jour

```bash
# Connexion SSH
ssh pi@raspberrypi.local

# Mise à jour système (obligatoire)
sudo apt-get update
sudo apt-get upgrade -y
```

### 3. Copie des fichiers d'installation

```bash
# Depuis votre machine de développement
scp -r raspberry/ pi@raspberrypi.local:~/
```

### 4. Installation Neopro

```bash
# SSH au Raspberry Pi
ssh pi@raspberrypi.local
cd ~/raspberry

# Syntaxe: sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
sudo ./install.sh CESSON MySecurePass123
```

**Paramètres obligatoires :**
- `NOM_CLUB` : Nom du club (ex: CESSON, NANTES, DEMO)
  - Sera utilisé pour le SSID WiFi : `NEOPRO-CESSON`
  - Sera utilisé dans le fichier de configuration
- `MOT_PASSE_WIFI` : Mot de passe du Hotspot WiFi (8+ caractères minimum)

**Ce que fait install.sh :**
- ✅ Installation de Node.js 20.x et dépendances système
- ✅ Configuration du Hotspot WiFi (hostapd + dnsmasq)
- ✅ Configuration mDNS (neopro.local)
- ✅ Installation et configuration Nginx
- ✅ Création des services systemd (neopro-app, neopro-admin, neopro-kiosk)
- ✅ Configuration du mode Kiosque Chromium
- ✅ Création de l'arborescence de dossiers
- ✅ Redémarrage automatique

**Durée :** 15-20 minutes

⚠️ **Ne pas interrompre le script pendant l'installation**

### 5. Déploiement de l'application

Après le redémarrage automatique (attendre 2 minutes) :

```bash
# Copier l'application Angular buildée
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Copier les vidéos
scp -r public/videos/* pi@neopro.local:/home/pi/neopro/videos/

# Copier la configuration du club
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

**Note :** Le hostname est maintenant `neopro.local` (changé par install.sh)

### 6. Redémarrage final et vérification

```bash
# Redémarrage
ssh pi@neopro.local
sudo reboot

# Vérification des services (après reboot)
ssh pi@neopro.local
sudo systemctl status neopro-app
sudo systemctl status nginx
sudo systemctl status hostapd
sudo systemctl status neopro-kiosk

# Healthcheck complet
cd /home/pi/neopro/tools
./healthcheck.sh
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

### Problèmes courants lors de l'installation

#### Je ne trouve pas raspberrypi.local après le premier boot

**Solutions :**
```bash
# 1. Attendre 2-3 minutes (le Pi peut être lent au premier boot)

# 2. Essayer de ping
ping raspberrypi.local

# 3. Scanner le réseau pour trouver l'IP
# Sur Mac/Linux :
arp -a | grep -i "b8:27:eb\|dc:a6:32\|e4:5f:01"

# Sur Windows :
arp -a | findstr "b8-27-eb dc-a6-32 e4-5f-01"

# 4. Se connecter avec l'IP trouvée
ssh pi@[IP_TROUVEE]

# 5. Vérifier la connexion WiFi sur le Pi
sudo iwconfig
```

#### install.sh échoue ou se bloque

**Vérifications :**
```bash
# 1. Vérifier la connexion Internet
ping -c 4 google.com

# 2. Vérifier l'espace disque
df -h

# 3. Voir les logs d'installation en temps réel
tail -f ~/raspberry/install.log  # Si disponible

# 4. Relancer l'installation
cd ~/raspberry
sudo ./install.sh CESSON MyPass123
```

#### Les fichiers SCP ne se copient pas

```bash
# Vérifier la connexion SSH
ssh pi@raspberrypi.local "echo 'Connexion OK'"

# Vérifier les permissions
ssh pi@raspberrypi.local "ls -la ~/"

# Copier avec verbose pour voir les erreurs
scp -v -r raspberry/ pi@raspberrypi.local:~/
```

### Problèmes après installation

#### Le Hotspot WiFi n'apparaît pas

```bash
# 1. Vérifier les services
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# 2. Voir les logs
sudo journalctl -u hostapd -n 50
sudo journalctl -u dnsmasq -n 50

# 3. Vérifier la configuration
cat /etc/hostapd/hostapd.conf
cat /etc/dnsmasq.conf

# 4. Redémarrer les services
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

# 5. Vérifier l'interface WiFi
iwconfig
# wlan0 doit être en mode "Master"

# 6. Redémarrer complètement
sudo reboot
```

#### neopro.local ne fonctionne pas

```bash
# 1. Vérifier Avahi (mDNS)
sudo systemctl status avahi-daemon

# 2. Vérifier le hostname
hostname        # Doit afficher "neopro"
hostname -f     # Doit afficher "neopro"

# 3. Redémarrer Avahi
sudo systemctl restart avahi-daemon

# 4. Alternative : utiliser l'IP directe
# Hotspot IP : 192.168.4.1
http://192.168.4.1
http://192.168.4.1/tv
http://192.168.4.1:8080
```

#### L'application web ne se charge pas

```bash
# 1. Vérifier Nginx
sudo systemctl status nginx
sudo nginx -t  # Tester la configuration

# 2. Vérifier les logs Nginx
sudo tail -f /home/pi/neopro/logs/nginx-error.log

# 3. Vérifier que les fichiers sont présents
ls -la /home/pi/neopro/webapp/
# Doit contenir : index.html, main-*.js, etc.

# 4. Vérifier les permissions
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo chmod -R 755 /home/pi/neopro/webapp/

# 5. Redémarrer Nginx
sudo systemctl restart nginx
```

#### L'application Node.js ne démarre pas

```bash
# 1. Vérifier le service
sudo systemctl status neopro-app

# 2. Voir les logs détaillés
sudo journalctl -u neopro-app -n 100 --no-pager

# 3. Vérifier Node.js
node --version  # Doit être v20.x

# 4. Vérifier les dépendances
cd /home/pi/neopro/server
npm install

# 5. Tester manuellement
node /home/pi/neopro/server/server.js

# 6. Redémarrer le service
sudo systemctl restart neopro-app
```

#### Mode Kiosque ne s'affiche pas sur la TV

```bash
# 1. Vérifier le service
sudo systemctl status neopro-kiosk

# 2. Voir les logs
sudo journalctl -u neopro-kiosk -n 50

# 3. Vérifier que X11 fonctionne
echo $DISPLAY  # Doit afficher :0 ou :1

# 4. Tester manuellement Chromium
DISPLAY=:0 chromium-browser --version

# 5. Redémarrer le mode graphique
sudo systemctl restart lightdm

# 6. Redémarrer le service kiosk
sudo systemctl restart neopro-kiosk

# 7. Reboot complet
sudo reboot
```

#### Les vidéos ne se chargent pas

```bash
# 1. Vérifier que les vidéos sont présentes
ls -la /home/pi/neopro/videos/

# 2. Vérifier les permissions
sudo chown -R pi:pi /home/pi/neopro/videos/
sudo chmod -R 755 /home/pi/neopro/videos/

# 3. Vérifier l'espace disque
df -h
# /home doit avoir de l'espace disponible

# 4. Vérifier la configuration
cat /home/pi/neopro/webapp/configuration.json

# 5. Voir les logs de l'application
sudo journalctl -u neopro-app -f
```

### Script de diagnostic automatique

```bash
# Lancer le healthcheck complet
ssh pi@neopro.local
cd /home/pi/neopro/tools
./healthcheck.sh

# Récupération automatique
sudo ./recovery.sh --auto
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
