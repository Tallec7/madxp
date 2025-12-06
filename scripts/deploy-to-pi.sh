#!/bin/bash

################################################################################
# Build & Deploy Neopro to a Raspberry Pi
# - Builds Angular (production)
# - Copies build, videos, and configuration to the Pi
# - Restarts required services
#
# Usage:
#   ./scripts/deploy-to-pi.sh [host] [user]
#     host: hostname or IP of the Pi (default: neopro.local)
#     user: SSH user (default: pi)
#
# Requirements:
#   - Run from repository root
#   - SSH access to the Pi (password or key)
#   - rsync installed locally
################################################################################

set -euo pipefail

HOST="${1:-neopro.local}"
USER="${2:-pi}"
TARGET_DIR="/home/pi/neopro"
WEBAPP_DIR="${TARGET_DIR}/webapp"
VIDEOS_DIR="${TARGET_DIR}/videos"
CONFIG_FILE="public/configuration.json"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() { echo -e "${BLUE}>>> $1${NC}"; }
log_success() { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

if [ ! -f "package.json" ]; then
  echo "❌ Run this script from the repository root (package.json not found)"
  exit 1
fi

command -v rsync >/dev/null 2>&1 || { echo "❌ rsync is required"; exit 1; }

log_step "Installing dependencies & building Angular"
npm install
npm run build
log_success "Angular build complete"

log_step "Preparing directories on ${HOST}"
ssh "${USER}@${HOST}" "mkdir -p '${WEBAPP_DIR}' '${VIDEOS_DIR}'"
log_success "Remote directories ready"

log_step "Syncing webapp to ${HOST}:${WEBAPP_DIR}"
rsync -az --delete dist/neopro/browser/ "${USER}@${HOST}:${WEBAPP_DIR}/"
log_success "Webapp synced"

if [ -d "public/videos" ]; then
  log_step "Syncing videos to ${HOST}:${VIDEOS_DIR}"
  rsync -az public/videos/ "${USER}@${HOST}:${VIDEOS_DIR}/"
  log_success "Videos synced"
else
  log_warn "No public/videos directory found, skipping video sync"
fi

if [ -f "${CONFIG_FILE}" ]; then
  log_step "Copying configuration.json"
  scp "${CONFIG_FILE}" "${USER}@${HOST}:${WEBAPP_DIR}/configuration.json"
  log_success "Configuration synced"
else
  log_warn "public/configuration.json not found, skipping"
fi

log_step "Syncing sync-agent to ${HOST}:${TARGET_DIR}/sync-agent"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'config/.env' \
  raspberry/sync-agent/ "${USER}@${HOST}:${TARGET_DIR}/sync-agent/"
log_success "Sync-agent synced"

log_step "Installing sync-agent dependencies"
ssh "${USER}@${HOST}" "cd ${TARGET_DIR}/sync-agent && npm install --omit=dev" >/dev/null 2>&1 || true
log_success "Sync-agent dependencies installed"

log_step "Restarting services on ${HOST}"
ssh "${USER}@${HOST}" "sudo systemctl restart neopro-app nginx" >/dev/null
# Restart sync-agent if it exists
ssh "${USER}@${HOST}" "sudo systemctl restart neopro-sync-agent 2>/dev/null || true"
log_success "Deployment completed"
