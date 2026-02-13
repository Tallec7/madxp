#!/bin/bash
# Synchronise les versions des sous-packages raspberry avec la version principale.
# Appelé automatiquement par semantic-release via @semantic-release/exec.
# Usage: ./scripts/sync-raspberry-versions.sh <version>
#   ex: ./scripts/sync-raspberry-versions.sh 3.20.3

set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"

SUBPACKAGES=(
    "raspberry/admin/package.json"
    "raspberry/sync-agent/package.json"
    "raspberry/server/package.json"
)

for pkg in "${SUBPACKAGES[@]}"; do
    if [ -f "$pkg" ]; then
        # Portable sed -i : utilise un fichier temporaire pour éviter les différences macOS/Linux
        tmp="${pkg}.tmp"
        sed "s/\"version\": *\"[^\"]*\"/\"version\": \"v${VERSION}\"/" "$pkg" > "$tmp"
        mv "$tmp" "$pkg"
        echo "  $pkg → v${VERSION}"
    fi
done

# Rebuild admin app.js (met à jour le timestamp de build)
if [ -f "raspberry/admin/public/build-admin.sh" ]; then
    (cd raspberry/admin/public && bash build-admin.sh)
fi
