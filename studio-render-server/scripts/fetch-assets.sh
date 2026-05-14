#!/usr/bin/env bash
#
# fetch-assets.sh — mirror les assets binaires (vidéos, masks, fonts) depuis
# FTP Hostinger vers `./public/` au boot du container.
#
# Pourquoi pas dans l'image Docker ? cf ADR-118 : 5+ GB d'assets ferait
# gonfler l'image, déploiement Railway 10+ min, et invalidation du cache
# Docker à chaque modif d'asset. Le boot fetch ajoute ~30s mais reste OK
# car le service reste up entre les renders.
#
# Variables d'env requises :
#   FTP_HOST, FTP_USER, FTP_PASS
#
# Variables optionnelles :
#   FTP_ASSETS_PATH       (défaut /neopro-video/studio-render-server-assets)
#   ASSETS_FETCH_TIMEOUT  (défaut 300s — 5 min max pour mirror complet)
#   SKIP_ASSETS_FETCH     (défaut "" — set à "1" pour booter sans fetch,
#                          utile pour debug / tests sans FTP)

set -euo pipefail

FTP_ASSETS_PATH="${FTP_ASSETS_PATH:-/neopro-video/studio-render-server-assets}"
ASSETS_FETCH_TIMEOUT="${ASSETS_FETCH_TIMEOUT:-300}"
TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public"

if [ "${SKIP_ASSETS_FETCH:-}" = "1" ]; then
  echo "[fetch-assets] SKIP_ASSETS_FETCH=1, booting with empty public/ — only templates without assets will render."
  exit 0
fi

if [ -z "${FTP_HOST:-}" ] || [ -z "${FTP_USER:-}" ] || [ -z "${FTP_PASS:-}" ]; then
  echo "[fetch-assets] ⚠️  FTP_HOST / FTP_USER / FTP_PASS not set."
  echo "[fetch-assets] Booting WITHOUT fetching assets — most templates will fail to render."
  echo "[fetch-assets] Set the 3 env vars on the Railway service to enable fetch."
  exit 0
fi

echo "[fetch-assets] Mirroring $FTP_ASSETS_PATH → $TARGET_DIR (timeout ${ASSETS_FETCH_TIMEOUT}s)…"

# `lftp mirror` :
#   --parallel=4   : 4 fichiers en parallèle (FTP supporte plusieurs sessions)
#   --only-newer   : skip les fichiers déjà à jour (idempotent au reboot)
#   --no-perms     : Railway FS ignore les perms FTP, évite warnings
#   --delete       : supprime localement ce qui n'est plus sur FTP (sync)
timeout "${ASSETS_FETCH_TIMEOUT}s" lftp -e "
  set ftp:passive-mode true;
  set net:timeout 30;
  set net:max-retries 3;
  open -u \"$FTP_USER\",\"$FTP_PASS\" \"$FTP_HOST\";
  mirror --parallel=4 --only-newer --no-perms --delete \"$FTP_ASSETS_PATH\" \"$TARGET_DIR\";
  bye;
" || {
  echo "[fetch-assets] ❌ FTP mirror failed or timed out after ${ASSETS_FETCH_TIMEOUT}s."
  echo "[fetch-assets] Booting anyway — some templates may fail to render."
  exit 0
}

ASSET_COUNT="$(find "$TARGET_DIR" -type f | wc -l | tr -d ' ')"
echo "[fetch-assets] ✅ $ASSET_COUNT assets ready in $TARGET_DIR"
