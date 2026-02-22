#!/bin/bash
# =============================================================================
# NEOPRO HOTSPOT WATCHDOG
# =============================================================================
#
# Surveille la santé du hotspot WiFi (wlan0) et tente une récupération
# automatique en cas de problème.
#
# Problèmes détectés et corrigés :
# - hostapd crashé ou arrêté
# - wlan0 pas en mode AP
# - WiFi bloqué par rfkill
# - dnsmasq arrêté
# - nginx arrêté (captive portal + webapp inaccessibles)
# - avahi-daemon arrêté (résolution mDNS neopro.local cassée)
#
# Usage :
#   ./hotspot-watchdog.sh           # Exécution unique
#   ./hotspot-watchdog.sh --daemon  # Mode daemon (boucle infinie)
#   ./hotspot-watchdog.sh --status  # Afficher le statut
#
# Logs : /var/log/neopro-hotspot-watchdog.log
#
# =============================================================================

set -euo pipefail

# Configuration
LOG_FILE="/var/log/neopro-hotspot-watchdog.log"
MAX_RECOVERY_ATTEMPTS=3
RECOVERY_COOLDOWN=300  # 5 minutes entre les cycles de recovery
CHECK_INTERVAL=30      # Secondes entre les checks en mode daemon
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"

# État
RECOVERY_ATTEMPTS=0
LAST_RECOVERY_TIME=0

# =============================================================================
# LOGGING
# =============================================================================

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Aussi afficher en console si pas en mode daemon
    if [[ "${DAEMON_MODE:-false}" != "true" ]]; then
        echo "[$level] $message"
    fi
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }
log_success() { log "SUCCESS" "$1"; }

# Rotation des logs (garder les 1000 dernières lignes)
rotate_logs() {
    if [[ -f "$LOG_FILE" ]] && [[ $(wc -l < "$LOG_FILE") -gt 2000 ]]; then
        tail -1000 "$LOG_FILE" > "${LOG_FILE}.tmp"
        mv "${LOG_FILE}.tmp" "$LOG_FILE"
        log_info "Log file rotated"
    fi
}

# =============================================================================
# CHECKS
# =============================================================================

# Vérifier que hostapd est actif
check_hostapd() {
    if systemctl is-active --quiet hostapd; then
        return 0
    else
        return 1
    fi
}

# Vérifier que wlan0 est en mode AP
check_ap_mode() {
    if iw dev "$WIFI_INTERFACE" info 2>/dev/null | grep -q "type AP"; then
        return 0
    else
        return 1
    fi
}

# Vérifier que dnsmasq est actif
check_dnsmasq() {
    if systemctl is-active --quiet dnsmasq; then
        return 0
    else
        return 1
    fi
}

# Vérifier que le WiFi n'est pas bloqué par rfkill
check_rfkill() {
    if rfkill list wifi 2>/dev/null | grep -q "Soft blocked: yes"; then
        return 1
    else
        return 0
    fi
}

# Vérifier que nginx est actif (captive portal + webapp)
check_nginx() {
    if systemctl is-active --quiet nginx; then
        return 0
    else
        return 1
    fi
}

# Vérifier que avahi-daemon est actif (résolution mDNS neopro.local)
check_avahi() {
    if systemctl is-active --quiet avahi-daemon; then
        return 0
    else
        return 1
    fi
}

# Vérifier l'IP du hotspot
check_hotspot_ip() {
    if ip addr show "$WIFI_INTERFACE" 2>/dev/null | grep -q "192.168.4.1"; then
        return 0
    else
        return 1
    fi
}

# Detect brcmfmac firmware crash (Broadcom WiFi chip on wlan0)
# The onboard WiFi can crash with "brcmf_fw_crashed: Firmware has halted or crashed"
# When this happens, hostapd may still appear "active" but the interface is dead.
# Recovery requires reloading the kernel module.
check_brcmfmac() {
    # Check dmesg for recent firmware crash (last 5 minutes = 300 seconds)
    local crash_count
    crash_count=$(dmesg --time-format iso 2>/dev/null | tail -200 | grep -c "brcmf_fw_crashed" || echo "0")

    if [[ "$crash_count" -gt 0 ]]; then
        return 1
    fi
    return 0
}

# Recover from brcmfmac firmware crash by reloading the kernel module
recover_brcmfmac() {
    log_warn "brcmfmac firmware crash detected — reloading driver"

    # Unload the driver
    sudo modprobe -r brcmfmac 2>/dev/null || true
    sleep 3

    # Reload the driver
    sudo modprobe brcmfmac 2>/dev/null || {
        log_error "Failed to reload brcmfmac driver"
        return 1
    }
    sleep 5

    # Verify wlan0 reappeared
    if ip link show "$WIFI_INTERFACE" &>/dev/null; then
        log_success "brcmfmac driver reloaded, $WIFI_INTERFACE recovered"
        # Disable power management after reload
        sudo iwconfig "$WIFI_INTERFACE" power off 2>/dev/null || true
        return 0
    else
        log_error "$WIFI_INTERFACE did not reappear after brcmfmac reload"
        return 1
    fi
}

# Check complet de la santé du hotspot
check_hotspot_health() {
    local issues=()

    # Check for brcmfmac firmware crash first (takes priority)
    if ! check_brcmfmac; then
        issues+=("brcmfmac firmware crash")
    fi

    if ! check_rfkill; then
        issues+=("WiFi bloqué par rfkill")
    fi

    if ! check_hostapd; then
        issues+=("hostapd inactif")
    fi

    if ! check_ap_mode; then
        issues+=("wlan0 pas en mode AP")
    fi

    if ! check_dnsmasq; then
        issues+=("dnsmasq inactif")
    fi

    if ! check_hotspot_ip; then
        issues+=("IP 192.168.4.1 non configurée")
    fi

    if ! check_nginx; then
        issues+=("nginx inactif")
    fi

    if ! check_avahi; then
        issues+=("avahi-daemon inactif")
    fi

    if [[ ${#issues[@]} -eq 0 ]]; then
        return 0
    else
        echo "${issues[*]}"
        return 1
    fi
}

# =============================================================================
# RECOVERY
# =============================================================================

# Vérifier si on peut tenter une recovery
can_attempt_recovery() {
    local current_time=$(date +%s)
    local time_since_last=$((current_time - LAST_RECOVERY_TIME))

    # Reset le compteur si assez de temps s'est écoulé
    if [[ $time_since_last -gt $RECOVERY_COOLDOWN ]]; then
        RECOVERY_ATTEMPTS=0
    fi

    if [[ $RECOVERY_ATTEMPTS -ge $MAX_RECOVERY_ATTEMPTS ]]; then
        return 1
    fi

    return 0
}

# Tenter la récupération du hotspot
attempt_recovery() {
    RECOVERY_ATTEMPTS=$((RECOVERY_ATTEMPTS + 1))
    LAST_RECOVERY_TIME=$(date +%s)

    log_warn "Tentative de récupération #$RECOVERY_ATTEMPTS/$MAX_RECOVERY_ATTEMPTS"

    # Étape 0: Check brcmfmac firmware crash (must be fixed first)
    if ! check_brcmfmac; then
        log_warn "Étape 0/6: Récupération crash firmware brcmfmac..."
        recover_brcmfmac || {
            log_error "Récupération brcmfmac échouée"
            return 1
        }
        sleep 2
    fi

    # Étape 1: Débloquer rfkill
    log_info "Étape 1/6: Déblocage rfkill..."
    sudo rfkill unblock wifi 2>/dev/null || true
    sleep 1

    # Étape 2: Configurer l'IP statique si manquante
    if ! check_hotspot_ip; then
        log_info "Étape 2/6: Configuration IP statique..."
        sudo ip addr add 192.168.4.1/24 dev "$WIFI_INTERFACE" 2>/dev/null || true
        sudo ip link set "$WIFI_INTERFACE" up 2>/dev/null || true
        sleep 1
    else
        log_info "Étape 2/6: IP déjà configurée"
    fi

    # Étape 3: Redémarrer hostapd
    log_info "Étape 3/6: Redémarrage hostapd..."
    sudo systemctl restart hostapd 2>/dev/null || {
        log_error "Échec du redémarrage hostapd"
        return 1
    }
    sleep 3

    # Étape 4: Redémarrer dnsmasq
    log_info "Étape 4/6: Redémarrage dnsmasq..."
    sudo systemctl restart dnsmasq 2>/dev/null || {
        log_error "Échec du redémarrage dnsmasq"
        return 1
    }
    sleep 2

    # Étape 5: Redémarrer nginx (captive portal + webapp)
    if ! check_nginx; then
        log_info "Étape 5/6: Redémarrage nginx..."
        sudo systemctl restart nginx 2>/dev/null || {
            log_error "Échec du redémarrage nginx"
        }
        sleep 1
    else
        log_info "Étape 5/6: nginx déjà actif"
    fi

    # Étape 6: Redémarrer avahi-daemon (résolution mDNS neopro.local)
    if ! check_avahi; then
        log_info "Étape 6/6: Redémarrage avahi-daemon..."
        sudo systemctl restart avahi-daemon 2>/dev/null || {
            log_error "Échec du redémarrage avahi-daemon"
        }
        sleep 1
    else
        log_info "Étape 6/6: avahi-daemon déjà actif"
    fi

    # Vérification finale
    if issues=$(check_hotspot_health); then
        log_success "Hotspot récupéré avec succès"
        RECOVERY_ATTEMPTS=0  # Reset le compteur après succès
        return 0
    else
        log_error "Récupération échouée, problèmes restants: $issues"
        return 1
    fi
}

# =============================================================================
# STATUS
# =============================================================================

print_status() {
    echo "=== NEOPRO HOTSPOT WATCHDOG STATUS ==="
    echo ""

    # hostapd
    if check_hostapd; then
        echo "[✓] hostapd: actif"
    else
        echo "[✗] hostapd: INACTIF"
    fi

    # Mode AP
    if check_ap_mode; then
        echo "[✓] Mode AP: actif sur $WIFI_INTERFACE"
    else
        echo "[✗] Mode AP: INACTIF"
    fi

    # dnsmasq
    if check_dnsmasq; then
        echo "[✓] dnsmasq: actif"
    else
        echo "[✗] dnsmasq: INACTIF"
    fi

    # rfkill
    if check_rfkill; then
        echo "[✓] rfkill: WiFi non bloqué"
    else
        echo "[✗] rfkill: WiFi BLOQUÉ"
    fi

    # nginx
    if check_nginx; then
        echo "[✓] nginx: actif (captive portal + webapp)"
    else
        echo "[✗] nginx: INACTIF — captive portal et webapp inaccessibles"
    fi

    # avahi-daemon
    if check_avahi; then
        echo "[✓] avahi-daemon: actif (mDNS neopro.local)"
    else
        echo "[✗] avahi-daemon: INACTIF — neopro.local ne résout plus"
    fi

    # IP
    if check_hotspot_ip; then
        echo "[✓] IP: 192.168.4.1 configurée"
    else
        echo "[✗] IP: 192.168.4.1 NON configurée"
    fi

    echo ""

    # SSID et channel
    if [[ -f /etc/hostapd/hostapd.conf ]]; then
        local ssid=$(grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
        local channel=$(grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
        echo "SSID: ${ssid:-N/A}"
        echo "Channel: ${channel:-N/A}"
    fi

    echo ""

    # Clients connectés
    local clients=$(iw dev "$WIFI_INTERFACE" station dump 2>/dev/null | grep -c "Station" || echo "0")
    echo "Clients connectés: $clients"

    echo ""

    # Derniers logs
    echo "=== DERNIERS LOGS ==="
    if [[ -f "$LOG_FILE" ]]; then
        tail -10 "$LOG_FILE"
    else
        echo "(Aucun log)"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

run_check() {
    rotate_logs

    if issues=$(check_hotspot_health); then
        # Tout va bien
        return 0
    else
        log_warn "Problèmes détectés: $issues"

        if can_attempt_recovery; then
            attempt_recovery
            return $?
        else
            log_error "Trop de tentatives de récupération ($RECOVERY_ATTEMPTS/$MAX_RECOVERY_ATTEMPTS). Attente de $RECOVERY_COOLDOWN secondes avant nouvel essai."
            return 1
        fi
    fi
}

run_daemon() {
    DAEMON_MODE=true
    log_info "Démarrage du watchdog en mode daemon (intervalle: ${CHECK_INTERVAL}s)"

    while true; do
        run_check || true
        sleep $CHECK_INTERVAL
    done
}

# Point d'entrée
main() {
    # Créer le fichier de log si nécessaire
    touch "$LOG_FILE" 2>/dev/null || true

    case "${1:-}" in
        --daemon|-d)
            run_daemon
            ;;
        --status|-s)
            print_status
            ;;
        --help|-h)
            echo "Usage: $0 [--daemon|--status|--help]"
            echo ""
            echo "Options:"
            echo "  --daemon, -d    Mode daemon (boucle infinie)"
            echo "  --status, -s    Afficher le statut actuel"
            echo "  --help, -h      Afficher cette aide"
            echo ""
            echo "Sans option: exécution unique du check"
            ;;
        *)
            run_check
            ;;
    esac
}

main "$@"
