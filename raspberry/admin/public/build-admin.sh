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
  "modules/core/connection.js"
  "modules/core/notifications.js"
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
echo "Build complete: $OUTPUT ($LINES lines)"
