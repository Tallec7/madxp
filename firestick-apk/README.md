# firestick-apk — Neopro TV TWA

Android Trusted Web Activity (TWA) wrapping `http://192.168.4.1/` (the Pi captive page) in fullscreen immersive sticky mode for Fire Stick deployments.

**Phase ownership:** v4.2 milestone, Phase 13 (TWA-BUILD).
**Out of scope here:** sideload procedure (Phase 14), auto-launch (Phase 15), OTA distribution (v4.3+).

## Structure

| Path                                   | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `package.json`                         | Independent semver (v0.1.0). Scripts: build, verify.       |
| `twa-manifest.json`                    | Bubblewrap source of truth (host, display, signingKey).    |
| `manifest/network_security_config.xml` | Cleartext HTTP allow-list (Plan 02).                       |
| `scripts/build.sh`                     | Orchestrator: update + patch + build + rename (Plan 04).   |
| `scripts/generate-keystore.sh`         | One-shot keytool wrapper (Plan 03).                        |
| `scripts/verify-apk.sh`                | apksigner + aapt post-build smoke (Plan 04).               |
| `scripts/patch-android-manifest.sh`    | Idempotent post-update XML patch (Plan 02).                |
| `dist/`                                | gitignored — APK output (`neopro-firestick-v{X.Y.Z}.apk`). |
| `build/` `app/`                        | gitignored — Bubblewrap-regenerated Android project.       |

## Prerequisites (host machine)

- JDK 17 (mandatory — Bubblewrap CLI fails on JDK <17). Mac: `brew install openjdk@17 && export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
- Android SDK cmdline-tools. Mac: `brew install --cask android-commandlinetools && sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"`
- Bubblewrap CLI: `npm install -g @bubblewrap/cli@1.24.1`

## Hardware compatibility

| Model                         | Supported | Reason                     |
| ----------------------------- | --------- | -------------------------- |
| Fire TV Stick 4K              | YES       | Android-based Fire OS      |
| Fire TV Stick 4K Max          | YES       | Android-based Fire OS      |
| Fire TV Cube                  | YES       | Android-based Fire OS      |
| Fire TV Stick HD 2026         | NO        | Vega OS — sideload blocked |
| Fire TV Stick 4K Select 2025+ | NO        | Vega OS — sideload blocked |

## Quick start

See Plan 03 for keystore generation, Plan 02 for cleartext patch, Plan 04 for build pipeline + UAT checklist.

```bash
# Once keystore exists and env vars are set:
export KEYSTORE_PATH="$HOME/.android-keystores/neopro-firestick-release.keystore"
export BUBBLEWRAP_KEYSTORE_PASSWORD='...'
export BUBBLEWRAP_KEY_PASSWORD='...'
cd firestick-apk && npm run build
# Output: dist/neopro-firestick-v0.1.0.apk
```

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

## References

- `.planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md` — Bubblewrap workflow, pitfalls, sources
- `.planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md` — locked decisions (Bubblewrap, hardcoded URL, semver indépendant)
- `raspberry/config/nginx/neopro-base.conf` — captive 302 chain consumed by the APK (no changes here)
