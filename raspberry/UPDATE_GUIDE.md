# Guide de mise à jour d'un Raspberry Pi Neopro existant

Guide pour mettre à jour un Raspberry Pi qui a déjà une version de Neopro installée.

---

## Avant de commencer

### Vérifier la version actuelle

```bash
# Se connecter au Raspberry Pi
ssh pi@neopro.local

# Vérifier que Neopro est installé
ls -la /home/pi/neopro/

# Vérifier les services
sudo systemctl status neopro-app
sudo systemctl status nginx
```

### Prérequis

- Accès SSH au Raspberry Pi
- Nouvelle version de l'application buildée localement (`dist/neopro/browser/`)
- Nouvelles vidéos si nécessaire
- Configuration à jour (`public/configuration.json`)

---

## Option 1 : Mise à jour de l'application uniquement (Rapide)

**Durée :** 5 minutes
**Cas d'usage :** Nouvelle version de l'application Angular, pas de changement système

### 1.1 Sauvegarder la configuration actuelle (optionnel)

```bash
# Depuis votre machine de développement
scp pi@neopro.local:/home/pi/neopro/webapp/configuration.json ~/neopro-backup-config.json
```

### 1.2 Copier la nouvelle application

```bash
# Depuis votre machine de développement
cd /chemin/vers/neopro

# Copier la nouvelle version
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Copier la nouvelle configuration
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

### 1.3 Redémarrer les services

```bash
# Se connecter au Raspberry Pi
ssh pi@neopro.local

# Redémarrer Nginx pour prendre en compte les nouveaux fichiers
sudo systemctl restart nginx

# Vérifier que tout fonctionne
curl -I http://localhost
```

### 1.4 Tester

Depuis un mobile connecté au WiFi `NEOPRO-[CLUB]` :
- Ouvrir `http://neopro.local` (forcer le rafraîchissement : Ctrl+F5 ou vider le cache)
- Vérifier que la nouvelle version s'affiche

---

## Option 2 : Mise à jour complète avec vidéos (Moyen)

**Durée :** 15-30 minutes
**Cas d'usage :** Nouvelle version de l'application + nouvelles vidéos

### 2.1 Vérifier l'espace disque disponible

```bash
ssh pi@neopro.local
df -h
# Vérifier que /home a assez d'espace pour les nouvelles vidéos
```

### 2.2 Copier l'application

```bash
# Depuis votre machine de développement
cd /chemin/vers/neopro

# Application
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# Configuration
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

### 2.3 Copier les nouvelles vidéos

```bash
# Option A : Copier toutes les vidéos (écrase l'existant)
scp -r public/videos/* pi@neopro.local:/home/pi/neopro/videos/

# Option B : Copier seulement une catégorie
scp -r public/videos/Focus-partenaires/* pi@neopro.local:/home/pi/neopro/videos/Focus-partenaires/

# Option C : Copier une vidéo spécifique
scp public/videos/Info-club/nouvelle-video.mp4 pi@neopro.local:/home/pi/neopro/videos/Info-club/
```

### 2.4 Vérifier les permissions

```bash
ssh pi@neopro.local

# Vérifier les permissions
sudo chown -R pi:pi /home/pi/neopro/videos/
sudo chmod -R 755 /home/pi/neopro/videos/

# Vérifier que les vidéos sont bien présentes
ls -lh /home/pi/neopro/videos/*/
```

### 2.5 Redémarrer les services

```bash
# Redémarrer l'application et Nginx
sudo systemctl restart neopro-app
sudo systemctl restart nginx

# Vérifier l'état
sudo systemctl status neopro-app
sudo systemctl status nginx
```

### 2.6 Tester

- Depuis le mobile : vérifier que les nouvelles vidéos apparaissent dans la télécommande
- Depuis la TV : vérifier que les vidéos se lancent correctement

---

## Option 3 : Mise à jour système complète (Long)

**Durée :** 30-60 minutes
**Cas d'usage :** Mise à jour de Node.js, services système, scripts d'installation, configuration Nginx/Hotspot

### 3.1 Sauvegarder les données importantes

```bash
ssh pi@neopro.local

# Créer un dossier de backup
mkdir -p ~/neopro-backup-$(date +%Y%m%d)
cd ~/neopro-backup-$(date +%Y%m%d)

# Sauvegarder la configuration
cp /home/pi/neopro/webapp/configuration.json .
cp /home/pi/neopro/club-config.json .

# Sauvegarder les logs (optionnel)
cp -r /home/pi/neopro/logs .

# Liste des vidéos (pour référence)
ls -R /home/pi/neopro/videos/ > videos-list.txt
```

### 3.2 Copier les nouveaux scripts d'installation

```bash
# Depuis votre machine de développement
cd /chemin/vers/neopro

# Copier le dossier raspberry mis à jour
scp -r raspberry/ pi@neopro.local:~/raspberry-new/
```

### 3.3 Se connecter et préparer la mise à jour

```bash
ssh pi@neopro.local

# Mise à jour du système
sudo apt-get update
sudo apt-get upgrade -y

# Arrêter les services Neopro temporairement
sudo systemctl stop neopro-app
sudo systemctl stop neopro-admin
sudo systemctl stop neopro-kiosk
```

### 3.4 Appliquer les mises à jour système

```bash
# Option A : Réinstallation complète (recommandé si changements majeurs)
cd ~/raspberry-new
sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
# ⚠️ Attention : cela va reconfigurer le système

# Option B : Mise à jour manuelle des composants
# Exemple : Mettre à jour Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Exemple : Mettre à jour les services systemd
sudo cp ~/raspberry-new/config/neopro-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart neopro-app
```

### 3.5 Restaurer les données

```bash
# Restaurer la configuration
cp ~/neopro-backup-*/configuration.json /home/pi/neopro/webapp/
cp ~/neopro-backup-*/club-config.json /home/pi/neopro/

# Les vidéos sont normalement préservées
# Vérifier qu'elles sont toujours présentes
ls -la /home/pi/neopro/videos/
```

### 3.6 Copier la nouvelle application

```bash
# Depuis votre machine de développement
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/
```

### 3.7 Redémarrer et vérifier

```bash
ssh pi@neopro.local

# Redémarrer tous les services
sudo systemctl restart neopro-app
sudo systemctl restart neopro-admin
sudo systemctl restart nginx
sudo systemctl restart neopro-kiosk

# Vérifier l'état de tous les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status nginx
sudo systemctl status hostapd
sudo systemctl status neopro-kiosk

# Healthcheck complet
cd /home/pi/neopro/tools
./healthcheck.sh
```

### 3.8 Redémarrage complet (recommandé)

```bash
sudo reboot
```

Attendre 2 minutes puis vérifier que tout fonctionne.

---

## Option 4 : Mise à jour via interface Admin (Si disponible)

**Durée :** 10 minutes
**Cas d'usage :** Mise à jour depuis l'interface web

### 4.1 Préparer le package de mise à jour

```bash
# Depuis votre machine de développement
cd /chemin/vers/neopro

# Créer une archive de mise à jour
tar -czf neopro-update-$(date +%Y%m%d).tar.gz \
  dist/neopro/browser/* \
  public/configuration.json \
  public/videos/*
```

### 4.2 Uploader via l'interface Admin

1. Se connecter au WiFi `NEOPRO-[CLUB]`
2. Ouvrir `http://neopro.local:8080`
3. Aller dans **Système** > **Mise à jour**
4. Sélectionner l'archive `neopro-update-*.tar.gz`
5. Cliquer sur **Mettre à jour**
6. Attendre la fin de l'installation
7. Le système redémarre automatiquement

---

## Mise à jour de vidéos uniquement

### Ajouter une nouvelle vidéo

```bash
# Copier la vidéo
scp public/videos/Info-club/ma-nouvelle-video.mp4 \
  pi@neopro.local:/home/pi/neopro/videos/Info-club/

# Se connecter au Pi
ssh pi@neopro.local

# Vérifier les permissions
sudo chown pi:pi /home/pi/neopro/videos/Info-club/ma-nouvelle-video.mp4
sudo chmod 644 /home/pi/neopro/videos/Info-club/ma-nouvelle-video.mp4

# Mettre à jour la configuration
# Option A : Via l'interface admin (http://neopro.local:8080)
# Option B : Copier la nouvelle configuration.json
```

### Supprimer une vidéo

```bash
# Option A : Via l'interface admin
# http://neopro.local:8080 > Vidéos > Supprimer

# Option B : Manuellement
ssh pi@neopro.local
rm /home/pi/neopro/videos/Info-club/ancienne-video.mp4

# Mettre à jour configuration.json en conséquence
```

### Remplacer toutes les vidéos

```bash
# Sauvegarder les anciennes (optionnel)
ssh pi@neopro.local
sudo mv /home/pi/neopro/videos /home/pi/neopro/videos-backup-$(date +%Y%m%d)
sudo mkdir /home/pi/neopro/videos

# Copier les nouvelles
scp -r public/videos/* pi@neopro.local:/home/pi/neopro/videos/

# Corriger les permissions
ssh pi@neopro.local
sudo chown -R pi:pi /home/pi/neopro/videos/
sudo chmod -R 755 /home/pi/neopro/videos/
```

---

## Mise à jour de la configuration uniquement

```bash
# Sauvegarder l'ancienne
scp pi@neopro.local:/home/pi/neopro/webapp/configuration.json ~/backup-config.json

# Copier la nouvelle
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/

# Redémarrer l'application
ssh pi@neopro.local
sudo systemctl restart neopro-app
```

---

## Dépannage après mise à jour

### L'application ne se charge plus

```bash
ssh pi@neopro.local

# Vérifier les fichiers
ls -la /home/pi/neopro/webapp/
# Doit contenir : index.html, main-*.js, etc.

# Vérifier les permissions
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo chmod -R 755 /home/pi/neopro/webapp/

# Vérifier Nginx
sudo nginx -t
sudo systemctl restart nginx

# Voir les logs
sudo tail -f /home/pi/neopro/logs/nginx-error.log
```

### Les vidéos ne s'affichent plus

```bash
ssh pi@neopro.local

# Vérifier les vidéos
ls -la /home/pi/neopro/videos/

# Vérifier la configuration
cat /home/pi/neopro/webapp/configuration.json

# Vérifier les logs
sudo journalctl -u neopro-app -n 100
```

### Les services ne démarrent plus

```bash
ssh pi@neopro.local

# Voir les erreurs
sudo journalctl -u neopro-app -n 50
sudo journalctl -u nginx -n 50

# Vérifier Node.js
node --version  # Doit être v20.x

# Réinstaller les dépendances
cd /home/pi/neopro/server
npm install

# Redémarrer
sudo systemctl restart neopro-app
```

### Restaurer une sauvegarde

```bash
ssh pi@neopro.local

# Restaurer l'application
sudo rm -rf /home/pi/neopro/webapp/*
# Copier l'ancienne version depuis votre machine

# Restaurer la configuration
cp ~/neopro-backup-*/configuration.json /home/pi/neopro/webapp/

# Restaurer les vidéos (si nécessaire)
sudo rm -rf /home/pi/neopro/videos
sudo mv /home/pi/neopro/videos-backup-* /home/pi/neopro/videos

# Redémarrer
sudo systemctl restart neopro-app nginx
sudo reboot
```

---

## Checklist de mise à jour

Avant la mise à jour :
- [ ] Identifier la version actuelle installée
- [ ] Tester la nouvelle version localement (`ng serve`)
- [ ] Préparer les nouveaux fichiers (build, vidéos, config)
- [ ] Sauvegarder la configuration actuelle
- [ ] Vérifier l'espace disque disponible

Pendant la mise à jour :
- [ ] Copier les nouveaux fichiers
- [ ] Vérifier les permissions
- [ ] Redémarrer les services
- [ ] Vérifier les logs

Après la mise à jour :
- [ ] Tester l'application web (`http://neopro.local`)
- [ ] Tester la télécommande (`http://neopro.local/remote`)
- [ ] Tester l'affichage TV (`http://neopro.local/tv`)
- [ ] Vérifier que les vidéos se lancent
- [ ] Vérifier l'interface admin (`http://neopro.local:8080`)
- [ ] Lancer le healthcheck (`./tools/healthcheck.sh`)

---

## Mise à jour par lots (plusieurs Raspberry Pi)

Si vous gérez plusieurs clubs avec le système de gestion de flotte :

### Via le dashboard central

1. Se connecter au dashboard : https://neopro-central.render.com
2. Aller dans **Sites** > **Sélectionner les sites**
3. Cliquer sur **Déployer une mise à jour**
4. Choisir le package de mise à jour
5. Sélectionner les sites cibles
6. Planifier ou lancer immédiatement
7. Suivre la progression en temps réel

### Via script automatisé (poste de dev)

Utilisez `./scripts/deploy-to-pi.sh` avec une boucle simple :

```bash
#!/bin/bash
SITES=("neopro-cesson.local" "neopro-nantes.local" "neopro-rennes.local")

for SITE in "${SITES[@]}"; do
  echo "Déploiement sur $SITE…"
  ./scripts/deploy-to-pi.sh "$SITE" pi
  echo "✅ $SITE mis à jour"
done
```

---

## Fréquence de mise à jour recommandée

- **Application Angular** : À chaque nouvelle fonctionnalité ou correction de bug
- **Vidéos** : Selon les besoins du club (nouveaux sponsors, matchs, etc.)
- **Configuration** : Quand les catégories changent
- **Système** : Une fois par trimestre (sécurité, Node.js, etc.)
- **Système d'exploitation** : Une fois par an (version majeure de Raspberry Pi OS)

---

## Support

Pour toute question ou problème lors de la mise à jour :
- **Email :** support@neopro.fr
- **GitHub Issues :** [Créer un ticket](https://github.com/Tallec7/neopro/issues)
- **Documentation :** [README principal](../README.md)

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** NEOPRO / Kalon Partners
