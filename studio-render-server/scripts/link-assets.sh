#!/usr/bin/env bash
#
# link-assets.sh — symlink les assets binaires depuis l'autre dossier d'authoring.
#
# Les sources lourdes (vidéos .mov/.webm, masks PNG, fonts, ~5 GB) vivent dans
# `studio-template/templates-remotion/public/` (workspace d'authoring sandbox)
# pour ne pas alourdir le repo neopro. Ce script crée des symlinks pour que
# le render server local trouve ses assets.
#
# Usage : depuis studio-render-server/ → `bash scripts/link-assets.sh`
#
# Override : `SOURCE_DIR=/path/to/templates-remotion bash scripts/link-assets.sh`

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$HOME/Documents/NEOPRO/studio-template/templates-remotion}"

if [ ! -d "$SOURCE_DIR/public" ]; then
  echo "❌ Source assets dir introuvable : $SOURCE_DIR/public"
  echo "   Override avec SOURCE_DIR=... ou récupère le workspace d'authoring."
  exit 1
fi

# Symlink le public/ entier — atomique, pas de copie lourde.
TARGET_PUBLIC="$TARGET_DIR/public"
if [ -L "$TARGET_PUBLIC" ]; then
  echo "↻ Symlink existant, refresh : $TARGET_PUBLIC"
  rm "$TARGET_PUBLIC"
elif [ -d "$TARGET_PUBLIC" ]; then
  echo "⚠️  $TARGET_PUBLIC existe en tant que dossier réel (pas un symlink)."
  echo "   Backup vers public.bak/ puis remplacement par symlink."
  mv "$TARGET_PUBLIC" "$TARGET_PUBLIC.bak"
fi
ln -s "$SOURCE_DIR/public" "$TARGET_PUBLIC"

echo "✅ $TARGET_PUBLIC → $SOURCE_DIR/public"
echo "   $(ls "$TARGET_PUBLIC" | wc -l | tr -d ' ') assets disponibles."
