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

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         BUILD NEOPRO POUR RASPBERRY PI                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: package.json non trouvé"
    echo "Ce script doit être exécuté depuis la racine du projet"
    exit 1
fi

# Retour à la racine du projet
cd ..

print_step "Installation des dépendances..."
npm install
print_success "Dépendances installées"

print_step "Build de l'application Angular pour Raspberry Pi..."
# Build avec configuration production et environment raspberry
ng build --configuration=production
print_success "Build Angular terminé"

print_step "Préparation du package de déploiement..."

# Créer le dossier de déploiement
DEPLOY_DIR="raspberry/deploy"
rm -rf ${DEPLOY_DIR}
mkdir -p ${DEPLOY_DIR}/{webapp,server,videos}

# Copier le build Angular
cp -r dist/neopro/browser/* ${DEPLOY_DIR}/webapp/

# Modifier l'environnement dans le build pour pointer vers la config raspberry
# (L'application utilisera automatiquement environment.raspberry.ts)

# Copier le serveur Node.js
cp -r server-render/* ${DEPLOY_DIR}/server/

# Copier les vidéos d'exemple (optionnel)
if [ -d "public/videos" ]; then
    print_warning "Copie des vidéos (peut être long selon la taille)..."
    cp -r public/videos/* ${DEPLOY_DIR}/videos/
fi

# Copier la configuration
if [ -f "public/configuration.json" ]; then
    cp public/configuration.json ${DEPLOY_DIR}/webapp/
fi

print_success "Package de déploiement créé"

print_step "Création de l'archive de déploiement..."
cd raspberry
tar -czf neopro-raspberry-deploy.tar.gz deploy/
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
echo "     sudo cp -r deploy/videos/* /home/pi/neopro/videos/"
echo "     sudo systemctl restart neopro-app"
echo "     sudo systemctl restart nginx"
echo ""
echo -e "${GREEN}Build terminé!${NC}"
