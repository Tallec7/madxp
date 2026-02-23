---
paths:
  - "raspberry/**"
---

# Raspberry Pi Architecture

## Chemins sur le Pi

| Chemin | Contenu |
|--------|---------|
| `/home/pi/neopro/videos/` | Vidéos (mp4, mkv, mov) par catégorie |
| `/home/pi/neopro/webapp/` | Application Angular (frontend TV/Remote) |
| `/home/pi/neopro/webapp/assets/watermarks/` | Images watermark |
| `/home/pi/neopro/webapp/configuration.json` | Configuration du site |
| `/home/pi/neopro/sync-agent/` | Agent de synchronisation cloud |
| `/home/pi/neopro/server/` | Serveur Socket.IO local |
| `/home/pi/neopro/scripts/` | Scripts diagnostic et setup |

**⚠️** Vidéos dans `/home/pi/neopro/videos/`, PAS dans `webapp/videos/`
**⚠️** Assets (watermarks) dans `webapp/assets/` car nginx sert depuis `webapp/`

## Services Angular Raspberry Pi

| Service | Fichier | Rôle |
|---------|---------|------|
| DoubleBuffer | double-buffer-video.service.ts | Transitions vidéo sans flash |
| ErrorRecovery | video-error-recovery.service.ts | Récupération crashs GPU |
| Watermark | watermark.service.ts | Affichage et scheduling watermark |

## Modules Sync-Agent

| Module | Fichier | Rôle |
|--------|---------|------|
| update-config | update-config.js | Config avec merge intelligent |
| diagnostics | diagnostics.js | Diagnostics système |
| hotspot | hotspot.js | Gestion hotspot WiFi |
| network-diag | network-diagnostics.js | Diagnostics réseau |
| debug-bundle | debug-bundle.js | Export debug pour support (16 sections, testé) |
| analytics-buf | analytics-buffer.js | Buffer analytics |

## Config Merge Intelligent

Mode `merge` (défaut) : fusionne sponsors et catégories, préserve les paramètres locaux.
Mode `replace` : remplace le contenu, préserve les paramètres locaux.

**Paramètres locaux protégés** (jamais écrasés) : `settings`, `siteId`, `siteName`, `clubName`, `apiKey`, `hotspot`, `localNetwork`

## Boucles Vidéo par Phase

| Phase | ID | Déclenchement |
|-------|----|---------------|
| Boucle par défaut | `neutral` | Par défaut |
| Avant-match | `before` | Télécommande |
| Pendant le match | `during` | Télécommande |
| Après-match | `after` | Télécommande |

Fallback : si phase sans `loopVideos` → utilise `sponsors[]`.

## Sync-Agent Guardian

Script bash (~200 lignes) indépendant qui surveille le sync-agent :
- Vérifie /30s si le sync-agent tourne
- 3 crashs/5min → restore depuis version "golden"
- Détecte fichiers corrompus (HTML au lieu de JS)

Fichier : `raspberry/scripts/sync-agent-guardian.sh`

## Kiosk Watchdog

- Pi 4 : flags GPU standard (`--ignore-gpu-blocklist --enable-gpu-rasterization`)
- Pi 5 : **PAS de flags GPU custom** — utiliser le driver V3D natif (Mesa)
- Le script détecte automatiquement le modèle de Pi

Fichier : `raspberry/scripts/kiosk-watchdog.sh`
