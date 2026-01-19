#!/bin/bash
#
# Sync-Agent Guardian - Watchdog indépendant pour maintenir la connexion cloud
#
# Ce script surveille le sync-agent et le restaure automatiquement s'il crashe en boucle.
# Il est conçu pour être ultra minimal et résilient - ne dépend PAS de Node.js.
#
# Fonctionnement :
# 1. Vérifie toutes les 30s si le sync-agent est actif
# 2. Si crash détecté, compte les crashs récents
# 3. Si >= 3 crashs en 5 minutes → restaure depuis la version "golden"
# 4. Log tout dans /var/log/neopro-sync-guardian.log
#

set -e

# === Configuration ===
SYNC_AGENT_SERVICE="neopro-sync-agent"
CHECK_INTERVAL=30
CRASH_THRESHOLD=3
CRASH_WINDOW=300  # 5 minutes en secondes
LOG_FILE="/var/log/neopro-sync-guardian.log"
CRASH_COUNT_FILE="/tmp/sync-agent-crash-count"
LAST_CRASH_FILE="/tmp/sync-agent-last-crash"

# Chemins
NEOPRO_ROOT="/home/pi/neopro"
SYNC_AGENT_DIR="${NEOPRO_ROOT}/sync-agent"
GOLDEN_DIR="${NEOPRO_ROOT}/sync-agent-golden"
BACKUP_DIR="${NEOPRO_ROOT}/backups"

# === Fonctions ===

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Aussi afficher en console si en mode interactif
    if [ -t 1 ]; then
        echo "[$timestamp] [$level] $message"
    fi
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }

# Vérifie si le sync-agent est actif
is_sync_agent_running() {
    systemctl is-active --quiet "$SYNC_AGENT_SERVICE"
}

# Compte les crashs récents (dans la fenêtre de temps)
get_recent_crash_count() {
    if [ ! -f "$CRASH_COUNT_FILE" ] || [ ! -f "$LAST_CRASH_FILE" ]; then
        echo 0
        return
    fi

    local last_crash=$(cat "$LAST_CRASH_FILE" 2>/dev/null || echo 0)
    local now=$(date +%s)
    local age=$((now - last_crash))

    # Si le dernier crash est trop vieux, reset le compteur
    if [ $age -gt $CRASH_WINDOW ]; then
        echo 0
        return
    fi

    cat "$CRASH_COUNT_FILE" 2>/dev/null || echo 0
}

# Incrémente le compteur de crashs
increment_crash_count() {
    local current=$(get_recent_crash_count)
    local new_count=$((current + 1))

    echo "$new_count" > "$CRASH_COUNT_FILE"
    date +%s > "$LAST_CRASH_FILE"

    echo "$new_count"
}

# Reset le compteur de crashs
reset_crash_count() {
    rm -f "$CRASH_COUNT_FILE" "$LAST_CRASH_FILE"
}

# Vérifie que la version golden existe et est valide
validate_golden() {
    if [ ! -d "$GOLDEN_DIR" ]; then
        log_error "Golden directory does not exist: $GOLDEN_DIR"
        return 1
    fi

    if [ ! -f "$GOLDEN_DIR/src/agent.js" ]; then
        log_error "Golden agent.js not found"
        return 1
    fi

    if [ ! -d "$GOLDEN_DIR/node_modules" ]; then
        log_error "Golden node_modules not found"
        return 1
    fi

    # Vérifier que agent.js n'est pas du HTML corrompu
    if head -1 "$GOLDEN_DIR/src/agent.js" | grep -qE "^<|DOCTYPE"; then
        log_error "Golden agent.js is corrupted (contains HTML)"
        return 1
    fi

    return 0
}

# Restaure le sync-agent depuis la version golden
restore_from_golden() {
    log_warn "=== STARTING RESTORE FROM GOLDEN ==="

    # Vérifier que golden est valide
    if ! validate_golden; then
        log_error "Cannot restore: golden version is invalid"
        return 1
    fi

    # Arrêter le service
    log_info "Stopping sync-agent service..."
    sudo systemctl stop "$SYNC_AGENT_SERVICE" 2>/dev/null || true
    sleep 2

    # Créer un backup de la version cassée (pour debug)
    local backup_name="sync-agent-crashed-$(date +%Y%m%d-%H%M%S)"
    log_info "Backing up crashed version to $BACKUP_DIR/$backup_name"
    mkdir -p "$BACKUP_DIR"
    if [ -d "$SYNC_AGENT_DIR" ]; then
        mv "$SYNC_AGENT_DIR" "$BACKUP_DIR/$backup_name" 2>/dev/null || true
    fi

    # Copier la version golden
    log_info "Restoring from golden version..."
    cp -r "$GOLDEN_DIR" "$SYNC_AGENT_DIR"

    # Fixer les permissions
    chown -R pi:pi "$SYNC_AGENT_DIR"

    # Redémarrer le service
    log_info "Starting sync-agent service..."
    sudo systemctl start "$SYNC_AGENT_SERVICE"
    sleep 5

    # Vérifier que ça a marché
    if is_sync_agent_running; then
        log_info "=== RESTORE SUCCESSFUL - sync-agent is running ==="
        reset_crash_count
        return 0
    else
        log_error "=== RESTORE FAILED - sync-agent still not running ==="
        return 1
    fi
}

# Crée une version golden à partir de la version actuelle
create_golden() {
    log_info "Creating golden snapshot from current sync-agent..."

    # Vérifier que la version actuelle fonctionne
    if ! is_sync_agent_running; then
        log_error "Cannot create golden: sync-agent is not running"
        return 1
    fi

    # Vérifier que agent.js existe et n'est pas corrompu
    if [ ! -f "$SYNC_AGENT_DIR/src/agent.js" ]; then
        log_error "Cannot create golden: agent.js not found"
        return 1
    fi

    if head -1 "$SYNC_AGENT_DIR/src/agent.js" | grep -qE "^<|DOCTYPE"; then
        log_error "Cannot create golden: agent.js is corrupted"
        return 1
    fi

    # Supprimer l'ancienne version golden
    if [ -d "$GOLDEN_DIR" ]; then
        rm -rf "$GOLDEN_DIR"
    fi

    # Copier la version actuelle
    cp -r "$SYNC_AGENT_DIR" "$GOLDEN_DIR"

    # Marquer avec la date de création
    echo "$(date -Iseconds)" > "$GOLDEN_DIR/.golden-created"

    log_info "Golden snapshot created successfully"
    return 0
}

# Nettoie les vieux backups (garde les 5 derniers)
cleanup_old_backups() {
    if [ -d "$BACKUP_DIR" ]; then
        local count=$(ls -d "$BACKUP_DIR"/sync-agent-crashed-* 2>/dev/null | wc -l)
        if [ "$count" -gt 5 ]; then
            log_info "Cleaning old backups (keeping 5 most recent)..."
            ls -dt "$BACKUP_DIR"/sync-agent-crashed-* | tail -n +6 | xargs rm -rf
        fi
    fi
}

# Rotation des logs (garde 1MB max)
rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        local size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$size" -gt 1048576 ]; then  # 1MB
            mv "$LOG_FILE" "${LOG_FILE}.old"
            log_info "Log rotated"
        fi
    fi
}

# === Boucle principale ===

main_loop() {
    log_info "Sync-Agent Guardian started"
    log_info "Monitoring service: $SYNC_AGENT_SERVICE"
    log_info "Check interval: ${CHECK_INTERVAL}s"
    log_info "Crash threshold: $CRASH_THRESHOLD crashes in ${CRASH_WINDOW}s"

    # Vérifier si golden existe, sinon le créer
    if [ ! -d "$GOLDEN_DIR" ]; then
        log_warn "No golden version found"
        if is_sync_agent_running; then
            log_info "Creating initial golden snapshot..."
            create_golden
        else
            log_error "Cannot create golden: sync-agent not running. Will create when it starts."
        fi
    fi

    local consecutive_ok=0

    while true; do
        rotate_log

        if is_sync_agent_running; then
            # Service OK
            consecutive_ok=$((consecutive_ok + 1))

            # Si stable pendant 10 checks (5 min), reset le compteur de crashs
            if [ $consecutive_ok -ge 10 ]; then
                reset_crash_count
                consecutive_ok=0
            fi

            # Si stable et pas de golden, en créer un
            if [ $consecutive_ok -ge 6 ] && [ ! -d "$GOLDEN_DIR" ]; then
                create_golden
            fi
        else
            # Service down !
            consecutive_ok=0
            local crash_count=$(increment_crash_count)

            log_warn "Sync-agent is DOWN! Crash count: $crash_count / $CRASH_THRESHOLD"

            if [ "$crash_count" -ge "$CRASH_THRESHOLD" ]; then
                log_error "Crash threshold reached! Attempting restore from golden..."

                if restore_from_golden; then
                    log_info "Recovery successful"
                else
                    log_error "Recovery failed - manual intervention required"
                    # Attendre plus longtemps avant de réessayer
                    sleep 300
                fi
            else
                # Pas encore au seuil, juste tenter un restart normal
                log_info "Attempting normal restart..."
                sudo systemctl restart "$SYNC_AGENT_SERVICE" 2>/dev/null || true
                sleep 10
            fi
        fi

        cleanup_old_backups
        sleep "$CHECK_INTERVAL"
    done
}

# === Point d'entrée ===

case "${1:-}" in
    start)
        main_loop
        ;;
    create-golden)
        create_golden
        ;;
    restore)
        restore_from_golden
        ;;
    status)
        echo "=== Sync-Agent Guardian Status ==="
        echo ""
        if is_sync_agent_running; then
            echo "Sync-agent: RUNNING ✓"
        else
            echo "Sync-agent: DOWN ✗"
        fi
        echo "Crash count: $(get_recent_crash_count) / $CRASH_THRESHOLD"
        echo ""
        if [ -d "$GOLDEN_DIR" ]; then
            echo "Golden version: EXISTS ✓"
            if [ -f "$GOLDEN_DIR/.golden-created" ]; then
                echo "  Created: $(cat "$GOLDEN_DIR/.golden-created")"
            fi
        else
            echo "Golden version: NOT FOUND ✗"
        fi
        echo ""
        if [ -f "$LOG_FILE" ]; then
            echo "Last 5 log entries:"
            tail -5 "$LOG_FILE"
        fi
        ;;
    *)
        echo "Usage: $0 {start|create-golden|restore|status}"
        echo ""
        echo "Commands:"
        echo "  start         - Start the guardian watchdog loop"
        echo "  create-golden - Create a golden snapshot from current sync-agent"
        echo "  restore       - Manually restore from golden version"
        echo "  status        - Show current status"
        exit 1
        ;;
esac
