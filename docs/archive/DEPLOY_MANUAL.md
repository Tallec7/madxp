# Déploiement manuel sur Raspberry Pi

Le build a réussi ! Maintenant, déployons l'application sur le Pi.

## 📋 Méthode 1 : Copie manuelle avec mot de passe

```bash
# 1. Copier l'archive sur le Pi (vous devrez entrer le mot de passe)
scp raspberry/neopro-raspberry-deploy.tar.gz pi@neopro.local:~/

# 2. Se connecter au Pi
ssh pi@neopro.local

# 3. Sur le Pi, extraire et installer
tar -xzf neopro-raspberry-deploy.tar.gz
sudo cp -r deploy/webapp/* /home/pi/neopro/webapp/
sudo cp -r deploy/server/* /home/pi/neopro/server/
sudo chown -R pi:pi /home/pi/neopro/
sudo systemctl restart neopro-app
sudo systemctl restart nginx

# 4. Vérifier que ça fonctionne
curl -I http://localhost/
curl -I http://localhost/tv

# 5. Quitter le Pi
exit
```

## 📋 Méthode 2 : Copie directe des fichiers

Si l'archive pose problème, copiez directement les fichiers :

```bash
# Depuis votre Mac
cd /Users/gletallec/.claude-worktrees/neopro/interesting-nobel

# Copier l'application web
scp -r raspberry/deploy/webapp/* pi@neopro.local:/tmp/webapp/

# Copier le serveur
scp -r raspberry/deploy/server/* pi@neopro.local:/tmp/server/

# Se connecter au Pi
ssh pi@neopro.local

# Sur le Pi
sudo rm -rf /home/pi/neopro/webapp/*
sudo cp -r /tmp/webapp/* /home/pi/neopro/webapp/
sudo cp -r /tmp/server/* /home/pi/neopro/server/
sudo chown -R pi:pi /home/pi/neopro/
sudo systemctl restart neopro-app
sudo systemctl restart nginx

# Nettoyer
rm -rf /tmp/webapp /tmp/server

# Vérifier
curl -I http://localhost/
curl -I http://localhost/tv

exit
```

## 📋 Méthode 3 : Script de déploiement interactif

```bash
cd /Users/gletallec/.claude-worktrees/neopro/interesting-nobel

# Copie de l'archive (vous devrez entrer le mot de passe)
scp raspberry/neopro-raspberry-deploy.tar.gz pi@neopro.local:~/

# Déploiement en une commande SSH
ssh pi@neopro.local << 'EOF'
  echo "Extraction de l'archive..."
  tar -xzf ~/neopro-raspberry-deploy.tar.gz

  echo "Installation de l'application web..."
  sudo rm -rf /home/pi/neopro/webapp/*
  sudo cp -r ~/deploy/webapp/* /home/pi/neopro/webapp/

  echo "Installation du serveur..."
  sudo cp -r ~/deploy/server/* /home/pi/neopro/server/

  echo "Installation des vidéos..."
  sudo cp -rn ~/deploy/videos/* /home/pi/neopro/videos/ 2>/dev/null || true

  echo "Mise à jour des permissions..."
  sudo chown -R pi:pi /home/pi/neopro/

  echo "Redémarrage des services..."
  sudo systemctl restart neopro-app
  sudo systemctl restart nginx

  echo "Nettoyage..."
  rm -rf ~/deploy ~/neopro-raspberry-deploy.tar.gz

  echo "Vérification..."
  systemctl is-active neopro-app && echo "✓ neopro-app: OK"
  systemctl is-active nginx && echo "✓ nginx: OK"

  echo "Test HTTP..."
  curl -s -o /dev/null -w "Status /: %{http_code}\n" http://localhost/
  curl -s -o /dev/null -w "Status /tv: %{http_code}\n" http://localhost/tv
  curl -s -o /dev/null -w "Status /remote: %{http_code}\n" http://localhost/remote
EOF
```

## 🔑 Méthode 4 : Configurer SSH sans mot de passe (optionnel)

Pour les prochaines fois, configurez l'authentification par clé SSH :

```bash
# Sur votre Mac, générer une clé SSH (si vous n'en avez pas)
ssh-keygen -t rsa -b 4096 -C "votre_email@example.com"

# Copier la clé sur le Pi
ssh-copy-id pi@neopro.local

# Tester la connexion (ne devrait plus demander de mot de passe)
ssh pi@neopro.local 'echo "SSH sans mot de passe configuré !"'
```

Après cette configuration, le script `npm run deploy:raspberry` fonctionnera automatiquement.

## ✅ Vérification après déploiement

Une fois déployé, testez dans votre navigateur :

- http://neopro.local/
- http://neopro.local/tv
- http://neopro.local/remote
- http://neopro.local:8080

Toutes ces URLs devraient fonctionner sans erreur 500 !

## 🐛 Diagnostic en cas de problème

```bash
# Copier le script de diagnostic
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/

# L'exécuter
ssh pi@neopro.local './diagnose-pi.sh'
```

## 📝 Notes

- **Mot de passe par défaut du Pi** : Si vous ne l'avez pas changé, c'est souvent `raspberry`
- **SSID WiFi** : Connectez-vous au WiFi `NEOPRO-[NOM_CLUB]` si vous n'êtes pas sur le même réseau
- **IP de secours** : Si `neopro.local` ne fonctionne pas, essayez `192.168.4.1`
