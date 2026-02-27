#!/bin/bash
# Neopro — HDMI hotplug notification handler (E-23 US-23.1.3)
#
# Called by udev rule 99-neopro-hdmi-hotplug.rules on DRM change events.
# Writes a flag file that the kiosk-watchdog.sh checks to trigger
# immediate HDMI status refresh instead of waiting for the next polling cycle.
#
# IMPORTANT: udev handlers run with limited environment and short timeout.
# This script must be fast and non-blocking.

FLAG_FILE="/tmp/hdmi-changed"

# Write timestamp to flag file (atomic via temp file + rename)
TMPFILE=$(mktemp /tmp/.hdmi-changed-XXXXXX 2>/dev/null)
if [ -n "$TMPFILE" ]; then
    echo "$(date +%s)" > "$TMPFILE"
    mv "$TMPFILE" "$FLAG_FILE"
    chmod 644 "$FLAG_FILE"
fi
