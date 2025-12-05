#!/bin/bash

################################################################################
# Script de diagnostic pour Raspberry Pi Neopro
# Ce script vérifie l'état du système et identifie les problèmes courants
#
# Usage: ./diagnose-pi.sh
################################################################################

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         DIAGNOSTIC NEOPRO RASPBERRY PI                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_section() {
    echo -e "\n${BLUE}═══ $1 ═══${NC}"
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

check_service() {
    local SERVICE_NAME="$1"
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        print_success "Service ${SERVICE_NAME} : actif"
        return 0
    else
        print_error "Service ${SERVICE_NAME} : inactif"
        echo "  Statut détaillé :"
        systemctl status "${SERVICE_NAME}" --no-pager -l | head -n 10
        echo "  Derniers logs :"
        journalctl -u "${SERVICE_NAME}" -n 15 --no-pager
        return 1
    fi
}

check_file_exists() {
    local FILE_PATH="$1"
    local DESCRIPTION="$2"
    if [ -f "${FILE_PATH}" ]; then
        print_success "${DESCRIPTION} : présent (${FILE_PATH})"
        return 0
    else
        print_error "${DESCRIPTION} : manquant (${FILE_PATH})"
        return 1
    fi
}

check_directory_exists() {
    local DIR_PATH="$1"
    local DESCRIPTION="$2"
    if [ -d "${DIR_PATH}" ]; then
        local FILE_COUNT=$(find "${DIR_PATH}" -type f 2>/dev/null | wc -l)
        print_success "${DESCRIPTION} : présent (${FILE_COUNT} fichiers)"
        return 0
    else
        print_error "${DESCRIPTION} : manquant (${DIR_PATH})"
        return 1
    fi
}

check_port() {
    local PORT="$1"
    local DESCRIPTION="$2"
    if netstat -tuln 2>/dev/null | grep -q ":${PORT} " || ss -tuln 2>/dev/null | grep -q ":${PORT} "; then
        print_success "${DESCRIPTION} : écoute sur le port ${PORT}"
        return 0
    else
        print_error "${DESCRIPTION} : n'écoute PAS sur le port ${PORT}"
        return 1
    fi
}

check_webapp_files() {
    local WEBAPP_DIR="/home/pi/neopro/webapp"

    if [ ! -d "${WEBAPP_DIR}" ]; then
        print_error "Répertoire webapp manquant : ${WEBAPP_DIR}"
        return 1
    fi

    # Vérifier les fichiers Angular essentiels
    local ISSUES=0

    if [ ! -f "${WEBAPP_DIR}/index.html" ]; then
        print_error "index.html manquant dans ${WEBAPP_DIR}"
        ((ISSUES++))
    else
        print_success "index.html présent"
    fi

    # Vérifier qu'il y a des fichiers .js
    local JS_COUNT=$(find "${WEBAPP_DIR}" -name "*.js" -type f 2>/dev/null | wc -l)
    if [ "${JS_COUNT}" -eq 0 ]; then
        print_error "Aucun fichier JavaScript trouvé dans webapp"
        ((ISSUES++))
    else
        print_success "Fichiers JavaScript présents (${JS_COUNT} fichiers)"
    fi

    return ${ISSUES}
}

################################################################################
# EXÉCUTION DU DIAGNOSTIC
################################################################################

print_header

# 1. Vérification des services systemd
print_section "1. Services systemd"
SERVICES_OK=true
check_service "neopro-app" || SERVICES_OK=false
check_service "neopro-admin" || SERVICES_OK=false
check_service "nginx" || SERVICES_OK=false
check_service "hostapd" || SERVICES_OK=false
check_service "dnsmasq" || SERVICES_OK=false
check_service "avahi-daemon" || SERVICES_OK=false

# 2. Vérification des ports
print_section "2. Ports réseau"
PORTS_OK=true
check_port "80" "Nginx (HTTP)" || PORTS_OK=false
check_port "3000" "Socket.IO Server" || PORTS_OK=false
check_port "8080" "Admin Interface" || PORTS_OK=false

# 3. Vérification des fichiers et répertoires
print_section "3. Fichiers et répertoires"
FILES_OK=true
check_directory_exists "/home/pi/neopro" "Répertoire principal Neopro" || FILES_OK=false
check_directory_exists "/home/pi/neopro/webapp" "Application web Angular" || FILES_OK=false
check_directory_exists "/home/pi/neopro/server" "Serveur Socket.IO" || FILES_OK=false
check_directory_exists "/home/pi/neopro/admin" "Interface admin" || FILES_OK=false
check_directory_exists "/home/pi/neopro/videos" "Répertoire vidéos" || FILES_OK=false

check_file_exists "/home/pi/neopro/webapp/index.html" "index.html Angular" || FILES_OK=false
check_file_exists "/home/pi/neopro/server/server.js" "Serveur Socket.IO" || FILES_OK=false
check_file_exists "/home/pi/neopro/admin/admin-server.js" "Serveur Admin" || FILES_OK=false

# 4. Vérification détaillée de l'application Angular
print_section "4. Application Angular (webapp)"
check_webapp_files || FILES_OK=false

# 5. Configuration Nginx
print_section "5. Configuration Nginx"
if nginx -t 2>&1 | grep -q "successful"; then
    print_success "Configuration Nginx valide"
else
    print_error "Configuration Nginx invalide"
    nginx -t 2>&1
fi

# Vérifier le site-enabled
if [ -L "/etc/nginx/sites-enabled/neopro" ]; then
    print_success "Site Neopro activé dans Nginx"
else
    print_error "Site Neopro NON activé dans Nginx"
fi

# 6. Vérification du réseau WiFi
print_section "6. Réseau WiFi"
WIFI_INTERFACE=$(iw dev 2>/dev/null | awk '/Interface/ {print $2; exit}')
if [ -n "${WIFI_INTERFACE}" ]; then
    print_success "Interface WiFi détectée : ${WIFI_INTERFACE}"

    if iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -q "type AP"; then
        print_success "Mode Access Point actif"

        # Afficher le SSID
        SSID=$(iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep "ssid" | awk '{print $2}')
        if [ -n "${SSID}" ]; then
            print_success "SSID : ${SSID}"
        fi
    else
        print_warning "Mode Access Point non détecté"
    fi

    # Vérifier l'IP
    if ip addr show "${WIFI_INTERFACE}" | grep -q "192.168.4.1"; then
        print_success "IP statique 192.168.4.1 configurée"
    else
        print_error "IP statique 192.168.4.1 NON configurée"
    fi
else
    print_error "Interface WiFi non détectée"
fi

# 7. Test HTTP
print_section "7. Tests HTTP"
echo -n "Test http://localhost ... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200"; then
    print_success "OK (200)"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
    print_error "Échec (code ${HTTP_CODE})"
fi

echo -n "Test http://localhost/tv ... "
TV_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/tv)
if echo "${TV_CODE}" | grep -q "200"; then
    print_success "OK (200)"
else
    print_error "Échec (code ${TV_CODE})"
    echo "  Cela indique que l'application Angular n'est pas déployée ou que le routing ne fonctionne pas"
fi

echo -n "Test http://localhost:8080 ... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200"; then
    print_success "OK (200)"
else
    ADMIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
    print_error "Échec (code ${ADMIN_CODE})"
fi

# 8. Logs récents
print_section "8. Logs récents (dernières erreurs)"
echo "Logs neopro-app :"
journalctl -u neopro-app -n 5 --no-pager 2>/dev/null || echo "  Aucun log récent"

echo -e "\nLogs nginx :"
if [ -f "/home/pi/neopro/logs/nginx-error.log" ]; then
    tail -n 5 /home/pi/neopro/logs/nginx-error.log 2>/dev/null || echo "  Aucune erreur"
else
    echo "  Fichier de log non trouvé"
fi

# 9. Résumé
print_section "9. RÉSUMÉ"
echo ""

ERRORS_FOUND=false

if [ "$SERVICES_OK" = false ]; then
    print_error "Problème avec les services systemd"
    ERRORS_FOUND=true
fi

if [ "$PORTS_OK" = false ]; then
    print_error "Problème avec les ports réseau"
    ERRORS_FOUND=true
fi

if [ "$FILES_OK" = false ]; then
    print_error "Problème avec les fichiers/répertoires"
    echo -e "\n${YELLOW}CAUSE PROBABLE :${NC}"
    echo "L'application Angular n'a pas été déployée sur le Raspberry Pi."
    echo ""
    echo "SOLUTION : Depuis votre ordinateur de développement, exécutez :"
    echo "  1. cd /path/to/neopro"
    echo "  2. npm run build:raspberry"
    echo "  3. npm run deploy:raspberry neopro.local"
    echo ""
    echo "OU manuellement :"
    echo "  1. ng build --configuration=production"
    echo "  2. scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/"
    echo "  3. ssh pi@neopro.local 'sudo systemctl restart nginx'"
    ERRORS_FOUND=true
fi

echo ""
if [ "$ERRORS_FOUND" = false ]; then
    print_success "Tous les tests sont passés !"
else
    print_error "Des problèmes ont été détectés (voir ci-dessus)"
    echo ""
    echo -e "${YELLOW}ACTIONS RECOMMANDÉES :${NC}"
    echo ""
    echo "1. Si l'application web n'est pas déployée :"
    echo "   Depuis votre PC : ./raspberry/scripts/deploy-remote.sh neopro.local"
    echo ""
    echo "2. Si les services ne démarrent pas :"
    echo "   sudo systemctl restart neopro-app"
    echo "   sudo systemctl restart nginx"
    echo ""
    echo "3. Pour voir les logs en temps réel :"
    echo "   sudo journalctl -u neopro-app -f"
    echo ""
fi

echo ""
