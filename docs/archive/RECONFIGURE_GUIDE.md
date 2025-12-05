# Guide de reconfiguration d'un Raspberry Pi Neopro

Guide pour reconfigurer un Raspberry Pi existant : changer le nom du club, SSID WiFi, mot de passe, hostname, etc.

**Cas d'usage :**
- Réutiliser un Raspberry Pi d'un ancien club pour un nouveau club
- Changer le nom du club ou le mot de passe WiFi
- Corriger une mauvaise configuration initiale
- Transférer un boîtier d'un site à un autre

---

## Option 1 : Réinstallation complète (Recommandé)

**Durée :** 30-40 minutes
**Avantage :** Configuration propre, pas de résidus
**Inconvénient :** Plus long, nécessite de tout refaire

Cette option est recommandée si vous voulez une installation propre.

### Étapes

1. **Sauvegarder les vidéos** (si vous voulez les garder)
   ```bash
   # Depuis votre machine de développement
   scp -r pi@neopro.local:/home/pi/neopro/videos ~/backup-videos-$(date +%Y%m%d)
   ```

2. **Suivre le guide d'initialisation**
   - Voir **[QUICK_SETUP.md](QUICK_SETUP.md)** pour refaire l'installation depuis zéro
   - Flasher une nouvelle carte SD avec le nouveau nom de club

3. **Restaurer les vidéos** (optionnel)
   ```bash
   scp -r ~/backup-videos-*/* pi@neopro.local:/home/pi/neopro/videos/
   ```

---

## Option 2 : Reconfiguration manuelle (Rapide)

**Durée :** 10-15 minutes
**Avantage :** Rapide, garde les données existantes
**Inconvénient :** Plus technique, risque d'erreurs

### Prérequis

- Accès SSH au Raspberry Pi
- Nouveau nom de club
- Nouveau mot de passe WiFi (optionnel)

---

## Étape 1 : Changer le nom du club et SSID WiFi

### 1.1 Se connecter au Raspberry Pi

```bash
# Via l'ancien SSID
ssh pi@neopro.local

# Ou via l'ancienne IP
ssh pi@192.168.4.1
```

### 1.2 Changer le SSID WiFi (Hotspot)

```bash
# Éditer la configuration hostapd
sudo nano /etc/hostapd/hostapd.conf
```

Modifier la ligne `ssid=` :
```
# Avant
ssid=NEOPRO-ANCIEN_CLUB

# Après
ssid=NEOPRO-NOUVEAU_CLUB
```

Sauvegarder : `Ctrl+O`, `Enter`, `Ctrl+X`

### 1.3 Changer le mot de passe WiFi (optionnel)

Toujours dans `/etc/hostapd/hostapd.conf` :

```
# Modifier la ligne wpa_passphrase
wpa_passphrase=NouveauMotDePasse123
```

⚠️ **Important :** Le mot de passe doit faire au minimum 8 caractères.

### 1.4 Redémarrer le service hostapd

```bash
sudo systemctl restart hostapd
```

### 1.5 Vérifier le nouveau SSID

Depuis votre mobile/tablette :
- Chercher les réseaux WiFi
- Vous devriez voir `NEOPRO-NOUVEAU_CLUB`
- Se connecter avec le nouveau mot de passe

---

## Étape 2 : Changer le hostname (optionnel)

Si vous voulez que le Raspberry Pi s'appelle autrement que `neopro.local` :

### 2.1 Modifier le hostname

```bash
# Changer le hostname
sudo hostnamectl set-hostname neopro-nouveau-club

# Ou pour un nom plus court
sudo hostnamectl set-hostname neopro
```

### 2.2 Mettre à jour /etc/hosts

```bash
sudo nano /etc/hosts
```

Modifier la ligne :
```
# Avant
127.0.1.1    neopro

# Après
127.0.1.1    neopro-nouveau-club
```

### 2.3 Redémarrer Avahi (mDNS)

```bash
sudo systemctl restart avahi-daemon
```

### 2.4 Redémarrer le Raspberry Pi

```bash
sudo reboot
```

Après le reboot, vous pourrez accéder au Pi via :
```bash
ssh pi@neopro-nouveau-club.local
```

---

## Étape 3 : Mettre à jour la configuration du club

### 3.1 Éditer le fichier club-config.json

```bash
ssh pi@neopro.local
nano /home/pi/neopro/club-config.json
```

Modifier :
```json
{
  "clubName": "NOUVEAU_CLUB",
  "ssid": "NEOPRO-NOUVEAU_CLUB",
  "lastUpdate": "2024-12-05"
}
```

### 3.2 Mettre à jour configuration.json (optionnel)

Si votre `configuration.json` contient des informations spécifiques au club :

```bash
nano /home/pi/neopro/webapp/configuration.json
```

Modifier les sections concernées (nom du club, sponsors, etc.)

### 3.3 Redémarrer l'application

```bash
sudo systemctl restart neopro-app
sudo systemctl restart nginx
```

---

## Étape 4 : Vérification complète

### 4.1 Vérifier le Hotspot WiFi

```bash
# Vérifier hostapd
sudo systemctl status hostapd

# Voir la configuration
cat /etc/hostapd/hostapd.conf | grep ssid
```

Devrait afficher : `ssid=NEOPRO-NOUVEAU_CLUB`

### 4.2 Vérifier le hostname

```bash
hostname
# Devrait afficher : neopro-nouveau-club (ou neopro)

hostname -f
# Devrait afficher : neopro-nouveau-club (ou neopro)
```

### 4.3 Vérifier les services

```bash
sudo systemctl status neopro-app
sudo systemctl status nginx
sudo systemctl status hostapd
sudo systemctl status dnsmasq
```

Tous doivent être **active (running)** en vert.

### 4.4 Healthcheck

```bash
cd /home/pi/neopro/tools
./healthcheck.sh
```

### 4.5 Test complet

Depuis un mobile/tablette :
1. Se connecter au WiFi `NEOPRO-NOUVEAU_CLUB`
2. Ouvrir `http://neopro.local`
3. Vérifier que l'application se charge
4. Vérifier que les vidéos fonctionnent

---

## Option 3 : Script de reconfiguration automatique

### 3.1 Créer le script

```bash
ssh pi@neopro.local
cd ~/raspberry
nano reconfigure.sh
```

Copier ce script :

```bash
#!/bin/bash

# Script de reconfiguration Neopro
# Usage: sudo ./reconfigure.sh NOUVEAU_CLUB NOUVEAU_MOTDEPASSE

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Ce script doit être exécuté avec sudo"
  exit 1
fi

if [ $# -ne 2 ]; then
  echo "Usage: sudo ./reconfigure.sh [NOM_CLUB] [MOT_PASSE_WIFI]"
  echo "Example: sudo ./reconfigure.sh NANTES MySecurePass123"
  exit 1
fi

CLUB_NAME=$1
WIFI_PASSWORD=$2

echo "🔧 Reconfiguration du Raspberry Pi pour le club: $CLUB_NAME"
echo "=================================================="

# 1. Backup de la configuration actuelle
echo "📦 Sauvegarde de la configuration actuelle..."
cp /etc/hostapd/hostapd.conf /etc/hostapd/hostapd.conf.backup-$(date +%Y%m%d)
cp /home/pi/neopro/club-config.json /home/pi/neopro/club-config.json.backup-$(date +%Y%m%d) 2>/dev/null || true

# 2. Changer le SSID
echo "📡 Configuration du nouveau SSID: NEOPRO-$CLUB_NAME..."
sed -i "s/^ssid=.*/ssid=NEOPRO-$CLUB_NAME/" /etc/hostapd/hostapd.conf

# 3. Changer le mot de passe WiFi
echo "🔐 Configuration du nouveau mot de passe WiFi..."
sed -i "s/^wpa_passphrase=.*/wpa_passphrase=$WIFI_PASSWORD/" /etc/hostapd/hostapd.conf

# 4. Mettre à jour club-config.json
echo "📝 Mise à jour de club-config.json..."
cat > /home/pi/neopro/club-config.json <<EOF
{
  "clubName": "$CLUB_NAME",
  "ssid": "NEOPRO-$CLUB_NAME",
  "lastUpdate": "$(date +%Y-%m-%d)",
  "reconfigurated": true
}
EOF

chown pi:pi /home/pi/neopro/club-config.json

# 5. Redémarrer les services
echo "🔄 Redémarrage des services..."
systemctl restart hostapd
systemctl restart dnsmasq
systemctl restart neopro-app

echo ""
echo "✅ Reconfiguration terminée avec succès !"
echo ""
echo "📋 Informations:"
echo "   Nouveau SSID: NEOPRO-$CLUB_NAME"
echo "   Mot de passe: $WIFI_PASSWORD"
echo "   Hostname: neopro.local"
echo ""
echo "⚠️  Redémarrez le Raspberry Pi pour appliquer tous les changements:"
echo "   sudo reboot"
echo ""
```

Sauvegarder et rendre exécutable :
```bash
chmod +x reconfigure.sh
```

### 3.2 Utiliser le script

```bash
sudo ./reconfigure.sh NOUVEAU_CLUB NouveauMotDePasse123
```

### 3.3 Redémarrer

```bash
sudo reboot
```

---

## Cas particuliers

### Changer uniquement le mot de passe WiFi

```bash
ssh pi@neopro.local
sudo nano /etc/hostapd/hostapd.conf
# Modifier wpa_passphrase=...
sudo systemctl restart hostapd
```

### Changer uniquement le nom du club (sans SSID)

```bash
ssh pi@neopro.local
nano /home/pi/neopro/club-config.json
# Modifier clubName
sudo systemctl restart neopro-app
```

### Ajouter un WiFi client pour SSH distant

Si vous voulez que le Raspberry Pi se connecte au WiFi du club (en plus du Hotspot) :

```bash
ssh pi@neopro.local
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

Ajouter à la fin :
```
network={
    ssid="WiFi_Du_Club"
    psk="MotDePasseDuClub"
    priority=10
}
```

Redémarrer :
```bash
sudo reboot
```

Le Pi aura alors 2 connexions :
- **wlan0** : Hotspot `NEOPRO-NOUVEAU_CLUB` (192.168.4.1)
- **wlan1** (ou eth0) : WiFi client (IP du réseau local)

---

## Dépannage

### Le nouveau SSID n'apparaît pas

```bash
# Vérifier hostapd
sudo systemctl status hostapd
sudo journalctl -u hostapd -n 50

# Vérifier la configuration
cat /etc/hostapd/hostapd.conf | grep ssid

# Redémarrer complètement
sudo systemctl restart hostapd dnsmasq
sudo reboot
```

### Impossible de se connecter au nouveau WiFi

```bash
# Vérifier le mot de passe
cat /etc/hostapd/hostapd.conf | grep wpa_passphrase

# Vérifier que le mot de passe fait au moins 8 caractères
# Si trop court, hostapd ne démarrera pas

# Corriger si nécessaire
sudo nano /etc/hostapd/hostapd.conf
sudo systemctl restart hostapd
```

### Le hostname ne change pas

```bash
# Forcer le changement
sudo hostnamectl set-hostname neopro-nouveau-club

# Mettre à jour /etc/hosts
sudo nano /etc/hosts
# Changer 127.0.1.1

# Redémarrer Avahi
sudo systemctl restart avahi-daemon
sudo reboot
```

### L'application ne démarre plus après reconfiguration

```bash
# Vérifier les logs
sudo journalctl -u neopro-app -n 50

# Vérifier les permissions
sudo chown -R pi:pi /home/pi/neopro/
ls -la /home/pi/neopro/club-config.json

# Redémarrer l'application
sudo systemctl restart neopro-app
```

### Restaurer l'ancienne configuration

```bash
# Restaurer le backup hostapd
sudo cp /etc/hostapd/hostapd.conf.backup-YYYYMMDD /etc/hostapd/hostapd.conf

# Restaurer club-config.json
cp /home/pi/neopro/club-config.json.backup-YYYYMMDD /home/pi/neopro/club-config.json

# Redémarrer
sudo systemctl restart hostapd dnsmasq neopro-app
sudo reboot
```

---

## Checklist de reconfiguration

Avant la reconfiguration :
- [ ] Identifier le nouveau nom de club
- [ ] Choisir un mot de passe WiFi (8+ caractères)
- [ ] Sauvegarder les vidéos si nécessaire
- [ ] Accès SSH au Raspberry Pi actuel

Pendant la reconfiguration :
- [ ] Changer SSID dans `/etc/hostapd/hostapd.conf`
- [ ] Changer mot de passe WiFi dans `/etc/hostapd/hostapd.conf`
- [ ] Mettre à jour `/home/pi/neopro/club-config.json`
- [ ] Changer hostname (optionnel)
- [ ] Redémarrer les services

Après la reconfiguration :
- [ ] Vérifier que le nouveau SSID apparaît
- [ ] Se connecter au nouveau WiFi
- [ ] Tester l'application web (`http://neopro.local`)
- [ ] Tester la télécommande
- [ ] Tester l'affichage TV
- [ ] Lancer le healthcheck

---

## Reconfiguration par lots (plusieurs Raspberry Pi)

Si vous devez reconfigurer plusieurs Raspberry Pi (transfert de club, changement de politique WiFi, etc.) :

### Script de reconfiguration en masse

```bash
#!/bin/bash
# deploy-reconfig-all.sh

SITES=(
  "neopro-cesson.local:CESSON:Pass123"
  "neopro-nantes.local:NANTES:Pass456"
  "neopro-rennes.local:RENNES:Pass789"
)

for site_config in "${SITES[@]}"; do
  IFS=':' read -r hostname club_name wifi_pass <<< "$site_config"

  echo "🔧 Reconfiguration de $hostname pour $club_name..."

  # Copier le script de reconfiguration
  scp reconfigure.sh pi@$hostname:~/

  # Exécuter la reconfiguration
  ssh pi@$hostname "sudo ~/reconfigure.sh $club_name $wifi_pass && sudo reboot"

  echo "✅ $hostname reconfiguré (en cours de redémarrage)"
  echo ""
done

echo "🎉 Tous les sites ont été reconfigurés !"
```

---

## Fréquence de reconfiguration

Reconfiguration nécessaire quand :
- **Transfert de boîtier** : D'un club à un autre
- **Changement de nom** : Fusion/renommage de club
- **Politique de sécurité** : Changement régulier des mots de passe WiFi
- **Correction d'erreur** : Mauvaise configuration initiale
- **Standardisation** : Harmonisation des configurations de flotte

---

## Support

Pour toute question ou problème lors de la reconfiguration :
- **Email :** support@neopro.fr
- **GitHub Issues :** [Créer un ticket](https://github.com/Tallec7/neopro/issues)
- **Documentation :**
  - [QUICK_SETUP.md](QUICK_SETUP.md) - Réinstallation complète
  - [UPDATE_GUIDE.md](UPDATE_GUIDE.md) - Mise à jour logicielle
  - [README.md](README.md) - Documentation technique

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** NEOPRO / Kalon Partners
