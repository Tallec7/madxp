# Scripts Neopro Raspberry Pi

## 📋 Récapitulatif rapide

### Commandes npm (depuis le Mac)

| Commande                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `npm run build:raspberry`  | Compile l'application Angular (crée l'archive) |
| `npm run deploy:raspberry` | **Build + Deploy** (tout en un)                |

### Scripts par cas d'usage

| Situation                         | Script                                   | Où l'exécuter            |
| --------------------------------- | ---------------------------------------- | ------------------------ |
| **🆕 Installation en ligne**      | `curl ... setup.sh`                      | Sur le Pi (via Internet) |
| **Copier fichiers vers Pi**       | `raspberry/scripts/copy-to-pi.sh`        | Sur Mac                  |
| **Nouveau Raspberry Pi**          | `raspberry/install.sh`                   | Sur le Pi                |
| **Nouveau club (remote)** ✅      | `raspberry/scripts/setup-remote-club.sh` | N'importe où             |
| **Nouveau club (local - dev)** 🔧 | `raspberry/scripts/setup-new-club.sh`    | Sur Mac                  |
| **Mise à jour**                   | `npm run deploy:raspberry`               | Sur Mac                  |
| **Supprimer un club**             | `raspberry/scripts/delete-club.sh`       | Sur Mac                  |
| **Backup un club**                | `raspberry/scripts/backup-club.sh`       | Sur Mac                  |
| **Restaurer un club**             | `raspberry/scripts/restore-club.sh`      | Sur Mac                  |
| **Nettoyage post-install**        | `raspberry/scripts/cleanup-pi.sh`        | Sur Mac                  |
| **Diagnostic**                    | `raspberry/scripts/diagnose-pi.sh`       | Sur le Pi                |

**📖 Pour plus de détails sur les deux méthodes de configuration club (remote vs local), consultez [CLUB-SETUP-README.md](CLUB-SETUP-README.md)**

---

## 🚀 Guide pas à pas

### 0. 🆕 Installation en ligne (NOUVEAU - Méthode la plus simple)

**Installation automatique depuis Internet en une seule commande !**

```bash
# 1. Flasher Raspberry Pi OS Lite avec WiFi/SSH activé
# 2. Se connecter au Pi
ssh pi@raspberrypi.local

# 3. Lancer l'installation en une ligne
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD

# Alternative (URL longue) :
curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD
```

**Avantages :**

- ✅ Aucun fichier à copier manuellement
- ✅ Toujours la dernière version depuis GitHub
- ✅ 100% gratuit (hébergé sur GitHub Pages)
- ✅ Fonctionne avec n'importe quelle carte SD ≥16GB

**Documentation complète :** [../../docs/ONLINE_INSTALLATION.md](../../docs/ONLINE_INSTALLATION.md)

---

### 1. Installation d'un NOUVEAU Raspberry Pi (méthode manuelle)

#### Étape 0 : Copier les fichiers vers le Pi (depuis Mac)

```bash
# Copie intelligente (exclut scripts Mac, tools, .DS_Store)
./raspberry/scripts/copy-to-pi.sh raspberrypi.local
```

Ce script copie **uniquement** les fichiers nécessaires :

- `install.sh` - Script d'installation
- `server/`, `admin/`, `sync-agent/` - Code de l'application
- `config/systemd/` - Fichiers de configuration

**Fichiers exclus** (restent sur Mac) :

- `scripts/` - Scripts Mac uniquement
- `tools/` - Outils SD card
- `.DS_Store` - Fichiers macOS

#### Étape 1 : Installation système (sur le Pi)

```bash
# Se connecter au Pi
ssh pi@raspberrypi.local

# Exécuter l'installation
cd raspberry
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
# Diagnostic interactif (sur le Pi ou via SSH)
ssh pi@neopro.local '/home/pi/neopro/scripts/diagnose-pi.sh'

# Diagnostic JSON (exploitable par le dashboard / OTA)
ssh pi@neopro.local '/home/pi/neopro/scripts/diagnose-pi.sh --json'
```

**Ce que vérifie `diagnose-pi.sh` :**

- Version Node.js (v18+ requis)
- Packages apt critiques (hostapd, dnsmasq, nginx, ffmpeg, avahi-daemon)
- Packages apt recommandés (unclutter-xfixes, chromium, cec-utils, firmware-realtek)
- Services systemd (état + installation)
- Ports réseau (80, 3000, 8080)
- Fichiers et répertoires critiques + node_modules
- Configuration Nginx (syntaxe, routes, site-enabled)
- Réseau WiFi (AP mode, SSID, IP statique)
- Permissions (home, webapp owner, www-data group, club-config.json)
- Configuration GPU (gpu_mem / Pi 5 V3D Mesa)
- Espace disque
- Tests HTTP (localhost, /tv, :8080)

**Modes de sortie :**

- `--json` : sortie JSON pour exploitation automatique (exit code = nombre d'erreurs)
- `--quiet` : résumé uniquement
- _(par défaut)_ : mode interactif avec couleurs et détails

> **Note :** `deploy-remote.sh` exécute automatiquement `diagnose-pi.sh --json` après chaque déploiement. L'OTA (sync-agent) l'exécute aussi dans son rapport post-mise à jour.

---

## 📂 Liste complète des scripts

### Scripts principaux

| Script                           | Emplacement          | Exécution | Description                                         |
| -------------------------------- | -------------------- | --------- | --------------------------------------------------- |
| `install.sh`                     | `raspberry/`         | Sur Pi    | Installation système complète                       |
| `copy-to-pi.sh`                  | `raspberry/scripts/` | Sur Mac   | **Copie intelligente vers Pi** (exclut scripts Mac) |
| `setup-new-club.sh`              | `raspberry/scripts/` | Sur Mac   | Configuration nouveau club                          |
| `delete-club.sh`                 | `raspberry/scripts/` | Sur Mac   | Suppression d'un club                               |
| `backup-club.sh`                 | `raspberry/scripts/` | Sur Mac   | Sauvegarde config + vidéos                          |
| `restore-club.sh`                | `raspberry/scripts/` | Sur Mac   | Restauration d'un backup                            |
| `build-raspberry.sh`             | `raspberry/scripts/` | Sur Mac   | Build Angular uniquement                            |
| `deploy-remote.sh`               | `raspberry/scripts/` | Sur Mac   | Déploiement SSH uniquement                          |
| `generate-config-from-videos.sh` | `raspberry/scripts/` | Sur Mac   | **Génère config JSON depuis dossier vidéos**        |

### Scripts de maintenance

| Script                 | Emplacement          | Exécution | Description                                 |
| ---------------------- | -------------------- | --------- | ------------------------------------------- |
| `diagnose-pi.sh`       | `raspberry/scripts/` | Sur Pi    | Diagnostic complet (--json pour automation) |
| `fix-hostname.sh`      | `raspberry/scripts/` | Sur Pi    | Corriger le hostname                        |
| `setup-wifi-client.sh` | `raspberry/scripts/` | Sur Pi    | Configurer WiFi client (accès internet)     |
| `cleanup-pi.sh`        | `raspberry/scripts/` | Sur Mac   | **Supprime ~/raspberry après installation** |

> ℹ️ `setup-wifi-client.sh` crée désormais automatiquement le lien `/etc/wpa_supplicant/wpa_supplicant-wlan1.conf`, active `wpa_supplicant@wlan1.service` et relance `dhcpcd`. Une fois lancé, le WiFi client reste actif après chaque redémarrage.

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

- Valide les entrées (CLUB_NAME : alphanumérique, max 25 chars ; mot de passe WiFi : 8-63 chars, caractères spéciaux supportés)
- Installe Node.js 18
- Installe et configure nginx
- Installe hostapd et dnsmasq (WiFi AP)
- Copie automatiquement le build Angular (webapp/) s'il est présent
- Crée les services systemd
- Configure le réseau WiFi en point d'accès
- Protège `club-config.json` (`chmod 600` — contient le mot de passe WiFi)
- **Health check post-installation** : vérifie que les services critiques (nginx, hostapd, dnsmasq) sont actifs, que Nginx répond, et que le hotspot est en mode AP

---

### setup-remote-club.sh (N'importe où) ✅ **RECOMMANDÉ**

**Usage :**

```bash
# Télécharger le script
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
chmod +x setup-remote-club.sh

# Lancer la configuration
./setup-remote-club.sh
```

**Prérequis :**

- Le Pi doit déjà être installé avec `setup.sh` ou `install.sh`
- Connexion SSH au Pi
- Accès Internet pour télécharger depuis GitHub Releases

**Ce qu'il fait (interactif) :**

1. Collecte les informations du club (nom, localisation, sports, contact)
2. Crée la configuration JSON en mémoire
3. **Télécharge l'archive de déploiement depuis GitHub Releases** (pas de build local)
4. Upload et déploie sur le Pi via SSH
5. Configure le hotspot WiFi (SSID `NEOPRO-CLUB`)
6. Configure le sync-agent (connexion au serveur central)
7. Trace la version GitHub (`/home/pi/neopro/VERSION` + `configuration.json.version`)

**Avantages :**

- ✅ Aucune dépendance au dossier Neopro local
- ✅ Fonctionne depuis n'importe quel ordinateur
- ✅ Télécharge depuis GitHub Releases (toujours à jour)
- ✅ Rapide : 2-5 minutes (pas de build local)
- ✅ Idéal pour installation terrain

**Options :**

```bash
# Utiliser une version spécifique
./setup-remote-club.sh --release v1.0.0

# Utiliser la dernière version (défaut)
./setup-remote-club.sh
```

**📖 Guide complet :** [CLUB-SETUP-README.md](CLUB-SETUP-README.md)

---

### setup-new-club.sh (Sur Mac) 🔧 Développement

**Usage :**

```bash
./raspberry/scripts/setup-new-club.sh
```

**Prérequis :**

- **Dossier Neopro complet** sur votre machine
- Node.js, npm, Angular CLI installés
- Toutes les dépendances du projet

**Ce qu'il fait (interactif) :**

1. Demande les informations du club
2. Crée `raspberry/config/templates/CLUB-configuration.json`
3. **Build l'application Angular localement** (5-10 minutes)
4. Déploie sur le Pi
5. Configure le hotspot WiFi (SSID `NEOPRO-CLUB`)
6. Configure le sync-agent (connexion au serveur central)

**Avantages :**

- ✅ Build local (modifications custom possibles)
- ✅ Tests de développement

**Quand l'utiliser :**

- 🔧 Développement et tests
- 🔧 Modifications custom du code

---

### build-raspberry.sh (Sur Mac)

**Usage :**

```bash
npm run build:raspberry
# OU
./raspberry/scripts/build-raspberry.sh

# Injecter explicitement un tag de release
RELEASE_VERSION=v2.4.0 npm run build:raspberry
# ou
./raspberry/scripts/build-raspberry.sh --version v2.4.0

# Sauter le nettoyage xattr (plus rapide si tar n'affiche pas d'avertissements)
SKIP_XATTR_CLEANUP=true ./raspberry/scripts/build-raspberry.sh
./raspberry/scripts/build-raspberry.sh --skip-xattr
```

**Ce qu'il fait :**

- Vérifie Node.js v18+ et les prérequis
- Compile l'application Angular en mode production
- **Valide que le build Angular a réussi** (`dist/raspberry/browser/index.html` présent)
- Inclut les `node_modules` de **server**, sync-agent et admin dans l'archive (pas de `npm install` requis au déploiement)
- Vérifie l'intégrité de 19+ fichiers critiques + dépendances npm avant archivage
- Crée l'archive `raspberry/neopro-raspberry-deploy.tar.gz`
- Ajoute `deploy/VERSION` + `deploy/release.json` (version, commit, date) dans l'archive

---

### build-and-deploy.sh (Sur Mac)

**Usage :**

```bash
./raspberry/scripts/build-and-deploy.sh                     # Build + deploy vers neopro.local
./raspberry/scripts/build-and-deploy.sh neopro.home         # Cible personnalisée
./raspberry/scripts/build-and-deploy.sh --version v2.4.0    # Force la version injectée dans le build
./raspberry/scripts/build-and-deploy.sh --version v2.4.0 192.168.4.1
./raspberry/scripts/build-and-deploy.sh --skip-xattr        # Saute le nettoyage xattr (plus rapide)
```

**Ce qu'il fait :**

1. Lance `build-raspberry.sh` (en passant `RELEASE_VERSION` si fourni)
2. Exécute `deploy-remote.sh` vers l'adresse cible

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

### generate-config-from-videos.sh (Sur Mac)

**Usage :**

```bash
./raspberry/scripts/generate-config-from-videos.sh <dossier_videos> [nom_club] [fichier_sortie]
```

**Exemples :**

```bash
# Génération basique
./raspberry/scripts/generate-config-from-videos.sh ~/Downloads/videos_club MONCLUB config.json

# Avec structure 2 niveaux (catégorie/sous-catégorie)
./raspberry/scripts/generate-config-from-videos.sh ~/Videos/handball HANDBALL handball-config.json

# Avec structure 3 niveaux (ex: MATCH/SF/BUT)
./raspberry/scripts/generate-config-from-videos.sh ~/Videos/racc RACC racc-config.json
```

**Structure de dossiers supportée :**

```
videos/
├── PARTENAIRES/              → Boucle sponsors (automatique)
│   ├── BOUCLE_PARTENAIRES.mp4
│   └── NEOPRO.mp4
├── ENTREE/                   → Catégorie simple (1 niveau)
│   ├── JOUEUR_01.mp4
│   └── JOUEUR_02.mp4
├── MATCH/                    → Catégorie avec sous-catégories (2 niveaux)
│   ├── BUT/
│   │   └── JOUEUR_01.mp4
│   └── JINGLE/
│       └── MI_TEMPS.mp4
└── MATCH/                    → Catégorie avec 3 niveaux (automatique)
    ├── SF/                   → Génère "SF - BUT", "SF - JINGLE"
    │   ├── BUT/
    │   └── JINGLE/
    └── SM1/                  → Génère "SM1 - BUT", "SM1 - JINGLE"
        ├── BUT/
        └── JINGLE/
```

**Ce qu'il fait :**

1. Scanne récursivement le dossier (supporte 1, 2 ou 3 niveaux)
2. Détecte automatiquement les fichiers vidéo (.mp4, .mkv, .mov, .avi, .webm)
3. Crée des noms lisibles (JOUEUR_01.mp4 → "JOUEUR 01")
4. Demande interactivement les infos du club
5. Génère un fichier JSON prêt pour le déploiement

**Fonctionnalités :**

- Supporte les noms de dossiers avec accents et espaces
- Compatible macOS (Bash 3.2) et Linux
- Détecte automatiquement le dossier PARTENAIRES pour les sponsors
- Fusionne automatiquement les structures à 3 niveaux (SF/BUT → "SF - BUT")

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

- `CLUB_NAME` validé par regex (`^[a-zA-Z0-9_-]+$`, max 25 chars) dans `setup.sh` et `install.sh`
- Les mots de passe WiFi sont échappés pour sed (caractères spéciaux `$`, `/`, `&`, `\` supportés)
- `club-config.json` est protégé en `chmod 600` (seul l'utilisateur `pi` peut le lire)
- Les configurations avec mots de passe sont dans `.gitignore`
- Utilisez des mots de passe forts (12+ caractères)
- `setup.sh` utilise `curl -sSLf` avec `exit 1` pour les fichiers critiques (pas de `|| true` silencieux)
- Les fichiers temporaires utilisent `mktemp -d` (pas de chemin prévisible)

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
