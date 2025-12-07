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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_ADDRESS="${1:-neopro.local}"

# Build
echo ""
echo ">>> Étape 1/2 : Build de l'application..."
echo ""
"${SCRIPT_DIR}/build-raspberry.sh"

# Deploy
echo ""
echo ">>> Étape 2/2 : Déploiement vers ${PI_ADDRESS}..."
echo ""
"${SCRIPT_DIR}/deploy-remote.sh" "${PI_ADDRESS}"
