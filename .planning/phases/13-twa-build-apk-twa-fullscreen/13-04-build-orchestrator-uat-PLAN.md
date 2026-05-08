---
phase: 13-twa-build-apk-twa-fullscreen
plan: 04
type: execute
wave: 3
depends_on: [13-02, 13-03]
files_modified:
  - firestick-apk/scripts/build.sh
  - firestick-apk/scripts/verify-apk.sh
  - package.json
  - firestick-apk/README.md
autonomous: false
requirements: [TWA-01, TWA-02, TWA-03, TWA-04]
must_haves:
  truths:
    - 'build.sh fails fast if JDK 17, Android SDK, Bubblewrap, or KEYSTORE_PATH are missing'
    - 'build.sh runs: bubblewrap update -> patch-android-manifest.sh -> bubblewrap build -> rename to dist/neopro-firestick-v{version}.apk'
    - 'verify-apk.sh asserts apksigner v2+v3 schemes true AND aapt package=bzh.kalonpartners.neopro.firestick'
    - "Root package.json exposes 'build:firestick-apk' npm script delegating to firestick-apk/scripts/build.sh"
    - 'README §UAT lists the manual checklist for Fire Stick AFTSS RACC (no URL bar, no status bar, page Neopro chargee)'
    - 'After build, dist/neopro-firestick-v0.1.0.apk exists, is signed v2+v3, and the smoke verify-apk.sh exits 0'
  artifacts:
    - path: 'firestick-apk/scripts/build.sh'
      provides: 'Build orchestrator: prereqs check + update + patch + build + rename'
    - path: 'firestick-apk/scripts/verify-apk.sh'
      provides: 'Post-build smoke: apksigner verify + aapt dump badging'
    - path: 'package.json'
      provides: "Root npm script 'build:firestick-apk' for discoverability"
  key_links:
    - from: 'firestick-apk/scripts/build.sh'
      to: 'firestick-apk/scripts/patch-android-manifest.sh'
      via: 'bash invocation post-bubblewrap-update'
      pattern: 'patch-android-manifest.sh'
    - from: 'firestick-apk/scripts/build.sh'
      to: 'firestick-apk/twa-manifest.json signingKey.path'
      via: 'envsubst on KEYSTORE_PATH before bubblewrap update'
      pattern: 'KEYSTORE_PATH'
    - from: 'package.json scripts.build:firestick-apk'
      to: 'firestick-apk/scripts/build.sh'
      via: 'npm run delegation'
      pattern: 'build:firestick-apk'
---

<objective>
Wire the build pipeline end-to-end: orchestrator script (`build.sh`) chains Bubblewrap + cleartext patch + signing, post-build verifier (`verify-apk.sh`) asserts signature + package id contracts, root `package.json` exposes `npm run build:firestick-apk` for discoverability, and README §UAT documents the manual Fire Stick checklist that closes TWA-03.

Purpose: Phase 13 deliverable = a signed APK file. This plan produces it. TWA-01 + TWA-02 + TWA-04 are mechanically verifiable (smoke + apksigner). TWA-03 (no URL bar visible to end user) is fundamentally a visual-on-TV check — automated verify-apk.sh checks the proxy contracts (display + redirect-following), the human-verify checkpoint validates the actual viewing experience.

Why `autonomous: false`: requires Daisy at her keyboard with `BUBBLEWRAP_KEYSTORE_PASSWORD` exported and a Fire Stick AFTSS RACC plus Pi neopro.local for UAT.
Output: 2 scripts, 1 root package.json patch, README §UAT, signed APK in `dist/`, UAT confirmation.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-VALIDATION.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-02-SUMMARY.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-03-SUMMARY.md
@firestick-apk/twa-manifest.json
@firestick-apk/scripts/patch-android-manifest.sh
@firestick-apk/README.md
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: build.sh orchestrator (fail-fast prereqs + update + patch + build + rename)</name>
  <files>
    firestick-apk/scripts/build.sh
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Pattern 2 build orchestrator + Pitfall 5 idempotency)
    firestick-apk/twa-manifest.json
    firestick-apk/scripts/patch-android-manifest.sh
  </read_first>
  <action>
    Create `firestick-apk/scripts/build.sh` with this exact content:

    ```bash
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
    ```

    Then `chmod +x firestick-apk/scripts/build.sh`.

  </action>
  <verify>
    <automated>test -x /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh && grep -q "JDK 17" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh && grep -q "KEYSTORE_PATH" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh && grep -q "patch-android-manifest.sh" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh && grep -q "bubblewrap build --skipPwaValidation" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh && grep -q "neopro-firestick-v" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/build.sh</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/scripts/build.sh` exists AND is executable
    - First 5 lines contain `set -euo pipefail`
    - Script checks JDK >= 17 (greps for `JDK 17` and the version comparison)
    - Script fails fast on missing `KEYSTORE_PATH`, `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`, `ANDROID_HOME`
    - Script invokes `bubblewrap update --skipVersionUpgrade` BEFORE `bash patch-android-manifest.sh` BEFORE `bubblewrap build --skipPwaValidation` (correct order — Pitfall 5)
    - Script renames output to `dist/neopro-firestick-v{version}.apk` reading version from `firestick-apk/package.json`
    - Script calls `verify-apk.sh` at the end
  </acceptance_criteria>
  <done>Orchestrator script in place, fail-fast on missing prereqs, correct Bubblewrap → patch → build order.</done>
</task>

<task type="auto">
  <name>Task 2: verify-apk.sh post-build smoke (apksigner v2+v3 + aapt package id)</name>
  <files>
    firestick-apk/scripts/verify-apk.sh
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Standard Stack — apksigner + aapt)
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-VALIDATION.md (post-build smoke command)
    firestick-apk/twa-manifest.json (packageId)
  </read_first>
  <action>
    Create `firestick-apk/scripts/verify-apk.sh` with this exact content:

    ```bash
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
    ```

    Then `chmod +x firestick-apk/scripts/verify-apk.sh`.

  </action>
  <verify>
    <automated>test -x /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/verify-apk.sh && grep -q "v2 scheme" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/verify-apk.sh && grep -q "v3 scheme" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/verify-apk.sh && grep -q "aapt dump badging" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/verify-apk.sh && grep -q "EXPECTED_PACKAGE" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/verify-apk.sh</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/scripts/verify-apk.sh` exists AND is executable
    - First 5 lines contain `set -euo pipefail`
    - Script asserts `Verified using v2 scheme.*true` (greps that exact pattern)
    - Script asserts `Verified using v3 scheme.*true`
    - Script reads expected packageId from `twa-manifest.json` (no hardcoded string)
    - Script asserts `aapt dump badging` output contains `package: name='<expected>'`
    - Script exits non-zero on any assertion failure
  </acceptance_criteria>
  <done>Post-build verifier asserts TWA-04 signature contracts + packageId match.</done>
</task>

<task type="auto">
  <name>Task 3: Wire root npm script + README §UAT manual checklist</name>
  <files>
    package.json
    firestick-apk/README.md
  </files>
  <read_first>
    package.json
    firestick-apk/README.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-VALIDATION.md (Manual-Only Verifications table)
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md (acceptance test description)
  </read_first>
  <action>
    Step A: Edit root `package.json` to add a new script under `"scripts"`:

    ```json
    "build:firestick-apk": "cd firestick-apk && bash scripts/build.sh",
    ```

    Place it alphabetically near other `build:*` entries. Do NOT modify any existing script. Do NOT add any new dependency to root package.json (Bubblewrap is installed globally, not as a root devDep).

    Step B: Append to `firestick-apk/README.md` (after §Keystore Rotation, before §References) a new section:

    ```markdown
    ## Build pipeline

    Once the keystore is generated and env vars are exported (see §Keystore), build with:

    ```bash
    npm run build:firestick-apk
    ```

    Or directly:

    ```bash
    cd firestick-apk && bash scripts/build.sh
    ```

    The orchestrator runs:

    1. Prereqs check (JDK 17, Android SDK build-tools, Bubblewrap CLI, jq, envsubst, KEYSTORE_PATH).
    2. envsubst on `twa-manifest.json` to materialize `signingKey.path` from `${KEYSTORE_PATH}`.
    3. `bubblewrap update --skipVersionUpgrade` (regenerates Android Studio project).
    4. `scripts/patch-android-manifest.sh` (cleartext config injection — idempotent).
    5. `bubblewrap build --skipPwaValidation` (compiles + signs).
    6. Renames output to `dist/neopro-firestick-v{version}.apk`.
    7. `scripts/verify-apk.sh` (apksigner v2+v3 + aapt package id assertions).

    Output: `firestick-apk/dist/neopro-firestick-v0.1.0.apk` (signed, ready to sideload in Phase 14).

    ## UAT — manual acceptance on Fire Stick AFTSS RACC

    Phase 13 deliverable = "TV plein écran sans aucun chrome navigateur" (CONTEXT.md). The build pipeline cannot prove this; only a human looking at a TV can. Run this checklist before declaring the phase done.

    **Prereqs:**

    - Fire Stick AFTSS (model: Fire TV Stick 4K — Android-based, NOT Vega OS)
    - Pi `neopro.local` (RACC sandbox) running hotspot
    - Mac/Linux machine with `adb` and the freshly built APK

    **Steps:**

    1. Enable Developer Options + ADB Debugging on the Fire Stick (Settings → My Fire TV → About → click 7 times on Build → back → Developer options → ADB Debugging ON).
    2. Get the Fire Stick IP (Settings → Network → connection details).
    3. From the Mac:
       ```bash
       adb connect <fire-stick-ip>:5555
       adb install firestick-apk/dist/neopro-firestick-v0.1.0.apk
       ```
       Expect: `Success`. If `INSTALL_FAILED_*`: re-check model is NOT Vega OS.
    4. On the Fire Stick: connect to the Pi hotspot SSID (from `raspberry/config/hostapd/hostapd.conf`).
    5. From the Fire OS launcher, locate "Neopro TV" in Apps → Recent or Apps → Your Apps. Launch it.
    6. Observe the TV for 10 seconds and confirm ALL of the following:
       - [ ] No Chrome URL bar visible at the top of the screen.
       - [ ] No Android status bar (clock, network icons) visible at the top.
       - [ ] No Android navigation bar (back / home / recent) visible at the bottom.
       - [ ] The Neopro page is loaded (you see the captive portal or display content, not a blank page).
       - [ ] No `ERR_CLEARTEXT_NOT_PERMITTED` or any error message visible.
       - [ ] No flash of URL bar during the 302 redirect chain (wifistub → wifiredirect → root). Watch the first 500ms carefully.
    7. Document the result in the Story Card commit body of the phase merge:
       ```
       UAT 2026-05-XX on Fire TV Stick 4K (RACC): all 6 checks PASS / X failed.
       ```

    **If a check fails:**

    - URL bar visible → check `display: "fullscreen-sticky"` in `twa-manifest.json`. The fallback `customtabs` mode should still hide it via Immersive Sticky; if not, the `assetlinks.json` workaround (Pitfall 2) becomes necessary.
    - Blank page → `adb logcat | grep -i cleartext` to confirm Pitfall 1; if found, re-run `patch-android-manifest.sh` and rebuild.
    - Status bar / nav bar visible → `display` was likely overwritten to `fullscreen` (not `fullscreen-sticky`) — check `twa-manifest.json`.
    ```

  </action>
  <verify>
    <automated>jq -e '.scripts."build:firestick-apk"' /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/package.json && grep -q "## UAT" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "## Build pipeline" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "Fire TV Stick 4K" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md</automated>
  </verify>
  <acceptance_criteria>
    - `jq -r '.scripts."build:firestick-apk"' package.json` outputs `cd firestick-apk && bash scripts/build.sh`
    - No existing root package.json script was modified or removed (compare with `git diff package.json`)
    - `grep -q '## Build pipeline' firestick-apk/README.md`
    - `grep -q '## UAT' firestick-apk/README.md`
    - UAT checklist contains all 6 visual checks (no URL bar, no status bar, no nav bar, page loaded, no cleartext error, no URL flash)
    - `grep -q 'adb connect' firestick-apk/README.md` (sideload command discoverable for manual UAT)
  </acceptance_criteria>
  <done>Root npm script wired, README §Build pipeline + §UAT documented with concrete commands.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Daisy runs the build and validates UAT on Fire Stick</name>
  <what-built>
    Build pipeline is fully wired: `npm run build:firestick-apk` produces a signed `dist/neopro-firestick-v0.1.0.apk` and runs the post-build verifier. README §UAT documents the manual Fire Stick checklist.
  </what-built>
  <how-to-verify>
    1. Ensure env vars are exported (from §Keystore in README):
       ```bash
       export KEYSTORE_PATH="$HOME/.android-keystores/neopro-firestick-release.keystore"
       export BUBBLEWRAP_KEYSTORE_PASSWORD='<from 1Password>'
       export BUBBLEWRAP_KEY_PASSWORD='<from 1Password>'
       export ANDROID_HOME="$HOME/Library/Android/sdk"   # Mac default; adjust for Linux
       export JAVA_HOME=$(/usr/libexec/java_home -v 17)
       ```
    2. Build:
       ```bash
       npm run build:firestick-apk
       ```
       Expected output:
       - `==> bubblewrap update`
       - `==> patch-android-manifest.sh`
       - `==> bubblewrap build (signing with keystore)`
       - `==> Output: firestick-apk/dist/neopro-firestick-v0.1.0.apk`
       - `OK: signed v2+v3`
       - `OK: package=bzh.kalonpartners.neopro.firestick`
       - `✓ Build complete`
    3. Verify file:
       ```bash
       ls -la firestick-apk/dist/neopro-firestick-v0.1.0.apk
       file firestick-apk/dist/neopro-firestick-v0.1.0.apk   # should print "Java archive data (JAR)" or "Zip archive"
       ```
    4. Sideload + UAT on Fire Stick AFTSS RACC: follow the §UAT checklist in `firestick-apk/README.md` (6 visual checks).
    5. Run full smoke: `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit` — expect 6/6 green.
    6. Confirm `git status firestick-apk/dist/` shows the APK is gitignored (NOT staged).
    7. Report results in Story Card form (per CLAUDE.md convention).
  </how-to-verify>
  <resume-signal>Type "build green + UAT 6/6 passed on Fire Stick" or describe failures. If a UAT check fails, see README §UAT troubleshooting before resuming.</resume-signal>
</task>

</tasks>

<verification>
- `npm run build:firestick-apk` exits 0 and produces `firestick-apk/dist/neopro-firestick-v0.1.0.apk`.
- `bash firestick-apk/scripts/verify-apk.sh firestick-apk/dist/neopro-firestick-v0.1.0.apk` exits 0 (v2+v3 signed, packageId matches).
- `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit` => 6/6 green.
- UAT 6/6 visual checks pass on Fire Stick AFTSS RACC (Daisy confirmation).
- `git status firestick-apk/` shows ZERO `*.apk` or `*.keystore` staged (gitignore working).
</verification>

<success_criteria>

- TWA-01 satisfied: APK targets http://192.168.4.1/ (manifest + cleartext XML committed + UAT confirms page loads).
- TWA-02 satisfied: display=fullscreen-sticky in manifest + UAT confirms no status/nav/url bar visible.
- TWA-03 satisfied: TWA suit les 302 nativement (no custom code) + UAT confirms no URL flash during chain.
- TWA-04 satisfied: APK signed v2+v3 with `firestick-release` alias + README documents rotation procedure + smoke pins it.
- All 4 plan goals (must_haves.truths) verified.
  </success_criteria>

<output>
After completion, create `.planning/phases/13-twa-build-apk-twa-fullscreen/13-04-SUMMARY.md`
</output>
