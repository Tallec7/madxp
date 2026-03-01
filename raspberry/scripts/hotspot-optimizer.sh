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
AP_INTERFACE="wlan0"

# CRITICAL: Never scan on the AP interface (wlan0) — it disrupts the hotspot!
# iwlist scan on an active AP interface temporarily takes it out of AP mode,
# causing the SSID to disappear and hostapd to crash/restart.
# Use wlan1 (USB WiFi client) for scanning instead.
SCAN_INTERFACE=""

# Threshold: if current channel has more than this many networks, consider switching
CONGESTION_THRESHOLD=3

# Hotspot TX power (dBm). Default 31 dBm is too strong for a 2-3m remote control use case.
# Reducing to 15 dBm minimizes 2.4GHz self-interference with wlan1 and neighboring networks.
# Override via /home/pi/neopro/config/hotspot-txpower.conf (single line: e.g. "20")
HOTSPOT_TXPOWER=15
TXPOWER_CONF="/home/pi/neopro/config/hotspot-txpower.conf"

# Cached scan results — ONE scan, parsed multiple times.
# RTL8192EU is single-radio: each iwlist scan drops carrier for ~6s.
# Previous code ran 5 scans in ~25s → guaranteed carrier loss + 2-3 min outage.
CACHED_SCAN=""

# Detect the best interface for WiFi scanning (NOT the AP interface)
detect_scan_interface() {
    # Prefer wlan1 (USB WiFi dongle, used as client for internet)
    if ip link show wlan1 &>/dev/null; then
        SCAN_INTERFACE="wlan1"
        log "Using wlan1 for WiFi scanning (safe — not the AP interface)"
        return 0
    fi

    # No alternative interface — we must stop hostapd briefly to scan on wlan0
    SCAN_INTERFACE="wlan0"
    log "WARNING: No wlan1 available — will briefly stop hostapd to scan on wlan0"
    return 1
}

# Wait for wlan1 to obtain an IP address before scanning.
# RTL8192EU USB dongle takes 15-30s for WPA auth + DHCP at boot.
# Scanning before the connection is established has no benefit and
# can prevent the WPA association from completing.
wait_for_wlan1_ready() {
    local max_wait=30
    local waited=0
    log "Waiting for wlan1 to obtain IP (max ${max_wait}s)..."
    while [ $waited -lt $max_wait ]; do
        if ip addr show wlan1 2>/dev/null | grep -q "inet "; then
            log "wlan1 is ready (IP obtained after ${waited}s)"
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
    done
    log "WARNING: wlan1 did not obtain IP after ${max_wait}s — scanning may disrupt connection"
    return 1
}

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

# Perform a SINGLE WiFi scan and cache results in CACHED_SCAN.
# All subsequent channel queries parse the cache — no additional scans.
perform_single_scan() {
    log "Performing single WiFi scan on $SCAN_INTERFACE..."
    CACHED_SCAN=$(iwlist "$SCAN_INTERFACE" scan 2>/dev/null)
    if [ -z "$CACHED_SCAN" ]; then
        log "WARNING: Scan returned no results"
        return 1
    fi
    log "Scan completed successfully"
    return 0
}

# Count networks on a specific channel from CACHED scan results.
# Does NOT trigger a new scan — parses CACHED_SCAN populated by perform_single_scan().
count_networks_on_channel() {
    local channel=$1
    local count=$(echo "$CACHED_SCAN" | grep -E "Channel:$channel\$" | wc -l)
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
        # Write directly to log file (NOT via log() which uses tee → stdout)
        # stdout is captured by $(find_best_channel), so log() would pollute the return value
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Channel $channel: $count networks detected" >> "$LOG_FILE"

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

# Fix deprecated TKIP cipher → CCMP (AES)
# TKIP was deployed in early images but modern phones (Android 12+, iOS 16+)
# reject TKIP and show "wrong password" errors.
# This fix propagates to the fleet via OTA (hotspot-optimizer.sh is deployed).
fix_tkip_cipher() {
    if grep -q "wpa_pairwise=TKIP" "$HOSTAPD_CONF"; then
        log "SECURITY FIX: Replacing deprecated TKIP with CCMP (AES)"
        sed -i 's/wpa_pairwise=TKIP/wpa_pairwise=CCMP/' "$HOSTAPD_CONF"
        log "wpa_pairwise changed from TKIP to CCMP"
        return 0  # Changed — caller should restart hostapd
    fi
    return 1  # No change needed
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

    # Fix TKIP → CCMP before any channel optimization
    local tkip_fixed=false
    local hostapd_restarted=false
    if fix_tkip_cipher; then
        tkip_fixed=true
    fi

    # Get current channel
    current_channel=$(get_current_channel)
    if [ -z "$current_channel" ]; then
        current_channel=6
        log "No channel configured, assuming default: $current_channel"
    else
        log "Current hotspot channel: $current_channel"
    fi

    # Detect safe scan interface (wlan1 preferred, wlan0 fallback)
    local must_stop_hostapd=false
    detect_scan_interface
    if [ "$SCAN_INTERFACE" = "wlan0" ]; then
        must_stop_hostapd=true
    fi

    # Wait for wlan1 to fully connect before scanning (WPA auth + DHCP).
    # RTL8192EU single-radio USB dongle drops carrier during iwlist scan,
    # so we wait for a stable connection to survive the single scan.
    if [ "$SCAN_INTERFACE" = "wlan1" ]; then
        wait_for_wlan1_ready
    fi

    # Scan for networks
    log "Scanning WiFi environment on $SCAN_INTERFACE..."

    # If scanning on wlan0 (AP), stop hostapd first to release the interface
    if [ "$must_stop_hostapd" = true ]; then
        log "Stopping hostapd to scan on wlan0..."
        systemctl stop hostapd 2>/dev/null || true
        sleep 2
    fi

    # Perform ONE scan and cache results — count_networks_on_channel() and
    # find_best_channel() parse the cache instead of triggering new scans.
    # Previous code ran 5 scans in ~25s, each disconnecting wlan1 for ~6s.
    perform_single_scan

    # Detect wlan1 channel for self-interference check
    wlan1_ch=$(get_wlan1_channel)

    # Count networks on current channel (from cached scan — no new scan)
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

            # Restart hostapd to apply new channel (and TKIP fix if applicable)
            log "Restarting hostapd..."
            systemctl restart hostapd
            hostapd_restarted=true

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

    # Ensure hostapd is running after all operations:
    # - If we stopped it for scanning on wlan0, it needs to be restarted
    # - If TKIP was fixed, hostapd needs a restart to apply the cipher change
    # - If channel was changed above, hostapd was already restarted — skip
    if [ "$hostapd_restarted" != true ]; then
        if [ "$tkip_fixed" = true ]; then
            log "Restarting hostapd to apply TKIP → CCMP cipher fix..."
            systemctl restart hostapd
        elif [ "$must_stop_hostapd" = true ]; then
            log "Restarting hostapd after scan on wlan0..."
            systemctl start hostapd
        fi

        if ! systemctl is-active --quiet hostapd; then
            log "ERROR: hostapd is not running — attempting start..."
            systemctl start hostapd
            sleep 2
            if systemctl is-active --quiet hostapd; then
                log "SUCCESS: hostapd recovered"
            else
                log "ERROR: hostapd failed to start — check config"
            fi
        else
            log "hostapd is active"
        fi
    fi

    # Apply TX power reduction to minimize self-interference
    apply_txpower

    log "Hotspot optimizer completed"
    log "=========================================="
}

# Apply configured TX power to hotspot interface
# Reduces 2.4GHz interference with wlan1 and neighbors without affecting
# remote control range (staff connect from 2-3m away)
apply_txpower() {
    # Read override from config file if it exists
    if [ -f "$TXPOWER_CONF" ]; then
        local custom_power
        custom_power=$(head -1 "$TXPOWER_CONF" 2>/dev/null | tr -d '[:space:]')
        if [[ "$custom_power" =~ ^[0-9]+$ ]] && [ "$custom_power" -ge 1 ] && [ "$custom_power" -le 31 ]; then
            HOTSPOT_TXPOWER=$custom_power
            log "TX power override from config: ${HOTSPOT_TXPOWER} dBm"
        fi
    fi

    # Get current TX power
    local current_power
    current_power=$(iw dev "$WIFI_INTERFACE" info 2>/dev/null | grep -oP 'txpower \K[0-9.]+' | cut -d. -f1)

    if [ -n "$current_power" ] && [ "$current_power" -ne "$HOTSPOT_TXPOWER" ] 2>/dev/null; then
        log "Reducing hotspot TX power: ${current_power} dBm → ${HOTSPOT_TXPOWER} dBm"
        if iw dev "$WIFI_INTERFACE" set txpower fixed "${HOTSPOT_TXPOWER}00" 2>/dev/null; then
            log "TX power set to ${HOTSPOT_TXPOWER} dBm"
        else
            log "WARNING: Failed to set TX power (interface may not support it)"
        fi
    elif [ -n "$current_power" ]; then
        log "TX power already at ${HOTSPOT_TXPOWER} dBm"
    fi
}

main "$@"
