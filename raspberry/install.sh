#!/bin/bash

################################################################################
# Script d'installation Neopro pour Raspberry Pi
# Ce script configure automatiquement un Raspberry Pi comme système Neopro
#
# Usage: sudo ./install.sh [NOM_CLUB] [MOT_PASSE_WIFI]
# Exemple: sudo ./install.sh CESSON MyWiFiPass123
################################################################################

set -e  # Arrêt en cas d'erreur

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

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo"
        exit 1
    fi
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

    # Configuration de l'interface wlan0
    cat > /etc/dhcpcd.conf << EOF
# Configuration réseau Neopro
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
EOF

    # Configuration hostapd (avec personnalisation SSID)
    sed "s/NEOPRO-CLUB/NEOPRO-${CLUB_NAME}/" ./config/hostapd.conf > /etc/hostapd/hostapd.conf
    sed -i "s/wpa_passphrase=.*/wpa_passphrase=${WIFI_PASSWORD}/" /etc/hostapd/hostapd.conf

    # Activation de hostapd
    echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

    # Configuration dnsmasq
    mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
    cp ./config/dnsmasq.conf /etc/dnsmasq.conf

    # Activation des services
    systemctl unmask hostapd
    systemctl enable hostapd
    systemctl enable dnsmasq

    print_success "Hotspot WiFi configuré: NEOPRO-${CLUB_NAME}"
}

################################################################################
# Étape 5: Configuration mDNS (neopro.local)
################################################################################

configure_mdns() {
    print_step "Configuration mDNS (neopro.local)..."

    # Configuration Avahi
    cp ./config/neopro.service /etc/avahi/services/neopro.service

    # Changement du hostname
    hostnamectl set-hostname neopro
    sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts

    # Redémarrage Avahi
    systemctl restart avahi-daemon

    print_success "mDNS configuré: neopro.local"
}

################################################################################
# Étape 6: Installation de l'application Neopro
################################################################################

install_app() {
    print_step "Installation de l'application Neopro..."

    # Création du répertoire
    mkdir -p ${INSTALL_DIR}/{server,webapp,admin,videos,logs,backups}

    # Copie du serveur Node.js
    cp -r ../server-render/* ${INSTALL_DIR}/server/

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

    # Service application
    cp ./config/neopro-app.service /etc/systemd/system/

    # Service admin
    cp ./config/neopro-admin.service /etc/systemd/system/

    # Service kiosque (mode TV)
    cp ./config/neopro-kiosk.service /etc/systemd/system/

    # Rechargement systemd
    systemctl daemon-reload

    # Activation des services
    systemctl enable neopro-app.service
    systemctl enable neopro-admin.service
    systemctl enable neopro-kiosk.service

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
    echo "  • Mode TV (sur l'écran): http://neopro.local/tv"
    echo "  • Télécommande (sur mobile): http://neopro.local/remote"
    echo "  • Interface Admin: http://neopro.local:8080"
    echo "  • SSH distant: ssh pi@[IP_PUBLIQUE]"
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

    echo -e "${YELLOW}Cette installation va configurer ce Raspberry Pi comme système Neopro.${NC}"
    echo -e "${YELLOW}Durée estimée: 15-20 minutes${NC}"
    echo ""
    read -p "Continuer? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Installation annulée"
        exit 1
    fi

    update_system
    install_dependencies
    install_nodejs
    configure_hotspot
    configure_mdns
    install_app
    configure_nginx
    configure_services
    configure_gui
    configure_ssh
    finalize
    print_summary

    echo -e "${GREEN}Installation terminée!${NC}"
    echo -e "${YELLOW}Redémarrage recommandé: sudo reboot${NC}"
}

# Lancement
main "$@"
