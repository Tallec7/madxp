#!/usr/bin/env bash
# Build both Angular apps into a single Cloudflare Pages deploy directory.
#
# Layout produced in dist-pages/:
#   _redirects         (SPA fallback for dashboard + /saas/ sub-app)
#   _headers           (security headers, cache-control)
#   index.html, *.js   (dashboard)
#   saas/              (SaaS app, baseHref /saas/)
#     index.html, *.js
#
# Replaces the Hostinger FTP deploy (ADR-071). See release.yml for the
# legacy flow that this will retire once DNS is cut over.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist-pages"
DASHBOARD_SRC="${ROOT_DIR}/dist/central-dashboard/browser"
SAAS_SRC="${ROOT_DIR}/dist/raspberry/browser"

echo "==> Cleaning ${OUT_DIR}"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

echo "==> Building central dashboard"
(cd "${ROOT_DIR}" && npm run build:central)

echo "==> Building SaaS app (baseHref=/saas/)"
(cd "${ROOT_DIR}" && npm run build:saas)

echo "==> Assembling ${OUT_DIR}"
cp -R "${DASHBOARD_SRC}/." "${OUT_DIR}/"
# The legacy .htaccess is Apache-only; Cloudflare Pages uses _redirects / _headers.
rm -f "${OUT_DIR}/.htaccess"

mkdir -p "${OUT_DIR}/saas"
cp -R "${SAAS_SRC}/." "${OUT_DIR}/saas/"
rm -f "${OUT_DIR}/saas/.htaccess"

echo "==> Copying _redirects and _headers"
cp "${ROOT_DIR}/pages/_redirects" "${OUT_DIR}/_redirects"
cp "${ROOT_DIR}/pages/_headers" "${OUT_DIR}/_headers"

echo "==> Sanity checks"
for required in index.html _redirects _headers saas/index.html; do
  if [ ! -s "${OUT_DIR}/${required}" ]; then
    echo "::error::Missing or empty: ${OUT_DIR}/${required}"
    exit 1
  fi
done

echo "==> Build complete:"
du -sh "${OUT_DIR}"
ls -la "${OUT_DIR}" | head
