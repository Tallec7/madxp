# CLAUDE.md - Neopro

> Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.

## Commandes

```bash
# Développement
npm start                          # Frontend Raspberry (port 4200)
npm run start:central              # Dashboard central (port 4300)
cd central-server && npm run dev   # API Backend (port 3001)

# Simulation locale complète (dev-seed)
npm run dev:seed                   # Installe config + vidéos + data pour les 3 serveurs
npm run dev:seed:clean             # Nettoie les fichiers dev-seed

# Build
npm run build:raspberry            # Build Angular Pi
npm run build:central              # Build dashboard
cd central-server && npm run build # Compile TypeScript

# Tests
npm run test:server                # Jest (API central-server — 2352 tests)
npm run test:smoke                 # Jest (Smoke tests — 819 tests, détecte régressions de wiring)
npm run test:central               # Karma (Angular Dashboard — 520 tests)
cd raspberry/server && npm test    # Jest (Socket.IO server — 71 tests)
cd raspberry/admin && npm test     # Jest (Admin server — 194 tests)
cd e2e && npx playwright test      # E2E
npm run lint                       # ESLint

# Monitoring
docker compose up prometheus alertmanager grafana  # Grafana (3000) + Prometheus (9090) + Alertmanager (9093)

# Base de données
cd central-server && npm run db:migrate

# Pitch deck / métriques de traction
source central-server/.env && psql "$DATABASE_URL" -f central-server/src/scripts/pitch-deck-metrics.sql
```

## Règles de code

- **TypeScript strict** : jamais de `any`, toujours typer explicitement
- **Repository pattern** : utiliser les repositories (`siteRepository`, `alertRepository`, etc.) — 0 `query()` direct (ESLint enforced)
- **Logger Winston** : `logger.info('Action', { context })` — pas de `console.log` dans central-server
- **Validation Joi** avant traitement des inputs
- **Async/await** avec try/catch, jamais de callbacks
- **Conventional Commits** : `feat(scope):`, `fix(scope):`, `docs(scope):`
- **Architecture modulaire Pi** : `raspberry/server/` et `raspberry/admin/` suivent le pattern orchestrateur + services + routes

## NE JAMAIS FAIRE

- Modifier les migrations déjà en production
- Changer le format des `api_key` des sites (casserait tous les Pi)
- Utiliser `console.log` dans central-server (utiliser Winston)
- Revenir à Nixpacks pour Railway (Nixpacks auto-détecte le root package.json et lance `ng build` qui OOM — utiliser le Dockerfile builder `central-server/Dockerfile` avec `COPY central-server/` pour isoler le build)
- Importer `../config/database` dans les controllers (ESLint bloque tout import, utiliser les repositories)
- Commit des secrets ou fichiers `.env`
- Push directement sur `main` sans PR
- Requêtes SQL non paramétrées (`'${email}'` → injection SQL)
- Ajouter `NoNewPrivileges=true` dans les fichiers `.service` systemd (bloque sudo, deadlock OTA — smoke test enforced)
- Ajouter `ExecStop=pkill -9` dans `neopro-kiosk.service` (bypasse le trap handler du watchdog, corrompt l'état GPU V3D sur Pi 5 — smoke test enforced)
- Dupliquer `--disable-features` dans kiosk-watchdog.sh (Chromium n'accepte qu'un seul flag, le dernier écrase les précédents — smoke test enforced)
- Utiliser `--kiosk` pour le Chromium secondaire (force le plein écran sur le moniteur principal, ignore `--window-position` — utiliser `--app=URL` + xprop/xdotool — smoke test enforced)
- Utiliser `xdotool key F11` pour le plein écran en dual-display (F11 prend TOUT le bureau X11 virtuel, pas un seul moniteur — utiliser `xprop _MOTIF_WM_HINTS` + `xdotool windowsize` — smoke test enforced)
- Synchroniser le slave dual-display par `videoPath` dans `handleMasterLoopState` (le secondary utilise des variants avec des chemins différents — toujours sync par `videoIndex` — smoke test enforced)
- Laisser le slave jouer sa boucle indépendamment du master (le slave doit pauser sa boucle dès `tv-role-assigned` et attendre les directives du master via `tv-loop-state` — smoke test enforced)
- Jouer une vidéo manuelle sur le secondary display sans résoudre la variante secondaire (le command `action` envoie le path principal — toujours passer par `resolveSecondaryVariant()` avant `play()` — smoke test enforced)
- Utiliser `\d` dans `grep -E` (syntaxe Perl uniquement — utiliser `[0-9]` avec grep -E — smoke test enforced)
- Créer `club-config.json` sans `chmod 600` (contient le mot de passe WiFi en clair — smoke test enforced)
- Lancer `nginx -t` sans `sudo` dans les scripts de diagnostic (Permission denied sur PID = faux positif — smoke test enforced)
- Supprimer le boot grace period du NetworkWatchdog `start()` (wlan1 RTL8192EU met 15-30s pour WPA auth + DHCP — sans grace period, fausse recovery cascade dès le boot — smoke test enforced)
- Faire un `require('./network-watchdog')` au niveau module dans `safe-network-operations.js` (dépendance circulaire CommonJS → objet vide → `enableGracePeriod` undefined — utiliser lazy require — smoke test enforced)
- Lancer `autoOptimize` / `iwlist scan` avant 60s après le boot (déstabilise le RTL8192EU pendant le handshake WPA — smoke test enforced)
- Faire plusieurs `iwlist scan` sur wlan1 dans hotspot-optimizer.sh (RTL8192EU single-radio : chaque scan coupe le carrier ~6s → utiliser un scan unique + `CACHED_SCAN` — smoke test enforced)
- Lancer `iwlist wlan1 scan` dans `networkDetector.scanWifiNetworks()` sans vérifier le cache inter-processus `/tmp/neopro-wlan1-scan-cache` (hotspot-optimizer écrit le cache au boot — 2 scans wlan1 en <120s tue le carrier RTL8192EU — smoke test enforced)
- Initialiser des variables bash à `0` quand elles utilisent `${VAR:-default}` (le fallback ne se déclenche que si VAR est vide/unset, PAS si `=0` — résultat : `--window-size=0,0` → fenêtre 1x1 pixel invisible — smoke test enforced)
- Utiliser `100vw` dans les SCSS des composants TV (`tv.component`, `waiting-screen`, `wrong-port-screen`) — `100vw` inclut la largeur des scrollbars sur navigateur PC (~17px), causant un débordement horizontal. Utiliser `100%` à la place (smoke test enforced)
- Utiliser `object-fit: cover` sur les players vidéo TV (`.freeze-canvas`, `.double-buffer-player`, `.manual-player`) — `cover` zoome et coupe les bords si le ratio écran ≠ ratio vidéo (ex: moniteur 16:10 vs vidéo 16:9). Utiliser `object-fit: contain` (smoke test enforced)
- Hardcoder `1920` ou `1080` dans kiosk-watchdog.sh (utiliser `$DEFAULT_SCREEN_WIDTH` / `$DEFAULT_SCREEN_HEIGHT` et la cascade `get_output_resolution()` — chaque TV a sa résolution native, pas forcément 1080p — smoke test enforced)
- Dériver `SECONDARY_X_OFFSET` d'une valeur hardcodée (doit être `$PRIMARY_SCREEN_WIDTH` réel, détecté par la cascade — sinon fenêtre secondaire mal positionnée sur écran non-1080p — smoke test enforced)
- Oublier `timeCategories[].loopVideos[]` dans `deploySecondaryVariant()` (les phases de match utilisent des `SponsorVideo` avec secondary variants — même structure que `sponsors[]` — smoke test enforced)
- Envoyer `update_config` depuis le central sans appeler `enrichConfigWithSecondaryVariants()` (le config ne contient jamais les variants par défaut — l'enrichissement DB est obligatoire avant tout envoi au Pi — smoke test enforced)
- Envoyer `update_config` depuis le central sans appeler `enrichConfigWithAnalyticsMetadata()` (sans enrichissement, le Pi reçoit les vidéos sans `video_id`/`advertiser_id`/`analytics_category` → `detectCategory()` tombe en fallback path-based → vidéos sponsor classifiées en `'other'` → analytics perdues — smoke test enforced)
- Remplacer `timeCategories`/`sponsors`/`categories` dans `update-config.js` (mode merge OU replace) sans appeler `restoreSecondaryVariants()` après (`restoreSecondaryVariants()` doit être appelé dans les DEUX modes pour réinjecter les variants perdues par le remplacement — ADR-032, smoke test enforced)
- Utiliser `xdotool windowsize` pour le retour dual→single display (Chromium ne re-render pas son viewport CSS après un resize X11 → contenu zoomé/coupé — relancer Chromium avec `--window-size` correct — smoke test enforced)
- Faire `xdotool windowsize` sans `xprop _MOTIF_WM_HINTS` + `xdotool windowactivate` lors de la transition single→dual ou du retour failover (xrandr reconfigure le layout X11, le WM restack lxpanel AU-DESSUS de Chromium → barre de tâches visible — smoke test enforced)
- Lancer `xrandr --output $X --off` sur un port HDMI physiquement déconnecté dans `stop_chromium_secondary()` (provoque une race DRM kernel qui déstabilise le statut des AUTRES ports HDMI → garde `detect_hdmi1_status` obligatoire — smoke test enforced)
- Émettre `tv-loop-update` avec `isManualMode: true` SEULEMENT après le délai 2×rAF + 200ms dans `play()` (un `tv-loop-state` stale arriverait au slave avant et tuerait sa vidéo manuelle — émettre aussi immédiatement — smoke test enforced)
- Appeler `stopManualVideoAndReturnToLoop()` dans `handleMasterLoopState` CAS 2 sans vérifier `_lastActionReceivedAt` (un `tv-loop-state` stale peut arriver après une action — guard 2s obligatoire — smoke test enforced)
- Construire `secondaryRelativePath` avec `relativePath.replace()` dans `deploySecondaryVariant()` (utilise le filename du fichier primaire au lieu de `finalFilename` — le secondaire a son propre nom — smoke test enforced)
- Appeler `play()` directement dans le handler `action` côté slave (le slave doit appeler `preloadManualVideo()` et attendre le signal `manualVideoVisible: true` du master via `tv-loop-state` — ADR-034, smoke test enforced)
- Émettre `manualVideoVisible: true` dans l'émission immédiate de `play()` (seule l'émission delayed après 2×rAF + 200ms doit émettre `manualVideoVisible: true` — sinon le slave révèle avant que le master soit prêt — ADR-034, smoke test enforced)
- Oublier `manualVideoVisible: false` dans `emitLoopState()` des transitions de boucle (les slaves interpréteraient l'absence du champ comme un signal de reveal — toujours émettre explicitement `false` — ADR-034, smoke test enforced)
- Afficher freeze-frame ou overlay noir dans `preloadManualVideo()` pour la première vidéo manuelle depuis la boucle (le preload doit être silencieux — la boucle continue de jouer en dessous pendant que la vidéo charge invisiblement en opacity 0 + muted — ADR-034 v3.89.3, smoke test enforced)
- Ajouter un délai 2×rAF + 200ms dans `revealPreloadedVideo()` (la révélation du slave doit être instantanée — opacity 1 + unmute immédiat — le délai est uniquement côté master dans `play()` — ADR-034 v3.89.3, smoke test enforced)
- Oublier `player.muted = true` dans `preloadManualVideo()` ou `player.muted = false` dans `revealPreloadedVideo()`/`cleanupPreloadState()` (sans mute, l'audio de la vidéo fuit pendant le preload invisible — ADR-034 v3.89.3, smoke test enforced)
- Oublier `captureAndShowFreezeFrame()` dans la transition manual→manual de `preloadManualVideo()` (quand on remplace une vidéo manuelle visible par une autre, il faut un freeze-frame pour couvrir le gap — sinon la boucle apparaît brièvement — ADR-034 v3.89.3, smoke test enforced)
- Utiliser `grep -c "pattern" || echo "0"` dans les scripts bash (`grep -c` sort `0` ET exit 1 quand count=0, puis `|| echo "0"` ajoute un second `0` → variable = `"0\n0"` → erreur arithmétique bash → faux positif dans les checks — utiliser `$(grep -c ... || true)` + `${var:-0}` — smoke test enforced)
- Envoyer `sync_profiles` ou `deploy` depuis le central sans passer par la chaîne d'enrichissement complète (`autoResolveSponsorIds()` → `enrichConfigWithSecondaryVariants()` → `enrichConfigWithAnalyticsMetadata()` — sans enrichissement, les profils arrivent au Pi sans variants secondaires ni métadonnées analytics → slave display cassé + sponsor analytics perdues — smoke test enforced)
- Utiliser `active_profile_id` ou `updateSiteActiveProfile()` dans le code central (concept retiré — le Pi gère la sélection du profil localement via la télécommande club-selector — smoke test enforced)
- Broadcaster la config profil brute dans le handler `profile-switch` de `handlers.js` sans merger les LOCAL_ONLY_SETTINGS et sans persister dans `configuration.json` (le handler doit lire le profil depuis `profiles/{id}.json`, merger les settings locaux `['settings', 'siteId', 'siteName', 'clubName', 'apiKey', 'hotspot', 'localNetwork', 'localSponsors']` depuis `configuration.json`, écrire le résultat fusionné dans `configuration.json`, puis broadcaster — sinon tout événement `config_updated` ultérieur écrase la sélection de profil avec l'ancien config — smoke test enforced)
- Utiliser `neopro.local` dans `CHROMIUM_URL` / `CHROMIUM_SECONDARY_URL` de kiosk-watchdog.sh (quand 2+ Pi sont sur le même LAN, mDNS résout `neopro.local` vers un Pi aléatoire → un Pi affiche la boucle de l'autre — utiliser `localhost` pour le kiosk interne, `neopro.local` reste valide pour l'accès externe SSH/télécommande/admin — smoke test enforced)
- Appeler `setup_secondary_xrandr()` dans `deactivate_hdmi_failover()` sans forcer HDMI-0 (HDMI-A-1) comme primaire xrandr au préalable (après failover, HDMI-1 est à +0+0 — `setup_secondary_xrandr` identifie le primaire par l'offset → HDMI-1 resterait primaire, HDMI-0 deviendrait secondaire — forcer `xrandr --output HDMI-A-1 --primary --auto --pos 0x0` + `--right-of` AVANT — smoke test enforced)
- Faire confiance à `cec.tv_connected` seul pour déterminer si un écran est branché (`cec-client` renvoie `power status:` même sans câble HDMI sur Pi 5 → faux positif — toujours croiser avec `display.connected` (EDID/DRM) et `devices_found` dans `getFullStatus()` — smoke test enforced)
- Retourner `'disconnected'` dans `getTvStatusForAnalytics()` quand `tv_power` est `null` (CEC adapter présent mais ne peut pas interroger la TV — pas de câble HDMI, accès PC-only, ioctl error → `tv_power: null` + `tv_connected: false` — retourner `'unknown'` pour que les analytics passent le guard — sinon TOUTES les analytics sont silencieusement perdues pour les sites sans HDMI — smoke test enforced)
- Classifier `display_type = 'tv'` sur la seule présence d'un bloc CEA dans l'EDID (les moniteurs PC modernes incluent un CEA extension pour compatibilité HDMI audio/YCbCr — filtrer par manufacturer EDID : LEN, DEL, ACI, HWP, BNQ, ACR, EIZ, NEC, AOC = toujours `monitor` — smoke test enforced)
- Conditionner `hdmiDetectedAt` à `wasDisconnected` dans tv.component.ts (`hdmiConnected` est initialisé à `true` → `wasDisconnected` est toujours `false` au boot → `hdmiDetectedAt` jamais capturé → boot-to-video toujours 0ms — capturer dès le premier statut HDMI reçu — smoke test enforced)
- Utiliser un `sleep` unique sans retry dans le subshell fullscreen de `start_chromium()` (sur Pi lent/SD card usée, Chromium peut mettre >4s à créer sa fenêtre X11 — sans retry loop, le fullscreen n'est jamais appliqué — smoke test enforced)
- Réduire `check_window_stacking()` à un simple `windowactivate` sans `windowmove`/`windowsize` (c'est le filet de sécurité qui rattrape tout échec de fullscreen init — doit toujours appliquer la séquence complète xprop + windowmove + windowsize + windowactivate — smoke test enforced)
- Utiliser `[ngClass]="timeCategory.color"` dans le template remote (les valeurs `color` des profils ne correspondent pas forcément aux classes SCSS → cartes invisibles — toujours passer par `getTimeCategoryGradientClass()` qui fallback par `id` de catégorie — smoke test enforced)
- Supprimer le menu item "Changer de profil" dans la remote (seul point d'entrée alternatif vers le club-selector — le bouton retour seul ne suffit pas quand `isMultiProfile` est conditionnel — smoke test enforced)
- Supprimer `validate-post-update.js` ou son appel dans `update-software.js` (la validation post-OTA est le seul mécanisme qui vérifie que les services fonctionnent AVANT de reporter le succès — sans elle, un OTA qui casse neopro-app/neopro-admin est reporté comme réussi → pas de rollback → Pi cassé — smoke test enforced)
- Supprimer `canary-monitor.service.ts` ou son intégration dans `deploy-progress.handler.ts` et `alerting.service.ts` (le canary monitoring est le filet de sécurité post-deploy qui détecte les régressions après rollback manqué — site offline, version mismatch, crash-loops — sans lui, un Pi défaillant après OTA passe inaperçu jusqu'au prochain heartbeat manuel — smoke test enforced)
- Supprimer les tests hardware-matrix E2E ou les scénarios HDMI-1 only / dual-display / hot-plug dans `e2e/tests/hardware-matrix.spec.ts` (seuls tests qui vérifient le comportement runtime Angular sur des configurations HDMI réelles via BroadcastChannel injection — sans eux, les régressions HDMI ne sont détectées qu'en production sur Pi physique — smoke test enforced)
- Supprimer `isCompletedByProgress` dans `deploy-progress.handler.ts` (le signal Socket.IO `completed:true` est fire-and-forget — sur WiFi instable RTL8192EU, le signal peut se perdre → déploiements bloqués à 99-100% indéfiniment — l'auto-completion à `progress >= 100` est le filet de sécurité — smoke test enforced)
- Supprimer l'auto-completion des déploiements bloqués à 100% dans `checkStuckDeployments()` de `alerting.service.ts` (deuxième filet : rattrape les déploiements où même le progress event à 100 a été perdu — auto-complete après 5min à progress >= 100 — smoke test enforced)
- Utiliser `$WIFI_INTERFACE` dans `hotspot-optimizer.sh` (variable indéfinie — utiliser `$AP_INTERFACE` qui est défini à `wlan0` — smoke test enforced)
- Ajouter `ip addr add 192.168.4.1` AVANT `systemctl restart hostapd` dans la recovery hotspot (`attemptHotspotRecovery` / `attempt_recovery`) — hostapd restart flush les IPs manuelles sur wlan0 via la transition managed→master — l'IP doit être ajoutée APRÈS le restart, avec attente dhcpcd + fallback manuel (smoke test enforced)
- Supprimer le boot grace period hotspot du NetworkWatchdog `start()` (sans grace period, le watchdog détecte "IP 192.168.4.1 non configurée" à boot+5s et redémarre hostapd 2-3 fois, retardant la stabilisation du hotspot de 30s+ — smoke test enforced)
- Supprimer la boucle re-raise post-fullscreen du subshell `start_chromium()` dans kiosk-watchdog.sh (LXDE/openbox restack lxpanel 1-5s après le premier fullscreen — sans re-raise à +3s/+8s/+15s, la barre de tâches reste visible ~30s jusqu'au prochain `check_window_stacking` — smoke test enforced)
- Ajouter `@lxpanel` dans l'autostart LXDE de `install.sh` (la barre de tâches recouvre Chromium fullscreen — utiliser `@xsetroot -solid black` à la place — defense-in-depth : deploy-remote.sh corrige les Pi existants, kiosk-watchdog.sh tue lxpanel proactivement — smoke test enforced)
- Mettre `DUAL_DISPLAY_ACTIVE=true` AVANT que `setup_secondary_xrandr` réussisse (sur Pi avec un seul port HDMI actif, `setup_secondary_xrandr` échoue → si `DUAL_DISPLAY_ACTIVE` est déjà `true`, le main loop déclenche un faux failover → kill/restart Chromium → bureau LXDE visible — toujours conditionner `DUAL_DISPLAY_ACTIVE=true` au succès de `setup_secondary_xrandr` — smoke test enforced)
- Utiliser `setup_secondary_xrandr || true` pour avaler l'erreur qui détermine le mode display (le code de retour de `setup_secondary_xrandr` est la source de vérité pour `DUAL_DISPLAY_ACTIVE` — avaler l'erreur empêche de détecter qu'un seul écran est branché — smoke test enforced)
- Supprimer `boot_fast_checks` du main loop de kiosk-watchdog.sh (les 6 premières itérations tournent à 5s au lieu de 30s pour rattraper les restacks LXDE/openbox/D-Bus survenant entre +20s et +50s après le boot — sans ça, fenêtre de ~26s sans protection — smoke test enforced)
- Supprimer le boot swap xrandr immédiat dans `main()` de kiosk-watchdog.sh quand seul HDMI-1 est connecté (sans `xrandr --output HDMI-A-2 --primary --auto` AVANT `start_chromium`, X n'a pas activé HDMI-A-2 → Chromium se lance sur un framebuffer non configuré → fenêtre dans un coin au lieu de plein écran — attendre l'auto-swap du watchdog loop 10s plus tard est trop tard — smoke test enforced)
- Conditionner le mode dual-display sur un flag config (`secondaryDisplayEnabled`, `secondary_display_enabled`) — le Pi détecte le dual-display par hardware via DRM sysfs + xrandr. Les colonnes DB sont DEPRECATED et le toggle dashboard a été supprimé. Le seul signal de vérité est `DUAL_DISPLAY_ACTIVE` positionné par le watchdog après détection hardware (smoke test enforced)
- Utiliser `this.hdmiConnected = data.hdmi0` seul dans tv.component.ts (quand l'écran est sur HDMI-1, `data.hdmi0` est faux → "En attente d'écran" — utiliser `data.hdmi0 || data.hdmi1` car le watchdog gère le swap automatique — smoke test enforced)
- Utiliser `systemctl is-enabled` seul pour détecter les services systemd à nettoyer dans fix-fleet-pi.sh (les services installés manuellement — fichier copié dans `/etc/systemd/system/` sans `systemctl enable` — retournent erreur/indirect avec `is-enabled` mais tournent via `Restart=always` → toujours ajouter `|| systemctl is-active` comme fallback — smoke test enforced)
- Revenir à un `FAST_RETRY_DELAY` fixe dans `internetWatchLoop` de network-watchdog.js (les environnements mesh NLF ont besoin de back-off progressif `PHASE_BACKOFF_DELAYS` [10s→120s] entre les phases de recovery — un délai fixe de 10s escalade les 6 phases en ~60s → modprobe atteint avant que le mesh ne se stabilise — smoke test enforced)
- Hardcoder le seuil modprobe/USB à 5 min dans network-watchdog.js sans vérifier `_isMeshEnvironment()` (les environnements mesh doivent avoir un guard de 10 min minimum via `_getModprobeGuard()` / `_getUsbCycleGuard()` — les APs mesh rebootent/changent de canal périodiquement → 5 min trop court → modprobe inutile qui déstabilise le RTL8192EU — smoke test enforced)
- Hardcoder le seuil bgscan `simple:30:-70:300` dans `autoOptimize()` de safe-network-operations.js (utiliser `_computeOptimalBgscan()` qui adapte le threshold au niveau de signal : > -72 dBm → threshold -75, ≤ -75 dBm → threshold -70 — un seuil fixe à -70 dBm oscille quand le signal est à -68 dBm → scans continus toutes les 30s — smoke test enforced)
- Supprimer le mécanisme `GPU_DECODE_FALLBACK_FILE` de kiosk-watchdog.sh (l'auto-fallback hardware→software après 2 crashs protège contre les régressions V4L2 Chromium — sans ce filet, Chromium crash-loop en boucle avec le hardware decode sur certaines versions — smoke test enforced)
- Supprimer `applyPreUpdateMigration()` de `update-deployment.service.ts` (la pré-migration envoie un `remote_shell` qui nettoie les fichiers VERSION/release.json `root:root` AVANT l'OTA — sans ça, `fs.copy()` → EACCES → OTA stuck à 0% indéfiniment — supprimé par erreur en 173aaa5a comme "dead code" → v3.115.2 bloqué sur 2 sites — smoke test enforced)
- Mettre `--disable-gpu-memory-buffer-video-frames` dans le bloc hardware decode Pi 5 (ce flag force le chemin software complet — le hardware decode V4L2 a besoin des GPU memory buffers pour fonctionner — smoke test enforced)
- Dupliquer `--enable-features` dans kiosk-watchdog.sh (même règle que `--disable-features` — Chromium n'accepte qu'un seul flag `--enable-features`, le dernier écrase les précédents — combiner dans la variable `$enable_features` — smoke test enforced)
- Utiliser `rsync -a` sans `--delete` pour sync-agent dans build-raspberry.sh (les fichiers supprimés du repo survivent indéfiniment sur les Pi après OTA — ex: `sponsor-impressions.js` supprimé en v3.67 envoyait encore des HTTP 400 avec 2448 impressions orphelines — smoke test enforced)
- Définir `cleanupLegacyFiles()` dans agent.js sans l'appeler dans `start()` (méthode morte — les fichiers stale restent éternellement sur le Pi — ex: `sponsor_impressions.json` avec 2448 entrées orphelines jamais nettoyées — smoke test enforced)
- Construire des chemins vidéo spéculatifs dans le dashboard avec `videos/${category}/${filename}` (le Pi sanitize, déduplique et préfère `originalName` → mismatch → vidéos injouables — toujours utiliser `deployedPathsMap` alimenté par le feedback `deployed_path` de `content_deployments` — smoke test enforced)
- Utiliser `'UPLOADS'` comme fallback catégorie dans le dashboard quand `cloud.category` est null (le Pi reçoit `'default'` via `deployment.service.ts` → chemin réel `videos/default/X.mp4` ≠ chemin spéculatif `videos/UPLOADS/X.mp4` → vidéos "introuvables" quand un site hors connexion se reconnecte — toujours utiliser `'default'` comme fallback dans `site-content-tab.component.ts` pour aligner avec `deployment.service.ts` — smoke test enforced)
- Comparer `site_sponsor_videos.video_filename` par exact match seul sans normaliser en bare filename (`video_filename` peut être un full path `"videos/default/X.mp4"` envoyé par le Pi via `syncVideoAssociations`, alors que la config boucle stocke le bare filename `"X.mp4"` — toujours utiliser `LIKE '%/' || $1` en fallback dans les requêtes SQL, et `split('/').pop()` côté dashboard — smoke test enforced)
- Supprimer l'appel `backfillDeployedPaths()` dans `config-sync.handler.ts` (auto-healing des `deployed_path` NULL pour les déploiements pré-v3.102 — à chaque `sync_local_state`, le Pi rapporte ses vidéos locales → matching checksum-first, filename-fallback → comble le gap sans intervention manuelle — smoke test enforced)
- Appeler `play()` directement dans le handler LocalBroadcast `onCommand()` de tv.component.ts sans vérifier `isSlaveMode` (le LocalBroadcast est reçu par TOUS les onglets — le slave doit appeler `preloadManualVideo()` et attendre le reveal du master via `tv-loop-state`, pas `play()` direct qui affiche freeze-frame + overlay noir — même pattern que le handler Socket.IO `action` — ADR-034, smoke test enforced)
- Utiliser `manualVideoVisible === false` (strict equality) dans `handleMasterLoopState` CAS 1 (quand `manualVideoVisible` est `undefined` ou absent, `=== false` rate le cas → tombe en fallback `play()` direct → freeze-frame + overlay — utiliser `!== true` qui couvre false, undefined ET absent — smoke test enforced)
- Omettre `dtparam=cooling_fan` dans `/boot/firmware/config.txt` sur Pi 5 avec Active Cooler (sans ce paramètre, le device-tree garde `cooling_fan` en `status=disabled` → pas de driver `pwm-fan` → pas de `/sys/class/thermal/cooling_device0` → ventilateur non contrôlé tourne à 100%, monitoring `getFanStatus()` retourne `present:false` → surchauffe silencieuse — smoke test enforced)
- Calculer les stats de la barre `library-stats` sur `allVideos` dans `processVideos()` (mélange stats globales du catalogue cloud 500 vidéos avec l'affichage filtré par site — toujours calculer sur `filteredVideos` dans `applyFilters()` via les propriétés `filtered*` — smoke test enforced)
- Utiliser `admin-neopro.kalonpartners.bzh` dans les URLs (le sous-domaine correct est `neopro-admin.kalonpartners.bzh` — `admin-neopro` est NXDOMAIN → magic links sponsors cassés — smoke test enforced)
- Supprimer les endpoints `/benchmark` ou `/export-csv` du sponsor-portal (essentiels pour le PoC Proof of Play — sans eux, pas de classement intra-club ni d'export données — smoke test enforced)
- Retirer `interruption_reason` de l'INSERT `video_plays` dans analytics.repository.ts (alimente le taux de complétion du portail sponsor — sans contexte d'interruption, les stats de complétion sont imprécises — smoke test enforced)
- Afficher le canvas Chart.js du portail sponsor sans conteneur `.chart-container` à hauteur fixe (`maintainAspectRatio: false` sans hauteur parent = graphe qui s'étire indéfiniment — smoke test enforced)
- Utiliser `GROUP BY vp.column` quand le SELECT utilise `COALESCE(NULLIF(TRIM(vp.column), ''), 'default')` (le GROUP BY brut ne coalese pas les variantes vide/null/whitespace → lignes dupliquées dans l'affichage — toujours aligner le GROUP BY sur l'expression COALESCE du SELECT — smoke test enforced)
- Utiliser `video_duration: durationPlayed` dans analytics.service.ts (c'est la durée jouée, pas la durée réelle de la vidéo HTMLVideoElement.duration — utiliser `setCurrentVideoDuration()` qui capture `player.duration` depuis tv.component.ts → completion_rate = duration_played / video_duration devient significatif — smoke test enforced)
- Appeler `fix-fleet-pi.sh` sans `sudo` dans `deploy-remote.sh` ou `update-software.js` (le script vérifie `id -u == 0` et exit 1 si non-root — sans sudo, les 13 étapes de remédiation fleet sont silencieusement ignorées : boot splash, systemd, GPU, HDMI, ventilateur Pi 5… — `|| true` / `catch` avalent l'erreur — smoke test enforced)
- Supprimer `generateWeightedPlaylist()` de `startSeamlessLoop()` dans tv.component.ts (sans weighted playlist, la rotation pondérée est silencieusement désactivée → tous les sponsors reçoivent le même temps d'antenne quel que soit leur weight — smoke test enforced)
- Supprimer le champ `weight` de `LoopVideo`, `LoopVideoConfig` ou `SponsorVideo` (le weight est le seul mécanisme de pondération de la rotation sponsor — le supprimer casse la différenciation sponsor Or/Argent/Bronze — smoke test enforced)
- Reconstruire les objets sponsor dans `enrichConfigWithAnalyticsMetadata()` ou `enrichConfigWithSecondaryVariants()` au lieu de muter les champs (reconstruire l'objet = perdre `weight` et tout autre champ futur — toujours SET des champs spécifiques sur l'objet existant — smoke test enforced)
- Revenir à l'algorithme greedy (pick highest remaining) dans `generateWeightedPlaylist()` (le greedy front-load le sponsor dominant → ×4 et ×10 produisent tous les deux "1 sur 2" → pondération invisible. L'algo Bresenham (accumulator += weight, pick max, accumulator -= totalSlots) distribue uniformément : ×4 = gap ~3.3, ×10 = gap ~1.8 → différence perceptible — smoke test enforced)
- Supprimer la prévisualisation playlist (`getPlaylistPreview`, `playlist-preview-track`) du loop-manager (seul feedback visuel en temps réel de l'effet des poids sur l'ordre de diffusion — sans elle, le manager configure à l'aveugle — smoke test enforced)
- Supprimer `fixWrapAround()` de `generateWeightedPlaylist()` (la boucle TV cycle en continu — sans wrap-around fix, le même sponsor en position 1 ET dernière = double passage à la jonction de boucle — smoke test enforced)
- Supprimer le champ `pinned` de `LoopVideo`, `LoopVideoConfig` ou `SponsorVideo` (le pinned permet de fixer une vidéo à sa position dans la boucle — ex: intro Neopro toujours en 1ère position — les vidéos épinglées ne participent pas au scheduling Bresenham — smoke test enforced)
- Supprimer le support `pinnedSlots`/`mobileVideos` de `generateWeightedPlaylist()` (les vidéos épinglées doivent rester à leur position d'origine — sans ce mécanisme, le Bresenham les déplacerait — smoke test enforced)
- Réconcilier des loopVideos sans marqueurs sponsor dans `_reconcileOrphanedLoopVideos()` (seules les entrées avec `site_sponsor_id`, `analytics_category === 'sponsor'` ou `owner === 'club'` sont de vrais sponsors — sans ce filtre, TOUTES les vidéos de boucle sont auto-créées comme sponsors parasites : "Intro Neopro", doublons "Laugier"… — smoke test enforced)
- Utiliser un match exact seul dans `getAutoDetectedSponsor()` / `getCategorySponsor()` (les vidéos de boucle ont des préfixes numériques `07_A_L_AFFUT.mp4` mais `site_sponsor_videos` stocke le nom catégorie `A_L_AFFUT.mp4` → badges sponsors absents — toujours fallback strip `^\d+_` — smoke test enforced)
- Initialiser Socket.IO client (`raspberry/src/app/services/socket.service.ts`) sans options de reconnexion (sans `reconnection: true`, `reconnectionDelay`, `reconnectionAttempts: Infinity` — un drop socket laisse la TV gelée sans recovery automatique → l'utilisateur doit refresh — smoke test enforced)
- Initialiser Socket.IO serveur (`raspberry/server/server.js`) sans `pingInterval`/`pingTimeout`/`transports` (sans ping explicite, les connexions zombie restent 45s sans détection → le slave ne reçoit plus `tv-loop-state` → vidéo gelée — smoke test enforced)
- Supprimer les handlers lifecycle `disconnect`/`reconnect`/`connect_error` de `socket.service.ts` (sans eux, l'app ne détecte pas la perte de connexion et ne re-register pas après reconnexion — smoke test enforced)
- Supprimer `onReconnect()` de `socket.service.ts` ou le re-register `tv-register` dans `tv.component.ts` (après un reconnect, le serveur a perdu le client → sans re-emit `tv-register`, le slave reste gelé indéfiniment — smoke test enforced)
- Réduire le timeout preload du double-buffer sous 5000ms (`double-buffer-video.service.ts`) (l'accès distant via WiFi PC charge les vidéos par HTTP → 2s trop court → forced switch prématuré → freeze-frame bloqué — smoke test enforced)
- Utiliser des champs fantômes (`video_title`, `video_duration`, `total_impressions`, `total_screen_time`, `priority`, `associated_at`) dans le template vidéos de `advertiser-detail.component.ts` (l'API `advertiser.repository.getVideos` retourne `filename`, `original_name`, `duration`, `added_at`, `file_size` — mismatch = NaN + données vides — smoke test enforced)
- Masquer le message d'erreur serveur dans `deployCampaignAction()` avec un message générique (le serveur retourne 3 erreurs identifiables : `no videos`, `no target sites`, `not found` — le handler DOIT les afficher en français pour guider l'utilisateur — smoke test enforced)
- Dupliquer le traitement des commandes `action`/`onCommand` inline dans les handlers Socket.IO et BroadcastChannel de tv.component.ts (utiliser `handleTvCommand()` centralisé avec guard `isDuplicateCommand()` — quand remote+TV sont dans le même navigateur, les deux canaux délivrent le même `command` → double `play()` → le second `load()` annule le premier → freeze — smoke test enforced)
- Supprimer le guard `isDuplicateCommand()` de `handleTvCommand()` dans tv.component.ts (sans ce guard, BroadcastChannel + Socket.IO délivrent le même `command` au même onglet → double `play()` / `preloadManualVideo()` → race condition → vidéo gelée — smoke test enforced)
- Utiliser `player.muted = false` dans `revealPreloadedVideo()` sans vérifier `player.paused` après (Chrome pause une vidéo en lecture lorsqu'on la unmute programmatiquement sur un onglet sans interaction utilisateur — /secondary n'a aucun geste → unmute → pause → vidéo gelée — toujours détecter le pause et fallback en muted — smoke test enforced)
- Supprimer `_preloadReady` / `_pendingReveal` du mécanisme preload+reveal dans tv.component.ts (sur navigateur web, le HTTP loading est plus lent que sur Pi → le master signale le reveal AVANT que le slave ait fini le preload → sans deferred reveal, le signal est perdu → vidéo jamais révélée → freeze — smoke test enforced)

## Architecture détaillée

- Vue système : `docs/technical/ARCHITECTURE.md`
- Référence complète : `docs/technical/REFERENCE.md`
- Sync-agent : `docs/technical/SYNC_ARCHITECTURE.md`
- Schéma DB : `central-server/src/scripts/full-schema.sql`
- Troubleshooting : `docs/guides/TROUBLESHOOTING.md`
- WiFi USB (clé) : `docs/guides/WIFI_USB_GUIDE.md`
- Onboarding : `docs/01-START-HERE.md`
- Client critique NLF : `docs/clients/NLF.md`
- Changelog : `docs/changelog/CHANGELOG.md`
- Métriques pitch deck : `central-server/src/scripts/pitch-deck-metrics.sql`
- **SAFe Pilotage Produit** : `docs/safe/README.md` (Epics, Features, US, Sprint Tracker, Value Streams)
- **SAFe Auto-update** : `.claude/rules/safe-update.md` (mise à jour auto des .md SAFe à chaque feat/fix)
- **SAFe Excel Generator** : `docs/safe/scripts/export-to-excel.py` (régénéré auto par pre-commit hook)
- **SAFe Notion (visualisation)** : https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5

Les règles détaillées par domaine sont dans `.claude/rules/` et se chargent automatiquement selon les fichiers édités.
