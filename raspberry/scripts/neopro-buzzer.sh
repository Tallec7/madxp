#!/usr/bin/env bash
# -----------------------------------------------------------------
# neopro-buzzer.sh — E-23 US-23.2.4: Audio alert via PWM buzzer
#
# Emits short beeps on a passive buzzer connected to GPIO 18 (PWM0)
# to signal HDMI disconnection events.
#
# Usage: neopro-buzzer.sh <pattern>
#   Patterns:
#     single    — 1 short beep  (HDMI reconnected / info)
#     double    — 2 short beeps (wrong HDMI port)
#     triple    — 3 short beeps (all HDMI lost)
#
# Hardware: Passive buzzer on GPIO 18 (physical pin 12) via NPN transistor
# Requires: /sys/class/pwm/pwmchip0 (hardware PWM, no root needed if exported)
#
# If no PWM hardware is available, the script exits silently.
# -----------------------------------------------------------------
set -euo pipefail

PWM_CHIP="/sys/class/pwm/pwmchip0"
PWM_CHANNEL="0"
PWM_PATH="$PWM_CHIP/pwm${PWM_CHANNEL}"
PATTERN="${1:-single}"

# Frequency 2000 Hz = period 500000 ns, duty cycle 50%
PERIOD_NS=500000
DUTY_NS=250000
BEEP_DURATION_MS=150
GAP_MS=100

# Check PWM availability
if [ ! -d "$PWM_CHIP" ]; then
    exit 0
fi

# Export PWM channel if needed
if [ ! -d "$PWM_PATH" ]; then
    echo "$PWM_CHANNEL" > "$PWM_CHIP/export" 2>/dev/null || exit 0
    sleep 0.1
fi

beep() {
    echo "$PERIOD_NS" > "$PWM_PATH/period" 2>/dev/null || return
    echo "$DUTY_NS"   > "$PWM_PATH/duty_cycle" 2>/dev/null || return
    echo 1             > "$PWM_PATH/enable" 2>/dev/null || return
    sleep "$(echo "scale=3; $BEEP_DURATION_MS / 1000" | bc)"
    echo 0             > "$PWM_PATH/enable" 2>/dev/null || return
}

gap() {
    sleep "$(echo "scale=3; $GAP_MS / 1000" | bc)"
}

case "$PATTERN" in
    single)
        beep
        ;;
    double)
        beep; gap; beep
        ;;
    triple)
        beep; gap; beep; gap; beep
        ;;
    *)
        beep
        ;;
esac
