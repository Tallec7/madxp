#!/usr/bin/env bash
# One-shot generation of the Neopro Firestick release keystore.
# OUT-OF-BAND: keystore is written to $HOME/.android-keystores/, NEVER inside the repo.
# Daisy runs this script ONCE per Daisy-machine. The keystore + passwords go to 1Password.
#
# WARNING: rotating this keystore = full APK reinstall on every Fire Stick (signature mismatch).
# See README §Keystore Rotation for the recovery procedure.
set -euo pipefail

KEYSTORE_DIR="${KEYSTORE_DIR:-$HOME/.android-keystores}"
KEYSTORE_FILE="${KEYSTORE_DIR}/neopro-firestick-release.keystore"
ALIAS="firestick-release"
VALIDITY_DAYS=10950   # ~30 years (Android best practice)

# Prereq: JDK 17 keytool (fail-fast — macOS stub /usr/bin/java prompts to install
# JDK at runtime, which is confusing. Check version up-front.)
if ! command -v keytool >/dev/null 2>&1; then
  echo "ERROR: keytool not found. Install JDK 17 first: brew install openjdk@17" >&2
  echo "       Then: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)" >&2
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: java not found. Install JDK 17 first: brew install openjdk@17" >&2
  exit 1
fi
JAVA_VERSION=$(java -version 2>&1 | head -1 | grep -oE '"[0-9]+\.' | head -1 | tr -d '"' | tr -d '.')
if [ "${JAVA_VERSION:-0}" -lt 17 ]; then
  echo "ERROR: JDK 17 required (found: $(java -version 2>&1 | head -1))." >&2
  echo "       Install with: brew install openjdk@17" >&2
  echo "       Then: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)" >&2
  exit 1
fi

# Guard: never overwrite an existing keystore (force explicit re-generation)
if [ -f "$KEYSTORE_FILE" ]; then
  echo "ERROR: keystore already exists at $KEYSTORE_FILE" >&2
  echo "       Refusing to overwrite. To rotate (DANGER — see README), delete it manually first:" >&2
  echo "         rm '$KEYSTORE_FILE'" >&2
  echo "       Then re-run this script." >&2
  exit 2
fi

mkdir -p "$KEYSTORE_DIR"
chmod 700 "$KEYSTORE_DIR"

echo "Generating keystore at: $KEYSTORE_FILE"
echo "  alias       : $ALIAS"
echo "  algorithm   : RSA 2048"
echo "  validity    : $VALIDITY_DAYS days (~30 years)"
echo ""
echo "You will be prompted for:"
echo "  - Keystore password (save in 1Password as BUBBLEWRAP_KEYSTORE_PASSWORD)"
echo "  - Key password (save in 1Password as BUBBLEWRAP_KEY_PASSWORD — same as keystore is OK for v4.2)"
echo ""

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -dname "CN=Neopro Firestick, OU=Kalon Partners, O=Kalon Partners, L=Brest, ST=Bretagne, C=FR"

chmod 600 "$KEYSTORE_FILE"

echo ""
echo "✓ Keystore generated: $KEYSTORE_FILE"
echo ""
echo "NEXT STEPS:"
echo "  1. Save BOTH passwords in 1Password (entry: 'Neopro Firestick Keystore')."
echo "  2. Backup the keystore file itself in 1Password as a secure attachment."
echo "  3. Export env vars before building:"
echo "       export KEYSTORE_PATH=\"$KEYSTORE_FILE\""
echo "       export BUBBLEWRAP_KEYSTORE_PASSWORD='...'"
echo "       export BUBBLEWRAP_KEY_PASSWORD='...'"
echo "  4. Run: cd firestick-apk && npm run build"
