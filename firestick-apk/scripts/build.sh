#!/usr/bin/env bash
# Neopro Firestick APK build orchestrator.
# Pipeline: prereqs check -> manifest envsubst -> bubblewrap update -> patch -> build -> rename -> verify.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

# ---------- Prereqs (fail-fast) ----------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found in PATH. $2" >&2; exit 1; }
}

# JDK 17 mandatory (Bubblewrap CLI requirement)
require_cmd java "Install JDK 17 (brew install openjdk@17)."
JAVA_VERSION=$(java -version 2>&1 | head -1 | grep -oE '"[0-9]+\.' | head -1 | tr -d '"' | tr -d '.')
if [ "${JAVA_VERSION:-0}" -lt 17 ]; then
  echo "ERROR: JDK 17 required (found: $(java -version 2>&1 | head -1))." >&2
  exit 1
fi

require_cmd keytool "JDK 17 missing keytool."
require_cmd jq "brew install jq"
require_cmd bubblewrap "npm install -g @bubblewrap/cli@1.24.1"
require_cmd envsubst "brew install gettext (then brew link --force gettext)"

# Android SDK build-tools
: "${ANDROID_HOME:?ANDROID_HOME env var required (e.g. \$HOME/Library/Android/sdk)}"
APKSIGNER=$(find "$ANDROID_HOME/build-tools" -name apksigner | sort -V | tail -1)
[ -x "$APKSIGNER" ] || { echo "ERROR: apksigner not found in $ANDROID_HOME/build-tools/*. Run: sdkmanager 'build-tools;34.0.0'" >&2; exit 1; }

# Keystore
: "${KEYSTORE_PATH:?KEYSTORE_PATH env var required (set by README Quick start)}"
[ -f "$KEYSTORE_PATH" ] || { echo "ERROR: keystore not found at $KEYSTORE_PATH (run scripts/generate-keystore.sh first)." >&2; exit 1; }
: "${BUBBLEWRAP_KEYSTORE_PASSWORD:?BUBBLEWRAP_KEYSTORE_PASSWORD env var required}"
: "${BUBBLEWRAP_KEY_PASSWORD:?BUBBLEWRAP_KEY_PASSWORD env var required}"

# ---------- Resolve version ----------

VERSION=$(jq -r '.version' package.json)
APK_NAME="neopro-firestick-v${VERSION}.apk"
echo "==> Building $APK_NAME"

# ---------- Substitute KEYSTORE_PATH placeholder in twa-manifest.json ----------

# The committed manifest has signingKey.path = "${KEYSTORE_PATH}".
# Bubblewrap reads the manifest as JSON, so we materialize a runtime copy with the real path.
RUNTIME_MANIFEST="$ROOT/.twa-manifest.runtime.json"
export KEYSTORE_PATH
envsubst < "$ROOT/twa-manifest.json" > "$RUNTIME_MANIFEST"

# ---------- Bubblewrap update ----------

echo "==> bubblewrap update"
bubblewrap update --skipVersionUpgrade --manifest "$RUNTIME_MANIFEST"

# ---------- Patch (cleartext + idempotent injection) ----------

echo "==> patch-android-manifest.sh"
bash "$HERE/patch-android-manifest.sh"

# ---------- Bubblewrap build ----------

echo "==> bubblewrap build (signing with keystore)"
bubblewrap build --skipPwaValidation

# ---------- Move + rename ----------

mkdir -p "$ROOT/dist"
SOURCE_APK=""
for candidate in app-release-signed.apk app/build/outputs/apk/release/app-release.apk app-release.apk; do
  if [ -f "$ROOT/$candidate" ]; then
    SOURCE_APK="$ROOT/$candidate"
    break
  fi
done
[ -n "$SOURCE_APK" ] || { echo "ERROR: signed APK not found after build (looked for app-release-signed.apk)." >&2; exit 1; }

DEST_APK="$ROOT/dist/$APK_NAME"
mv "$SOURCE_APK" "$DEST_APK"
echo "==> Output: $DEST_APK"

# ---------- Cleanup runtime manifest ----------

rm -f "$RUNTIME_MANIFEST"

# ---------- Verify ----------

bash "$HERE/verify-apk.sh" "$DEST_APK"

echo ""
echo "✓ Build complete: $DEST_APK"
