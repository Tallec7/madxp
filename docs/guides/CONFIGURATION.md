# Guide de configuration Neopro

Ce document explique **tous les fichiers de configuration** et leur rôle.

---

## Vue d'ensemble

Il y a **2 types** de configuration :

| Type        | Fichier              | Usage                                        |
| ----------- | -------------------- | -------------------------------------------- |
| **Métier**  | `configuration.json` | Vidéos, catégories, mot de passe, infos club |
| **Système** | `.env` / `site.conf` | Connexion au serveur central, chemins, ports |

---

## 1. Configuration métier : `configuration.json`

### Où se trouve ce fichier ?

| Emplacement                                              | Usage                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `raspberry/config/templates/TEMPLATE-configuration.json` | Template vierge à copier                                     |
| `raspberry/config/templates/[CLUB]-configuration.json`   | Config spécifique d'un club (généré par `setup-new-club.sh`) |
| `raspberry/public/configuration.json`                    | Dev local uniquement                                         |
| **Sur le Pi : `/home/pi/neopro/configuration.json`**     | **Config de production du club**                             |

### Structure

```json
{
  "remote": {
    "title": "Télécommande Néopro - [CLUB]"
  },
  "auth": {
    "password": "MotDePasse12Caracteres!",
    "clubName": "[CLUB]",
    "sessionDuration": 28800000
  },
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central.onrender.com",
    "siteName": "[NOM_DU_SITE]",
    "clubName": "[NOM_COMPLET_DU_CLUB]",
    "location": {
      "city": "[VILLE]",
      "region": "[RÉGION]",
      "country": "France"
    },
    "sports": ["handball"],
    "contact": {
      "email": "[EMAIL]",
      "phone": "[TELEPHONE]"
    }
  },
  "version": "1.0",
  "sponsors": [
    {
      "name": "Nom du sponsor",
      "path": "videos/SPONSORS/video.mp4",
      "type": "video/mp4"
    }
  ],
  "categories": [
    {
      "id": "category-id",
      "name": "Nom de la catégorie",
      "videos": [
        {
          "name": "Nom vidéo",
          "path": "videos/CATEGORIE/video.mp4",
          "type": "video/mp4"
        }
      ]
    }
  ],
  "timeCategories": [
    {
      "id": "before",
      "name": "Avant-match",
      "icon": "🏁",
      "color": "from-blue-500 to-blue-600",
      "description": "Échauffement & présentation",
      "categoryIds": ["cat-ambiance"],
      "loopVideos": [
        {
          "name": "Sponsor Welcome",
          "path": "videos/BOUCLE_AVANT/welcome.mp4",
          "type": "video/mp4"
        }
      ]
    },
    {
      "id": "during",
      "name": "Match",
      "icon": "▶️",
      "color": "from-green-500 to-green-600",
      "description": "Live & animations",
      "categoryIds": ["cat-animations"],
      "loopVideos": []
    },
    {
      "id": "after",
      "name": "Après-match",
      "icon": "🏆",
      "color": "from-purple-500 to-purple-600",
      "description": "Résultats & remerciements",
      "categoryIds": ["cat-resultats"],
      "loopVideos": []
    }
  ]
}
```

### Champs importants

| Champ                         | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `auth.password`               | Mot de passe pour accéder à /tv et /remote (min 12 caractères) |
| `auth.clubName`               | Nom court du club (affiché sur la page login)                  |
| `auth.sessionDuration`        | Durée de session en ms (28800000 = 8h)                         |
| `sync.enabled`                | Active/désactive la synchronisation avec le serveur central    |
| `sync.serverUrl`              | URL du serveur central                                         |
| `sponsors`                    | Vidéos de la boucle par défaut (écran d'attente)               |
| `categories`                  | Catégories de vidéos accessibles via la télécommande           |
| `timeCategories`              | Organisation par temps de match (avant/pendant/après)          |
| `timeCategories[].loopVideos` | Boucle vidéo spécifique à chaque phase (optionnel)             |

---

## 2. Configuration système : `.env` / `site.conf`

### Fichiers `.env`

| Fichier                                    | Usage                                    |
| ------------------------------------------ | ---------------------------------------- |
| `.env.example` (racine)                    | Template global pour le développement    |
| `raspberry/sync-agent/config/.env.example` | Template pour le sync-agent              |
| `central-server/.env.example`              | Template pour le serveur central (cloud) |

### Sur le Pi : `/etc/neopro/site.conf`

Ce fichier est créé lors de l'enregistrement du site auprès du serveur central.

```bash
# Identifiants du site (générés automatiquement)
SITE_ID=uuid-du-site
SITE_API_KEY=clé-api-secrète

# Serveur central
CENTRAL_SERVER_URL=https://neopro-central.onrender.com

# Infos du site
SITE_NAME="Nom du site"
CLUB_NAME="Nom du club"
LOCATION_CITY="Ville"
LOCATION_REGION="Région"
LOCATION_COUNTRY="France"
SPORTS="handball"

# Chemins locaux
LOCAL_VIDEOS_PATH=/home/pi/neopro/videos
LOCAL_CONFIG_PATH=/home/pi/neopro
LOCAL_BACKUP_PATH=/home/pi/neopro/backups
LOCAL_LOG_PATH=/home/pi/neopro/logs

# Intervalles
HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=300000
```

---

## 3. Ce qui se passe lors d'une mise à jour

Quand vous exécutez `npm run deploy:raspberry` :

### ✅ Préservé (non écrasé)

| Fichier/Dossier                      | Raison                   |
| ------------------------------------ | ------------------------ |
| `/home/pi/neopro/configuration.json` | Config métier du club    |
| `/home/pi/neopro/videos/`            | Vidéos du club           |
| `/home/pi/neopro/backups/`           | Sauvegardes automatiques |
| `/home/pi/neopro/logs/`              | Historique des logs      |
| `/etc/neopro/site.conf`              | Identifiants du site     |

### ❌ Écrasé (mis à jour)

| Fichier/Dossier               | Raison                              |
| ----------------------------- | ----------------------------------- |
| `/home/pi/neopro/webapp/`     | Application Angular (nouveau build) |
| `/home/pi/neopro/server/`     | Serveur Socket.IO                   |
| `/home/pi/neopro/admin/`      | Interface admin                     |
| `/home/pi/neopro/sync-agent/` | Agent de synchronisation            |

---

## 4. Pousser une configuration depuis le central

Il y a deux usages distincts :

- **Contenu club** : modifié localement sur le Pi. On le préserve en mode `merge`.
- **Contenu imposé NEOPRO** : doit s'imposer même si le club avait des données différentes. On utilise le mode `replace`.

Lorsqu'on clique sur **Déployer** dans le dashboard central, la commande `update_config` est envoyée avec `mode: 'replace'` pour écraser le `configuration.json` du boîtier par la version centrale (comportement nécessaire pour synchroniser une config “référence” NEOPRO). Si vous souhaitez au contraire fusionner en préservant le contenu club, envoyez `update_config` avec `mode: 'merge'` (ou sans `mode`, le merge intelligent côté sync-agent reste actif).

### Backup automatique

Avant chaque déploiement, un backup est créé :

```
/home/pi/neopro/backups/backup-YYYYMMDD-HHMMSS.tar.gz
```

Les 5 derniers backups sont conservés.

---

## 4. Workflow : configurer un nouveau club

### Méthode automatique (recommandée)

```bash
./raspberry/scripts/setup-new-club.sh
```

Le script :

1. Demande les infos du club
2. Crée `raspberry/config/templates/[CLUB]-configuration.json`
3. Build l'application
4. Déploie sur le Pi
5. Copie `configuration.json` sur le Pi
6. Configure le sync-agent

### Méthode manuelle

```bash
# 1. Copier le template
cp raspberry/config/templates/TEMPLATE-configuration.json \
   raspberry/config/templates/MONCLUB-configuration.json

# 2. Éditer avec vos valeurs
nano raspberry/config/templates/MONCLUB-configuration.json

# 3. Build et déployer
npm run deploy:raspberry

# 4. Copier la config sur le Pi (si première fois)
scp raspberry/config/templates/MONCLUB-configuration.json \
    pi@neopro.local:/home/pi/neopro/configuration.json
```

---

## 5. Workflow : modifier la configuration d'un club existant

### Option A : Via l'interface admin (recommandé)

1. Aller sur `http://neopro.local:8080`
2. Modifier la configuration dans l'éditeur
3. Cliquer sur "Sauvegarder et Redémarrer"

### Option B : Via SSH

```bash
ssh pi@neopro.local
nano /home/pi/neopro/configuration.json
sudo systemctl restart neopro-app
```

### Option C : Via script (si changement du code aussi)

```bash
# Modifier localement
nano raspberry/config/templates/MONCLUB-configuration.json

# Redéployer (ne touchera PAS au configuration.json sur le Pi)
npm run deploy:raspberry

# Si vous voulez aussi mettre à jour la config :
scp raspberry/config/templates/MONCLUB-configuration.json \
    pi@neopro.local:/home/pi/neopro/configuration.json
ssh pi@neopro.local 'sudo systemctl restart neopro-app'
```

---

## 6. Fichiers de démo

Pour le développement et les tests, des configs de démo existent :

| Fichier                                               | Usage                           |
| ----------------------------------------------------- | ------------------------------- |
| `raspberry/frontend/assets/demo-configs/default.json` | Config démo par défaut          |
| `raspberry/frontend/assets/demo-configs/clubs.json`   | Liste des clubs démo            |
| `raspberry/frontend/assets/demo-configs/[club].json`  | Config spécifique par club démo |

Ces fichiers sont utilisés uniquement en mode démo (`npm start`).

---

## 7. Résumé des chemins

### En développement (sur votre Mac/PC)

```
neopro/
├── .env                                    # Variables d'environnement locales
├── raspberry/
│   ├── public/configuration.json           # Config de dev local
│   └── config/templates/
│       ├── TEMPLATE-configuration.json     # Template vierge
│       └── [CLUB]-configuration.json       # Configs générées par club
```

### En production (sur le Raspberry Pi)

```
/home/pi/neopro/
├── configuration.json          # Config métier du club ⭐
├── webapp/                     # Application Angular
├── server/                     # Serveur Socket.IO
├── admin/                      # Interface admin
├── sync-agent/                 # Agent de sync
├── videos/                     # Vidéos du club
├── backups/                    # Sauvegardes
└── logs/                       # Logs

/etc/neopro/
└── site.conf                   # Identifiants du site (sync-agent)
```

---

## 8. FAQ

### Q: Pourquoi mon `configuration.json` n'est pas écrasé lors d'un déploiement ?

Le script `build-raspberry.sh` **n'inclut pas** `configuration.json` dans l'archive de déploiement. C'est volontaire pour préserver la config du club.

### Q: Comment réinitialiser complètement un Pi ?

```bash
# Réinstaller depuis zéro
ssh pi@neopro.local
cd ~/raspberry
sudo ./install.sh CLUB MotDePasseWiFi
```

### Q: Où est stocké le mot de passe ?

Dans `/home/pi/neopro/configuration.json` → champ `auth.password`

### Q: Comment voir la config actuelle sur le Pi ?

```bash
ssh pi@neopro.local 'cat /home/pi/neopro/configuration.json'
```

### Q: Comment savoir si le sync-agent est configuré ?

```bash
ssh pi@neopro.local 'cat /etc/neopro/site.conf'
```

---

---

## 9. Configuration Email (SMTP)

### Variables d'environnement

Pour activer les notifications email (alertes, déploiements, rapports), configurez les variables SMTP dans le `.env` du central-server :

```bash
# Configuration SMTP (Gmail recommandé)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App Password Google
SMTP_FROM=NeoPro <noreply@neopro.fr>
SMTP_SECURE=false
```

### Configuration Gmail

1. **Activer 2FA** sur votre compte Google
2. **Créer un App Password** : https://myaccount.google.com/apppasswords
3. **Utiliser ce mot de passe** dans `SMTP_PASSWORD`

### Types de notifications

| Type | Déclencheur | Contenu |
|------|-------------|---------|
| Alerte | Site hors ligne, CPU > 90% | Détails du problème |
| Déploiement | Fin de déploiement | Résumé succès/échec |
| Rapport | Manuel ou planifié | PDF analytics |

---

## 10. Configuration Sécurité

### CORS (Production)

```bash
# OBLIGATOIRE en production
ALLOWED_ORIGINS=https://dashboard.neopro.fr,https://control.neopro.fr
```

Si non configuré en production, toutes les requêtes cross-origin seront **rejetées** (fail-closed).

### TLS/SSL

Les connexions à la base de données utilisent SSL par défaut. Ne **jamais** ajouter :
```bash
# ❌ INTERDIT - Vulnérabilité de sécurité
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Authentification Admin Raspberry

Au premier démarrage du panneau admin (port 8080), vous devrez configurer un mot de passe. Ce mot de passe est stocké dans `/home/pi/neopro/admin/auth-config.json`.

---

**Dernière mise à jour :** 25 décembre 2025
