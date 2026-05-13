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
NEOPRO_APP_SERVICE="neopro-app"
CHECK_INTERVAL=30
CRASH_THRESHOLD=3
CRASH_WINDOW=300  # 5 minutes en secondes
LOG_FILE="/var/log/neopro-sync-guardian.log"
CRASH_COUNT_FILE="/tmp/sync-agent-crash-count"
LAST_CRASH_FILE="/tmp/sync-agent-last-crash"

# neopro-app watchdog (incident 2026-05-13 — storm auto-deploys NLF)
# Le guardian surveille aussi neopro-app pour éviter qu'un crash laisse le Pi
# offline jusqu'à intervention physique. Backoff exponentiel, plafond 5/h.
NEOPRO_APP_DOWN_GRACE=60          # tolérer 60s avant de tenter un restart
NEOPRO_APP_RESTART_WINDOW=3600    # fenêtre du plafond restart (1h)
NEOPRO_APP_RESTART_CAP=5          # max 5 restart/heure
NEOPRO_APP_DOWN_SINCE_FILE="/tmp/neopro-app-down-since"
NEOPRO_APP_RESTART_LOG="/tmp/neopro-app-restart-log"   # 1 timestamp epoch / ligne
NEOPRO_APP_BACKOFF_FILE="/tmp/neopro-app-backoff"      # prochain délai (s)
NEOPRO_APP_NEXT_TRY_FILE="/tmp/neopro-app-next-try"    # epoch min pour retry
NEOPRO_APP_BACKOFF_MIN=10
NEOPRO_APP_BACKOFF_MAX=600

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

# === neopro-app watchdog (incident 2026-05-13) ===

# Émet une ligne JSON structurée sur l'événement (parsable par journald + Loki)
emit_event() {
    local event="$1"
    local extra="$2"
    local ts=$(date -Iseconds)
    echo "{\"ts\":\"$ts\",\"guardian_event\":\"$event\"${extra:+,$extra}}"
}

# Compte les restart neopro-app dans la dernière heure
neopro_app_recent_restart_count() {
    if [ ! -f "$NEOPRO_APP_RESTART_LOG" ]; then
        echo 0
        return
    fi
    local now=$(date +%s)
    local cutoff=$((now - NEOPRO_APP_RESTART_WINDOW))
    local kept
    kept=$(awk -v c="$cutoff" '$1 >= c' "$NEOPRO_APP_RESTART_LOG" 2>/dev/null || true)
    # Réécrit le log purgé pour qu'il ne grossisse pas
    if [ -n "$kept" ]; then
        echo "$kept" > "$NEOPRO_APP_RESTART_LOG"
    else
        : > "$NEOPRO_APP_RESTART_LOG"
    fi
    wc -l < "$NEOPRO_APP_RESTART_LOG" | tr -d ' '
}

# Tente un restart neopro-app avec backoff exponentiel + plafond
watch_neopro_app() {
    if systemctl is-active --quiet "$NEOPRO_APP_SERVICE"; then
        # Service up — reset l'état down + backoff
        if [ -f "$NEOPRO_APP_DOWN_SINCE_FILE" ]; then
            log_info "$(emit_event neopro_app_recovered)"
            rm -f "$NEOPRO_APP_DOWN_SINCE_FILE" "$NEOPRO_APP_BACKOFF_FILE" "$NEOPRO_APP_NEXT_TRY_FILE"
        fi
        return 0
    fi

    local now
    now=$(date +%s)

    # Marquer le moment où le service est tombé
    if [ ! -f "$NEOPRO_APP_DOWN_SINCE_FILE" ]; then
        echo "$now" > "$NEOPRO_APP_DOWN_SINCE_FILE"
        log_warn "$(emit_event neopro_app_down)"
        return 0
    fi

    local down_since
    down_since=$(cat "$NEOPRO_APP_DOWN_SINCE_FILE" 2>/dev/null || echo "$now")
    local down_for=$((now - down_since))

    # Tolérance : laisser le temps à systemd Restart= de faire son boulot
    if [ "$down_for" -lt "$NEOPRO_APP_DOWN_GRACE" ]; then
        return 0
    fi

    # Respect du backoff (ne pas taper en boucle)
    if [ -f "$NEOPRO_APP_NEXT_TRY_FILE" ]; then
        local next_try
        next_try=$(cat "$NEOPRO_APP_NEXT_TRY_FILE" 2>/dev/null || echo 0)
        if [ "$now" -lt "$next_try" ]; then
            return 0
        fi
    fi

    # Plafond 5 restart/h
    local recent
    recent=$(neopro_app_recent_restart_count)
    if [ "$recent" -ge "$NEOPRO_APP_RESTART_CAP" ]; then
        log_error "$(emit_event neopro_app_restart_cap_reached "\"recent_restarts\":$recent,\"window_s\":$NEOPRO_APP_RESTART_WINDOW")"
        # Attendre la prochaine fenêtre pour retenter
        echo $((now + 600)) > "$NEOPRO_APP_NEXT_TRY_FILE"
        return 1
    fi

    # Backoff exponentiel
    local backoff
    backoff=$(cat "$NEOPRO_APP_BACKOFF_FILE" 2>/dev/null || echo "$NEOPRO_APP_BACKOFF_MIN")
    if [ "$backoff" -lt "$NEOPRO_APP_BACKOFF_MIN" ]; then
        backoff="$NEOPRO_APP_BACKOFF_MIN"
    fi

    log_warn "$(emit_event neopro_app_restart_attempt "\"down_for_s\":$down_for,\"recent_restarts\":$recent,\"backoff_s\":$backoff")"

    # Log le restart AVANT la commande (pour ne pas perdre la trace si systemctl hang)
    echo "$now" >> "$NEOPRO_APP_RESTART_LOG"

    if sudo systemctl restart "$NEOPRO_APP_SERVICE" 2>/dev/null; then
        log_info "$(emit_event neopro_app_restart_issued)"
    else
        log_error "$(emit_event neopro_app_restart_failed)"
    fi

    # Préparer le prochain essai : backoff doublé, capé
    local next_backoff=$((backoff * 2))
    if [ "$next_backoff" -gt "$NEOPRO_APP_BACKOFF_MAX" ]; then
        next_backoff="$NEOPRO_APP_BACKOFF_MAX"
    fi
    echo "$next_backoff" > "$NEOPRO_APP_BACKOFF_FILE"
    echo $((now + backoff)) > "$NEOPRO_APP_NEXT_TRY_FILE"
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

        # Surveille neopro-app indépendamment du sync-agent (incident 2026-05-13)
        watch_neopro_app || true

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
        if systemctl is-active --quiet "$NEOPRO_APP_SERVICE"; then
            echo "Neopro-app: RUNNING ✓"
        else
            echo "Neopro-app: DOWN ✗"
        fi
        echo "Neopro-app restarts (last hour): $(neopro_app_recent_restart_count) / $NEOPRO_APP_RESTART_CAP"
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
