# Streaming FFmpeg avec Score Overlay

Ce document décrit le système de streaming vidéo avec incrustation du score en temps réel via FFmpeg.

## Aperçu

Le système permet d'incruster le score directement dans le flux vidéo, rendant le score visible sur n'importe quel lecteur (VLC, OMXPlayer) et pas uniquement dans le navigateur.

### Architecture

```
┌─────────────────────┐
│  Remote Component   │
│  (Contrôle score)   │
└─────────┬───────────┘
          │ Socket.IO
          ▼
┌─────────────────────┐      ┌──────────────────────┐
│  Score Bridge       │ ──▶  │ /tmp/neopro-*.txt    │
│  (Node.js)          │      │ (fichiers score)     │
└─────────────────────┘      └──────────┬───────────┘
                                        │ reload=1
┌─────────────────────┐                 │
│  Playlist Manager   │                 │
│  (Node.js)          │                 │
└─────────┬───────────┘                 │
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────┐
│  FFmpeg Streaming                                   │
│  - Lit les vidéos du playlist                       │
│  - Applique drawtext avec les fichiers score        │
│  - Génère un stream HLS                             │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  /var/www/neopro/hls/stream.m3u8                    │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  VLC / OMXPlayer / Navigateur                       │
└─────────────────────────────────────────────────────┘
```

## Installation

### Prérequis

- Raspberry Pi avec Raspbian/Raspberry Pi OS
- Node.js 18+
- FFmpeg
- VLC (optionnel, pour le mode kiosk VLC)
- Nginx

### Installation automatique

```bash
sudo /home/pi/neopro/scripts/install-ffmpeg-streaming.sh
```

Ce script :
1. Installe les dépendances (ffmpeg, vlc, fonts-dejavu-core, nginx)
2. Crée les répertoires nécessaires
3. Installe les services systemd
4. Configure Nginx pour servir le stream HLS

### Installation manuelle

1. **Installer les dépendances système :**
   ```bash
   sudo apt-get update
   sudo apt-get install -y ffmpeg vlc fonts-dejavu-core nginx
   ```

2. **Installer les dépendances Node.js :**
   ```bash
   cd /home/pi/neopro/services
   npm install socket.io-client
   ```

3. **Créer le répertoire HLS :**
   ```bash
   sudo mkdir -p /var/www/neopro/hls
   sudo chown -R pi:pi /var/www/neopro
   ```

4. **Installer les services systemd :**
   ```bash
   sudo cp /home/pi/neopro/config/systemd/neopro-score-bridge.service /etc/systemd/system/
   sudo cp /home/pi/neopro/config/systemd/neopro-playlist-manager.service /etc/systemd/system/
   sudo cp /home/pi/neopro/config/systemd/neopro-ffmpeg-stream.service /etc/systemd/system/
   sudo cp /home/pi/neopro/config/systemd/neopro-vlc-kiosk.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

5. **Configurer Nginx :**
   ```bash
   sudo ln -sf /home/pi/neopro/config/nginx/neopro-hls.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Utilisation

### Démarrer le streaming

```bash
# Démarrer les services dans l'ordre
sudo systemctl start neopro-score-bridge
sudo systemctl start neopro-playlist-manager
sudo systemctl start neopro-ffmpeg-stream
```

### Utiliser VLC au lieu de Chromium

Pour un affichage plus léger avec VLC :

```bash
# Arrêter Chromium
sudo systemctl stop neopro-kiosk
sudo systemctl disable neopro-kiosk

# Démarrer VLC
sudo systemctl enable neopro-vlc-kiosk
sudo systemctl start neopro-vlc-kiosk
```

### Vérifier le statut

```bash
sudo systemctl status neopro-score-bridge
sudo systemctl status neopro-playlist-manager
sudo systemctl status neopro-ffmpeg-stream
sudo systemctl status neopro-vlc-kiosk
```

### Consulter les logs

```bash
# Logs en temps réel
journalctl -u neopro-score-bridge -f
journalctl -u neopro-playlist-manager -f
journalctl -u neopro-ffmpeg-stream -f

# Tous les logs du streaming
journalctl -u neopro-score-bridge -u neopro-playlist-manager -u neopro-ffmpeg-stream -f
```

## Composants

### Score Bridge (`services/score-bridge.js`)

Ce service :
- Se connecte au serveur Socket.IO local (port 3000)
- Écoute les événements `score-update` et `score-reset`
- Écrit les scores dans des fichiers texte pour FFmpeg

**Fichiers générés :**
| Fichier | Contenu |
|---------|---------|
| `/tmp/neopro-score.txt` | `2 - 1` |
| `/tmp/neopro-score-full.txt` | `CESSON 2 - 1 NANTES` |
| `/tmp/neopro-home-team.txt` | `CESSON` |
| `/tmp/neopro-home-score.txt` | `2` |
| `/tmp/neopro-away-team.txt` | `NANTES` |
| `/tmp/neopro-away-score.txt` | `1` |

### Playlist Manager (`services/playlist-manager.js`)

Ce service :
- Lit `configuration.json`
- Génère le fichier playlist FFmpeg concat
- Écoute les changements de phase (neutral, before, during, after)
- Régénère la playlist quand la phase change

**Fichier généré :**
```
# /tmp/neopro-playlist.txt
file '/home/pi/neopro/videos/sponsors/sponsor1.mp4'
file '/home/pi/neopro/videos/sponsors/sponsor2.mp4'
```

### FFmpeg Stream (`scripts/ffmpeg-stream.sh`)

Ce script :
- Lit les vidéos depuis la playlist
- Applique le filtre `drawtext` avec `reload=1`
- Génère un stream HLS dans `/var/www/neopro/hls/`

**Paramètres configurables (variables d'environnement) :**
| Variable | Défaut | Description |
|----------|--------|-------------|
| `NEOPRO_DIR` | `/home/pi/neopro` | Répertoire Neopro |
| `HLS_DIR` | `/var/www/neopro/hls` | Répertoire de sortie HLS |
| `SCORE_DIR` | `/tmp` | Répertoire des fichiers score |
| `FONT_SIZE` | `42` | Taille de police du score |
| `VIDEO_PRESET` | `ultrafast` | Preset FFmpeg (vitesse vs qualité) |

### VLC Kiosk (`scripts/vlc-kiosk.sh`)

Alternative à Chromium pour l'affichage :
- Lance VLC en mode plein écran
- Lit le stream HLS
- Plus léger que Chromium

## Accès au stream

Le stream HLS est accessible à :
```
http://neopro.local/hls/stream.m3u8
```

Compatible avec :
- VLC
- OMXPlayer
- Navigateurs web (via hls.js)
- Tout lecteur supportant HLS

## Dépannage

### Le stream ne démarre pas

1. Vérifier que le playlist existe :
   ```bash
   cat /tmp/neopro-playlist.txt
   ```

2. Vérifier les logs :
   ```bash
   journalctl -u neopro-ffmpeg-stream -n 50
   ```

3. Vérifier que les vidéos existent :
   ```bash
   ls -la /home/pi/neopro/videos/
   ```

### Le score ne s'affiche pas

1. Vérifier que score-bridge fonctionne :
   ```bash
   cat /tmp/neopro-score.txt
   ```

2. Vérifier la connexion Socket.IO :
   ```bash
   journalctl -u neopro-score-bridge -n 20
   ```

### Latence élevée

Le streaming HLS a une latence inhérente (quelques secondes). Pour la réduire :
- Diminuer `HLS_TIME` (défaut: 2 secondes)
- Diminuer `HLS_LIST_SIZE` (défaut: 5 segments)

### Performance sur Raspberry Pi

Si le Pi est lent :
- Utiliser `VIDEO_PRESET=ultrafast` (défaut)
- Réduire la résolution dans `ffmpeg-stream.sh`
- Vérifier l'utilisation CPU : `htop`
