# Guide de correction rapide - Erreur 500 sur /tv et /remote

## 🔍 Problème identifié

Les erreurs 500 sur `neopro.local/tv` et `neopro.local/remote` sont causées par **l'absence de l'application Angular déployée** dans `/home/pi/neopro/webapp/` sur le Raspberry Pi.

## ✅ Solution rapide (depuis votre Mac)

### Étape 1 : Build de l'application

```bash
# Depuis le répertoire neopro sur votre Mac
cd /Users/gletallec/.claude-worktrees/neopro/interesting-nobel

# OU depuis le répertoire principal
cd /Users/gletallec/Documents/NEOPRO/neopro

# Build l'application
npm run build:raspberry
```

**Note :** Le script `build:raspberry` a été corrigé pour fonctionner correctement.

### Étape 2 : Déploiement sur le Raspberry Pi

```bash
# Toujours depuis le répertoire neopro
npm run deploy:raspberry neopro.local
```

Ce script va :
- Copier l'application Angular buildée vers `/home/pi/neopro/webapp/`
- Copier le serveur Socket.IO
- Redémarrer les services
- Vérifier que tout fonctionne

## 🔧 Alternative manuelle (si les scripts ne marchent pas)

### Option A : Copie manuelle des fichiers

```bash
# 1. Build
ng build --configuration=production

# 2. Copie de l'application web
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# 3. Copie des vidéos (si nécessaire)
scp -r videos/* pi@neopro.local:/home/pi/neopro/videos/

# 4. Copie de la configuration
scp public/configuration.json pi@neopro.local:/home/pi/neopro/webapp/

# 5. Redémarrer nginx sur le Pi
ssh pi@neopro.local 'sudo systemctl restart nginx'
```

### Option B : Diagnostic complet sur le Pi

```bash
# 1. Copier le script de diagnostic
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/

# 2. Se connecter au Pi
ssh pi@neopro.local

# 3. Exécuter le diagnostic
chmod +x ~/diagnose-pi.sh
./diagnose-pi.sh
```

Le script de diagnostic va :
- Vérifier tous les services (nginx, neopro-app, etc.)
- Vérifier la présence des fichiers Angular
- Tester les URLs HTTP
- Afficher les logs d'erreur
- Suggérer les actions correctives

## 🧪 Vérification

Une fois déployé, testez ces URLs dans votre navigateur :

- ✅ `http://neopro.local/` - Page principale
- ✅ `http://neopro.local/tv` - Mode TV
- ✅ `http://neopro.local/remote` - Télécommande
- ✅ `http://neopro.local:8080` - Interface Admin

## 📋 Checklist de vérification sur le Pi

```bash
# Vérifier que les fichiers sont présents
ssh pi@neopro.local 'ls -la /home/pi/neopro/webapp/'

# Devrait afficher :
# - index.html
# - main.*.js
# - polyfills.*.js
# - styles.*.css
# - etc.

# Vérifier que les services tournent
ssh pi@neopro.local 'sudo systemctl status neopro-app nginx'

# Vérifier les logs en cas d'erreur
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'
ssh pi@neopro.local 'sudo journalctl -u nginx -n 50'
```

## 🚨 Problèmes courants

### 1. "Permission denied" lors du SCP

**Solution :** Assurez-vous que :
- Le Raspberry Pi est allumé et accessible
- Vous êtes connecté au WiFi `NEOPRO-XXXX`
- Vous avez le bon mot de passe pour l'utilisateur `pi`

### 2. "Cannot execute: required file not found"

**Cause :** Problème de fins de ligne (CRLF au lieu de LF)

**Solution :**
```bash
# Sur votre Mac, convertir les fins de ligne
sed -i '' 's/\r$//' raspberry/scripts/diagnose-pi.sh

# Puis recopier
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/
```

### 3. Services qui ne démarrent pas

```bash
# Redémarrer tous les services
ssh pi@neopro.local 'sudo systemctl restart neopro-app neopro-admin nginx'

# Vérifier les statuts
ssh pi@neopro.local 'sudo systemctl status neopro-app neopro-admin nginx'
```

## 💡 Commandes utiles

```bash
# Voir les logs en temps réel
ssh pi@neopro.local 'sudo journalctl -u neopro-app -f'

# Redémarrer le Pi
ssh pi@neopro.local 'sudo reboot'

# Vérifier l'espace disque
ssh pi@neopro.local 'df -h'

# Vérifier les processus Node.js
ssh pi@neopro.local 'ps aux | grep node'

# Tester nginx localement sur le Pi
ssh pi@neopro.local 'curl -I http://localhost/'
ssh pi@neopro.local 'curl -I http://localhost/tv'
```

## 📞 Besoin d'aide ?

Si ces solutions ne fonctionnent pas, exécutez le script de diagnostic et partagez les résultats :

```bash
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/
ssh pi@neopro.local './diagnose-pi.sh > diagnostic.log 2>&1'
scp pi@neopro.local:~/diagnostic.log .
cat diagnostic.log
```
