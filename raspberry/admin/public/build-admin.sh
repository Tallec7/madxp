#!/bin/bash
# Concatene les modules en un seul app.js
# Usage: cd raspberry/admin/public && bash build-admin.sh

set -euo pipefail

OUTPUT="app.js"
BACKUP="app.js.bak"

# Backup
cp "$OUTPUT" "$BACKUP" 2>/dev/null || true

echo "/** " > "$OUTPUT"
echo " * Neopro Admin Panel - JavaScript" >> "$OUTPUT"
echo " * FICHIER GENERE - Ne pas editer directement" >> "$OUTPUT"
echo " * Editer les fichiers dans modules/ puis lancer: bash build-admin.sh" >> "$OUTPUT"
echo " * Build: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUTPUT"
echo " */" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Ordre de concatenation (les dependances d'abord)
MODULES=(
  "modules/demo/index.js"
  "modules/core/state.js"
  "modules/core/mode-switcher.js"
  "modules/core/connection.js"
  "modules/core/notifications.js"
  "modules/dashboard/sync-status.js"
  "modules/dashboard/index.js"
  "modules/videos/loader.js"
  "modules/videos/orphans.js"
  "modules/videos/editor.js"
  "modules/videos/bulk.js"
  "modules/videos/drag-drop.js"
  "modules/network/wifi.js"
  "modules/network/hotspot.js"
  "modules/logs/index.js"
  "modules/upload/index.js"
  "modules/config/time-categories.js"
  "modules/config/categories.js"
  "modules/bootstrap.js"
)

for module in "${MODULES[@]}"; do
  if [ -f "$module" ]; then
    echo "" >> "$OUTPUT"
    echo "// ============================================================================" >> "$OUTPUT"
    echo "// MODULE: $module" >> "$OUTPUT"
    echo "// ============================================================================" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    cat "$module" >> "$OUTPUT"
  else
    echo "WARN: Module not found: $module" >&2
  fi
done

LINES=$(wc -l < "$OUTPUT")

# Cache-busting: inject version query string in index.html
# Express.static ignores query strings, so app.js?v=X serves app.js
VERSION=$(grep '"version"' ../package.json | head -1 | sed 's/.*"version"[^"]*"\([^"]*\)".*/\1/' | sed 's/^v//')
if [ -n "$VERSION" ] && [ -f "index.html" ]; then
  # Idempotent: replaces app.js or app.js?v=old with app.js?v=new
  sed -i.bak "s|app\.js\(?v=[^\"]*\)\{0,1\}\"|app.js?v=${VERSION}\"|g" index.html
  sed -i.bak "s|styles\.css\(?v=[^\"]*\)\{0,1\}\"|styles.css?v=${VERSION}\"|g" index.html
  rm -f index.html.bak
  echo "Cache-busting: injected ?v=$VERSION in index.html"
fi

echo "Build complete: $OUTPUT ($LINES lines)"
