#!/bin/bash

################################################################################
# Script de configuration WiFi Client pour Raspberry Pi Neopro
# Permet de connecter le Raspberry au WiFi local du club pour accès SSH distant
#
# Usage: sudo ./setup-wifi-client.sh [SSID] [PASSWORD]
# Exemple: sudo ./setup-wifi-client.sh "WiFi-Club" "motdepasse123"
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

ensure_wpa_service_for_interface() {
    local interface="$1"
    local main_conf="/etc/wpa_supplicant/wpa_supplicant.conf"
    local interface_conf="/etc/wpa_supplicant/wpa_supplicant-${interface}.conf"

    if [ ! -f "${main_conf}" ]; then
        print_warning "Fichier ${main_conf} introuvable - impossible de configurer wpa_supplicant pour ${interface}"
        return 1
    fi

    ln -sf "${main_conf}" "${interface_conf}"

    if systemctl enable "wpa_supplicant@${interface}.service" >/dev/null 2>&1; then
        print_success "Service wpa_supplicant@${interface} activé"
    else
        print_warning "Impossible d'activer wpa_supplicant@${interface} (vérifiez les logs)"
        return 1
    fi

    if systemctl restart "wpa_supplicant@${interface}.service" >/dev/null 2>&1; then
        print_success "Service wpa_supplicant@${interface} redémarré"
    else
        print_warning "Impossible de redémarrer wpa_supplicant@${interface}"
    fi

    if command -v dhcpcd >/dev/null 2>&1; then
        dhcpcd "${interface}" >/dev/null 2>&1 || true
    fi
}

# Vérification root
if [ "$EUID" -ne 0 ]; then
    print_error "Ce script doit être exécuté avec sudo"
    exit 1
fi

# S'assurer que les interfaces WiFi ne sont pas bloquées
rfkill unblock wifi 2>/dev/null || true
rfkill unblock all 2>/dev/null || true

# Paramètres
WIFI_SSID="$1"
WIFI_PASSWORD="$2"

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║      CONFIGURATION WIFI CLIENT POUR ACCÈS DISTANT              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Mode interactif si pas de paramètres
if [ -z "$WIFI_SSID" ]; then
    echo ""
    echo "Cette configuration permet au Raspberry Pi de se connecter au WiFi"
    echo "local du club en plus de son propre Hotspot. Cela permet l'accès"
    echo "SSH distant pour les mises à jour."
    echo ""
    read -p "SSID du WiFi du club: " WIFI_SSID
fi

if [ -z "$WIFI_PASSWORD" ]; then
    read -sp "Mot de passe WiFi: " WIFI_PASSWORD
    echo ""
fi

if [ -z "$WIFI_SSID" ] || [ -z "$WIFI_PASSWORD" ]; then
    print_error "SSID et mot de passe requis"
    exit 1
fi

print_step "Configuration du WiFi client..."

# Backup de la configuration actuelle
if [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
    cp /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant.conf.bak
    print_success "Backup de la configuration existante créé"
fi

# Vérifier si une interface WiFi supplémentaire est disponible
WIFI_INTERFACES=$(ls /sys/class/net/ | grep -E "^wlan" || true)
NUM_WIFI=$(echo "$WIFI_INTERFACES" | wc -l)

if [ $NUM_WIFI -lt 2 ]; then
    print_warning "Une seule interface WiFi détectée"
    echo ""
    echo "Options:"
    echo "1. Utiliser wlan0 pour HOTSPOT ET CLIENT (mode mixte)"
    echo "   → Le Hotspot sera temporairement désactivé quand connecté au WiFi client"
    echo ""
    echo "2. Ajouter un dongle WiFi USB pour avoir 2 interfaces"
    echo "   → wlan0: Hotspot (192.168.4.1)"
    echo "   → wlan1: Client WiFi (IP dynamique)"
    echo ""
    read -p "Mode mixte (wlan0 partagé)? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Configuration annulée"
        echo "Ajoutez un dongle WiFi USB et relancez ce script"
        exit 1
    fi
    WIFI_CLIENT_INTERFACE="wlan0"
    MIXED_MODE=true
else
    # Mode dual WiFi (recommandé)
    echo "$WIFI_INTERFACES" | while read iface; do
        echo "  • $iface"
    done
    WIFI_CLIENT_INTERFACE="wlan1"
    MIXED_MODE=false
    print_success "Dual WiFi détecté: Mode recommandé"
fi

# Configuration wpa_supplicant
print_step "Ajout du réseau WiFi client..."

# Générer le hash PSK pour plus de sécurité
PSK_HASH=$(wpa_passphrase "$WIFI_SSID" "$WIFI_PASSWORD" | grep "psk=" | grep -v "#psk" | cut -d= -f2)

# Ajouter la configuration
cat >> /etc/wpa_supplicant/wpa_supplicant.conf << EOF

# Configuration WiFi Client pour accès distant (ajouté le $(date))
network={
    ssid="$WIFI_SSID"
    psk=$PSK_HASH
    priority=10
    id_str="club_wifi"
}
EOF

print_success "Réseau WiFi ajouté"

# Configuration de l'interface client (si dual WiFi)
if [ "$MIXED_MODE" = false ]; then
    print_step "Configuration de l'interface $WIFI_CLIENT_INTERFACE..."

    # Configuration dhcpcd pour wlan1
    if ! grep -q "interface $WIFI_CLIENT_INTERFACE" /etc/dhcpcd.conf; then
        cat >> /etc/dhcpcd.conf << EOF

# Interface WiFi Client pour accès distant
interface $WIFI_CLIENT_INTERFACE
    # DHCP (IP automatique)
    # Si vous voulez une IP fixe, décommentez et configurez:
    # static ip_address=192.168.1.XXX/24
    # static routers=192.168.1.1
    # static domain_name_servers=192.168.1.1 8.8.8.8
EOF
        print_success "Interface $WIFI_CLIENT_INTERFACE configurée"
    fi
fi

# Redémarrage des services
print_step "Redémarrage des services réseau..."
systemctl daemon-reload

if [ "$MIXED_MODE" = true ]; then
    # En mode mixte, on garde le hotspot actif
    wpa_cli -i wlan0 reconfigure
else
    # En mode dual, on démarre wlan1
    ip link set $WIFI_CLIENT_INTERFACE up || true
    ensure_wpa_service_for_interface "$WIFI_CLIENT_INTERFACE"
fi

sleep 5

# Vérification de la connexion
print_step "Vérification de la connexion..."

if [ "$MIXED_MODE" = true ]; then
    CHECK_INTERFACE="wlan0"
else
    CHECK_INTERFACE="$WIFI_CLIENT_INTERFACE"
fi

if iwconfig $CHECK_INTERFACE 2>/dev/null | grep -q "$WIFI_SSID"; then
    print_success "Connecté au WiFi: $WIFI_SSID"

    # Obtenir l'IP
    IP_ADDRESS=$(ip -4 addr show $CHECK_INTERFACE | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)

    if [ -n "$IP_ADDRESS" ]; then
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║          CONFIGURATION RÉUSSIE                                 ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${BLUE}Informations de connexion:${NC}"
        echo "  • Interface: $CHECK_INTERFACE"
        echo "  • SSID: $WIFI_SSID"
        echo "  • Adresse IP: $IP_ADDRESS"
        echo ""
        echo -e "${YELLOW}Accès SSH distant:${NC}"
        echo "  ssh pi@$IP_ADDRESS"
        echo ""
        if [ "$MIXED_MODE" = true ]; then
            print_warning "Mode mixte activé:"
            echo "  • Hotspot temporairement désactivé pendant la connexion WiFi"
            echo "  • Pour utiliser le Hotspot, déconnectez-vous du WiFi client"
        else
            echo -e "${BLUE}Adresses disponibles:${NC}"
            echo "  • Hotspot (wlan0): 192.168.4.1"
            echo "  • WiFi Client (wlan1): $IP_ADDRESS"
        fi
        echo ""

        # Enregistrer l'IP dans la config
        if [ -f /home/pi/neopro/club-config.json ]; then
            # Ajouter l'IP au fichier de config (si jq est installé)
            if command -v jq &> /dev/null; then
                TMP=$(mktemp)
                jq ".wifiClientIP = \"$IP_ADDRESS\" | .wifiClientSSID = \"$WIFI_SSID\"" /home/pi/neopro/club-config.json > "$TMP"
                mv "$TMP" /home/pi/neopro/club-config.json
                chown pi:pi /home/pi/neopro/club-config.json
            fi
        fi
    else
        print_warning "Connecté mais pas d'adresse IP obtenue"
        echo "Essayez: sudo dhclient $CHECK_INTERFACE"
    fi
else
    print_error "Échec de la connexion au WiFi: $WIFI_SSID"
    echo ""
    echo "Vérifiez:"
    echo "  • Le SSID est correct"
    echo "  • Le mot de passe est correct"
    echo "  • Le WiFi est à portée"
    echo ""
    echo "Logs: sudo journalctl -u wpa_supplicant -f"
    exit 1
fi

echo -e "${GREEN}Configuration terminée!${NC}"
