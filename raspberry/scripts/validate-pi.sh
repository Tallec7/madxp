#!/bin/bash
# validate-pi.sh — Validation complète d'un Raspberry Pi Neopro
#
# Usage:
#   bash validate-pi.sh              # Mode humain (couleurs)
#   bash validate-pi.sh --json       # Mode JSON (pour dashboard/OTA)
#   bash validate-pi.sh --quiet      # Exit code seulement (0=OK, 1=critical, 2=warnings)
#
# Deux niveaux :
#   CRITICAL : service mort, app injoignable, config corrompue → exit 1
#   WARNING  : HDMI absent, Chromium down, buffer analytics gros → exit 2 (ou 0 si --quiet)

set -euo pipefail

NEOPRO_ROOT="${NEOPRO_ROOT:-/home/pi/neopro}"
MODE="${1:-human}"

# Counters
CRITICAL_COUNT=0
WARNING_COUNT=0
PASS_COUNT=0
CHECKS_JSON=""

# ─────────────────────── Helpers ───────────────────────

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_critical() {
  CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
  local check="$1" msg="$2"
  if [ "$MODE" = "human" ]; then
    echo -e "  ${RED}✗ CRITICAL${NC} [$check] $msg"
  fi
  CHECKS_JSON="${CHECKS_JSON}{\"level\":\"critical\",\"check\":\"$check\",\"message\":\"$msg\"},"
}

log_warning() {
  WARNING_COUNT=$((WARNING_COUNT + 1))
  local check="$1" msg="$2"
  if [ "$MODE" = "human" ]; then
    echo -e "  ${YELLOW}⚠ WARNING${NC}  [$check] $msg"
  fi
  CHECKS_JSON="${CHECKS_JSON}{\"level\":\"warning\",\"check\":\"$check\",\"message\":\"$msg\"},"
}

log_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  local check="$1" msg="$2"
  if [ "$MODE" = "human" ]; then
    echo -e "  ${GREEN}✓ PASS${NC}     [$check] $msg"
  fi
  CHECKS_JSON="${CHECKS_JSON}{\"level\":\"pass\",\"check\":\"$check\",\"message\":\"$msg\"},"
}

# ─────────────────────── CRITICAL CHECKS ───────────────────────

check_services() {
  local services="neopro-app neopro-admin"
  for svc in $services; do
    local status
    status=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    if [ "$status" = "active" ]; then
      log_pass "service:$svc" "Service $svc is active"
    else
      log_critical "service:$svc" "Service $svc is $status (expected: active)"
    fi
  done
}

check_app_health() {
  local response
  if response=$(curl -sf --connect-timeout 5 --max-time 8 http://localhost:3000/ 2>/dev/null); then
    local status
    status=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "unknown")
    if [ "$status" = "ok" ]; then
      log_pass "app_health" "Socket.IO server responding (status: ok)"
    else
      log_critical "app_health" "Socket.IO server status: $status (expected: ok)"
    fi
  else
    log_critical "app_health" "Socket.IO server not responding on port 3000"
  fi
}

check_admin_health() {
  if curl -sf --connect-timeout 5 --max-time 8 http://localhost:8080/api/version >/dev/null 2>&1; then
    log_pass "admin_health" "Admin server responding on port 8080"
  else
    log_critical "admin_health" "Admin server not responding on port 8080"
  fi
}

check_config_integrity() {
  local config_path="$NEOPRO_ROOT/webapp/configuration.json"
  if [ ! -f "$config_path" ]; then
    log_critical "config" "configuration.json missing: $config_path"
    return
  fi

  if ! python3 -c "import json; json.load(open('$config_path'))" 2>/dev/null; then
    log_critical "config" "configuration.json is not valid JSON"
    return
  fi

  log_pass "config" "configuration.json exists and is valid JSON"
}

check_webapp_integrity() {
  if [ -f "$NEOPRO_ROOT/webapp/index.html" ]; then
    log_pass "webapp" "webapp/index.html exists"
  else
    log_critical "webapp" "webapp/index.html missing — Angular app not deployed"
  fi
}

# ─────────────────────── WARNING CHECKS ───────────────────────

check_hdmi() {
  local any_connected=false
  for status_file in /sys/class/drm/card?-HDMI-A-*/status; do
    if [ -f "$status_file" ]; then
      local s
      s=$(cat "$status_file" 2>/dev/null || echo "unknown")
      if [ "$s" = "connected" ]; then
        any_connected=true
        break
      fi
    fi
  done

  if $any_connected; then
    log_pass "hdmi" "At least one HDMI display connected"
  else
    log_warning "hdmi" "No HDMI display detected — TV will show waiting screen"
  fi
}

check_nginx() {
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 http://localhost:4200/ 2>/dev/null || echo "000")
  if [ "$http_code" != "000" ]; then
    log_pass "nginx" "nginx serving webapp on port 4200 (HTTP $http_code)"
  else
    log_warning "nginx" "nginx not responding on port 4200"
  fi
}

check_disk_space() {
  local available_kb
  available_kb=$(df -k /home/pi 2>/dev/null | tail -1 | awk '{print $4}')
  if [ -z "$available_kb" ]; then
    available_kb=$(df -k / | tail -1 | awk '{print $4}')
  fi
  local available_mb=$((available_kb / 1024))

  if [ "$available_mb" -lt 500 ]; then
    log_warning "disk" "Low disk space: ${available_mb}MB available (threshold: 500MB)"
  else
    log_pass "disk" "Disk space OK: ${available_mb}MB available"
  fi
}

check_analytics_buffer() {
  local data_dir="$NEOPRO_ROOT/data"
  if [ ! -d "$data_dir" ]; then
    return
  fi

  local total_size
  total_size=$(find "$data_dir" -name 'analytics*' -type f -exec du -ck {} + 2>/dev/null | tail -1 | awk '{print $1}')
  total_size=${total_size:-0}
  local total_mb=$((total_size / 1024))

  if [ "$total_mb" -gt 5 ]; then
    log_warning "analytics_buffer" "Analytics buffer large: ${total_mb}MB — possible sync issue"
  else
    log_pass "analytics_buffer" "Analytics buffer OK (${total_mb}MB)"
  fi
}

check_video_directory() {
  local videos_dir="$NEOPRO_ROOT/videos"
  if [ ! -d "$videos_dir" ]; then
    log_warning "videos" "Video directory does not exist — no content available"
    return
  fi

  local video_count
  video_count=$(find "$videos_dir" -type f \( -name '*.mp4' -o -name '*.mkv' -o -name '*.mov' -o -name '*.webm' \) 2>/dev/null | wc -l)
  video_count=$((video_count + 0))
  log_pass "videos" "Video directory exists ($video_count video files)"
}

check_chromium() {
  local count
  count=$(pgrep -c chromium 2>/dev/null || true)
  count=${count:-0}

  if [ "$count" -gt 0 ]; then
    log_pass "chromium" "Chromium running ($count processes)"
  else
    log_warning "chromium" "Chromium not running — kiosk display may not be active"
  fi
}

check_socket_connections() {
  local response
  if response=$(curl -sf --connect-timeout 3 --max-time 5 http://localhost:3000/ 2>/dev/null); then
    local connections
    connections=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('connections',0))" 2>/dev/null || echo "0")
    if [ "$connections" -gt 0 ]; then
      log_pass "socket_connections" "$connections Socket.IO client(s) connected"
    else
      log_warning "socket_connections" "No Socket.IO clients connected — TV tab may not be loaded"
    fi
  fi
}

# ─────────────────────── MAIN ───────────────────────

if [ "$MODE" = "human" ]; then
  echo -e "\n${BLUE}═══ Neopro Pi Validation ═══${NC}\n"
  echo -e "${BLUE}--- Critical checks ---${NC}"
fi

check_services
check_app_health
check_admin_health
check_config_integrity
check_webapp_integrity

if [ "$MODE" = "human" ]; then
  echo -e "\n${BLUE}--- Warning checks ---${NC}"
fi

check_hdmi
check_nginx
check_disk_space
check_analytics_buffer
check_video_directory
check_chromium
check_socket_connections

# ─────────────────────── Output ───────────────────────

# Remove trailing comma from JSON
CHECKS_JSON="${CHECKS_JSON%,}"

if [ "$MODE" = "--json" ]; then
  HEALTHY="true"
  [ "$CRITICAL_COUNT" -gt 0 ] && HEALTHY="false"

  cat <<JSONEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "healthy": $HEALTHY,
  "criticalCount": $CRITICAL_COUNT,
  "warningCount": $WARNING_COUNT,
  "passCount": $PASS_COUNT,
  "checks": [$CHECKS_JSON]
}
JSONEOF
elif [ "$MODE" = "--quiet" ]; then
  # Silent — just exit code
  :
else
  echo ""
  if [ "$CRITICAL_COUNT" -gt 0 ]; then
    echo -e "${RED}═══ RESULT: $CRITICAL_COUNT CRITICAL, $WARNING_COUNT warnings, $PASS_COUNT passed ═══${NC}"
  elif [ "$WARNING_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}═══ RESULT: 0 critical, $WARNING_COUNT warnings, $PASS_COUNT passed ═══${NC}"
  else
    echo -e "${GREEN}═══ RESULT: All $PASS_COUNT checks passed ═══${NC}"
  fi
  echo ""
fi

# Exit codes: 1 = critical failure, 2 = warnings only, 0 = all good
if [ "$CRITICAL_COUNT" -gt 0 ]; then
  exit 1
elif [ "$WARNING_COUNT" -gt 0 ]; then
  exit 2
else
  exit 0
fi
