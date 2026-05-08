#!/usr/bin/env bash
# Post-build smoke: assert APK is signed v2+v3 and packageId matches twa-manifest.json.
# Usage: bash verify-apk.sh path/to/app.apk
set -euo pipefail

APK="${1:-}"
[ -n "$APK" ] || { echo "Usage: $0 <path-to-apk>" >&2; exit 1; }
[ -f "$APK" ] || { echo "ERROR: APK not found at $APK" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
EXPECTED_PACKAGE=$(jq -r '.packageId' "$ROOT/twa-manifest.json")

: "${ANDROID_HOME:?ANDROID_HOME env var required}"
APKSIGNER=$(find "$ANDROID_HOME/build-tools" -name apksigner | sort -V | tail -1)
AAPT=$(find "$ANDROID_HOME/build-tools" -name aapt | sort -V | tail -1)
[ -x "$APKSIGNER" ] || { echo "ERROR: apksigner not found." >&2; exit 1; }
[ -x "$AAPT" ] || { echo "ERROR: aapt not found." >&2; exit 1; }

echo "==> apksigner verify --verbose"
SIGN_OUT=$("$APKSIGNER" verify --verbose "$APK")
echo "$SIGN_OUT"

if ! echo "$SIGN_OUT" | grep -qE 'Verified using v2 scheme.*true'; then
  echo "ERROR: APK is NOT signed with v2 scheme (TWA-04 violation)." >&2
  exit 1
fi
if ! echo "$SIGN_OUT" | grep -qE 'Verified using v3 scheme.*true'; then
  echo "ERROR: APK is NOT signed with v3 scheme (TWA-04 violation)." >&2
  exit 1
fi
echo "OK: signed v2+v3"

echo "==> aapt dump badging"
AAPT_OUT=$("$AAPT" dump badging "$APK" | head -10)
echo "$AAPT_OUT"

if ! echo "$AAPT_OUT" | grep -q "package: name='${EXPECTED_PACKAGE}'"; then
  echo "ERROR: package name mismatch. Expected '${EXPECTED_PACKAGE}'." >&2
  exit 1
fi
echo "OK: package=${EXPECTED_PACKAGE}"

echo ""
echo "✓ verify-apk.sh: all assertions passed"
