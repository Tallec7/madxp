#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# extract-masks.sh — Pre-extract alpha masks from VP9+alpha WebM files
#
# Converts the alpha channel of C.webm / E.webm into grayscale PNG sequences
# (480×270) used by the React components as CSS luminance masks.
#
# This eliminates the runtime delayRender + canvas.toDataURL pipeline that was
# blocking each frame during headless render (~2-4x render speedup).
#
# Usage:  cd templates-remotion && bash scripts/extract-masks.sh
# Requires: ffmpeg with libvpx-vp9 decoder
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"

echo "=== Extracting alpha masks ==="

# ButSimple — C.webm: 180 frames at 30fps (composition = 180 frames @ 30fps, source = 25fps)
echo "[1/3] BUT_simple_C.webm → masks/but-simple-C/ (180 frames)"
mkdir -p "$PUBLIC_DIR/masks/but-simple-C"
ffmpeg -y -c:v libvpx-vp9 -i "$PUBLIC_DIR/BUT_simple_C.webm" \
  -vf "fps=30,alphaextract,scale=480:270,format=gray" \
  -frames:v 180 -update 0 \
  "$PUBLIC_DIR/masks/but-simple-C/%04d.png" 2>/dev/null

# ButImgJoueur — C.webm: 210 frames at 30fps (composition = 210 frames @ 30fps, source = 29.97fps)
echo "[2/3] BUT_img_joueur_C.webm → masks/but-img-joueur-C/ (210 frames)"
mkdir -p "$PUBLIC_DIR/masks/but-img-joueur-C"
ffmpeg -y -c:v libvpx-vp9 -i "$PUBLIC_DIR/BUT_img_joueur_C.webm" \
  -vf "fps=30,alphaextract,scale=480:270,format=gray" \
  -frames:v 210 -update 0 \
  "$PUBLIC_DIR/masks/but-img-joueur-C/%04d.png" 2>/dev/null

# ButImgJoueur — E.webm: 210 frames at 30fps (composition = 210 frames @ 30fps, source = 29.97fps)
echo "[3/3] BUT_img_joueur_E.webm → masks/but-img-joueur-E/ (210 frames)"
mkdir -p "$PUBLIC_DIR/masks/but-img-joueur-E"
ffmpeg -y -c:v libvpx-vp9 -i "$PUBLIC_DIR/BUT_img_joueur_E.webm" \
  -vf "fps=30,alphaextract,scale=480:270,format=gray" \
  -frames:v 210 -update 0 \
  "$PUBLIC_DIR/masks/but-img-joueur-E/%04d.png" 2>/dev/null

echo ""
echo "=== Done ==="
du -sh "$PUBLIC_DIR/masks/"
echo "Frame counts:"
echo "  but-simple-C:     $(ls "$PUBLIC_DIR/masks/but-simple-C/" | wc -l | tr -d ' ') frames"
echo "  but-img-joueur-C: $(ls "$PUBLIC_DIR/masks/but-img-joueur-C/" | wc -l | tr -d ' ') frames"
echo "  but-img-joueur-E: $(ls "$PUBLIC_DIR/masks/but-img-joueur-E/" | wc -l | tr -d ' ') frames"
