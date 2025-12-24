#!/bin/bash
#
# FFmpeg Live Streaming avec Score Overlay
#
# Ce script lit les vidéos depuis un fichier playlist et applique un overlay
# de score en temps réel via le filtre drawtext avec reload=1.
# Le flux est diffusé en HLS pour une compatibilité maximale.
#

set -e

# Configuration
NEOPRO_DIR="${NEOPRO_DIR:-/home/pi/neopro}"
VIDEOS_DIR="${NEOPRO_DIR}/videos"
HLS_DIR="${HLS_DIR:-/var/www/neopro/hls}"
SCORE_DIR="${SCORE_DIR:-/tmp}"
PLAYLIST_FILE="${SCORE_DIR}/neopro-playlist.txt"
FONT_FILE="${FONT_FILE:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}"

# Fichiers de score
SCORE_FILE="${SCORE_DIR}/neopro-score-full.txt"
HOME_TEAM_FILE="${SCORE_DIR}/neopro-home-team.txt"
HOME_SCORE_FILE="${SCORE_DIR}/neopro-home-score.txt"
AWAY_TEAM_FILE="${SCORE_DIR}/neopro-away-team.txt"
AWAY_SCORE_FILE="${SCORE_DIR}/neopro-away-score.txt"

# Configuration HLS
HLS_TIME="${HLS_TIME:-2}"
HLS_LIST_SIZE="${HLS_LIST_SIZE:-5}"

# Configuration qualité (optimisé pour Raspberry Pi)
VIDEO_PRESET="${VIDEO_PRESET:-ultrafast}"
VIDEO_CRF="${VIDEO_CRF:-23}"
VIDEO_MAXRATE="${VIDEO_MAXRATE:-2M}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"

# Couleurs et styles pour l'overlay
FONT_SIZE="${FONT_SIZE:-42}"
FONT_COLOR="${FONT_COLOR:-white}"
SCORE_COLOR="${SCORE_COLOR:-00FF00}"  # Vert pour le score
BOX_COLOR="${BOX_COLOR:-black@0.8}"
BORDER_WIDTH="${BORDER_WIDTH:-2}"

# Position de l'overlay (depuis le bord droit et haut)
OVERLAY_X="${OVERLAY_X:-40}"
OVERLAY_Y="${OVERLAY_Y:-30}"

echo "============================================================"
echo "[FFmpeg Stream] Démarrage du streaming avec score overlay"
echo "============================================================"
echo "[FFmpeg Stream] Videos: ${VIDEOS_DIR}"
echo "[FFmpeg Stream] HLS Output: ${HLS_DIR}"
echo "[FFmpeg Stream] Score Files: ${SCORE_DIR}"
echo "[FFmpeg Stream] Playlist: ${PLAYLIST_FILE}"
echo "============================================================"

# Création des répertoires
mkdir -p "${HLS_DIR}"
mkdir -p "${SCORE_DIR}"

# Vérification de la police
if [ ! -f "${FONT_FILE}" ]; then
    echo "[FFmpeg Stream] Police non trouvée: ${FONT_FILE}"
    echo "[FFmpeg Stream] Recherche d'une police alternative..."

    # Recherche d'alternatives
    for alt_font in \
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" \
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" \
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf" \
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"; do
        if [ -f "$alt_font" ]; then
            FONT_FILE="$alt_font"
            echo "[FFmpeg Stream] Police trouvée: ${FONT_FILE}"
            break
        fi
    done

    if [ ! -f "${FONT_FILE}" ]; then
        echo "[FFmpeg Stream] ERREUR: Aucune police trouvée!"
        echo "[FFmpeg Stream] Installez fonts-dejavu-core: sudo apt install fonts-dejavu-core"
        exit 1
    fi
fi

# Initialisation des fichiers de score s'ils n'existent pas
if [ ! -f "${SCORE_FILE}" ]; then
    echo "DOMICILE 0 - 0 EXTÉRIEUR" > "${SCORE_FILE}"
fi
if [ ! -f "${HOME_TEAM_FILE}" ]; then
    echo "DOMICILE" > "${HOME_TEAM_FILE}"
fi
if [ ! -f "${HOME_SCORE_FILE}" ]; then
    echo "0" > "${HOME_SCORE_FILE}"
fi
if [ ! -f "${AWAY_TEAM_FILE}" ]; then
    echo "EXTÉRIEUR" > "${AWAY_TEAM_FILE}"
fi
if [ ! -f "${AWAY_SCORE_FILE}" ]; then
    echo "0" > "${AWAY_SCORE_FILE}"
fi

# Attendre que le fichier playlist existe
wait_for_playlist() {
    local timeout=60
    local elapsed=0

    while [ ! -f "${PLAYLIST_FILE}" ] || [ ! -s "${PLAYLIST_FILE}" ]; do
        if [ $elapsed -ge $timeout ]; then
            echo "[FFmpeg Stream] ERREUR: Timeout en attente du playlist"
            exit 1
        fi
        echo "[FFmpeg Stream] Attente du fichier playlist... (${elapsed}s)"
        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo "[FFmpeg Stream] Playlist trouvé: ${PLAYLIST_FILE}"
}

wait_for_playlist

# Construction du filtre drawtext pour l'overlay de score
# On utilise plusieurs drawtext pour avoir un contrôle précis sur chaque élément

# Option 1: Score simple centré (une seule ligne)
DRAWTEXT_SIMPLE="drawtext=fontfile='${FONT_FILE}':\
textfile='${SCORE_FILE}':\
reload=1:\
fontsize=${FONT_SIZE}:\
fontcolor=${FONT_COLOR}:\
borderw=${BORDER_WIDTH}:\
bordercolor=black:\
x=w-tw-${OVERLAY_X}:\
y=${OVERLAY_Y}:\
box=1:\
boxcolor=${BOX_COLOR}:\
boxborderw=15"

# Option 2: Score avec éléments séparés (plus de contrôle visuel)
# Position de base depuis le bord droit
BASE_X="w-420"
BASE_Y="${OVERLAY_Y}"

# Fond semi-transparent
DRAWBOX="drawbox=x=${BASE_X}:y=$((OVERLAY_Y - 10)):w=400:h=70:color=black@0.85:t=fill"

# Équipe domicile (gauche du score)
DRAW_HOME_TEAM="drawtext=fontfile='${FONT_FILE}':\
textfile='${HOME_TEAM_FILE}':\
reload=1:\
fontsize=24:\
fontcolor=white:\
x=${BASE_X}+20:\
y=${BASE_Y}+20"

# Score domicile
DRAW_HOME_SCORE="drawtext=fontfile='${FONT_FILE}':\
textfile='${HOME_SCORE_FILE}':\
reload=1:\
fontsize=48:\
fontcolor=0x${SCORE_COLOR}:\
x=${BASE_X}+140:\
y=${BASE_Y}+5"

# Séparateur
DRAW_SEPARATOR="drawtext=fontfile='${FONT_FILE}':\
text='-':\
fontsize=36:\
fontcolor=0x888888:\
x=${BASE_X}+195:\
y=${BASE_Y}+12"

# Score extérieur
DRAW_AWAY_SCORE="drawtext=fontfile='${FONT_FILE}':\
textfile='${AWAY_SCORE_FILE}':\
reload=1:\
fontsize=48:\
fontcolor=0x${SCORE_COLOR}:\
x=${BASE_X}+235:\
y=${BASE_Y}+5"

# Équipe extérieur (droite du score)
DRAW_AWAY_TEAM="drawtext=fontfile='${FONT_FILE}':\
textfile='${AWAY_TEAM_FILE}':\
reload=1:\
fontsize=24:\
fontcolor=white:\
x=${BASE_X}+290:\
y=${BASE_Y}+20"

# Filtre complet avec tous les éléments
FILTER_COMPLEX="${DRAWBOX},${DRAW_HOME_TEAM},${DRAW_HOME_SCORE},${DRAW_SEPARATOR},${DRAW_AWAY_SCORE},${DRAW_AWAY_TEAM}"

# Alternative: utiliser juste le score simple
# FILTER_COMPLEX="${DRAWTEXT_SIMPLE}"

echo "[FFmpeg Stream] Démarrage de FFmpeg..."
echo "[FFmpeg Stream] Filtre: ${FILTER_COMPLEX}"

# Nettoyage des anciens segments HLS
rm -f "${HLS_DIR}"/*.ts "${HLS_DIR}"/*.m3u8 2>/dev/null || true

# Lancement de FFmpeg
# -re : lecture en temps réel
# -stream_loop -1 : boucle infinie sur la playlist
# -f concat : format playlist concat
# -safe 0 : autorise les chemins absolus
exec ffmpeg -hide_banner -loglevel warning -stats \
    -re \
    -f concat -safe 0 -stream_loop -1 -i "${PLAYLIST_FILE}" \
    -vf "${FILTER_COMPLEX}" \
    -c:v libx264 \
    -preset "${VIDEO_PRESET}" \
    -crf "${VIDEO_CRF}" \
    -maxrate "${VIDEO_MAXRATE}" \
    -bufsize "4M" \
    -tune zerolatency \
    -g 30 \
    -keyint_min 30 \
    -sc_threshold 0 \
    -c:a aac \
    -b:a "${AUDIO_BITRATE}" \
    -ac 2 \
    -ar 44100 \
    -f hls \
    -hls_time "${HLS_TIME}" \
    -hls_list_size "${HLS_LIST_SIZE}" \
    -hls_flags delete_segments+append_list+omit_endlist \
    -hls_segment_type mpegts \
    -hls_segment_filename "${HLS_DIR}/segment%03d.ts" \
    "${HLS_DIR}/stream.m3u8"
