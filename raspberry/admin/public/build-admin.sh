#!/bin/bash
# Concatene les modules JS en app.js et les modules CSS en styles.css
# Usage: cd raspberry/admin/public && bash build-admin.sh

set -euo pipefail

# =============================================================================
# CSS Build — Concatenate modular CSS files into styles.css
# =============================================================================

CSS_OUTPUT="styles.css"
CSS_BACKUP="styles.css.bak"

cp "$CSS_OUTPUT" "$CSS_BACKUP" 2>/dev/null || true

CSS_FILES=(
  "styles/base.css"
  "styles/layout.css"
  "styles/components.css"
  "styles/dashboard.css"
  "styles/videos.css"
  "styles/sponsors.css"
  "styles/network.css"
  "styles/logs.css"
  "styles/system.css"
  "styles/responsive.css"
)

echo "/* Auto-generated from styles/ modules - DO NOT EDIT DIRECTLY */" > "$CSS_OUTPUT"
echo "/* Edit files in styles/ then run: bash build-admin.sh */" >> "$CSS_OUTPUT"

for css_file in "${CSS_FILES[@]}"; do
  if [ -f "$css_file" ]; then
    echo "" >> "$CSS_OUTPUT"
    echo "/* === $(basename "$css_file") === */" >> "$CSS_OUTPUT"
    echo "" >> "$CSS_OUTPUT"
    cat "$css_file" >> "$CSS_OUTPUT"
  else
    echo "WARN: CSS module not found: $css_file" >&2
  fi
done

CSS_LINES=$(wc -l < "$CSS_OUTPUT")
echo "CSS build complete: $CSS_OUTPUT ($CSS_LINES lines)"

# =============================================================================
# JS Build — Concatenate modular JS files into app.js
# =============================================================================

OUTPUT="app.js"
BACKUP="app.js.bak"

# Backup
cp "$OUTPUT" "$BACKUP" 2>/dev/null || true

echo "/** " > "$OUTPUT"
echo " * Neopro Admin Panel - JavaScript" >> "$OUTPUT"
echo " * FICHIER GENERE - Ne pas editer directement" >> "$OUTPUT"
echo " * Editer les fichiers dans modules/ puis lancer: bash build-admin.sh" >> "$OUTPUT"
echo " */" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Ordre de concatenation (les dependances d'abord)
MODULES=(
  "modules/demo/index.js"
  "modules/core/state.js"
  "modules/core/mode-switcher.js"
  "modules/core/connection.js"
  "modules/core/realtime.js"
  "modules/core/notifications.js"
  "modules/dashboard/sync-status.js"
  "modules/dashboard/index.js"
  "modules/videos/loader.js"
  "modules/videos/orphans.js"
  "modules/videos/editor.js"
  "modules/videos/bulk.js"
  "modules/videos/drag-drop.js"
  "modules/sponsors/index.js"
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
