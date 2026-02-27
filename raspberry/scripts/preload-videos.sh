#!/usr/bin/env bash
# E-23 US-23.3.3: Pre-load videos into nginx proxy cache at boot
# Reads configuration.json, extracts video paths, curls them through nginx
# to warm the proxy_cache (neopro_videos zone).
#
# Usage: preload-videos.sh [--max N]
#   --max N   Preload at most N videos (default: 20)
#
# Designed to run as a oneshot systemd service after nginx + admin server start.
# Example: ExecStartPost=/home/pi/neopro/scripts/preload-videos.sh --max 10 &

set -euo pipefail

CONFIG_PATH="${HOME}/neopro/webapp/configuration.json"
NGINX_BASE="http://127.0.0.1"
MAX_VIDEOS=20
LOG_TAG="neopro-preload"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max)
      MAX_VIDEOS="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Wait for dependencies
# ---------------------------------------------------------------------------
wait_for_service() {
  local url="$1" retries=30
  for ((i = 1; i <= retries; i++)); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

logger -t "$LOG_TAG" "Waiting for admin server (port 8080)..."
if ! wait_for_service "http://127.0.0.1:8080/videos/"; then
  logger -t "$LOG_TAG" "Admin server not ready after 30s, aborting preload"
  exit 0
fi

# ---------------------------------------------------------------------------
# Extract video paths from configuration.json
# ---------------------------------------------------------------------------
if [[ ! -f "$CONFIG_PATH" ]]; then
  logger -t "$LOG_TAG" "No configuration.json found at $CONFIG_PATH, skipping preload"
  exit 0
fi

# Use jq if available, otherwise python3 as fallback
extract_paths() {
  if command -v jq &>/dev/null; then
    jq -r '
      [
        (.sponsors // [] | .[].path // empty),
        (.timeCategories // [] | .[].loopVideos // [] | .[].path // empty),
        (.categories // [] | .. | .path? // empty)
      ] | flatten | unique | .[]
    ' "$CONFIG_PATH" 2>/dev/null
  elif command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open('$CONFIG_PATH') as f:
    cfg = json.load(f)
paths = set()
for s in cfg.get('sponsors', []):
    if s.get('path'): paths.add(s['path'])
for tc in cfg.get('timeCategories', []):
    for v in tc.get('loopVideos', []):
        if v.get('path'): paths.add(v['path'])
def walk(cats):
    for c in (cats or []):
        for v in c.get('videos', []):
            if v.get('path'): paths.add(v['path'])
        walk(c.get('subCategories', []))
walk(cfg.get('categories', []))
for p in sorted(paths):
    print(p)
" 2>/dev/null
  else
    logger -t "$LOG_TAG" "Neither jq nor python3 available, cannot parse config"
    exit 0
  fi
}

mapfile -t VIDEO_PATHS < <(extract_paths)

if [[ ${#VIDEO_PATHS[@]} -eq 0 ]]; then
  logger -t "$LOG_TAG" "No video paths found in configuration, nothing to preload"
  exit 0
fi

# ---------------------------------------------------------------------------
# Preload by curling through nginx (populates proxy_cache)
# ---------------------------------------------------------------------------
count=0
cached=0
for vpath in "${VIDEO_PATHS[@]}"; do
  if [[ $count -ge $MAX_VIDEOS ]]; then
    break
  fi

  # Paths in config are like "/videos/file.mp4" — curl through nginx on port 80
  url="${NGINX_BASE}${vpath}"
  cache_status=$(curl -sf -o /dev/null -w '%{http_code}' -H "Range: bytes=0-1048575" "$url" 2>/dev/null || echo "000")

  if [[ "$cache_status" == "200" || "$cache_status" == "206" ]]; then
    ((cached++))
  fi

  ((count++))
done

logger -t "$LOG_TAG" "Preloaded $cached/$count videos into nginx cache (max=$MAX_VIDEOS)"
