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
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[✓]${NC} $1" 2>/dev/null || echo "[✓] $1"; }
log_info() { echo -e "${YELLOW}[i]${NC} $1" 2>/dev/null || echo "[i] $1"; }

# =============================================================================
# Nettoyage des anciennes règles (idempotence)
# =============================================================================

cleanup_existing_rules() {
    # Supprimer les règles PREROUTING existantes pour wlan0 port 80/443
    while iptables -t nat -D PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; do :; done
    while iptables -t nat -D PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; do :; done

    # Supprimer les règles POSTROUTING MASQUERADE pour le subnet hotspot
    while iptables -t nat -D POSTROUTING -s 192.168.4.0/24 -o "$AP_INTERFACE" -j MASQUERADE 2>/dev/null; do :; done
}

# =============================================================================
# Installation des règles
# =============================================================================

install_rules() {
    # Rediriger HTTP (port 80) des clients hotspot vers nginx local
    # Intercepte les connectivity checks Android/iOS/Windows en HTTP
    iptables -t nat -A PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}"

    # Rediriger HTTPS (port 443) des clients hotspot vers nginx local port 80
    # C'est LA règle critique : Android fait ses checks en HTTPS depuis ~Android 10.
    # Sans cette règle, le check HTTPS timeout → Android bascule sur la 4G.
    # Avec cette règle, nginx répond en HTTP sur le port 443 → Android détecte
    # un captive portal et propose "Se connecter au réseau".
    iptables -t nat -A PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}"

    # MASQUERADE pour les paquets du subnet hotspot
    # Nécessaire pour que les réponses reviennent correctement aux clients
    iptables -t nat -A POSTROUTING -s 192.168.4.0/24 -o "$AP_INTERFACE" -j MASQUERADE
}

# =============================================================================
# Vérification
# =============================================================================

verify_rules() {
    local ok=true

    if ! iptables -t nat -C PREROUTING -i "$AP_INTERFACE" -p tcp --dport 80 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; then
        ok=false
    fi

    if ! iptables -t nat -C PREROUTING -i "$AP_INTERFACE" -p tcp --dport 443 -j DNAT --to-destination "${HOTSPOT_IP}:${NGINX_PORT}" 2>/dev/null; then
        ok=false
    fi

    if [ "$ok" = true ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

cleanup_existing_rules
install_rules

if verify_rules; then
    log_ok "Captive portal iptables actif (HTTP+HTTPS → nginx sur ${AP_INTERFACE})"
else
    log_info "Erreur lors de l'installation des règles iptables"
    exit 1
fi
