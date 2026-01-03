#!/bin/bash

################################################################################
# Script de vérification de version Neopro
# Affiche toutes les informations de version du projet
#
# Usage: ./scripts/check-version.sh
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         NEOPRO VERSION CHECKER                            ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Version dans package.json
echo -e "${GREEN}📦 package.json:${NC}"
if [ -f "package.json" ]; then
    PACKAGE_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    echo "   $PACKAGE_VERSION"
else
    echo -e "   ${RED}✗ package.json non trouvé${NC}"
fi
echo ""

# Dernier tag Git
echo -e "${GREEN}🏷️  Dernier tag Git:${NC}"
if command -v git >/dev/null 2>&1; then
    LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "Aucun tag")
    echo "   $LATEST_TAG"

    # Tag exact sur le commit actuel ?
    EXACT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
    if [ -n "$EXACT_TAG" ]; then
        echo -e "   ${GREEN}✓ Commit actuel est taggé: $EXACT_TAG${NC}"
    else
        CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        echo -e "   ${YELLOW}⚠ Commit actuel ($CURRENT_COMMIT) n'a pas de tag${NC}"
    fi
else
    echo -e "   ${RED}✗ Git non disponible${NC}"
fi
echo ""

# Commits depuis le dernier tag
echo -e "${GREEN}📝 Commits depuis le dernier tag:${NC}"
if command -v git >/dev/null 2>&1 && [ -n "$LATEST_TAG" ] && [ "$LATEST_TAG" != "Aucun tag" ]; then
    COMMIT_COUNT=$(git rev-list ${LATEST_TAG}..HEAD --count 2>/dev/null || echo "0")
    echo "   $COMMIT_COUNT commit(s)"

    if [ "$COMMIT_COUNT" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}   Derniers commits:${NC}"
        git log ${LATEST_TAG}..HEAD --oneline --pretty=format:"   %C(yellow)%h%Creset %s" | head -5
        echo ""
    fi
fi
echo ""

# Tous les tags
echo -e "${GREEN}🗂️  Tous les tags (10 derniers):${NC}"
if command -v git >/dev/null 2>&1; then
    git tag --sort=-v:refname | head -10 | sed 's/^/   /'
else
    echo -e "   ${RED}✗ Git non disponible${NC}"
fi
echo ""

# Version qui serait buildée
echo -e "${GREEN}🔨 Version du prochain build:${NC}"
if command -v git >/dev/null 2>&1; then
    # Simuler la logique de detect_release_version
    EXACT_TAG=$(git describe --tags --exact-match 2>/dev/null || true)
    if [ -n "$EXACT_TAG" ]; then
        BUILD_VERSION="$EXACT_TAG"
    else
        LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
        if [ -n "$LATEST_TAG" ]; then
            BUILD_VERSION="${LATEST_TAG}"
        else
            BUILD_VERSION="dev-$(date +%Y%m%d)"
        fi
    fi
    echo "   $BUILD_VERSION"
    echo -e "   ${BLUE}(neopro-raspberry-${BUILD_VERSION}.tar.gz)${NC}"
else
    echo "   dev-$(date +%Y%m%d)"
fi
echo ""

# Vérifier synchronisation
echo -e "${GREEN}🔍 Synchronisation:${NC}"
SYNC_OK=true

if [ "$PACKAGE_VERSION" != "$LATEST_TAG" ] && [ "$LATEST_TAG" != "Aucun tag" ]; then
    # Retirer le 'v' du tag pour comparaison
    LATEST_TAG_NO_V="${LATEST_TAG#v}"
    if [ "$PACKAGE_VERSION" != "$LATEST_TAG_NO_V" ]; then
        echo -e "   ${YELLOW}⚠ package.json ($PACKAGE_VERSION) != dernier tag ($LATEST_TAG)${NC}"
        echo -e "   ${YELLOW}  → Ceci est normal si semantic-release n'a pas encore tourné${NC}"
        SYNC_OK=false
    fi
fi

if [ "$SYNC_OK" = true ]; then
    echo -e "   ${GREEN}✓ Versions synchronisées${NC}"
fi
echo ""

# semantic-release installé ?
echo -e "${GREEN}🤖 semantic-release:${NC}"
if [ -f "node_modules/.bin/semantic-release" ]; then
    echo -e "   ${GREEN}✓ Installé${NC}"
    SR_VERSION=$(./node_modules/.bin/semantic-release --version 2>/dev/null || echo "version inconnue")
    echo "   $SR_VERSION"
else
    echo -e "   ${RED}✗ Non installé${NC}"
    echo "   Installer avec: npm install --save-dev semantic-release"
fi
echo ""

# Prochaine action recommandée
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         ACTIONS RECOMMANDÉES                              ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$COMMIT_COUNT" -gt 0 ]; then
    echo "1. Commits en attente de release détectés"
    echo "2. Merger sur main pour déclencher semantic-release"
    echo "3. La version sera incrémentée automatiquement"
elif [ "$EXACT_TAG" = "" ] && [ "$LATEST_TAG" != "Aucun tag" ]; then
    echo "1. Commit actuel non taggé"
    echo "2. Faire un commit conventionnel (feat:/fix:) si nécessaire"
    echo "3. Push sur main pour déclencher semantic-release"
else
    echo -e "${GREEN}✓ Tout est à jour !${NC}"
fi
echo ""
