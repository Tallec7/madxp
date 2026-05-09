---
phase: 13-twa-build-apk-twa-fullscreen
plan: 02
type: execute
wave: 2
depends_on: [13-01]
files_modified:
  - firestick-apk/manifest/network_security_config.xml
  - firestick-apk/scripts/patch-android-manifest.sh
  - firestick-apk/README.md
autonomous: true
requirements: [TWA-01, TWA-02]
must_haves:
  truths:
    - 'network_security_config.xml authorizes cleartext HTTP for 192.168.4.1 + firetvcaptiveportal.com + spectrum.s3.amazonaws.com'
    - 'patch-android-manifest.sh is idempotent (running twice = same result, no duplication)'
    - 'Patch script preserves display:fullscreen-sticky AND injects android:networkSecurityConfig=@xml/network_security_config'
    - 'smoke-firestick-apk cleartext test now passes (6/6 green)'
  artifacts:
    - path: 'firestick-apk/manifest/network_security_config.xml'
      provides: 'Restrictive cleartext allow-list (3 domains only)'
      contains: 'cleartextTrafficPermitted="true"'
    - path: 'firestick-apk/scripts/patch-android-manifest.sh'
      provides: 'Post-bubblewrap-update XML patch, idempotent'
  key_links:
    - from: 'firestick-apk/scripts/patch-android-manifest.sh'
      to: 'firestick-apk/manifest/network_security_config.xml'
      via: 'cp into app/src/main/res/xml/'
      pattern: 'manifest/network_security_config.xml'
    - from: 'smoke-firestick-apk.test.ts'
      to: 'firestick-apk/manifest/network_security_config.xml'
      via: 'fs.readFileSync + assertion contains ''cleartextTrafficPermitted="true"'''
      pattern: 'manifest/network_security_config.xml'
---

<objective>
Land the cleartext HTTP allow-list XML and the idempotent patch script that injects it post-`bubblewrap update`. This closes Pitfall 1 from the research (Android 9+ blocks cleartext by default — without this patch, the APK opens but stays blank with `ERR_CLEARTEXT_NOT_PERMITTED`).

Purpose: TWA-01 requires the APK to actually load `http://192.168.4.1/`. TWA-02 (`fullscreen-sticky`) is preserved because the patch only touches `<application>` attributes, not `display`.
Output: 2 new files + README §Cleartext section. Smoke goes 6/6 green.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-01-SUMMARY.md
@firestick-apk/twa-manifest.json
@firestick-apk/README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cleartext network_security_config.xml + idempotent patch script</name>
  <files>
    firestick-apk/manifest/network_security_config.xml
    firestick-apk/scripts/patch-android-manifest.sh
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Pitfall 1 + Pitfall 5 — patch-after-update idempotency)
    firestick-apk/twa-manifest.json
    .claude/rules/raspberry.md (DNS hijack restriction — explains the 3-domain allow-list scope)
  </read_first>
  <action>
    Create `firestick-apk/manifest/network_security_config.xml` with this exact content:

    ```xml
    <?xml version="1.0" encoding="utf-8"?>
    <!--
      Cleartext HTTP allow-list for Neopro Fire Stick TWA.
      Required because Android 9+ (API 28) blocks http:// by default.
      Scope: hotspot Pi (192.168.4.1) + Fire OS captive portal hijack targets.
      Aligned with .claude/rules/raspberry.md (DNS hijack restricted to 2 captive domains, NOT wildcard).
    -->
    <network-security-config>
      <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
          <certificates src="system" />
        </trust-anchors>
      </base-config>
      <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">192.168.4.1</domain>
        <domain includeSubdomains="false">firetvcaptiveportal.com</domain>
        <domain includeSubdomains="false">spectrum.s3.amazonaws.com</domain>
      </domain-config>
    </network-security-config>
    ```

    Create `firestick-apk/scripts/patch-android-manifest.sh` with this exact content (idempotent — safe to run multiple times after each `bubblewrap update`):

    ```bash
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
      # sed: insert attribute right after <application opening tag
      # macOS BSD sed and GNU sed compatible via -i.bak then rm
      sed -i.bak 's|<application |<application android:networkSecurityConfig="@xml/network_security_config" |' "$ANDROID_MANIFEST"
      rm -f "${ANDROID_MANIFEST}.bak"
      # verify injection
      if ! grep -q 'android:networkSecurityConfig="@xml/network_security_config"' "$ANDROID_MANIFEST"; then
        echo "ERROR: failed to inject networkSecurityConfig into AndroidManifest.xml" >&2
        exit 1
      fi
      echo "OK: injected networkSecurityConfig into <application>"
    fi

    echo "✓ patch-android-manifest.sh complete"
    ```

    Then `chmod +x firestick-apk/scripts/patch-android-manifest.sh`.

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/manifest/network_security_config.xml` exists
    - `grep -c 'cleartextTrafficPermitted="true"' firestick-apk/manifest/network_security_config.xml` equals 2 (base-config + domain-config)
    - `grep -q '192.168.4.1' firestick-apk/manifest/network_security_config.xml`
    - `grep -q 'firetvcaptiveportal.com' firestick-apk/manifest/network_security_config.xml`
    - File `firestick-apk/scripts/patch-android-manifest.sh` exists AND is executable (`test -x ...`)
    - First 5 lines of script contain `set -euo pipefail` (fail-fast)
    - Script contains the idempotency guard `if grep -q 'android:networkSecurityConfig="@xml/network_security_config"'`
    - Script contains the `fullscreen-sticky` paranoid guard
    - Smoke `smoke-firestick-apk` is now 6/6 green (the cleartext test that was RED in Plan 01 now passes)
  </acceptance_criteria>
  <done>Cleartext XML committed, patch script idempotent, smoke fully green.</done>
</task>

<task type="auto">
  <name>Task 2: Document the cleartext patch in README</name>
  <files>
    firestick-apk/README.md
  </files>
  <read_first>
    firestick-apk/README.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Pitfall 1)
  </read_first>
  <action>
    Append to `firestick-apk/README.md` (after the existing §Quick start section, before §References) a new section:

    ```markdown
    ## Cleartext HTTP — why and how

    Android 9+ (API 28) blocks `http://` by default. The Pi captive page runs on `http://192.168.4.1/` (no TLS — hotspot is a closed network without internet egress). Without a network security config patch, the APK opens but the WebView fails with `ERR_CLEARTEXT_NOT_PERMITTED`.

    Solution (committed):

    - `manifest/network_security_config.xml` — restrictive allow-list scoped to 3 domains: `192.168.4.1`, `firetvcaptiveportal.com`, `spectrum.s3.amazonaws.com`. Aligned with `.claude/rules/raspberry.md` (DNS hijack is restricted, never wildcard).
    - `scripts/patch-android-manifest.sh` — idempotent post-`bubblewrap update` patch that:
      1. Copies the XML into `app/src/main/res/xml/`.
      2. Injects `android:networkSecurityConfig="@xml/network_security_config"` into the `<application>` element of the regenerated `AndroidManifest.xml`.
      3. Verifies `display: "fullscreen-sticky"` is preserved (paranoid guard).

    Why post-`update`: Bubblewrap regenerates `AndroidManifest.xml` from `twa-manifest.json` on every `update`, wiping manual edits (Pitfall 5 in research).

    Run order (handled by `scripts/build.sh` in Plan 04):

    ```
    bubblewrap update --skipVersionUpgrade
    bash scripts/patch-android-manifest.sh
    bubblewrap build --skipPwaValidation
    ```
    ```

  </action>
  <verify>
    <automated>grep -q "Cleartext HTTP" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "patch-android-manifest.sh" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "ERR_CLEARTEXT_NOT_PERMITTED" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q '## Cleartext HTTP' firestick-apk/README.md`
    - `grep -q 'patch-android-manifest.sh' firestick-apk/README.md`
    - `grep -q 'idempotent' firestick-apk/README.md`
    - `grep -q 'fullscreen-sticky' firestick-apk/README.md`
  </acceptance_criteria>
  <done>README §Cleartext HTTP documented with the run order Plan 04 will implement.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit` => 6/6 green.
- `bash firestick-apk/scripts/patch-android-manifest.sh` run once with no `app/` present fails fast with the "Run 'bubblewrap update' before patching" error (correct).
</verification>

<success_criteria>

- All 6 smoke tests pass (TWA-01 host, TWA-01 cleartext, TWA-02 display, TWA-04 signingKey, orientation, packageId).
- Patch script is idempotent (manually inspectable: contains `if grep -q ... android:networkSecurityConfig`).
- README documents the why + run order.
  </success_criteria>

<output>
After completion, create `.planning/phases/13-twa-build-apk-twa-fullscreen/13-02-SUMMARY.md`
</output>
