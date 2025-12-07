# Scripts Neopro Raspberry Pi

## 📋 Récapitulatif rapide

### Commandes npm (depuis le Mac)

| Commande | Description |
|----------|-------------|
| `npm run build:raspberry` | Compile l'application Angular (crée l'archive) |
| `npm run deploy:raspberry` | **Build + Deploy** (tout en un) |

### Scripts par cas d'usage

| Situation | Script | Où l'exécuter |
|-----------|--------|---------------|
| **Nouveau Raspberry Pi** | `raspberry/install.sh` | Sur le Pi |
| **Nouveau club** | `raspberry/scripts/setup-new-club.sh` | Sur Mac |
| **Mise à jour** | `npm run deploy:raspberry` | Sur Mac |
| **Supprimer un club** | `raspberry/scripts/delete-club.sh` | Sur Mac |
| **Backup un club** | `raspberry/scripts/backup-club.sh` | Sur Mac |
| **Restaurer un club** | `raspberry/scripts/restore-club.sh` | Sur Mac |
| **Diagnostic** | `raspberry/scripts/diagnose-pi.sh` | Sur le Pi |

---

## 🚀 Guide pas à pas

### 1. Installation d'un NOUVEAU Raspberry Pi (première fois)

#### Étape 1 : Installation système (sur le Pi)

```bash
# Se connecter au Pi (via SSH ou clavier/écran)
ssh pi@raspberrypi.local

# Copier et exécuter le script d'installation
sudo ./install.sh MONCLUB MotDePasseWiFi123
```

Ce script :
- Vérifie les prérequis (connexion Internet, espace disque)
- Installe Node.js, nginx, hostapd, dnsmasq
- Configure les services systemd (neopro-app, neopro-admin, **neopro-sync-agent**)
- Configure le WiFi hotspot
- Affiche la durée totale d'installation

#### Étape 2 : Configuration du club (sur Mac)

```bash
./raspberry/scripts/setup-new-club.sh
```

Ce script :
- Collecte les infos du club (nom, ville, mot de passe...)
- Crée la configuration dans `raspberry/config/templates/`
- Teste la connexion SSH au Pi
- Build et déploie l'application (réutilise `build-and-deploy.sh`)
- Configure le hotspot WiFi avec le nom du club
- Configure le sync-agent pour le serveur central

---

### 2. Mise à jour d'un club EXISTANT

Une seule commande depuis le Mac :

```bash
npm run deploy:raspberry
```

Cette commande :
1. Vérifie les prérequis (Node.js, npm, Angular CLI)
2. Compile l'application Angular (skip npm install si pas nécessaire)
3. Crée l'archive de déploiement
4. Crée un backup de la version actuelle sur le Pi
5. L'envoie sur le Pi via SSH
6. Redémarre tous les services (neopro-app, nginx, sync-agent)
7. Vérifie que les services sont actifs
8. Affiche la durée totale

**Options :**
```bash
# Déployer vers une adresse spécifique
./raspberry/scripts/deploy-remote.sh neopro.home
./raspberry/scripts/deploy-remote.sh 192.168.4.1
```

---

### 3. Diagnostic / Maintenance

```bash
# Copier le script de diagnostic sur le Pi
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/

# L'exécuter
ssh pi@neopro.local './diagnose-pi.sh'
```

---

## 📂 Liste complète des scripts

### Scripts principaux

| Script | Emplacement | Exécution | Description |
|--------|-------------|-----------|-------------|
| `install.sh` | `raspberry/` | Sur Pi | Installation système complète |
| `setup-new-club.sh` | `raspberry/scripts/` | Sur Mac | Configuration nouveau club |
| `delete-club.sh` | `raspberry/scripts/` | Sur Mac | Suppression d'un club |
| `backup-club.sh` | `raspberry/scripts/` | Sur Mac | Sauvegarde config + vidéos |
| `restore-club.sh` | `raspberry/scripts/` | Sur Mac | Restauration d'un backup |
| `build-raspberry.sh` | `raspberry/scripts/` | Sur Mac | Build Angular uniquement |
| `deploy-remote.sh` | `raspberry/scripts/` | Sur Mac | Déploiement SSH uniquement |

### Scripts de maintenance

| Script | Emplacement | Exécution | Description |
|--------|-------------|-----------|-------------|
| `diagnose-pi.sh` | `raspberry/scripts/` | Sur Pi | Diagnostic complet |
| `fix-hostname.sh` | `raspberry/scripts/` | Sur Pi | Corriger le hostname |
| `setup-wifi-client.sh` | `raspberry/scripts/` | Sur Pi | Configurer WiFi client (accès internet) |

---

## 🔧 Détails des scripts

### install.sh (Sur le Pi)

**Usage :**
```bash
sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
```

**Exemple :**
```bash
sudo ./install.sh CESSON MyWiFiPass123
```

**Ce qu'il fait :**
- Installe Node.js 18
- Installe et configure nginx
- Installe hostapd et dnsmasq (WiFi AP)
- Crée les services systemd
- Configure le réseau WiFi en point d'accès

---

### setup-new-club.sh (Sur Mac)

**Usage :**
```bash
./raspberry/scripts/setup-new-club.sh
```

**Ce qu'il fait (interactif) :**
1. Demande les informations du club
2. Crée `raspberry/config/templates/CLUB-configuration.json`
3. Build l'application Angular
4. Déploie sur le Pi
5. Configure le hotspot WiFi (SSID `NEOPRO-CLUB`)
6. Configure le sync-agent (connexion au serveur central)

---

### build-raspberry.sh (Sur Mac)

**Usage :**
```bash
npm run build:raspberry
# OU
./raspberry/scripts/build-raspberry.sh
```

**Ce qu'il fait :**
- Compile l'application Angular en mode production
- Crée l'archive `raspberry/neopro-raspberry-deploy.tar.gz`

---

### deploy-remote.sh (Sur Mac)

**Usage :**
```bash
npm run deploy:raspberry              # Build + Deploy (par défaut vers neopro.local)
./raspberry/scripts/deploy-remote.sh neopro.home    # Deploy vers adresse spécifique
```

**Ce qu'il fait :**
1. (Si appelé via npm) Build l'application
2. Crée un backup sur le Pi
3. Upload l'archive via SCP
4. Extrait et installe les fichiers
5. Configure les permissions
6. Redémarre les services (neopro-app, nginx)
7. Vérifie que l'application répond

---

### backup-club.sh (Sur Mac)

**Usage :**
```bash
./raspberry/scripts/backup-club.sh neopro.local
./raspberry/scripts/backup-club.sh neopro.home mon-backup
```

**Ce qu'il sauvegarde :**
- `configuration.json` (config du club)
- `site.conf` et `.env` (config sync-agent)
- Vidéos (optionnel, peut être volumineux)

**Résultat :**
Archive dans `raspberry/backups/CLUB-backup-DATE.tar.gz`

---

### restore-club.sh (Sur Mac)

**Usage :**
```bash
./raspberry/scripts/restore-club.sh raspberry/backups/CESSON-backup-20241207.tar.gz neopro.local
```

**Ce qu'il restaure :**
- Configuration du club
- Configuration du sync-agent
- Vidéos (si présentes et confirmées)

---

### delete-club.sh (Sur Mac)

**Usage :**
```bash
./raspberry/scripts/delete-club.sh
./raspberry/scripts/delete-club.sh CESSON
```

**Ce qu'il fait :**
1. Supprime l'enregistrement sur le serveur central (optionnel)
2. Réinitialise le Raspberry Pi avec 2 options :
   - **Réinitialisation légère** : supprime config uniquement, garde l'app et les vidéos
   - **Réinitialisation complète** : supprime TOUT (app Neopro, vidéos, services, config)
3. Supprime la configuration locale
4. Supprime la clé SSH connue (optionnel)

**Note :** La réinitialisation complète nécessite de taper "SUPPRIMER" pour confirmer.

---

## 🐛 Dépannage

### Le build échoue

```bash
rm -rf dist node_modules
npm install
npm run build:raspberry
```

### Le déploiement échoue

```bash
# Vérifier la connexion SSH
ssh pi@neopro.local

# Vérifier le réseau
ping neopro.local

# Essayer avec l'IP directe
./raspberry/scripts/deploy-remote.sh 192.168.4.1
```

### Les services ne démarrent pas

```bash
# Voir les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'
ssh pi@neopro.local 'sudo journalctl -u nginx -n 50'

# Redémarrer manuellement
ssh pi@neopro.local 'sudo systemctl restart neopro-app nginx'
```

---

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

- Créez une configuration par club dans `raspberry/config/templates/`
- Documentez les mots de passe dans un gestionnaire sécurisé (hors Git)
- Gardez un tableau de suivi des clubs déployés

---

## 🔄 Workflow recommandé

```bash
# Nouveau club complet
./raspberry/scripts/setup-new-club.sh

# Mise à jour rapide
npm run deploy:raspberry

# Backup avant grosse modification
./raspberry/scripts/backup-club.sh neopro.local

# Restaurer un backup
./raspberry/scripts/restore-club.sh raspberry/backups/CLUB-backup.tar.gz neopro.local

# Supprimer un club pour recommencer
./raspberry/scripts/delete-club.sh

# Diagnostic
ssh pi@neopro.local './diagnose-pi.sh'
```
