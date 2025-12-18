#!/bin/bash

################################################################################
# Script de compression vidéo pour Neopro
#
# Ce script compresse une vidéo en utilisant FFmpeg avec les paramètres optimaux
# pour le streaming sur Raspberry Pi.
#
# Optimisations:
# - Codec H.264 (meilleur support navigateurs)
# - Résolution max 1080p
# - Bitrate adaptatif selon la résolution
# - Suppression métadonnées inutiles
# - Audio AAC 128kbps
#
# Usage: ./compress-video.sh <INPUT> <OUTPUT> [QUALITY]
# Quality: low|medium|high (défaut: medium)
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $1"
}

# Vérifier les paramètres
INPUT_FILE="$1"
OUTPUT_FILE="$2"
QUALITY="${3:-medium}"

if [ -z "$INPUT_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
    log_error "Usage: $0 <input> <output> [quality]"
    exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
    log_error "Fichier d'entrée non trouvé: $INPUT_FILE"
    exit 1
fi

# Vérifier que FFmpeg est installé
if ! command -v ffmpeg &> /dev/null; then
    log_error "FFmpeg n'est pas installé"
    log "Installation: sudo apt-get install ffmpeg"
    exit 1
fi

log "Compression de : $INPUT_FILE"
log "Destination : $OUTPUT_FILE"
log "Qualité : $QUALITY"

# Obtenir les informations de la vidéo source
INPUT_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
log "Taille source : $INPUT_SIZE"

# Détecter la résolution source
RESOLUTION=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$INPUT_FILE" 2>/dev/null || echo "unknown")
log "Résolution source : $RESOLUTION"

# Configuration selon la qualité
case $QUALITY in
    low)
        VIDEO_BITRATE="1M"
        MAX_WIDTH="854"
        MAX_HEIGHT="480"
        CRF="28"
        PRESET="fast"
        ;;
    high)
        VIDEO_BITRATE="4M"
        MAX_WIDTH="1920"
        MAX_HEIGHT="1080"
        CRF="20"
        PRESET="slow"
        ;;
    medium|*)
        VIDEO_BITRATE="2M"
        MAX_WIDTH="1280"
        MAX_HEIGHT="720"
        CRF="23"
        PRESET="medium"
        ;;
esac

log "Configuration : ${MAX_WIDTH}x${MAX_HEIGHT}, CRF=$CRF, Preset=$PRESET"

# Créer le dossier de sortie si nécessaire
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
mkdir -p "$OUTPUT_DIR"

# Fichier temporaire
TEMP_OUTPUT="${OUTPUT_FILE}.tmp.mp4"

# Commande FFmpeg optimisée
log "Début de la compression..."

ffmpeg -hide_banner -loglevel warning -stats \
    -i "$INPUT_FILE" \
    -c:v libx264 \
    -preset "$PRESET" \
    -crf "$CRF" \
    -maxrate "$VIDEO_BITRATE" \
    -bufsize "$(echo "$VIDEO_BITRATE" | sed 's/M/*2M/;s/k/*2k/')" \
    -vf "scale='min($MAX_WIDTH,iw)':'min($MAX_HEIGHT,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
    -c:a aac \
    -b:a 128k \
    -ac 2 \
    -ar 44100 \
    -movflags +faststart \
    -map_metadata -1 \
    -y \
    "$TEMP_OUTPUT"

FFMPEG_EXIT=$?

if [ $FFMPEG_EXIT -eq 0 ]; then
    # Déplacer le fichier temporaire
    mv "$TEMP_OUTPUT" "$OUTPUT_FILE"

    # Statistiques
    OUTPUT_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    log_success "Compression terminée"
    log "Taille finale : $OUTPUT_SIZE"

    # Calculer le taux de compression
    INPUT_BYTES=$(stat -f%z "$INPUT_FILE" 2>/dev/null || stat -c%s "$INPUT_FILE")
    OUTPUT_BYTES=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE")
    COMPRESSION_RATIO=$(awk "BEGIN {printf \"%.1f\", ($INPUT_BYTES - $OUTPUT_BYTES) / $INPUT_BYTES * 100}")

    log "Économie d'espace : ${COMPRESSION_RATIO}%"

    exit 0
else
    log_error "Échec de la compression (code: $FFMPEG_EXIT)"
    rm -f "$TEMP_OUTPUT"
    exit 1
fi
