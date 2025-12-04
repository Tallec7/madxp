# Neopro Raspberry Pi - Guide de démarrage rapide

## 🎯 Objectif

Transformer un Raspberry Pi en système Neopro autonome avec :
- ✅ Hotspot WiFi `NEOPRO-[CLUB]`
- ✅ Accès local `http://neopro.local`
- ✅ Fonctionnement sans Internet
- ✅ Démarrage automatique
- ✅ Mode TV en kiosque sur grand écran

---

## ⚡ Installation rapide (15 min)

### Étape 1 : Préparation du matériel
- Raspberry Pi 4 (4GB RAM minimum)
- Carte microSD 32GB minimum
- Câble HDMI vers la TV
- Alimentation Raspberry Pi
- (Optionnel) Dongle WiFi USB pour dual WiFi

### Étape 2 : Flash de la carte SD
1. Télécharger [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Flasher **Raspberry Pi OS (64-bit) with Desktop**
3. Configurer SSH et WiFi temporaire pour installation

### Étape 3 : Copie des fichiers
```bash
# Depuis votre machine de dev
scp -r raspberry/ pi@raspberrypi.local:~/
```

### Étape 4 : Installation automatique
```bash
# SSH vers le Raspberry Pi
ssh pi@raspberrypi.local

# Lancement installation (remplacer NOM_CLUB et PASSWORD)
cd ~/raspberry
sudo ./install.sh CESSON MySecurePass123
```

### Étape 5 : Copie de l'application
```bash
# Build depuis votre machine de dev
npm run build:raspberry

# Copie vers le Raspberry Pi
scp raspberry/neopro-raspberry-deploy.tar.gz pi@raspberrypi.local:~/

# Sur le Raspberry Pi
ssh pi@raspberrypi.local
tar -xzf neopro-raspberry-deploy.tar.gz
sudo cp -r deploy/webapp/* /home/pi/neopro/webapp/
sudo cp -r deploy/server/* /home/pi/neopro/server/
sudo cp -r deploy/videos/* /home/pi/neopro/videos/
```

### Étape 6 : Redémarrage
```bash
sudo reboot
```

✅ **C'est prêt !**

---

## 📱 Utilisation

### 1. Connexion au système
- **WiFi :** Chercher `NEOPRO-CESSON` (ou votre nom de club)
- **Mot de passe :** Celui défini à l'installation
- **URL :** `http://neopro.local`

### 2. Interfaces disponibles
- **Login :** `http://neopro.local/login`
- **TV (écran)** : Démarrage automatique en kiosque
- **Remote (mobile)** : `http://neopro.local/remote`

### 3. Workflow opérationnel
1. Allumer le Raspberry Pi
2. Attendre 30 secondes (démarrage automatique)
3. La TV affiche la boucle de sponsors
4. Se connecter au WiFi `NEOPRO-[CLUB]` avec mobile
5. Ouvrir `http://neopro.local/remote`
6. Contrôler la TV depuis le mobile

---

## 🔄 Mise à jour

### Via script automatique (recommandé)
```bash
# Depuis votre machine de dev
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

### Via SSH manuel
```bash
ssh pi@neopro.local
cd /home/pi/neopro
# ... copier les nouveaux fichiers ...
sudo systemctl restart neopro-app
```

---

## 🆘 Dépannage rapide

### Le WiFi NEOPRO-XXX n'apparaît pas
```bash
ssh pi@raspberrypi.local  # Via WiFi temporaire
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

### neopro.local ne fonctionne pas
Utilisez l'IP directe : `http://192.168.4.1`

### La TV ne démarre pas automatiquement
```bash
ssh pi@neopro.local
sudo systemctl status neopro-kiosk
sudo systemctl restart neopro-kiosk
```

### Voir les logs
```bash
ssh pi@neopro.local
sudo journalctl -u neopro-app -f
```

---

## 📚 Documentation complète

- **[README.md](./README.md)** : Documentation détaillée
- **[PHASE1-COMPLETE.md](./PHASE1-COMPLETE.md)** : Détails techniques Phase 1

---

## 🔐 Sécurité

### Important après installation
```bash
# Changer le mot de passe par défaut
passwd
```

### Accès SSH distant (optionnel)
```bash
# Configurer le WiFi client
sudo ./raspberry/scripts/setup-wifi-client.sh "WiFi-Salle" "password"

# SSH via Internet
ssh pi@[IP_PUBLIQUE]
```

---

## 💡 Conseils

### Mode Dual WiFi (recommandé)
- Ajouter un **dongle WiFi USB**
- `wlan0` = Hotspot pour remote
- `wlan1` = WiFi salle pour SSH distant
- Permet mises à jour sans récupérer le boîtier

### Personnalisation
Modifier avant installation :
- **SSID** : `raspberry/config/hostapd.conf` (ligne `ssid=`)
- **Mot de passe** : Paramètre lors de `./install.sh`
- **Vidéos** : Copier dans `/home/pi/neopro/videos/`

### Performance
- Utiliser Raspberry Pi 4 (4GB ou 8GB)
- Carte microSD classe 10 minimum (U3 recommandé)
- Dissipateur thermique recommandé

---

## ✅ Checklist déploiement

- [ ] Raspberry Pi flashé avec Raspberry Pi OS Desktop
- [ ] Script `install.sh` exécuté avec nom du club
- [ ] Application Angular copiée dans `/home/pi/neopro/webapp/`
- [ ] Serveur Node.js copié dans `/home/pi/neopro/server/`
- [ ] Vidéos copiées dans `/home/pi/neopro/videos/`
- [ ] Service `neopro-app` actif : `sudo systemctl status neopro-app`
- [ ] Service `neopro-kiosk` actif : `sudo systemctl status neopro-kiosk`
- [ ] Hotspot WiFi visible sur mobile
- [ ] Connexion à `http://neopro.local` réussie
- [ ] Vidéo de test jouée depuis remote
- [ ] Mot de passe utilisateur `pi` changé

---

**Besoin d'aide ?** Consultez le [README complet](./README.md) ou contactez support@neopro.fr
