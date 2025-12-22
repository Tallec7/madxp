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

detect_release_version() {
    if [ -n "$RELEASE_VERSION" ]; then
        return
    fi

    if command -v git >/dev/null 2>&1; then
        local exact_tag
        exact_tag=$(git describe --tags --exact-match 2>/dev/null || true)
        if [ -n "$exact_tag" ]; then
            RELEASE_VERSION="$exact_tag"
            return
        fi

        local latest_tag
        latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
        local short_sha
        short_sha=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)

        if [ -n "$latest_tag" ]; then
            RELEASE_VERSION="${latest_tag}+${short_sha}"
        else
            RELEASE_VERSION="dev-${short_sha}"
        fi
    else
        RELEASE_VERSION="dev-$(date +%Y%m%d)"
    fi
}

create_version_metadata() {
    local build_date
    build_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local metadata_file="${DEPLOY_DIR}/release.json"
    cat <<EOF > "${metadata_file}"
{
  "version": "${RELEASE_VERSION}",
  "commit": "${BUILD_COMMIT}",
  "buildDate": "${build_date}",
  "source": "${BUILD_SOURCE}"
}
EOF

    echo "${RELEASE_VERSION}" > "${DEPLOY_DIR}/VERSION"

    cat <<EOF > "${DEPLOY_DIR}/webapp/version.json"
{
  "version": "${RELEASE_VERSION}",
  "commit": "${BUILD_COMMIT}",
  "buildDate": "${build_date}"
}
EOF

    cat <<EOF > "${DEPLOY_DIR}/webapp/package.json"
{
  "name": "neopro-webapp",
  "version": "${RELEASE_VERSION}"
}
EOF

    print_success "Métadonnées de version générées (${RELEASE_VERSION})"
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

RELEASE_VERSION="${RELEASE_VERSION:-}"
BUILD_SOURCE="${BUILD_SOURCE:-local-build}"
SKIP_XATTR_CLEANUP="${SKIP_XATTR_CLEANUP:-false}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            RELEASE_VERSION="$2"
            shift 2
            ;;
        --skip-xattr)
            SKIP_XATTR_CLEANUP="true"
            shift
            ;;
        *)
            print_warning "Argument inconnu ignoré: $1"
            shift
            ;;
    esac
done

detect_release_version
BUILD_COMMIT="unknown"
if command -v git >/dev/null 2>&1; then
    BUILD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi

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

print_step "Paramètres de build"
echo "  • Version : ${RELEASE_VERSION}"
echo "  • Commit  : ${BUILD_COMMIT}"
echo "  • Source  : ${BUILD_SOURCE}"

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
# Build avec configuration raspberry (utilise environment.raspberry.ts)
# Utiliser npx si ng n'est pas disponible globalement
if command -v ng &> /dev/null; then
    ng build raspberry --configuration=raspberry
else
    npx ng build raspberry --configuration=raspberry
fi
print_success "Build Angular terminé"

print_step "Préparation du package de déploiement..."

# Créer le dossier de déploiement
DEPLOY_DIR="raspberry/deploy"
rm -rf ${DEPLOY_DIR}
mkdir -p ${DEPLOY_DIR}/{webapp,server,sync-agent}

# Copier le build Angular
cp -r dist/raspberry/browser/* ${DEPLOY_DIR}/webapp/

# Modifier l'environnement dans le build pour pointer vers la config raspberry
# (L'application utilisera automatiquement environment.raspberry.ts)

# Copier le serveur Node.js
cp -r server-render/* ${DEPLOY_DIR}/server/

# Copier le sync-agent
if [ -d "raspberry/sync-agent" ]; then
    cp -r raspberry/sync-agent/* ${DEPLOY_DIR}/sync-agent/
    print_success "Sync-agent copié"
fi

# Copier l'admin panel
if [ -d "raspberry/admin" ]; then
    mkdir -p ${DEPLOY_DIR}/admin
    cp -r raspberry/admin/* ${DEPLOY_DIR}/admin/
    print_success "Admin panel copié"
fi

# Copier les scripts nécessaires sur le Pi (utilisés par l'admin et systemd)
RUNTIME_SCRIPTS=(
    "raspberry/scripts/auto-backup.sh"
    "raspberry/scripts/compress-video.sh"
    "raspberry/scripts/generate-thumbnail.sh"
    "raspberry/scripts/setup-wifi-client.sh"
)
mkdir -p ${DEPLOY_DIR}/scripts
for script_path in "${RUNTIME_SCRIPTS[@]}"; do
    if [ -f "${script_path}" ]; then
        cp "${script_path}" ${DEPLOY_DIR}/scripts/
        chmod +x ${DEPLOY_DIR}/scripts/$(basename "${script_path}")
    else
        print_warning "Script manquant pour le déploiement: ${script_path}"
    fi
done
print_success "Scripts runtime copiés"

create_version_metadata

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
# Note: COPYFILE_DISABLE=1 gère déjà les fichiers AppleDouble dans tar
if [ "$SKIP_XATTR_CLEANUP" = "true" ]; then
    print_warning "Suppression des attributs étendus ignorée (SKIP_XATTR_CLEANUP=true)"
elif command -v xattr &> /dev/null; then
    print_step "Suppression des attributs étendus macOS (timeout 30s)..."
    # Utiliser timeout si disponible, sinon skip après 30s
    if command -v gtimeout &> /dev/null; then
        gtimeout 30 xattr -cr ${DEPLOY_DIR} 2>/dev/null || print_warning "xattr ignoré (timeout ou erreur)"
    elif command -v timeout &> /dev/null; then
        timeout 30 xattr -cr ${DEPLOY_DIR} 2>/dev/null || print_warning "xattr ignoré (timeout ou erreur)"
    else
        # Pas de timeout disponible, exécuter en arrière-plan avec kill après 30s
        xattr -cr ${DEPLOY_DIR} 2>/dev/null &
        XATTR_PID=$!
        sleep 1
        if ps -p $XATTR_PID > /dev/null 2>&1; then
            # Toujours en cours après 1s, attendre max 29s de plus
            for i in {1..29}; do
                sleep 1
                if ! ps -p $XATTR_PID > /dev/null 2>&1; then
                    break
                fi
                if [ $i -eq 29 ]; then
                    kill $XATTR_PID 2>/dev/null || true
                    print_warning "xattr interrompu (timeout 30s)"
                fi
            done
        fi
        wait $XATTR_PID 2>/dev/null || true
    fi
    print_success "Attributs étendus traités"
else
    print_warning "xattr non disponible - étape ignorée"
fi

print_step "Compression de l'archive..."
# COPYFILE_DISABLE=1 empêche tar d'inclure les fichiers ._ (AppleDouble)
# Archive le CONTENU de deploy/ (sans le préfixe deploy/) pour extraction directe dans /home/pi/neopro/
# Utiliser pigz (parallel gzip) si disponible pour accélérer la compression

# Nom de l'archive avec version (ex: neopro-raspberry-v1.0.8+abc1234.tar.gz)
# Remplacer les caractères problématiques dans la version pour le nom de fichier
SAFE_VERSION=$(echo "${RELEASE_VERSION}" | tr '/' '-' | tr ':' '-')
ARCHIVE_NAME="neopro-raspberry-${SAFE_VERSION}.tar.gz"
ARCHIVE_LINK="neopro-raspberry-deploy.tar.gz"

cd ${DEPLOY_DIR}
if command -v pigz &> /dev/null; then
    print_step "Utilisation de pigz (compression parallèle)..."
    COPYFILE_DISABLE=1 tar -cf - . | pigz > "../${ARCHIVE_NAME}"
else
    COPYFILE_DISABLE=1 tar -czf "../${ARCHIVE_NAME}" .
fi
cd - > /dev/null

# Créer un lien symbolique pour compatibilité avec les scripts existants
cd raspberry
rm -f "${ARCHIVE_LINK}"
ln -s "${ARCHIVE_NAME}" "${ARCHIVE_LINK}"
cd - > /dev/null

print_success "Archive créée: raspberry/${ARCHIVE_NAME}"

# Afficher les statistiques
ARCHIVE_SIZE=$(du -h "raspberry/${ARCHIVE_NAME}" | cut -f1)

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              BUILD TERMINÉ AVEC SUCCÈS                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}Package de déploiement:${NC}"
echo "  • Dossier: raspberry/deploy/"
echo "  • Archive: raspberry/${ARCHIVE_NAME}"
echo "  • Lien:    raspberry/${ARCHIVE_LINK} -> ${ARCHIVE_NAME}"
echo "  • Taille:  ${ARCHIVE_SIZE}"
echo ""
echo -e "${YELLOW}Déploiement sur Raspberry Pi:${NC}"
echo "  1. Copier l'archive sur le Pi:"
echo "     scp raspberry/neopro-raspberry-deploy.tar.gz pi@neopro.local:~/"
echo ""
echo "  2. Sur le Raspberry Pi:"
echo "     ssh pi@neopro.local"
echo "     cd /home/pi/neopro"
echo "     # Sauvegarder la configuration locale"
echo "     cp webapp/configuration.json /tmp/configuration.json.bak"
echo "     # Extraire la mise à jour (écrase webapp/, server/, etc.)"
echo "     sudo tar -xzf ~/neopro-raspberry-deploy.tar.gz --exclude='videos' --exclude='logs'"
echo "     # Restaurer la configuration locale"
echo "     cp /tmp/configuration.json.bak webapp/configuration.json"
echo "     sudo systemctl restart neopro-app"
echo "     sudo systemctl restart nginx"
echo ""
echo -e "${GREEN}Build terminé!${NC}"
