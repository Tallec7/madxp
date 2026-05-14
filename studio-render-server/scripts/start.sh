#!/usr/bin/env bash
#
# start.sh — entrypoint container : fetch assets puis boot le render server.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 1. Mirror assets FTP → public/ (graceful : continue si FTP down ou env
#    var manquante, mais log clair).
bash scripts/fetch-assets.sh

# 2. Démarre le render server. `npm run studio:server` = `node studio-poc/server.mjs`
#    qui écoute sur PORT (Railway-injected) ou 5175 par défaut.
echo "[start] Starting studio render server on port ${PORT:-5175}…"
exec node studio-poc/server.mjs
