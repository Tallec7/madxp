#!/bin/bash

################################################################################
# Script de génération de miniatures pour TOUTES les vidéos existantes
#
# Ce script parcourt le dossier videos/ et génère les miniatures manquantes
# dans thumbnails/ en préservant la structure des dossiers.
#
# Usage: ./generate-all-thumbnails.sh [--force]
#   --force : Régénère même les miniatures existantes
################################################################################

set -e

NEOPRO_DIR="${NEOPRO_DIR:-/home/pi/neopro}"
VIDEOS_DIR="$NEOPRO_DIR/videos"
THUMBNAILS_DIR="$NEOPRO_DIR/thumbnails"
SCRIPT_DIR="$(dirname "$0")"
THUMBNAIL_SCRIPT="$SCRIPT_DIR/generate-thumbnail.sh"
THUMBNAIL_WIDTH=320

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FORCE=false
if [ "$1" = "--force" ]; then
    FORCE=true
    echo -e "${YELLOW}Mode force activé : régénération de toutes les miniatures${NC}"
fi

# Vérifier FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}Erreur: FFmpeg n'est pas installé${NC}"
    echo "Installez-le avec : sudo apt-get install ffmpeg"
    exit 1
fi

# Vérifier que le dossier vidéos existe
if [ ! -d "$VIDEOS_DIR" ]; then
    echo -e "${RED}Erreur: Dossier vidéos non trouvé: $VIDEOS_DIR${NC}"
    exit 1
fi

# Créer le dossier thumbnails
mkdir -p "$THUMBNAILS_DIR"

# Compteurs
TOTAL=0
GENERATED=0
SKIPPED=0
FAILED=0

echo "================================================"
echo "Génération des miniatures pour Neopro"
echo "================================================"
echo "Dossier vidéos    : $VIDEOS_DIR"
echo "Dossier miniatures: $THUMBNAILS_DIR"
echo ""

# Trouver toutes les vidéos
while IFS= read -r -d '' video; do
    TOTAL=$((TOTAL + 1))

    # Calculer le chemin relatif et le chemin de la miniature
    REL_PATH="${video#$VIDEOS_DIR/}"
    THUMB_PATH="$THUMBNAILS_DIR/${REL_PATH%.*}.jpg"

    # Afficher la progression
    echo -n "[$TOTAL] $REL_PATH ... "

    # Vérifier si la miniature existe déjà
    if [ -f "$THUMB_PATH" ] && [ "$FORCE" = false ]; then
        echo -e "${YELLOW}existe déjà (skip)${NC}"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Créer le dossier parent de la miniature
    mkdir -p "$(dirname "$THUMB_PATH")"

    # Générer la miniature
    if bash "$THUMBNAIL_SCRIPT" "$video" "$THUMB_PATH" "$THUMBNAIL_WIDTH" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        GENERATED=$((GENERATED + 1))
    else
        echo -e "${RED}✗ ÉCHEC${NC}"
        FAILED=$((FAILED + 1))
    fi

done < <(find "$VIDEOS_DIR" -type f \( -name "*.mp4" -o -name "*.MP4" -o -name "*.webm" -o -name "*.mov" -o -name "*.MOV" -o -name "*.avi" -o -name "*.mkv" \) -print0)

echo ""
echo "================================================"
echo "Résumé"
echo "================================================"
echo -e "Total vidéos    : $TOTAL"
echo -e "Générées        : ${GREEN}$GENERATED${NC}"
echo -e "Ignorées        : ${YELLOW}$SKIPPED${NC}"
echo -e "Échecs          : ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}Certaines miniatures n'ont pas pu être générées.${NC}"
    echo "Vérifiez que les fichiers vidéo sont valides."
    exit 1
fi

echo -e "${GREEN}Terminé !${NC}"
