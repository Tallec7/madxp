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
- **Organisation par temps (Télécommande)** : configuration des blocs temps (Avant-match, Match, Après-match) et association des catégories à chaque bloc
- **Gestion des catégories** : création, modification et suppression de catégories et sous-catégories
- **Affichage de la configuration télécommande** : catégories, sous-catégories et vidéos tels que définis dans `configuration.json`
- **Détection des vidéos orphelines** : vidéos présentes sur le disque mais non référencées dans la configuration
- **Ajout de vidéos orphelines** : possibilité d'ajouter une vidéo orpheline à une catégorie existante ou nouvelle
- Upload de vidéos (MP4, MKV, MOV) - Limite: 500MB par fichier
- Organisation par catégories
- Suppression de vidéos
- Les catégories/sous-catégories sont résolues automatiquement d'après `configuration.json`
- Chaque upload ou suppression met à jour automatiquement `configuration.json` pour garder la télécommande synchronisée

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
- `GET /api/videos` - Liste toutes les vidéos (disque)
- `GET /api/videos/orphans` - Liste les vidéos non référencées dans la config
- `POST /api/videos/upload` - Upload (multipart)
- `POST /api/videos/add-to-config` - Ajoute une vidéo orpheline à la configuration
  ```json
  { "videoPath": "MATCH_SF/BUT/video.mp4", "categoryId": "Match_SF", "subcategoryId": "But" }
  ```
- `DELETE /api/videos/:category/:filename` - Supprimer

#### Configuration
- `GET /api/configuration` - Configuration complète (`configuration.json`)
- `GET /api/configuration/time-categories` - Récupérer les blocs temps et catégories disponibles
- `PUT /api/configuration/time-categories` - Mettre à jour les blocs temps
  ```json
  { "timeCategories": [{ "id": "before", "name": "Avant-match", "icon": "🏁", "categoryIds": ["cat1"] }] }
  ```

#### Catégories
- `GET /api/configuration/categories` - Liste toutes les catégories
- `POST /api/configuration/categories` - Créer une catégorie
  ```json
  { "id": "match-sf", "name": "Match SF", "videos": [], "subCategories": [] }
  ```
- `PUT /api/configuration/categories/:categoryId` - Modifier une catégorie
- `DELETE /api/configuration/categories/:categoryId` - Supprimer une catégorie
- `POST /api/configuration/categories/:categoryId/subcategories` - Ajouter une sous-catégorie
  ```json
  { "id": "but", "name": "But", "videos": [] }
  ```
- `DELETE /api/configuration/categories/:categoryId/subcategories/:subCategoryId` - Supprimer une sous-catégorie

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
Par défaut : `/home/pi/neopro`.
En développement local, le serveur détecte automatiquement `public/` si seuls les médias y existent (pour que l'upload alimente `public/videos`). Vous pouvez forcer un autre chemin avec la variable d'environnement `NEOPRO_DIR`.

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
