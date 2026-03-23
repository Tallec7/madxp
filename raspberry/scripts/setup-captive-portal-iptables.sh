#!/bin/bash
# =============================================================================
# Setup Captive Portal iptables rules for Android HTTPS connectivity checks
# =============================================================================
#
# Problème : Android fait ses checks de connectivité en HTTPS (port 443).
# Le Pi ne répond pas en HTTPS, donc Android conclut "pas d'internet" et
# bascule automatiquement sur les données mobiles → le hotspot est ignoré.
#
# Solution : Intercepter le trafic HTTP/HTTPS des clients hotspot (wlan0)
# et le rediriger vers nginx (port 80) sur le Pi. Android reçoit une
# réponse HTTP sur son check HTTPS → détecte un captive portal → affiche
# "Se connecter au réseau" automatiquement (comme dans un hôtel/aéroport).
#
# Usage : sudo ./setup-captive-portal-iptables.sh
#         Appelé automatiquement par install.sh et hotspot-watchdog.sh
#
# Idempotent : peut être exécuté plusieurs fois sans créer de doublons
# =============================================================================

set -euo pipefail

AP_INTERFACE="${AP_INTERFACE:-wlan0}"
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
    while iptables -t nat -D POSTROUTING -s 192.168.4.0/24 -o "$AP_INTERFACE" -j MASQUERADE 2>/dev/null; do :; done
}

iptables_install() {
    iptables -t nat -A PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}"
    iptables -t nat -A PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}"
    iptables -t nat -A POSTROUTING -s 192.168.4.0/24 -o "$AP_INTERFACE" -j MASQUERADE
}

iptables_verify() {
    iptables -t nat -C PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null &&
    iptables -t nat -C PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null
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
    nft add rule ip "$NFT_TABLE" prerouting iifname "$AP_INTERFACE" tcp dport 443 dnat to "${HOTSPOT_IP}:${NGINX_PORT}"
    nft add chain ip "$NFT_TABLE" postrouting '{ type nat hook postrouting priority 100 ; }'
    nft add rule ip "$NFT_TABLE" postrouting ip saddr 192.168.4.0/24 oifname "$AP_INTERFACE" masquerade
}

nftables_verify() {
    nft list ruleset 2>/dev/null | grep -q "dnat.*${HOTSPOT_IP}.*:${NGINX_PORT}"
}

# =============================================================================
# Main
# =============================================================================

if [[ "$FIREWALL_BACKEND" == "iptables" ]]; then
    iptables_cleanup
    iptables_install
    if iptables_verify; then
        log_ok "Captive portal iptables actif (HTTP+HTTPS → nginx sur ${AP_INTERFACE})"
    else
        log_err "Erreur lors de l'installation des règles iptables"
        exit 1
    fi
else
    nftables_cleanup
    nftables_install
    if nftables_verify; then
        log_ok "Captive portal nftables actif (HTTP+HTTPS → nginx sur ${AP_INTERFACE})"
    else
        log_err "Erreur lors de l'installation des règles nftables"
        exit 1
    fi
fi
