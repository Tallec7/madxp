#!/bin/bash

################################################################################
# Script de vérification santé Neopro
# Vérifie rapidement l'état du système
#
# Usage: ./healthcheck.sh
################################################################################

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/home/pi/neopro"
STATUS_OK=0
STATUS_WARNING=0
STATUS_ERROR=0

print_ok() {
    echo -e "${GREEN}✓${NC} $1"
    STATUS_OK=$((STATUS_OK + 1))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    STATUS_WARNING=$((STATUS_WARNING + 1))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    STATUS_ERROR=$((STATUS_ERROR + 1))
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           NEOPRO - VÉRIFICATION SYSTÈME                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Système
echo -e "${BLUE}SYSTÈME${NC}"
echo "────────"
HOSTNAME=$(hostname)
UPTIME=$(uptime -p 2>/dev/null || uptime)
print_info "Hostname: $HOSTNAME"
print_info "Uptime: $UPTIME"

# Température
if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    TEMP=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
    if [ "$TEMP" -lt 70 ]; then
        print_ok "Température: ${TEMP}°C"
    elif [ "$TEMP" -lt 80 ]; then
        print_warning "Température élevée: ${TEMP}°C"
    else
        print_error "Température critique: ${TEMP}°C"
    fi
fi

# Espace disque
DISK_USAGE=$(df "$INSTALL_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h "$INSTALL_DIR" | tail -1 | awk '{print $4}')
if [ "$DISK_USAGE" -lt 80 ]; then
    print_ok "Espace disque: ${DISK_AVAIL} disponible (${DISK_USAGE}% utilisé)"
elif [ "$DISK_USAGE" -lt 90 ]; then
    print_warning "Espace disque: ${DISK_AVAIL} disponible (${DISK_USAGE}% utilisé)"
else
    print_error "Espace disque faible: ${DISK_AVAIL} disponible (${DISK_USAGE}% utilisé)"
fi

# Mémoire
MEM_TOTAL=$(free -h | awk 'NR==2 {print $2}')
MEM_USED=$(free -h | awk 'NR==2 {print $3}')
MEM_PERCENT=$(free | awk 'NR==2 {printf "%.0f", ($3/$2) * 100}')
if [ "$MEM_PERCENT" -lt 80 ]; then
    print_ok "Mémoire: ${MEM_USED}/${MEM_TOTAL} (${MEM_PERCENT}%)"
else
    print_warning "Mémoire: ${MEM_USED}/${MEM_TOTAL} (${MEM_PERCENT}%)"
fi

echo ""

# Services
echo -e "${BLUE}SERVICES${NC}"
echo "────────"
SERVICES=("neopro-app" "neopro-admin" "nginx" "hostapd" "dnsmasq" "avahi-daemon")
for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service"; then
        print_ok "$service"
    else
        print_error "$service (arrêté)"
    fi
done

echo ""

# Réseau
echo -e "${BLUE}RÉSEAU${NC}"
echo "──────"

# Interface wlan0
if ip addr show wlan0 &>/dev/null; then
    WLAN0_IP=$(ip -4 addr show wlan0 | grep inet | awk '{print $2}' | cut -d/ -f1)
    if [ "$WLAN0_IP" == "192.168.4.1" ]; then
        print_ok "wlan0: $WLAN0_IP (Hotspot)"
    else
        print_warning "wlan0: $WLAN0_IP (IP inattendue)"
    fi
else
    print_error "wlan0: interface non trouvée"
fi

# mDNS
if systemctl is-active --quiet avahi-daemon; then
    print_ok "mDNS: neopro.local"
else
    print_error "mDNS: non disponible"
fi

echo ""

# Application
echo -e "${BLUE}APPLICATION${NC}"
echo "───────────"

# Fichiers webapp
if [ -f "$INSTALL_DIR/webapp/index.html" ]; then
    print_ok "Application web installée"
else
    print_error "Application web manquante"
fi

# Fichiers serveur
if [ -f "$INSTALL_DIR/server/server.js" ]; then
    if [ -d "$INSTALL_DIR/server/node_modules" ]; then
        print_ok "Serveur Node.js installé"
    else
        print_warning "Serveur Node.js: dépendances manquantes"
    fi
else
    print_error "Serveur Node.js manquant"
fi

# Admin
if [ -f "$INSTALL_DIR/admin/admin-server.js" ]; then
    if [ -d "$INSTALL_DIR/admin/node_modules" ]; then
        print_ok "Admin panel installé"
    else
        print_warning "Admin panel: dépendances manquantes"
    fi
else
    print_error "Admin panel manquant"
fi

# Vidéos
VIDEO_COUNT=$(find "$INSTALL_DIR/videos" -type f \( -name "*.mp4" -o -name "*.mkv" -o -name "*.mov" \) 2>/dev/null | wc -l)
if [ "$VIDEO_COUNT" -gt 0 ]; then
    print_ok "$VIDEO_COUNT vidéo(s) disponible(s)"
else
    print_warning "Aucune vidéo trouvée"
fi

echo ""

# Tests de connectivité
echo -e "${BLUE}CONNECTIVITÉ${NC}"
echo "────────────"

# HTTP (port 80)
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost/ | grep -q "200"; then
    print_ok "HTTP (port 80)"
else
    print_error "HTTP (port 80) non accessible"
fi

# Socket.IO (port 3000)
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:3000/ | grep -q "200"; then
    print_ok "Socket.IO (port 3000)"
else
    print_error "Socket.IO (port 3000) non accessible"
fi

# Admin (port 8080)
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:8080/ | grep -q "200"; then
    print_ok "Admin Panel (port 8080)"
else
    print_error "Admin Panel (port 8080) non accessible"
fi

echo ""

# Résumé
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                         RÉSUMÉ                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ OK:${NC} $STATUS_OK"
echo -e "${YELLOW}⚠ Avertissements:${NC} $STATUS_WARNING"
echo -e "${RED}✗ Erreurs:${NC} $STATUS_ERROR"
echo ""

if [ "$STATUS_ERROR" -gt 0 ]; then
    echo -e "${RED}Des problèmes ont été détectés.${NC}"
    echo "Lancez le script de récupération pour les réparer:"
    echo "  sudo /home/pi/raspberry/tools/recovery.sh --auto"
    EXIT_CODE=2
elif [ "$STATUS_WARNING" -gt 0 ]; then
    echo -e "${YELLOW}Quelques avertissements nécessitent votre attention.${NC}"
    EXIT_CODE=1
else
    echo -e "${GREEN}Le système fonctionne correctement!${NC}"
    EXIT_CODE=0
fi

echo ""

# URLs d'accès
if [ "$STATUS_ERROR" -eq 0 ]; then
    echo -e "${BLUE}ACCÈS:${NC}"
    echo "  • Application: http://neopro.local"
    echo "  • Mode TV: http://neopro.local/tv"
    echo "  • Remote: http://neopro.local/remote"
    echo "  • Admin: http://neopro.local:8080"
    echo ""
fi

exit $EXIT_CODE
