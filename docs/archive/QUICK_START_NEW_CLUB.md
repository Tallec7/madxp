# Guide rapide : Configurer un nouveau club en 5 minutes

## 🚀 Méthode automatique (RECOMMANDÉE)

### Un seul script pour tout faire !

```bash
# Depuis la racine du projet
./raspberry/scripts/setup-new-club.sh
```

**Ce script va :**
1. ✅ Collecter toutes les informations nécessaires (nom, localisation, contact, etc.)
2. ✅ Créer la configuration complète (auth + sync)
3. ✅ Générer un mot de passe sécurisé
4. ✅ Builder l'application Angular
5. ✅ Déployer sur le Raspberry Pi
6. ✅ Configurer la connexion au serveur central
7. ✅ Afficher un résumé complet

**Durée estimée :** 5-10 minutes

### Informations à préparer

Avant de lancer le script, ayez sous la main :

- ✅ Nom du club (ex: CESSON, RENNES)
- ✅ Nom complet (ex: CESSON Handball)
- ✅ Nom du site (ex: Complexe Sportif CESSON)
- ✅ Ville, région, pays
- ✅ Sports pratiqués
- ✅ Email de contact
- ✅ Téléphone (optionnel)
- ✅ Mot de passe souhaité (12 caractères minimum)
- ✅ Adresse du Raspberry Pi (neopro.local par défaut)

### Exemple d'exécution

```bash
$ ./raspberry/scripts/setup-new-club.sh

╔════════════════════════════════════════════════════════════════╗
║     CONFIGURATION NOUVEAU CLUB NEOPRO                          ║
╚════════════════════════════════════════════════════════════════╝

>>> Collecte des informations du club

Nom du club (ex: CESSON, RENNES) : CESSON
Nom complet du club (ex: CESSON Handball) : CESSON Handball
Nom du site (ex: Complexe Sportif CESSON) : Complexe Sportif CESSON
Ville : Cesson-Sévigné
Région (défaut: Bretagne) : Bretagne
Pays (défaut: France) : France
Sports (séparés par des virgules, défaut: handball) : handball
Email de contact : contact@cesson-handball.fr
Téléphone (optionnel) : +33 2 99 XX XX XX

⚠ Configuration du mot de passe d'authentification
ℹ Le mot de passe doit contenir au moins 12 caractères
ℹ Mélange recommandé : majuscules, minuscules, chiffres, symboles

Mot de passe : ****************
Confirmer le mot de passe : ****************
✓ Informations collectées

>>> Résumé de la configuration

Nom du club      : CESSON
Nom complet      : CESSON Handball
Nom du site      : Complexe Sportif CESSON
Ville            : Cesson-Sévigné
Région           : Bretagne
Pays             : France
Sports           : handball
Email            : contact@cesson-handball.fr
Téléphone        : +33 2 99 XX XX XX
Mot de passe     : Ces***********

Confirmer la création de cette configuration ? (o/N) : o

>>> Création du fichier de configuration
✓ Configuration créée : raspberry/configs/CESSON-configuration.json

>>> Build de l'application Angular
✓ Configuration copiée dans public/
ℹ Lancement du build (cela peut prendre quelques minutes)...
✓ Build terminé avec succès

>>> Déploiement sur le Raspberry Pi
Adresse du Raspberry Pi (défaut: neopro.local) : neopro.local
ℹ Déploiement vers neopro.local...
✓ Déploiement terminé

>>> Configuration du sync-agent (connexion au serveur central)

Voulez-vous configurer la connexion au serveur central maintenant ? (o/N) : o
ℹ Connexion au Raspberry Pi pour configurer le sync-agent...
>>> Installation du sync-agent...
✓ Configuration du sync-agent terminée

╔════════════════════════════════════════════════════════════════╗
║           CONFIGURATION TERMINÉE AVEC SUCCÈS                   ║
╚════════════════════════════════════════════════════════════════╝
```

## 🛠️ Méthode manuelle

Si vous préférez faire étape par étape :

### 1. Créer la configuration

```bash
# Copier le template
cp raspberry/configs/TEMPLATE-configuration.json raspberry/configs/CESSON-configuration.json

# Éditer
nano raspberry/configs/CESSON-configuration.json
```

Personnaliser :
- `auth.password` - Mot de passe unique
- `auth.clubName` - Nom du club
- `sync.siteName` - Nom du site
- `sync.clubName` - Nom complet du club
- `sync.location` - Ville, région, pays
- `sync.sports` - Sports pratiqués
- `sync.contact` - Email et téléphone

### 2. Build et déploiement

```bash
# Copier la config
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# Build
npm run build:raspberry

# Déploiement
npm run deploy:raspberry neopro.local
```

### 3. Configuration du sync-agent (sur le Pi)

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Aller dans sync-agent
cd /home/pi/neopro/sync-agent

# Installer les dépendances
npm install --production

# Enregistrer sur le serveur central
sudo node scripts/register-site.js

# Installer le service
sudo npm run install-service

# Vérifier
sudo systemctl status neopro-sync
```

## ✅ Vérification

### Sur le boîtier

```bash
# Tester les URLs
http://neopro.local/login     # Page de connexion
http://neopro.local/tv         # Mode TV (après login)
http://neopro.local/remote     # Télécommande (après login)
http://neopro.local:8080       # Interface admin
```

### Sur le serveur central

1. Se connecter à https://neopro-central.onrender.com
2. Aller dans **Sites** → **Liste des sites**
3. Vérifier que le site apparaît avec le statut 🟢 En ligne

### Logs

```bash
# Logs de l'application
ssh pi@neopro.local 'sudo journalctl -u neopro-app -f'

# Logs du sync-agent
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -f'

# Logs nginx
ssh pi@neopro.local 'sudo tail -f /home/pi/neopro/logs/nginx-error.log'
```

## 🎯 Checklist complète

- [ ] Script `setup-new-club.sh` exécuté
- [ ] Configuration créée dans `raspberry/configs/`
- [ ] Application buildée avec succès
- [ ] Application déployée sur le Pi
- [ ] Sync-agent installé et configuré
- [ ] Service systemd actif
- [ ] Connexion au serveur central établie
- [ ] Site visible dans le dashboard central
- [ ] Statut "En ligne" affiché
- [ ] Login fonctionne avec le nouveau mot de passe
- [ ] Accès à /tv et /remote OK
- [ ] Interface admin accessible (port 8080)

## 📋 Prochaines étapes

### 1. Personnaliser les vidéos

```bash
# Copier les vidéos du club
scp -r videos/CLUB_NAME/* pi@neopro.local:/home/pi/neopro/videos/

# Mettre à jour configuration.json avec les chemins des vidéos
ssh pi@neopro.local
nano /home/pi/neopro/webapp/configuration.json
```

### 2. Former les utilisateurs

- Donner le mot de passe WiFi (NEOPRO-CLUB_NAME)
- Donner le mot de passe de connexion
- Montrer comment utiliser la télécommande
- Expliquer le mode TV automatique

### 3. Monitoring

- Vérifier régulièrement le dashboard central
- S'assurer que les métriques remontent
- Vérifier les alertes

## 🆘 En cas de problème

### Le build échoue

```bash
# Vérifier les dépendances
npm install

# Nettoyer et rebuilder
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

# Réessayer le déploiement
npm run deploy:raspberry neopro.local
```

### Le sync-agent ne se connecte pas

```bash
# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 50'

# Vérifier la configuration
ssh pi@neopro.local 'cat /etc/neopro/site.conf'

# Réenregistrer
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js
sudo systemctl restart neopro-sync
```

## 📚 Documentation complète

- **[CENTRAL_FLEET_SETUP.md](CENTRAL_FLEET_SETUP.md)** - Configuration complète du système centralisé
- **[HOW_TO_USE_AUTH.md](HOW_TO_USE_AUTH.md)** - Authentification personnalisable
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Dépannage
- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - Index de toute la doc

## 💡 Conseils

### Sécurité

- ✅ Utilisez des mots de passe forts et uniques
- ✅ Ne commitez pas les configurations dans Git (déjà dans .gitignore)
- ✅ Changez le mot de passe WiFi du hotspot si nécessaire
- ✅ Documentez les mots de passe en lieu sûr (hors Git)

### Organisation

- ✅ Gardez un fichier Excel/Google Sheet avec la liste des clubs
- ✅ Notez pour chaque club : nom, mot de passe, contact, date d'installation
- ✅ Faites des backups réguliers des configurations

### Monitoring

- ✅ Vérifiez le dashboard central quotidiennement
- ✅ Configurez des alertes email pour les sites offline
- ✅ Planifiez des mises à jour régulières

## 🎉 C'est tout !

Votre nouveau club est configuré et connecté au serveur central ! 🚀
