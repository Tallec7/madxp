#!/bin/bash
#
# Script d'installation du streaming FFmpeg avec score overlay
#
# Ce script installe et configure tous les composants nécessaires
# pour le streaming vidéo avec incrustation du score en temps réel.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEOPRO_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================================"
echo "Installation du streaming FFmpeg Neopro"
echo "============================================================"
echo "Répertoire Neopro: ${NEOPRO_DIR}"
echo "============================================================"

# Vérification des droits root
if [ "$EUID" -ne 0 ]; then
    echo "ERREUR: Ce script doit être exécuté en tant que root (sudo)"
    exit 1
fi

# 1. Installation des dépendances
echo ""
echo "[1/7] Installation des dépendances..."
apt-get update
apt-get install -y ffmpeg vlc fonts-dejavu-core nginx

# 2. Création des répertoires
echo ""
echo "[2/7] Création des répertoires..."
mkdir -p /var/www/neopro/hls
chown -R pi:pi /var/www/neopro

# 3. Installation des services Node.js
echo ""
echo "[3/7] Vérification des dépendances Node.js..."
cd "${NEOPRO_DIR}/services"
if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances npm pour les services..."
    sudo -u pi npm install socket.io-client
fi

# 4. Copie des services systemd
echo ""
echo "[4/7] Installation des services systemd..."
cp "${NEOPRO_DIR}/config/systemd/neopro-score-bridge.service" /etc/systemd/system/
cp "${NEOPRO_DIR}/config/systemd/neopro-playlist-manager.service" /etc/systemd/system/
cp "${NEOPRO_DIR}/config/systemd/neopro-ffmpeg-stream.service" /etc/systemd/system/
cp "${NEOPRO_DIR}/config/systemd/neopro-vlc-kiosk.service" /etc/systemd/system/

# 5. Configuration Nginx
echo ""
echo "[5/7] Configuration de Nginx..."
if [ ! -L /etc/nginx/sites-enabled/neopro-hls.conf ]; then
    ln -sf "${NEOPRO_DIR}/config/nginx/neopro-hls.conf" /etc/nginx/sites-enabled/
fi
nginx -t

# 6. Rechargement des services
echo ""
echo "[6/7] Rechargement des services systemd..."
systemctl daemon-reload
systemctl reload nginx

# 7. Activation des services (mais pas démarrage automatique)
echo ""
echo "[7/7] Activation des services..."
systemctl enable neopro-score-bridge.service
systemctl enable neopro-playlist-manager.service
systemctl enable neopro-ffmpeg-stream.service
# Note: neopro-vlc-kiosk n'est pas activé par défaut
# car il remplace neopro-kiosk (Chromium)

echo ""
echo "============================================================"
echo "Installation terminée!"
echo "============================================================"
echo ""
echo "Pour démarrer le streaming FFmpeg:"
echo "  sudo systemctl start neopro-score-bridge"
echo "  sudo systemctl start neopro-playlist-manager"
echo "  sudo systemctl start neopro-ffmpeg-stream"
echo ""
echo "Pour utiliser VLC au lieu de Chromium:"
echo "  sudo systemctl stop neopro-kiosk"
echo "  sudo systemctl disable neopro-kiosk"
echo "  sudo systemctl enable neopro-vlc-kiosk"
echo "  sudo systemctl start neopro-vlc-kiosk"
echo ""
echo "Pour vérifier le statut:"
echo "  sudo systemctl status neopro-ffmpeg-stream"
echo ""
echo "Le stream HLS est accessible à:"
echo "  http://neopro.local/hls/stream.m3u8"
echo ""
echo "Logs:"
echo "  journalctl -u neopro-score-bridge -f"
echo "  journalctl -u neopro-playlist-manager -f"
echo "  journalctl -u neopro-ffmpeg-stream -f"
echo "============================================================"
