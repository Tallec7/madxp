# Neopro Web Admin Interface

Interface d'administration web pour gérer un système Neopro sur Raspberry Pi.

## Accès

**URL :** `http://neopro.local:8080`

Accessible depuis n'importe quel appareil connecté au WiFi `NEOPRO-[CLUB]`.

## Fonctionnalités

### 📊 Dashboard
- Monitoring système en temps réel
- CPU, Mémoire, Température, Stockage
- État des services
- Uptime système
- Rafraîchissement automatique toutes les 5s

### 🎬 Vidéos
- Upload de vidéos (MP4, MKV, MOV)
- Limite: 500MB par fichier
- Organisation par catégories
- Liste complète de la bibliothèque
- Suppression de vidéos

### 📡 Réseau
- Configuration WiFi client pour SSH distant
- Affichage des interfaces réseau
- Informations IP et MAC

### 📜 Logs
- Logs application (neopro-app)
- Logs Nginx
- Logs système
- Actualisation en temps réel

### ⚙️ Système
- Redémarrage de services
- Mise à jour OTA (Over-The-Air)
- Redémarrage/Arrêt système
- Backups automatiques

## Installation

### Automatique (via install.sh)
```bash
sudo ./raspberry/install.sh CLUB_NAME PASSWORD
```

### Manuelle
```bash
# Installation
cd /home/pi/neopro/admin
npm install --production

# Lancement
node admin-server.js

# Ou via systemd
sudo systemctl start neopro-admin
```

## API REST

### Endpoints disponibles

#### Système
- `GET /api/system` - Infos système
- `GET /api/config` - Configuration club
- `GET /api/network` - Infos réseau
- `POST /api/system/reboot` - Redémarrer
- `POST /api/system/shutdown` - Éteindre

#### Vidéos
- `GET /api/videos` - Liste vidéos
- `POST /api/videos/upload` - Upload (multipart)
- `DELETE /api/videos/:category/:filename` - Supprimer

#### Logs
- `GET /api/logs/:service?lines=100` - Récupérer logs

#### Configuration
- `POST /api/wifi/client` - Config WiFi client
  ```json
  { "ssid": "WiFi-Club", "password": "pass123" }
  ```

#### Services
- `POST /api/services/:service/restart` - Redémarrer service

#### Mise à jour
- `POST /api/update` - Upload package (multipart .tar.gz)

## Configuration

### Port (défaut: 8080)
Modifier dans `/etc/systemd/system/neopro-admin.service` :
```ini
Environment=ADMIN_PORT=8888
```

### Répertoire d'installation
Par défaut : `/home/pi/neopro`

## Développement

### Lancement en mode dev
```bash
npm install
npm run dev
```

### Structure
```
admin/
├── admin-server.js      # Serveur Express
├── package.json         # Dépendances
└── public/             # Frontend
    ├── index.html      # Interface
    ├── styles.css      # Styles
    └── app.js          # JS
```

## Dépannage

### Le serveur ne démarre pas
```bash
# Vérifier le service
sudo systemctl status neopro-admin

# Voir les erreurs
sudo journalctl -u neopro-admin -n 50

# Vérifier les dépendances
cd /home/pi/neopro/admin
npm install
```

### Erreur d'upload
```bash
# Vérifier l'espace
df -h

# Permissions
sudo chown -R pi:pi /home/pi/neopro
```

### Port déjà utilisé
```bash
# Voir ce qui utilise le port 8080
sudo netstat -tlnp | grep 8080

# Changer le port dans le service
sudo systemctl edit neopro-admin
```

## Sécurité

- Accessible uniquement sur réseau local
- Pas d'authentification par défaut (réseau isolé)
- Validations des uploads (type, taille)
- Confirmations pour actions critiques
- Backups automatiques avant mise à jour

## Support

Pour toute question : support@neopro.fr

---

**Version :** 1.0.0
**Licence :** MIT
**Auteur :** Neopro / Kalon Partners
