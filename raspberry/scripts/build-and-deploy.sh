#!/bin/bash

################################################################################
# Script de build et déploiement Neopro
# Combine build-raspberry.sh et deploy-remote.sh
#
# Usage: ./build-and-deploy.sh [--version vX.Y.Z] [ADRESSE_PI]
# Exemples:
#   ./build-and-deploy.sh              # Déploie vers neopro.local (défaut)
#   ./build-and-deploy.sh neopro.home  # Déploie vers neopro.home
#   ./build-and-deploy.sh 192.168.4.1  # Déploie vers IP spécifique
#   ./build-and-deploy.sh --version v2.4.0 neopro.local  # Force la version de release
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_ADDRESS="neopro.local"
RELEASE_VERSION="${RELEASE_VERSION:-}"
START_TIME=$(date +%s)

print_header() {
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         BUILD & DEPLOY NEOPRO                                  ║"
    echo "║         Cible: ${PI_ADDRESS}                                  ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_usage() {
    cat <<EOF
Usage: $(basename "$0") [--version vX.Y.Z] [ADRESSE_PI]
Par défaut, le déploiement cible neopro.local et la version est déduite depuis git.

Options:
  --version vX.Y.Z   Force la version de release injectée dans le build
  -h, --help         Affiche cette aide

Exemples:
  ./build-and-deploy.sh
  ./build-and-deploy.sh neopro.home
  ./build-and-deploy.sh --version v2.4.0 neopro.local
EOF
}

# Parse arguments
POSITIONAL_ADDRESS=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            if [ -z "${2:-}" ]; then
                print_error "Option --version requiert une valeur"
                exit 1
            fi
            RELEASE_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            if [ -n "$POSITIONAL_ADDRESS" ]; then
                print_warning "Adresse supplémentaire ignorée: $1"
            else
                POSITIONAL_ADDRESS="$1"
            fi
            shift
            ;;
    esac
done

if [ -n "$POSITIONAL_ADDRESS" ]; then
    PI_ADDRESS="$POSITIONAL_ADDRESS"
fi

# Vérification des prérequis
check_prerequisites() {
    if [ ! -f "${SCRIPT_DIR}/build-raspberry.sh" ]; then
        print_error "Script build-raspberry.sh non trouvé"
        exit 1
    fi
    if [ ! -f "${SCRIPT_DIR}/deploy-remote.sh" ]; then
        print_error "Script deploy-remote.sh non trouvé"
        exit 1
    fi
}

print_elapsed_time() {
    local END_TIME=$(date +%s)
    local ELAPSED=$((END_TIME - START_TIME))
    local MINUTES=$((ELAPSED / 60))
    local SECONDS=$((ELAPSED % 60))
    echo ""
    echo -e "${BLUE}⏱  Durée totale: ${MINUTES}m ${SECONDS}s${NC}"
}

# Main
print_header
check_prerequisites

# Build
print_step "Étape 1/2 : Build de l'application..."
BUILD_ENV=("BUILD_SOURCE=build-and-deploy.sh")
if [ -n "$RELEASE_VERSION" ]; then
    BUILD_ENV=("RELEASE_VERSION=${RELEASE_VERSION}" "${BUILD_ENV[@]}")
    echo "  • Version forcée : ${RELEASE_VERSION}"
fi
if ! env "${BUILD_ENV[@]}" "${SCRIPT_DIR}/build-raspberry.sh"; then
    print_error "Échec du build"
    exit 1
fi
print_success "Build terminé"

# Deploy
print_step "Étape 2/2 : Déploiement vers ${PI_ADDRESS}..."
if ! "${SCRIPT_DIR}/deploy-remote.sh" "${PI_ADDRESS}"; then
    print_error "Échec du déploiement"
    exit 1
fi
print_success "Déploiement terminé"

print_elapsed_time
echo ""
echo -e "${GREEN}Build et déploiement terminés avec succès !${NC}"
