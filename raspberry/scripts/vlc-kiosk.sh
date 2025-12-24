#!/bin/bash
#
# VLC Kiosk Mode pour Neopro
#
# Lance VLC en mode plein écran pour afficher le stream HLS
# Alternative à Chromium pour un affichage plus léger
#

set -e

# Configuration
HLS_URL="${HLS_URL:-http://localhost/hls/stream.m3u8}"
DISPLAY="${DISPLAY:-:0}"

echo "============================================================"
echo "[VLC Kiosk] Démarrage du lecteur VLC"
echo "============================================================"
echo "[VLC Kiosk] Stream URL: ${HLS_URL}"
echo "[VLC Kiosk] Display: ${DISPLAY}"
echo "============================================================"

# Attendre que le stream soit disponible
wait_for_stream() {
    local timeout=120
    local elapsed=0
    local interval=5

    echo "[VLC Kiosk] Attente du stream HLS..."

    while [ $elapsed -lt $timeout ]; do
        # Vérifier si le fichier m3u8 existe et a du contenu
        if curl -s -f "${HLS_URL}" > /dev/null 2>&1; then
            echo "[VLC Kiosk] Stream disponible!"
            return 0
        fi

        echo "[VLC Kiosk] Stream non disponible, nouvelle tentative dans ${interval}s... (${elapsed}s/${timeout}s)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    echo "[VLC Kiosk] ERREUR: Timeout en attente du stream"
    return 1
}

# Attendre le stream
wait_for_stream || exit 1

# Lancement de VLC
# Options:
#   --fullscreen        : Mode plein écran
#   --no-video-title-show : Pas d'affichage du titre
#   --loop              : Lecture en boucle
#   --no-osd            : Pas d'OSD (On Screen Display)
#   --network-caching   : Cache réseau en ms (réduit pour moins de latence)
#   --live-caching      : Cache pour les streams live

echo "[VLC Kiosk] Lancement de VLC..."

exec cvlc \
    --fullscreen \
    --no-video-title-show \
    --loop \
    --no-osd \
    --network-caching=1000 \
    --live-caching=1000 \
    --no-keyboard-events \
    --no-mouse-events \
    --quiet \
    "${HLS_URL}"
