#!/usr/bin/env bash
# Pre-prod checklist — bloque si staging n'est pas prête à être promue en prod.
#
# Usage : bash scripts/pre-prod-checklist.sh [--strict]
#
# Vérifie en 30s :
#   1. API staging /live + /ready
#   2. Dashboard staging répond 200
#   3. Aucun run E2E nightly récent en échec
#   4. Pi staging dédié heartbeat < 5 min
#   5. Aucune issue ouverte avec label `e2e-broken` ou `release-stuck`
#
# Sortie : 0 = OK, on peut taguer | 1 = problème, NE PAS taguer prod.
# Mode --strict : refuse aussi si E2E nightly n'a pas tourné dans les dernières 36h.

set -uo pipefail

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

API_STAGING="${API_STAGING_URL:-https://api-staging.kalonpartners.bzh}"
DASH_STAGING="${DASH_STAGING_URL:-https://neopro-exg.pages.dev}"
PI_STAGING_SITE_ID="${PI_STAGING_SITE_ID:-}"
PROD_DATABASE_URL="${PROD_DATABASE_URL:-${DATABASE_URL:-}}"

PASS="✅"
FAIL="❌"
WARN="⚠️ "

errors=0
warns=0

check() {
  local name="$1"; shift
  if "$@" >/tmp/check.log 2>&1; then
    echo "$PASS $name"
  else
    echo "$FAIL $name"
    sed 's/^/   /' /tmp/check.log
    errors=$((errors + 1))
  fi
}

# 1. API staging health
check "API staging /live" \
  bash -c "curl -fsS --max-time 10 '$API_STAGING/live' >/dev/null"

check "API staging /ready" \
  bash -c "curl -fsS --max-time 10 '$API_STAGING/ready' >/dev/null"

# 2. Dashboard staging
check "Dashboard staging HTTP 200" \
  bash -c "[ \$(curl -sI -o /dev/null -w '%{http_code}' --max-time 10 '$DASH_STAGING') = '200' ]"

# 3. Run E2E nightly récent
if command -v gh >/dev/null 2>&1; then
  LAST_E2E=$(gh run list --workflow=e2e-staging.yml --limit=1 --json conclusion,createdAt -q '.[0]' 2>/dev/null || echo "")
  if [ -z "$LAST_E2E" ] || [ "$LAST_E2E" = "null" ]; then
    echo "$WARN Aucun run E2E staging trouvé"
    warns=$((warns + 1))
  else
    CONCLUSION=$(echo "$LAST_E2E" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).conclusion)")
    CREATED=$(echo "$LAST_E2E" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).createdAt)")
    AGE_HOURS=$(( ( $(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CREATED" +%s 2>/dev/null || date -d "$CREATED" +%s) ) / 3600 ))

    if [ "$CONCLUSION" = "success" ]; then
      echo "$PASS E2E staging nightly: success (il y a ${AGE_HOURS}h)"
    else
      echo "$FAIL E2E staging nightly: $CONCLUSION (il y a ${AGE_HOURS}h)"
      errors=$((errors + 1))
    fi

    if [ "$STRICT" = "1" ] && [ "$AGE_HOURS" -gt 36 ]; then
      echo "$FAIL Mode --strict : E2E nightly trop ancien (${AGE_HOURS}h > 36h)"
      errors=$((errors + 1))
    fi
  fi

  # 5. Issues bloquantes ouvertes
  BLOCKING=$(gh issue list --label "e2e-broken" --label "release-stuck" --state open --limit 1 --json number -q '.[0].number' 2>/dev/null || echo "")
  if [ -n "$BLOCKING" ] && [ "$BLOCKING" != "null" ]; then
    echo "$FAIL Issue bloquante ouverte (#$BLOCKING) — résoudre avant tag"
    errors=$((errors + 1))
  else
    echo "$PASS Aucune issue bloquante ouverte"
  fi
else
  echo "$WARN gh CLI non installé — skip check E2E nightly + issues"
  warns=$((warns + 1))
fi

# 4. Pi staging heartbeat (optionnel — nécessite accès DB prod)
if [ -n "$PI_STAGING_SITE_ID" ] && [ -n "$PROD_DATABASE_URL" ] && command -v psql >/dev/null 2>&1; then
  LAST_SEEN=$(psql "$PROD_DATABASE_URL" -t -A -c \
    "SELECT EXTRACT(EPOCH FROM (NOW() - last_seen))::int FROM sites WHERE id = '$PI_STAGING_SITE_ID'" 2>/dev/null || echo "")
  if [ -z "$LAST_SEEN" ]; then
    echo "$WARN Pi staging $PI_STAGING_SITE_ID introuvable en DB"
    warns=$((warns + 1))
  elif [ "$LAST_SEEN" -lt 300 ]; then
    echo "$PASS Pi staging vivant (dernier heartbeat: ${LAST_SEEN}s)"
  else
    echo "$FAIL Pi staging silencieux (${LAST_SEEN}s > 300s)"
    errors=$((errors + 1))
  fi
else
  echo "$WARN Pi staging check skip (PI_STAGING_SITE_ID ou PROD_DATABASE_URL manquant)"
  warns=$((warns + 1))
fi

echo ""
echo "=========================="
if [ "$errors" -gt 0 ]; then
  echo "$FAIL $errors erreur(s) — NE PAS taguer prod"
  exit 1
fi
if [ "$warns" -gt 0 ]; then
  echo "$WARN $warns warning(s) — vérifier avant tag"
fi
echo "$PASS Pre-prod checklist OK — tu peux taguer prod"
exit 0
