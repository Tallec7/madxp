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
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB PASS [SSID_WIFI_CLIENT] [PASS_WIFI_CLIENT]
#
#   Option 2 - Raw GitHub (aucune configuration) :
#   curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB PASS [SSID_WIFI_CLIENT] [PASS_WIFI_CLIENT]
#
# Exemples:
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123 Livebox-F730 MonPassInternet456
#   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s MASTER MasterPass
#
# Documentation complète : docs/ONLINE_INSTALLATION.md
################################################################################

set -euo pipefail

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
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD [SSID_WIFI_CLIENT] [PASS_WIFI_CLIENT]"
        echo ""
        echo "Exemples:"
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123"
        echo "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s MASTER MasterPass"
        echo ""
        echo "Alternative (URL longue):"
        echo "  curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD [SSID_WIFI_CLIENT] [PASS_WIFI_CLIENT]"
        exit 1
    fi

    # Valider le nom du club (caractères sûrs, longueur max pour SSID WiFi)
    if [[ ! "$CLUB_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        print_error "CLUB_NAME ne doit contenir que des lettres, chiffres, tirets et underscores"
        exit 1
    fi
    # SSID WiFi = "NEOPRO-" (7 chars) + CLUB_NAME → max 32 chars total
    if [ ${#CLUB_NAME} -gt 25 ]; then
        print_error "CLUB_NAME trop long (max 25 caractères pour respecter la limite SSID WiFi de 32 chars)"
        exit 1
    fi

    if [ ${#WIFI_PASSWORD} -lt 8 ]; then
        print_error "Le mot de passe WiFi doit faire au moins 8 caractères"
        exit 1
    fi
    if [ ${#WIFI_PASSWORD} -gt 63 ]; then
        print_error "Le mot de passe WiFi ne doit pas dépasser 63 caractères"
        exit 1
    fi

    # Valider paramètres WiFi client : si SSID fourni, le password est requis
    if [ -n "$CLIENT_WIFI_SSID" ] && [ -z "$CLIENT_WIFI_PASSWORD" ]; then
        print_error "SSID WiFi client fourni sans mot de passe. Usage: ... CLUB PASS SSID_CLIENT PASS_CLIENT"
        exit 1
    fi
}

################################################################################
# Téléchargement des fichiers d'installation
################################################################################

download_installation_files() {
    print_step "Téléchargement des fichiers d'installation depuis GitHub..."

    TEMP_DIR=$(mktemp -d /tmp/neopro-install-XXXXXX)

    # Télécharger l'archive du repository (1 requête HTTP vs ~40 curl individuels)
    # Plus rapide, plus fiable, et auto-inclut les nouveaux fichiers
    print_step "Téléchargement de l'archive repository..."
    local ARCHIVE_DIR
    ARCHIVE_DIR=$(mktemp -d /tmp/neopro-archive-XXXXXX)
    if ! curl -sSLf "https://github.com/Tallec7/neopro/archive/refs/heads/main.tar.gz" \
         | tar -xz -C "$ARCHIVE_DIR"; then
        print_error "Échec du téléchargement de l'archive"
        rm -rf "$ARCHIVE_DIR"
        exit 1
    fi

    local SRC="$ARCHIVE_DIR/neopro-main/raspberry"

    if [ ! -d "$SRC" ]; then
        print_error "Structure du repository invalide (raspberry/ non trouvé)"
        rm -rf "$ARCHIVE_DIR"
        exit 1
    fi

    # Copier l'installeur principal
    cp "$SRC/install.sh" "$TEMP_DIR/"
    chmod +x "$TEMP_DIR/install.sh"

    # Copier les répertoires nécessaires
    print_step "Extraction des fichiers d'installation..."
    for dir in config server admin sync-agent scripts; do
        if [ -d "$SRC/$dir" ]; then
            cp -r "$SRC/$dir" "$TEMP_DIR/$dir"
        fi
    done
    chmod +x "$TEMP_DIR/scripts/"*.sh 2>/dev/null || true

    # Nettoyer l'archive (~taille du repo complet, on libère l'espace)
    rm -rf "$ARCHIVE_DIR"

    # Vérifier les fichiers critiques
    local critical_files=(
        "install.sh"
        "config/systemd/hostapd.conf"
        "config/systemd/dnsmasq.conf"
        "config/systemd/neopro.service"
        "config/systemd/neopro-app.service"
        "config/systemd/neopro-admin.service"
        "server/package.json"
        "server/server.js"
        "admin/package.json"
        "admin/admin-server.js"
    )
    for critical_file in "${critical_files[@]}"; do
        if [ ! -f "$TEMP_DIR/$critical_file" ]; then
            print_error "Fichier critique manquant : $critical_file"
            exit 1
        fi
    done

    cd "$TEMP_DIR"

    # Télécharger l'application web depuis la dernière release GitHub
    # (le build Angular n'est pas dans le repo, il est dans les releases)
    print_step "Téléchargement de l'application web (build Angular)..."
    mkdir -p webapp
    local LATEST_RELEASE
    LATEST_RELEASE=$(curl -sL "https://api.github.com/repos/Tallec7/neopro/releases/latest" \
        | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
    if [ -n "$LATEST_RELEASE" ]; then
        print_step "Téléchargement de la version $LATEST_RELEASE..."
        if curl -sSL "https://github.com/Tallec7/neopro/releases/download/$LATEST_RELEASE/neopro-webapp.tar.gz" \
             -o webapp.tar.gz 2>/dev/null && tar -xzf webapp.tar.gz -C webapp; then
            rm webapp.tar.gz
            print_success "Application web téléchargée"
        else
            rm -f webapp.tar.gz
            print_warning "Impossible de télécharger l'application web - elle devra être copiée manuellement"
        fi
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
    NEOPRO_NON_INTERACTIVE=true ./install.sh "$CLUB_NAME" "$WIFI_PASSWORD" "$CLIENT_WIFI_SSID" "$CLIENT_WIFI_PASSWORD"

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
    if [ -n "$CLIENT_WIFI_SSID" ]; then
        echo "  • WiFi client : $CLIENT_WIFI_SSID (wlan1)"
    fi
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

CLIENT_WIFI_SSID=""
CLIENT_WIFI_PASSWORD=""
TEMP_DIR=""

# Gestion des erreurs (placé avant main pour garantir le nettoyage)
trap 'cleanup; print_error "Installation échouée"' ERR

main() {
    CLUB_NAME="$1"
    WIFI_PASSWORD="$2"
    CLIENT_WIFI_SSID="$3"
    CLIENT_WIFI_PASSWORD="$4"

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

main "$@"
