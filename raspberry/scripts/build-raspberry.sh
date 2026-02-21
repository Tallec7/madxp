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
        # Essayer de récupérer le tag exact du commit actuel
        local exact_tag
        exact_tag=$(git describe --tags --exact-match 2>/dev/null || true)
        if [ -n "$exact_tag" ]; then
            RELEASE_VERSION="$exact_tag"
            return
        fi

        # Sinon, utiliser le dernier tag (sans le hash)
        local latest_tag
        latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)

        if [ -n "$latest_tag" ]; then
            # Version propre sans hash (géré par semantic-release)
            RELEASE_VERSION="${latest_tag}"
        else
            # Pas de tag trouvé, version dev avec date
            RELEASE_VERSION="dev-$(date +%Y%m%d)"
        fi
    else
        RELEASE_VERSION="dev-$(date +%Y%m%d)"
    fi
}

sync_subpackage_versions() {
    print_step "Synchronisation des versions des sous-packages..."

    # Liste des package.json à synchroniser avec la version principale
    local SUBPACKAGES=(
        "raspberry/admin/package.json"
        "raspberry/sync-agent/package.json"
        "raspberry/server/package.json"
    )

    for pkg in "${SUBPACKAGES[@]}"; do
        if [ -f "$pkg" ]; then
            # Extraire la version actuelle
            local current_version
            current_version=$(grep -o '"version": *"[^"]*"' "$pkg" | head -1 | cut -d'"' -f4)

            if [ "$current_version" != "$RELEASE_VERSION" ]; then
                # Mettre à jour la version avec sed
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sed -i '' "s/\"version\": *\"[^\"]*\"/\"version\": \"${RELEASE_VERSION}\"/" "$pkg"
                else
                    sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"${RELEASE_VERSION}\"/" "$pkg"
                fi
                print_success "  $pkg: $current_version → $RELEASE_VERSION"
            else
                echo "  $pkg: déjà à jour ($RELEASE_VERSION)"
            fi
        fi
    done
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
    else
        # Vérifier la version Node.js (18+ requis pour Angular 20)
        local NODE_MAJOR
        NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
        if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
            print_error "Node.js v18+ requis (actuel: $(node -v))"
            ERRORS=$((ERRORS + 1))
        fi
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
    if [ ! -d "raspberry/server" ]; then
        print_error "Répertoire raspberry/server/ non trouvé"
        ERRORS=$((ERRORS + 1))
    fi

    if [ $ERRORS -gt 0 ]; then
        print_error "$ERRORS erreur(s) de prérequis"
        exit 1
    fi
}

# Vérification de l'intégrité du build avant archivage
verify_build_integrity() {
    print_step "Vérification de l'intégrité du build..."
    local ERRORS=0
    local WARNINGS=0

    # === FICHIERS CRITIQUES SYNC-AGENT ===
    local SYNC_AGENT_CRITICAL=(
        "sync-agent/src/agent.js"
        "sync-agent/src/config.js"
        "sync-agent/src/logger.js"
        "sync-agent/src/analytics.js"
        "sync-agent/src/metrics.js"
        "sync-agent/src/commands/index.js"
        "sync-agent/src/commands/update-software.js"
        "sync-agent/src/commands/deploy-video.js"
        "sync-agent/src/utils/version-info.js"
        "sync-agent/src/utils/config-merge.js"
        "sync-agent/src/utils/config-validator.js"
        "sync-agent/src/watchers/video-watcher.js"
        "sync-agent/src/watchers/config-watcher.js"
        "sync-agent/src/services/connection-status.js"
        "sync-agent/src/services/network-detector.js"
        "sync-agent/src/services/network-watchdog.js"
        "sync-agent/src/services/safe-network-operations.js"
        "sync-agent/package.json"
    )

    for file in "${SYNC_AGENT_CRITICAL[@]}"; do
        if [ ! -f "${DEPLOY_DIR}/${file}" ]; then
            print_error "MANQUANT: ${file}"
            ERRORS=$((ERRORS + 1))
        fi
    done

    # === VÉRIFIER NODE_MODULES SYNC-AGENT ===
    if [ ! -d "${DEPLOY_DIR}/sync-agent/node_modules" ]; then
        print_error "MANQUANT: sync-agent/node_modules/"
        ERRORS=$((ERRORS + 1))
    else
        # Vérifier les dépendances critiques
        local CRITICAL_DEPS=("socket.io-client" "axios" "fs-extra" "winston")
        for dep in "${CRITICAL_DEPS[@]}"; do
            if [ ! -d "${DEPLOY_DIR}/sync-agent/node_modules/${dep}" ]; then
                print_error "DÉPENDANCE MANQUANTE: sync-agent/node_modules/${dep}"
                ERRORS=$((ERRORS + 1))
            fi
        done
    fi

    # === FICHIERS CRITIQUES ADMIN ===
    if [ -d "${DEPLOY_DIR}/admin" ]; then
        local ADMIN_CRITICAL=(
            "admin/admin-server.js"
            "admin/helpers.js"
            "admin/package.json"
        )
        for file in "${ADMIN_CRITICAL[@]}"; do
            if [ ! -f "${DEPLOY_DIR}/${file}" ]; then
                print_error "MANQUANT: ${file}"
                ERRORS=$((ERRORS + 1))
            fi
        done

        # Vérifier node_modules admin
        if [ ! -d "${DEPLOY_DIR}/admin/node_modules" ]; then
            print_error "MANQUANT: admin/node_modules/"
            ERRORS=$((ERRORS + 1))
        fi
    fi

    # === FICHIERS CRITIQUES WEBAPP ===
    if [ ! -f "${DEPLOY_DIR}/webapp/index.html" ]; then
        print_error "MANQUANT: webapp/index.html"
        ERRORS=$((ERRORS + 1))
    fi

    # === FICHIERS CRITIQUES SERVER ===
    if [ ! -f "${DEPLOY_DIR}/server/server.js" ]; then
        print_error "MANQUANT: server/server.js"
        ERRORS=$((ERRORS + 1))
    fi

    # === VÉRIFIER NODE_MODULES SERVER ===
    if [ ! -d "${DEPLOY_DIR}/server/node_modules" ]; then
        print_error "MANQUANT: server/node_modules/"
        ERRORS=$((ERRORS + 1))
    fi

    # === FICHIERS DE VERSION ===
    if [ ! -f "${DEPLOY_DIR}/VERSION" ]; then
        print_warning "MANQUANT: VERSION (non critique)"
        WARNINGS=$((WARNINGS + 1))
    fi

    # === RÉSUMÉ ===
    if [ $ERRORS -gt 0 ]; then
        print_error "❌ INTÉGRITÉ ÉCHOUÉE: $ERRORS fichier(s) critique(s) manquant(s)"
        print_error "Le build ne sera PAS créé pour éviter un déploiement corrompu"
        exit 1
    fi

    if [ $WARNINGS -gt 0 ]; then
        print_warning "$WARNINGS avertissement(s) non critique(s)"
    fi

    # Compter les fichiers
    local FILE_COUNT=$(find ${DEPLOY_DIR} -type f | wc -l | tr -d ' ')
    local DIR_COUNT=$(find ${DEPLOY_DIR} -type d | wc -l | tr -d ' ')
    local TOTAL_SIZE=$(du -sh ${DEPLOY_DIR} | cut -f1)

    print_success "Intégrité vérifiée: ${FILE_COUNT} fichiers, ${DIR_COUNT} dossiers, ${TOTAL_SIZE}"
}

RELEASE_VERSION="${RELEASE_VERSION:-}"
BUILD_SOURCE="${BUILD_SOURCE:-local-build}"
# xattr cleanup désactivé par défaut (les warnings tar sont inoffensifs sur Linux)
SKIP_XATTR_CLEANUP="${SKIP_XATTR_CLEANUP:-true}"

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

# Synchroniser les versions des sous-packages
sync_subpackage_versions

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
if [ ! -d "dist/raspberry/browser" ] || [ ! -f "dist/raspberry/browser/index.html" ]; then
    print_error "Le build Angular a échoué: dist/raspberry/browser/index.html introuvable"
    exit 1
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

# Copier le serveur Node.js (source de vérité: raspberry/server/)
# Exclure les fichiers .md (documentation) du déploiement
rsync -a --exclude='*.md' --exclude='node_modules' raspberry/server/ ${DEPLOY_DIR}/server/

# Installer les dépendances du serveur pour les inclure dans l'archive
if [ -f "${DEPLOY_DIR}/server/package.json" ]; then
    print_step "Installation des dépendances server..."
    cd ${DEPLOY_DIR}/server
    npm install --production --silent 2>/dev/null || npm install --production
    cd - > /dev/null
    print_success "Server copié (avec node_modules)"
else
    print_success "Server copié"
fi

# Copier le sync-agent
if [ -d "raspberry/sync-agent" ]; then
    rsync -a --exclude='*.md' --exclude='node_modules' raspberry/sync-agent/ ${DEPLOY_DIR}/sync-agent/

    # Installer les dépendances du sync-agent pour les inclure dans l'archive
    # Cela évite de devoir faire npm install sur chaque Pi après déploiement
    print_step "Installation des dépendances sync-agent..."
    cd ${DEPLOY_DIR}/sync-agent
    npm install --production --silent 2>/dev/null || npm install --production
    cd - > /dev/null

    print_success "Sync-agent copié (avec node_modules)"
fi

# Build admin panel (concaténer les modules JS en app.js)
if [ -f "raspberry/admin/public/build-admin.sh" ]; then
    print_step "Build admin panel (modules → app.js)..."
    cd raspberry/admin/public
    bash build-admin.sh
    cd - > /dev/null
    print_success "Admin JS modules concaténés"
fi

# Copier l'admin panel
if [ -d "raspberry/admin" ]; then
    mkdir -p ${DEPLOY_DIR}/admin
    rsync -a --exclude='*.md' --exclude='node_modules' --exclude='__tests__' --exclude='*.bak' raspberry/admin/ ${DEPLOY_DIR}/admin/

    # Installer les dépendances de l'admin panel
    if [ -f "${DEPLOY_DIR}/admin/package.json" ]; then
        print_step "Installation des dépendances admin..."
        cd ${DEPLOY_DIR}/admin
        npm install --production --silent 2>/dev/null || npm install --production
        cd - > /dev/null
        print_success "Admin panel copié (avec node_modules)"
    else
        print_success "Admin panel copié"
    fi
fi

# Copier les scripts nécessaires sur le Pi (utilisés par l'admin et systemd)
RUNTIME_SCRIPTS=(
    "raspberry/scripts/auto-backup.sh"
    "raspberry/scripts/compress-video.sh"
    "raspberry/scripts/generate-thumbnail.sh"
    "raspberry/scripts/generate-all-thumbnails.sh"
    "raspberry/scripts/setup-wifi-client.sh"
    "raspberry/scripts/kiosk-watchdog.sh"
    "raspberry/scripts/hotspot-watchdog.sh"
    "raspberry/scripts/hotspot-optimizer.sh"
    "raspberry/scripts/fix-hotspot.sh"
    "raspberry/scripts/sync-agent-guardian.sh"
    "raspberry/scripts/fix-fleet-pi.sh"
    "raspberry/scripts/diagnose-pi.sh"
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

# Copier les fichiers de configuration systemd
print_step "Copie des fichiers systemd..."
mkdir -p ${DEPLOY_DIR}/config/systemd
SYSTEMD_FILES=(
    "raspberry/config/systemd/neopro-kiosk.service"
    "raspberry/config/systemd/neopro-hotspot-watchdog.service"
    "raspberry/config/systemd/neopro-hotspot-optimizer.service"
    "raspberry/config/systemd/neopro-sync-guardian.service"
    "raspberry/config/systemd/neopro-app.service"
    "raspberry/config/systemd/neopro-sync-agent.service"
    "raspberry/config/systemd/neopro-admin.service"
)
for svc_path in "${SYSTEMD_FILES[@]}"; do
    if [ -f "${svc_path}" ]; then
        cp "${svc_path}" ${DEPLOY_DIR}/config/systemd/
    else
        print_warning "Service systemd manquant: ${svc_path}"
    fi
done
print_success "Fichiers systemd copiés"

# Copier le fichier sudoers (permissions sudo ciblées pour le sync-agent)
if [ -f "raspberry/config/sudoers.d/neopro" ]; then
    mkdir -p ${DEPLOY_DIR}/config/sudoers.d
    cp raspberry/config/sudoers.d/neopro ${DEPLOY_DIR}/config/sudoers.d/
    print_success "Fichier sudoers copié"
fi

create_version_metadata

# Vérifier l'intégrité avant de créer l'archive
verify_build_integrity

# NOTE: Les vidéos ne sont PAS incluses dans le déploiement
# Elles sont gérées par le sync-agent depuis Google Drive
# Cela permet de garder l'archive de déploiement légère

# NOTE: configuration.json n'est PAS inclus dans le déploiement
# Chaque club a sa propre configuration qui ne doit pas être écrasée
# La configuration est gérée via l'interface d'admin ou manuellement

print_success "Package de déploiement créé"

print_step "Création de l'archive de déploiement..."

# Note: Les warnings "Ignoring unknown extended header keyword" lors de l'extraction
# sur Linux sont inoffensifs. On skip xattr par défaut pour gagner du temps.
# Utiliser SKIP_XATTR_CLEANUP=false pour forcer le nettoyage si nécessaire.
if [ "$SKIP_XATTR_CLEANUP" != "true" ] && command -v xattr &> /dev/null; then
    print_step "Suppression des attributs étendus macOS (timeout 5s)..."
    if command -v gtimeout &> /dev/null; then
        gtimeout 5 xattr -cr ${DEPLOY_DIR} 2>/dev/null || print_warning "xattr ignoré (timeout)"
    elif command -v timeout &> /dev/null; then
        timeout 5 xattr -cr ${DEPLOY_DIR} 2>/dev/null || print_warning "xattr ignoré (timeout)"
    else
        # Fallback rapide sans timeout
        xattr -cr ${DEPLOY_DIR} 2>/dev/null || true
    fi
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

# Supprimer configuration.json du deploy (chaque club a sa propre config)
rm -f ${DEPLOY_DIR}/webapp/configuration.json

cd ${DEPLOY_DIR}
if command -v pigz &> /dev/null; then
    COPYFILE_DISABLE=1 tar -cf - . | pigz > "../${ARCHIVE_NAME}"
else
    print_warning "pigz non installé - compression lente (installer avec: brew install pigz)"
    COPYFILE_DISABLE=1 tar -czf "../${ARCHIVE_NAME}" .
fi
cd - > /dev/null

# Créer un lien symbolique pour compatibilité avec les scripts existants
cd raspberry
rm -f "${ARCHIVE_LINK}"
ln -s "${ARCHIVE_NAME}" "${ARCHIVE_LINK}"
cd - > /dev/null

print_success "Archive créée: raspberry/${ARCHIVE_NAME}"

# Créer aussi l'archive au format legacy (deploy/webapp, deploy/server)
# pour compatibilité avec les anciens admin-server sur les Pi
print_step "Création de l'archive legacy (compatibilité anciens Pi)..."
LEGACY_ARCHIVE_NAME="neopro-raspberry-${SAFE_VERSION}-legacy.tar.gz"
LEGACY_DIR="raspberry/deploy-legacy"

rm -rf ${LEGACY_DIR}
mkdir -p ${LEGACY_DIR}/deploy

# Copier tout dans le sous-dossier deploy/
cp -r ${DEPLOY_DIR}/webapp ${LEGACY_DIR}/deploy/
cp -r ${DEPLOY_DIR}/server ${LEGACY_DIR}/deploy/
[ -d ${DEPLOY_DIR}/sync-agent ] && cp -r ${DEPLOY_DIR}/sync-agent ${LEGACY_DIR}/deploy/
[ -d ${DEPLOY_DIR}/admin ] && cp -r ${DEPLOY_DIR}/admin ${LEGACY_DIR}/deploy/
[ -d ${DEPLOY_DIR}/scripts ] && cp -r ${DEPLOY_DIR}/scripts ${LEGACY_DIR}/deploy/
[ -d ${DEPLOY_DIR}/config ] && cp -r ${DEPLOY_DIR}/config ${LEGACY_DIR}/deploy/

# Copier VERSION et release.json à la racine
cp ${DEPLOY_DIR}/VERSION ${LEGACY_DIR}/
cp ${DEPLOY_DIR}/release.json ${LEGACY_DIR}/

cd ${LEGACY_DIR}
if command -v pigz &> /dev/null; then
    COPYFILE_DISABLE=1 tar -cf - . | pigz > "../${LEGACY_ARCHIVE_NAME}"
else
    COPYFILE_DISABLE=1 tar -czf "../${LEGACY_ARCHIVE_NAME}" .
fi
cd - > /dev/null

# Nettoyer le dossier temporaire
rm -rf ${LEGACY_DIR}

print_success "Archive legacy créée: raspberry/${LEGACY_ARCHIVE_NAME}"

# Afficher les statistiques
ARCHIVE_SIZE=$(du -h "raspberry/${ARCHIVE_NAME}" | cut -f1)
LEGACY_ARCHIVE_SIZE=$(du -h "raspberry/${LEGACY_ARCHIVE_NAME}" | cut -f1)

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              BUILD TERMINÉ AVEC SUCCÈS                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}Packages de déploiement:${NC}"
echo "  • Dossier:        raspberry/deploy/"
echo "  • Archive:        raspberry/${ARCHIVE_NAME} (${ARCHIVE_SIZE})"
echo "  • Archive legacy: raspberry/${LEGACY_ARCHIVE_NAME} (${LEGACY_ARCHIVE_SIZE})"
echo "  • Lien:           raspberry/${ARCHIVE_LINK} -> ${ARCHIVE_NAME}"
echo ""
echo -e "${YELLOW}Quelle archive utiliser ?${NC}"
echo "  • ${ARCHIVE_NAME}        → Pour Pi avec admin-server récent (>= v2.7)"
echo "  • ${LEGACY_ARCHIVE_NAME} → Pour Pi avec ancien admin-server (< v2.7)"
echo ""
echo -e "${YELLOW}Déploiement sur Raspberry Pi:${NC}"
echo "  Via l'interface admin (port 8080) :"
echo "     Ouvrir http://neopro.local:8080 → Section 'Mise à jour' → Upload l'archive"
echo ""
echo "  Ou manuellement :"
echo "     scp raspberry/${ARCHIVE_NAME} pi@neopro.local:~/"
echo "     ssh pi@neopro.local 'cd /home/pi/neopro && \\"
echo "       cp webapp/configuration.json /tmp/config.bak && \\"
echo "       sudo rm -rf webapp/* && sudo tar -xzf ~/${ARCHIVE_NAME} && \\"
echo "       sudo cp /tmp/config.bak webapp/configuration.json && \\"
echo "       sudo systemctl restart neopro-app nginx'"
echo ""
echo -e "${BLUE}Contenu de l'archive:${NC}"
echo "  ├── webapp/          Angular app (TV/Remote/Login)"
echo "  ├── server/          Socket.IO serveur local"
echo "  │   └── node_modules/ ✓ Dépendances incluses"
echo "  ├── sync-agent/      Agent de synchronisation cloud"
echo "  │   └── node_modules/ ✓ Dépendances incluses"
echo "  ├── admin/           Interface admin locale (port 8080)"
echo "  │   └── node_modules/ ✓ Dépendances incluses"
echo "  ├── scripts/         Scripts runtime (watchdog, backup, etc.)"
echo "  ├── config/systemd/  Services systemd (hotspot-watchdog, etc.)"
echo "  ├── VERSION          Numéro de version"
echo "  └── release.json     Métadonnées du build"
echo ""
echo -e "${GREEN}Build terminé!${NC}"
