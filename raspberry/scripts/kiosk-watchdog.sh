#!/bin/bash
################################################################################
# Watchdog pour le mode Kiosk Neopro
#
# Ce script surveille Chromium et le relance automatiquement si :
# - Il affiche "Aw, Snap!" (crash page)
# - La mémoire GPU est saturée
# - Le processus est bloqué
#
# Usage: Ce script est lancé par neopro-kiosk.service
################################################################################

CHROMIUM_URL="http://neopro.local/tv"
CHROMIUM_SECONDARY_URL="http://neopro.local/secondary"
CONFIG_FILE="/home/pi/neopro/webapp/configuration.json"
LOG_DIR="/home/pi/neopro/logs"
LOG_FILE="$LOG_DIR/kiosk-watchdog.log"
KIOSK_STATUS_FILE="/home/pi/neopro/data/kiosk-status.json"
CHECK_INTERVAL=30  # Vérifier toutes les 30 secondes

# Créer le dossier de logs si nécessaire
mkdir -p "$LOG_DIR" 2>/dev/null || true
mkdir -p "$(dirname "$KIOSK_STATUS_FILE")" 2>/dev/null || true
MEMORY_THRESHOLD=85  # Redémarrer si mémoire > 85%
MAX_CRASH_COUNT=3  # Après 3 crashs rapides, attendre plus longtemps
CRASH_WINDOW=300   # Fenêtre de 5 minutes pour compter les crashs

# Compteur de crashs récents
crash_times=()

# Détecter le modèle de Raspberry Pi
detect_pi_model() {
    local model=$(cat /proc/device-tree/model 2>/dev/null || echo "")
    if [[ "$model" == *"Raspberry Pi 5"* ]]; then
        echo "pi5"
    else
        echo "pi4"
    fi
}

PI_MODEL=$(detect_pi_model)

# Secondary display Chromium state
SECONDARY_CHROMIUM_PID=0
SECONDARY_DISPLAY_ENABLED=false
# Dual-display active = secondary is running → primary must be constrained to its monitor
DUAL_DISPLAY_ACTIVE=false
PRIMARY_SCREEN_WIDTH=0
PRIMARY_SCREEN_HEIGHT=0

# Lire secondaryDisplayEnabled depuis configuration.json
# Rétrocompat: lit aussi "ledEnabled" pour les configs existantes (avant renommage)
read_secondary_display_enabled() {
    if [ -f "$CONFIG_FILE" ]; then
        local val
        val=$(python3 -c "
import json
c = json.load(open('$CONFIG_FILE'))
# Nouvelle clé prioritaire, fallback sur l'ancienne
print('true' if c.get('secondaryDisplayEnabled', c.get('ledEnabled')) else 'false')
" 2>/dev/null)
        SECONDARY_DISPLAY_ENABLED="${val:-false}"
    else
        SECONDARY_DISPLAY_ENABLED=false
    fi
}

# Détecter si HDMI 1 (second écran) est connecté
detect_hdmi1_status() {
    local status_file=""
    if [[ "$PI_MODEL" == "pi5" ]]; then
        # Pi 5: DRM card1-HDMI-A-2
        status_file="/sys/class/drm/card1-HDMI-A-2/status"
    else
        # Pi 4: DRM card0-HDMI-A-2 (second HDMI = micro-HDMI droit)
        status_file="/sys/class/drm/card0-HDMI-A-2/status"
    fi

    if [ -f "$status_file" ]; then
        local status
        status=$(cat "$status_file" 2>/dev/null)
        [[ "$status" == "connected" ]]
        return $?
    fi
    return 1  # Non connecté ou fichier non trouvé
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Nettoyer les anciens crashs (plus vieux que CRASH_WINDOW secondes)
cleanup_old_crashes() {
    local now=$(date +%s)
    local new_times=()
    for t in "${crash_times[@]}"; do
        if (( now - t < CRASH_WINDOW )); then
            new_times+=("$t")
        fi
    done
    crash_times=("${new_times[@]}")
}

# Enregistrer un crash et écrire le statut pour le sync-agent
record_crash() {
    crash_times+=("$(date +%s)")
    cleanup_old_crashes
    write_kiosk_status "crashed"
}

# Écrire le statut kiosk dans un fichier JSON lu par le sync-agent
write_kiosk_status() {
    local status="$1"
    local reason="${2:-}"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    local secondary_alive=$(pgrep -f "chromium.*$CHROMIUM_SECONDARY_URL" > /dev/null 2>&1 && echo "true" || echo "false")
    local hdmi1_status="unknown"
    detect_hdmi1_status && hdmi1_status="connected" || hdmi1_status="disconnected"
    cat > "$KIOSK_STATUS_FILE" 2>/dev/null <<EOF
{"status":"${status}","chromiumAlive":$(pgrep -f "chromium.*$CHROMIUM_URL" > /dev/null 2>&1 && echo "true" || echo "false"),"restartCount":${#crash_times[@]},"lastEvent":"${now}","reason":"${reason}","pid":${CHROMIUM_PID:-0},"secondaryDisplayEnabled":${SECONDARY_DISPLAY_ENABLED},"secondaryChromiumAlive":${secondary_alive},"hdmi1Status":"${hdmi1_status}"}
EOF
}

# Vérifie si trop de crashs récents
too_many_crashes() {
    cleanup_old_crashes
    (( ${#crash_times[@]} >= MAX_CRASH_COUNT ))
}

# Nettoyer les processus Chromium zombies
cleanup_chromium() {
    log "🧹 Nettoyage des processus Chromium..."
    SECONDARY_CHROMIUM_PID=0

    # Phase 1: Arrêt gracieux (SIGTERM) — laisse Chromium libérer les ressources GPU
    # Sur Pi 5, le driver V3D Mesa a besoin de ce cleanup pour libérer les DMA buffers,
    # shaders et mémoire GPU. Un SIGKILL direct laisse le GPU dans un état inconsistant,
    # causant des crashes/boucles au prochain lancement (VSync errors, rendering freeze).
    if pgrep -f "chromium" > /dev/null 2>&1; then
        pkill -TERM -f "chromium" 2>/dev/null || true
        pkill -TERM -f "chrome" 2>/dev/null || true

        # Attendre jusqu'à 5s que Chromium se termine proprement
        local wait_count=0
        while pgrep -f "chromium" > /dev/null 2>&1 && (( wait_count < 10 )); do
            sleep 0.5
            (( wait_count++ ))
        done

        # Phase 2: SIGKILL si toujours en vie
        if pgrep -f "chromium" > /dev/null 2>&1; then
            log "⚠️ Chromium n'a pas répondu au SIGTERM, SIGKILL..."
            pkill -9 -f "chromium" 2>/dev/null || true
            pkill -9 -f "chrome" 2>/dev/null || true
            sleep 2
        fi
    fi

    # Phase 3: Purger l'intégralité du profil Chromium (mode kiosk = aucun état persistant)
    # Corrige le bug d'ancienne version affichée au boot : Chromium conservait
    # des données dans des sous-dossiers non nettoyés (Session Storage, IndexedDB,
    # Local Storage, HTTP cache in-memory sérialisé, etc.)
    rm -rf /home/pi/.cache/chromium 2>/dev/null || true
    rm -rf /home/pi/.config/chromium 2>/dev/null || true
    rm -rf /tmp/kiosk-primary 2>/dev/null || true
    rm -rf /tmp/kiosk-secondary 2>/dev/null || true
    rm -rf /tmp/kiosk-led 2>/dev/null || true  # Rétrocompat: nettoyer l'ancien répertoire

    # Phase 4: Nettoyer les segments de mémoire partagée orphelins (GPU/IPC)
    # Après un SIGKILL, des shm segments peuvent rester et polluer le prochain Chromium
    rm -rf /dev/shm/.org.chromium.* 2>/dev/null || true
    rm -rf /dev/shm/.com.google.* 2>/dev/null || true

    # Synchroniser les écritures disque
    sync

    log "✓ Nettoyage terminé"
}

# Détecte le chemin de Chromium (varie selon la version de Raspberry Pi OS)
detect_chromium_path() {
    if [ -x "/usr/bin/chromium" ]; then
        echo "/usr/bin/chromium"
    elif [ -x "/usr/bin/chromium-browser" ]; then
        echo "/usr/bin/chromium-browser"
    else
        log "❌ ERREUR: Chromium non trouvé"
        exit 1
    fi
}

CHROMIUM_BIN=$(detect_chromium_path)

# Lancer Chromium en mode kiosk
start_chromium() {
    log "🚀 Lancement de Chromium (modèle: $PI_MODEL)..."

    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority

    # Features à désactiver — CRITIQUE : Chromium n'accepte qu'un seul --disable-features,
    # le dernier flag écrase les précédents ! On combine donc common + model-specific ici.
    local disable_features="TranslateUI,MediaRouter,XdgDesktopPortal"

    # Flags communs à tous les modèles
    # En mode dual-display, on utilise --app=URL au lieu de --kiosk pour le primaire.
    # --kiosk prend TOUT le bureau X11 virtuel (les deux écrans combinés) et masque
    # la fenêtre du Chromium secondaire. --app= crée une fenêtre contrainte à un seul
    # moniteur, puis xdotool F11 passe en plein écran sur ce moniteur uniquement.
    local common_flags=()
    if [[ "$DUAL_DISPLAY_ACTIVE" == "true" ]]; then
        log "📺 Mode dual-display: primaire en --app= (pas --kiosk, qui couvrirait les 2 écrans)"
        common_flags=(
            --app="${CHROMIUM_URL}"
            --window-position=0,0
            --window-size=${PRIMARY_SCREEN_WIDTH:-1920},${PRIMARY_SCREEN_HEIGHT:-1080}
        )
    else
        common_flags=(
            --kiosk
        )
    fi
    common_flags+=(
        --autoplay-policy=no-user-gesture-required
        --noerrdialogs
        --disable-infobars
        --disable-session-crashed-bubble
        --disable-restore-session-state
        --no-first-run
        --fast
        --fast-start
        --disable-component-update
        --disable-background-networking
        --disable-sync
        --disable-translate
        --disable-cloud-import
        --disable-print-preview
        --disable-hang-monitor
        --disable-popup-blocking
        --enable-features=OverlayScrollbar
        --memory-pressure-off
        --disable-breakpad
        --disable-crash-reporter
        --disable-dev-shm-usage
        --disable-checker-imaging
        --disk-cache-size=1
        --aggressive-cache-discard
        --disable-gpu-shader-disk-cache
        --password-store=basic
        --user-data-dir=/tmp/kiosk-primary
    )

    # Flags spécifiques au modèle
    local gpu_flags=()
    if [[ "$PI_MODEL" == "pi5" ]]; then
        # Pi 5 : Driver V3D natif (Mesa) pour le compositing GPU.
        #
        # Historique des tentatives :
        # - SwiftShader (--use-gl=angle --use-angle=swiftshader) : trop lent, vidéos saccadées
        # - EGL natif avec flags (--use-gl=egl --enable-features=Vulkan) : SharedImageStub errors /5s
        # - --disable-gpu : Skia CPU, mieux que SwiftShader mais encore trop lent
        # - Aucun flag GPU (v3.24.1) : SharedImageBackingFactory crash loop sur vidéo 1080p
        #   Le GPU ne trouve pas de backend pour Y_UV 420 en shared_memory → crash toutes les 5s
        #
        # Solution : Garder le compositing GPU (V3D Mesa) mais désactiver le décodage vidéo
        # hardware qui cause les SharedImage errors. Chromium décode les vidéos en software
        # (assez performant sur Pi 5 quad A76 2.4GHz) et utilise le GPU uniquement pour
        # le compositing/rasterization. Résultat : vidéos fluides sans crash GPU.
        log "📱 Pi 5 détecté: V3D Mesa + décodage vidéo software (évite SharedImage crash)"
        disable_features+=",VaapiVideoDecoder,UseChromeOSDirectVideoDecoder"
        gpu_flags=(
            --ignore-gpu-blocklist
            --enable-gpu-rasterization
            --disable-gpu-memory-buffer-video-frames
        )
    else
        # Pi 4 et antérieurs : utiliser l'accélération GPU hardware
        log "📱 Pi 4 ou antérieur: utilisation de l'accélération GPU hardware"
        gpu_flags=(
            --disable-gpu-driver-bug-workarounds
            --enable-gpu-rasterization
            --enable-zero-copy
            --ignore-gpu-blocklist
            --disable-software-rasterizer
            --disable-gpu-vsync
        )
    fi

    # En mode dual-display, l'URL est dans --app=, pas en argument positionnel
    if [[ "$DUAL_DISPLAY_ACTIVE" == "true" ]]; then
        "$CHROMIUM_BIN" "${common_flags[@]}" "${gpu_flags[@]}" --disable-features="$disable_features" &
    else
        "$CHROMIUM_BIN" "${common_flags[@]}" "${gpu_flags[@]}" --disable-features="$disable_features" "$CHROMIUM_URL" &
    fi

    CHROMIUM_PID=$!
    log "✓ Chromium lancé (PID: $CHROMIUM_PID)"
    write_kiosk_status "running"

    # En mode dual-display, envoyer F11 pour passer en plein écran sur le moniteur primaire
    # (--app= ne fait pas de plein écran automatique, contrairement à --kiosk)
    if [[ "$DUAL_DISPLAY_ACTIVE" == "true" ]]; then
        (
            sleep 4
            local wid
            wid=$(DISPLAY=:0 xdotool search --pid $CHROMIUM_PID 2>/dev/null | head -1)
            if [[ -n "$wid" ]]; then
                DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
                sleep 0.5
                DISPLAY=:0 xdotool key F11 2>/dev/null
                log "✓ Chromium primaire mis en plein écran (F11, WID: $wid)"
            else
                log "⚠️ Impossible de trouver la fenêtre primaire pour F11"
            fi
        ) &
    fi

    # Masquer le curseur souris — ceinture et bretelles
    # unclutter-xfixes (autostart LXDE) est la méthode principale,
    # xdotool est un filet de sécurité si unclutter ne se lance pas
    if command -v xdotool &> /dev/null; then
        sleep 2
        DISPLAY=:0 xdotool mousemove --window "$(xdotool search --name chromium 2>/dev/null | head -1)" 0 0 2>/dev/null || true
        log "🖱️ Curseur déplacé hors écran (fallback)"
    fi
}

# Configurer xrandr pour étendre le bureau sur HDMI 1 et lire la géométrie.
# Détecte les sorties par position (offset +0+0 = primaire), pas par le mot-clé "primary"
# qui n'est pas toujours présent dans la sortie xrandr.
setup_secondary_xrandr() {
    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority

    local xrandr_output
    xrandr_output=$(xrandr --query 2>/dev/null)

    if [[ -z "$xrandr_output" ]]; then
        log "⚠️ xrandr: impossible d'interroger X11"
        return 1
    fi

    # Identifier le primaire (offset +0+0) et le secondaire (offset non-nul)
    # Format xrandr: "HDMI-A-1 connected 1920x1080+0+0" ou "HDMI-A-2 connected 3840x2160+1920+0"
    local primary_output="" secondary_output=""
    while IFS= read -r line; do
        local name geom
        name=$(echo "$line" | awk '{print $1}')
        geom=$(echo "$line" | grep -oP '\d+x\d+\+\d+\+\d+')
        if [[ -n "$geom" ]]; then
            local x_offset
            x_offset=$(echo "$geom" | grep -oP '(?<=\+)\d+(?=\+)')
            if [[ "$x_offset" == "0" ]]; then
                primary_output="$name"
            else
                secondary_output="$name"
            fi
        fi
    done <<< "$(echo "$xrandr_output" | grep -E '^HDMI.* connected [0-9]')"

    if [[ -z "$secondary_output" ]]; then
        log "⚠️ xrandr: aucune sortie HDMI secondaire avec offset non-nul détectée"
        # Essayer d'activer la seconde sortie HDMI
        local inactive_hdmi
        inactive_hdmi=$(echo "$xrandr_output" | grep -E '^HDMI.* connected' | grep -v "$primary_output" | head -1 | awk '{print $1}')
        if [[ -n "$inactive_hdmi" && -n "$primary_output" ]]; then
            log "📺 xrandr: tentative d'activation de $inactive_hdmi à droite de $primary_output"
            xrandr --output "$inactive_hdmi" --auto --right-of "$primary_output" 2>/dev/null || true
            sleep 1
            # Re-lire xrandr après activation
            xrandr_output=$(xrandr --query 2>/dev/null)
            secondary_output=$(echo "$xrandr_output" | grep -E "^${inactive_hdmi} connected" | grep -oP '^\S+')
        fi
    fi

    if [[ -z "$secondary_output" ]]; then
        log "⚠️ xrandr: impossible de trouver une sortie secondaire"
        return 1
    fi

    # Lire la géométrie de la sortie primaire
    # Format: "HDMI-A-1 connected 1920x1080+0+0"
    local pgeom
    pgeom=$(echo "$xrandr_output" | grep -E "^${primary_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    if [[ -n "$pgeom" ]]; then
        PRIMARY_SCREEN_WIDTH=$(echo "$pgeom" | grep -oP '^[0-9]+')
        PRIMARY_SCREEN_HEIGHT=$(echo "$pgeom" | grep -oP '(?<=x)[0-9]+(?=\+)')
    else
        PRIMARY_SCREEN_WIDTH=1920
        PRIMARY_SCREEN_HEIGHT=1080
    fi

    # Lire la géométrie de la sortie secondaire
    # Format: "HDMI-A-2 connected 3840x2160+1920+0"
    local geom
    geom=$(echo "$xrandr_output" | grep -E "^${secondary_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    if [[ -n "$geom" ]]; then
        SECONDARY_SCREEN_WIDTH=$(echo "$geom" | grep -oP '^[0-9]+')
        SECONDARY_SCREEN_HEIGHT=$(echo "$geom" | grep -oP '(?<=x)[0-9]+(?=\+)')
        SECONDARY_X_OFFSET=$(echo "$geom" | grep -oP '(?<=\+)[0-9]+(?=\+)')
    else
        SECONDARY_SCREEN_WIDTH=1920
        SECONDARY_SCREEN_HEIGHT=1080
        SECONDARY_X_OFFSET=1920
    fi

    log "✓ xrandr: ${primary_output} (primaire ${PRIMARY_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT}) + ${secondary_output} (secondaire ${SECONDARY_SCREEN_WIDTH}x${SECONDARY_SCREEN_HEIGHT}+${SECONDARY_X_OFFSET})"
    return 0
}

# Lancer Chromium secondaire sur le second écran (HDMI 1)
start_chromium_secondary() {
    log "🖥️ Lancement de Chromium écran secondaire sur HDMI 1..."

    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority

    # Configurer xrandr avant de lancer Chromium
    if ! setup_secondary_xrandr; then
        log "⚠️ Impossible de configurer xrandr, abandon du lancement secondaire"
        return 1
    fi

    # Features à désactiver — même combine que start_chromium() (un seul --disable-features)
    local disable_features="TranslateUI,MediaRouter,XdgDesktopPortal"

    # Flags identiques au kiosk principal + user-data-dir séparé + positionnement écran 2
    # NOTE: --app=URL au lieu de --kiosk pour le secondaire.
    # --kiosk force le plein écran sur le moniteur principal et ignore --window-position.
    # --app crée une fenêtre sans onglets/barre d'adresse qui respecte le positionnement.
    # On envoie ensuite F11 via xdotool pour passer en vrai plein écran.
    local common_flags=(
        --app="${CHROMIUM_SECONDARY_URL}"
        --autoplay-policy=no-user-gesture-required
        --noerrdialogs
        --disable-infobars
        --disable-session-crashed-bubble
        --disable-restore-session-state
        --no-first-run
        --fast
        --fast-start
        --disable-component-update
        --disable-background-networking
        --disable-sync
        --disable-translate
        --disable-cloud-import
        --disable-print-preview
        --disable-hang-monitor
        --disable-popup-blocking
        --enable-features=OverlayScrollbar
        --memory-pressure-off
        --disable-breakpad
        --disable-crash-reporter
        --disable-dev-shm-usage
        --disable-checker-imaging
        --disk-cache-size=1
        --aggressive-cache-discard
        --disable-gpu-shader-disk-cache
        --password-store=basic
        --user-data-dir=/tmp/kiosk-secondary
        --window-position=${SECONDARY_X_OFFSET:-1920},0
        --window-size=${SECONDARY_SCREEN_WIDTH:-1920},${SECONDARY_SCREEN_HEIGHT:-1080}
    )

    # Mêmes flags GPU que le kiosk principal
    local gpu_flags=()
    if [[ "$PI_MODEL" == "pi5" ]]; then
        disable_features+=",VaapiVideoDecoder,UseChromeOSDirectVideoDecoder"
        gpu_flags=(
            --ignore-gpu-blocklist
            --enable-gpu-rasterization
            --disable-gpu-memory-buffer-video-frames
        )
    else
        gpu_flags=(
            --disable-gpu-driver-bug-workarounds
            --enable-gpu-rasterization
            --enable-zero-copy
            --ignore-gpu-blocklist
            --disable-software-rasterizer
            --disable-gpu-vsync
        )
    fi

    "$CHROMIUM_BIN" "${common_flags[@]}" "${gpu_flags[@]}" --disable-features="$disable_features" &
    SECONDARY_CHROMIUM_PID=$!
    log "✓ Chromium secondaire lancé (PID: $SECONDARY_CHROMIUM_PID)"

    # Attendre que la fenêtre apparaisse puis envoyer F11 pour passer en plein écran
    # --app positionne correctement la fenêtre mais ne la met pas en plein écran
    (
        sleep 4
        local wid
        wid=$(DISPLAY=:0 xdotool search --pid $SECONDARY_CHROMIUM_PID 2>/dev/null | head -1)
        if [[ -n "$wid" ]]; then
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            sleep 0.5
            DISPLAY=:0 xdotool key F11 2>/dev/null
            log "✓ Chromium secondaire mis en plein écran (F11, WID: $wid)"
        else
            log "⚠️ Impossible de trouver la fenêtre secondaire pour F11"
        fi
    ) &
}

# Arrêter le Chromium secondaire
stop_chromium_secondary() {
    if (( SECONDARY_CHROMIUM_PID > 0 )); then
        log "🔴 Arrêt du Chromium secondaire (PID: $SECONDARY_CHROMIUM_PID)..."

        # Arrêt gracieux SIGTERM — même logique que cleanup_chromium()
        # Un SIGKILL direct corrompt l'état GPU V3D partagé avec le Chromium principal.
        kill -TERM "$SECONDARY_CHROMIUM_PID" 2>/dev/null || true
        local wait_count=0
        while kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null && (( wait_count < 10 )); do
            sleep 0.5
            (( wait_count++ ))
        done
        # SIGKILL uniquement si SIGTERM échoue
        if kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
            log "⚠️ Chromium secondaire n'a pas répondu au SIGTERM, SIGKILL..."
            kill -9 "$SECONDARY_CHROMIUM_PID" 2>/dev/null || true
            sleep 1
        fi

        SECONDARY_CHROMIUM_PID=0
        # Nettoyer le user-data-dir temporaire + shm orphelins
        rm -rf /tmp/kiosk-secondary 2>/dev/null || true
        rm -rf /dev/shm/.org.chromium.* 2>/dev/null || true
        # Désactiver la sortie HDMI secondaire dans xrandr
        local secondary_output
        secondary_output=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | grep -v "primary" | head -1 | awk '{print $1}')
        if [[ -n "$secondary_output" ]]; then
            DISPLAY=:0 xrandr --output "$secondary_output" --off 2>/dev/null || true
        fi
        log "✓ Chromium secondaire arrêté"
    fi
}

# Vérifier et gérer le Chromium secondaire
check_secondary_chromium() {
    read_secondary_display_enabled

    if [[ "$SECONDARY_DISPLAY_ENABLED" != "true" ]]; then
        # Écran secondaire désactivé → arrêter le Chromium secondaire si en cours
        if (( SECONDARY_CHROMIUM_PID > 0 )); then
            log "Écran secondaire désactivé dans la config, arrêt du Chromium secondaire"
            stop_chromium_secondary
        fi
        return
    fi

    # Écran secondaire activé → vérifier HDMI 1
    if detect_hdmi1_status; then
        # HDMI 1 connecté → vérifier que le Chromium secondaire tourne
        if (( SECONDARY_CHROMIUM_PID == 0 )) || ! kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
            log "HDMI 1 connecté + écran secondaire activé → lancement du Chromium secondaire"

            # Si le dual-display n'était pas actif avant (ex: HDMI branché à chaud),
            # il faut relancer le primaire en --app= mode pour ne pas couvrir les 2 écrans
            if [[ "$DUAL_DISPLAY_ACTIVE" != "true" ]]; then
                DUAL_DISPLAY_ACTIVE=true
                setup_secondary_xrandr || true
                log "📺 Passage en dual-display: relance du primaire en mode --app= (pas --kiosk)"
                cleanup_chromium
                sleep 1
                start_chromium
            fi

            start_chromium_secondary
        fi
    else
        # HDMI 1 déconnecté → arrêter le Chromium secondaire
        if (( SECONDARY_CHROMIUM_PID > 0 )); then
            log "HDMI 1 déconnecté, arrêt du Chromium secondaire"
            stop_chromium_secondary
        fi
        # Repasser en mode single-display si nécessaire
        if [[ "$DUAL_DISPLAY_ACTIVE" == "true" ]]; then
            DUAL_DISPLAY_ACTIVE=false
            log "📺 Retour en single-display: relance du primaire en mode --kiosk"
            cleanup_chromium
            sleep 1
            start_chromium
        fi
    fi
}

# Vérifier si Chromium affiche une page d'erreur
check_for_crash_page() {
    # Méthode 1: Vérifier le titre de la fenêtre via xdotool
    if command -v xdotool &> /dev/null; then
        local window_name=$(DISPLAY=:0 xdotool getactivewindow getwindowname 2>/dev/null || echo "")

        # Patterns Chromium uniquement — ne PAS utiliser "Error" seul
        # car xdg-desktop-portal et autres fenêtres X11 peuvent contenir
        # "Error" dans leur titre, causant des faux positifs → restart boucle
        if [[ "$window_name" == *"Aw, Snap"* ]] || \
           [[ "$window_name" == *"Oups"* ]] || \
           [[ "$window_name" == *"crashed"* ]] || \
           [[ "$window_name" == *"ERR_"* ]] || \
           [[ "$window_name" == *"Page Unresponsive"* ]]; then
            log "⚠️ Page de crash Chromium détectée: $window_name"
            return 0  # Crash détecté
        fi
    fi

    # Méthode 2: Vérifier les logs Chromium pour les erreurs GPU/mémoire
    if [ -f /home/pi/.config/chromium/chrome_debug.log ]; then
        local recent_errors
        recent_errors=$(tail -100 /home/pi/.config/chromium/chrome_debug.log 2>/dev/null | grep -c "GPU process exited\|Renderer crash\|Out of memory") || recent_errors=0
        if (( recent_errors > 0 )); then
            log "⚠️ Erreurs GPU/mémoire détectées dans les logs Chromium (${recent_errors})"
            return 0  # Crash détecté
        fi
    fi

    # Méthode 3: Vérifier les erreurs GPU driver dans journalctl (AllocateRingBuffer, etc.)
    # Ces erreurs ne sont pas visibles dans chrome_debug.log mais indiquent une défaillance du GPU driver.
    # Sur Pi 5 avec V3D, ces erreurs se produisent quand le GPU ne peut plus allouer de mémoire.
    # Seuil à 3 : Chromium crash après ~5-6 kFatalFailure, il faut détecter avant la mort.
    local gpu_driver_errors
    gpu_driver_errors=$(journalctl -u neopro-kiosk --since "2 minutes ago" --no-pager -q 2>/dev/null | grep -c "AllocateRingBuffer\|kFatalFailure\|GpuChannelMsg_CreateCommandBuffer") || gpu_driver_errors=0
    if (( gpu_driver_errors > 3 )); then
        log "⚠️ Erreurs GPU driver détectées (${gpu_driver_errors} en 2 min): AllocateRingBuffer/kFatalFailure"
        return 0  # Crash détecté
    fi

    return 1  # Pas de crash
}

# Vérifier l'utilisation mémoire
check_memory_pressure() {
    local mem_used=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    local gpu_mem=$(vcgencmd get_mem reloc_total 2>/dev/null | grep -oP '\d+' || echo "0")

    if (( mem_used > MEMORY_THRESHOLD )); then
        log "⚠️ Mémoire système élevée: ${mem_used}%"
        return 0  # Pression mémoire
    fi

    return 1  # Mémoire OK
}

# Vérifier si Chromium est toujours en vie
check_chromium_alive() {
    if ! pgrep -f "chromium.*$CHROMIUM_URL" > /dev/null 2>&1; then
        log "⚠️ Processus Chromium non trouvé"
        return 1  # Chromium mort
    fi
    return 0  # Chromium vivant
}

# Attendre que le serveur X soit disponible (max 60s)
wait_for_x_server() {
    local max_attempts=30
    local attempt=0
    while (( attempt < max_attempts )); do
        if DISPLAY=:0 xdpyinfo > /dev/null 2>&1; then
            log "✓ Serveur X disponible (après ${attempt}×2s)"
            return 0
        fi
        (( attempt++ ))
        sleep 2
    done
    log "❌ Serveur X non disponible après 60s"
    return 1
}

# Fonction principale de surveillance
main() {
    log "═══════════════════════════════════════════════════"
    log "🐕 Démarrage du watchdog Kiosk Neopro"
    log "═══════════════════════════════════════════════════"

    # Attendre que X soit prêt avant de lancer Chromium
    if ! wait_for_x_server; then
        log "⚠️ Serveur X introuvable — Chromium ne pourra pas se lancer"
        log "  Causes possibles: HDMI non branché, display manager non démarré"
        write_kiosk_status "error" "X server not available"
        # Continuer quand même — le watchdog loop réessayera
    fi

    # Lancer un D-Bus session minimal si absent (évite le spam d'erreurs
    # "Failed to connect to the bus" dans journalctl — Chromium fonctionne
    # sans D-Bus mais log des erreurs toutes les ~6 secondes)
    if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
        if command -v dbus-launch &> /dev/null; then
            eval "$(dbus-launch --sh-syntax)" 2>/dev/null || true
            log "✓ D-Bus session lancé (PID: ${DBUS_SESSION_BUS_PID:-?})"
        fi
    fi

    # Premier démarrage
    cleanup_chromium

    # Attendre que nginx serve la webapp (évite un écran blanc si restart en parallèle)
    local nginx_wait=0
    while (( nginx_wait < 15 )); do
        if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://neopro.local/index.html 2>/dev/null | grep -q "200"; then
            log "✓ Nginx prêt (après ${nginx_wait}s)"
            break
        fi
        (( nginx_wait++ ))
        sleep 1
    done
    if (( nginx_wait >= 15 )); then
        log "⚠️ Nginx pas encore prêt après 15s — lancement de Chromium quand même"
    fi

    # Pré-check dual-display AVANT de lancer le primaire.
    # Si le second écran est activé et HDMI 1 connecté, le primaire doit utiliser
    # --app=URL (pas --kiosk) pour ne pas couvrir les deux écrans.
    read_secondary_display_enabled
    if [[ "$SECONDARY_DISPLAY_ENABLED" == "true" ]] && detect_hdmi1_status; then
        DUAL_DISPLAY_ACTIVE=true
        # Configurer xrandr pour connaître les résolutions des deux écrans
        setup_secondary_xrandr || true
        log "📺 Dual-display détecté au démarrage: primaire=${PRIMARY_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT}"
    fi

    start_chromium

    # Vérifier que Nginx sert la bonne version (détection version stale)
    # Attend 5s que Chromium charge, puis compare la version servie vs fichier disque
    (
        sleep 10
        local disk_version=""
        local served_version=""
        if [ -f "${NEOPRO_DIR:-/home/pi/neopro}/webapp/version.json" ]; then
            disk_version=$(python3 -c "import json; print(json.load(open('${NEOPRO_DIR:-/home/pi/neopro}/webapp/version.json'))['version'])" 2>/dev/null || echo "")
        fi
        served_version=$(curl -s --max-time 5 http://neopro.local/version.json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "")

        if [ -n "$disk_version" ] && [ -n "$served_version" ]; then
            if [ "$disk_version" != "$served_version" ]; then
                log "⚠️ VERSION MISMATCH: disque=$disk_version, servie=$served_version — Chromium affiche une ancienne version!"
                log "🔄 Forçage du restart kiosk pour charger la bonne version..."
                cleanup_chromium
                sleep 2
                start_chromium
            else
                log "✓ Version cohérente: $disk_version"
            fi
        elif [ -n "$disk_version" ] && [ -z "$served_version" ]; then
            log "⚠️ Nginx ne sert pas version.json — vérifier que nginx est actif"
        fi
    ) &

    # Lire la config écran secondaire et lancer le Chromium secondaire si nécessaire
    read_secondary_display_enabled
    if [[ "$SECONDARY_DISPLAY_ENABLED" == "true" ]] && detect_hdmi1_status; then
        log "Écran secondaire activé et HDMI 1 connecté — lancement du Chromium secondaire"
        start_chromium_secondary
    fi

    while true; do
        sleep "$CHECK_INTERVAL"

        local need_restart=false
        local reason=""

        # Vérification 1: Chromium est-il en vie ?
        if ! check_chromium_alive; then
            need_restart=true
            reason="Processus mort"
        fi

        # Vérification 2: Fenêtre parasite devant Chromium ?
        # Un processus non-Chromium (ex: VLC, xdg-desktop-portal) peut prendre le focus
        # et masquer entièrement le kiosk Angular. Détection + kill automatique.
        if ! $need_restart && command -v xdotool &> /dev/null; then
            local active_window
            active_window=$(DISPLAY=:0 xdotool getactivewindow getwindowname 2>/dev/null || echo "")
            if [ -n "$active_window" ] && \
               [[ "$active_window" != *"Chromium"* ]] && \
               [[ "$active_window" != *"chromium"* ]] && \
               [[ "$active_window" != *"Neopro"* ]] && \
               [[ "$active_window" != *"neopro"* ]]; then
                log "🚨 FENÊTRE PARASITE détectée: '$active_window' — bloque le kiosk Chromium"
                # Identifier et tuer le processus parasite
                local parasite_wid
                parasite_wid=$(DISPLAY=:0 xdotool getactivewindow 2>/dev/null || echo "")
                if [ -n "$parasite_wid" ]; then
                    local parasite_pid
                    parasite_pid=$(DISPLAY=:0 xdotool getwindowpid "$parasite_wid" 2>/dev/null || echo "")
                    if [ -n "$parasite_pid" ] && (( parasite_pid > 1 )); then
                        log "🔪 Kill du processus parasite PID=$parasite_pid"
                        kill -9 "$parasite_pid" 2>/dev/null || true
                    fi
                    # Fermer la fenêtre X11
                    DISPLAY=:0 xdotool windowclose "$parasite_wid" 2>/dev/null || true
                fi
                # Remettre Chromium au premier plan
                local chromium_wid
                chromium_wid=$(DISPLAY=:0 xdotool search --name "Chromium" 2>/dev/null | head -1 || echo "")
                if [ -n "$chromium_wid" ]; then
                    DISPLAY=:0 xdotool windowactivate "$chromium_wid" 2>/dev/null || true
                    log "✓ Chromium remis au premier plan"
                fi
            fi
        fi

        # Vérification 3: Page de crash ?
        if ! $need_restart && check_for_crash_page; then
            need_restart=true
            reason="Page de crash détectée"
        fi

        # Vérification 4: Pression mémoire ?
        if ! $need_restart && check_memory_pressure; then
            need_restart=true
            reason="Pression mémoire élevée"
        fi

        if $need_restart; then
            log "🔄 Redémarrage nécessaire: $reason"
            write_kiosk_status "crashed" "$reason"
            record_crash

            cleanup_chromium

            # Si trop de crashs récents, attendre plus longtemps
            if too_many_crashes; then
                log "⏳ Trop de crashs récents (${#crash_times[@]}), attente de 60s pour laisser le GPU refroidir..."
                sleep 60
            else
                sleep 5
            fi

            start_chromium
        fi

        # Vérification écran secondaire: lancer/arrêter selon config + HDMI 1
        check_secondary_chromium

        # Mettre à jour le statut kiosk
        write_kiosk_status "running"
    done
}

# Gestion des signaux pour un arrêt propre
trap 'log "Arrêt du watchdog..."; stop_chromium_secondary; cleanup_chromium; [ -n "$DBUS_SESSION_BUS_PID" ] && kill "$DBUS_SESSION_BUS_PID" 2>/dev/null; exit 0' SIGTERM SIGINT

main "$@"
