# Neopro - Guide Utilisateur Simplifié

Guide pratique pour utiliser votre système Neopro au quotidien.

---

## 🚀 Démarrage rapide

### Premier démarrage (installation)

1. **Insérer la carte SD** dans le Raspberry Pi
2. **Brancher le câble HDMI** à la TV
3. **Brancher l'alimentation** du Raspberry Pi
4. **Attendre 1-2 minutes** - Un assistant s'ouvre automatiquement
5. **Suivre l'assistant** :
   - Entrer le nom du club
   - Définir le mot de passe WiFi
   - Confirmer
6. **Le système redémarre** automatiquement
7. **C'est prêt !**

---

## 📱 Utilisation quotidienne

### Allumer le système

1. Brancher l'alimentation du Raspberry Pi
2. Attendre 30 secondes
3. La TV affiche automatiquement la boucle de sponsors

✅ **Aucune manipulation nécessaire !**

### Contrôler depuis un mobile/tablette

1. **Se connecter au WiFi**
   - SSID : `NEOPRO-[VOTRE_CLUB]`
   - Mot de passe : celui défini lors de l'installation

2. **Ouvrir le navigateur**
   - Taper : `neopro.local/remote`
   - Ou : `192.168.4.1/remote`

3. **Sélectionner une vidéo**
   - Choisir la catégorie
   - Cliquer sur la vidéo
   - Elle s'affiche automatiquement sur la TV

4. **Retour sponsors**
   - La vidéo se termine automatiquement
   - Retour à la boucle sponsors

---

## 🎬 Ajouter des vidéos

### Méthode 1 : Interface Web Admin (Recommandé)

1. **Connexion au WiFi** Neopro
2. **Ouvrir** : `neopro.local:8080`
3. **Aller** dans l'onglet "Vidéos"
4. **Cliquer** sur "Choisir fichier"
5. **Sélectionner** la catégorie
6. **Cliquer** sur "Upload"

✅ La vidéo est immédiatement disponible !

### Méthode 2 : Clé USB

1. **Copier** les vidéos sur une clé USB
2. **Brancher** la clé sur le Raspberry Pi
3. **SSH** : `ssh pi@neopro.local`
4. **Copier** :
   ```bash
   cp /media/usb0/*.mp4 /home/pi/neopro/videos/[CATEGORIE]/
   ```

---

## ⚙️ Interface d'administration

**URL** : `neopro.local:8080`

### Onglet Dashboard
- Voir l'état du système
- Température, CPU, mémoire
- État des services

### Onglet Vidéos
- Uploader de nouvelles vidéos
- Voir toutes les vidéos
- Supprimer des vidéos

### Onglet Réseau
- Configurer le WiFi pour SSH distant
- Voir les adresses IP

### Onglet Logs
- Voir les logs en temps réel
- Diagnostic de problèmes

### Onglet Système
- Redémarrer les services
- Mettre à jour le système
- Redémarrer / Éteindre

---

## 🔧 Problèmes courants

### La TV n'affiche rien

**Solution** :
1. Vérifier que le Raspberry est alimenté (LED verte)
2. Vérifier le câble HDMI
3. Changer d'entrée HDMI sur la TV
4. Redémarrer : débrancher/rebrancher l'alimentation

### Le WiFi NEOPRO n'apparaît pas

**Solution** :
1. Attendre 1-2 minutes après le démarrage
2. Redémarrer le Raspberry Pi
3. Vérifier le mot de passe WiFi

**Récupération** :
```bash
# Connexion via câble Ethernet + SSH
ssh pi@192.168.1.XXX
sudo systemctl restart hostapd dnsmasq
```

### La télécommande ne fonctionne pas

**Solution** :
1. Vérifier la connexion WiFi
2. Rafraîchir la page du navigateur
3. Essayer l'IP directe : `192.168.4.1/remote`

**Vérification** :
```bash
# SSH
sudo systemctl status neopro-app
```

### Une vidéo ne se lance pas

**Solution** :
1. Vérifier le format (MP4 recommandé)
2. Vérifier la taille (< 500MB)
3. Re-uploader la vidéo

### L'espace disque est plein

**Solution via Admin** :
1. Aller dans "Vidéos"
2. Supprimer les vidéos inutilisées

**Solution SSH** :
```bash
# Voir l'espace
df -h

# Supprimer anciennes vidéos
rm /home/pi/neopro/videos/[CATEGORIE]/ancienne-video.mp4

# Nettoyer les backups
rm /home/pi/neopro/backups/backup-*.tar.gz
```

---

## 🆘 Diagnostic automatique

Si vous rencontrez des problèmes :

### Vérification rapide
```bash
ssh pi@neopro.local
/home/pi/raspberry/tools/healthcheck.sh
```

### Réparation automatique
```bash
ssh pi@neopro.local
sudo /home/pi/raspberry/tools/recovery.sh --auto
```

Le script :
- ✅ Détecte les problèmes
- ✅ Répare automatiquement
- ✅ Redémarre les services
- ✅ Crée un backup
- ✅ Génère un rapport

---

## 📞 Aide et support

### Vérifier l'état du système
- Interface Admin → Dashboard
- Ou : `ssh pi@neopro.local` puis `./raspberry/tools/healthcheck.sh`

### Redémarrer le système
- Interface Admin → Système → Redémarrer
- Ou : débrancher/rebrancher l'alimentation

### Éteindre proprement
- Interface Admin → Système → Éteindre
- Ou : `ssh pi@neopro.local` puis `sudo shutdown -h now`

### URLs utiles
- **Application** : `http://neopro.local`
- **Mode TV** : `http://neopro.local/tv`
- **Remote** : `http://neopro.local/remote`
- **Admin** : `http://neopro.local:8080`

### Contact support
- **Email** : support@neopro.fr
- **Tel** : [À définir]

---

## 💡 Conseils d'utilisation

### Avant un match

1. ✅ Allumer le système 10 minutes avant
2. ✅ Vérifier que la TV affiche la boucle sponsors
3. ✅ Tester la télécommande depuis un mobile
4. ✅ Préparer les vidéos à jouer (buts, jingles)

### Pendant le match

1. Garder le mobile connecté au WiFi Neopro
2. Avoir la page Remote ouverte
3. Sélectionner les vidéos au bon moment
4. La vidéo se joue automatiquement sur la TV

### Après le match

1. Laisser tourner (boucle sponsors automatique)
2. Ou éteindre via l'interface Admin
3. Ou débrancher l'alimentation

### Entretien régulier

**Chaque semaine** :
- Supprimer les vidéos inutilisées
- Vérifier l'espace disque

**Chaque mois** :
- Vérifier les mises à jour
- Nettoyer les logs via l'interface Admin

**Chaque saison** :
- Faire un backup complet
- Mettre à jour le système

---

## 📚 Fonctionnalités avancées

### Mise à jour du système

**Via interface Admin** :
1. Recevoir l'archive `.tar.gz` des développeurs
2. Onglet Système → Mise à jour
3. Upload du fichier
4. Backup automatique
5. Redémarrage automatique

### Configuration WiFi client (SSH distant)

**Permet aux développeurs d'accéder au système à distance**

1. Interface Admin → Réseau
2. Entrer SSID et mot de passe du WiFi du club
3. Configurer
4. Le Raspberry se connecte automatiquement
5. Communiquer l'IP obtenue aux développeurs

### Accès SSH

**Pour utilisateurs avancés**

```bash
# Connexion
ssh pi@neopro.local

# Mot de passe par défaut (à changer !)
# Demander aux développeurs

# Commandes utiles
sudo systemctl status neopro-app    # État app
sudo systemctl restart neopro-app   # Redémarrer app
sudo journalctl -u neopro-app -f    # Logs en direct
df -h                                # Espace disque
```

---

## ✅ Checklist match

**Avant le match** :
- [ ] Système allumé et fonctionnel
- [ ] TV affiche la boucle sponsors
- [ ] Mobile connecté au WiFi Neopro
- [ ] Page Remote ouverte sur le mobile
- [ ] Vidéos testées (1 but de test)
- [ ] Espace disque suffisant

**Pendant le match** :
- [ ] Remote accessible sur le mobile
- [ ] Vidéos lancées au bon moment
- [ ] Retour automatique aux sponsors

**Après le match** :
- [ ] Système éteint proprement (ou laissé allumé)

---

## 🎯 Rappel : Les bases

1. **Le Raspberry Pi est votre serveur local**
   - Crée un WiFi : NEOPRO-[CLUB]
   - Pas besoin d'Internet
   - Tout fonctionne en local

2. **La TV affiche automatiquement**
   - Boucle sponsors par défaut
   - Vidéos lancées depuis le Remote
   - Retour automatique aux sponsors

3. **Le mobile contrôle la TV**
   - Via le WiFi Neopro
   - URL : neopro.local/remote
   - Sélection simple des vidéos

4. **L'interface Admin gère tout**
   - Upload de vidéos
   - Configuration
   - Monitoring
   - Mise à jour

---

**Version** : 1.0.0
**Date** : Décembre 2024
**Support** : support@neopro.fr
