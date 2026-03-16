#!/bin/bash
# setup-dev-seed.sh — Installe le kit de simulation locale COMPLET
#
# Synchronise configuration.json + vidéos pour les 3 serveurs :
#   - Angular TV/Remote (ng serve :4201)    → raspberry/public/
#   - Admin server (:8080)                  → raspberry/webapp/ + raspberry/videos/
#   - Socket.IO server (:3000)              → raspberry/webapp/
#
# Usage: npm run dev:seed   ou   bash scripts/setup-dev-seed.sh
# Undo:  bash scripts/setup-dev-seed.sh --clean

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_DIR="$SCRIPT_DIR/dev-seed"
PUBLIC_DIR="$PROJECT_ROOT/raspberry/public"
WEBAPP_DIR="$PROJECT_ROOT/raspberry/webapp"
RASPBERRY_DIR="$PROJECT_ROOT/raspberry"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[dev-seed]${NC} $1"; }
warn()  { echo -e "${YELLOW}[dev-seed]${NC} $1"; }
error() { echo -e "${RED}[dev-seed]${NC} $1"; }

# =============================================================================
# CLEAN MODE
# =============================================================================
if [[ "${1:-}" == "--clean" ]]; then
    info "Nettoyage des fichiers dev-seed..."

    # Angular public/
    rm -rf "$PUBLIC_DIR/videos"
    if [[ -f "$PUBLIC_DIR/configuration.json.bak" ]]; then
        mv "$PUBLIC_DIR/configuration.json.bak" "$PUBLIC_DIR/configuration.json"
        info "raspberry/public/configuration.json restauré"
    fi

    # Admin webapp/
    if [[ -f "$WEBAPP_DIR/configuration.json.bak" ]]; then
        mv "$WEBAPP_DIR/configuration.json.bak" "$WEBAPP_DIR/configuration.json"
        info "raspberry/webapp/configuration.json restauré"
    fi

    # Videos symlinks
    [[ -L "$RASPBERRY_DIR/videos" ]] && rm "$RASPBERRY_DIR/videos" && info "raspberry/videos symlink supprimé"
    [[ -L "$RASPBERRY_DIR/videos-secondary" ]] && rm "$RASPBERRY_DIR/videos-secondary" && info "raspberry/videos-secondary symlink supprimé"

    # Data dir
    [[ -d "$RASPBERRY_DIR/data" && ! -L "$RASPBERRY_DIR/data" ]] || {
        [[ -L "$RASPBERRY_DIR/data" ]] && rm "$RASPBERRY_DIR/data" && info "raspberry/data symlink supprimé"
    }

    info "Nettoyage terminé."
    exit 0
fi

# =============================================================================
# CHECKS
# =============================================================================
if [[ ! -d "$SEED_DIR" ]]; then
    error "Dossier dev-seed introuvable : $SEED_DIR"
    exit 1
fi

if [[ ! -f "$SEED_DIR/videos/default/01_NEOPRO.mp4" ]]; then
    error "Vidéos manquantes dans dev-seed/videos/"
    exit 1
fi

# =============================================================================
# 1. ANGULAR PUBLIC (ng serve :4201)
# =============================================================================
info "=== Angular TV/Remote (raspberry/public/) ==="

if [[ -f "$PUBLIC_DIR/configuration.json" && ! -f "$PUBLIC_DIR/configuration.json.bak" ]]; then
    cp "$PUBLIC_DIR/configuration.json" "$PUBLIC_DIR/configuration.json.bak"
    info "Backup → configuration.json.bak"
fi
cp "$SEED_DIR/configuration.json" "$PUBLIC_DIR/configuration.json"
info "configuration.json installé"

# Symlink videos dans public/
if [[ -L "$PUBLIC_DIR/videos" ]]; then
    rm "$PUBLIC_DIR/videos"
elif [[ -d "$PUBLIC_DIR/videos" ]]; then
    rm -rf "$PUBLIC_DIR/videos"
fi
ln -s "$SEED_DIR/videos" "$PUBLIC_DIR/videos"
info "videos/ → dev-seed/videos/"

# =============================================================================
# 2. ADMIN SERVER (:8080) — raspberry/webapp/configuration.json
# =============================================================================
info "=== Admin Server (raspberry/webapp/) ==="

mkdir -p "$WEBAPP_DIR"
if [[ -f "$WEBAPP_DIR/configuration.json" && ! -f "$WEBAPP_DIR/configuration.json.bak" ]]; then
    cp "$WEBAPP_DIR/configuration.json" "$WEBAPP_DIR/configuration.json.bak"
    info "Backup → webapp/configuration.json.bak"
fi
cp "$SEED_DIR/configuration.json" "$WEBAPP_DIR/configuration.json"
info "webapp/configuration.json installé"

# =============================================================================
# 3. VIDEOS DIRECTORY — raspberry/videos/ (admin server NEOPRO_DIR/videos)
# =============================================================================
info "=== Vidéos (raspberry/videos/) ==="

if [[ -L "$RASPBERRY_DIR/videos" ]]; then
    rm "$RASPBERRY_DIR/videos"
elif [[ -d "$RASPBERRY_DIR/videos" ]]; then
    warn "Dossier raspberry/videos/ existant — skip (pas un symlink)"
fi

if [[ ! -e "$RASPBERRY_DIR/videos" ]]; then
    ln -s "$SEED_DIR/videos" "$RASPBERRY_DIR/videos"
    info "raspberry/videos/ → dev-seed/videos/"
fi

# =============================================================================
# 4. DATA DIRECTORY — raspberry/data/ (sessions, analytics buffer)
# =============================================================================
info "=== Data (raspberry/data/) ==="

mkdir -p "$RASPBERRY_DIR/data"
# Seed data files if empty
if [[ ! -f "$RASPBERRY_DIR/data/admin-sessions.json" ]]; then
    echo '{}' > "$RASPBERRY_DIR/data/admin-sessions.json"
fi
if [[ ! -f "$RASPBERRY_DIR/data/analytics_buffer.json" ]]; then
    echo '[]' > "$RASPBERRY_DIR/data/analytics_buffer.json"
fi
# Copy runtime data from Pi snapshot
for f in kiosk-status.json license_cache.json sync-history.json; do
    if [[ -f "$SEED_DIR/data/$f" && ! -f "$RASPBERRY_DIR/data/$f" ]]; then
        cp "$SEED_DIR/data/$f" "$RASPBERRY_DIR/data/$f"
    fi
done
info "data/ initialisé"

# =============================================================================
# 5. MISC — VERSION, uploads-temp, logs
# =============================================================================
[[ -f "$RASPBERRY_DIR/VERSION" ]] || echo "dev" > "$RASPBERRY_DIR/VERSION"
mkdir -p "$RASPBERRY_DIR/uploads-temp" "$RASPBERRY_DIR/logs" "$RASPBERRY_DIR/thumbnails"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
info "Kit de simulation locale COMPLET installé :"
echo ""
echo "  Serveurs disponibles :"
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  :4201  Angular TV        http://localhost:4201          │"
echo "  │  :4201  Télécommande      http://localhost:4201/remote   │"
echo "  │  :8080  Admin Panel       http://localhost:8080          │"
echo "  │  :3000  Socket.IO server  node raspberry/server/server.js│"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  Mot de passe unique : dev123"
echo ""
echo "  Contenu :"
echo "  - 9 vidéos sponsor réelles (~6 Mo chacune)"
echo "  - 9 vidéos placeholder (joueurs, jingles — 3s, ~30 Ko)"
echo "  - 3 timeCategories (Avant-match, Match, Après-match)"
echo "  - 4 catégories (ENTRÉE, MATCH, INFOS CLUB, FOCUS PARTENAIRES)"
echo ""
info "Pour nettoyer : npm run dev:seed:clean"
