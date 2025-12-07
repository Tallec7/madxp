#!/bin/bash

################################################################################
# Script de build Neopro pour Raspberry Pi
# Crée un build optimisé de l'application Angular pour déploiement Raspberry
#
# Usage: ./build-raspberry.sh
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

check_prerequisites() {
    local ERRORS=0

    # Vérifier Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js n'est pas installé"
        ERRORS=$((ERRORS + 1))
    fi

    # Vérifier npm
    if ! command -v npm &> /dev/null; then
        print_error "npm n'est pas installé"
        ERRORS=$((ERRORS + 1))
    fi

    # Vérifier Angular CLI
    if ! command -v ng &> /dev/null; then
        print_warning "Angular CLI (ng) non trouvé globalement, utilisation de npx"
    fi

    # Vérifier les répertoires requis
    if [ ! -d "server-render" ]; then
        print_error "Répertoire server-render/ non trouvé"
        ERRORS=$((ERRORS + 1))
    fi

    if [ $ERRORS -gt 0 ]; then
        print_error "$ERRORS erreur(s) de prérequis"
        exit 1
    fi
}

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         BUILD NEOPRO POUR RASPBERRY PI                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier qu'on est dans le bon répertoire (racine du projet)
# Ce script doit être appelé depuis la racine avec: npm run build:raspberry
if [ ! -f "package.json" ]; then
    print_error "package.json non trouvé"
    echo "Ce script doit être exécuté depuis la racine du projet"
    echo "Usage: npm run build:raspberry (ou ./raspberry/scripts/build-raspberry.sh depuis la racine)"
    exit 1
fi

print_step "Vérification des prérequis..."
check_prerequisites
print_success "Prérequis validés"

# Vérifier si node_modules existe et est récent
print_step "Vérification des dépendances..."
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    print_step "Installation des dépendances..."
    npm install
    print_success "Dépendances installées"
else
    print_success "Dépendances à jour"
fi

print_step "Build de l'application Angular pour Raspberry Pi..."
# Build avec configuration production et environment raspberry
# Utiliser npx si ng n'est pas disponible globalement
if command -v ng &> /dev/null; then
    ng build --configuration=production
else
    npx ng build --configuration=production
fi
print_success "Build Angular terminé"

print_step "Préparation du package de déploiement..."

# Créer le dossier de déploiement
DEPLOY_DIR="raspberry/deploy"
rm -rf ${DEPLOY_DIR}
mkdir -p ${DEPLOY_DIR}/{webapp,server,sync-agent}

# Copier le build Angular
cp -r dist/neopro/browser/* ${DEPLOY_DIR}/webapp/

# Modifier l'environnement dans le build pour pointer vers la config raspberry
# (L'application utilisera automatiquement environment.raspberry.ts)

# Copier le serveur Node.js
cp -r server-render/* ${DEPLOY_DIR}/server/

# Copier le sync-agent
if [ -d "raspberry/sync-agent" ]; then
    cp -r raspberry/sync-agent/* ${DEPLOY_DIR}/sync-agent/
    print_success "Sync-agent copié"
fi

# NOTE: Les vidéos ne sont PAS incluses dans le déploiement
# Elles sont gérées par le sync-agent depuis Google Drive
# Cela permet de garder l'archive de déploiement légère

# NOTE: configuration.json n'est PAS inclus dans le déploiement
# Chaque club a sa propre configuration qui ne doit pas être écrasée
# La configuration est gérée via l'interface d'admin ou manuellement

print_success "Package de déploiement créé"

print_step "Création de l'archive de déploiement..."

# Supprimer les attributs étendus macOS (xattr) pour éviter les warnings
# "Ignoring unknown extended header keyword" lors de l'extraction sur Linux
if command -v xattr &> /dev/null; then
    print_step "Suppression des attributs étendus macOS..."
    xattr -cr ${DEPLOY_DIR} 2>/dev/null || true
fi

cd raspberry
# COPYFILE_DISABLE=1 empêche tar d'inclure les fichiers ._ (AppleDouble)
COPYFILE_DISABLE=1 tar -czf neopro-raspberry-deploy.tar.gz deploy/
cd ..
print_success "Archive créée: raspberry/neopro-raspberry-deploy.tar.gz"

# Afficher les statistiques
ARCHIVE_SIZE=$(du -h raspberry/neopro-raspberry-deploy.tar.gz | cut -f1)

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              BUILD TERMINÉ AVEC SUCCÈS                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}Package de déploiement:${NC}"
echo "  • Dossier: raspberry/deploy/"
echo "  • Archive: raspberry/neopro-raspberry-deploy.tar.gz"
echo "  • Taille: ${ARCHIVE_SIZE}"
echo ""
echo -e "${YELLOW}Déploiement sur Raspberry Pi:${NC}"
echo "  1. Copier l'archive sur le Pi:"
echo "     scp raspberry/neopro-raspberry-deploy.tar.gz pi@neopro.local:~/"
echo ""
echo "  2. Sur le Raspberry Pi:"
echo "     ssh pi@neopro.local"
echo "     tar -xzf neopro-raspberry-deploy.tar.gz"
echo "     sudo cp -r deploy/webapp/* /home/pi/neopro/webapp/"
echo "     sudo cp -r deploy/server/* /home/pi/neopro/server/"
echo "     sudo systemctl restart neopro-app"
echo "     sudo systemctl restart nginx"
echo ""
echo -e "${GREEN}Build terminé!${NC}"
