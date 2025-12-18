#!/bin/bash

################################################################################
# Script de génération de miniatures pour Neopro
#
# Ce script génère une miniature à partir d'une vidéo en utilisant FFmpeg.
# La miniature est extraite au milieu de la vidéo pour avoir une image
# représentative du contenu.
#
# Usage: ./generate-thumbnail.sh <VIDEO> <OUTPUT> [WIDTH]
# Exemple: ./generate-thumbnail.sh video.mp4 thumbnail.jpg 320
################################################################################

set -e

# Paramètres
VIDEO_FILE="$1"
OUTPUT_FILE="$2"
THUMBNAIL_WIDTH="${3:-320}"

if [ -z "$VIDEO_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
    echo "Usage: $0 <video> <output> [width]"
    exit 1
fi

if [ ! -f "$VIDEO_FILE" ]; then
    echo "Erreur: Fichier vidéo non trouvé: $VIDEO_FILE"
    exit 1
fi

# Vérifier FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Erreur: FFmpeg n'est pas installé"
    exit 1
fi

# Obtenir la durée de la vidéo
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null)

if [ -z "$DURATION" ] || [ "$DURATION" = "N/A" ]; then
    echo "Erreur: Impossible de déterminer la durée de la vidéo"
    exit 1
fi

# Calculer le timestamp au milieu de la vidéo
TIMESTAMP=$(awk "BEGIN {printf \"%.2f\", $DURATION / 2}")

echo "Génération de la miniature au timestamp ${TIMESTAMP}s..."

# Créer le dossier de sortie
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
mkdir -p "$OUTPUT_DIR"

# Extraire la frame
ffmpeg -hide_banner -loglevel error \
    -ss "$TIMESTAMP" \
    -i "$VIDEO_FILE" \
    -vframes 1 \
    -vf "scale=${THUMBNAIL_WIDTH}:-1" \
    -q:v 2 \
    -y \
    "$OUTPUT_FILE"

if [ $? -eq 0 ] && [ -f "$OUTPUT_FILE" ]; then
    THUMBNAIL_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "✓ Miniature créée : $OUTPUT_FILE ($THUMBNAIL_SIZE)"
    exit 0
else
    echo "✗ Échec de la génération de la miniature"
    exit 1
fi
