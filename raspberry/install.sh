#!/bin/bash

################################################################################
# Script d'installation Neopro pour Raspberry Pi
# Ce script configure automatiquement un Raspberry Pi comme système Neopro
#
# Usage: sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI] [SSID_WIFI_CLIENT] [PASS_WIFI_CLIENT]
# Exemple: sudo ./install.sh CESSON MyWiFiPass123 Livebox Maison12345
# Les paramètres WiFi client sont optionnels. Si une clé WiFi USB est branchée,
# le script peut aussi poser la question en mode interactif.
################################################################################

set -euo pipefail  # Arrêt en cas d'erreur et variables non définies détectées

trap 'print_error "Une erreur est survenue. Consultez les logs ci-dessus avant de relancer."' ERR

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration par défaut
CLUB_NAME="${1:-DEMO}"
WIFI_PASSWORD="${2:-NeoProWiFi2025}"
INSTALL_DIR="/home/pi/neopro"
NODE_VERSION="18"
WIFI_INTERFACE=""
WIFI_CHANNEL="6"
STATIC_IP="192.168.4.1/24"
CLIENT_WIFI_SSID="${3:-${NEOPRO_WIFI_CLIENT_SSID:-}}"
CLIENT_WIFI_PASSWORD="${4:-${NEOPRO_WIFI_CLIENT_PASSWORD:-}}"
WIFI_CLIENT_INTERFACE=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIME=$(date +%s)
NON_INTERACTIVE="${NEOPRO_NON_INTERACTIVE:-false}"

# Log file — toute la sortie console est aussi écrite dans ce fichier
LOG_FILE="/var/log/neopro-install-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Installation Neopro démarrée à $(date) ==="
echo "=== Log file: $LOG_FILE ==="

################################################################################
# Fonctions utilitaires
################################################################################

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         INSTALLATION NEOPRO RASPBERRY PI                       ║"
    echo "║         Club: ${CLUB_NAME}                                    ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}>>> $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

validate_inputs() {
    # Valider le nom du club
    if [[ ! "$CLUB_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "Le nom du club ne doit contenir que des lettres, chiffres, tirets et underscores."
        exit 1
    fi
    if [ ${#CLUB_NAME} -gt 25 ]; then
        print_error "Le nom du club est trop long (max 25 caractères, SSID WiFi = NEOPRO-NOM limité à 32 chars)."
        exit 1
    fi

    # Valider le mot de passe WiFi
    local PASS_LENGTH=${#WIFI_PASSWORD}
    if [ "${PASS_LENGTH}" -lt 8 ] || [ "${PASS_LENGTH}" -gt 63 ]; then
        print_error "Le mot de passe WiFi doit contenir entre 8 et 63 caractères (actuel: ${PASS_LENGTH})."
        echo "Veuillez relancer le script avec un mot de passe plus long: sudo ./install.sh ${CLUB_NAME} MonPassSecret123"
        exit 1
    fi
}

# Échappe une chaîne pour l'utiliser comme remplacement dans sed (délimiteur |)
sed_escape() {
    printf '%s\n' "$1" | sed 's/[&/\|]/\\&/g'
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo"
        exit 1
    fi
}

service_exists() {
    local SERVICE_NAME="$1"
    systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1
}

ensure_service_running() {
    local SERVICE_NAME="$1"
    if ! service_exists "${SERVICE_NAME}"; then
        print_warning "Service ${SERVICE_NAME} introuvable sur ce système. Étape ignorée."
        return
    fi
    if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
        print_error "Le service ${SERVICE_NAME} ne démarre pas correctement."
        echo "Derniers logs ${SERVICE_NAME} :"
        journalctl -u "${SERVICE_NAME}" -n 40 || true
        exit 1
    fi
}

restart_service_if_exists() {
    local SERVICE_NAME="$1"
    if service_exists "${SERVICE_NAME}"; then
        if ! systemctl restart "${SERVICE_NAME}"; then
            print_error "Impossible de redémarrer ${SERVICE_NAME}."
            echo "Derniers journaux ${SERVICE_NAME}:"
            journalctl -xeu "${SERVICE_NAME}" -n 40 || true
            exit 1
        fi
    else
        print_warning "Service ${SERVICE_NAME} non disponible, saut du redémarrage."
    fi
}

refresh_wifi_interface() {
    rfkill unblock wifi || true
    if [ -z "${WIFI_INTERFACE}" ]; then
        return
    fi
    ip link set "${WIFI_INTERFACE}" down || true
    ip addr flush dev "${WIFI_INTERFACE}" || true
    sleep 1
    ip link set "${WIFI_INTERFACE}" up || true
}

detect_wifi_interface() {
    WIFI_INTERFACE=$(iw dev 2>/dev/null | awk '/Interface/ {print $2; exit}')
    if [ -z "${WIFI_INTERFACE}" ]; then
        if ip link show wlan0 >/dev/null 2>&1; then
            WIFI_INTERFACE="wlan0"
        else
            print_warning "Impossible de détecter automatiquement l'interface WiFi. Utilisation par défaut de wlan0."
            WIFI_INTERFACE="wlan0"
        fi
    fi
    print_step "Interface WiFi détectée: ${WIFI_INTERFACE}"
}

check_ethernet_connection() {
    # Vérifie si une connexion Ethernet est active
    local ETH_IFACE=""
    for iface in eth0 enp0s3 ens3; do
        if ip link show "$iface" >/dev/null 2>&1; then
            if ip addr show "$iface" | grep -q "inet "; then
                ETH_IFACE="$iface"
                break
            fi
        fi
    done
    echo "$ETH_IFACE"
}

detect_wifi_client_interface() {
    rfkill unblock wifi || true
    local INTERFACES=()
    while IFS= read -r iface; do
        INTERFACES+=("$iface")
    done < <(ls /sys/class/net 2>/dev/null | grep -E '^wlan' | sort || true)

    if [ "${#INTERFACES[@]}" -lt 2 ]; then
        WIFI_CLIENT_INTERFACE=""

        # Vérifier si Ethernet est connecté
        local ETH_CONNECTED=$(check_ethernet_connection)

        if [ -n "$ETH_CONNECTED" ]; then
            print_step "Connexion Internet via Ethernet ($ETH_CONNECTED) - clé WiFi USB non nécessaire."
        else
            echo ""
            print_step "Mode hotspot uniquement (pas de clé WiFi USB détectée)."
            echo "   ℹ️  C'est normal si vous n'avez pas besoin d'accès Internet sur le Pi."
            echo "   ℹ️  Pour ajouter une connexion Internet plus tard, branchez une clé WiFi USB"
            echo "      et utilisez: sudo ${INSTALL_DIR}/scripts/setup-wifi-client.sh SSID PASSWORD"
            echo ""
        fi
        return
    fi

    for iface in "${INTERFACES[@]}"; do
        if [ "$iface" != "${WIFI_INTERFACE}" ]; then
            WIFI_CLIENT_INTERFACE="$iface"
            break
        fi
    done

    if [ -n "${WIFI_CLIENT_INTERFACE}" ]; then
        print_step "Interface WiFi client détectée: ${WIFI_CLIENT_INTERFACE}"
    else
        print_warning "Impossible d'identifier l'interface client. Vérifiez vos interfaces WiFi."
    fi
}

disable_conflicting_wifi_services() {
    print_step "Désactivation des services WiFi conflictuels pour le hotspot..."
    local STOPPED_SERVICES=()

    for SERVICE in NetworkManager wpa_supplicant iwd; do
        if service_exists "${SERVICE}"; then
            if systemctl is-active --quiet "${SERVICE}"; then
                systemctl stop "${SERVICE}" || true
                STOPPED_SERVICES+=("${SERVICE}")
            fi
            systemctl disable "${SERVICE}" || true
        fi
    done

    if [ ${#STOPPED_SERVICES[@]} -gt 0 ]; then
        echo "   ℹ️  Services désactivés: ${STOPPED_SERVICES[*]}"
        echo "   ℹ️  (Nécessaire pour que ${WIFI_INTERFACE} fonctionne en mode hotspot)"
    fi
}

wait_for_interface_ip() {
    local RETRIES=10
    while [ $RETRIES -gt 0 ]; do
        if ip addr show "${WIFI_INTERFACE}" | grep -q "${STATIC_IP%/*}"; then
            return 0
        fi
        sleep 1
        ((RETRIES--))
    done
    print_warning "Impossible de confirmer l'adresse ${STATIC_IP} sur ${WIFI_INTERFACE}. poursuite de l'installation."
}

apply_static_ip() {
    ip addr flush dev "${WIFI_INTERFACE}" || true
    ip addr add "${STATIC_IP}" dev "${WIFI_INTERFACE}" || true
    ip link set "${WIFI_INTERFACE}" up || true
}

ensure_dns_configuration() {
    if [ ! -f /etc/resolv.conf ]; then
        print_warning "/etc/resolv.conf absent – ajout d'un DNS de secours (1.1.1.1 / 8.8.8.8)."
        cat > /etc/resolv.conf << 'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF
    fi
}

check_prerequisites() {
    print_step "Vérification des prérequis..."

    local ERRORS=0

    # Vérifier qu'on est sur un Raspberry Pi ou système compatible
    if [ ! -f /proc/device-tree/model ] && [ "$(uname -m)" != "aarch64" ] && [ "$(uname -m)" != "armv7l" ]; then
        print_warning "Ce système ne semble pas être un Raspberry Pi (architecture: $(uname -m))"
    fi

    # Vérifier les fichiers de configuration requis
    local REQUIRED_FILES=(
        "${SCRIPT_DIR}/config/systemd/hostapd.conf"
        "${SCRIPT_DIR}/config/systemd/dnsmasq.conf"
        "${SCRIPT_DIR}/config/systemd/neopro.service"
        "${SCRIPT_DIR}/config/systemd/neopro-app.service"
        "${SCRIPT_DIR}/config/systemd/neopro-admin.service"
        "${SCRIPT_DIR}/server"
        "${SCRIPT_DIR}/admin"
    )

    for file in "${REQUIRED_FILES[@]}"; do
        if [ ! -e "$file" ]; then
            print_error "Fichier requis manquant: $file"
            ERRORS=$((ERRORS + 1))
        fi
    done

    # Vérifier la connexion Internet
    if ! ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        print_error "Pas de connexion Internet (requis pour les installations)"
        ERRORS=$((ERRORS + 1))
    fi

    # Vérifier l'espace disque (minimum 2GB libre)
    local FREE_SPACE=$(df / | tail -1 | awk '{print $4}')
    if [ "$FREE_SPACE" -lt 2097152 ]; then
        print_warning "Espace disque faible: $(( FREE_SPACE / 1024 ))MB libre (recommandé: 2GB+)"
    fi

    if [ $ERRORS -gt 0 ]; then
        print_error "$ERRORS erreur(s) détectée(s). Veuillez corriger avant de continuer."
        exit 1
    fi

    print_success "Tous les prérequis sont satisfaits"
}

print_elapsed_time() {
    local END_TIME=$(date +%s)
    local ELAPSED=$((END_TIME - START_TIME))
    local MINUTES=$((ELAPSED / 60))
    local SECONDS=$((ELAPSED % 60))
    echo ""
    echo -e "${BLUE}Durée totale d'installation: ${MINUTES}m ${SECONDS}s${NC}"
}

################################################################################
# Étape 1: Mise à jour du système
################################################################################

update_system() {
    print_step "Mise à jour du système..."
    apt-get update -y
    apt-get upgrade -y
    print_success "Système mis à jour"
}

################################################################################
# Étape 2: Installation des dépendances
################################################################################

install_dependencies() {
    print_step "Installation des dépendances..."

    # Packages système
    apt-get install -y \
        hostapd \
        dnsmasq \
        avahi-daemon \
        nginx \
        git \
        curl \
        dhcpcd5 \
        iw \
        rfkill \
        unclutter-xfixes \
        xdotool \
        x11-xserver-utils \
        x11-utils \
        chromium \
        cec-utils \
        edid-decode \
        ffmpeg \
        firmware-realtek \
        firmware-ralink

    # x11-utils: Fournit xdpyinfo, utilisé par neopro-kiosk.service pour vérifier que le serveur X est prêt
    # cec-utils: Permet de détecter si la TV est allumée via HDMI-CEC (pour analytics fiables)
    # edid-decode: Parsing EDID détaillé (résolutions supportées, taille physique, année de fabrication)
    # ffmpeg: Permet d'extraire la durée des vidéos (ffprobe)
    # firmware-realtek/ralink: Drivers pour clés WiFi USB (nécessaire pour le dual WiFi hotspot + internet)
    print_success "Dépendances installées"
}

################################################################################
# Étape 3: Installation de Node.js
################################################################################

install_nodejs() {
    print_step "Installation de Node.js ${NODE_VERSION}..."

    # Installation via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs

    # Vérification
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    print_success "Node.js ${NODE_VER} et npm ${NPM_VER} installés"
}

################################################################################
# Étape 4: Configuration du Hotspot WiFi
################################################################################

configure_hotspot() {
    print_step "Configuration du Hotspot WiFi..."

    # Arrêt des services
    systemctl stop hostapd || true
    systemctl stop dnsmasq || true

    ensure_dns_configuration

    # Désactiver systemd-resolved si actif (conflit avec dnsmasq pour le port 53)
    if systemctl list-unit-files systemd-resolved.service >/dev/null 2>&1; then
        if systemctl is-active --quiet systemd-resolved; then
            print_warning "Désactivation de systemd-resolved (libère le port 53 pour dnsmasq)..."
            systemctl stop systemd-resolved || true
            systemctl disable systemd-resolved || true
        fi
        rm -f /etc/resolv.conf
        cat > /etc/resolv.conf << 'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF
    fi

    # Configuration de l'interface wlan0
    cat > /etc/dhcpcd.conf << EOF
# Configuration réseau Neopro
interface ${WIFI_INTERFACE}
    static ip_address=${STATIC_IP}
    nohook wpa_supplicant
EOF

    # Configuration hostapd (avec personnalisation SSID)
    # Utiliser le délimiteur | et échapper le mot de passe pour éviter les injections sed
    local ESCAPED_PASSWORD
    ESCAPED_PASSWORD=$(sed_escape "${WIFI_PASSWORD}")
    sed "s|NEOPRO-CLUB|NEOPRO-${CLUB_NAME}|" ./config/systemd/hostapd.conf > /etc/hostapd/hostapd.conf
    sed -i "s|wpa_passphrase=.*|wpa_passphrase=${ESCAPED_PASSWORD}|" /etc/hostapd/hostapd.conf
    sed -i "s|^interface=.*|interface=${WIFI_INTERFACE}|" /etc/hostapd/hostapd.conf
    sed -i "s|^channel=.*|channel=${WIFI_CHANNEL}|" /etc/hostapd/hostapd.conf

    # Activation de hostapd
    echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

    # Configuration dnsmasq
    if [ -f /etc/dnsmasq.conf ]; then
        mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
    fi
    cp ./config/systemd/dnsmasq.conf /etc/dnsmasq.conf
    sed -i "s/^interface=.*/interface=${WIFI_INTERFACE}/" /etc/dnsmasq.conf

    # Activation des services
    systemctl unmask hostapd
    systemctl enable hostapd
    systemctl enable dnsmasq
    systemctl enable dhcpcd || true

    # Rafraîchissement de l'interface WiFi puis redémarrage des services
    refresh_wifi_interface
    restart_service_if_exists dhcpcd
    apply_static_ip
    wait_for_interface_ip
    restart_service_if_exists dnsmasq
    restart_service_if_exists hostapd
    ensure_service_running dnsmasq
    ensure_service_running hostapd

    if iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -q "type AP"; then
        print_success "Hotspot WiFi démarré: SSID NEOPRO-${CLUB_NAME}"
    else
        print_warning "Le hotspot ne signale pas encore le mode AP. Vérifiez manuellement avec 'iw dev ${WIFI_INTERFACE} info'."
    fi

    # Configurer les règles iptables captive portal (Android HTTPS connectivity checks)
    # Sans ces règles, Android détecte "pas d'internet" et bascule sur la 4G
    if [ -x ./scripts/setup-captive-portal-iptables.sh ]; then
        AP_INTERFACE="${WIFI_INTERFACE}" ./scripts/setup-captive-portal-iptables.sh || {
            print_warning "Échec de la configuration iptables captive portal (non bloquant)"
        }
    elif [ -x "${INSTALL_DIR}/scripts/setup-captive-portal-iptables.sh" ]; then
        AP_INTERFACE="${WIFI_INTERFACE}" "${INSTALL_DIR}/scripts/setup-captive-portal-iptables.sh" || {
            print_warning "Échec de la configuration iptables captive portal (non bloquant)"
        }
    else
        print_warning "Script setup-captive-portal-iptables.sh introuvable (sera appliqué au prochain deploy)"
    fi
}

configure_wifi_client_support() {
    if [ -z "${WIFI_CLIENT_INTERFACE}" ]; then
        # Pas de seconde interface - c'est optionnel, pas d'avertissement nécessaire
        # Le message a déjà été affiché dans detect_wifi_client_interface()
        return
    fi

    print_step "Préparation de l'interface client (${WIFI_CLIENT_INTERFACE})..."
    rfkill unblock wifi || true
    ip link set "${WIFI_CLIENT_INTERFACE}" down || true
    ip addr flush dev "${WIFI_CLIENT_INTERFACE}" || true
    ip link set "${WIFI_CLIENT_INTERFACE}" up || true

    local SHOULD_CONFIGURE="no"
    local SSID_INPUT="${CLIENT_WIFI_SSID}"
    local PASS_INPUT="${CLIENT_WIFI_PASSWORD}"

    if [ -n "${SSID_INPUT}" ] && [ -n "${PASS_INPUT}" ]; then
        SHOULD_CONFIGURE="yes"
    elif [ "${NON_INTERACTIVE}" != "true" ]; then
        read -p "Configurer maintenant le WiFi client (Internet) sur ${WIFI_CLIENT_INTERFACE}? (O/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Oo]$ ]]; then
            SHOULD_CONFIGURE="yes"
            if [ -z "${SSID_INPUT}" ]; then
                read -p "SSID du WiFi Internet: " SSID_INPUT
            fi
            if [ -z "${PASS_INPUT}" ]; then
                read -sp "Mot de passe WiFi Internet: " PASS_INPUT
                echo ""
            fi
        fi
    fi

    if [ "${SHOULD_CONFIGURE}" != "yes" ] || [ -z "${SSID_INPUT}" ] || [ -z "${PASS_INPUT}" ]; then
        print_warning "WiFi client non configuré. Vous pourrez le faire plus tard via l'interface admin (onglet Réseau)."
        return
    fi

    CLIENT_WIFI_SSID="${SSID_INPUT}"
    CLIENT_WIFI_PASSWORD="${PASS_INPUT}"

    local WIFI_SCRIPT="${INSTALL_DIR}/scripts/setup-wifi-client.sh"
    if [ ! -x "${WIFI_SCRIPT}" ]; then
        print_warning "Script ${WIFI_SCRIPT} introuvable ou non exécutable. Impossible de configurer le WiFi client."
        return
    fi

    if "${WIFI_SCRIPT}" "${CLIENT_WIFI_SSID}" "${CLIENT_WIFI_PASSWORD}"; then
        print_success "WiFi client configuré sur ${WIFI_CLIENT_INTERFACE}"
    else
        print_warning "La configuration du WiFi client a échoué. Vous pourrez relancer ${WIFI_SCRIPT} manuellement."
    fi
}

################################################################################
# Étape 5: Configuration mDNS (neopro.local)
################################################################################

configure_mdns() {
    print_step "Configuration mDNS (neopro.local)..."

    # Configuration Avahi service file
    cp ./config/systemd/neopro.service /etc/avahi/services/neopro.service

    # Configurer Avahi pour écouter sur toutes les interfaces (eth0, wlan0, wlan1)
    # Nécessaire pour que neopro.local soit accessible via Ethernet ET WiFi/Hotspot
    if grep -q "^#allow-interfaces" /etc/avahi/avahi-daemon.conf; then
        sed -i 's/^#allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
    elif grep -q "^allow-interfaces" /etc/avahi/avahi-daemon.conf; then
        sed -i 's/^allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
    else
        sed -i '/^\[server\]/a allow-interfaces=eth0,wlan0,wlan1' /etc/avahi/avahi-daemon.conf
    fi

    # Hostname dynamique : lire HOSTNAME_SLUG depuis site.conf, fallback "neopro"
    SITE_HOSTNAME="neopro"
    if [ -f /etc/neopro/site.conf ]; then
        CONFIGURED_HOSTNAME=$(grep "^HOSTNAME_SLUG=" /etc/neopro/site.conf | cut -d'=' -f2)
        if [ -n "${CONFIGURED_HOSTNAME}" ]; then
            SITE_HOSTNAME="${CONFIGURED_HOSTNAME}"
        fi
    fi

    # Changement du hostname
    hostnamectl set-hostname "${SITE_HOSTNAME}"
    echo "${SITE_HOSTNAME}" > /etc/hostname
    sed -i "s/127.0.1.1.*/127.0.1.1\t${SITE_HOSTNAME}.local ${SITE_HOSTNAME}/" /etc/hosts

    # Empêcher cloud-init de réinitialiser le hostname (si présent)
    if [ -f /etc/cloud/cloud.cfg ]; then
        sed -i 's/preserve_hostname: false/preserve_hostname: true/' /etc/cloud/cloud.cfg
        echo "preserve_hostname: true" >> /etc/cloud/cloud.cfg.d/99_hostname.cfg
    fi

    # Redémarrage Avahi
    systemctl restart avahi-daemon

    ensure_service_running avahi-daemon
    CURRENT_HOSTNAME=$(hostnamectl --static)
    if [ "${CURRENT_HOSTNAME}" != "${SITE_HOSTNAME}" ]; then
        print_warning "Hostname actuel (${CURRENT_HOSTNAME}) différent de ${SITE_HOSTNAME}. Reboot nécessaire."
    fi

    print_success "mDNS configuré: ${SITE_HOSTNAME}.local (hostname ${CURRENT_HOSTNAME})"
}

################################################################################
# Étape 6: Installation de l'application Neopro
################################################################################

install_app() {
    print_step "Installation de l'application Neopro..."

    # Création du répertoire
    mkdir -p ${INSTALL_DIR}/{server,webapp,admin,sync-agent,videos,logs,backups,scripts}

    # Copie du serveur Node.js
    cp -r ./server/* ${INSTALL_DIR}/server/

    # Installation des dépendances Node.js
    cd ${INSTALL_DIR}/server
    npm install --production
    cd -

    # Copie du serveur Admin
    cp -r ./admin/* ${INSTALL_DIR}/admin/

    # Installation des dépendances Admin
    cd ${INSTALL_DIR}/admin
    npm install --production
    cd -

    # Copie du sync-agent
    if [ -d "./sync-agent" ]; then
        cp -r ./sync-agent/* ${INSTALL_DIR}/sync-agent/
        cd ${INSTALL_DIR}/sync-agent
        npm install --production
        cd -
        print_success "Sync-agent installé"
    else
        print_warning "Dossier sync-agent non trouvé - sync-agent non installé"
    fi

    # Copie des scripts de gestion
    if [ -d "./scripts" ]; then
        cp -r ./scripts/* ${INSTALL_DIR}/scripts/
        chmod +x ${INSTALL_DIR}/scripts/*.sh 2>/dev/null || true
        print_success "Scripts de gestion installés"
    else
        print_warning "Dossier scripts non trouvé - scripts de gestion non installés"
    fi

    # Copie du build Angular (webapp)
    if [ -d "./webapp" ] && [ -f "./webapp/index.html" ]; then
        cp -r ./webapp/* ${INSTALL_DIR}/webapp/
        print_success "Application Angular installée dans ${INSTALL_DIR}/webapp/"
    else
        print_warning "Dossier webapp/ non trouvé ou index.html absent."
        print_warning "Copiez le build Angular manuellement dans ${INSTALL_DIR}/webapp/"
    fi

    # Permissions
    chown -R pi:pi ${INSTALL_DIR}

    print_success "Application installée dans ${INSTALL_DIR}"
}

################################################################################
# Étape 7: Configuration Nginx
################################################################################

configure_nginx() {
    print_step "Configuration du serveur web Nginx..."

    cat > /etc/nginx/sites-available/neopro << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name neopro.local 192.168.4.1;

    root /home/pi/neopro/webapp;
    index index.html;

    # Logs
    access_log /home/pi/neopro/logs/nginx-access.log;
    error_log /home/pi/neopro/logs/nginx-error.log;

    # ========================================================================
    # CAPTIVE PORTAL - Endpoints de détection de connectivité
    # ========================================================================

    # Android (Google) - Principal check
    location /generate_204 {
        return 204;
    }

    # Android (ancienne version)
    location /gen_204 {
        return 204;
    }

    # Chrome Captive Portal detection
    location /connecttest.txt {
        return 200 "Microsoft Connect Test";
        add_header Content-Type text/plain;
    }

    # Windows Captive Portal
    location /ncsi.txt {
        return 200 "Microsoft NCSI";
        add_header Content-Type text/plain;
    }

    # Apple iOS Captive Portal
    location /hotspot-detect.html {
        return 200 "<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>";
        add_header Content-Type text/html;
    }

    # ========================================================================
    # APPLICATION PRINCIPALE
    # ========================================================================

    # index.html — jamais mis en cache (garantit le chargement du dernier build Angular)
    # Les JS/CSS ont des content-hash dans leurs noms, donc immutables par design.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires 0;
    }

    # Fichiers statiques Angular (JS/CSS/fonts/images) — cache longue durée
    # Les content-hash dans les noms de fichiers garantissent l'invalidation automatique
    location ~* \.(js|mjs|css|woff2?|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp|map)$ {
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Application Angular (fallback SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Fichiers vidéos (proxy vers admin-server pour normalisation Unicode)
    location /videos/ {
        proxy_pass http://127.0.0.1:8080/videos/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Vidéos secondaires (variantes dual-display)
    location /videos-secondary/ {
        proxy_pass http://127.0.0.1:8080/videos-secondary/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Thumbnails (proxy vers admin-server pour normalisation Unicode)
    location /thumbnails/ {
        proxy_pass http://127.0.0.1:8080/thumbnails/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Proxy Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Proxy Admin interface (port 8080)
    location /admin/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

    # Activation
    ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro
    rm -f /etc/nginx/sites-enabled/default

    # Fix permissions pour nginx (www-data doit pouvoir accéder à /home/pi)
    print_step "Configuration des permissions pour nginx..."
    chmod 755 /home/pi
    chmod 755 "${INSTALL_DIR}"
    chmod -R 755 "${INSTALL_DIR}/webapp"
    chown -R pi:www-data "${INSTALL_DIR}/webapp"

    # Test et redémarrage
    nginx -t
    systemctl restart nginx
    systemctl enable nginx

    print_success "Nginx configuré avec les bonnes permissions"
}

################################################################################
# Étape 8: Configuration des services systemd
################################################################################

configure_services() {
    print_step "Configuration des services de démarrage automatique..."

    # Trouver le répertoire des fichiers de service
    local SERVICE_DIR="./config/systemd"
    if [ ! -d "$SERVICE_DIR" ]; then
        SERVICE_DIR="./config"
    fi

    # Service application
    if [ -f "${SERVICE_DIR}/neopro-app.service" ]; then
        cp "${SERVICE_DIR}/neopro-app.service" /etc/systemd/system/
        systemctl enable neopro-app.service
        print_success "Service neopro-app configuré"
    else
        print_warning "Fichier neopro-app.service non trouvé"
    fi

    # Service admin
    if [ -f "${SERVICE_DIR}/neopro-admin.service" ]; then
        cp "${SERVICE_DIR}/neopro-admin.service" /etc/systemd/system/
        systemctl enable neopro-admin.service
        print_success "Service neopro-admin configuré"
    fi

    # Service kiosque (mode TV) avec watchdog
    if [ -f "${SERVICE_DIR}/neopro-kiosk.service" ]; then
        cp "${SERVICE_DIR}/neopro-kiosk.service" /etc/systemd/system/

        # Copier le script watchdog qui gère Chromium
        # Le watchdog détecte automatiquement Pi 4 vs Pi 5 et applique les bons flags GPU
        local SCRIPT_DIR="./scripts"
        if [ -f "${SCRIPT_DIR}/kiosk-watchdog.sh" ]; then
            mkdir -p /home/pi/neopro/scripts
            cp "${SCRIPT_DIR}/kiosk-watchdog.sh" /home/pi/neopro/scripts/
            chmod +x /home/pi/neopro/scripts/kiosk-watchdog.sh
            chown pi:pi /home/pi/neopro/scripts/kiosk-watchdog.sh
            print_success "Script kiosk-watchdog.sh installé"
        else
            print_warning "Script kiosk-watchdog.sh non trouvé dans ${SCRIPT_DIR}/"
        fi

        # Vérifier que Chromium est installé
        if [ -x "/usr/bin/chromium" ] || [ -x "/usr/bin/chromium-browser" ]; then
            print_success "Service neopro-kiosk configuré (watchdog avec détection auto Pi 4/Pi 5)"
        else
            print_warning "Chromium non trouvé, le mode kiosque ne fonctionnera pas"
        fi

        systemctl enable neopro-kiosk.service
    fi

    # Service sync-agent
    if [ -f "${SERVICE_DIR}/neopro-sync-agent.service" ]; then
        cp "${SERVICE_DIR}/neopro-sync-agent.service" /etc/systemd/system/
        systemctl enable neopro-sync-agent.service
        print_success "Service neopro-sync-agent configuré"
    fi

    # Service hotspot-watchdog (surveillance et auto-recovery du hotspot WiFi)
    if [ -f "${SERVICE_DIR}/neopro-hotspot-watchdog.service" ]; then
        cp "${SERVICE_DIR}/neopro-hotspot-watchdog.service" /etc/systemd/system/

        # Copier le script hotspot-watchdog
        local SCRIPT_DIR="./scripts"
        if [ -f "${SCRIPT_DIR}/hotspot-watchdog.sh" ]; then
            cp "${SCRIPT_DIR}/hotspot-watchdog.sh" /home/pi/neopro/scripts/
            chmod +x /home/pi/neopro/scripts/hotspot-watchdog.sh
            chown pi:pi /home/pi/neopro/scripts/hotspot-watchdog.sh
        fi

        systemctl enable neopro-hotspot-watchdog.service
        print_success "Service neopro-hotspot-watchdog configuré"
    fi

    # Service hotspot-optimizer (auto-select best WiFi channel at boot)
    if [ -f "${SERVICE_DIR}/neopro-hotspot-optimizer.service" ]; then
        cp "${SERVICE_DIR}/neopro-hotspot-optimizer.service" /etc/systemd/system/

        # Copier le script hotspot-optimizer
        local SCRIPT_DIR="./scripts"
        if [ -f "${SCRIPT_DIR}/hotspot-optimizer.sh" ]; then
            cp "${SCRIPT_DIR}/hotspot-optimizer.sh" /home/pi/neopro/scripts/
            chmod +x /home/pi/neopro/scripts/hotspot-optimizer.sh
            chown pi:pi /home/pi/neopro/scripts/hotspot-optimizer.sh
        fi

        systemctl enable neopro-hotspot-optimizer.service
        print_success "Service neopro-hotspot-optimizer configuré"
    fi

    # Service sync-agent-guardian (watchdog pour maintenir la connexion cloud)
    if [ -f "${SERVICE_DIR}/neopro-sync-guardian.service" ]; then
        cp "${SERVICE_DIR}/neopro-sync-guardian.service" /etc/systemd/system/

        # Copier le script guardian
        local SCRIPT_DIR="./scripts"
        if [ -f "${SCRIPT_DIR}/sync-agent-guardian.sh" ]; then
            cp "${SCRIPT_DIR}/sync-agent-guardian.sh" /home/pi/neopro/scripts/
            chmod +x /home/pi/neopro/scripts/sync-agent-guardian.sh
        fi

        systemctl enable neopro-sync-guardian.service
        print_success "Service neopro-sync-guardian configuré"

        # Créer la version golden initiale après que tout soit installé
        echo "   ℹ️  La version 'golden' du sync-agent sera créée au premier démarrage stable"
    fi

    # Rechargement systemd
    systemctl daemon-reload

    print_success "Services configurés pour démarrage automatique"
}

################################################################################
# Étape 9: Configuration de l'interface graphique
################################################################################

configure_gui() {
    print_step "Configuration de l'interface graphique (mode Kiosque)..."

    # Désactivation de l'économiseur d'écran
    mkdir -p /home/pi/.config/lxsession/LXDE-pi
    # Mode kiosk : PAS de lxpanel (barre de tâches) — elle recouvre Chromium fullscreen.
    # pcmanfm --desktop fournit le fond noir, xset désactive l'économiseur d'écran.
    cat > /home/pi/.config/lxsession/LXDE-pi/autostart << 'EOF'
@xsetroot -solid black
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0 -root
EOF

    chown -R pi:pi /home/pi/.config

    print_success "Interface graphique configurée"
}

################################################################################
# Étape 9b: Configuration GPU pour décodage vidéo
################################################################################

configure_gpu_memory() {
    print_step "Configuration de la mémoire GPU pour le décodage vidéo..."

    local CONFIG_FILE="/boot/config.txt"
    # Sur Pi 5, le fichier peut être dans /boot/firmware/
    if [ -f "/boot/firmware/config.txt" ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    fi

    # Valeur recommandée pour Chromium avec 4 players vidéo H.264
    local GPU_MEM=256

    # Vérifier si gpu_mem est déjà configuré
    if grep -q "^gpu_mem=" "${CONFIG_FILE}" 2>/dev/null; then
        local CURRENT_GPU_MEM=$(grep "^gpu_mem=" "${CONFIG_FILE}" | cut -d= -f2)
        if [ "${CURRENT_GPU_MEM}" -lt "${GPU_MEM}" ]; then
            print_warning "gpu_mem actuel (${CURRENT_GPU_MEM}M) trop faible, mise à jour vers ${GPU_MEM}M"
            sed -i "s/^gpu_mem=.*/gpu_mem=${GPU_MEM}/" "${CONFIG_FILE}"
            print_success "gpu_mem mis à jour à ${GPU_MEM}M dans ${CONFIG_FILE}"
        else
            print_success "gpu_mem déjà configuré à ${CURRENT_GPU_MEM}M (suffisant)"
        fi
    else
        # Ajouter la configuration
        echo "" >> "${CONFIG_FILE}"
        echo "# Mémoire GPU pour décodage vidéo Chromium (Neopro)" >> "${CONFIG_FILE}"
        echo "gpu_mem=${GPU_MEM}" >> "${CONFIG_FILE}"
        print_success "gpu_mem=${GPU_MEM} ajouté à ${CONFIG_FILE}"
    fi

    # Note: Le changement ne prend effet qu'après reboot
    print_warning "Le changement de gpu_mem nécessite un reboot pour être appliqué"
}

configure_hdmi_force_hotplug() {
    print_step "Configuration HDMI force hotplug (les 2 ports)..."

    local CONFIG_FILE="/boot/config.txt"
    if [ -f "/boot/firmware/config.txt" ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    fi

    # Force X11 à démarrer sur les 2 ports HDMI même sans écran branché.
    # Prérequis pour : boot headless, détection wrong port, dual-display.
    local needs_reboot=false

    for port in 0 1; do
        local key="hdmi_force_hotplug:${port}"
        if grep -q "^${key}=" "${CONFIG_FILE}" 2>/dev/null; then
            local current=$(grep "^${key}=" "${CONFIG_FILE}" | cut -d= -f2)
            if [ "${current}" != "1" ]; then
                sed -i "s/^${key}=.*/${key}=1/" "${CONFIG_FILE}"
                print_success "${key} mis à jour à 1"
                needs_reboot=true
            else
                print_success "${key} déjà configuré à 1"
            fi
        else
            echo "" >> "${CONFIG_FILE}"
            echo "# Force HDMI port ${port} hotplug (Neopro E-23)" >> "${CONFIG_FILE}"
            echo "${key}=1" >> "${CONFIG_FILE}"
            print_success "${key}=1 ajouté à ${CONFIG_FILE}"
            needs_reboot=true
        fi
    done

    if $needs_reboot; then
        print_warning "Le changement de hdmi_force_hotplug nécessite un reboot"
    fi
}

################################################################################
# Étape 10b: Boot splash — écran noir propre pendant le démarrage
################################################################################

configure_boot_splash() {
    print_step "Configuration du boot splash Neopro (écran noir propre)..."

    # --- 1. cmdline.txt : supprimer les messages console kernel ---
    local CMDLINE_FILE="/boot/cmdline.txt"
    if [ -f "/boot/firmware/cmdline.txt" ]; then
        CMDLINE_FILE="/boot/firmware/cmdline.txt"
    fi

    if [ -f "$CMDLINE_FILE" ]; then
        local current_cmdline
        current_cmdline=$(cat "$CMDLINE_FILE")
        local modified=false

        # Paramètres à ajouter si absents (chacun vérifié individuellement)
        local params=("quiet" "splash" "logo.nologo" "vt.global_cursor_default=0" "loglevel=1")
        for param in "${params[@]}"; do
            if ! echo "$current_cmdline" | grep -qw "$param"; then
                current_cmdline="$current_cmdline $param"
                modified=true
            fi
        done

        if $modified; then
            echo "$current_cmdline" > "$CMDLINE_FILE"
            print_success "Paramètres boot splash ajoutés à $CMDLINE_FILE"
        else
            print_success "Paramètres boot splash déjà présents dans $CMDLINE_FILE"
        fi
    else
        print_warning "Fichier cmdline.txt non trouvé — boot splash non configuré"
    fi

    # --- 2. config.txt : désactiver le rainbow splash du firmware ---
    local CONFIG_FILE="/boot/config.txt"
    if [ -f "/boot/firmware/config.txt" ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    fi

    if ! grep -q "^disable_splash=1" "$CONFIG_FILE" 2>/dev/null; then
        echo "" >> "$CONFIG_FILE"
        echo "# Désactiver le rainbow splash du firmware (Neopro boot)" >> "$CONFIG_FILE"
        echo "disable_splash=1" >> "$CONFIG_FILE"
        print_success "disable_splash=1 ajouté à $CONFIG_FILE"
    else
        print_success "disable_splash=1 déjà présent dans $CONFIG_FILE"
    fi

    print_warning "Le boot splash sera actif au prochain reboot"
}

################################################################################
# Étape 10: Configuration SSH pour accès distant
################################################################################

configure_ssh() {
    print_step "Configuration SSH pour accès distant..."

    # Activation SSH
    systemctl enable ssh
    systemctl start ssh

    print_success "SSH activé pour accès distant"
    print_warning "N'oubliez pas de changer le mot de passe par défaut: passwd"
}

################################################################################
# Étape 11: Finalisation
################################################################################

finalize() {
    print_step "Finalisation de l'installation..."

    # Création du fichier de configuration club
    cat > ${INSTALL_DIR}/club-config.json << EOF
{
  "clubName": "${CLUB_NAME}",
  "wifiSSID": "NEOPRO-${CLUB_NAME}",
  "wifiPassword": "${WIFI_PASSWORD}",
  "installDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.0.0"
}
EOF
    # Restreindre l'accès au fichier contenant le mot de passe WiFi
    chown pi:pi ${INSTALL_DIR}/club-config.json
    chmod 600 ${INSTALL_DIR}/club-config.json

    # Permissions finales : tout appartient à pi pour que sync-agent puisse écrire
    # www-data (nginx) peut lire via le groupe pi
    chown -R pi:pi ${INSTALL_DIR}
    chmod 755 ${INSTALL_DIR}
    find ${INSTALL_DIR}/webapp -type d -exec chmod 755 {} \; 2>/dev/null || true
    find ${INSTALL_DIR}/webapp -type f -exec chmod 644 {} \; 2>/dev/null || true
    usermod -a -G pi www-data

    print_success "Configuration et permissions sauvegardées"
}

################################################################################
# Vérification post-installation
################################################################################

verify_installation() {
    print_step "Vérification post-installation..."
    local ERRORS=0
    local WARNINGS=0

    # Vérifier les services critiques
    for svc in nginx dnsmasq hostapd dhcpcd avahi-daemon; do
        if service_exists "$svc"; then
            if systemctl is-active --quiet "$svc"; then
                print_success "Service $svc: actif"
            else
                print_error "Service $svc: inactif"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done

    # Vérifier que Nginx répond
    if command -v curl &> /dev/null; then
        if curl -sf -o /dev/null http://localhost/ 2>/dev/null; then
            print_success "Nginx répond sur http://localhost/"
        elif [ -f "${INSTALL_DIR}/webapp/index.html" ]; then
            print_warning "Nginx ne répond pas encore (normal avant reboot)"
            WARNINGS=$((WARNINGS + 1))
        else
            print_warning "webapp/index.html absent — Nginx retournera 404"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi

    # Vérifier le hotspot WiFi
    if iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -q "type AP"; then
        print_success "Hotspot WiFi actif en mode AP"
    else
        print_warning "Hotspot WiFi pas encore en mode AP (peut nécessiter un reboot)"
        WARNINGS=$((WARNINGS + 1))
    fi

    # Vérifier les fichiers critiques
    local CRITICAL_FILES=(
        "${INSTALL_DIR}/server/server.js"
        "${INSTALL_DIR}/admin/admin-server.js"
    )
    for f in "${CRITICAL_FILES[@]}"; do
        if [ ! -f "$f" ]; then
            print_error "Fichier critique manquant: $f"
            ERRORS=$((ERRORS + 1))
        fi
    done

    # Résumé
    if [ $ERRORS -gt 0 ]; then
        print_error "Vérification: $ERRORS erreur(s), $WARNINGS avertissement(s)"
        print_warning "L'installation a des problèmes — vérifiez les erreurs ci-dessus."
    elif [ $WARNINGS -gt 0 ]; then
        print_warning "Vérification: $WARNINGS avertissement(s) non critiques — un reboot devrait les résoudre."
    else
        print_success "Vérification: tout est en ordre"
    fi
}

################################################################################
# Affichage du résumé
################################################################################

print_summary() {
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║            INSTALLATION TERMINÉE AVEC SUCCÈS                   ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Configuration du système:${NC}"
    echo "  • Nom du club: ${CLUB_NAME}"
    echo "  • WiFi SSID: NEOPRO-${CLUB_NAME}"
    echo "  • WiFi Password: ${WIFI_PASSWORD}"
    echo "  • IP du Raspberry: 192.168.4.1"
    echo "  • URL locale: http://neopro.local"
    echo "  • Répertoire: ${INSTALL_DIR}"
    if [ -n "${WIFI_CLIENT_INTERFACE}" ]; then
        if [ -n "${CLIENT_WIFI_SSID}" ]; then
            echo "  • WiFi client (${WIFI_CLIENT_INTERFACE}): ${CLIENT_WIFI_SSID}"
        else
            echo "  • WiFi client (${WIFI_CLIENT_INTERFACE}): à configurer (admin /scripts/setup-wifi-client.sh)"
        fi
    else
        local ETH_CONNECTED=$(check_ethernet_connection)
        if [ -n "$ETH_CONNECTED" ]; then
            echo "  • Accès Internet: Ethernet ($ETH_CONNECTED)"
        else
            echo "  • Accès Internet: Non configuré (hotspot uniquement)"
        fi
    fi
    echo ""
    echo -e "${YELLOW}Prochaines étapes:${NC}"
    local NEXT_STEP=1
    if [ ! -f "${INSTALL_DIR}/webapp/index.html" ]; then
        echo "  ${NEXT_STEP}. Copier le build Angular dans: ${INSTALL_DIR}/webapp/"
        NEXT_STEP=$((NEXT_STEP + 1))
    fi
    echo "  ${NEXT_STEP}. Copier les vidéos dans: ${INSTALL_DIR}/videos/"
    NEXT_STEP=$((NEXT_STEP + 1))
    echo "  ${NEXT_STEP}. Redémarrer le système: sudo reboot"
    echo ""
    echo -e "${YELLOW}Accès:${NC}"
    echo "  • Connectez votre appareil au WiFi NEOPRO-${CLUB_NAME} pour accéder aux URLs ci-dessous"
    echo "  • Mode TV (sur l'écran): http://neopro.local/tv"
    echo "  • Télécommande (sur mobile): http://neopro.local/remote"
    echo "  • Interface Admin: http://neopro.local:8080"
    echo "  • SSH distant: ssh pi@neopro.local (depuis le même réseau WiFi)"
    echo ""
    echo -e "${RED}IMPORTANT:${NC}"
    echo "  • Changez le mot de passe par défaut: passwd"
    if [ -z "${WIFI_CLIENT_INTERFACE}" ]; then
        local ETH_CONN=$(check_ethernet_connection)
        if [ -z "$ETH_CONN" ]; then
            echo "  • Pour ajouter un accès Internet: branchez une clé WiFi USB ou un câble Ethernet"
        fi
    fi
    echo ""
}

################################################################################
# Fonction principale
################################################################################

main() {

    print_header
    check_root

    # Se placer dans le répertoire du script
    cd "$SCRIPT_DIR"

    echo -e "${YELLOW}Cette installation va configurer ce Raspberry Pi comme système Neopro.${NC}"
    echo -e "${YELLOW}Durée estimée: 15-20 minutes${NC}"
    echo ""

    # Confirmation uniquement en mode interactif
    if [ "$NON_INTERACTIVE" != "true" ]; then
        read -p "Continuer? (o/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Oo]$ ]]; then
            print_error "Installation annulée"
            exit 1
        fi
    else
        echo -e "${GREEN}Mode automatique - démarrage de l'installation...${NC}"
        echo ""
    fi

    check_prerequisites
    validate_inputs
    update_system
    install_dependencies
    detect_wifi_interface
    detect_wifi_client_interface
    disable_conflicting_wifi_services
    install_nodejs
    configure_hotspot
    configure_mdns
    install_app
    configure_wifi_client_support
    configure_nginx
    configure_services
    configure_gui
    configure_gpu_memory
    configure_hdmi_force_hotplug
    configure_boot_splash
    configure_ssh
    finalize
    verify_installation
    print_elapsed_time
    print_summary

    echo -e "${GREEN}Installation terminée!${NC}"
    echo -e "${YELLOW}Redémarrage recommandé: sudo reboot${NC}"
    echo ""
    echo -e "${BLUE}Log complet de l'installation : $LOG_FILE${NC}"
}

# Lancement
main "$@"
