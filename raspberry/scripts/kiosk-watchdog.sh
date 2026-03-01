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
HDMI_CHECK_INTERVAL=5  # Vérifier le flag HDMI udev toutes les 5 secondes
HDMI_FLAG_FILE="/tmp/hdmi-changed"  # Écrit par neopro-hdmi-notify.sh (udev)

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
PRIMARY_SCREEN_WIDTH=""
PRIMARY_SCREEN_HEIGHT=""

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

# Détecter si HDMI 0 (écran principal) est connecté
detect_hdmi0_status() {
    local status_file=""
    if [[ "$PI_MODEL" == "pi5" ]]; then
        # Pi 5: DRM card1-HDMI-A-1
        status_file="/sys/class/drm/card1-HDMI-A-1/status"
    else
        # Pi 4: DRM card0-HDMI-A-1 (premier HDMI = micro-HDMI gauche)
        status_file="/sys/class/drm/card0-HDMI-A-1/status"
    fi

    if [ -f "$status_file" ]; then
        local status
        status=$(cat "$status_file" 2>/dev/null)
        [[ "$status" == "connected" ]]
        return $?
    fi
    return 1  # Non connecté ou fichier non trouvé
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

# Détecte si l'écran est branché sur le mauvais port HDMI.
# "Mauvais port" = HDMI-1 connecté ET HDMI-0 déconnecté ET le mode dual-display N'est PAS activé.
# Dans ce cas, l'écran devrait être branché sur HDMI-0 (port principal).
detect_wrong_port() {
    # Si le mode dual-display est activé, les deux ports sont valides
    if [[ "$SECONDARY_DISPLAY_ENABLED" == "true" ]]; then
        return 1
    fi
    # Mauvais port = HDMI-1 connecté mais HDMI-0 déconnecté
    if detect_hdmi1_status && ! detect_hdmi0_status; then
        return 0  # Mauvais port détecté
    fi
    return 1
}

# E-23 US-23.2.3: LED pattern helper — signals HDMI status via onboard activity LED
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set_led_pattern() {
    local pattern="$1"
    if [ -x "$SCRIPT_DIR/neopro-led-status.sh" ]; then
        "$SCRIPT_DIR/neopro-led-status.sh" "$pattern" 2>/dev/null || true
    fi
}

# E-23 US-23.2.4: Buzzer helper — audio alert via PWM buzzer on GPIO 18
buzzer_beep() {
    local pattern="$1"
    if [ -x "$SCRIPT_DIR/neopro-buzzer.sh" ]; then
        "$SCRIPT_DIR/neopro-buzzer.sh" "$pattern" 2>/dev/null &
    fi
}

# Flags pour le timer auto-swap et recovery (E-23 US-23.5.4 + US-23.5.5)
WRONG_PORT_DETECTED_AT=0
HDMI_SWAPPED=0
HDMI_SWAP_DELAY=10  # seconds before auto-swap

# E-23 US-23.5.4: Auto-swap HDMI-1 as primary when wrong port detected for HDMI_SWAP_DELAY seconds.
# Uses xrandr to make HDMI-A-2 (HDMI-1) the primary output and reconfigures Chromium.
hdmi_auto_swap() {
    log "🔄 AUTO-SWAP: basculement de HDMI-1 en sortie principale"

    # Identify the HDMI-1 xrandr output name (Pi 5: HDMI-A-2, Pi 4: HDMI-A-2)
    local hdmi1_output
    hdmi1_output=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E '^HDMI.* connected' | grep -v '+0+0' | head -1 | awk '{print $1}')
    if [[ -z "$hdmi1_output" ]]; then
        # Fallback: find any connected HDMI output
        hdmi1_output=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E '^HDMI.* connected' | head -1 | awk '{print $1}')
    fi

    if [[ -z "$hdmi1_output" ]]; then
        log "⚠️ AUTO-SWAP: aucune sortie HDMI connectée trouvée via xrandr"
        return 1
    fi

    # Make HDMI-1 the primary and only output
    DISPLAY=:0 xrandr --output "$hdmi1_output" --primary --auto 2>/dev/null || true
    sleep 1

    # Read the new resolution
    local geom
    geom=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E "^${hdmi1_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    local swap_width swap_height
    swap_width=$(echo "$geom" | grep -oP '^[0-9]+')
    swap_height=$(echo "$geom" | grep -oP '(?<=x)[0-9]+(?=\+)')
    swap_width=${swap_width:-1920}
    swap_height=${swap_height:-1080}

    # Resize the existing Chromium window to fit the new primary
    local wid
    wid=$(DISPLAY=:0 xdotool search --name "Neopro" 2>/dev/null | head -1)
    if [[ -z "$wid" ]]; then
        wid=$(DISPLAY=:0 xdotool search --class "chromium" 2>/dev/null | head -1)
    fi
    if [[ -n "$wid" ]]; then
        DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
        DISPLAY=:0 xdotool windowsize "$wid" "$swap_width" "$swap_height" 2>/dev/null
        log "✓ AUTO-SWAP: Chromium redimensionné ${swap_width}x${swap_height} sur $hdmi1_output"
    else
        log "⚠️ AUTO-SWAP: fenêtre Chromium introuvable, restart nécessaire"
        cleanup_chromium
        start_chromium
    fi

    HDMI_SWAPPED=1
    echo "hdmi_swapped" > /tmp/hdmi-swapped
    rm -f /tmp/hdmi-wrong-port
    log "✓ AUTO-SWAP: HDMI-1 est maintenant le port principal"
}

# E-23 US-23.5.5: Reverse the HDMI auto-swap when HDMI-0 becomes available again.
# Restores HDMI-0 as primary and reconfigures Chromium.
hdmi_reverse_swap() {
    log "🔄 REVERSE-SWAP: retour de HDMI-0 comme sortie principale"

    # Identify the HDMI-0 xrandr output name
    local hdmi0_output
    hdmi0_output=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E '^HDMI.* connected' | head -1 | awk '{print $1}')

    if [[ -z "$hdmi0_output" ]]; then
        log "⚠️ REVERSE-SWAP: HDMI-0 non trouvé via xrandr"
        return 1
    fi

    # Make HDMI-0 primary again
    DISPLAY=:0 xrandr --output "$hdmi0_output" --primary --auto 2>/dev/null || true
    sleep 1

    # Read new resolution
    local geom
    geom=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E "^${hdmi0_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    local restore_width restore_height
    restore_width=$(echo "$geom" | grep -oP '^[0-9]+')
    restore_height=$(echo "$geom" | grep -oP '(?<=x)[0-9]+(?=\+)')
    restore_width=${restore_width:-1920}
    restore_height=${restore_height:-1080}

    # Resize Chromium back to HDMI-0
    local wid
    wid=$(DISPLAY=:0 xdotool search --name "Neopro" 2>/dev/null | head -1)
    if [[ -z "$wid" ]]; then
        wid=$(DISPLAY=:0 xdotool search --class "chromium" 2>/dev/null | head -1)
    fi
    if [[ -n "$wid" ]]; then
        DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
        DISPLAY=:0 xdotool windowsize "$wid" "$restore_width" "$restore_height" 2>/dev/null
        log "✓ REVERSE-SWAP: Chromium repositionné ${restore_width}x${restore_height} sur $hdmi0_output"
    else
        log "⚠️ REVERSE-SWAP: fenêtre Chromium introuvable, restart nécessaire"
        cleanup_chromium
        start_chromium
    fi

    HDMI_SWAPPED=0
    rm -f /tmp/hdmi-swapped
    log "✓ REVERSE-SWAP: HDMI-0 est à nouveau le port principal"
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
    local hdmi0_status="unknown"
    local hdmi1_status="unknown"
    detect_hdmi0_status && hdmi0_status="connected" || hdmi0_status="disconnected"
    detect_hdmi1_status && hdmi1_status="connected" || hdmi1_status="disconnected"
    cat > "$KIOSK_STATUS_FILE" 2>/dev/null <<EOF
{"status":"${status}","chromiumAlive":$(pgrep -f "chromium.*$CHROMIUM_URL" > /dev/null 2>&1 && echo "true" || echo "false"),"restartCount":${#crash_times[@]},"lastEvent":"${now}","reason":"${reason}","pid":${CHROMIUM_PID:-0},"secondaryDisplayEnabled":${SECONDARY_DISPLAY_ENABLED},"secondaryChromiumAlive":${secondary_alive},"hdmi0Status":"${hdmi0_status}","hdmi1Status":"${hdmi1_status}","dualDisplayActive":${DUAL_DISPLAY_ACTIVE:-false},"hdmiFailoverActive":${HDMI_FAILOVER_ACTIVE:-false}}
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

# Arrêter UNIQUEMENT le Chromium primaire (PID-targeted, pour failover dual-display).
# Utilise la même séquence SIGTERM→5s→SIGKILL que cleanup_chromium() pour un arrêt GPU-safe.
# Contrairement à cleanup_chromium(), ne touche PAS au Chromium secondaire.
stop_chromium_primary() {
    if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
        log "🔴 Arrêt du Chromium primaire fantôme (PID: $CHROMIUM_PID)..."

        # Phase 1: SIGTERM — laisse Chromium libérer les ressources GPU V3D
        kill -TERM "$CHROMIUM_PID" 2>/dev/null || true
        local wait_count=0
        while kill -0 "$CHROMIUM_PID" 2>/dev/null && (( wait_count < 10 )); do
            sleep 0.5
            (( wait_count++ ))
        done

        # Phase 2: SIGKILL si toujours en vie
        if kill -0 "$CHROMIUM_PID" 2>/dev/null; then
            log "⚠️ Chromium primaire n'a pas répondu au SIGTERM, SIGKILL..."
            kill -9 "$CHROMIUM_PID" 2>/dev/null || true
            sleep 1
        fi

        CHROMIUM_PID=0
        # Nettoyer le user-data-dir primaire + shm orphelins
        rm -rf /tmp/kiosk-primary 2>/dev/null || true
        rm -rf /dev/shm/.org.chromium.* 2>/dev/null || true
        sync
        log "✓ Chromium primaire arrêté (GPU cleanup OK)"
    fi
}

# E-23 US-23.6.2: Failover — promouvoir le secondaire en mode TV complet quand HDMI-0 est perdu.
# 1. Arrêter le Chromium primaire (fantôme sur HDMI-0 déconnecté)
# 2. Reconfigurer xrandr: HDMI-1 devient primary
# 3. Redimensionner le Chromium secondaire en plein écran
# 4. Écrire le flag failover pour le server Socket.IO
activate_hdmi_failover() {
    log "🔄 FAILOVER: HDMI-0 perdu pendant dual-display, promotion du secondaire..."

    # Phase 1: Arrêter le primaire fantôme AVANT de reconfigurer (GPU cleanup critique)
    stop_chromium_primary

    # Phase 2: Reconfigurer xrandr — HDMI-1 devient le seul écran
    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority
    local secondary_output
    secondary_output=$(xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | head -1 | awk '{print $1}')
    if [[ -n "$secondary_output" ]]; then
        xrandr --output "$secondary_output" --primary 2>/dev/null || true
        log "✓ xrandr: $secondary_output promu en primary"
    fi

    # Phase 3: Redimensionner le Chromium secondaire en plein écran sur HDMI-1
    if (( SECONDARY_CHROMIUM_PID > 0 )) && kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
        local wid
        wid=$(DISPLAY=:0 xdotool search --pid "$SECONDARY_CHROMIUM_PID" 2>/dev/null | head -1)
        if [[ -n "$wid" ]]; then
            DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
            DISPLAY=:0 xdotool windowsize "$wid" "${SECONDARY_SCREEN_WIDTH:-1920}" "${SECONDARY_SCREEN_HEIGHT:-1080}" 2>/dev/null
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ Chromium secondaire promu en plein écran principal"
        fi
    fi

    # Phase 4: Écrire le flag failover pour le server Socket.IO
    echo "failover_active" > /tmp/hdmi-failover-active

    HDMI_FAILOVER_ACTIVE=true
    DUAL_DISPLAY_ACTIVE=false
    log "✓ FAILOVER activé: secondaire = TV mode complet"
}

# E-23 US-23.6.2: Retour du failover — HDMI-0 est de retour, restaurer le dual-display.
# 1. Relancer le Chromium primaire sur HDMI-0
# 2. Reconfigurer xrandr dual-display
# 3. Repositionner le Chromium secondaire
# 4. Supprimer le flag failover
deactivate_hdmi_failover() {
    log "🔄 RETOUR FAILOVER: HDMI-0 de retour, restauration du dual-display..."

    HDMI_FAILOVER_ACTIVE=false
    rm -f /tmp/hdmi-failover-active

    # Le primaire a été arrêté pendant le failover.
    # Au prochain tour de boucle, le watchdog verra CHROMIUM_PID=0 et relancera start_chromium().
    # Le check_secondary_chromium() verra HDMI-1 connecté + SECONDARY_DISPLAY_ENABLED → relancera le dual.
    # Pas besoin de tout relancer ici, le watchdog s'en occupe naturellement.
    log "✓ Flag failover supprimé — le watchdog relancera le primaire au prochain cycle"
}

# Flag failover
HDMI_FAILOVER_ACTIVE=false

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
    # GCMDriver : désactive Google Cloud Messaging (push notifications internes Chromium).
    # Sans ce flag, Chromium tente de se connecter à mtalk.google.com toutes les 30s
    # et spamme "Failed to connect to MCS endpoint with error -105" quand le WiFi tombe.
    # Neopro n'utilise pas les push notifications Chromium.
    local disable_features="TranslateUI,MediaRouter,XdgDesktopPortal,GCMDriver"

    # Flags communs à tous les modèles
    # TOUJOURS utiliser --app=URL (jamais --kiosk). Raisons :
    # 1. --kiosk prend TOUT le bureau X11 virtuel (les deux écrans combinés)
    #    et masque la fenêtre du Chromium secondaire en dual-display
    # 2. --app= crée une fenêtre sans barre d'adresse qu'on redimensionne
    #    au plein écran par-moniteur via xprop + xdotool windowsize
    # 3. En mode --app=, le passage single↔dual ne nécessite PAS de restart Chromium,
    #    juste un xdotool windowsize (transition zero-blackout)
    # NOTE: F11 ne marche PAS pour le plein écran par-moniteur — il prend aussi tout
    # le bureau X11 virtuel (même comportement que --kiosk). La seule solution fiable
    # est xprop _MOTIF_WM_HINTS (supprimer les décorations) + xdotool windowsize.
    # Runtime guard: si les dimensions sont numériques mais ≤ 0, forcer le fallback
    # Protège contre une régression où PRIMARY_SCREEN_WIDTH=0 bypass ${VAR:-default}
    local w="${PRIMARY_SCREEN_WIDTH:-1920}"
    local h="${PRIMARY_SCREEN_HEIGHT:-1080}"
    if [[ "$w" -le 0 ]] 2>/dev/null || [[ -z "$w" ]]; then w=1920; fi
    if [[ "$h" -le 0 ]] 2>/dev/null || [[ -z "$h" ]]; then h=1080; fi

    local common_flags=(
        --app="${CHROMIUM_URL}"
        --window-position=0,0
        --window-size=${w},${h}
    )
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
            --disable-gpu-vsync
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

    # L'URL est toujours dans --app=, pas en argument positionnel
    "$CHROMIUM_BIN" "${common_flags[@]}" "${gpu_flags[@]}" --disable-features="$disable_features" &

    CHROMIUM_PID=$!
    log "✓ Chromium lancé (PID: $CHROMIUM_PID)"
    write_kiosk_status "running"

    # Forcer le plein écran par-moniteur sur le moniteur primaire via xprop + xdotool.
    # Toujours exécuté car --app= est le mode par défaut (plus de --kiosk).
    # On NE peut PAS utiliser F11 : Chromium F11 = fullscreen sur TOUT le bureau X11 virtuel
    # (= les deux écrans combinés, ex: 5760x2160), pas sur un seul moniteur.
    # Solution : supprimer les décorations de fenêtre (title bar) via xprop _MOTIF_WM_HINTS
    # puis forcer la taille exacte du moniteur primaire via xdotool windowmove/windowsize.
    (
        sleep 4
        local wid
        wid=$(DISPLAY=:0 xdotool search --pid $CHROMIUM_PID 2>/dev/null | head -1)
        if [[ -n "$wid" ]]; then
            # 1. Supprimer les décorations (title bar, bordures)
            DISPLAY=:0 xprop -id "$wid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
            sleep 0.3
            # 2. Positionner et redimensionner exactement sur le moniteur primaire
            DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
            DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-1920}" "${PRIMARY_SCREEN_HEIGHT:-1080}" 2>/dev/null
            # 3. S'assurer que la fenêtre est au premier plan
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ Chromium primaire plein écran par-moniteur (xprop+xdotool, WID: $wid, ${PRIMARY_SCREEN_WIDTH:-1920}x${PRIMARY_SCREEN_HEIGHT:-1080})"
        else
            log "⚠️ Impossible de trouver la fenêtre primaire pour xprop/xdotool"
        fi
    ) &

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
    # GCMDriver : désactive Google Cloud Messaging (push notifications internes Chromium)
    local disable_features="TranslateUI,MediaRouter,XdgDesktopPortal,GCMDriver"

    # Flags identiques au kiosk principal + user-data-dir séparé + positionnement écran 2
    # NOTE: --app=URL au lieu de --kiosk pour le secondaire.
    # --kiosk force le plein écran sur le moniteur principal et ignore --window-position.
    # --app crée une fenêtre sans onglets/barre d'adresse qui respecte le positionnement.
    # Ensuite xprop _MOTIF_WM_HINTS + xdotool windowsize pour le plein écran par-moniteur.
    # F11 ne marche PAS : il prend tout le bureau X11 virtuel, comme --kiosk.
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
            --disable-gpu-vsync
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

    # Forcer le plein écran par-moniteur sur le moniteur secondaire.
    # On NE peut PAS utiliser F11 : Chromium F11 = fullscreen sur TOUT le bureau X11 virtuel
    # (= les deux écrans combinés), pas sur un seul moniteur.
    # Solution : xprop _MOTIF_WM_HINTS (supprimer décorations) + xdotool windowmove/windowsize.
    (
        sleep 4
        local wid
        wid=$(DISPLAY=:0 xdotool search --pid $SECONDARY_CHROMIUM_PID 2>/dev/null | head -1)
        if [[ -n "$wid" ]]; then
            # 1. Supprimer les décorations (title bar, bordures)
            DISPLAY=:0 xprop -id "$wid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
            sleep 0.3
            # 2. Positionner et redimensionner exactement sur le moniteur secondaire
            DISPLAY=:0 xdotool windowmove "$wid" "${SECONDARY_X_OFFSET:-1920}" 0 2>/dev/null
            DISPLAY=:0 xdotool windowsize "$wid" "${SECONDARY_SCREEN_WIDTH:-1920}" "${SECONDARY_SCREEN_HEIGHT:-1080}" 2>/dev/null
            # 3. S'assurer que la fenêtre est au premier plan
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ Chromium secondaire plein écran par-moniteur (xprop+xdotool, WID: $wid, ${SECONDARY_SCREEN_WIDTH:-1920}x${SECONDARY_SCREEN_HEIGHT:-1080}+${SECONDARY_X_OFFSET:-1920})"
        else
            log "⚠️ Impossible de trouver la fenêtre secondaire pour xprop/xdotool"
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

    # E-23 US-23.6.2: Failover — si HDMI-0 perdu pendant dual-display et HDMI-1 encore connecté
    if [[ "$DUAL_DISPLAY_ACTIVE" == "true" ]] && ! detect_hdmi0_status && detect_hdmi1_status; then
        log "⚠️ HDMI-0 perdu pendant dual-display, HDMI-1 encore connecté"
        activate_hdmi_failover
        return
    fi

    # E-23 US-23.6.2: Retour failover — HDMI-0 de retour pendant le failover
    if [[ "$HDMI_FAILOVER_ACTIVE" == "true" ]] && detect_hdmi0_status; then
        deactivate_hdmi_failover
        return
    fi

    # Si failover actif, ne pas gérer le dual-display normalement
    if [[ "$HDMI_FAILOVER_ACTIVE" == "true" ]]; then
        return
    fi

    # Écran secondaire activé → vérifier HDMI 1
    if detect_hdmi1_status; then
        # HDMI 1 connecté → vérifier que le Chromium secondaire tourne
        if (( SECONDARY_CHROMIUM_PID == 0 )) || ! kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
            log "HDMI 1 connecté + écran secondaire activé → lancement du Chromium secondaire"

            # Le primaire est toujours en --app= mode, donc PAS besoin de le relancer.
            # On configure juste xrandr et on redimensionne via xdotool (zero-blackout).
            if [[ "$DUAL_DISPLAY_ACTIVE" != "true" ]]; then
                DUAL_DISPLAY_ACTIVE=true
                setup_secondary_xrandr || true
                log "📺 Passage en dual-display: redimensionnement du primaire (sans restart)"
                # Redimensionner le primaire pour la nouvelle résolution (si elle a changé)
                if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
                    local wid
                    wid=$(DISPLAY=:0 xdotool search --pid "$CHROMIUM_PID" 2>/dev/null | head -1)
                    if [[ -n "$wid" ]]; then
                        DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
                        DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-1920}" "${PRIMARY_SCREEN_HEIGHT:-1080}" 2>/dev/null
                        log "✓ Primaire redimensionné pour dual-display (${PRIMARY_SCREEN_WIDTH:-1920}x${PRIMARY_SCREEN_HEIGHT:-1080})"
                    fi
                fi
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
            log "📺 Retour en single-display: redimensionnement du primaire (sans restart)"
            # Le primaire est déjà en --app= mode, on le redimensionne en plein écran
            if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
                local wid
                wid=$(DISPLAY=:0 xdotool search --pid "$CHROMIUM_PID" 2>/dev/null | head -1)
                if [[ -n "$wid" ]]; then
                    DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
                    DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-1920}" "${PRIMARY_SCREEN_HEIGHT:-1080}" 2>/dev/null
                    log "✓ Primaire redimensionné pour single-display (${PRIMARY_SCREEN_WIDTH:-1920}x${PRIMARY_SCREEN_HEIGHT:-1080})"
                fi
            fi
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
    # Le primaire utilise toujours --app=URL, mais on configure xrandr en amont
    # si un second écran est détecté pour connaître les résolutions des deux moniteurs.
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
        # Attente interruptible: au lieu de dormir CHECK_INTERVAL d'un bloc,
        # on dort par tranches de HDMI_CHECK_INTERVAL secondes.
        # Si le flag udev HDMI apparaît, on sort immédiatement pour traiter.
        local waited=0
        local hdmi_triggered=false
        while (( waited < CHECK_INTERVAL )); do
            sleep "$HDMI_CHECK_INTERVAL"
            waited=$((waited + HDMI_CHECK_INTERVAL))
            if [ -f "$HDMI_FLAG_FILE" ]; then
                rm -f "$HDMI_FLAG_FILE"
                hdmi_triggered=true
                log "⚡ HDMI hotplug détecté (udev) — vérification immédiate"
                break
            fi
        done

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

        # Détection mauvais port HDMI (écran sur HDMI-1 au lieu de HDMI-0)
        if detect_wrong_port; then
            if (( WRONG_PORT_DETECTED_AT == 0 )); then
                WRONG_PORT_DETECTED_AT=$(date +%s)
                log "⚠️ MAUVAIS PORT HDMI: écran détecté sur HDMI-1 mais pas sur HDMI-0"
                log "   → L'écran devrait être branché sur le port HDMI principal (HDMI-0)"
                # Écrire le flag pour le server (alerting)
                echo "wrong_port" > /tmp/hdmi-wrong-port
                # E-23 US-23.2.3: LED fast blink pour mauvais port
                set_led_pattern "fast-blink"
                # E-23 US-23.2.4: Buzzer double beep pour mauvais port
                buzzer_beep "double"
            fi

            # E-23 US-23.5.4: Auto-swap après HDMI_SWAP_DELAY secondes
            if (( WRONG_PORT_DETECTED_AT > 0 && HDMI_SWAPPED == 0 )); then
                local now_swap=$(date +%s)
                local elapsed=$(( now_swap - WRONG_PORT_DETECTED_AT ))
                if (( elapsed >= HDMI_SWAP_DELAY )); then
                    hdmi_auto_swap
                fi
            fi
        else
            if (( WRONG_PORT_DETECTED_AT > 0 )); then
                WRONG_PORT_DETECTED_AT=0
                rm -f /tmp/hdmi-wrong-port
                log "✓ Port HDMI correct (ou dual-display activé)"
                # E-23 US-23.2.3: Restore normal LED
                set_led_pattern "heartbeat"
            fi

            # E-23 US-23.5.5: Reverse swap quand HDMI-0 revient
            if (( HDMI_SWAPPED == 1 )) && detect_hdmi0_status; then
                log "📺 HDMI-0 redétecté pendant auto-swap — lancement du retour"
                hdmi_reverse_swap
            fi
        fi

        # E-23 US-23.2.3 + US-23.2.4: LED slow blink + buzzer triple quand aucun écran
        if ! detect_hdmi0_status && ! detect_hdmi1_status; then
            set_led_pattern "slow-blink"
            # Only beep once on first detection (avoid repeated beeps every loop iteration)
            if [ ! -f /tmp/hdmi-no-screen-beeped ]; then
                buzzer_beep "triple"
                touch /tmp/hdmi-no-screen-beeped
            fi
        else
            rm -f /tmp/hdmi-no-screen-beeped
        fi

        # Mettre à jour le statut kiosk
        write_kiosk_status "running"
    done
}

# Gestion des signaux pour un arrêt propre
trap 'log "Arrêt du watchdog..."; stop_chromium_secondary; cleanup_chromium; [ -n "$DBUS_SESSION_BUS_PID" ] && kill "$DBUS_SESSION_BUS_PID" 2>/dev/null; exit 0' SIGTERM SIGINT

main "$@"
