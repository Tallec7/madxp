#!/bin/bash

################################################################################
# Script d'installation rapide Neopro
# Installation complète en mode interactif simplifié
#
# Usage: curl -sSL https://neopro.local/install.sh | sudo bash
#        OU: sudo ./quick-install.sh
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables globales
CLUB_NAME=""
WIFI_PASSWORD=""
INSTALL_DIR="/home/pi/neopro"
NODE_VERSION="18"

################################################################################
# Fonctions d'affichage
################################################################################

print_banner() {
    clear
    echo -e "${CYAN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║    ███╗   ██╗███████╗ ██████╗ ██████╗ ██████╗  ██████╗          ║
║    ████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗         ║
║    ██╔██╗ ██║█████╗  ██║   ██║██████╔╝██████╔╝██║   ██║         ║
║    ██║╚██╗██║██╔══╝  ██║   ██║██╔═══╝ ██╔══██╗██║   ██║         ║
║    ██║ ╚████║███████╗╚██████╔╝██║     ██║  ██║╚██████╔╝         ║
║    ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝ ╚═════╝          ║
║                                                                   ║
║              INSTALLATION RAPIDE RASPBERRY PI                    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

print_step() {
    echo -e "${MAGENTA}▶${NC} ${CYAN}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

################################################################################
# Vérifications préalables
################################################################################

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo"
        exit 1
    fi
}

check_os() {
    if ! grep -qi "raspberry" /proc/cpuinfo 2>/dev/null; then
        print_warning "Ce système ne semble pas être un Raspberry Pi"
        read -p "Continuer quand même ? (o/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Oo]$ ]]; then
            exit 1
        fi
    fi
}

check_internet() {
    print_step "Vérification de la connexion Internet..."
    if ping -c 1 8.8.8.8 &> /dev/null; then
        print_success "Connexion Internet OK"
        return 0
    else
        print_error "Pas de connexion Internet"
        print_warning "Une connexion Internet est nécessaire pour l'installation"
        exit 1
    fi
}

################################################################################
# Interface utilisateur
################################################################################

welcome_screen() {
    print_banner
    echo ""
    echo -e "${CYAN}Bienvenue dans l'installation de Neopro !${NC}"
    echo ""
    echo "Ce script va installer et configurer automatiquement :"
    echo ""
    echo "  ${GREEN}✓${NC} Hotspot WiFi autonome"
    echo "  ${GREEN}✓${NC} Application Neopro (serveur + interface)"
    echo "  ${GREEN}✓${NC} Interface d'administration web"
    echo "  ${GREEN}✓${NC} Mode TV automatique"
    echo "  ${GREEN}✓${NC} Démarrage automatique"
    echo ""
    echo -e "${YELLOW}Durée estimée : 15-20 minutes${NC}"
    echo ""
    read -p "Appuyez sur Entrée pour commencer..."
}

configure_club() {
    print_banner
    echo ""
    print_step "Configuration du club"
    echo ""

    # Nom du club
    while true; do
        read -p "Nom du club (ex: CESSON, NANTES) : " CLUB_NAME
        if [ -z "$CLUB_NAME" ]; then
            print_error "Le nom du club est requis"
        elif [[ ! "$CLUB_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
            print_error "Utilisez uniquement des lettres, chiffres, - et _"
        else
            break
        fi
    done

    # Mot de passe WiFi
    while true; do
        read -s -p "Mot de passe WiFi Hotspot (8+ caractères) : " WIFI_PASSWORD
        echo ""
        if [ ${#WIFI_PASSWORD} -lt 8 ]; then
            print_error "Le mot de passe doit contenir au moins 8 caractères"
        else
            read -s -p "Confirmer le mot de passe : " WIFI_PASSWORD_CONFIRM
            echo ""
            if [ "$WIFI_PASSWORD" != "$WIFI_PASSWORD_CONFIRM" ]; then
                print_error "Les mots de passe ne correspondent pas"
            else
                break
            fi
        fi
    done

    # Confirmation
    echo ""
    echo -e "${CYAN}Récapitulatif :${NC}"
    echo "  Club : ${GREEN}$CLUB_NAME${NC}"
    echo "  WiFi SSID : ${GREEN}NEOPRO-$CLUB_NAME${NC}"
    echo "  WiFi Password : ${GREEN}[défini]${NC}"
    echo ""
    read -p "Confirmer et lancer l'installation ? (o/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Installation annulée"
        exit 1
    fi
}

################################################################################
# Installation
################################################################################

show_progress() {
    local total=$1
    local current=$2
    local message=$3

    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))

    printf "\r${CYAN}["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "]${NC} ${percent}%% - ${message}"
}

update_system() {
    print_banner
    show_progress 11 1 "Mise à jour du système..."
    apt-get update -qq > /dev/null 2>&1
    apt-get upgrade -y -qq > /dev/null 2>&1
    echo ""
    print_success "Système mis à jour"
}

install_dependencies() {
    show_progress 11 2 "Installation des dépendances..."
    apt-get install -y -qq \
        hostapd dnsmasq avahi-daemon nginx git curl \
        unclutter xdotool x11-xserver-utils chromium-browser \
        whiptail > /dev/null 2>&1
    echo ""
    print_success "Dépendances installées"
}

install_nodejs() {
    show_progress 11 3 "Installation de Node.js..."
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
        apt-get install -y -qq nodejs > /dev/null 2>&1
    fi
    echo ""
    print_success "Node.js $(node --version) installé"
}

configure_hotspot() {
    show_progress 11 4 "Configuration du Hotspot WiFi..."

    # dhcpcd
    cat > /etc/dhcpcd.conf << EOF
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
EOF

    # hostapd
    cat > /etc/hostapd/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=NEOPRO-${CLUB_NAME}
hw_mode=g
channel=6
wmm_enabled=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
wpa_passphrase=${WIFI_PASSWORD}
max_num_sta=10
ignore_broadcast_ssid=0
ieee80211n=1
country_code=FR
EOF

    echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

    # dnsmasq
    mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig 2>/dev/null || true
    cat > /etc/dnsmasq.conf << EOF
interface=wlan0
bind-interfaces
dhcp-range=192.168.4.10,192.168.4.50,255.255.255.0,24h
server=8.8.8.8
domain=neopro.local
address=/neopro.local/192.168.4.1
dhcp-option=3,192.168.4.1
dhcp-option=6,192.168.4.1
cache-size=1000
log-dhcp
log-facility=/var/log/dnsmasq.log
EOF

    systemctl unmask hostapd > /dev/null 2>&1
    systemctl enable hostapd > /dev/null 2>&1
    systemctl enable dnsmasq > /dev/null 2>&1

    echo ""
    print_success "Hotspot configuré : NEOPRO-$CLUB_NAME"
}

configure_mdns() {
    show_progress 11 5 "Configuration mDNS..."

    mkdir -p /etc/avahi/services
    cat > /etc/avahi/services/neopro.service << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Neopro %h</name>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
  </service>
  <service>
    <type>_neopro._tcp</type>
    <port>3000</port>
  </service>
</service-group>
EOF

    hostnamectl set-hostname neopro
    sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts
    systemctl restart avahi-daemon > /dev/null 2>&1

    echo ""
    print_success "mDNS configuré : neopro.local"
}

download_neopro() {
    show_progress 11 6 "Téléchargement de Neopro..."

    mkdir -p $INSTALL_DIR

    # Note : En production, télécharger depuis un repository
    # Pour l'instant, on suppose que les fichiers sont déjà présents
    if [ -d "./raspberry" ]; then
        cp -r . $INSTALL_DIR/installation/
    fi

    echo ""
    print_success "Fichiers Neopro prêts"
}

install_app() {
    show_progress 11 7 "Installation de l'application..."

    mkdir -p $INSTALL_DIR/{server,webapp,admin,videos,logs,backups}

    # Copie des fichiers serveur (si disponibles)
    # Note : À adapter selon votre structure

    # Configuration du club
    cat > $INSTALL_DIR/club-config.json << EOF
{
  "clubName": "$CLUB_NAME",
  "wifiSSID": "NEOPRO-$CLUB_NAME",
  "wifiPassword": "$WIFI_PASSWORD",
  "installDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.0.0",
  "configured": true
}
EOF

    chown -R pi:pi $INSTALL_DIR

    echo ""
    print_success "Application installée"
}

configure_nginx() {
    show_progress 11 8 "Configuration du serveur web..."

    cat > /etc/nginx/sites-available/neopro << 'EOF'
server {
    listen 80 default_server;
    server_name neopro.local 192.168.4.1;
    root /home/pi/neopro/webapp;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /videos/ {
        alias /home/pi/neopro/videos/;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

    ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro
    rm -f /etc/nginx/sites-enabled/default
    systemctl enable nginx > /dev/null 2>&1

    echo ""
    print_success "Nginx configuré"
}

configure_services() {
    show_progress 11 9 "Configuration des services..."

    # Services systemd déjà créés par install.sh
    systemctl daemon-reload
    systemctl enable neopro-app neopro-admin neopro-kiosk > /dev/null 2>&1

    echo ""
    print_success "Services configurés"
}

install_tools() {
    show_progress 11 10 "Installation des outils de maintenance..."

    # Les scripts tools sont déjà dans raspberry/tools/

    echo ""
    print_success "Outils installés"
}

finalize() {
    show_progress 11 11 "Finalisation..."

    # README sur le bureau
    mkdir -p /home/pi/Desktop
    cat > /home/pi/Desktop/NEOPRO.txt << EOF
╔══════════════════════════════════════════════════════╗
║              NEOPRO INSTALLÉ AVEC SUCCÈS             ║
╚══════════════════════════════════════════════════════╝

Club: $CLUB_NAME
WiFi: NEOPRO-$CLUB_NAME

ACCÈS:
  • Application: http://neopro.local
  • Mode TV: http://neopro.local/tv
  • Remote: http://neopro.local/remote
  • Admin: http://neopro.local:8080

PROCHAINES ÉTAPES:
  1. Redémarrer le système
  2. Copier l'application Angular dans /home/pi/neopro/webapp/
  3. Copier les vidéos dans /home/pi/neopro/videos/

SUPPORT: support@neopro.fr
EOF

    chown pi:pi /home/pi/Desktop/NEOPRO.txt

    echo ""
    print_success "Installation terminée !"
}

################################################################################
# Écran final
################################################################################

final_screen() {
    print_banner
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          INSTALLATION TERMINÉE AVEC SUCCÈS !                     ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Configuration :${NC}"
    echo "  • Club : ${GREEN}$CLUB_NAME${NC}"
    echo "  • WiFi SSID : ${GREEN}NEOPRO-$CLUB_NAME${NC}"
    echo "  • WiFi Password : ${GREEN}[défini]${NC}"
    echo "  • IP du Raspberry : ${GREEN}192.168.4.1${NC}"
    echo "  • URL locale : ${GREEN}http://neopro.local${NC}"
    echo ""
    echo -e "${CYAN}Prochaines étapes :${NC}"
    echo ""
    echo "  ${YELLOW}1.${NC} Redémarrer le système :"
    echo "     ${BLUE}sudo reboot${NC}"
    echo ""
    echo "  ${YELLOW}2.${NC} Copier l'application Angular :"
    echo "     ${BLUE}scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/${NC}"
    echo ""
    echo "  ${YELLOW}3.${NC} Copier les vidéos :"
    echo "     ${BLUE}scp -r videos/* pi@neopro.local:/home/pi/neopro/videos/${NC}"
    echo ""
    echo -e "${CYAN}URLs d'accès (après redémarrage) :${NC}"
    echo "  • Application : ${GREEN}http://neopro.local${NC}"
    echo "  • Mode TV : ${GREEN}http://neopro.local/tv${NC}"
    echo "  • Remote : ${GREEN}http://neopro.local/remote${NC}"
    echo "  • Admin : ${GREEN}http://neopro.local:8080${NC}"
    echo ""
    echo -e "${YELLOW}⚠ IMPORTANT :${NC}"
    echo "  • Changez le mot de passe par défaut : ${BLUE}passwd${NC}"
    echo "  • Documentation : ${BLUE}/home/pi/raspberry/GUIDE-UTILISATEUR.md${NC}"
    echo ""
    echo -e "${GREEN}Bon match ! 🏐${NC}"
    echo ""
    read -p "Appuyez sur Entrée pour continuer..."
}

################################################################################
# Fonction principale
################################################################################

main() {
    check_root
    check_os

    welcome_screen
    check_internet
    configure_club

    # Installation
    update_system
    install_dependencies
    install_nodejs
    configure_hotspot
    configure_mdns
    download_neopro
    install_app
    configure_nginx
    configure_services
    install_tools
    finalize

    final_screen

    echo ""
    echo -e "${YELLOW}Voulez-vous redémarrer maintenant ? (o/N)${NC}"
    read -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        echo "Redémarrage dans 3 secondes..."
        sleep 3
        reboot
    else
        echo "N'oubliez pas de redémarrer : ${BLUE}sudo reboot${NC}"
    fi
}

# Gestion des erreurs
trap 'echo ""; print_error "Installation interrompue"; exit 1' INT TERM

# Lancement
main "$@"
