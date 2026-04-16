---
paths:
  - 'raspberry/**'
---

# Raspberry Pi Architecture

## Chemins sur le Pi

| Chemin                                      | Contenu                                  |
| ------------------------------------------- | ---------------------------------------- |
| `/home/pi/neopro/videos/`                   | Vidéos (mp4, mkv, mov) par catégorie     |
| `/home/pi/neopro/webapp/`                   | Application Angular (frontend TV/Remote) |
| `/home/pi/neopro/webapp/assets/watermarks/` | Images watermark                         |
| `/home/pi/neopro/webapp/configuration.json` | Configuration du site                    |
| `/home/pi/neopro/sync-agent/`               | Agent de synchronisation cloud           |
| `/home/pi/neopro/server/`                   | Serveur Socket.IO local                  |
| `/home/pi/neopro/scripts/`                  | Scripts diagnostic et setup              |

**⚠️** Vidéos dans `/home/pi/neopro/videos/`, PAS dans `webapp/videos/`
**⚠️** Assets (watermarks) dans `webapp/assets/` car nginx sert depuis `webapp/`

## Services Angular Raspberry Pi

| Service       | Fichier                                   | Rôle                                                                                                               |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| DoubleBuffer  | double-buffer-video.service.ts            | 4 players HTML5, freeze-frame canvas, overlay noir, transitions (ADR-042)                                          |
| VideoPlayback | video-playback.service.ts                 | Orchestration boucle, playlist pondérée Bresenham, prefetch, métriques (ADR-042)                                   |
| ErrorRecovery | video-error-recovery.service.ts           | Watchdog 10s, error handling, memory cleanup GPU (ADR-042)                                                         |
| Watermark     | watermark.service.ts                      | Affichage et scheduling watermark                                                                                  |
| RemoteScore   | components/remote/remote-score.service.ts | Score state + broadcast (localBroadcast + socketService) — extrait de RemoteComponent (ADR-051 Phase 4)            |
| RemoteTimer   | components/remote/remote-timer.service.ts | Timer state + interval + broadcast (localBroadcast + socketService) — extrait de RemoteComponent (ADR-051 Phase 4) |

## RemoteComponent — Architecture (ADR-051 Phase 4 partielle)

`RemoteComponent` est un orchestrateur : il ne contient plus la logique score/timer.

| Responsabilité     | Fichier                   | Notes                                                              |
| ------------------ | ------------------------- | ------------------------------------------------------------------ |
| Score state        | `remote-score.service.ts` | `providers: [RemoteScoreService]` dans le composant — scoped       |
| Timer state        | `remote-timer.service.ts` | `providers: [RemoteTimerService]` dans le composant — scoped       |
| Options locales    | `LocalOptionsService`     | Service global existant                                            |
| Orchestration/vues | `remote.component.ts`     | 942 lignes — nouvelle extraction prévue (options/logos/thumbnails) |

**NE PAS** remettre la logique score ou timer dans `RemoteComponent` — passer par `scoreService` et `timerService`.

## Modules Sync-Agent

| Module            | Fichier                       | Rôle                                                    |
| ----------------- | ----------------------------- | ------------------------------------------------------- |
| update-config     | update-config.js              | Config avec merge intelligent                           |
| diagnostics       | diagnostics.js                | Diagnostics système                                     |
| hotspot           | hotspot.js                    | Gestion hotspot WiFi                                    |
| network-diag      | network-diagnostics.js        | Diagnostics réseau                                      |
| debug-bundle      | debug-bundle.js               | Export debug pour support (16 sections, testé)          |
| analytics-buf     | analytics-buffer.js           | Buffer analytics                                        |
| heartbeat         | services/heartbeat.js         | Heartbeat périodique + health check connexion (ADR-044) |
| analytics-sync    | services/analytics-sync.js    | Envoi périodique analytics HTTP (ADR-044)               |
| command-dispatch  | services/command-dispatch.js  | Dispatch commandes + queue offline (ADR-044)            |
| hotspot-watchdog  | services/hotspot-watchdog.js  | Health check + recovery hotspot (ADR-044)               |
| internet-watchdog | services/internet-watchdog.js | Connectivité internet + recovery (ADR-044)              |
| config-rollback   | services/config-rollback.js   | Rollback point management réseau (ADR-044)              |
| hw-metrics        | metrics/hardware-metrics.js   | CPU, RAM, temp, disk, GPU, fan, WiFi (ADR-044)          |
| display-metrics   | metrics/display-metrics.js    | EDID, display info, CEC (ADR-044)                       |
| service-metrics   | metrics/service-metrics.js    | Systemd, kiosk, health, orphans (ADR-044)               |
| ota-download      | commands/ota-download.js      | Download + checksum + stall detection (ADR-044)         |
| ota-install       | commands/ota-install.js       | Extract + install + systemd + sudoers (ADR-044)         |

## Config Merge Intelligent

Mode `merge` (défaut) : fusionne sponsors et catégories, préserve les paramètres locaux.
Mode `replace` : remplace le contenu, préserve les paramètres locaux.

**Paramètres locaux protégés** (jamais écrasés) : `settings`, `siteId`, `siteName`, `clubName`, `apiKey`, `hotspot`, `localNetwork`

## Boucles Vidéo par Phase

| Phase             | ID        | Déclenchement |
| ----------------- | --------- | ------------- |
| Boucle par défaut | `neutral` | Par défaut    |
| Avant-match       | `before`  | Télécommande  |
| Pendant le match  | `during`  | Télécommande  |
| Après-match       | `after`   | Télécommande  |

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

## NE JAMAIS FAIRE (smoke test enforced)

### Admin Server (:8080) & Socket.IO proxy

- Charger `socket.io.js` via une URL cross-origin (`window.location.hostname + ':3000'`) — violation CSP garantie sur `neopro.local` / IP LAN. Utiliser le chemin relatif `/socket.io/socket.io.js` (proxyfié par admin-server).
- Connecter le client Socket.IO avec une URL absolue (`io(protocol + host + ':3000', ...)`) — même raison. Utiliser `io({...})` sans argument URL (same-origin automatique).
- Monter `createSocketHttpProxy()` APRÈS `express.json()` / `express.urlencoded()` (les body parsers consomment la requête avant le proxy → POST polling Socket.IO cassés).
- Remplacer `http.createServer(app)` par `app.listen(...)` dans `admin-server.js` (perd l'accès au handler `upgrade` → WebSocket Socket.IO ne marche plus).
- Élargir la CSP à `script-src 'self' http://*:3000` — le proxy supprime le besoin de cross-origin, garder CSP verrouillée à `'self'`.

### Systemd & Services

- Ajouter `NoNewPrivileges=true` dans les fichiers `.service` systemd (bloque sudo, deadlock OTA)
- Ajouter `ExecStop=pkill -9` dans `neopro-kiosk.service` (bypasse le trap handler du watchdog, corrompt l'état GPU V3D sur Pi 5)
- Utiliser `systemctl is-enabled` seul pour détecter les services systemd à nettoyer (toujours ajouter `|| systemctl is-active` comme fallback)

### Kiosk Watchdog & Chromium

- Dupliquer `--disable-features` dans kiosk-watchdog.sh (Chromium n'accepte qu'un seul flag, le dernier écrase)
- Dupliquer `--enable-features` dans kiosk-watchdog.sh (même règle — combiner dans `$enable_features`)
- Utiliser `--kiosk` pour le Chromium secondaire (utiliser `--app=URL` + xprop/xdotool)
- Utiliser `xdotool key F11` pour le plein écran en dual-display (utiliser `xprop _MOTIF_WM_HINTS` + `xdotool windowsize`)
- Utiliser `xdotool windowsize` pour le retour dual→single display (Chromium ne re-render pas — relancer Chromium)
- Faire `xdotool windowsize` sans `xprop _MOTIF_WM_HINTS` + `xdotool windowactivate` (WM restack lxpanel au-dessus)
- Lancer `xrandr --output $X --off` sur un port HDMI physiquement déconnecté (race DRM kernel)
- Hardcoder `1920` ou `1080` dans kiosk-watchdog.sh (utiliser `$DEFAULT_SCREEN_WIDTH` / `$DEFAULT_SCREEN_HEIGHT`)
- Dériver `SECONDARY_X_OFFSET` d'une valeur hardcodée (doit être `$PRIMARY_SCREEN_WIDTH` réel)
- Utiliser `neopro.local` dans `CHROMIUM_URL` / `CHROMIUM_SECONDARY_URL` (mDNS résout vers un Pi aléatoire sur LAN — utiliser `localhost`)
- Mettre `--disable-gpu-memory-buffer-video-frames` dans le bloc hardware decode Pi 5 (force le chemin software complet)
- Supprimer le mécanisme `GPU_DECODE_FALLBACK_FILE` (auto-fallback hardware→software après 2 crashs)
- Mettre `DUAL_DISPLAY_ACTIVE=true` AVANT que `setup_secondary_xrandr` réussisse (faux failover sur Pi mono-HDMI)
- Utiliser `setup_secondary_xrandr || true` pour avaler l'erreur (le code de retour est la source de vérité pour `DUAL_DISPLAY_ACTIVE`)
- Supprimer `boot_fast_checks` du main loop (les 6 premières itérations à 5s rattrapent les restacks LXDE/openbox)
- Supprimer le boot swap xrandr immédiat quand seul HDMI-1 est connecté
- Conditionner le mode dual-display sur un flag config (le Pi détecte par hardware via DRM sysfs + xrandr — `DUAL_DISPLAY_ACTIVE` positionné par le watchdog)
- Utiliser un `sleep` unique sans retry dans le subshell fullscreen de `start_chromium()` (Chromium peut mettre >4s à créer sa fenêtre)
- Réduire `check_window_stacking()` à un simple `windowactivate` sans `windowmove`/`windowsize`
- Supprimer la boucle re-raise post-fullscreen du subshell `start_chromium()` (LXDE/openbox restack lxpanel 1-5s après le premier fullscreen)
- Ajouter `@lxpanel` dans l'autostart LXDE de `install.sh` (utiliser `@xsetroot -solid black`)

### HDMI & Display

- Appeler `setup_secondary_xrandr()` dans `deactivate_hdmi_failover()` sans forcer HDMI-0 comme primaire au préalable
- Faire confiance à `cec.tv_connected` seul (toujours croiser avec `display.connected` EDID/DRM et `devices_found`)
- Classifier `display_type = 'tv'` sur la seule présence d'un bloc CEA dans l'EDID (filtrer par manufacturer EDID)

### Bash scripting

- Utiliser `\d` dans `grep -E` (syntaxe Perl uniquement — utiliser `[0-9]`)
- Initialiser des variables bash à `0` quand elles utilisent `${VAR:-default}` (le fallback ne se déclenche que si vide/unset)
- Utiliser `grep -c "pattern" || echo "0"` (sort `0` ET echo `0` → variable = `"0\n0"` — utiliser `$(grep -c ... || true)`)
- Créer `club-config.json` sans `chmod 600` (contient le mot de passe WiFi en clair)
- Lancer `nginx -t` sans `sudo` dans les scripts de diagnostic

### Sync-Agent

- Remplacer `timeCategories`/`sponsors`/`categories` dans `update-config.js` sans appeler `restoreSecondaryVariants()` après (ADR-032)
- Broadcaster la config profil brute dans le handler `profile-switch` de `handlers.js` sans merger les LOCAL_ONLY_SETTINGS et sans persister dans `configuration.json`
- Créer de nouveaux ConfigWatcher/VideoWatcher dans `handleAuthenticated()` sans appeler `stopWatchers()` avant (fuite N watchers par reconnexion)
- Ajouter `socket.on('pong', ...)` dans `handleAuthenticated()` sans `removeAllListeners('pong')` avant (accumulation handlers)
- Définir `cleanupLegacyFiles()` dans agent.js sans l'appeler dans `start()` (méthode morte)
- Utiliser `rsync -a` sans `--delete` pour sync-agent dans build-raspberry.sh (fichiers supprimés survivent sur les Pi après OTA)
- Supprimer `version.ts` ou l'injection de `APP_VERSION` dans `build-raspberry.sh` / `release.yml`

### Hardware

- Omettre `dtparam=cooling_fan` dans `/boot/firmware/config.txt` sur Pi 5 avec Active Cooler (ventilateur non contrôlé, surchauffe silencieuse)
