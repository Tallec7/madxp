# CLAUDE.md - Neopro

> Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.

## Commandes

```bash
# Développement
npm start                          # Frontend Raspberry (port 4200)
npm run start:central              # Dashboard central (port 4300)
cd central-server && npm run dev   # API Backend (port 3001)

# Build
npm run build:raspberry            # Build Angular Pi
npm run build:central              # Build dashboard
cd central-server && npm run build # Compile TypeScript

# Tests
npm run test:server                # Jest (API central-server — 1941 tests)
npm run test:smoke                 # Jest (Smoke tests — 533 tests, détecte régressions de wiring)
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
- Classifier `display_type = 'tv'` sur la seule présence d'un bloc CEA dans l'EDID (les moniteurs PC modernes incluent un CEA extension pour compatibilité HDMI audio/YCbCr — filtrer par manufacturer EDID : LEN, DEL, ACI, HWP, BNQ, ACR, EIZ, NEC, AOC = toujours `monitor` — smoke test enforced)
- Conditionner `hdmiDetectedAt` à `wasDisconnected` dans tv.component.ts (`hdmiConnected` est initialisé à `true` → `wasDisconnected` est toujours `false` au boot → `hdmiDetectedAt` jamais capturé → boot-to-video toujours 0ms — capturer dès le premier statut HDMI reçu — smoke test enforced)
- Utiliser un `sleep` unique sans retry dans le subshell fullscreen de `start_chromium()` (sur Pi lent/SD card usée, Chromium peut mettre >4s à créer sa fenêtre X11 — sans retry loop, le fullscreen n'est jamais appliqué — smoke test enforced)
- Réduire `check_window_stacking()` à un simple `windowactivate` sans `windowmove`/`windowsize` (c'est le filet de sécurité qui rattrape tout échec de fullscreen init — doit toujours appliquer la séquence complète xprop + windowmove + windowsize + windowactivate — smoke test enforced)
- Utiliser `[ngClass]="timeCategory.color"` dans le template remote (les valeurs `color` des profils ne correspondent pas forcément aux classes SCSS → cartes invisibles — toujours passer par `getTimeCategoryGradientClass()` qui fallback par `id` de catégorie — smoke test enforced)
- Supprimer le menu item "Changer de profil" dans la remote (seul point d'entrée alternatif vers le club-selector — le bouton retour seul ne suffit pas quand `isMultiProfile` est conditionnel — smoke test enforced)
- Supprimer `isCompletedByProgress` dans `deploy-progress.handler.ts` (le signal Socket.IO `completed:true` est fire-and-forget — sur WiFi instable RTL8192EU, le signal peut se perdre → déploiements bloqués à 99-100% indéfiniment — l'auto-completion à `progress >= 100` est le filet de sécurité — smoke test enforced)
- Supprimer l'auto-completion des déploiements bloqués à 100% dans `checkStuckDeployments()` de `alerting.service.ts` (deuxième filet : rattrape les déploiements où même le progress event à 100 a été perdu — auto-complete après 5min à progress >= 100 — smoke test enforced)
- Utiliser `$WIFI_INTERFACE` dans `hotspot-optimizer.sh` (variable indéfinie — utiliser `$AP_INTERFACE` qui est défini à `wlan0` — smoke test enforced)
- Supprimer le boot grace period hotspot du NetworkWatchdog `start()` (sans grace period, le watchdog détecte "IP 192.168.4.1 non configurée" à boot+5s et redémarre hostapd 2-3 fois, retardant la stabilisation du hotspot de 30s+ — smoke test enforced)
- Supprimer la boucle re-raise post-fullscreen du subshell `start_chromium()` dans kiosk-watchdog.sh (LXDE/openbox restack lxpanel 1-5s après le premier fullscreen — sans re-raise à +3s/+8s/+15s, la barre de tâches reste visible ~30s jusqu'au prochain `check_window_stacking` — smoke test enforced)
- Ajouter `@lxpanel` dans l'autostart LXDE de `install.sh` (la barre de tâches recouvre Chromium fullscreen — utiliser `@xsetroot -solid black` à la place — defense-in-depth : deploy-remote.sh corrige les Pi existants, kiosk-watchdog.sh tue lxpanel proactivement — smoke test enforced)
- Mettre `DUAL_DISPLAY_ACTIVE=true` AVANT que `setup_secondary_xrandr` réussisse (sur Pi avec un seul port HDMI actif, `setup_secondary_xrandr` échoue → si `DUAL_DISPLAY_ACTIVE` est déjà `true`, le main loop déclenche un faux failover → kill/restart Chromium → bureau LXDE visible — toujours conditionner `DUAL_DISPLAY_ACTIVE=true` au succès de `setup_secondary_xrandr` — smoke test enforced)
- Utiliser `setup_secondary_xrandr || true` pour avaler l'erreur qui détermine le mode display (le code de retour de `setup_secondary_xrandr` est la source de vérité pour `DUAL_DISPLAY_ACTIVE` — avaler l'erreur empêche de détecter qu'un seul écran est branché — smoke test enforced)
- Supprimer `boot_fast_checks` du main loop de kiosk-watchdog.sh (les 6 premières itérations tournent à 5s au lieu de 30s pour rattraper les restacks LXDE/openbox/D-Bus survenant entre +20s et +50s après le boot — sans ça, fenêtre de ~26s sans protection — smoke test enforced)
- Conditionner le mode dual-display sur un flag config (`secondaryDisplayEnabled`, `secondary_display_enabled`) — le Pi détecte le dual-display par hardware via DRM sysfs + xrandr. Les colonnes DB sont DEPRECATED et le toggle dashboard a été supprimé. Le seul signal de vérité est `DUAL_DISPLAY_ACTIVE` positionné par le watchdog après détection hardware (smoke test enforced)
- Utiliser `this.hdmiConnected = data.hdmi0` seul dans tv.component.ts (quand l'écran est sur HDMI-1, `data.hdmi0` est faux → "En attente d'écran" — utiliser `data.hdmi0 || data.hdmi1` car le watchdog gère le swap automatique — smoke test enforced)
- Utiliser `systemctl is-enabled` seul pour détecter les services systemd à nettoyer dans fix-fleet-pi.sh (les services installés manuellement — fichier copié dans `/etc/systemd/system/` sans `systemctl enable` — retournent erreur/indirect avec `is-enabled` mais tournent via `Restart=always` → toujours ajouter `|| systemctl is-active` comme fallback — smoke test enforced)

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
