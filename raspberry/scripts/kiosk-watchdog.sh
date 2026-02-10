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
LOG_DIR="/home/pi/neopro/logs"
LOG_FILE="$LOG_DIR/kiosk-watchdog.log"
CHECK_INTERVAL=30  # Vérifier toutes les 30 secondes

# Créer le dossier de logs si nécessaire
mkdir -p "$LOG_DIR" 2>/dev/null || true
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

# Enregistrer un crash
record_crash() {
    crash_times+=("$(date +%s)")
    cleanup_old_crashes
}

# Vérifie si trop de crashs récents
too_many_crashes() {
    cleanup_old_crashes
    (( ${#crash_times[@]} >= MAX_CRASH_COUNT ))
}

# Nettoyer les processus Chromium zombies
cleanup_chromium() {
    log "🧹 Nettoyage des processus Chromium..."
    pkill -9 -f "chromium" 2>/dev/null || true
    pkill -9 -f "chrome" 2>/dev/null || true

    # Attendre que les processus se terminent
    sleep 2

    # Vider le cache Chromium pour libérer de la mémoire
    rm -rf /home/pi/.cache/chromium/Default/Cache/* 2>/dev/null || true
    rm -rf /home/pi/.cache/chromium/Default/Code\ Cache/* 2>/dev/null || true
    rm -rf /home/pi/.config/chromium/Default/GPUCache/* 2>/dev/null || true

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

    # Flags communs à tous les modèles
    local common_flags=(
        --kiosk
        --autoplay-policy=no-user-gesture-required
        --noerrdialogs
        --disable-infobars
        --disable-session-crashed-bubble
        --disable-restore-session-state
        --disable-features=TranslateUI,MediaRouter
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
    )

    # Flags spécifiques au modèle
    local gpu_flags=()
    if [[ "$PI_MODEL" == "pi5" ]]; then
        # Pi 5 : GPU compositing via V3D natif (Mesa), mais décodage vidéo en software.
        #
        # Historique des tentatives :
        # - SwiftShader (--use-gl=angle --use-angle=swiftshader) : trop lent, vidéos saccadées
        # - EGL natif avec flags (--use-gl=egl --enable-features=Vulkan) : SharedImageStub errors /5s
        # - --disable-gpu : Skia CPU, mieux que SwiftShader mais encore trop lent
        # - Sans --disable-accelerated-video-decode : SharedImageStub + AllocateRingBuffer errors
        #   toutes les 5s, mémoire GPU sature après une boucle complète → flash noir puis "Aw, Snap!"
        #
        # Solution : Laisser le GPU faire le compositing (V3D 7.1 Mesa) mais désactiver le
        # décodage vidéo hardware (ANGLE/GLES SharedImage ne fonctionne pas sur V3D).
        # Le CPU Pi 5 (4x Cortex-A76 @2.4GHz) gère le décodage 1080p software sans problème.
        log "📱 Pi 5 détecté: V3D natif (Mesa) + décodage vidéo software"
        gpu_flags=(
            --ignore-gpu-blocklist
            --enable-gpu-rasterization
            --disable-accelerated-video-decode
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

    "$CHROMIUM_BIN" "${common_flags[@]}" "${gpu_flags[@]}" "$CHROMIUM_URL" &

    CHROMIUM_PID=$!
    log "✓ Chromium lancé (PID: $CHROMIUM_PID)"
}

# Vérifier si Chromium affiche une page d'erreur
check_for_crash_page() {
    # Méthode 1: Vérifier le titre de la fenêtre via xdotool
    if command -v xdotool &> /dev/null; then
        local window_name=$(DISPLAY=:0 xdotool getactivewindow getwindowname 2>/dev/null || echo "")

        if [[ "$window_name" == *"Aw, Snap"* ]] || \
           [[ "$window_name" == *"Oups"* ]] || \
           [[ "$window_name" == *"Error"* ]] || \
           [[ "$window_name" == *"crashed"* ]]; then
            log "⚠️ Page de crash détectée: $window_name"
            return 0  # Crash détecté
        fi
    fi

    # Méthode 2: Vérifier les logs Chromium pour les erreurs GPU/mémoire
    if [ -f /home/pi/.config/chromium/chrome_debug.log ]; then
        local recent_errors=$(tail -100 /home/pi/.config/chromium/chrome_debug.log 2>/dev/null | grep -c "GPU process exited\|Renderer crash\|Out of memory" || true)
        if (( recent_errors > 0 )); then
            log "⚠️ Erreurs GPU/mémoire détectées dans les logs Chromium"
            return 0  # Crash détecté
        fi
    fi

    # Méthode 3: Vérifier les erreurs GPU driver dans journalctl (AllocateRingBuffer, etc.)
    # Ces erreurs ne sont pas visibles dans chrome_debug.log mais indiquent une défaillance du GPU driver.
    # Sur Pi 5 avec V3D, ces erreurs se produisent quand le GPU ne peut plus allouer de mémoire.
    local gpu_driver_errors=$(journalctl -u neopro-kiosk --since "2 minutes ago" --no-pager -q 2>/dev/null | grep -c "AllocateRingBuffer\|kFatalFailure\|GpuChannelMsg_CreateCommandBuffer" || true)
    if (( gpu_driver_errors > 10 )); then
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

# Fonction principale de surveillance
main() {
    log "═══════════════════════════════════════════════════"
    log "🐕 Démarrage du watchdog Kiosk Neopro"
    log "═══════════════════════════════════════════════════"

    # Premier démarrage
    cleanup_chromium
    sleep 2
    start_chromium

    while true; do
        sleep "$CHECK_INTERVAL"

        local need_restart=false
        local reason=""

        # Vérification 1: Chromium est-il en vie ?
        if ! check_chromium_alive; then
            need_restart=true
            reason="Processus mort"
        fi

        # Vérification 2: Page de crash ?
        if ! $need_restart && check_for_crash_page; then
            need_restart=true
            reason="Page de crash détectée"
        fi

        # Vérification 3: Pression mémoire ?
        if ! $need_restart && check_memory_pressure; then
            need_restart=true
            reason="Pression mémoire élevée"
        fi

        if $need_restart; then
            log "🔄 Redémarrage nécessaire: $reason"
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
    done
}

# Gestion des signaux pour un arrêt propre
trap 'log "Arrêt du watchdog..."; cleanup_chromium; exit 0' SIGTERM SIGINT

main "$@"
