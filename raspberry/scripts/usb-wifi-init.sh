#!/bin/bash
# Neopro USB WiFi Initialization Script
# Attend que wlan1 apparaisse au boot, avec recovery USB si nécessaire.
# Sort exit 0 même en cas d'échec pour ne pas bloquer les Pi Ethernet-only.

MAX_WAIT=30
INTERVAL=2

# Fonction helper : stabiliser wlan1 après détection (USB autosuspend + WiFi power save)
stabilize_wlan1() {
  echo "on" > /sys/class/net/wlan1/device/../power/control 2>/dev/null || true
  echo "-1" > /sys/class/net/wlan1/device/../power/autosuspend 2>/dev/null || true
  # Attendre que l'interface soit prête avant iwconfig
  sleep 1
  iwconfig wlan1 power off 2>/dev/null || true
  echo "neopro-usb-wifi: wlan1 stabilized (autosuspend=off, power_mgmt=off)"
}

# Early exit : si wlan1 existe déjà, juste s'assurer que l'autosuspend est off
if ip link show wlan1 &>/dev/null; then
  echo "neopro-usb-wifi: wlan1 already present — stabilizing"
  stabilize_wlan1
  exit 0
fi

echo "neopro-usb-wifi: Waiting for wlan1..."

# Étape 1 : Attendre wlan1 jusqu'à MAX_WAIT secondes
for i in $(seq 1 $((MAX_WAIT / INTERVAL))); do
  if ip link show wlan1 &>/dev/null; then
    echo "neopro-usb-wifi: wlan1 detected after $((i * INTERVAL))s"
    stabilize_wlan1
    exit 0
  fi
  sleep $INTERVAL
done

# Vérifier si un device USB WiFi est physiquement présent
# Si aucun device WiFi USB n'est détecté ET Ethernet est UP → Pi Ethernet-only, skip
usb_wifi_present=false
for usb_dev in /sys/bus/usb/devices/[0-9]*-[0-9]*; do
  if [ -f "$usb_dev/product" ]; then
    product=$(cat "$usb_dev/product" 2>/dev/null)
    case "$product" in
      *[Ww]ireless*|*[Ww]ifi*|*[Ww]LAN*|*802.11*) usb_wifi_present=true; break ;;
    esac
  fi
done

if [ "$usb_wifi_present" = false ]; then
  if ip addr show eth0 2>/dev/null | grep -q "inet " && ip addr show eth0 2>/dev/null | grep -q "state UP"; then
    echo "neopro-usb-wifi: No USB WiFi dongle detected and eth0 is UP — Ethernet-only Pi, skipping recovery"
    exit 0
  fi
fi

echo "neopro-usb-wifi: wlan1 not found after ${MAX_WAIT}s — attempting USB recovery"

# Étape 2 : Tenter modprobe des modules WiFi USB connus
# rtl8xxxu en premier — c'est le driver principal RTL8192EU en prod
for module in rtl8xxxu rt2800usb ath9k_htc rtl8188eu rtl8192cu 8188eu; do
  if modinfo "$module" &>/dev/null; then
    echo "neopro-usb-wifi: Reloading module $module"
    modprobe -r "$module" 2>/dev/null || true
    sleep 2
    modprobe "$module" 2>/dev/null || true
    sleep 5
    if ip link show wlan1 &>/dev/null; then
      echo "neopro-usb-wifi: wlan1 recovered via modprobe $module"
      stabilize_wlan1
      exit 0
    fi
  fi
done

# Étape 3 : USB power-cycle des devices WiFi détectés
for usb_dev in /sys/bus/usb/devices/[0-9]*-[0-9]*; do
  if [ -f "$usb_dev/product" ]; then
    product=$(cat "$usb_dev/product" 2>/dev/null)
    case "$product" in
      *[Ww]ireless*|*[Ww]ifi*|*[Ww]LAN*|*802.11*)
        dev_id=$(basename "$usb_dev")
        echo "neopro-usb-wifi: Power cycling USB device $dev_id ($product)"
        echo "$dev_id" > /sys/bus/usb/drivers/usb/unbind 2>/dev/null || true
        sleep 3
        echo "$dev_id" > /sys/bus/usb/drivers/usb/bind 2>/dev/null || true
        sleep 5
        if ip link show wlan1 &>/dev/null; then
          echo "neopro-usb-wifi: wlan1 recovered via USB power cycle"
          stabilize_wlan1
          exit 0
        fi
        ;;
    esac
  fi
done

echo "neopro-usb-wifi: FAILED — wlan1 not available (hardware failure or no USB WiFi dongle)"
# Exit 0 pour ne pas bloquer le boot
exit 0
