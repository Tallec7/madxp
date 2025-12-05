# Guide d'initialisation rapide d'un nouveau Raspberry Pi

Guide pas à pas pour mettre en service un nouveau boîtier Neopro depuis zéro.

**Durée totale estimée :** 30-40 minutes

---

## Ce dont vous avez besoin

### Matériel
- [ ] Raspberry Pi 3B+ ou supérieur (4GB RAM recommandé)
- [ ] Carte microSD 32GB minimum (64GB recommandé)
- [ ] Lecteur de carte SD pour votre ordinateur
- [ ] Câble d'alimentation USB-C (Pi 4) ou micro-USB (Pi 3)
- [ ] Câble HDMI + écran TV (pour validation finale)
- [ ] Connexion Internet (temporaire, pour l'installation uniquement)

### Logiciels
- [ ] [Raspberry Pi Imager](https://www.raspberrypi.com/software/) installé sur votre PC/Mac
- [ ] Accès au dossier `raspberry/` du projet Neopro
- [ ] Application Angular buildée (`dist/neopro/browser/`)
- [ ] Vidéos du club (dossier `videos/`)

---

## Étape 1 : Préparation de la carte SD (10 min)

### 1.1 Flasher l'OS

1. Insérez la carte microSD dans votre ordinateur
2. Ouvrez **Raspberry Pi Imager**
3. Sélectionnez :
   - **Raspberry Pi Device** : Choisissez votre modèle (Pi 3, Pi 4, etc.)
   - **Operating System** : `Raspberry Pi OS (64-bit)` avec Desktop
   - **Storage** : Votre carte microSD

### 1.2 Configuration initiale

4. Cliquez sur **Suivant** puis **Modifier les réglages**
5. Dans l'onglet **GÉNÉRAL** :
   ```
   Hostname : raspberrypi
   Nom d'utilisateur : pi
   Mot de passe : [choisir un mot de passe]

   ✅ Configurer le WiFi
   SSID : [Votre WiFi avec Internet]
   Mot de passe : [Mot de passe WiFi]
   Pays : FR

   ✅ Activer SSH
   → Utiliser authentification par mot de passe
   ```

6. Dans l'onglet **SERVICES** :
   ```
   ✅ Activer SSH
   ```

7. Cliquez sur **ENREGISTRER** puis **OUI** pour appliquer les paramètres
8. Confirmez l'effacement et attendez la fin du flashage (5-10 min)
9. **Éjectez proprement** la carte SD

### 1.3 Premier démarrage

10. Insérez la carte SD dans le Raspberry Pi
11. Branchez l'alimentation
12. Attendez 1-2 minutes (le Pi démarre et se connecte au WiFi)

---

## Étape 2 : Première connexion SSH (2 min)

### 2.1 Trouver le Raspberry Pi

Depuis votre ordinateur (connecté au **même WiFi**) :

```bash
# Option 1 : Via mDNS (le plus simple)
ping raspberrypi.local

# Option 2 : Scanner le réseau
# Sur Mac/Linux
arp -a | grep -i "b8:27:eb\|dc:a6:32\|e4:5f:01"

# Sur Windows
arp -a | findstr "b8-27-eb dc-a6-32 e4-5f-01"
```

### 2.2 Connexion SSH

```bash
ssh pi@raspberrypi.local
# Ou si mDNS ne fonctionne pas :
ssh pi@[ADRESSE_IP_TROUVÉE]
```

Tapez `yes` pour accepter l'empreinte SSH, puis entrez le mot de passe défini à l'étape 1.2.

### 2.3 Mise à jour initiale

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

**Durée :** 2-5 minutes

---

## Étape 3 : Copie des fichiers d'installation (3 min)

### 3.1 Copier le dossier raspberry/

Depuis votre **ordinateur de développement** (nouveau terminal, PAS dans SSH) :

```bash
# Se placer dans le projet Neopro
cd /chemin/vers/neopro

# Copier tous les scripts d'installation
scp -r raspberry/ pi@raspberrypi.local:~/

# Vérifier la copie
ssh pi@raspberrypi.local "ls -la ~/raspberry/"
```

Vous devriez voir : `install.sh`, `config/`, `scripts/`, etc.

---

## Étape 4 : Installation Neopro (15-20 min)

### 4.1 Lancer l'installation

Depuis la session SSH sur le Raspberry Pi :

```bash
cd ~/raspberry
chmod +x install.sh

# Syntaxe : sudo ./install.sh [NOM_CLUB] [MOT_DE_PASSE_WIFI]
sudo ./install.sh CESSON MySecurePass123
```

**Remplacez :**
- `CESSON` par le nom de votre club (ex: NANTES, RENNES, DEMO)
- `MySecurePass123` par un mot de passe WiFi sécurisé (8+ caractères)

### 4.2 Que fait l'installation ?

Le script va automatiquement :
- ✅ Installer Node.js et toutes les dépendances
- ✅ Configurer le Hotspot WiFi `NEOPRO-CESSON`
- ✅ Configurer le hostname `neopro.local`
- ✅ Installer et configurer Nginx
- ✅ Créer les services systemd (neopro-app, neopro-admin, neopro-kiosk)
- ✅ Configurer le mode Kiosque pour la TV
- ✅ Créer l'arborescence des dossiers

**Durée :** 15-20 minutes

⚠️ **Ne pas interrompre** le processus !

### 4.3 Vérification

À la fin, vous devriez voir :
```
✅ Installation terminée avec succès !
✅ Le système va redémarrer dans 10 secondes...
```

Le Raspberry Pi redémarre automatiquement.

---

## Étape 5 : Déploiement de l'application (5 min)

### 5.1 Attendre le redémarrage

Attendez 1-2 minutes après le redémarrage, puis reconnectez-vous :

```bash
# Maintenant le hostname est "neopro"
ssh pi@neopro.local
```

### 5.2 Déployer automatiquement (recommandé)

Depuis votre **ordinateur de développement**, à la racine du dépôt :

```bash
./scripts/deploy-to-pi.sh neopro.local pi
```

Ce script :
- lance `npm install` + `npm run build`
- synchronise `dist/neopro/browser/` vers `/home/pi/neopro/webapp/`
- synchronise `public/videos/` (si présent)
- copie `public/configuration.json`
- redémarre `neopro-app` et `nginx`

### 5.3 Déploiement manuel (alternative)

Si vous devez copier manuellement :

```bash
# Se placer dans le projet Neopro
cd /chemin/vers/neopro

# Vérifier que le build existe
ls dist/neopro/browser/

# Copier l'application
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Vérifier la copie
ssh pi@neopro.local "ls -la /home/pi/neopro/webapp/"

# Copier toutes les vidéos
scp -r public/videos/* pi@neopro.local:/home/pi/neopro/videos/

# OU copier catégorie par catégorie
scp -r public/videos/Focus-partenaires/* pi@neopro.local:/home/pi/neopro/videos/Focus-partenaires/
scp -r public/videos/Info-club/* pi@neopro.local:/home/pi/neopro/videos/Info-club/

# Copier la configuration du club
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

---

## Étape 6 : Vérification et test (5 min)

### 6.1 Redémarrage final

```bash
ssh pi@neopro.local
sudo reboot
```

### 6.2 Vérifier le Hotspot WiFi

Attendez 2 minutes, puis depuis votre **mobile/tablette** :

1. Ouvrir les paramètres WiFi
2. Chercher le réseau : **NEOPRO-CESSON** (ou le nom de votre club)
3. Se connecter avec le mot de passe défini à l'étape 4.1
4. ✅ Connexion réussie

### 6.3 Tester l'application web

Depuis le mobile connecté au Hotspot :

1. Ouvrir le navigateur
2. Aller sur : `http://neopro.local`
3. ✅ Vous devriez voir la page de login Neopro

**URLs à tester :**
```
http://neopro.local          → Page login
http://neopro.local/tv       → Mode TV
http://neopro.local/remote   → Télécommande
http://neopro.local:8080     → Interface admin
```

**Alternative si mDNS ne fonctionne pas :**
```
http://192.168.4.1
http://192.168.4.1/tv
http://192.168.4.1:8080
```

### 6.4 Vérifier l'affichage TV

1. Connecter le Raspberry Pi à la TV via HDMI
2. Allumer la TV et sélectionner la bonne source HDMI
3. ✅ Après 1 minute, le mode Kiosque doit s'afficher automatiquement sur `/tv`
4. ✅ Les vidéos sponsors doivent jouer en boucle

### 6.5 Vérifier les services

SSH au Raspberry Pi et vérifier l'état :

```bash
ssh pi@neopro.local

# Vérifier tous les services
sudo systemctl status neopro-app
sudo systemctl status nginx
sudo systemctl status hostapd
sudo systemctl status dnsmasq
sudo systemctl status neopro-kiosk

# Tous doivent être "active (running)" en vert
```

### 6.6 Healthcheck complet

```bash
# Lancer le script de diagnostic
cd /home/pi/neopro/tools
./healthcheck.sh
```

✅ Tous les checks doivent être au vert.

---

## Étape 7 : Configuration finale (optionnel)

### 7.1 Connexion WiFi client (pour SSH distant)

Si vous voulez accéder au Raspberry Pi via SSH depuis Internet (en plus du Hotspot) :

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

Sauvegarder : `Ctrl+O`, `Enter`, `Ctrl+X`

Redémarrer :
```bash
sudo reboot
```

Le Pi aura alors 2 connexions réseau :
- **wlan0** : Hotspot `NEOPRO-CESSON` (192.168.4.1)
- **wlan1** : WiFi client (IP du réseau local)

### 7.2 Changer le mot de passe SSH

Par sécurité, changez le mot de passe de l'utilisateur `pi` :

```bash
passwd
```

---

## Checklist finale

- [ ] Carte SD flashée avec Raspberry Pi OS
- [ ] SSH activé et première connexion réussie
- [ ] Installation complète (`./install.sh`) terminée
- [ ] Application Angular copiée (`dist/neopro/browser/`)
- [ ] Vidéos copiées (`public/videos/`)
- [ ] Configuration copiée (`configuration.json`)
- [ ] Hotspot WiFi `NEOPRO-[CLUB]` visible et fonctionnel
- [ ] Application accessible sur `http://neopro.local`
- [ ] Mode TV fonctionne en HDMI (boucle sponsors)
- [ ] Télécommande accessible depuis mobile
- [ ] Interface admin accessible sur port 8080
- [ ] Healthcheck complet au vert
- [ ] Mode Kiosque démarre automatiquement au boot

---

## Dépannage rapide

### Le Hotspot WiFi n'apparaît pas
```bash
ssh pi@neopro.local  # Via WiFi temporaire
sudo systemctl status hostapd
sudo systemctl restart hostapd
sudo reboot
```

### neopro.local ne fonctionne pas
Utilisez l'IP directe : `http://192.168.4.1`

### La TV n'affiche rien
```bash
ssh pi@neopro.local
sudo systemctl status neopro-kiosk
sudo systemctl restart neopro-kiosk
```

### L'application ne démarre pas
```bash
ssh pi@neopro.local
sudo journalctl -u neopro-app -n 50
sudo systemctl restart neopro-app
```

### Les vidéos ne se chargent pas
Vérifier les permissions :
```bash
sudo chown -R pi:pi /home/pi/neopro
sudo chmod -R 755 /home/pi/neopro/videos
```

---

## Prochaines étapes

Votre Raspberry Pi est maintenant opérationnel !

- **Pour les utilisateurs :** Consultez [GUIDE-CLUB.md](GUIDE-CLUB.md)
- **Pour une démo :** Consultez [GUIDE-DEMO.md](GUIDE-DEMO.md)
- **Maintenance technique :** Consultez [README.md](README.md)
- **Gestion de flotte :** Consultez [../ADMIN_GUIDE.md](../ADMIN_GUIDE.md)

---

## Support

- **Email :** support@neopro.fr
- **GitHub Issues :** [Créer un ticket](https://github.com/Tallec7/neopro/issues)
- **Documentation :** [README principal](../README.md)

**Version :** 1.0.0
**Date :** Décembre 2024
