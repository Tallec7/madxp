#!/usr/bin/env bash
# smart-smoke.sh — Run only the smoke test suites relevant to changed files.
# Usage:
#   ./src/scripts/smart-smoke.sh          # auto-detect from git diff
#   ./src/scripts/smart-smoke.sh --all    # run all suites
#   ./src/scripts/smart-smoke.sh --list   # show mapping without running
#
# Falls back to ALL suites if no mapping found or >5 suites match.

set -euo pipefail
cd "$(dirname "$0")/../.."  # central-server root

if [[ "${1:-}" == "--all" ]]; then
  exec npx jest --testPathPattern='__tests__/smoke/' --verbose --no-coverage --forceExit
fi

# ── Changed files ─────────────────────────────────────────────────
CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
CHANGED=$(echo "$CHANGED" | sort -u | grep -v '^$' || true)

if [[ -z "$CHANGED" ]]; then
  echo "No changed files — running all smoke suites."
  exec npx jest --testPathPattern='__tests__/smoke/' --verbose --no-coverage --forceExit
fi

# ── Pattern → suite mapping (one per line: pattern|suite) ─────────
MAPPINGS="
middleware/auth|middleware/cors|middleware/error|middleware/helmet|server\.ts|middleware/validation=smoke-server-core
services/scheduler|services/cron-scheduler|services/memory-manager|services/network-alerts|services/realtime-stats|repositories/index=smoke-wiring
routes/.*\.routes|handlers/|raspberry/server/config|docs/adr/README=smoke-consistency
services/alerting|services/socket\.service|controllers/remote|cloud-remote=smoke-socket-realtime
raspberry/scripts|raspberry/admin|kiosk|watchdog|gpu|systemd|deploy\.sh|build.*\.sh|\.github/workflows=smoke-kiosk-pi
tv\.component|secondary|hdmi|resolution|display|variant|dual-output|led=smoke-display
wifi|hotspot|bgscan|network-watchdog|ipv6|reconnect=smoke-network-wifi
analytics|sponsor|weighted-playlist|video-library|impressions=smoke-analytics-sponsors
deployment\.service|canary|ota|update-software|deployed.path=smoke-deploy-ota
DataService|data\.service|decomposition|validation\.ts|repositories/.*\.repository=smoke-dashboard-guards
saas|club-portal|club-dashboard|site_type=smoke-saas
profile|safe-parser|safe-portfolio|score-overlay|ADR-03[5]|ADR-04[123]|PROP-002=smoke-adr-refactoring
remotion|template-schema|template-versions|render-job|ADR-05[45]=smoke-remotion
"

# ── Match ─────────────────────────────────────────────────────────
MATCHED=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  pattern="${line%%=*}"
  suite="${line##*=}"
  if echo "$CHANGED" | grep -qiE "$pattern"; then
    if [[ -z "$MATCHED" ]]; then
      MATCHED="$suite"
    elif ! echo "$MATCHED" | grep -q "$suite"; then
      MATCHED="$MATCHED $suite"
    fi
  fi
done <<< "$MAPPINGS"

# Count
if [[ -z "$MATCHED" ]]; then
  COUNT=0
else
  COUNT=$(echo "$MATCHED" | wc -w | tr -d ' ')
fi

# ── List mode ─────────────────────────────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  echo "Changed files ($(echo "$CHANGED" | wc -l | tr -d ' ')):"
  echo "$CHANGED" | head -20
  [[ $(echo "$CHANGED" | wc -l) -gt 20 ]] && echo "  ... (truncated)"
  echo ""
  if [[ $COUNT -eq 0 ]]; then
    echo "No matching suites — would run ALL."
  else
    echo "Matched suites ($COUNT):"
    for s in $MATCHED; do echo "  - $s"; done
  fi
  exit 0
fi

# ── Run ───────────────────────────────────────────────────────────
if [[ $COUNT -eq 0 ]] || [[ $COUNT -gt 5 ]]; then
  echo "[$COUNT suites matched] Running all smoke suites."
  exec npx jest --testPathPattern='__tests__/smoke/' --verbose --no-coverage --forceExit
fi

REGEX=$(echo "$MATCHED" | tr ' ' '|')
echo "Smart smoke: running $COUNT suite(s) → $REGEX"
echo ""
exec npx jest --testPathPattern="__tests__/smoke/($REGEX)" --verbose --no-coverage --forceExit
