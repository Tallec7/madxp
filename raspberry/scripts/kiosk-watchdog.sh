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

CHROMIUM_URL="http://localhost/tv"
CHROMIUM_SECONDARY_URL="http://localhost/secondary"
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

# Résolution de dernier recours — utilisée uniquement quand xrandr ET EDID échouent
DEFAULT_SCREEN_WIDTH=1920
DEFAULT_SCREEN_HEIGHT=1080
# Raison du fallback (vide = résolution native détectée, sinon = mode dégradé)
DISPLAY_FALLBACK_REASON=""

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
LAST_HDMI_TRANSITION=""
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

# Cascade de détection de la résolution optimale d'un écran.
# Essaie 4 sources dans l'ordre pour obtenir la résolution native de la TV :
#   1. xrandr geometry    → résolution actuelle (configurée par --auto = préférée)
#   2. xrandr mode list   → mode préféré (marqué "+" dans la liste des modes)
#   3. EDID native        → DTD 1 via edid-decode sur /sys/class/drm/
#   4. Constante default  → DEFAULT_SCREEN_WIDTH × DEFAULT_SCREEN_HEIGHT (dernier recours)
#
# Usage: get_output_resolution "HDMI-A-1" "$xrandr_output"
# Stdout: "1920x1080" (ou la résolution native détectée)
# Return: 0 = résolution détectée, 1 = fallback default utilisé
#
# NOTE: grep -oP utilise les PCRE (Perl regex) pour les lookbehind (?<=...).
# Disponible sur Raspberry Pi OS (GNU grep compilé avec --enable-perl-regexp).
get_output_resolution() {
    local output="$1"
    local xrandr_out="$2"

    # 1. Géométrie xrandr (résolution actuelle, sélectionnée par --auto = mode préféré)
    local geom
    geom=$(echo "$xrandr_out" | grep -E "^${output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    if [[ -n "$geom" ]]; then
        local w h
        w=$(echo "$geom" | grep -oP '^[0-9]+')
        h=$(echo "$geom" | grep -oP '(?<=x)[0-9]+(?=\+)')
        if [[ "$w" -gt 0 && "$h" -gt 0 ]] 2>/dev/null; then
            echo "${w}x${h}"
            return 0
        fi
    fi

    # 2. Mode préféré xrandr (marqué "+" dans la liste des modes)
    #    Utile quand l'écran est "connected" mais pas encore configuré (pas de geometry)
    #    Format: "   1920x1080     60.00*+"  → le "+" indique le mode préféré de la TV
    local preferred_res
    preferred_res=$(echo "$xrandr_out" \
        | sed -n "/^${output} connected/,/^[^ ]/p" \
        | tail -n +2 \
        | grep -E '[0-9.]+\+' \
        | head -1 \
        | grep -oP '^\s+\K[0-9]+x[0-9]+')
    if [[ -n "$preferred_res" ]]; then
        log "📺 ${output}: résolution préférée détectée via xrandr mode list: ${preferred_res}"
        echo "$preferred_res"
        return 0
    fi

    # 3. Résolution native via EDID (DTD 1 du fichier sysfs)
    #    Le path DRM correspond au nom xrandr: HDMI-A-1 → card*-HDMI-A-1
    local drm_connector edid_native
    drm_connector=$(find /sys/class/drm -maxdepth 1 -name "card*-${output}" 2>/dev/null | head -1)
    if [[ -n "$drm_connector" && -f "${drm_connector}/edid" ]]; then
        if command -v edid-decode &>/dev/null; then
            edid_native=$(edid-decode "${drm_connector}/edid" 2>/dev/null \
                | grep -oP 'DTD\s+1:\s+\K[0-9]+x[0-9]+' | head -1)
            if [[ -n "$edid_native" ]]; then
                log "📺 ${output}: résolution native détectée via EDID: ${edid_native}"
                echo "$edid_native"
                return 0
            fi
        fi
    fi

    # 4. Dernier recours — constante par défaut
    log "⚠️ ${output}: résolution non détectable, fallback ${DEFAULT_SCREEN_WIDTH}x${DEFAULT_SCREEN_HEIGHT}"
    echo "${DEFAULT_SCREEN_WIDTH}x${DEFAULT_SCREEN_HEIGHT}"
    return 1
}

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

    # Read the new resolution via cascade (xrandr geometry → preferred → EDID → default)
    local xrandr_after swap_res swap_width swap_height
    xrandr_after=$(DISPLAY=:0 xrandr --query 2>/dev/null)
    swap_res=$(get_output_resolution "$hdmi1_output" "$xrandr_after")
    swap_width="${swap_res%x*}"
    swap_height="${swap_res#*x}"

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

    # Read new resolution via cascade (xrandr geometry → preferred → EDID → default)
    local xrandr_after restore_res restore_width restore_height
    xrandr_after=$(DISPLAY=:0 xrandr --query 2>/dev/null)
    restore_res=$(get_output_resolution "$hdmi0_output" "$xrandr_after")
    restore_width="${restore_res%x*}"
    restore_height="${restore_res#*x}"

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

# Vérifie que Chromium primaire est la fenêtre active (au-dessus de lxpanel).
# Après un changement xrandr (single→dual, failover return), le WM peut restacker
# lxpanel au premier plan → barre de tâches visible sur l'écran TV.
# Retourne "ok" si Chromium est au premier plan, "panel_above" si lxpanel est devant.
WINDOW_STACKING_STATUS="ok"
check_window_stacking() {
    if (( CHROMIUM_PID == 0 )) || ! kill -0 "$CHROMIUM_PID" 2>/dev/null; then
        WINDOW_STACKING_STATUS="no_chromium"
        return 1
    fi
    local active_name
    active_name=$(DISPLAY=:0 xdotool getactivewindow getwindowname 2>/dev/null || true)
    if [[ -z "$active_name" ]]; then
        WINDOW_STACKING_STATUS="unknown"
        return 0
    fi
    # Si la fenêtre active contient "panel" ou "lxpanel" → lxpanel est devant Chromium
    if echo "$active_name" | grep -qi "panel"; then
        WINDOW_STACKING_STATUS="panel_above"
        log "⚠️ STACKING: lxpanel est au-dessus de Chromium — re-raise automatique"
        # Auto-recovery: re-raise Chromium immédiatement
        local wid
        wid=$(DISPLAY=:0 xdotool search --pid "$CHROMIUM_PID" 2>/dev/null | head -1)
        if [[ -n "$wid" ]]; then
            DISPLAY=:0 xprop -id "$wid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ STACKING: Chromium re-raised au premier plan (auto-recovery)"
            WINDOW_STACKING_STATUS="recovered"
        fi
        return 1
    fi
    WINDOW_STACKING_STATUS="ok"
    return 0
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
{"status":"${status}","chromiumAlive":$(pgrep -f "chromium.*$CHROMIUM_URL" > /dev/null 2>&1 && echo "true" || echo "false"),"restartCount":${#crash_times[@]},"lastEvent":"${now}","reason":"${reason}","pid":${CHROMIUM_PID:-0},"secondaryDisplayEnabled":${SECONDARY_DISPLAY_ENABLED},"secondaryChromiumAlive":${secondary_alive},"hdmi0Status":"${hdmi0_status}","hdmi1Status":"${hdmi1_status}","dualDisplayActive":${DUAL_DISPLAY_ACTIVE:-false},"hdmiFailoverActive":${HDMI_FAILOVER_ACTIVE:-false},"displayFallback":"${DISPLAY_FALLBACK_REASON}","lastHdmiTransition":"${LAST_HDMI_TRANSITION:-}","windowStacking":"${WINDOW_STACKING_STATUS:-unknown}","primaryResolution":"${PRIMARY_SCREEN_WIDTH:+${PRIMARY_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT}}","secondaryResolution":"${SECONDARY_SCREEN_WIDTH:+${SECONDARY_SCREEN_WIDTH}x${SECONDARY_SCREEN_HEIGHT}}"}
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
    local secondary_output primary_ghost
    secondary_output=$(xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | head -1 | awk '{print $1}')
    primary_ghost=$(xrandr --query 2>/dev/null | grep -E "^HDMI.* disconnected" | head -1 | awk '{print $1}')
    if [[ -n "$secondary_output" ]]; then
        # Désactiver la sortie fantôme (HDMI-0) pour que le layout X11 se collapse
        if [[ -n "$primary_ghost" ]]; then
            xrandr --output "$primary_ghost" --off 2>/dev/null || true
            log "✓ xrandr: $primary_ghost désactivé (ghost)"
        fi
        # Repositionner HDMI-1 à l'origine (sinon reste à +1920+0 du dual-display)
        xrandr --output "$secondary_output" --primary --auto --pos 0x0 2>/dev/null || true
        log "✓ xrandr: $secondary_output promu en primary à +0+0"
        # GPU DRM a besoin de ~500ms pour appliquer le changement de mode
        sleep 1
        # Re-lire les dimensions réelles après reconfiguration
        local new_geom failover_w failover_h
        new_geom=$(xrandr --query 2>/dev/null | grep -E "^${secondary_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
        if [[ -n "$new_geom" ]]; then
            failover_w=$(echo "$new_geom" | grep -oP '^[0-9]+')
            failover_h=$(echo "$new_geom" | grep -oP '(?<=x)[0-9]+(?=\+)')
        else
            failover_w="${SECONDARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}"
            failover_h="${SECONDARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}"
        fi
    else
        local failover_w="${SECONDARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}"
        local failover_h="${SECONDARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}"
    fi

    # Phase 3: Tuer l'ancien secondaire et relancer un Chromium frais en plein écran
    # xdotool windowsize seul ne force pas Chromium à re-renderer le viewport CSS interne
    # (la fenêtre X11 grandit mais le contenu reste à 1920x1080).
    # Relancer avec --window-size=WxH garanti un viewport correct dès le départ.
    if (( SECONDARY_CHROMIUM_PID > 0 )) && kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
        log "🔴 Arrêt du Chromium secondaire pour relance en plein écran..."
        kill -TERM "$SECONDARY_CHROMIUM_PID" 2>/dev/null || true
        local wait_count=0
        while kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null && (( wait_count < 10 )); do
            sleep 0.5
            (( wait_count++ ))
        done
        if kill -0 "$SECONDARY_CHROMIUM_PID" 2>/dev/null; then
            kill -9 "$SECONDARY_CHROMIUM_PID" 2>/dev/null || true
            sleep 1
        fi
        SECONDARY_CHROMIUM_PID=0
        rm -rf /tmp/kiosk-secondary 2>/dev/null || true
        log "✓ Ancien Chromium secondaire arrêté"
    fi

    # Relancer un Chromium primaire (--kiosk) en plein écran sur l'écran restant
    # On met à jour les dimensions primaire avant de lancer
    PRIMARY_SCREEN_WIDTH="${failover_w}"
    PRIMARY_SCREEN_HEIGHT="${failover_h}"
    start_chromium
    sleep 2

    # Phase 4: Écrire le flag failover pour le server Socket.IO
    echo "failover_active" > /tmp/hdmi-failover-active

    HDMI_FAILOVER_ACTIVE=true
    DUAL_DISPLAY_ACTIVE=false
    log "✓ FAILOVER activé: Chromium relancé en plein écran (${failover_w}x${failover_h})"
}

# E-23 US-23.6.2: Retour du failover — HDMI-0 est de retour, restaurer le dual-display.
# 1. Relancer le Chromium primaire sur HDMI-0
# 2. Reconfigurer xrandr dual-display
# 3. Repositionner le Chromium secondaire
# 4. Supprimer le flag failover
deactivate_hdmi_failover() {
    log "🔄 RETOUR FAILOVER: HDMI-0 de retour, restauration proactive du dual-display..."

    HDMI_FAILOVER_ACTIVE=false
    rm -f /tmp/hdmi-failover-active

    export DISPLAY=:0
    export XAUTHORITY=/home/pi/.Xauthority

    # 1. Arrêter le Chromium du failover (lancé via start_chromium → CHROMIUM_PID)
    if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
        log "🔴 Arrêt du Chromium failover (PID: $CHROMIUM_PID)..."
        kill -TERM "$CHROMIUM_PID" 2>/dev/null || true
        local wait_count=0
        while kill -0 "$CHROMIUM_PID" 2>/dev/null && (( wait_count < 10 )); do
            sleep 0.5
            (( wait_count++ ))
        done
        if kill -0 "$CHROMIUM_PID" 2>/dev/null; then
            kill -9 "$CHROMIUM_PID" 2>/dev/null || true
            sleep 1
        fi
        CHROMIUM_PID=0
        rm -rf /tmp/kiosk-primary 2>/dev/null || true
        log "✓ Chromium failover arrêté"
    fi

    # 2. Reconfigurer xrandr pour dual-display
    setup_secondary_xrandr || true
    sleep 1

    # 3. Relancer le primaire sur HDMI-0
    log "🚀 Relance du Chromium primaire..."
    start_chromium
    sleep 2

    # 4. Relancer le secondaire sur HDMI-1
    DUAL_DISPLAY_ACTIVE=true
    if detect_hdmi1_status; then
        # Redimensionner le primaire pour le dual-display
        if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
            local wid
            wid=$(DISPLAY=:0 xdotool search --pid "$CHROMIUM_PID" 2>/dev/null | head -1)
            if [[ -n "$wid" ]]; then
                # Re-appliquer xprop + raise après xrandr (même raison que transition single→dual)
                DISPLAY=:0 xprop -id "$wid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
                DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
                DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}" "${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}" 2>/dev/null
                DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
                log "✓ Primaire redimensionné pour dual-display (${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT})"
            fi
        fi
        start_chromium_secondary
        log "✓ RETOUR FAILOVER complet: dual-display restauré"
    else
        log "⚠️ HDMI-1 non détecté — primaire seul restauré"
        DUAL_DISPLAY_ACTIVE=false
    fi
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
    local w="${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}"
    local h="${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}"
    if [[ "$w" -le 0 ]] 2>/dev/null || [[ -z "$w" ]]; then w=$DEFAULT_SCREEN_WIDTH; fi
    if [[ "$h" -le 0 ]] 2>/dev/null || [[ -z "$h" ]]; then h=$DEFAULT_SCREEN_HEIGHT; fi

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
            DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}" "${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}" 2>/dev/null
            # 3. S'assurer que la fenêtre est au premier plan
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ Chromium primaire plein écran par-moniteur (xprop+xdotool, WID: $wid, ${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT})"
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

    # Retry xrandr — la TV peut mettre 2-6s à négocier l'EDID après un branchement
    local xrandr_output="" attempt=0
    while (( attempt < 3 )); do
        xrandr_output=$(xrandr --query 2>/dev/null)
        if [[ -n "$xrandr_output" ]] && echo "$xrandr_output" | grep -qE '^HDMI.* connected [0-9]'; then
            break
        fi
        log "⚠️ xrandr: EDID en cours (tentative $((attempt+1))/3)"
        (( attempt++ ))
        sleep 2
    done

    if [[ -z "$xrandr_output" ]]; then
        log "⚠️ xrandr: impossible d'interroger X11"
        return 1
    fi

    # Identifier le primaire (offset +0+0) et le secondaire (offset non-nul)
    # Format xrandr: "HDMI-A-1 connected 1920x1080+0+0" ou "HDMI-A-2 connected 3840x2160+1920+0"
    # NOTE: grep -oP utilise les PCRE pour les lookbehind — dispo sur Raspberry Pi OS (GNU grep)
    local primary_output="" secondary_output=""
    while IFS= read -r line; do
        local name geom
        name=$(echo "$line" | awk '{print $1}')
        geom=$(echo "$line" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
        if [[ -n "$geom" ]]; then
            local x_offset
            x_offset=$(echo "$geom" | grep -oP '(?<=\+)[0-9]+(?=\+)')
            if [[ "$x_offset" == "0" ]]; then
                primary_output="$name"
            else
                secondary_output="$name"
            fi
        fi
    done <<< "$(echo "$xrandr_output" | grep -E '^HDMI.* connected (primary )?[0-9]')"

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

    # Résolution primaire via cascade (xrandr geometry → preferred → EDID → default)
    DISPLAY_FALLBACK_REASON=""
    local primary_res
    if primary_res=$(get_output_resolution "$primary_output" "$xrandr_output"); then
        : # résolution native détectée
    else
        DISPLAY_FALLBACK_REASON="primary: xrandr+EDID unavailable"
    fi
    PRIMARY_SCREEN_WIDTH="${primary_res%x*}"
    PRIMARY_SCREEN_HEIGHT="${primary_res#*x}"

    # Résolution secondaire via même cascade
    local secondary_res
    if secondary_res=$(get_output_resolution "$secondary_output" "$xrandr_output"); then
        : # résolution native détectée
    else
        DISPLAY_FALLBACK_REASON="${DISPLAY_FALLBACK_REASON:+$DISPLAY_FALLBACK_REASON, }secondary: xrandr+EDID unavailable"
    fi
    SECONDARY_SCREEN_WIDTH="${secondary_res%x*}"
    SECONDARY_SCREEN_HEIGHT="${secondary_res#*x}"

    # Offset secondaire = largeur réelle du primaire (dérivée, pas hardcodée)
    local primary_geom
    primary_geom=$(echo "$xrandr_output" | grep -E "^${primary_output} connected" | grep -oP '[0-9]+x[0-9]+\+[0-9]+\+[0-9]+')
    SECONDARY_X_OFFSET=$(echo "$primary_geom" | grep -oP '^[0-9]+')
    SECONDARY_X_OFFSET="${SECONDARY_X_OFFSET:-$PRIMARY_SCREEN_WIDTH}"

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
        --window-position=${SECONDARY_X_OFFSET:-$DEFAULT_SCREEN_WIDTH},0
        --window-size=${SECONDARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH},${SECONDARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}
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
            DISPLAY=:0 xdotool windowmove "$wid" "${SECONDARY_X_OFFSET:-$DEFAULT_SCREEN_WIDTH}" 0 2>/dev/null
            DISPLAY=:0 xdotool windowsize "$wid" "${SECONDARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}" "${SECONDARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}" 2>/dev/null
            # 3. S'assurer que la fenêtre est au premier plan
            DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
            log "✓ Chromium secondaire plein écran par-moniteur (xprop+xdotool, WID: $wid, ${SECONDARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}x${SECONDARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}+${SECONDARY_X_OFFSET:-$DEFAULT_SCREEN_WIDTH})"
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
        # Désactiver la sortie HDMI secondaire dans xrandr UNIQUEMENT si le câble est
        # encore physiquement branché (désactivé par config, pas par débranchement).
        # Si le câble est déjà débranché, le kernel DRM l'a déjà marqué "disconnected".
        # Faire un xrandr --off dans ce cas force une reconfiguration DRM inutile qui
        # peut brièvement déstabiliser le statut de HDMI-0 dans sysfs
        # (race condition kernel → hdmi0=false transitoire → écran primaire affiche
        # "En attente d'écran" pendant quelques secondes).
        if detect_hdmi1_status; then
            local secondary_output
            secondary_output=$(DISPLAY=:0 xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | grep -v "primary" | head -1 | awk '{print $1}')
            if [[ -n "$secondary_output" ]]; then
                DISPLAY=:0 xrandr --output "$secondary_output" --off 2>/dev/null || true
            fi
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
                LAST_HDMI_TRANSITION="single_to_dual:$(date -u +%Y-%m-%dT%H:%M:%SZ)"
                setup_secondary_xrandr || true
                log "📺 Passage en dual-display: redimensionnement du primaire (sans restart)"
                # Redimensionner le primaire pour la nouvelle résolution (si elle a changé)
                if (( CHROMIUM_PID > 0 )) && kill -0 "$CHROMIUM_PID" 2>/dev/null; then
                    local wid
                    wid=$(DISPLAY=:0 xdotool search --pid "$CHROMIUM_PID" 2>/dev/null | head -1)
                    if [[ -n "$wid" ]]; then
                        # Re-appliquer xprop + raise : xrandr reconfigure le layout X11,
                        # le WM (openbox/LXDE) peut restacker lxpanel au-dessus de Chromium.
                        # Sans xprop + windowactivate, la barre de tâches reste visible.
                        DISPLAY=:0 xprop -id "$wid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
                        DISPLAY=:0 xdotool windowmove "$wid" 0 0 2>/dev/null
                        DISPLAY=:0 xdotool windowsize "$wid" "${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}" "${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT}" 2>/dev/null
                        DISPLAY=:0 xdotool windowactivate "$wid" 2>/dev/null
                        log "✓ Primaire redimensionné pour dual-display (${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT})"
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
            log "📺 Retour en single-display: relance du Chromium primaire"

            # xdotool windowsize seul ne force PAS Chromium à re-renderer le viewport CSS
            # (la fenêtre X11 change mais le contenu interne reste à l'ancienne résolution).
            # Même bug que corrigé dans activate_hdmi_failover() — la seule solution fiable
            # est de relancer Chromium avec --window-size=WxH pour un viewport correct.

            # Re-lire la résolution primaire après suppression du secondaire xrandr
            export DISPLAY=:0
            export XAUTHORITY=/home/pi/.Xauthority
            local primary_output_name primary_geom_single
            primary_output_name=$(xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | head -1 | awk '{print $1}')
            if [[ -n "$primary_output_name" ]]; then
                local xr_out
                xr_out=$(xrandr --query 2>/dev/null)
                local single_res
                if single_res=$(get_output_resolution "$primary_output_name" "$xr_out"); then
                    PRIMARY_SCREEN_WIDTH="${single_res%x*}"
                    PRIMARY_SCREEN_HEIGHT="${single_res#*x}"
                    log "✓ Résolution primaire re-détectée: ${PRIMARY_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT}"
                fi
            fi

            # Arrêter le Chromium primaire proprement puis relancer
            stop_chromium_primary
            sleep 1
            start_chromium
            LAST_HDMI_TRANSITION="dual_to_single_relaunch:$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            write_kiosk_status "running"
            log "✓ Chromium primaire relancé en single-display (${PRIMARY_SCREEN_WIDTH:-$DEFAULT_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT:-$DEFAULT_SCREEN_HEIGHT})"
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
        if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost/index.html 2>/dev/null | grep -q "200"; then
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
    else
        # Single-display: détecter la résolution réelle du primaire pour le heartbeat
        local primary_out_name
        primary_out_name=$(xrandr --query 2>/dev/null | grep -E "^HDMI.* connected" | head -1 | awk '{print $1}')
        if [[ -n "$primary_out_name" ]]; then
            local xr_single
            xr_single=$(xrandr --query 2>/dev/null)
            local boot_res
            if boot_res=$(get_output_resolution "$primary_out_name" "$xr_single"); then
                PRIMARY_SCREEN_WIDTH="${boot_res%x*}"
                PRIMARY_SCREEN_HEIGHT="${boot_res#*x}"
                log "📺 Single-display: résolution primaire détectée ${PRIMARY_SCREEN_WIDTH}x${PRIMARY_SCREEN_HEIGHT}"
            fi
        fi
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
        served_version=$(curl -s --max-time 5 http://localhost/version.json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "")

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
        # SKIP pendant failover: le primaire est intentionnellement arrêté,
        # le secondaire promu tourne avec un URL différent — check_chromium_alive
        # ne le trouverait pas et déclencherait un restart parasite.
        if [[ "$HDMI_FAILOVER_ACTIVE" != "true" ]] && ! check_chromium_alive; then
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

        # Vérifier que Chromium est bien au premier plan (pas lxpanel devant)
        # Auto-recovery si le WM a restacké les fenêtres après un changement xrandr
        check_window_stacking || true

        # Mettre à jour le statut kiosk
        write_kiosk_status "running"
    done
}

# Gestion des signaux pour un arrêt propre
trap 'log "Arrêt du watchdog..."; stop_chromium_secondary; cleanup_chromium; [ -n "$DBUS_SESSION_BUS_PID" ] && kill "$DBUS_SESSION_BUS_PID" 2>/dev/null; exit 0' SIGTERM SIGINT

main "$@"
