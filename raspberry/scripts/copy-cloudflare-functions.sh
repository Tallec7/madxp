#!/usr/bin/env bash
# Copie les Cloudflare Pages Functions du SaaS raspberry dans dist/raspberry/functions/
# (sibling de dist/raspberry/browser/), comme attendu par CF Pages auto-deploy.
#
# Pourquoi : angular.json copie déjà _redirects/_headers vers dist/raspberry/browser/,
# mais les Pages Functions doivent être SIBLING du output dir (pas dedans),
# donc ne peuvent pas passer par angular.json `assets`.
#
# Appelé après `ng build raspberry --configuration=saas[-staging]` via
# le script `build:saas` / `build:saas:staging` du package.json racine.
#
# Cf. ADR-071 phase 3 + suite (port raspberry).
set -euo pipefail

SRC="raspberry/cloudflare/functions"
DEST="dist/raspberry/functions"

if [ ! -d "$SRC" ]; then
  echo "ℹ️  $SRC absent — rien à copier" >&2
  exit 0
fi

mkdir -p "$DEST"
cp -r "$SRC/." "$DEST/"
echo "✅ CF Pages Functions copiées : $SRC → $DEST"
ls "$DEST"
