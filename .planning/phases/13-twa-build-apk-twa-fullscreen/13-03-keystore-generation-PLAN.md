---
phase: 13-twa-build-apk-twa-fullscreen
plan: 03
type: execute
wave: 2
depends_on: [13-01]
files_modified:
  - firestick-apk/scripts/generate-keystore.sh
  - firestick-apk/README.md
autonomous: false
requirements: [TWA-04]
must_haves:
  truths:
    - "generate-keystore.sh wraps keytool with the exact alias 'firestick-release', RSA 2048, validity 10950 days"
    - 'Script is idempotent-aware: refuses to overwrite an existing keystore (forces explicit re-generation)'
    - 'README §Keystore documents step-by-step procedure + storage location + env vars (BUBBLEWRAP_KEYSTORE_PASSWORD, KEYSTORE_PATH)'
    - "smoke validates README contains 'keytool -genkey' (TWA-04 doc-based pin)"
    - 'Script never commits the keystore (writes to ~/.android-keystores/ outside repo)'
  artifacts:
    - path: 'firestick-apk/scripts/generate-keystore.sh'
      provides: 'One-shot keytool wrapper for release-grade signing key'
    - path: 'firestick-apk/README.md'
      provides: 'Keystore procedure + rotation policy (TWA-04 contract)'
  key_links:
    - from: 'firestick-apk/scripts/generate-keystore.sh'
      to: '$HOME/.android-keystores/neopro-firestick-release.keystore'
      via: 'keytool -genkey -keystore'
      pattern: 'neopro-firestick-release.keystore'
    - from: 'firestick-apk/twa-manifest.json signingKey.path = ${KEYSTORE_PATH}'
      to: 'firestick-apk/scripts/build.sh (Plan 04)'
      via: 'env var substitution at build time'
      pattern: 'KEYSTORE_PATH'
---

<objective>
Provide the keystore generation wrapper + procedural documentation so Daisy can produce `neopro-firestick-release.keystore` once, store it out-of-band (1Password / `~/.android-keystores/`), and reference it via `KEYSTORE_PATH` env var in Plan 04's build pipeline.

Purpose: TWA-04 — the APK must be signed with a stable release-grade key so v0.2 upgrades over v0.1 without forcing the bénévole to uninstall. The keystore lives outside the repo (per CONTEXT.md locked decision: "out-of-band storage, encryption commit deferred v4.3").

Why `autonomous: false`: `keytool -genkey` prompts interactively for keystore + key passwords. The user MUST run the script themselves and capture the passwords in 1Password. Claude cannot enter passwords. The plan's executable tasks (script creation + README) ARE autonomous; the human-action checkpoint validates Daisy ran the script and recorded passwords.
Output: 1 script, README §Keystore section, 1 human-action checkpoint.
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
  <name>Task 1: generate-keystore.sh wrapper (no-overwrite guard, fail-fast)</name>
  <files>
    firestick-apk/scripts/generate-keystore.sh
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Code Examples — Generate keystore + Pitfall 4 — keystore loss)
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md (Keystore decision)
    firestick-apk/twa-manifest.json (signingKey.alias must match)
  </read_first>
  <action>
    Create `firestick-apk/scripts/generate-keystore.sh` with this exact content:

    ```bash
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

    # Prereq: JDK 17 keytool
    if ! command -v keytool >/dev/null 2>&1; then
      echo "ERROR: keytool not found. Install JDK 17 (brew install openjdk@17)." >&2
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
    ```

    Then `chmod +x firestick-apk/scripts/generate-keystore.sh`.

  </action>
  <verify>
    <automated>test -x /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/generate-keystore.sh && grep -q "alias \"firestick-release\"" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/generate-keystore.sh && grep -q "VALIDITY_DAYS=10950" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/generate-keystore.sh && grep -q "RSA -keysize 2048" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/generate-keystore.sh && grep -q 'Refusing to overwrite' /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/scripts/generate-keystore.sh</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/scripts/generate-keystore.sh` exists AND is executable
    - First 5 lines contain `set -euo pipefail`
    - Script contains alias `firestick-release` (matches `twa-manifest.json` signingKey.alias)
    - Script contains `VALIDITY_DAYS=10950` (30-year validity per Android best practice)
    - Script contains `RSA -keysize 2048`
    - Script has the no-overwrite guard (`Refusing to overwrite`)
    - Script writes to `$HOME/.android-keystores/` (out-of-band, never inside repo)
    - Script chmods directory 700 + keystore file 600
  </acceptance_criteria>
  <done>Script ready for Daisy to run when she's at her keyboard. Cannot run autonomously due to interactive prompts.</done>
</task>

<task type="auto">
  <name>Task 2: README §Keystore + §Keystore Rotation sections</name>
  <files>
    firestick-apk/README.md
  </files>
  <read_first>
    firestick-apk/README.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Pitfall 4 — keystore loss recovery)
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md (Keystore decision: out-of-band v4.2, encryption commit v4.3)
  </read_first>
  <action>
    Append to `firestick-apk/README.md` (after §Cleartext HTTP, before §References) two new sections:

    ```markdown
    ## Keystore (TWA-04)

    The release keystore signs every APK with a stable identity so future versions install as upgrades, not fresh installs (Android refuses upgrades signed with a different key — `INSTALL_FAILED_UPDATE_INCOMPATIBLE`).

    **Storage policy (v4.2):** out-of-band on Daisy's machine. Encryption-at-rest commit (git-crypt / SOPS) deferred to v4.3 once the flotte exceeds 5 sites.

    **One-shot generation:**

    ```bash
    cd firestick-apk
    bash scripts/generate-keystore.sh
    # Prompts for keystore password + key password (use the SAME for v4.2 simplicity)
    # Output: $HOME/.android-keystores/neopro-firestick-release.keystore (chmod 600)
    ```

    Under the hood:

    ```bash
    keytool -genkey -v \
      -keystore "$HOME/.android-keystores/neopro-firestick-release.keystore" \
      -alias firestick-release \
      -keyalg RSA -keysize 2048 \
      -validity 10950 \
      -dname "CN=Neopro Firestick, OU=Kalon Partners, O=Kalon Partners, L=Brest, ST=Bretagne, C=FR"
    ```

    **Storage checklist (mandatory after first run):**

    1. 1Password entry "Neopro Firestick Keystore" with: keystore password, key password, file attachment of the `.keystore` itself.
    2. `chmod 600` on the keystore file (script does this automatically).
    3. Verify file is OUTSIDE the repo: `realpath $HOME/.android-keystores/*.keystore` must NOT contain `firestick-apk/`.

    **Build-time env vars (consumed by `scripts/build.sh` in Plan 04):**

    ```bash
    export KEYSTORE_PATH="$HOME/.android-keystores/neopro-firestick-release.keystore"
    export BUBBLEWRAP_KEYSTORE_PASSWORD='...'   # from 1Password
    export BUBBLEWRAP_KEY_PASSWORD='...'        # from 1Password
    ```

    The `twa-manifest.json` field `signingKey.path` uses the literal placeholder `${KEYSTORE_PATH}`. Plan 04's `build.sh` substitutes it at build time so the committed manifest has no machine-specific path.

    ## Keystore Rotation (DANGER)

    Rotating the keystore = signing v0.2+ with a different key = every Fire Stick on v0.1 must be **uninstalled then reinstalled** (no upgrade path). v4.2 has 1 test site (NLF) so rotation is recoverable; v4.3 will commit the keystore encrypted to eliminate this risk.

    **Procedure (only if keystore is lost or compromised):**

    1. Manually delete the old keystore: `rm $HOME/.android-keystores/neopro-firestick-release.keystore`
    2. Re-run `bash scripts/generate-keystore.sh` (will prompt for fresh passwords).
    3. Update 1Password entry with new passwords.
    4. Coordinate with bénévoles to: `adb uninstall bzh.kalonpartners.neopro.firestick` then `adb install` the new APK.

    **Smoke verification (post-build, automated by Plan 04):**

    ```bash
    apksigner verify --verbose firestick-apk/dist/neopro-firestick-v0.1.0.apk | grep -E 'v2.*true.*v3.*true'
    ```
    ```

  </action>
  <verify>
    <automated>grep -q "## Keystore (TWA-04)" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "keytool -genkey" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "## Keystore Rotation" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "BUBBLEWRAP_KEYSTORE_PASSWORD" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q '## Keystore (TWA-04)' firestick-apk/README.md`
    - `grep -q '## Keystore Rotation' firestick-apk/README.md`
    - `grep -q 'keytool -genkey' firestick-apk/README.md` (TWA-04 doc-based smoke pin)
    - `grep -q 'BUBBLEWRAP_KEYSTORE_PASSWORD' firestick-apk/README.md` (env var contract)
    - `grep -q 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' firestick-apk/README.md` (rotation danger documented)
    - `grep -q 'apksigner verify' firestick-apk/README.md` (smoke command discoverable)
  </acceptance_criteria>
  <done>README documents the keystore lifecycle end-to-end (generation, storage, env vars, rotation).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Daisy generates the keystore (one-shot, interactive)</name>
  <what-built>
    `firestick-apk/scripts/generate-keystore.sh` is committed and executable. The README §Keystore documents the procedure. Daisy MUST run it once on her signing machine to produce `~/.android-keystores/neopro-firestick-release.keystore`.
  </what-built>
  <how-to-verify>
    1. From the worktree, run:
       ```bash
       cd firestick-apk && bash scripts/generate-keystore.sh
       ```
    2. At the keystore password prompt: enter a strong password (12+ chars, save in 1Password under "Neopro Firestick Keystore").
    3. At the key password prompt: re-enter the same password (acceptable for v4.2 simplicity).
    4. Confirm the script printed `✓ Keystore generated: $HOME/.android-keystores/neopro-firestick-release.keystore`.
    5. Verify the file exists:
       ```bash
       ls -la "$HOME/.android-keystores/neopro-firestick-release.keystore"
       # Expect: -rw------- (chmod 600)
       ```
    6. Save in 1Password: keystore password + key password + the keystore file as a secure attachment.
    7. Export env vars in your shell profile (or load on demand for builds):
       ```bash
       export KEYSTORE_PATH="$HOME/.android-keystores/neopro-firestick-release.keystore"
       export BUBBLEWRAP_KEYSTORE_PASSWORD='<from 1Password>'
       export BUBBLEWRAP_KEY_PASSWORD='<from 1Password>'
       ```
    8. Sanity check: `keytool -list -v -keystore "$KEYSTORE_PATH" -alias firestick-release` should print `Alias name: firestick-release`, `Algorithm: RSA`, `Valid until: <2056-ish>`.
  </how-to-verify>
  <resume-signal>Type "keystore generated and saved in 1Password" or describe issues.</resume-signal>
</task>

</tasks>

<verification>
- `firestick-apk/scripts/generate-keystore.sh` exists, executable, contains alias + RSA 2048 + validity 10950.
- README §Keystore + §Keystore Rotation populated with concrete commands.
- Daisy confirms keystore exists at `$HOME/.android-keystores/` (out-of-band, never inside repo).
- `keytool -list` against the file prints the `firestick-release` alias.
</verification>

<success_criteria>

- `grep -q 'keytool -genkey' firestick-apk/README.md` (TWA-04 doc smoke pin)
- `test -x firestick-apk/scripts/generate-keystore.sh`
- Daisy has the keystore + passwords saved in 1Password (verified by checkpoint resume signal)
- `git status firestick-apk/` shows ZERO `*.keystore` file (out-of-band confirmed)
  </success_criteria>

<output>
After completion, create `.planning/phases/13-twa-build-apk-twa-fullscreen/13-03-SUMMARY.md`
</output>
