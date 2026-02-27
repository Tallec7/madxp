#!/usr/bin/env bash
# -----------------------------------------------------------------
# neopro-led-status.sh — E-23 US-23.2.3: Activity LED pattern
#
# Controls the Raspberry Pi onboard activity LED to signal HDMI status:
#   - HDMI connected: LED heartbeat (default kernel trigger)
#   - No HDMI:        LED slow blink (1s on / 1s off)
#   - Wrong port:     LED fast blink (200ms on / 200ms off)
#
# Usage: Called by kiosk-watchdog.sh via set_led_pattern <pattern>
#   Patterns: heartbeat | slow-blink | fast-blink | default
#
# Requires: root (sudo) for /sys/class/leds writes
# -----------------------------------------------------------------
set -euo pipefail

# Detect LED path (Pi 5 vs Pi 4)
if [ -d /sys/class/leds/ACT ]; then
  LED_PATH="/sys/class/leds/ACT"
elif [ -d /sys/class/leds/led0 ]; then
  LED_PATH="/sys/class/leds/led0"
else
  echo "[LED] No activity LED found — skipping" >&2
  exit 0
fi

PATTERN="${1:-default}"

set_trigger() {
  echo "$1" | sudo tee "$LED_PATH/trigger" > /dev/null 2>&1 || true
}

set_brightness() {
  echo "$1" | sudo tee "$LED_PATH/brightness" > /dev/null 2>&1 || true
}

set_timer() {
  local delay_on="$1"
  local delay_off="$2"
  set_trigger "timer"
  echo "$delay_on"  | sudo tee "$LED_PATH/delay_on"  > /dev/null 2>&1 || true
  echo "$delay_off"  | sudo tee "$LED_PATH/delay_off" > /dev/null 2>&1 || true
}

case "$PATTERN" in
  heartbeat)
    # Normal operation: kernel heartbeat trigger
    set_trigger "heartbeat"
    ;;
  slow-blink)
    # No HDMI connected: 1s on / 1s off
    set_timer 1000 1000
    ;;
  fast-blink)
    # Wrong HDMI port: 200ms on / 200ms off
    set_timer 200 200
    ;;
  default|*)
    # Restore kernel default (mmc0 = SD card activity)
    set_trigger "mmc0"
    ;;
esac
