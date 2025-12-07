#!/bin/bash

################################################################################
# Script de build et déploiement Neopro
# Combine build-raspberry.sh et deploy-remote.sh
#
# Usage: ./build-and-deploy.sh [ADRESSE_PI]
# Exemples:
#   ./build-and-deploy.sh              # Déploie vers neopro.local (défaut)
#   ./build-and-deploy.sh neopro.home  # Déploie vers neopro.home
#   ./build-and-deploy.sh 192.168.4.1  # Déploie vers IP spécifique
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_ADDRESS="${1:-neopro.local}"
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
if ! "${SCRIPT_DIR}/build-raspberry.sh"; then
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
