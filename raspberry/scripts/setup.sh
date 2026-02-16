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

set -eo pipefail

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

    # URL de base du repository
    GITHUB_RAW="https://raw.githubusercontent.com/Tallec7/neopro/main"
    GITHUB_API="https://api.github.com/repos/Tallec7/neopro/contents"

    # Créer le répertoire temporaire (mktemp pour éviter les collisions)
    TEMP_DIR=$(mktemp -d /tmp/neopro-install-XXXXXX)
    cd "$TEMP_DIR"

    # Télécharger install.sh (CRITIQUE)
    print_step "Téléchargement de install.sh..."
    curl -sSLf "$GITHUB_RAW/raspberry/install.sh" -o install.sh || { print_error "Échec du téléchargement de install.sh"; exit 1; }
    chmod +x install.sh

    # Télécharger la structure complète pour install.sh
    print_step "Téléchargement des configurations systemd..."
    mkdir -p config/systemd
    # Fichiers critiques (l'installation échoue sans eux)
    curl -sSLf "$GITHUB_RAW/raspberry/config/systemd/hostapd.conf" -o config/systemd/hostapd.conf || { print_error "Échec: hostapd.conf"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/config/systemd/dnsmasq.conf" -o config/systemd/dnsmasq.conf || { print_error "Échec: dnsmasq.conf"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/config/systemd/neopro.service" -o config/systemd/neopro.service || { print_error "Échec: neopro.service"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/config/systemd/neopro-app.service" -o config/systemd/neopro-app.service || { print_error "Échec: neopro-app.service"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/config/systemd/neopro-admin.service" -o config/systemd/neopro-admin.service || { print_error "Échec: neopro-admin.service"; exit 1; }
    # Fichiers optionnels (ajoutés dans des versions ultérieures)
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-kiosk.service" -o config/systemd/neopro-kiosk.service 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-sync-agent.service" -o config/systemd/neopro-sync-agent.service 2>/dev/null || true
    # Services ajoutés v2.28+ (watchdogs réseau)
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-hotspot-watchdog.service" -o config/systemd/neopro-hotspot-watchdog.service 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-hotspot-optimizer.service" -o config/systemd/neopro-hotspot-optimizer.service 2>/dev/null || true
    # Service ajouté v2.40+ (guardian sync-agent)
    curl -sSL "$GITHUB_RAW/raspberry/config/systemd/neopro-sync-guardian.service" -o config/systemd/neopro-sync-guardian.service 2>/dev/null || true

    print_step "Téléchargement du serveur Node.js..."
    mkdir -p server
    curl -sSLf "$GITHUB_RAW/raspberry/server/package.json" -o server/package.json || { print_error "Échec: server/package.json"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/server/server.js" -o server/server.js || { print_error "Échec: server/server.js"; exit 1; }

    print_step "Téléchargement du serveur admin..."
    mkdir -p admin/public/fonts
    curl -sSLf "$GITHUB_RAW/raspberry/admin/package.json" -o admin/package.json || { print_error "Échec: admin/package.json"; exit 1; }
    curl -sSLf "$GITHUB_RAW/raspberry/admin/admin-server.js" -o admin/admin-server.js || { print_error "Échec: admin/admin-server.js"; exit 1; }
    curl -sSL "$GITHUB_RAW/raspberry/admin/helpers.js" -o admin/helpers.js 2>/dev/null || true

    # Télécharger les fichiers public de l'admin (interface complète)
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/index.html" -o admin/public/index.html 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/app.js" -o admin/public/app.js 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/styles.css" -o admin/public/styles.css 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/manifest.webmanifest" -o admin/public/manifest.webmanifest 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/neopro-logo.png" -o admin/public/neopro-logo.png 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/neopro-logo-white.png" -o admin/public/neopro-logo-white.png 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/admin/public/favicon.ico" -o admin/public/favicon.ico 2>/dev/null || true

    print_step "Téléchargement du sync-agent..."
    mkdir -p sync-agent/src/tasks sync-agent/src/utils sync-agent/src/commands sync-agent/src/watchers sync-agent/src/services
    curl -sSL "$GITHUB_RAW/raspberry/sync-agent/package.json" -o sync-agent/package.json 2>/dev/null || true

    # Fichiers principaux du sync-agent (TOUS les fichiers nécessaires)
    for file in agent.js analytics.js config.js logger.js metrics.js sponsor-impressions.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/$file" -o "sync-agent/src/$file" 2>/dev/null || true
    done

    # Commands du sync-agent (CRITIQUES pour update_config, deploy_video, etc.)
    # Fichiers principaux
    for file in index.js deploy-video.js update-software.js remote-shell.js delete-video.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/commands/$file" -o "sync-agent/src/commands/$file" 2>/dev/null || true
    done
    # Modules extraits v2.33+ (refactoring commands/index.js)
    for file in update-config.js diagnostics.js hotspot.js network-diagnostics.js debug-bundle.js analytics-buffer.js deploy-asset.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/commands/$file" -o "sync-agent/src/commands/$file" 2>/dev/null || true
    done

    # Watchers du sync-agent (surveillance vidéos et config)
    for file in video-watcher.js config-watcher.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/watchers/$file" -o "sync-agent/src/watchers/$file" 2>/dev/null || true
    done

    # Services du sync-agent (connexion, queue offline, historique, réseau)
    for file in connection-status.js offline-queue.js sync-history.js network-detector.js network-watchdog.js safe-network-operations.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/services/$file" -o "sync-agent/src/services/$file" 2>/dev/null || true
    done

    # Tasks du sync-agent
    for file in expiration-checker.js local-backup.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/tasks/$file" -o "sync-agent/src/tasks/$file" 2>/dev/null || true
    done

    # Utils du sync-agent (TOUS les fichiers)
    for file in config-merge.js config-validator.js version-info.js; do
        curl -sSL "$GITHUB_RAW/raspberry/sync-agent/src/utils/$file" -o "sync-agent/src/utils/$file" 2>/dev/null || true
    done

    print_step "Téléchargement des scripts de gestion..."
    mkdir -p scripts
    # Scripts essentiels
    curl -sSL "$GITHUB_RAW/raspberry/scripts/setup-new-club.sh" -o scripts/setup-new-club.sh
    curl -sSL "$GITHUB_RAW/raspberry/scripts/setup-wifi-client.sh" -o scripts/setup-wifi-client.sh
    curl -sSL "$GITHUB_RAW/raspberry/scripts/backup-club.sh" -o scripts/backup-club.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/restore-club.sh" -o scripts/restore-club.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/delete-club.sh" -o scripts/delete-club.sh 2>/dev/null || true

    # Scripts de diagnostic et maintenance (ajoutés v2.24+)
    curl -sSL "$GITHUB_RAW/raspberry/scripts/diagnose-pi.sh" -o scripts/diagnose-pi.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/fix-hotspot.sh" -o scripts/fix-hotspot.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/kiosk-watchdog.sh" -o scripts/kiosk-watchdog.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/generate-thumbnail.sh" -o scripts/generate-thumbnail.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/generate-all-thumbnails.sh" -o scripts/generate-all-thumbnails.sh 2>/dev/null || true
    # Scripts watchdogs réseau (ajoutés v2.28+)
    curl -sSL "$GITHUB_RAW/raspberry/scripts/hotspot-watchdog.sh" -o scripts/hotspot-watchdog.sh 2>/dev/null || true
    curl -sSL "$GITHUB_RAW/raspberry/scripts/hotspot-optimizer.sh" -o scripts/hotspot-optimizer.sh 2>/dev/null || true
    # Script guardian sync-agent (ajouté v2.40+)
    curl -sSL "$GITHUB_RAW/raspberry/scripts/sync-agent-guardian.sh" -o scripts/sync-agent-guardian.sh 2>/dev/null || true

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
