---
phase: 13-twa-build-apk-twa-fullscreen
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - firestick-apk/package.json
  - firestick-apk/twa-manifest.json
  - firestick-apk/.gitignore
  - firestick-apk/README.md
  - central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts
autonomous: true
requirements: [TWA-01, TWA-02, TWA-04]
must_haves:
  truths:
    - 'firestick-apk/ exists at monorepo root with own semver package.json'
    - 'twa-manifest.json declares host=192.168.4.1, startUrl=/, display=fullscreen-sticky, packageId reverse-DNS'
    - 'Smoke suite smoke-firestick-apk.test.ts runs and pins TWA-01/02/04 contracts'
    - '.gitignore prevents *.keystore, *.apk, dist/, build/ from ever being committed'
    - 'README documents the structure and points to plans 02-04 for cleartext/keystore/build'
  artifacts:
    - path: 'firestick-apk/twa-manifest.json'
      provides: 'Source of truth for Bubblewrap build (TWA-01, TWA-02, TWA-04)'
    - path: 'firestick-apk/package.json'
      provides: 'Independent semver (v0.1.0) for APK lifecycle'
    - path: 'firestick-apk/.gitignore'
      provides: 'Anti-leak for keystore + APK build artifacts'
    - path: 'central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts'
      provides: 'Contract pinning for TWA-01/02/04 (file-based smoke)'
  key_links:
    - from: 'smoke-firestick-apk.test.ts'
      to: 'firestick-apk/twa-manifest.json'
      via: 'fs.readFileSync + JSON.parse path resolution'
      pattern: 'firestick-apk/twa-manifest.json'
---

<objective>
Scaffold the `firestick-apk/` directory at the monorepo root with the source-of-truth `twa-manifest.json`, independent semver `package.json`, `.gitignore` (keystore/APK guards), README skeleton, and the Wave-0 smoke test suite that pins TWA-01/02/04 file-based contracts.

Purpose: Establish the structural foundation Plans 02-04 will fill in (cleartext patch, keystore, build orchestrator). Every downstream plan reads or modifies files inside `firestick-apk/`.
Output: 5 files committed; smoke suite in place (will pass for TWA-01/02/04 because manifest is committed in this plan, will need extension in Plan 02 for the cleartext XML assertion).
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md
@.planning/phases/13-twa-build-apk-twa-fullscreen/13-VALIDATION.md
@CLAUDE.md
@.claude/rules/testing.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave-0 smoke suite + firestick-apk skeleton (manifest, package.json, .gitignore)</name>
  <files>
    firestick-apk/package.json
    firestick-apk/twa-manifest.json
    firestick-apk/.gitignore
    central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-VALIDATION.md
    .claude/rules/testing.md
    central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts (for the file-based smoke pattern)
  </read_first>
  <behavior>
    - Test TWA-01: manifest.host === '192.168.4.1' AND manifest.startUrl === '/'
    - Test TWA-02: manifest.display === 'fullscreen-sticky'
    - Test TWA-04: manifest.signingKey is defined AND manifest.signingKey.alias === 'firestick-release'
    - Test orientation: manifest.orientation === 'landscape'
    - Test packageId reverse-DNS shape: matches /^[a-z0-9]+(\.[a-z0-9]+)+$/
    - Test cleartext XML file presence (will FAIL until Plan 02 lands the file — acceptable Wave-0 RED state)
  </behavior>
  <action>
    Create `firestick-apk/package.json` with this exact content:

    ```json
    {
      "name": "@neopro/firestick-apk",
      "version": "0.1.0",
      "description": "Neopro Fire Stick TWA APK (Trusted Web Activity wrapping http://192.168.4.1/)",
      "private": true,
      "scripts": {
        "build": "bash scripts/build.sh",
        "verify": "bash scripts/verify-apk.sh",
        "keystore:generate": "bash scripts/generate-keystore.sh"
      },
      "devDependencies": {
        "@bubblewrap/cli": "1.24.1"
      }
    }
    ```

    Create `firestick-apk/twa-manifest.json` with this exact content (note: `signingKey.path` uses `${KEYSTORE_PATH}` placeholder — Plan 04 build script substitutes via env var):

    ```json
    {
      "packageId": "bzh.kalonpartners.neopro.firestick",
      "host": "192.168.4.1",
      "name": "Neopro TV",
      "launcherName": "Neopro TV",
      "display": "fullscreen-sticky",
      "orientation": "landscape",
      "themeColor": "#000000",
      "navigationColor": "#000000",
      "backgroundColor": "#000000",
      "enableNotifications": false,
      "startUrl": "/",
      "iconUrl": "https://192.168.4.1/icon-512.png",
      "splashScreenFadeOutDuration": 300,
      "signingKey": {
        "path": "${KEYSTORE_PATH}",
        "alias": "firestick-release"
      },
      "appVersionCode": 1,
      "appVersionName": "0.1.0",
      "fallbackType": "customtabs",
      "minSdkVersion": 19,
      "fingerprints": [],
      "generatorApp": "neopro-firestick-build"
    }
    ```

    Create `firestick-apk/.gitignore` with this exact content:

    ```
    # Bubblewrap-generated Android Studio project (regenerated each build)
    build/
    app/
    .gradle/
    gradle/
    gradlew
    gradlew.bat
    build.gradle
    settings.gradle
    local.properties

    # Keystores — NEVER commit
    *.keystore
    *.jks
    .keys/

    # APK output
    dist/
    *.apk
    *.aab

    # Bubblewrap backup
    twa-manifest.json.bak

    # Node
    node_modules/
    ```

    Create `central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts` with this exact content:

    ```typescript
    /**
     * Smoke — firestick-apk TWA contracts (Phase 13)
     * File-based pin: changing twa-manifest.json without intent breaks this suite.
     * Covers TWA-01 (host + startUrl), TWA-02 (display), TWA-04 (signingKey alias).
     * Cleartext XML assertion lands in Plan 02.
     */
    import * as fs from 'fs';
    import * as path from 'path';

    const REPO_ROOT = path.resolve(__dirname, '../../../../');
    const MANIFEST = path.join(REPO_ROOT, 'firestick-apk/twa-manifest.json');
    const NETSEC_XML = path.join(REPO_ROOT, 'firestick-apk/manifest/network_security_config.xml');

    describe('smoke-firestick-apk', () => {
      let manifest: any;

      beforeAll(() => {
        expect(fs.existsSync(MANIFEST)).toBe(true);
        manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
      });

      it('TWA-01: targets http://192.168.4.1/ (host + startUrl)', () => {
        expect(manifest.host).toBe('192.168.4.1');
        expect(manifest.startUrl).toBe('/');
      });

      it('TWA-02: display mode is fullscreen-sticky (Android Immersive Sticky)', () => {
        expect(manifest.display).toBe('fullscreen-sticky');
      });

      it('TWA-04: signing key configured with firestick-release alias', () => {
        expect(manifest.signingKey).toBeDefined();
        expect(manifest.signingKey.alias).toBe('firestick-release');
      });

      it('orientation locked to landscape (TV)', () => {
        expect(manifest.orientation).toBe('landscape');
      });

      it('packageId follows reverse-DNS convention', () => {
        expect(manifest.packageId).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)+$/);
      });

      it('cleartext (TWA-01): network_security_config.xml exists with 192.168.4.1 + cleartextTrafficPermitted', () => {
        expect(fs.existsSync(NETSEC_XML)).toBe(true);
        const xml = fs.readFileSync(NETSEC_XML, 'utf-8');
        expect(xml).toContain('cleartextTrafficPermitted="true"');
        expect(xml).toContain('192.168.4.1');
      });
    });
    ```

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit -t 'TWA-01|TWA-02|TWA-04|orientation|packageId'</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/package.json` exists AND `jq -r .version firestick-apk/package.json` outputs `0.1.0`
    - File `firestick-apk/twa-manifest.json` exists AND `jq -r .display firestick-apk/twa-manifest.json` outputs `fullscreen-sticky`
    - `jq -r .host firestick-apk/twa-manifest.json` outputs `192.168.4.1`
    - `jq -r .startUrl firestick-apk/twa-manifest.json` outputs `/`
    - `jq -r .signingKey.alias firestick-apk/twa-manifest.json` outputs `firestick-release`
    - `jq -r .packageId firestick-apk/twa-manifest.json` outputs `bzh.kalonpartners.neopro.firestick`
    - File `firestick-apk/.gitignore` contains the lines `*.keystore`, `*.apk`, `dist/`, `build/`
    - File `central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts` exists
    - Tests `TWA-01`, `TWA-02`, `TWA-04`, `orientation`, `packageId` all pass (5/6 — the cleartext test will fail because Plan 02 hasn't landed XML yet; that's the expected Wave-0 RED state)
  </acceptance_criteria>
  <done>Smoke suite green for 5 tests (TWA-01, TWA-02, TWA-04, orientation, packageId). The 6th test (cleartext XML) is expected RED until Plan 02.</done>
</task>

<task type="auto">
  <name>Task 2: README skeleton with structure overview + plan pointers</name>
  <files>
    firestick-apk/README.md
  </files>
  <read_first>
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-CONTEXT.md
    .planning/phases/13-twa-build-apk-twa-fullscreen/13-RESEARCH.md (Architecture Patterns section + Pitfall 3 Vega OS list)
  </read_first>
  <action>
    Create `firestick-apk/README.md` with these sections (concrete content):

    ```markdown
    # firestick-apk — Neopro TV TWA

    Android Trusted Web Activity (TWA) wrapping `http://192.168.4.1/` (the Pi captive page) in fullscreen immersive sticky mode for Fire Stick deployments.

    **Phase ownership:** v4.2 milestone, Phase 13 (TWA-BUILD).
    **Out of scope here:** sideload procedure (Phase 14), auto-launch (Phase 15), OTA distribution (v4.3+).

    ## Structure

    | Path                                  | Purpose                                                |
    |---------------------------------------|--------------------------------------------------------|
    | `package.json`                        | Independent semver (v0.1.0). Scripts: build, verify.   |
    | `twa-manifest.json`                   | Bubblewrap source of truth (host, display, signingKey).|
    | `manifest/network_security_config.xml`| Cleartext HTTP allow-list (Plan 02).                   |
    | `scripts/build.sh`                    | Orchestrator: update + patch + build + rename (Plan 04).|
    | `scripts/generate-keystore.sh`        | One-shot keytool wrapper (Plan 03).                    |
    | `scripts/verify-apk.sh`               | apksigner + aapt post-build smoke (Plan 04).           |
    | `scripts/patch-android-manifest.sh`   | Idempotent post-update XML patch (Plan 02).            |
    | `dist/`                               | gitignored — APK output (`neopro-firestick-v{X.Y.Z}.apk`).|
    | `build/` `app/`                       | gitignored — Bubblewrap-regenerated Android project.   |

    ## Prerequisites (host machine)

    - JDK 17 (mandatory — Bubblewrap CLI fails on JDK <17). Mac: `brew install openjdk@17 && export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
    - Android SDK cmdline-tools. Mac: `brew install --cask android-commandlinetools && sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"`
    - Bubblewrap CLI: `npm install -g @bubblewrap/cli@1.24.1`

    ## Hardware compatibility

    | Model                            | Supported | Reason                              |
    |----------------------------------|-----------|-------------------------------------|
    | Fire TV Stick 4K                 | YES       | Android-based Fire OS               |
    | Fire TV Stick 4K Max             | YES       | Android-based Fire OS               |
    | Fire TV Cube                     | YES       | Android-based Fire OS               |
    | Fire TV Stick HD 2026            | NO        | Vega OS — sideload blocked          |
    | Fire TV Stick 4K Select 2025+    | NO        | Vega OS — sideload blocked          |

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
    ```

  </action>
  <verify>
    <automated>test -f /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "Fire TV Stick 4K" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "Vega OS" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md && grep -q "JDK 17" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/firestick-apk/README.md</automated>
  </verify>
  <acceptance_criteria>
    - File `firestick-apk/README.md` exists
    - `grep -c 'Fire TV Stick 4K' firestick-apk/README.md` >= 2 (table + Hardware section)
    - `grep -q 'Vega OS' firestick-apk/README.md` (Pitfall 3 documented)
    - `grep -q 'JDK 17' firestick-apk/README.md` (mandatory prereq surfaced)
    - `grep -q 'twa-manifest.json' firestick-apk/README.md` (structure table)
  </acceptance_criteria>
  <done>README skeleton committed. Plans 02-04 will append §Cleartext, §Keystore, §UAT sections.</done>
</task>

</tasks>

<verification>
- Suite `smoke-firestick-apk` runs (5 of 6 tests green; cleartext test red until Plan 02 — expected).
- `firestick-apk/` exists at monorepo root, sibling of `raspberry/`, `central-server/`, `central-dashboard/`.
- `.gitignore` blocks every keystore/APK from accidental commit.
- README documents structure + Vega OS incompatibility + JDK 17 prereq.
</verification>

<success_criteria>

- `ls firestick-apk/{package.json,twa-manifest.json,.gitignore,README.md}` all exist.
- `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit -t 'TWA-01'` passes.
- `git status --porcelain firestick-apk/` shows only the 4 new tracked files (no `*.keystore`, no `*.apk`, no `build/`, no `dist/`).
  </success_criteria>

<output>
After completion, create `.planning/phases/13-twa-build-apk-twa-fullscreen/13-01-SUMMARY.md`
</output>
