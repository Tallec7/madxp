#!/bin/bash

################################################################################
# Script de diagnostic pour Raspberry Pi Neopro
# Ce script vérifie l'état complet du système et identifie les problèmes
#
# Usage: ./diagnose-pi.sh              # Mode interactif (couleurs + détails)
#        ./diagnose-pi.sh --json       # Mode JSON (pour exploitation par OTA/dashboard)
#        ./diagnose-pi.sh --quiet      # Mode silencieux (résumé uniquement)
################################################################################

# Configuration
NEOPRO_DIR="/home/pi/neopro"
REQUIRED_NODE_MAJOR=18

# Mode de sortie
OUTPUT_MODE="human"   # human | json | quiet
for arg in "$@"; do
    case "$arg" in
        --json)  OUTPUT_MODE="json" ;;
        --quiet) OUTPUT_MODE="quiet" ;;
    esac
done

# Compteurs globaux
TOTAL_ERRORS=0
TOTAL_WARNINGS=0

# Collecteur JSON (tableau associatif simulé par des variables)
JSON_CHECKS=""

# Couleurs (désactivées en mode json)
if [ "$OUTPUT_MODE" = "human" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

################################################################################
# Fonctions utilitaires
################################################################################

print_header() {
    [ "$OUTPUT_MODE" != "human" ] && return
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         DIAGNOSTIC NEOPRO RASPBERRY PI                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_section() {
    [ "$OUTPUT_MODE" = "json" ] && return
    echo -e "\n${BLUE}═══ $1 ═══${NC}"
}

print_success() {
    [ "$OUTPUT_MODE" = "json" ] && return
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    [ "$OUTPUT_MODE" = "json" ] && return
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    [ "$OUTPUT_MODE" = "json" ] && return
    echo -e "${RED}✗ $1${NC}"
}

# Ajouter un résultat de check au collecteur JSON
# Usage: json_add "category" "check_name" "ok|warn|error" "message"
json_add() {
    local category="$1" name="$2" status="$3" message="$4"
    local entry="{\"category\":\"${category}\",\"name\":\"${name}\",\"status\":\"${status}\",\"message\":\"${message}\"}"
    if [ -z "$JSON_CHECKS" ]; then
        JSON_CHECKS="$entry"
    else
        JSON_CHECKS="${JSON_CHECKS},${entry}"
    fi
}

################################################################################
# Fonctions de vérification
################################################################################

check_service() {
    local SERVICE_NAME="$1"
    if ! systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
        print_warning "Service ${SERVICE_NAME} : non installé"
        json_add "services" "$SERVICE_NAME" "warn" "non installé"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        return 1
    fi
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        print_success "Service ${SERVICE_NAME} : actif"
        json_add "services" "$SERVICE_NAME" "ok" "actif"
        return 0
    else
        print_error "Service ${SERVICE_NAME} : inactif"
        json_add "services" "$SERVICE_NAME" "error" "inactif"
        if [ "$OUTPUT_MODE" = "human" ]; then
            echo "  Statut détaillé :"
            systemctl status "${SERVICE_NAME}" --no-pager -l 2>/dev/null | head -n 10
            echo "  Derniers logs :"
            journalctl -u "${SERVICE_NAME}" -n 15 --no-pager 2>/dev/null
        fi
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi
}

check_file_exists() {
    local FILE_PATH="$1"
    local DESCRIPTION="$2"
    if [ -f "${FILE_PATH}" ]; then
        print_success "${DESCRIPTION} : présent"
        json_add "files" "$DESCRIPTION" "ok" "présent"
        return 0
    else
        print_error "${DESCRIPTION} : manquant (${FILE_PATH})"
        json_add "files" "$DESCRIPTION" "error" "manquant: ${FILE_PATH}"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi
}

check_directory_exists() {
    local DIR_PATH="$1"
    local DESCRIPTION="$2"
    if [ -d "${DIR_PATH}" ]; then
        local FILE_COUNT
        FILE_COUNT=$(find "${DIR_PATH}" -type f 2>/dev/null | wc -l | tr -d ' ')
        print_success "${DESCRIPTION} : présent (${FILE_COUNT} fichiers)"
        json_add "files" "$DESCRIPTION" "ok" "${FILE_COUNT} fichiers"
        return 0
    else
        print_error "${DESCRIPTION} : manquant (${DIR_PATH})"
        json_add "files" "$DESCRIPTION" "error" "manquant: ${DIR_PATH}"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi
}

check_port() {
    local PORT="$1"
    local DESCRIPTION="$2"
    if ss -tuln 2>/dev/null | grep -q ":${PORT} " || netstat -tuln 2>/dev/null | grep -q ":${PORT} "; then
        print_success "${DESCRIPTION} : écoute sur le port ${PORT}"
        json_add "ports" "$DESCRIPTION" "ok" "port ${PORT}"
        return 0
    else
        print_error "${DESCRIPTION} : n'écoute PAS sur le port ${PORT}"
        json_add "ports" "$DESCRIPTION" "error" "port ${PORT} fermé"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi
}

check_webapp_files() {
    local WEBAPP_DIR="${NEOPRO_DIR}/webapp"
    local ISSUES=0

    if [ ! -d "${WEBAPP_DIR}" ]; then
        print_error "Répertoire webapp manquant : ${WEBAPP_DIR}"
        json_add "webapp" "directory" "error" "manquant"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi

    if [ ! -f "${WEBAPP_DIR}/index.html" ]; then
        print_error "index.html manquant dans ${WEBAPP_DIR}"
        json_add "webapp" "index.html" "error" "manquant"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        ((ISSUES++))
    else
        print_success "index.html présent"
        json_add "webapp" "index.html" "ok" "présent"
    fi

    local JS_COUNT
    JS_COUNT=$(find "${WEBAPP_DIR}" -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "${JS_COUNT}" -eq 0 ]; then
        print_error "Aucun fichier JavaScript trouvé dans webapp"
        json_add "webapp" "js_files" "error" "0 fichiers"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        ((ISSUES++))
    else
        print_success "Fichiers JavaScript présents (${JS_COUNT} fichiers)"
        json_add "webapp" "js_files" "ok" "${JS_COUNT} fichiers"
    fi

    return ${ISSUES}
}

################################################################################
# NOUVELLES VÉRIFICATIONS : Dépendances système
################################################################################

check_nodejs_version() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js non installé"
        json_add "system" "nodejs" "error" "non installé"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    fi

    local NODE_VER
    NODE_VER=$(node -v 2>/dev/null)
    local NODE_MAJOR
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)

    if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
        print_error "Node.js ${NODE_VER} trop ancien (requis: v${REQUIRED_NODE_MAJOR}+)"
        json_add "system" "nodejs" "error" "${NODE_VER} (requis: v${REQUIRED_NODE_MAJOR}+)"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        return 1
    else
        print_success "Node.js ${NODE_VER} (>= v${REQUIRED_NODE_MAJOR} requis)"
        json_add "system" "nodejs" "ok" "${NODE_VER}"
        return 0
    fi
}

check_apt_packages() {
    # Packages critiques installés par install.sh
    local CRITICAL_PACKAGES=(
        "hostapd"
        "dnsmasq"
        "nginx"
        "avahi-daemon"
        "ffmpeg"
    )

    # Packages recommandés (non bloquants)
    local RECOMMENDED_PACKAGES=(
        "unclutter-xfixes"
        "chromium"
        "cec-utils"
        "firmware-realtek"
        "x11-utils"
    )

    local MISSING_CRITICAL=()
    local MISSING_RECOMMENDED=()

    for pkg in "${CRITICAL_PACKAGES[@]}"; do
        if dpkg -l "$pkg" 2>/dev/null | grep -q "^ii"; then
            print_success "Package ${pkg} : installé"
            json_add "packages" "$pkg" "ok" "installé"
        else
            print_error "Package ${pkg} : MANQUANT (critique)"
            json_add "packages" "$pkg" "error" "manquant"
            MISSING_CRITICAL+=("$pkg")
            TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        fi
    done

    for pkg in "${RECOMMENDED_PACKAGES[@]}"; do
        if dpkg -l "$pkg" 2>/dev/null | grep -q "^ii"; then
            print_success "Package ${pkg} : installé"
            json_add "packages" "$pkg" "ok" "installé"
        else
            print_warning "Package ${pkg} : manquant (recommandé)"
            json_add "packages" "$pkg" "warn" "manquant"
            MISSING_RECOMMENDED+=("$pkg")
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    done

    if [ ${#MISSING_CRITICAL[@]} -gt 0 ] && [ "$OUTPUT_MODE" = "human" ]; then
        echo ""
        echo -e "${YELLOW}Installer les packages critiques manquants :${NC}"
        echo "  sudo apt-get install -y ${MISSING_CRITICAL[*]}"
    fi

    if [ ${#MISSING_RECOMMENDED[@]} -gt 0 ] && [ "$OUTPUT_MODE" = "human" ]; then
        echo ""
        echo -e "${YELLOW}Installer les packages recommandés :${NC}"
        echo "  sudo apt-get install -y ${MISSING_RECOMMENDED[*]}"
    fi
}

check_node_modules() {
    # Modules critiques par composant — si absents, le service crash au démarrage
    declare -A CRITICAL_DEPS
    CRITICAL_DEPS[server]="express socket.io"
    CRITICAL_DEPS[admin]="express"
    CRITICAL_DEPS[sync-agent]="socket.io-client fs-extra axios"

    local COMPONENTS=("server" "admin" "sync-agent")

    for component in "${COMPONENTS[@]}"; do
        local dir="${NEOPRO_DIR}/${component}"
        if [ ! -d "$dir" ]; then
            continue
        fi

        if [ -f "$dir/package.json" ] && [ ! -d "$dir/node_modules" ]; then
            print_error "${component}/node_modules : MANQUANT"
            json_add "node_modules" "$component" "error" "manquant"
            TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        elif [ -d "$dir/node_modules" ]; then
            local MOD_COUNT
            MOD_COUNT=$(ls -1 "$dir/node_modules" 2>/dev/null | wc -l | tr -d ' ')

            # Vérifier les dépendances critiques (détecte corruption EXT4 / npm install interrompu)
            local missing_deps=""
            for dep in ${CRITICAL_DEPS[$component]}; do
                if [ ! -d "$dir/node_modules/$dep" ]; then
                    missing_deps="${missing_deps}${dep} "
                fi
            done

            if [ -n "$missing_deps" ]; then
                print_error "${component}/node_modules : ${MOD_COUNT} modules, MANQUANTS: ${missing_deps}"
                json_add "node_modules" "$component" "error" "${MOD_COUNT} modules, missing: ${missing_deps}"
                TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
            else
                print_success "${component}/node_modules : présent (${MOD_COUNT} modules, deps critiques OK)"
                json_add "node_modules" "$component" "ok" "${MOD_COUNT} modules"
            fi
        fi
    done
}

check_nginx_config() {
    # Vérifier que la config Nginx est valide
    if nginx -t 2>&1 | grep -q "successful"; then
        print_success "Configuration Nginx valide"
        json_add "nginx" "syntax" "ok" "valide"
    else
        print_error "Configuration Nginx invalide"
        json_add "nginx" "syntax" "error" "invalide"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        [ "$OUTPUT_MODE" = "human" ] && nginx -t 2>&1
    fi

    # Vérifier le site-enabled
    if [ -L "/etc/nginx/sites-enabled/neopro" ]; then
        print_success "Site Neopro activé dans Nginx"
        json_add "nginx" "site_enabled" "ok" "activé"
    else
        print_error "Site Neopro NON activé dans Nginx"
        json_add "nginx" "site_enabled" "error" "désactivé"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi

    # Vérifier que les routes critiques sont présentes dans la config
    local NGINX_CONF="/etc/nginx/sites-available/neopro"
    if [ -f "$NGINX_CONF" ]; then
        local MISSING_ROUTES=()

        # Routes critiques qui doivent être dans la config Nginx
        if ! grep -q "proxy_pass.*localhost:3000" "$NGINX_CONF" 2>/dev/null; then
            MISSING_ROUTES+=("socket.io proxy (port 3000)")
        fi
        if ! grep -q "proxy_pass.*localhost:8080" "$NGINX_CONF" 2>/dev/null && \
           ! grep -q "proxy_pass.*127.0.0.1:8080" "$NGINX_CONF" 2>/dev/null; then
            MISSING_ROUTES+=("admin proxy (port 8080)")
        fi
        if ! grep -q "/generate_204" "$NGINX_CONF" 2>/dev/null; then
            MISSING_ROUTES+=("captive portal (/generate_204)")
        fi

        if [ ${#MISSING_ROUTES[@]} -eq 0 ]; then
            print_success "Routes Nginx critiques : toutes présentes"
            json_add "nginx" "routes" "ok" "complètes"
        else
            for route in "${MISSING_ROUTES[@]}"; do
                print_warning "Route Nginx manquante : ${route}"
                json_add "nginx" "route_${route}" "warn" "manquante"
                TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
            done
            if [ "$OUTPUT_MODE" = "human" ]; then
                echo -e "  ${YELLOW}Relancez install.sh ou mettez à jour /etc/nginx/sites-available/neopro manuellement${NC}"
            fi
        fi
    else
        print_error "Fichier config Nginx absent : ${NGINX_CONF}"
        json_add "nginx" "config_file" "error" "absent"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
}

check_hotspot_config() {
    local HOSTAPD_CONF="/etc/hostapd/hostapd.conf"

    if [ ! -f "$HOSTAPD_CONF" ]; then
        print_warning "hostapd.conf absent — hotspot non configuré"
        json_add "hotspot" "config" "warn" "absent"
        return
    fi

    # TKIP check — TKIP causes "wrong password" on modern phones
    if grep -q "wpa_pairwise=TKIP" "$HOSTAPD_CONF" 2>/dev/null; then
        print_error "hostapd : wpa_pairwise=TKIP (déprécié — cause 'mauvais MDP' sur téléphones modernes)"
        json_add "hotspot" "cipher" "error" "TKIP"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        if [ "$OUTPUT_MODE" = "human" ]; then
            echo -e "  ${YELLOW}Fix : sudo sed -i 's/wpa_pairwise=TKIP/wpa_pairwise=CCMP/' $HOSTAPD_CONF && sudo systemctl restart hostapd${NC}"
        fi
    elif grep -q "wpa_pairwise=CCMP" "$HOSTAPD_CONF" 2>/dev/null; then
        print_success "hostapd : cipher CCMP (AES) OK"
        json_add "hotspot" "cipher" "ok" "CCMP"
    fi

    # nginx default_server check — without it, captive portal is empty
    local NGINX_SITES="/etc/nginx/sites-available"
    if [ -d "$NGINX_SITES" ]; then
        if grep -rq "default_server" "$NGINX_SITES" 2>/dev/null; then
            print_success "nginx captive portal : default_server configuré"
            json_add "hotspot" "captive_portal" "ok" "default_server"
        else
            print_warning "nginx : pas de default_server — captive portal peut être vide"
            json_add "hotspot" "captive_portal" "warn" "pas de default_server"
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    fi
}

check_systemd_services_installed() {
    # Services systemd qui devraient être installés (au minimum)
    local EXPECTED_SERVICES=(
        "neopro-app"
        "neopro-admin"
        "neopro-sync-agent"
        "neopro-kiosk"
        "neopro-hotspot-watchdog"
        "neopro-sync-guardian"
    )

    for svc in "${EXPECTED_SERVICES[@]}"; do
        if [ -f "/etc/systemd/system/${svc}.service" ]; then
            if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
                print_success "Service ${svc}.service : installé + activé"
                json_add "systemd_installed" "$svc" "ok" "installé et activé"
            else
                print_warning "Service ${svc}.service : installé mais NON activé"
                json_add "systemd_installed" "$svc" "warn" "installé mais désactivé"
                TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
            fi
        else
            print_warning "Service ${svc}.service : non installé dans /etc/systemd/system/"
            json_add "systemd_installed" "$svc" "warn" "non installé"
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    done
}

check_permissions() {
    local ISSUES=0

    # Vérifier que /home/pi est accessible par nginx (www-data)
    local HOME_PERMS
    HOME_PERMS=$(stat -c "%a" /home/pi 2>/dev/null)
    if [ "$HOME_PERMS" = "755" ]; then
        print_success "/home/pi permissions : 755"
        json_add "permissions" "/home/pi" "ok" "755"
    else
        print_warning "/home/pi permissions : ${HOME_PERMS} (devrait être 755 pour nginx)"
        json_add "permissions" "/home/pi" "warn" "${HOME_PERMS}"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi

    # Vérifier que club-config.json est protégé
    if [ -f "${NEOPRO_DIR}/club-config.json" ]; then
        local CONFIG_PERMS
        CONFIG_PERMS=$(stat -c "%a" "${NEOPRO_DIR}/club-config.json" 2>/dev/null)
        if [ "$CONFIG_PERMS" = "600" ]; then
            print_success "club-config.json : chmod 600"
            json_add "permissions" "club-config.json" "ok" "600"
        else
            print_warning "club-config.json : chmod ${CONFIG_PERMS} (devrait être 600)"
            json_add "permissions" "club-config.json" "warn" "${CONFIG_PERMS}"
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    fi

    # Vérifier ownership de webapp
    local WEBAPP_OWNER
    WEBAPP_OWNER=$(stat -c "%U" "${NEOPRO_DIR}/webapp" 2>/dev/null)
    if [ "$WEBAPP_OWNER" = "pi" ]; then
        print_success "webapp/ owner : pi"
        json_add "permissions" "webapp_owner" "ok" "pi"
    else
        print_warning "webapp/ owner : ${WEBAPP_OWNER} (devrait être pi)"
        json_add "permissions" "webapp_owner" "warn" "${WEBAPP_OWNER}"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi

    # Vérifier que www-data est dans le groupe pi
    if id -nG www-data 2>/dev/null | grep -qw pi; then
        print_success "www-data dans le groupe pi (accès nginx)"
        json_add "permissions" "www-data_group" "ok" "dans groupe pi"
    else
        print_warning "www-data PAS dans le groupe pi (nginx pourrait ne pas accéder à webapp)"
        json_add "permissions" "www-data_group" "warn" "pas dans groupe pi"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi
}

check_gpu_config() {
    local CONFIG_FILE="/boot/config.txt"
    if [ -f "/boot/firmware/config.txt" ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    fi

    if grep -q "^gpu_mem=" "$CONFIG_FILE" 2>/dev/null; then
        local GPU_MEM
        GPU_MEM=$(grep "^gpu_mem=" "$CONFIG_FILE" | cut -d= -f2)
        if [ "$GPU_MEM" -ge 256 ] 2>/dev/null; then
            print_success "gpu_mem=${GPU_MEM} (>= 256 requis)"
            json_add "system" "gpu_mem" "ok" "${GPU_MEM}"
        else
            print_warning "gpu_mem=${GPU_MEM} (recommandé: 256 pour décodage vidéo)"
            json_add "system" "gpu_mem" "warn" "${GPU_MEM}"
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    else
        # Pi 5 utilise V3D Mesa, gpu_mem n'est pas nécessaire
        if grep -qi "Raspberry Pi 5" /proc/device-tree/model 2>/dev/null; then
            print_success "Pi 5 détecté : gpu_mem non nécessaire (V3D Mesa)"
            json_add "system" "gpu_mem" "ok" "Pi 5 (V3D Mesa)"
        else
            print_warning "gpu_mem non configuré dans ${CONFIG_FILE}"
            json_add "system" "gpu_mem" "warn" "non configuré"
            TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
        fi
    fi
}

check_disk_space() {
    local AVAILABLE_KB
    AVAILABLE_KB=$(df /home/pi 2>/dev/null | tail -1 | awk '{print $4}')
    if [ -z "$AVAILABLE_KB" ]; then
        AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
    fi

    local AVAILABLE_MB=$((AVAILABLE_KB / 1024))
    local USED_PERCENT
    USED_PERCENT=$(df /home/pi 2>/dev/null | tail -1 | awk '{print $5}' || df / | tail -1 | awk '{print $5}')

    if [ "$AVAILABLE_MB" -lt 500 ]; then
        print_error "Espace disque critique : ${AVAILABLE_MB}MB libre (${USED_PERCENT} utilisé)"
        json_add "system" "disk_space" "error" "${AVAILABLE_MB}MB libre (${USED_PERCENT})"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    elif [ "$AVAILABLE_MB" -lt 2048 ]; then
        print_warning "Espace disque faible : ${AVAILABLE_MB}MB libre (${USED_PERCENT} utilisé)"
        json_add "system" "disk_space" "warn" "${AVAILABLE_MB}MB libre (${USED_PERCENT})"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    else
        print_success "Espace disque : ${AVAILABLE_MB}MB libre (${USED_PERCENT} utilisé)"
        json_add "system" "disk_space" "ok" "${AVAILABLE_MB}MB libre (${USED_PERCENT})"
    fi
}

check_filesystem_health() {
    # 1. Erreurs EXT4 dans dmesg
    local EXT4_ERRORS
    EXT4_ERRORS=$(dmesg 2>/dev/null | grep -c "EXT4-fs error" || echo "0")

    if [ "$EXT4_ERRORS" -gt 0 ]; then
        print_error "Erreurs EXT4 détectées dans dmesg : ${EXT4_ERRORS} erreur(s)"
        json_add "filesystem" "ext4_errors" "error" "${EXT4_ERRORS} erreurs dmesg"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    else
        print_success "Aucune erreur EXT4 dans dmesg"
        json_add "filesystem" "ext4_errors" "ok" "aucune"
    fi

    # 2. État du filesystem via tune2fs
    local FS_STATE
    FS_STATE=$(sudo tune2fs -l /dev/mmcblk0p2 2>/dev/null | grep "Filesystem state" | awk -F: '{print $2}' | tr -d ' ')

    if [ -n "$FS_STATE" ]; then
        if [ "$FS_STATE" = "clean" ]; then
            print_success "Filesystem state : clean"
            json_add "filesystem" "state" "ok" "clean"
        else
            print_error "Filesystem state : ${FS_STATE} (fsck recommandé)"
            json_add "filesystem" "state" "error" "${FS_STATE}"
            TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
        fi
    else
        print_warning "Impossible de lire l'état du filesystem (tune2fs)"
        json_add "filesystem" "state" "warn" "indisponible"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi

    # 3. Vérifier si monté en lecture seule (urgence)
    if mount | grep "on / " | grep -q "ro,"; then
        print_error "Filesystem monté en lecture seule !"
        json_add "filesystem" "mount" "error" "read-only"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    else
        print_success "Filesystem monté en lecture-écriture"
        json_add "filesystem" "mount" "ok" "rw"
    fi
}

check_version_info() {
    if [ -f "${NEOPRO_DIR}/VERSION" ]; then
        local VERSION
        VERSION=$(cat "${NEOPRO_DIR}/VERSION" 2>/dev/null | tr -d '[:space:]')
        print_success "Version Neopro : ${VERSION}"
        json_add "system" "version" "ok" "${VERSION}"
    else
        print_warning "Fichier VERSION absent"
        json_add "system" "version" "warn" "absent"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi
}

################################################################################
# EXÉCUTION DU DIAGNOSTIC
################################################################################

print_header

# 1. Dépendances système (Node.js + packages apt)
print_section "1. Dépendances système"
SYSTEM_OK=true
check_nodejs_version || SYSTEM_OK=false
check_apt_packages

# 2. Services systemd (actifs)
print_section "2. Services systemd (état)"
SERVICES_OK=true
check_service "neopro-app" || SERVICES_OK=false
check_service "neopro-admin" || SERVICES_OK=false
check_service "neopro-sync-agent" || true  # Peut ne pas être configuré
check_service "nginx" || SERVICES_OK=false
check_service "hostapd" || SERVICES_OK=false
check_service "dnsmasq" || SERVICES_OK=false
check_service "avahi-daemon" || SERVICES_OK=false

# 3. Services systemd (installés)
print_section "3. Services systemd (installation)"
check_systemd_services_installed

# 3b. Configuration hotspot (TKIP, captive portal)
print_section "3b. Configuration hotspot WiFi"
check_hotspot_config

# 4. Masquage curseur TV
print_section "4. Masquage curseur TV"
CURSOR_OK=true

if dpkg -l unclutter-xfixes 2>/dev/null | grep -q "^ii"; then
    print_success "unclutter-xfixes installé"
    json_add "cursor" "package" "ok" "unclutter-xfixes"
else
    if dpkg -l unclutter 2>/dev/null | grep -q "^ii"; then
        print_warning "Ancien paquet 'unclutter' détecté — remplacer par 'unclutter-xfixes'"
        json_add "cursor" "package" "warn" "ancien unclutter"
        [ "$OUTPUT_MODE" = "human" ] && echo "  sudo apt-get remove -y unclutter && sudo apt-get install -y unclutter-xfixes"
    else
        print_error "unclutter-xfixes non installé (curseur visible sur TV)"
        json_add "cursor" "package" "error" "manquant"
        [ "$OUTPUT_MODE" = "human" ] && echo "  sudo apt-get install -y unclutter-xfixes"
    fi
    CURSOR_OK=false
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi

if pgrep -x unclutter > /dev/null 2>&1; then
    print_success "Processus unclutter actif"
else
    print_warning "Processus unclutter non détecté (normal si X11 n'est pas lancé)"
fi

if grep -q "@unclutter" /home/pi/.config/lxsession/LXDE-pi/autostart 2>/dev/null; then
    print_success "Autostart LXDE contient @unclutter"
    json_add "cursor" "autostart" "ok" "configuré"
else
    print_error "Autostart LXDE ne contient pas @unclutter"
    json_add "cursor" "autostart" "error" "manquant"
    CURSOR_OK=false
fi

# 5. Ports réseau
print_section "5. Ports réseau"
PORTS_OK=true
check_port "80" "Nginx (HTTP)" || PORTS_OK=false
check_port "3000" "Socket.IO Server" || PORTS_OK=false
check_port "8080" "Admin Interface" || PORTS_OK=false

# 6. Fichiers et répertoires
print_section "6. Fichiers et répertoires"
FILES_OK=true
check_directory_exists "${NEOPRO_DIR}" "Répertoire principal Neopro" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/webapp" "Application web Angular" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/server" "Serveur Socket.IO" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/admin" "Interface admin" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/sync-agent" "Sync-agent" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/videos" "Répertoire vidéos" || FILES_OK=false
check_directory_exists "${NEOPRO_DIR}/scripts" "Scripts runtime" || FILES_OK=false

check_file_exists "${NEOPRO_DIR}/webapp/index.html" "index.html Angular" || FILES_OK=false
check_file_exists "${NEOPRO_DIR}/server/server.js" "Serveur Socket.IO" || FILES_OK=false
check_file_exists "${NEOPRO_DIR}/admin/admin-server.js" "Serveur Admin" || FILES_OK=false
check_file_exists "${NEOPRO_DIR}/sync-agent/src/agent.js" "Sync-agent entry" || FILES_OK=false

# 7. node_modules
print_section "7. Dépendances Node.js (node_modules)"
check_node_modules

# 8. Application Angular (webapp)
print_section "8. Application Angular (webapp)"
check_webapp_files || FILES_OK=false

# 9. Configuration Nginx (syntaxe + routes)
print_section "9. Configuration Nginx"
check_nginx_config

# 10. Réseau WiFi
print_section "10. Réseau WiFi"
WIFI_INTERFACE=$(iw dev 2>/dev/null | awk '/Interface/ {print $2; exit}')
if [ -n "${WIFI_INTERFACE}" ]; then
    print_success "Interface WiFi détectée : ${WIFI_INTERFACE}"
    json_add "wifi" "interface" "ok" "${WIFI_INTERFACE}"

    if iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -q "type AP"; then
        print_success "Mode Access Point actif"
        json_add "wifi" "ap_mode" "ok" "actif"

        SSID=$(iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep "ssid" | awk '{print $2}')
        if [ -n "${SSID}" ]; then
            print_success "SSID : ${SSID}"
            json_add "wifi" "ssid" "ok" "${SSID}"
        fi
    else
        print_warning "Mode Access Point non détecté"
        json_add "wifi" "ap_mode" "warn" "inactif"
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi

    if ip addr show "${WIFI_INTERFACE}" 2>/dev/null | grep -q "192.168.4.1"; then
        print_success "IP statique 192.168.4.1 configurée"
        json_add "wifi" "static_ip" "ok" "192.168.4.1"
    else
        print_error "IP statique 192.168.4.1 NON configurée"
        json_add "wifi" "static_ip" "error" "absente"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
else
    print_error "Interface WiFi non détectée"
    json_add "wifi" "interface" "error" "non détectée"
    TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
fi

# 11. Permissions et sécurité
print_section "11. Permissions et sécurité"
check_permissions

# 12. GPU et mémoire vidéo
print_section "12. Configuration GPU"
check_gpu_config

# 13. Espace disque
print_section "13. Espace disque"
check_disk_space

# 14. Santé filesystem
print_section "14. Santé filesystem"
check_filesystem_health

# 15. Version
print_section "15. Version installée"
check_version_info

# 16. Tests HTTP
print_section "16. Tests HTTP"
HTTP_OK=true
echo -n "Test http://localhost ... "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    print_success "OK (200)"
    json_add "http" "localhost" "ok" "200"
else
    print_error "Échec (code ${HTTP_CODE})"
    json_add "http" "localhost" "error" "code ${HTTP_CODE}"
    HTTP_OK=false
    TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
fi

echo -n "Test http://localhost/tv ... "
TV_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/tv 2>/dev/null || echo "000")
if [ "$TV_CODE" = "200" ]; then
    print_success "OK (200)"
    json_add "http" "tv" "ok" "200"
else
    print_error "Échec (code ${TV_CODE})"
    json_add "http" "tv" "error" "code ${TV_CODE}"
    HTTP_OK=false
fi

echo -n "Test http://localhost:8080 ... "
ADMIN_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo "000")
if [ "$ADMIN_CODE" = "200" ]; then
    print_success "OK (200)"
    json_add "http" "admin" "ok" "200"
else
    print_error "Échec (code ${ADMIN_CODE})"
    json_add "http" "admin" "error" "code ${ADMIN_CODE}"
    HTTP_OK=false
fi

# 17. Logs récents (mode human uniquement)
if [ "$OUTPUT_MODE" = "human" ]; then
    print_section "17. Logs récents (dernières erreurs)"
    echo "Logs neopro-app :"
    journalctl -u neopro-app -n 5 --no-pager 2>/dev/null || echo "  Aucun log récent"

    echo -e "\nLogs nginx :"
    if [ -f "${NEOPRO_DIR}/logs/nginx-error.log" ]; then
        tail -n 5 "${NEOPRO_DIR}/logs/nginx-error.log" 2>/dev/null || echo "  Aucune erreur"
    else
        echo "  Fichier de log non trouvé"
    fi
fi

################################################################################
# RÉSUMÉ
################################################################################

if [ "$OUTPUT_MODE" = "json" ]; then
    # Sortie JSON
    local_version=$(cat "${NEOPRO_DIR}/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
    local_node=$(node -v 2>/dev/null || echo "none")

    cat <<ENDJSON
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "hostname": "$(hostname)",
  "version": "${local_version}",
  "node_version": "${local_node}",
  "errors": ${TOTAL_ERRORS},
  "warnings": ${TOTAL_WARNINGS},
  "healthy": $([ $TOTAL_ERRORS -eq 0 ] && echo "true" || echo "false"),
  "checks": [${JSON_CHECKS}]
}
ENDJSON
    exit $TOTAL_ERRORS
fi

# Mode human/quiet
print_section "RÉSUMÉ"
echo ""

if [ $TOTAL_ERRORS -gt 0 ]; then
    print_error "${TOTAL_ERRORS} erreur(s) détectée(s)"
fi
if [ $TOTAL_WARNINGS -gt 0 ]; then
    print_warning "${TOTAL_WARNINGS} avertissement(s)"
fi

if [ "$CURSOR_OK" = false ]; then
    echo -e "\n${YELLOW}CURSEUR TV :${NC}"
    echo "  sudo apt-get remove -y unclutter 2>/dev/null"
    echo "  sudo apt-get install -y unclutter-xfixes"
    echo "  echo '@unclutter -idle 0 -root' >> /home/pi/.config/lxsession/LXDE-pi/autostart"
    echo "  sudo reboot"
fi

if [ "$FILES_OK" = false ]; then
    echo -e "\n${YELLOW}FICHIERS MANQUANTS :${NC}"
    echo "  Depuis votre PC : ./raspberry/scripts/deploy-remote.sh neopro.local"
fi

echo ""
if [ $TOTAL_ERRORS -eq 0 ] && [ $TOTAL_WARNINGS -eq 0 ]; then
    print_success "Tous les tests sont passés ! Le Pi est complet et opérationnel."
elif [ $TOTAL_ERRORS -eq 0 ]; then
    print_warning "Le Pi fonctionne mais ${TOTAL_WARNINGS} point(s) à améliorer."
else
    print_error "Le Pi a des problèmes (${TOTAL_ERRORS} erreurs, ${TOTAL_WARNINGS} avertissements)"
    echo ""
    echo -e "${YELLOW}ACTIONS RECOMMANDÉES :${NC}"
    echo ""
    echo "1. Relancer un déploiement complet :"
    echo "   Depuis votre PC : ./raspberry/scripts/deploy-remote.sh neopro.local"
    echo ""
    echo "2. Relancer install.sh pour les dépendances système :"
    echo "   sudo ./install.sh NOM_CLUB MOT_DE_PASSE"
    echo ""
    echo "3. Pour voir les logs en temps réel :"
    echo "   sudo journalctl -u neopro-app -f"
fi

echo ""

# Exit code = nombre d'erreurs (0 = succès)
exit $TOTAL_ERRORS
