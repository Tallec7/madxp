#!/bin/bash

################################################################################
# Script de synchronisation du serveur
# Copie les fichiers de server-render/ vers raspberry/server/
#
# Usage: ./sync-server.sh
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SOURCE_DIR="${PROJECT_ROOT}/server-render"
DEST_DIR="${PROJECT_ROOT}/raspberry/server"

echo "🔄 Synchronisation du serveur..."
echo "Source: ${SOURCE_DIR}"
echo "Destination: ${DEST_DIR}"

# Créer le répertoire de destination si nécessaire
mkdir -p "${DEST_DIR}"

# Copier les fichiers essentiels
cp "${SOURCE_DIR}/package.json" "${DEST_DIR}/package.json"
cp "${SOURCE_DIR}/server.js" "${DEST_DIR}/server.js"

echo "✓ Synchronisation terminée"
echo ""
echo "Fichiers copiés:"
ls -lh "${DEST_DIR}"/*.json "${DEST_DIR}"/*.js
