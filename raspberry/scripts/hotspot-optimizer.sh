#!/bin/bash
# =============================================================================
# Hotspot Channel Optimizer
# =============================================================================
# Runs at boot to automatically select the least congested WiFi channel
# for the hotspot (wlan0). Prevents hotspot from being invisible due to
# channel interference in crowded WiFi environments.
#
# Channels analyzed: 1, 6, 11 (non-overlapping 2.4GHz channels)
#
# Anti-interference: avoids placing hotspot on the same channel as wlan1
# (internet connection), preventing the hotspot from drowning out the
# weak upstream signal from the router.
# =============================================================================

LOG_FILE="/var/log/neopro-hotspot-optimizer.log"
HOSTAPD_CONF="/etc/hostapd/hostapd.conf"
WIFI_INTERFACE="wlan0"

# Threshold: if current channel has more than this many networks, consider switching
CONGESTION_THRESHOLD=3

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Detect the channel wlan1 (internet) is currently connected to
# Returns empty string if wlan1 is not connected
get_wlan1_channel() {
    local freq
    freq=$(iw dev wlan1 link 2>/dev/null | grep -oP 'freq: \K[0-9]+')
    if [ -n "$freq" ]; then
        # Convert frequency to channel number (2.4GHz band)
        case "$freq" in
            2412) echo 1 ;; 2417) echo 2 ;; 2422) echo 3 ;;
            2427) echo 4 ;; 2432) echo 5 ;; 2437) echo 6 ;;
            2442) echo 7 ;; 2447) echo 8 ;; 2452) echo 9 ;;
            2457) echo 10 ;; 2462) echo 11 ;; 2467) echo 12 ;;
            2472) echo 13 ;;
            *) echo "" ;;
        esac
    fi
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
    # Validate channel is a number (1, 6, or 11) to prevent sed injection from corrupted input
    if ! [[ "$new_channel" =~ ^(1|6|11)$ ]]; then
        log "ERROR: Invalid channel value '$new_channel', aborting channel change"
        return 1
    fi
    log "Setting hotspot channel to $new_channel"
    sed -i "s/^channel=.*/channel=$new_channel/" "$HOSTAPD_CONF"
}

# Find the least congested channel among 1, 6, 11
# Penalizes the channel used by wlan1 (internet) to avoid co-channel interference.
# Sets BEST_CHANNEL variable (not stdout) to avoid $() capture pollution
find_best_channel() {
    BEST_CHANNEL=6
    local min_score=999

    # Detect wlan1 channel to avoid self-interference
    local wlan1_channel
    wlan1_channel=$(get_wlan1_channel)
    if [ -n "$wlan1_channel" ]; then
        log "wlan1 (internet) is on channel $wlan1_channel — will avoid it"
    else
        log "wlan1 channel not detected (not connected or 5GHz)"
    fi

    # Heavy penalty: co-channel with wlan1 adds 100 to the score
    # so it's only chosen if all other channels are impossibly congested
    local SELF_INTERFERENCE_PENALTY=100

    for channel in 1 6 11; do
        local count=$(count_networks_on_channel "$channel")

        # Ensure count is a valid number, default to 0
        if ! [[ "$count" =~ ^[0-9]+$ ]]; then
            count=0
        fi

        local score=$count
        if [ -n "$wlan1_channel" ] && [ "$channel" = "$wlan1_channel" ]; then
            score=$((score + SELF_INTERFERENCE_PENALTY))
            log "Channel $channel: $count networks + self-interference penalty (wlan1) → score $score"
        else
            log "Channel $channel: $count networks → score $score"
        fi

        if [ "$score" -lt "$min_score" ]; then
            min_score=$score
            BEST_CHANNEL=$channel
        fi
    done
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

    # Detect wlan1 channel for self-interference check
    wlan1_ch=$(get_wlan1_channel)

    # Count networks on current channel
    current_count=$(count_networks_on_channel "$current_channel")
    log "Networks on current channel $current_channel: $current_count"

    # Determine if we need to optimize:
    # 1. Channel is congested (too many networks)
    # 2. Self-interference: hotspot is on the same channel as wlan1 (internet)
    local needs_optimization=false
    if [ "$current_count" -ge "$CONGESTION_THRESHOLD" ]; then
        log "Channel $current_channel is congested (>= $CONGESTION_THRESHOLD networks)"
        needs_optimization=true
    elif [ -n "$wlan1_ch" ] && [ "$current_channel" = "$wlan1_ch" ]; then
        log "Channel $current_channel conflicts with wlan1 (internet) — self-interference risk"
        needs_optimization=true
    fi

    if [ "$needs_optimization" = true ]; then
        find_best_channel
        best_channel=$BEST_CHANNEL

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
        if [ -n "$wlan1_ch" ]; then
            log "Channel $current_channel is OK ($current_count < $CONGESTION_THRESHOLD networks, no wlan1 conflict)"
        else
            log "Channel $current_channel is OK ($current_count < $CONGESTION_THRESHOLD networks)"
        fi
    fi

    log "Hotspot optimizer completed"
    log "=========================================="
}

main "$@"
