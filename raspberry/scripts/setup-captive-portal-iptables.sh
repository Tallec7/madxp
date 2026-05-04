#!/bin/bash
# =============================================================================
# Setup Captive Portal iptables rules for Android HTTPS connectivity checks
# =============================================================================
#
# ADR-079 Phase 1 — DNAT HTTP uniquement (port 80).
#
# Historique : on redirigeait aussi le 443 vers nginx:80, mais ça casse le
# handshake TLS sur captive.apple.com → iOS affiche une page blanche dans
# la sheet "Captive Wi-Fi". Retiré pour laisser le TLS échouer proprement
# (RST), ce qui fait reculer iOS sur la détection HTTP /hotspot-detect.html.
#
# Solution : intercepter uniquement le HTTP (port 80) des clients hotspot
# (wlan0) et le rediriger vers nginx (port 80) sur le Pi. iOS/Android
# utilisent des probes HTTP pour la détection de captive portal.
#
# Usage : sudo ./setup-captive-portal-iptables.sh
#         Appelé automatiquement par install.sh
#
# Idempotent : peut être exécuté plusieurs fois sans créer de doublons
# =============================================================================

set -euo pipefail

AP_INTERFACE="${AP_INTERFACE:-wlan0}"
UPLINK_INTERFACE="${UPLINK_INTERFACE:-wlan1}"
HOTSPOT_IP="192.168.4.1"
NGINX_PORT="80"

# Couleurs (optionnel — silencieux si appelé depuis un autre script)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[✓]${NC} $1" 2>/dev/null || echo "[✓] $1"; }
log_info() { echo -e "${YELLOW}[i]${NC} $1" 2>/dev/null || echo "[i] $1"; }
log_err()  { echo -e "${RED}[✗]${NC} $1" 2>/dev/null || echo "[✗] $1"; }

# =============================================================================
# Détection du backend firewall (iptables ou nftables)
# Debian ≤12 Bookworm → iptables disponible
# Debian 13 Trixie   → iptables supprimé, nftables uniquement
# =============================================================================

FIREWALL_BACKEND=""
if command -v iptables &>/dev/null; then
    FIREWALL_BACKEND="iptables"
elif command -v nft &>/dev/null; then
    FIREWALL_BACKEND="nftables"
else
    log_err "Ni iptables ni nft disponible — captive portal Android impossible"
    exit 1
fi

NFT_TABLE="neopro_captive"

# =============================================================================
# iptables backend
# =============================================================================

iptables_cleanup() {
    while iptables -t nat -D PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; do :; done
    while iptables -t nat -D PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; do :; done
    while iptables -t nat -D POSTROUTING -s 192.168.4.0/24 -o "$UPLINK_INTERFACE" -j MASQUERADE 2>/dev/null; do :; done
}

iptables_install() {
    iptables -t nat -A PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}"
    iptables -t nat -A POSTROUTING -s 192.168.4.0/24 -o "$UPLINK_INTERFACE" -j MASQUERADE
}

iptables_verify() {
    iptables -t nat -C PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null
}

# =============================================================================
# nftables backend (Debian 13 Trixie)
# =============================================================================

nftables_cleanup() {
    nft delete table ip "$NFT_TABLE" 2>/dev/null || true
}

nftables_install() {
    nft add table ip "$NFT_TABLE"
    nft add chain ip "$NFT_TABLE" prerouting '{ type nat hook prerouting priority -100 ; }'
    nft add rule ip "$NFT_TABLE" prerouting iifname "$AP_INTERFACE" tcp dport 80 dnat to "${HOTSPOT_IP}:${NGINX_PORT}"
    nft add chain ip "$NFT_TABLE" postrouting '{ type nat hook postrouting priority 100 ; }'
    nft add rule ip "$NFT_TABLE" postrouting ip saddr 192.168.4.0/24 oifname "$UPLINK_INTERFACE" masquerade
}

nftables_verify() {
    nft list ruleset 2>/dev/null | grep -q "dnat.*${HOTSPOT_IP}.*:${NGINX_PORT}"
}

# =============================================================================
# Main
# =============================================================================

# Activer le routage IP (prérequis pour que le NAT fonctionne)
echo 1 > /proc/sys/net/ipv4/ip_forward
if ! grep -q "net.ipv4.ip_forward" /etc/sysctl.d/99-neopro-hotspot.conf 2>/dev/null; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.d/99-neopro-hotspot.conf
fi
log_ok "ip_forward activé (routage hotspot → internet)"

if [[ "$FIREWALL_BACKEND" == "iptables" ]]; then
    iptables_cleanup
    iptables_install
    if iptables_verify; then
        log_ok "Captive portal iptables actif (HTTP → nginx sur ${AP_INTERFACE}, ADR-079)"
    else
        log_err "Erreur lors de l'installation des règles iptables"
        exit 1
    fi
else
    nftables_cleanup
    nftables_install
    if nftables_verify; then
        log_ok "Captive portal nftables actif (HTTP → nginx sur ${AP_INTERFACE}, ADR-079)"
        # Persister les règles pour survivre au reboot
        nft list ruleset > /etc/nftables.conf
        systemctl enable nftables 2>/dev/null || true
        log_ok "Règles nftables persistées (/etc/nftables.conf)"
    else
        log_err "Erreur lors de l'installation des règles nftables"
        exit 1
    fi
fi
