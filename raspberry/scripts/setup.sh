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
    GITHUB_API="https://api.github.com/repos/Tallec7/neopro/contents"

    # Créer le répertoire temporaire
    TEMP_DIR="/tmp/neopro-install-$$"
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"

    # Télécharger install.sh
    print_step "Téléchargement de install.sh..."
    curl -sSL "$GITHUB_RAW/raspberry/install.sh" -o install.sh
    chmod +x install.sh

    # Télécharger la structure complète pour install.sh
    print_step "Téléchargement des configurations systemd..."
    mkdir -p config/systemd
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/hostapd.conf" -o config/systemd/hostapd.conf
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/dnsmasq.conf" -o config/systemd/dnsmasq.conf
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro.service" -o config/systemd/neopro.service
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-app.service" -o config/systemd/neopro-app.service
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-admin.service" -o config/systemd/neopro-admin.service
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-kiosk.service" -o config/systemd/neopro-kiosk.service 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-sync-agent.service" -o config/systemd/neopro-sync-agent.service 2>/dev/null || true

    print_step "Téléchargement du serveur Node.js..."
    mkdir -p server
    curl -sSL "$GITHUB_RAW/raspberry/server/package.json" -o server/package.json
    curl -sSL "$GITHUB_RAW/raspberry/server/server.js" -o server/server.js

    print_step "Téléchargement du serveur admin..."
    mkdir -p admin/public
    curl -sSL "$GITHUB_RAW/raspberry/admin/package.json" -o admin/package.json
    curl -sSL "$GITHUB_RAW/raspberry/admin/admin-server.js" -o admin/admin-server.js
    # Télécharger les fichiers public de l'admin
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/index.html" -o admin/public/index.html 2>/dev/null || echo "<!DOCTYPE html><html><body><h1>Admin Neopro</h1></body></html>" > admin/public/index.html

    print_step "Téléchargement du sync-agent..."
    mkdir -p sync-agent/src/tasks sync-agent/src/utils
    curl -sSL "$GITHUB_RAW/raspberry/sync-agent/package.json" -o sync-agent/package.json 2>/dev/null || true
    # Fichiers principaux du sync-agent
    for file in logger.js metrics.js index.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/$file" -o "sync-agent/src/$file" 2>/dev/null || true
    done
    # Tasks du sync-agent
    for file in expiration-checker.js local-backup.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/tasks/$file" -o "sync-agent/src/tasks/$file" 2>/dev/null || true
    done
    # Utils du sync-agent
    curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/utils/config-merge.js" -o sync-agent/src/utils/config-merge.js 2>/dev/null || true

    print_step "Téléchargement des scripts de gestion..."
    mkdir -p scripts
    curl -sSL "$GITHUB_RAW/raspberry/scripts/setup-new-club.sh" -o scripts/setup-new-club.sh
    curl -sSL "$GITHUB_RAW/raspberry/scripts/backup-club.sh" -o scripts/backup-club.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/restore-club.sh" -o scripts/restore-club.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/delete-club.sh" -o scripts/delete-club.sh 2>/dev/null || true
    chmod +x scripts/*.sh 2>/dev/null || true

    print_step "Téléchargement de l'application web (build Angular)..."
    mkdir -p webapp
    # Télécharger le build depuis la dernière release GitHub
    LATEST_RELEASE=$(curl -sL https://api.github.com/repos/Tallec7/neopro/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
    if [ -n "$LATEST_RELEASE" ]; then
        print_step "Téléchargement de la version $LATEST_RELEASE..."
        curl -sSL "https://github.com/Tallec7/neopro/releases/download/$LATEST_RELEASE/neopro-webapp.tar.gz" -o webapp.tar.gz 2>/dev/null && \
        tar -xzf webapp.tar.gz -C webapp && \
        rm webapp.tar.gz && \
        print_success "Application web téléchargée" || \
        print_warning "Impossible de télécharger l'application web - elle devra être copiée manuellement"
    else
        print_warning "Aucune release trouvée - l'application web devra être copiée manuellement"
    fi

    print_success "Fichiers téléchargés dans $TEMP_DIR"
}

################################################################################
# Exécution de l'installation
################################################################################

run_installation() {
    print_step "Lancement de l'installation Neopro..."
    echo ""

    # Exécuter install.sh en mode non-interactif avec les paramètres
    NEOPRO_NON_INTERACTIVE=true ./install.sh "$CLUB_NAME" "$WIFI_PASSWORD"

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
