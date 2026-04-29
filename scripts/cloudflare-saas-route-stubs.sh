#!/usr/bin/env bash
# Crée des copies statiques de l'index.html SaaS pour chaque route connue.
# Workaround ADR-071 phase 3 : Cloudflare Pages n'honore pas le wildcard
# `/saas/* /saas/index.html 200` du _redirects pour les sous-chemins, donc on
# crée des fichiers réels à chaque route SaaS qui sert le même index.html.
#
# Routes SaaS (cf. raspberry/src/app/app.routes.ts) :
#   - /saas/login
#   - /saas/remote
#   - /saas/tv (redirect → /saas/display/0)
#   - /saas/secondary (redirect → /saas/display/1)
#   - /saas/display/0..3
#
# Le router Angular de la SaaS app prend ensuite le relais côté client.

set -euo pipefail

SAAS_DIST="dist/central-dashboard/browser/saas"
SAAS_INDEX="$SAAS_DIST/index.html"

if [ ! -s "$SAAS_INDEX" ]; then
  echo "::error::SaaS index.html absent ($SAAS_INDEX) — abort"
  exit 1
fi

# Routes single-segment
for route in login remote tv secondary; do
  mkdir -p "$SAAS_DIST/$route"
  cp "$SAAS_INDEX" "$SAAS_DIST/$route/index.html"
done

# Routes display/:n (couvre les écrans 0..3)
for n in 0 1 2 3; do
  mkdir -p "$SAAS_DIST/display/$n"
  cp "$SAAS_INDEX" "$SAAS_DIST/display/$n/index.html"
done

echo "✅ SaaS route stubs créés (login/remote/tv/secondary/display/0..3)"
