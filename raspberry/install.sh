#!/bin/bash

################################################################################
# Script d'installation Neopro pour Raspberry Pi
# Ce script configure automatiquement un Raspberry Pi comme système Neopro
#
# Usage: sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
# Exemple: sudo ./install.sh CESSON MyWiFiPass123
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIME=$(date +%s)

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
    local PASS_LENGTH=${#WIFI_PASSWORD}
    if [ "${PASS_LENGTH}" -lt 8 ] || [ "${PASS_LENGTH}" -gt 63 ]; then
        print_error "Le mot de passe WiFi doit contenir entre 8 et 63 caractères (actuel: ${PASS_LENGTH})."
        echo "Veuillez relancer le script avec un mot de passe plus long: sudo ./install.sh ${CLUB_NAME} MonPassSecret123"
        exit 1
    fi
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

disable_conflicting_wifi_services() {
    for SERVICE in NetworkManager wpa_supplicant iwd; do
        if service_exists "${SERVICE}"; then
            if systemctl is-active --quiet "${SERVICE}"; then
                print_warning "Arrêt du service ${SERVICE} pour libérer ${WIFI_INTERFACE}."
                systemctl stop "${SERVICE}" || true
            fi
            systemctl disable "${SERVICE}" || true
        fi
    done
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
        "./config/systemd/hostapd.conf"
        "./config/systemd/dnsmasq.conf"
        "./config/systemd/neopro.service"
        "./config/systemd/neopro-app.service"
        "./config/systemd/neopro-admin.service"
        "./server"
        "./admin"
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
    print_info "Durée totale d'installation: ${MINUTES}m ${SECONDS}s"
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
        unclutter \
        xdotool \
        x11-xserver-utils \
        chromium

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
    sed "s/NEOPRO-CLUB/NEOPRO-${CLUB_NAME}/" ./config/systemd/hostapd.conf > /etc/hostapd/hostapd.conf
    sed -i "s/wpa_passphrase=.*/wpa_passphrase=${WIFI_PASSWORD}/" /etc/hostapd/hostapd.conf
    sed -i "s/^interface=.*/interface=${WIFI_INTERFACE}/" /etc/hostapd/hostapd.conf
    sed -i "s/^channel=.*/channel=${WIFI_CHANNEL}/" /etc/hostapd/hostapd.conf

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
}

################################################################################
# Étape 5: Configuration mDNS (neopro.local)
################################################################################

configure_mdns() {
    print_step "Configuration mDNS (neopro.local)..."

    # Configuration Avahi
    cp ./config/systemd/neopro.service /etc/avahi/services/neopro.service

    # Changement du hostname
    hostnamectl set-hostname neopro
    echo "neopro" > /etc/hostname
    sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts

    # Empêcher cloud-init de réinitialiser le hostname (si présent)
    if [ -f /etc/cloud/cloud.cfg ]; then
        sed -i 's/preserve_hostname: false/preserve_hostname: true/' /etc/cloud/cloud.cfg
        echo "preserve_hostname: true" >> /etc/cloud/cloud.cfg.d/99_hostname.cfg
    fi

    # Redémarrage Avahi
    systemctl restart avahi-daemon

    ensure_service_running avahi-daemon
    CURRENT_HOSTNAME=$(hostnamectl --static)
    if [ "${CURRENT_HOSTNAME}" != "neopro" ]; then
        print_warning "Hostname actuel (${CURRENT_HOSTNAME}) différent de neopro. Reboot nécessaire."
    fi

    print_success "mDNS configuré: neopro.local (hostname ${CURRENT_HOSTNAME})"
}

################################################################################
# Étape 6: Installation de l'application Neopro
################################################################################

install_app() {
    print_step "Installation de l'application Neopro..."

    # Création du répertoire
    mkdir -p ${INSTALL_DIR}/{server,webapp,admin,sync-agent,videos,logs,backups}

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

    # Note: Le build Angular doit être copié séparément
    print_warning "N'oubliez pas de copier le build Angular dans ${INSTALL_DIR}/webapp/"

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

    # Application Angular
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Fichiers vidéos
    location /videos/ {
        alias /home/pi/neopro/videos/;
        autoindex off;
    }

    # Proxy Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

    # Activation
    ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro
    rm -f /etc/nginx/sites-enabled/default

    # Test et redémarrage
    nginx -t
    systemctl restart nginx
    systemctl enable nginx

    print_success "Nginx configuré"
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

    # Service kiosque (mode TV)
    if [ -f "${SERVICE_DIR}/neopro-kiosk.service" ]; then
        cp "${SERVICE_DIR}/neopro-kiosk.service" /etc/systemd/system/
        systemctl enable neopro-kiosk.service
        print_success "Service neopro-kiosk configuré"
    fi

    # Service sync-agent
    if [ -f "${SERVICE_DIR}/neopro-sync-agent.service" ]; then
        cp "${SERVICE_DIR}/neopro-sync-agent.service" /etc/systemd/system/
        systemctl enable neopro-sync-agent.service
        print_success "Service neopro-sync-agent configuré"
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
    cat > /home/pi/.config/lxsession/LXDE-pi/autostart << 'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
EOF

    chown -R pi:pi /home/pi/.config

    print_success "Interface graphique configurée"
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

    chown pi:pi ${INSTALL_DIR}/club-config.json

    print_success "Configuration sauvegardée"
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
    echo ""
    echo -e "${YELLOW}Prochaines étapes:${NC}"
    echo "  1. Copier le build Angular dans: ${INSTALL_DIR}/webapp/"
    echo "  2. Copier les vidéos dans: ${INSTALL_DIR}/videos/"
    echo "  3. Redémarrer le système: sudo reboot"
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
    echo "  • Configurez le WiFi client pour accès distant (optionnel)"
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
    read -p "Continuer? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Installation annulée"
        exit 1
    fi

    check_prerequisites
    validate_inputs
    update_system
    install_dependencies
    detect_wifi_interface
    disable_conflicting_wifi_services
    install_nodejs
    configure_hotspot
    configure_mdns
    install_app
    configure_nginx
    configure_services
    configure_gui
    configure_ssh
    finalize
    print_elapsed_time
    print_summary

    echo -e "${GREEN}Installation terminée!${NC}"
    echo -e "${YELLOW}Redémarrage recommandé: sudo reboot${NC}"
}

# Lancement
main "$@"
