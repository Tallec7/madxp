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

## References

- `.planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md` — Bubblewrap workflow, pitfalls, sources
- `.planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md` — locked decisions (Bubblewrap, hardcoded URL, semver indépendant)
- `raspberry/config/nginx/neopro-base.conf` — captive 302 chain consumed by the APK (no changes here)
