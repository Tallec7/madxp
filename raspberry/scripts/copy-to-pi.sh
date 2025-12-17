#!/bin/bash

################################################################################
# Script de copie des fichiers d'installation vers le Raspberry Pi
#
# Ce script copie UNIQUEMENT les fichiers nécessaires à l'installation,
# excluant les scripts Mac, outils, et fichiers temporaires.
#
# Usage: ./copy-to-pi.sh [ADRESSE_PI]
# Exemple: ./copy-to-pi.sh raspberrypi.local
#          ./copy-to-pi.sh 192.168.1.50
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PI_ADDRESS="${1:-raspberrypi.local}"
PI_USER="pi"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RASPBERRY_DIR="$(dirname "$SCRIPT_DIR")"

print_step() {
    echo -e "${BLUE}>>> $1${NC}"
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

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         COPIE FICHIERS D'INSTALLATION VERS PI                  ║"
echo "║         Cible: ${PI_ADDRESS}                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "$RASPBERRY_DIR/install.sh" ]; then
    print_error "install.sh non trouvé dans $RASPBERRY_DIR"
    exit 1
fi

# Test de connexion
print_step "Test de connexion vers $PI_ADDRESS..."
if ! ping -c 1 -W 5 "$PI_ADDRESS" >/dev/null 2>&1; then
    print_warning "Ping échoué, tentative SSH directe..."
fi

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$PI_USER@$PI_ADDRESS" "echo 'SSH OK'" 2>/dev/null; then
    print_warning "Connexion SSH sans mot de passe impossible"
    print_step "Vous devrez peut-être entrer le mot de passe SSH"
fi

# Créer le répertoire distant
print_step "Création du répertoire ~/raspberry sur le Pi..."
ssh "$PI_USER@$PI_ADDRESS" "mkdir -p ~/raspberry"

# Liste des fichiers/dossiers À COPIER (nécessaires pour install.sh)
print_step "Copie des fichiers d'installation..."

# Utiliser rsync si disponible (plus efficace), sinon scp
if command -v rsync &> /dev/null; then
    rsync -avz --progress \
        --exclude='scripts/' \
        --exclude='monitoring/' \
        --exclude='deploy/' \
        --exclude='backups/' \
        --exclude='*.tar.gz' \
        --exclude='.DS_Store' \
        --exclude='*.log' \
        --exclude='*.tmp' \
        --exclude='*.bak' \
        --exclude='node_modules/' \
        --exclude='config/templates/*-configuration.json' \
        "$RASPBERRY_DIR/" "$PI_USER@$PI_ADDRESS:~/raspberry/"

    print_success "Fichiers copiés avec rsync"
else
    # Fallback vers scp - créer un tar temporaire sans les exclusions
    print_step "rsync non disponible, utilisation de tar + scp..."

    TEMP_TAR="/tmp/neopro-install-files.tar.gz"

    # Créer l'archive en excluant les fichiers inutiles
    tar -czf "$TEMP_TAR" \
        --exclude='scripts' \
        --exclude='monitoring' \
        --exclude='deploy' \
        --exclude='backups' \
        --exclude='*.tar.gz' \
        --exclude='.DS_Store' \
        --exclude='*.log' \
        --exclude='*.tmp' \
        --exclude='*.bak' \
        --exclude='node_modules' \
        --exclude='config/templates/*-configuration.json' \
        -C "$(dirname "$RASPBERRY_DIR")" \
        "$(basename "$RASPBERRY_DIR")"

    # Copier et extraire
    scp "$TEMP_TAR" "$PI_USER@$PI_ADDRESS:~/neopro-install-files.tar.gz"
    ssh "$PI_USER@$PI_ADDRESS" "
        cd ~
        rm -rf ~/raspberry
        tar -xzf ~/neopro-install-files.tar.gz
        rm ~/neopro-install-files.tar.gz
    "

    rm -f "$TEMP_TAR"
    print_success "Fichiers copiés avec tar + scp"
fi

# Afficher ce qui a été copié
print_step "Vérification des fichiers copiés..."
ssh "$PI_USER@$PI_ADDRESS" "
    echo 'Contenu de ~/raspberry:'
    ls -la ~/raspberry/
    echo ''
    echo 'Taille totale:'
    du -sh ~/raspberry/
"

# Résumé
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗"
echo "║                    COPIE TERMINÉE                              ║"
echo "╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Fichiers copiés dans ~/raspberry sur $PI_ADDRESS"
echo ""
echo -e "${YELLOW}Prochaine étape :${NC}"
echo "  ssh $PI_USER@$PI_ADDRESS"
echo "  cd raspberry"
echo "  sudo ./install.sh NOM_CLUB MotDePasseWiFi"
echo ""
echo -e "${BLUE}Fichiers exclus (non nécessaires sur le Pi) :${NC}"
echo "  - scripts/     (scripts Mac uniquement)"
echo "  - monitoring/  (non utilisé actuellement)"
echo "  - .DS_Store    (fichiers macOS)"
echo ""
echo -e "${BLUE}Fichiers copiés nécessaires :${NC}"
echo "  - tools/       (prepare-golden-image.sh, healthcheck.sh, recovery.sh)"
echo ""
