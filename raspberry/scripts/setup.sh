#!/bin/bash

################################################################################
# Script d'installation en ligne Neopro
#
# Ce script télécharge et installe automatiquement Neopro sur un Raspberry Pi
# depuis une installation Raspberry Pi OS Lite fraîche.
#
# Usage (deux options - les deux sont gratuites) :
#
#   Option 1 - GitHub Pages (URL courte, recommandé) :
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD
#
#   Option 2 - Raw GitHub (aucune configuration) :
#   curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD
#
# Exemples:
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s MASTER MasterPass
#
# Documentation complète : docs/ONLINE_INSTALLATION.md
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         INSTALLATION NEOPRO DEPUIS INTERNET                   ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo"
        exit 1
    fi
}

check_parameters() {
    if [ -z "$CLUB_NAME" ] || [ -z "$WIFI_PASSWORD" ]; then
        print_error "Usage:"
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD"
        echo ""
        echo "Exemples:"
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123"
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s MASTER MasterPass"
        echo ""
        echo "Alternative (URL longue):"
        echo "  curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD"
        exit 1
    fi

    if [ ${#WIFI_PASSWORD} -lt 8 ]; then
        print_error "Le mot de passe WiFi doit faire au moins 8 caractères"
        exit 1
    fi
}

################################################################################
# Téléchargement des fichiers d'installation
################################################################################

download_installation_files() {
    print_step "Téléchargement des fichiers d'installation depuis GitHub..."

    # URL de base du repository
    GITHUB_RAW="https://raw.githubusercontent.com/Tallec7/neopro/main"

    # Créer le répertoire temporaire
    TEMP_DIR="/tmp/neopro-install-$$"
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"

    # Télécharger la structure nécessaire
    print_step "Téléchargement de install.sh..."
    curl -sSL "$GITHUB_RAW/raspberry/install.sh" -o install.sh
    chmod +x install.sh

    print_step "Téléchargement des configurations..."
    mkdir -p config/templates
    curl -sSL "$GITHUB_RAW/raspberry/config/templates/configuration-template.json" -o config/templates/configuration-template.json

    print_step "Téléchargement des services systemd..."
    mkdir -p services
    curl -sSL "$GITHUB_RAW/raspberry/services/neopro-app.service" -o services/neopro-app.service
    curl -sSL "$GITHUB_RAW/raspberry/services/neopro-admin.service" -o services/neopro-admin.service
    curl -sSL "$GITHUB_RAW/raspberry/services/neopro-sync-agent.service" -o services/neopro-sync-agent.service 2>/dev/null || true

    print_step "Téléchargement des configurations nginx..."
    mkdir -p nginx
    curl -sSL "$GITHUB_RAW/raspberry/nginx/neopro.conf" -o nginx/neopro.conf

    print_step "Téléchargement des configurations réseau..."
    mkdir -p network
    curl -sSL "$GITHUB_RAW/raspberry/network/hostapd.conf" -o network/hostapd.conf
    curl -sSL "$GITHUB_RAW/raspberry/network/dnsmasq.conf" -o network/dnsmasq.conf
    curl -sSL "$GITHUB_RAW/raspberry/network/interfaces" -o network/interfaces 2>/dev/null || true

    print_step "Téléchargement des outils..."
    mkdir -p tools
    curl -sSL "$GITHUB_RAW/raspberry/tools/healthcheck.sh" -o tools/healthcheck.sh
    curl -sSL "$GITHUB_RAW/raspberry/tools/recovery.sh" -o tools/recovery.sh
    curl -sSL "$GITHUB_RAW/raspberry/tools/prepare-golden-image.sh" -o tools/prepare-golden-image.sh
    chmod +x tools/*.sh

    print_success "Fichiers téléchargés dans $TEMP_DIR"
}

################################################################################
# Exécution de l'installation
################################################################################

run_installation() {
    print_step "Lancement de l'installation Neopro..."
    echo ""

    # Exécuter install.sh avec les paramètres
    ./install.sh "$CLUB_NAME" "$WIFI_PASSWORD"

    print_success "Installation terminée"
}

################################################################################
# Nettoyage
################################################################################

cleanup() {
    print_step "Nettoyage des fichiers temporaires..."

    if [ -d "$TEMP_DIR" ]; then
        cd /tmp
        rm -rf "$TEMP_DIR"
        print_success "Fichiers temporaires supprimés"
    fi
}

################################################################################
# Résumé final
################################################################################

print_final_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       INSTALLATION NEOPRO TERMINÉE AVEC SUCCÈS                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Configuration :${NC}"
    echo "  • Club : $CLUB_NAME"
    echo "  • WiFi SSID : NEOPRO-$CLUB_NAME"
    echo "  • WiFi Password : $WIFI_PASSWORD"
    echo "  • Hostname : neopro.local"
    echo ""
    echo -e "${YELLOW}Prochaines étapes :${NC}"
    echo "  1. Connectez-vous au WiFi : NEOPRO-$CLUB_NAME"
    echo "  2. Accédez à l'application : http://neopro.local"
    echo "  3. Mode TV : http://neopro.local/tv"
    echo "  4. Admin : http://neopro.local:8080"
    echo ""
    echo -e "${BLUE}Copier les fichiers depuis votre Mac :${NC}"
    echo "  # Application Angular"
    echo "  scp -r webapp/dist/* pi@neopro.local:~/neopro/webapp/"
    echo ""
    echo "  # Vidéos"
    echo "  scp videos/* pi@neopro.local:~/neopro/videos/"
    echo ""
    echo -e "${GREEN}Installation réussie ! 🎉${NC}"
    echo ""
}

################################################################################
# Fonction principale
################################################################################

main() {
    CLUB_NAME="$1"
    WIFI_PASSWORD="$2"

    print_header
    check_root
    check_parameters

    echo ""
    echo "Installation Neopro pour : $CLUB_NAME"
    echo "WiFi SSID : NEOPRO-$CLUB_NAME"
    echo ""

    download_installation_files
    run_installation
    cleanup
    print_final_summary
}

# Gestion des erreurs
trap 'cleanup; print_error "Installation échouée"' ERR

main "$@"
