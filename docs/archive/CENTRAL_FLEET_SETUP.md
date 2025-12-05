# Configuration d'un boîtier pour le serveur central de gestion de flotte

## 🎯 Objectif

Connecter chaque nouveau boîtier Raspberry Pi au **serveur central NEOPRO** pour permettre :
- 📊 Monitoring en temps réel
- 🚀 Déploiement de vidéos à distance
- 🔄 Mises à jour logicielles OTA (Over-The-Air)
- 📈 Collecte de métriques
- 🎛️ Gestion centralisée depuis le dashboard

## 🏗️ Architecture

```
┌──────────────────────────────────────┐
│   SERVEUR CENTRAL NEOPRO             │
│   https://neopro-central.com         │
│   • Dashboard web                    │
│   • API REST                         │
│   • WebSocket serveur                │
└─────────────┬────────────────────────┘
              │ Internet
     ┌────────┴────────┬──────────┐
     │                 │          │
┌────▼────┐      ┌────▼────┐  ┌──▼──────┐
│ CESSON  │      │ RENNES  │  │ NANTES  │
│ Pi + Agent│    │ Pi + Agent││ Pi + Agent│
└─────────┘      └─────────┘  └─────────┘
```

## 📋 Prérequis

### Sur le serveur central
- ✅ Serveur central NEOPRO déployé (Render.com)
- ✅ Compte admin créé
- ✅ URL du serveur : `https://neopro-central-server.onrender.com`

### Sur le Raspberry Pi
- ✅ Installation de base complète (`install.sh`)
- ✅ Application déployée
- ✅ Connexion Internet (via WiFi ou Ethernet)

## 🚀 Configuration complète d'un nouveau club

### Étape 1 : Créer la configuration du club (avec sync)

Créez un fichier de configuration **complet** incluant les informations pour le serveur central :

```bash
# Copier le template
cp raspberry/configs/TEMPLATE-configuration.json raspberry/configs/NOUVEAU_CLUB-configuration.json

# Éditer le fichier
nano raspberry/configs/NOUVEAU_CLUB-configuration.json
```

**Exemple complet pour CESSON :**

```json
{
    "remote": {
        "title": "Télécommande Néopro - CESSON"
    },
    "auth": {
        "password": "CessonHandball2025!",
        "clubName": "CESSON",
        "sessionDuration": 28800000
    },
    "sync": {
        "enabled": true,
        "serverUrl": "https://neopro-central-server.onrender.com",
        "siteName": "Complexe Sportif CESSON",
        "clubName": "CESSON Handball",
        "location": {
            "city": "Cesson-Sévigné",
            "region": "Bretagne",
            "country": "France"
        },
        "sports": ["handball"],
        "contact": {
            "email": "contact@cesson-handball.fr",
            "phone": "+33 2 99 XX XX XX"
        }
    },
    "version": "1.0",
    "sponsors": [...],
    "categories": [...]
}
```

### Étape 2 : Mettre à jour l'interface TypeScript

Ajoutez le support de la section `sync` dans l'interface :

**Fichier : `src/app/interfaces/configuration.interface.ts`**

```typescript
export interface Configuration {
    remote: {
        title: string;
    };
    auth?: {
        password?: string;
        clubName?: string;
        sessionDuration?: number;
    };
    sync?: {
        enabled?: boolean;
        serverUrl?: string;
        siteName?: string;
        clubName?: string;
        location?: {
            city?: string;
            region?: string;
            country?: string;
        };
        sports?: string[];
        contact?: {
            email?: string;
            phone?: string;
        };
    };
    version: string;
    categories: Category[];
    sponsors: Sponsor[];
}
```

### Étape 3 : Déployer la configuration sur le Pi

```bash
# 1. Copier la config dans public/
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# 2. Build et déploiement
npm run build:raspberry
npm run deploy:raspberry neopro.local

# 3. La configuration sera copiée sur le Pi dans :
# /home/pi/neopro/webapp/configuration.json
```

### Étape 4 : Installer le sync-agent sur le Pi

```bash
# 1. Se connecter au Pi
ssh pi@neopro.local

# 2. Créer le répertoire sync-agent
sudo mkdir -p /home/pi/neopro/sync-agent
cd /home/pi/neopro/sync-agent

# 3. Copier les fichiers de sync-agent depuis votre Mac
exit  # Quitter SSH

# Depuis votre Mac
scp -r raspberry/sync-agent/* pi@neopro.local:/tmp/sync-agent/

# Retour sur le Pi
ssh pi@neopro.local
sudo cp -r /tmp/sync-agent/* /home/pi/neopro/sync-agent/
cd /home/pi/neopro/sync-agent

# 4. Installer les dépendances
npm install --production
```

### Étape 5 : Enregistrer le site sur le serveur central

```bash
# Sur le Pi
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js
```

**Le script va demander :**

```
🔐 Informations de connexion au serveur central
─────────────────────────────────────────────────

URL du serveur central : https://neopro-central-server.onrender.com
Email admin NEOPRO : admin@neopro.fr
Mot de passe admin : ****

📍 Informations du site
─────────────────────────

Nom du site : Complexe Sportif CESSON
Nom du club : CESSON Handball
Ville : Cesson-Sévigné
Région : Bretagne
Pays : France
Sports (séparés par des virgules) : handball

📧 Contact
─────────────

Email : contact@cesson-handball.fr
Téléphone (optionnel) : +33 2 99 XX XX XX

✓ Site enregistré avec succès !
✓ Site ID : abc123-def456-ghi789
✓ API Key : key_xxxxxxxxxxxxxxxx
✓ Configuration sauvegardée dans /etc/neopro/site.conf
```

### Étape 6 : Installer le service systemd

```bash
# Toujours sur le Pi
cd /home/pi/neopro/sync-agent
sudo npm run install-service

# Vérifier que le service démarre
sudo systemctl status neopro-sync
```

**Résultat attendu :**
```
● neopro-sync.service - NEOPRO Sync Agent
   Loaded: loaded (/etc/systemd/system/neopro-sync.service; enabled)
   Active: active (running) since ...
```

### Étape 7 : Vérifier la connexion au serveur central

```bash
# Voir les logs du sync-agent
sudo journalctl -u neopro-sync -f
```

**Logs attendus :**
```
[INFO] Agent démarré
[INFO] Connexion au serveur central...
[INFO] Connecté au serveur central
[INFO] Authentification réussie
[INFO] Heartbeat envoyé (CPU: 15%, RAM: 42%, Temp: 45°C)
```

## 📊 Vérification sur le dashboard central

1. Se connecter au dashboard : `https://neopro-central.onrender.com`
2. Aller dans **Sites** → **Liste des sites**
3. Vérifier que le nouveau site apparaît :
   - ✅ Nom : Complexe Sportif CESSON
   - ✅ Club : CESSON Handball
   - ✅ Statut : 🟢 En ligne
   - ✅ Dernière connexion : Il y a quelques secondes

## 🔧 Configuration avancée

### Fichier de configuration sync : `/etc/neopro/site.conf`

```ini
# Serveur central
CENTRAL_SERVER_URL=https://neopro-central-server.onrender.com
CENTRAL_SERVER_ENABLED=true

# Identifiants (générés automatiquement)
SITE_ID=abc123-def456-ghi789
SITE_API_KEY=key_xxxxxxxxxxxxxxxx

# Informations du site
SITE_NAME=Complexe Sportif CESSON
CLUB_NAME=CESSON Handball
LOCATION_CITY=Cesson-Sévigné
LOCATION_REGION=Bretagne
LOCATION_COUNTRY=France
SPORTS=handball

# Chemins
NEOPRO_ROOT=/home/pi/neopro
VIDEOS_PATH=/home/pi/neopro/videos
CONFIG_PATH=/home/pi/neopro/webapp/configuration.json
BACKUP_PATH=/home/pi/neopro/backups

# Monitoring
HEARTBEAT_INTERVAL=30000      # Heartbeat toutes les 30s
METRICS_INTERVAL=300000       # Métriques toutes les 5 min

# Logs
LOG_LEVEL=info
LOG_PATH=/home/pi/neopro/logs/sync-agent.log

# Mises à jour automatiques
AUTO_UPDATE_ENABLED=true      # Activer les mises à jour auto
AUTO_UPDATE_HOUR=3            # Mise à jour à 3h du matin

# Sécurité
MAX_DOWNLOAD_SIZE=1073741824  # 1 GB max
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs
```

### Modifier la configuration

```bash
# Éditer
sudo nano /etc/neopro/site.conf

# Redémarrer le service
sudo systemctl restart neopro-sync
```

## 🎛️ Fonctionnalités disponibles depuis le dashboard central

Une fois connecté, vous pouvez :

### 📊 Monitoring
- Voir le statut en temps réel (CPU, RAM, Température, Disque)
- Voir la liste des vidéos présentes
- Voir les logs à distance

### 🚀 Déploiement
- Déployer une nouvelle vidéo sur un ou plusieurs sites
- Supprimer une vidéo
- Mettre à jour la configuration

### 🔄 Maintenance
- Redémarrer le Pi à distance
- Redémarrer un service spécifique
- Mettre à jour le logiciel (OTA)
- Voir les backups disponibles

### 📈 Statistiques
- Historique de disponibilité
- Utilisation des ressources
- Nombre de vidéos lues
- Alertes et notifications

## 🔒 Sécurité

### API Key unique par site

Chaque site a une **API Key unique** générée lors de l'enregistrement :
- ✅ Stockée dans `/etc/neopro/site.conf`
- ✅ Jamais exposée dans les logs
- ✅ Utilisée pour toutes les communications avec le serveur central

### Communications sécurisées

- ✅ WebSocket over HTTPS (wss://)
- ✅ API REST via HTTPS
- ✅ Authentification JWT

### Commandes autorisées

La liste des commandes autorisées est configurable :

```ini
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs
```

## 🐛 Dépannage

### Le site n'apparaît pas dans le dashboard

1. **Vérifier le service**
   ```bash
   sudo systemctl status neopro-sync
   ```

2. **Voir les logs**
   ```bash
   sudo journalctl -u neopro-sync -n 50
   ```

3. **Vérifier la configuration**
   ```bash
   cat /etc/neopro/site.conf
   ```

4. **Tester la connexion Internet**
   ```bash
   ping neopro-central-server.onrender.com
   ```

### Erreur d'authentification

```bash
# Réenregistrer le site
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js

# Redémarrer le service
sudo systemctl restart neopro-sync
```

### Le heartbeat ne remonte pas

```bash
# Vérifier l'intervalle de heartbeat
cat /etc/neopro/site.conf | grep HEARTBEAT

# Vérifier les logs
sudo tail -f /home/pi/neopro/logs/sync-agent.log
```

## 📋 Checklist complète d'un nouveau site

- [ ] Configuration créée avec section `sync`
- [ ] Configuration déployée sur le Pi (`configuration.json`)
- [ ] Sync-agent installé sur le Pi
- [ ] Dépendances npm installées
- [ ] Site enregistré sur le serveur central
- [ ] API Key générée et sauvegardée
- [ ] Service systemd installé et activé
- [ ] Service démarre correctement
- [ ] Connexion au serveur central établie
- [ ] Heartbeat visible dans les logs
- [ ] Site visible dans le dashboard central
- [ ] Statut "En ligne" affiché
- [ ] Métriques remontées correctement

## 📚 Exemples de configurations complètes

### CESSON

**Fichier : `raspberry/configs/CESSON-configuration.json`**

```json
{
    "remote": {
        "title": "Télécommande Néopro - CESSON"
    },
    "auth": {
        "password": "CessonHandball2025!",
        "clubName": "CESSON",
        "sessionDuration": 28800000
    },
    "sync": {
        "enabled": true,
        "serverUrl": "https://neopro-central-server.onrender.com",
        "siteName": "Complexe Sportif CESSON",
        "clubName": "CESSON Handball",
        "location": {
            "city": "Cesson-Sévigné",
            "region": "Bretagne",
            "country": "France"
        },
        "sports": ["handball"]
    },
    "version": "1.0",
    ...
}
```

### RENNES

**Fichier : `raspberry/configs/RENNES-configuration.json`**

```json
{
    "remote": {
        "title": "Télécommande Néopro - RENNES"
    },
    "auth": {
        "password": "RennesHBC#Secure2025",
        "clubName": "RENNES",
        "sessionDuration": 28800000
    },
    "sync": {
        "enabled": true,
        "serverUrl": "https://neopro-central-server.onrender.com",
        "siteName": "Gymnase Gayeulles - RENNES",
        "clubName": "Rennes Handball Club",
        "location": {
            "city": "Rennes",
            "region": "Bretagne",
            "country": "France"
        },
        "sports": ["handball"]
    },
    "version": "1.0",
    ...
}
```

## 📞 Support

En cas de problème avec la configuration du système centralisé :

1. Consulter [sync-agent/README.md](sync-agent/README.md)
2. Consulter le [ADMIN_GUIDE.md](../ADMIN_GUIDE.md) (dashboard central)
3. Vérifier les logs : `sudo journalctl -u neopro-sync -f`
4. Contacter le support NEOPRO

## 🔄 Mise à jour de la configuration

Pour modifier la configuration d'un site existant :

```bash
# Méthode 1 : Via le dashboard central
# → Sites → Sélectionner le site → Configuration → Modifier

# Méthode 2 : Directement sur le Pi
ssh pi@neopro.local
sudo nano /etc/neopro/site.conf
sudo systemctl restart neopro-sync
```
