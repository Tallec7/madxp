#!/usr/bin/env bash
# Idempotent post-bubblewrap-update patch:
#  1. Copy network_security_config.xml into the regenerated Android project.
#  2. Inject android:networkSecurityConfig="@xml/network_security_config" into <application>
#     ONLY if not already present (idempotent).
#  3. Verify display: "fullscreen-sticky" preserved in twa-manifest.json (paranoid guard).
#
# Run from firestick-apk/ directory (after `bubblewrap update`).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

ANDROID_MANIFEST="$ROOT/app/src/main/AndroidManifest.xml"
XML_DEST_DIR="$ROOT/app/src/main/res/xml"
XML_SRC="$ROOT/manifest/network_security_config.xml"
TWA_MANIFEST="$ROOT/twa-manifest.json"

# Guard: bubblewrap must have run first
if [ ! -f "$ANDROID_MANIFEST" ]; then
  echo "ERROR: $ANDROID_MANIFEST not found. Run 'bubblewrap update' before patching." >&2
  exit 1
fi

# Guard: display: "fullscreen-sticky" must be preserved (TWA-02)
DISPLAY=$(grep -o '"display"[^,]*' "$TWA_MANIFEST" | head -1 || true)
if ! echo "$DISPLAY" | grep -q "fullscreen-sticky"; then
  echo "ERROR: twa-manifest.json display is not 'fullscreen-sticky' (got: $DISPLAY)" >&2
  exit 1
fi

# Step 1: copy XML into res/xml/
mkdir -p "$XML_DEST_DIR"
cp "$XML_SRC" "$XML_DEST_DIR/network_security_config.xml"
echo "OK: copied network_security_config.xml -> app/src/main/res/xml/"

# Step 2: inject android:networkSecurityConfig into <application> (idempotent)
if grep -q 'android:networkSecurityConfig="@xml/network_security_config"' "$ANDROID_MANIFEST"; then
  echo "OK: networkSecurityConfig already present (idempotent skip)"
else
  # perl: insert attribute right after <application opening tag.
  # Use perl (not sed) because Bubblewrap's AndroidManifest.xml puts the next
  # attribute on a new line — `<application\n        android:foo=...` — and the
  # naive sed `<application ` (trailing space) does not match the newline.
  # `\s` matches space OR newline. macOS BSD sed has no portable way to do this.
  perl -i -pe 's|<application(\s)|<application android:networkSecurityConfig="\@xml/network_security_config"\1|' "$ANDROID_MANIFEST"
  # verify injection
  if ! grep -q 'android:networkSecurityConfig="@xml/network_security_config"' "$ANDROID_MANIFEST"; then
    echo "ERROR: failed to inject networkSecurityConfig into AndroidManifest.xml" >&2
    exit 1
  fi
  echo "OK: injected networkSecurityConfig into <application>"
fi

echo "✓ patch-android-manifest.sh complete"
