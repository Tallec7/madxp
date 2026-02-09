#!/bin/bash
# =============================================================================
# Hotspot Channel Optimizer
# =============================================================================
# Runs at boot to automatically select the least congested WiFi channel
# for the hotspot (wlan0). Prevents hotspot from being invisible due to
# channel interference in crowded WiFi environments.
#
# Channels analyzed: 1, 6, 11 (non-overlapping 2.4GHz channels)
# =============================================================================

LOG_FILE="/var/log/neopro-hotspot-optimizer.log"
HOSTAPD_CONF="/etc/hostapd/hostapd.conf"
WIFI_INTERFACE="wlan0"

# Threshold: if current channel has more than this many networks, consider switching
CONGESTION_THRESHOLD=3

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Count networks on a specific channel
count_networks_on_channel() {
    local channel=$1
    # Use iwlist to scan and count networks on this channel
    # Note: scan may need to be run as root
    local count=$(iwlist "$WIFI_INTERFACE" scan 2>/dev/null | grep -E "Channel:$channel\$" | wc -l)
    echo "$count"
}

# Get current hostapd channel
get_current_channel() {
    grep "^channel=" "$HOSTAPD_CONF" 2>/dev/null | cut -d'=' -f2
}

# Set hostapd channel
set_channel() {
    local new_channel=$1
    log "Setting hotspot channel to $new_channel"
    sed -i "s/^channel=.*/channel=$new_channel/" "$HOSTAPD_CONF"
}

# Find the least congested channel among 1, 6, 11
find_best_channel() {
    local best_channel=6
    local min_networks=999

    for channel in 1 6 11; do
        local count=$(count_networks_on_channel "$channel")
        # Write directly to log file (NOT via log() which uses tee → stdout)
        # stdout is captured by $(find_best_channel), so log() would pollute the return value
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Channel $channel: $count networks detected" >> "$LOG_FILE"

        if [ "$count" -lt "$min_networks" ]; then
            min_networks=$count
            best_channel=$channel
        fi
    done

    echo "$best_channel"
}

# Main
main() {
    log "=========================================="
    log "Hotspot Channel Optimizer starting..."

    # Check if hostapd config exists
    if [ ! -f "$HOSTAPD_CONF" ]; then
        log "ERROR: hostapd.conf not found at $HOSTAPD_CONF"
        exit 1
    fi

    # Get current channel
    current_channel=$(get_current_channel)
    if [ -z "$current_channel" ]; then
        current_channel=6
        log "No channel configured, assuming default: $current_channel"
    else
        log "Current hotspot channel: $current_channel"
    fi

    # Brief delay to let WiFi hardware initialize
    sleep 2

    # Scan for networks (may need multiple attempts)
    log "Scanning WiFi environment..."

    # Perform scan
    iwlist "$WIFI_INTERFACE" scan > /dev/null 2>&1
    sleep 1

    # Count networks on current channel
    current_count=$(count_networks_on_channel "$current_channel")
    log "Networks on current channel $current_channel: $current_count"

    # If current channel is congested, find a better one
    if [ "$current_count" -ge "$CONGESTION_THRESHOLD" ]; then
        log "Channel $current_channel is congested (>= $CONGESTION_THRESHOLD networks)"

        best_channel=$(find_best_channel)

        if [ "$best_channel" != "$current_channel" ]; then
            log "Switching from channel $current_channel to $best_channel"
            set_channel "$best_channel"

            # Check if wlan1 (WiFi client) is connected before restarting
            wlan1_was_connected=false
            if iwconfig wlan1 2>/dev/null | grep -q "ESSID:\""; then
                wlan1_was_connected=true
                log "Note: wlan1 is connected, will restore after restart"
            fi

            # Restart hostapd to apply new channel
            log "Restarting hostapd..."
            systemctl restart hostapd

            if systemctl is-active --quiet hostapd; then
                log "SUCCESS: Hotspot now on channel $best_channel"
            else
                log "ERROR: hostapd failed to restart, reverting to channel $current_channel"
                set_channel "$current_channel"
                systemctl restart hostapd
            fi

            # Restore wlan1 connection if it was active and got disconnected
            if [ "$wlan1_was_connected" = true ]; then
                sleep 2
                if ! iwconfig wlan1 2>/dev/null | grep -q "ESSID:\""; then
                    log "Restoring wlan1 connection..."
                    if systemctl is-active --quiet wpa_supplicant@wlan1; then
                        systemctl restart wpa_supplicant@wlan1
                    else
                        wpa_cli -i wlan1 reconfigure 2>/dev/null
                    fi
                    sleep 5
                    if iwconfig wlan1 2>/dev/null | grep -q "ESSID:\""; then
                        log "wlan1 reconnected successfully"
                    else
                        log "WARNING: wlan1 may need manual reconnection"
                    fi
                fi
            fi
        else
            log "Current channel $current_channel is already the best option"
        fi
    else
        log "Channel $current_channel is OK ($current_count < $CONGESTION_THRESHOLD networks)"
    fi

    log "Hotspot optimizer completed"
    log "=========================================="
}

main "$@"
