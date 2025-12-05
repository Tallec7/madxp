# Scripts Neopro Raspberry Pi

Ce dossier contient les scripts pour builder, déployer et configurer les boîtiers Neopro.

## 🚀 Script principal : setup-new-club.sh

**Le script tout-en-un pour configurer un nouveau club.**

### Usage

```bash
# Depuis la racine du projet
./raspberry/scripts/setup-new-club.sh
```

### Ce qu'il fait

1. ✅ Collecte toutes les informations nécessaires (interactif)
2. ✅ Crée la configuration complète (auth + sync)
3. ✅ Valide le mot de passe (12+ caractères)
4. ✅ Build l'application Angular
5. ✅ Déploie sur le Raspberry Pi
6. ✅ Configure le sync-agent (connexion serveur central)
7. ✅ Installe le service systemd
8. ✅ Affiche un résumé complet

### Durée estimée

5-10 minutes (selon la connexion et le Pi)

### Informations requises

- Nom du club (ex: CESSON)
- Nom complet (ex: CESSON Handball)
- Nom du site (ex: Complexe Sportif CESSON)
- Ville, région, pays
- Sports pratiqués
- Email de contact
- Téléphone (optionnel)
- Mot de passe (12+ caractères)

### Exemple

```bash
$ ./raspberry/scripts/setup-new-club.sh

╔════════════════════════════════════════════════════════════════╗
║     CONFIGURATION NOUVEAU CLUB NEOPRO                          ║
╚════════════════════════════════════════════════════════════════╝

>>> Collecte des informations du club

Nom du club (ex: CESSON, RENNES) : CESSON
...
Mot de passe : ****************

>>> Création du fichier de configuration
✓ Configuration créée : raspberry/configs/CESSON-configuration.json

>>> Build de l'application Angular
✓ Build terminé avec succès

>>> Déploiement sur le Raspberry Pi
✓ Déploiement terminé

>>> Configuration du sync-agent
✓ Configuration du sync-agent terminée

╔════════════════════════════════════════════════════════════════╗
║           CONFIGURATION TERMINÉE AVEC SUCCÈS                   ║
╚════════════════════════════════════════════════════════════════╝
```

## 📋 Autres scripts

### build-raspberry.sh

Build l'application Angular pour le Raspberry Pi.

```bash
# Depuis la racine du projet
npm run build:raspberry

# OU directement
./raspberry/scripts/build-raspberry.sh
```

**Résultat :**
- Archive : `raspberry/neopro-raspberry-deploy.tar.gz`
- Contenu : Application Angular buildée + serveur Node.js

### deploy-remote.sh

Déploie l'application sur un Raspberry Pi distant.

```bash
# Depuis la racine du projet
npm run deploy:raspberry neopro.local

# OU directement
./raspberry/scripts/deploy-remote.sh neopro.local
```

**Ce qu'il fait :**
- Upload de l'archive
- Backup de l'ancienne version
- Installation des nouveaux fichiers
- Configuration des permissions (automatique !)
- Redémarrage des services
- Vérification

### diagnose-pi.sh

Script de diagnostic complet du Raspberry Pi.

```bash
# Copier sur le Pi
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/

# Exécuter
ssh pi@neopro.local './diagnose-pi.sh'
```

**Vérifie :**
- Services systemd
- Ports réseau
- Fichiers et répertoires
- Application Angular
- Configuration nginx
- Réseau WiFi
- Tests HTTP

## 🔧 Scripts de développement

### dev-local.sh (racine du projet)

Lance tous les services en développement local.

```bash
# Depuis la racine du projet
./dev-local.sh
```

**Démarre :**
- Angular dev server (port 4200)
- Socket.IO server (port 3000)
- Admin interface MODE DEMO (port 8080)

## 📚 Documentation associée

- **[../QUICK_START_NEW_CLUB.md](../QUICK_START_NEW_CLUB.md)** - Guide rapide nouveau club
- **[../CENTRAL_FLEET_SETUP.md](../CENTRAL_FLEET_SETUP.md)** - Configuration serveur central
- **[../TROUBLESHOOTING.md](../TROUBLESHOOTING.md)** - Dépannage
- **[../HOW_TO_USE_AUTH.md](../HOW_TO_USE_AUTH.md)** - Authentification

## 🐛 Dépannage

### Le script setup-new-club.sh ne se lance pas

```bash
# Rendre le script exécutable
chmod +x raspberry/scripts/setup-new-club.sh

# Vérifier qu'on est à la racine du projet
pwd  # Devrait afficher: .../neopro
```

### Le build échoue

```bash
# Nettoyer et réinstaller les dépendances
rm -rf dist node_modules
npm install
npm run build:raspberry
```

### Le déploiement échoue

```bash
# Vérifier la connexion SSH
ssh pi@neopro.local

# Vérifier que le Pi est accessible
ping neopro.local

# Essayer avec l'IP directe
npm run deploy:raspberry 192.168.4.1
```

### Le sync-agent ne démarre pas

```bash
# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 50'

# Vérifier la configuration
ssh pi@neopro.local 'cat /etc/neopro/site.conf'

# Réinstaller
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
sudo npm run install-service
```

## 💡 Conseils

### Performances

- Le build prend 1-2 minutes
- Le déploiement prend 30-60 secondes
- La configuration du sync-agent prend 1-2 minutes

### Sécurité

- Les scripts ne stockent jamais les mots de passe en clair dans les logs
- Les configurations avec mots de passe sont dans `.gitignore`
- Utilisez des mots de passe forts (12+ caractères)

### Organisation

- Créez une configuration par club dans `raspberry/configs/`
- Documentez les mots de passe dans un gestionnaire sécurisé (hors Git)
- Gardez un tableau de suivi des clubs déployés

## 📞 Support

En cas de problème avec les scripts :

1. Consulter [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
2. Exécuter le script de diagnostic
3. Vérifier les logs

## 🔄 Workflow recommandé

```bash
# 1. Nouveau club
./raspberry/scripts/setup-new-club.sh

# 2. Mise à jour application
npm run build:raspberry
npm run deploy:raspberry neopro.local

# 3. Diagnostic en cas de problème
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/
ssh pi@neopro.local './diagnose-pi.sh'
```
