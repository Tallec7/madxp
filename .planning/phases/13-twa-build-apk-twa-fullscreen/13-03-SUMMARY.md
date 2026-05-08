---
phase: 13-twa-build-apk-twa-fullscreen
plan: 03
subsystem: firestick-apk
tags: [twa, firestick, keystore, signing, security, android]
requires:
  - firestick-apk/twa-manifest.json (Plan 01) — signingKey.alias must be `firestick-release`
  - JDK 17 keytool on Daisy's signing machine
provides:
  - firestick-apk/scripts/generate-keystore.sh (one-shot keytool wrapper, no-overwrite guard)
  - firestick-apk/README.md §Keystore + §Keystore Rotation (TWA-04 contract)
  - $HOME/.android-keystores/neopro-firestick-release.keystore (out-of-band, RSA 2048, valid until 2056-04-30)
affects:
  - Plan 04 (build orchestrator) — will consume `KEYSTORE_PATH`, `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD` env vars
  - Phase 14 (sideload) — every signed APK uses this exact keystore; rotation = full Fire Stick reinstall flotte-wide
tech-stack:
  added: []
  patterns:
    - 'One-shot generation script with no-overwrite guard (refuses silent rotation)'
    - 'Out-of-band secret storage ($HOME/.android-keystores/, never inside repo)'
    - 'Env-var contract between generation script and Plan 04 build pipeline'
key-files:
  created:
    - firestick-apk/scripts/generate-keystore.sh
  modified:
    - firestick-apk/README.md (§Keystore + §Keystore Rotation appended)
  out_of_band:
    - $HOME/.android-keystores/neopro-firestick-release.keystore (NOT in repo, in 1Password passwords only)
decisions:
  - '13-03: Out-of-band storage v4.2 (1 test site NLF) — encryption-at-rest commit (git-crypt / SOPS) deferred to v4.3 once flotte > 5 sites'
  - '13-03: No-overwrite guard via `[ -f "$KEYSTORE_FILE" ] && exit 2` — refuses silent rotation, forces explicit `rm` before re-run (Pitfall 4 mitigation)'
  - '13-03: Same password accepted for keystore + key (BUBBLEWRAP_KEYSTORE_PASSWORD = BUBBLEWRAP_KEY_PASSWORD) for v4.2 simplicity — Bubblewrap supports both modes'
  - '13-03: chmod 700 on $HOME/.android-keystores + chmod 600 on .keystore (defense-in-depth, even though file is on Daisy-only macOS)'
  - '13-03: 1Password attachment of the .keystore file itself DEFERRED — Daisy accepted the risk for v4.2 (small fleet, low blast radius). Revisit at Phase 14 follow-up when flotte > 5 Fire Sticks.'
metrics:
  duration_min: 25
  tasks_completed: 3
  files_created: 1
  files_modified: 1
  completed_date: 2026-05-08
---

# Phase 13 Plan 03: Keystore Generation Summary

**One-liner:** RSA 2048 release-grade signing keystore generated out-of-band on Daisy's machine via `generate-keystore.sh` wrapper, with no-overwrite guard + README §Keystore/§Rotation procedural docs — establishes the stable signing identity that lets v0.2+ APKs install as upgrades over v0.1 without forcing `INSTALL_FAILED_UPDATE_INCOMPATIBLE` reinstalls flotte-wide.

## What shipped

Three atomic commits (Tasks 1+2 autonomous, Task 3 = human-action checkpoint resolved):

| Commit        | Type | Task | Files                                                                                                                                    |
| ------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `33df7170`    | feat | 1    | `firestick-apk/scripts/generate-keystore.sh` (new, executable, 62 lines)                                                                 |
| `6bcf09ec`    | docs | 2    | `firestick-apk/README.md` (§Keystore + §Keystore Rotation appended before §References)                                                   |
| _(no commit)_ | n/a  | 3    | Out-of-band: `$HOME/.android-keystores/neopro-firestick-release.keystore` (Daisy ran the script 2026-05-08; intentionally NOT committed) |

## Verification

### Task 1 — generate-keystore.sh wrapper

- `test -x firestick-apk/scripts/generate-keystore.sh` → executable.
- `grep "alias \"firestick-release\""` → match (aligns with `twa-manifest.json` signingKey.alias contract).
- `grep "VALIDITY_DAYS=10950"` → match (~30 years, Android best practice).
- `grep "RSA -keysize 2048"` → match.
- `grep "Refusing to overwrite"` → match (no-overwrite guard).
- Script writes to `$HOME/.android-keystores/` (out-of-band, never inside repo).
- Script chmods directory 700 + keystore file 600.

### Task 2 — README §Keystore + §Rotation

- `grep "## Keystore (TWA-04)"` → match.
- `grep "## Keystore Rotation"` → match.
- `grep "keytool -genkey"` → match (TWA-04 doc-based smoke pin).
- `grep "BUBBLEWRAP_KEYSTORE_PASSWORD"` → match (env var contract for Plan 04).
- `grep "INSTALL_FAILED_UPDATE_INCOMPATIBLE"` → match (rotation danger documented).
- `grep "apksigner verify"` → match (Plan 04 smoke command discoverable).

### Task 3 — Daisy generated keystore (2026-05-08)

- File exists: `/Users/gletallec/.android-keystores/neopro-firestick-release.keystore`
- Size: 2814 bytes
- Perms: `-rw-------` (chmod 600 ✓)
- Algorithm: RSA 2048
- Alias: `firestick-release`
- Validity: 2026-05-08 → **2056-04-30** (~30 years)
- Subject: `CN=Neopro Firestick, OU=Kalon Partners, O=Kalon Partners, L=Brest, ST=Bretagne, C=FR`
- SHA-256 fingerprint: `93:59:EB:70:F0:CF:C2:89:B9:BC:7C:4F:ED:96:17:D2:8F:8A:77:AA:F5:D0:BD:9D:ED:A0:A4:B6:57:08:6C:08`
- Passwords: BUBBLEWRAP_KEYSTORE_PASSWORD = BUBBLEWRAP_KEY_PASSWORD (same value for v4.2 simplicity), saved in 1Password under "Neopro Firestick Keystore".
- Repo hygiene: `git status firestick-apk/` shows ZERO `*.keystore` file → out-of-band confirmed.

## Decisions made

- **Storage policy (v4.2):** out-of-band on Daisy's machine, encryption-at-rest commit (git-crypt / SOPS) deferred to v4.3 once flotte > 5 sites. Documented in README §Keystore.
- **No-overwrite guard:** script `exit 2` if `$KEYSTORE_FILE` exists — forces explicit `rm` before regeneration to make the rotation cost (full flotte reinstall) impossible to trigger by accident.
- **Validity 30 years:** Android best practice (Google Play requires ≥ 25 years). Avoids future `keytool -delete + re-genkey` rotation = same cost as a compromised key.
- **Same password for keystore + key:** Bubblewrap accepts both modes; same password is simpler in 1Password and no security loss for v4.2 single-signer scenario.

## Deviations from Plan

None — plan executed exactly as written.

### Auth gates

**Task 3 was a `checkpoint:human-action` (auth gate by design)** — `keytool -genkey` is interactive (prompts for passwords). The plan correctly marked Task 3 as `autonomous: false`. Daisy resolved it on 2026-05-08:

1. Installed JDK 17 via `brew install openjdk@17` + symlink to `/Library/Java/JavaVirtualMachines/openjdk-17.jdk` (was missing on her macOS — see Follow-up #1 below).
2. Ran `bash firestick-apk/scripts/generate-keystore.sh` from the worktree.
3. Saved both passwords in 1Password.
4. Reported "keystore generated and saved in 1Password".

This is normal flow, not a deviation.

## Follow-ups

### 1. Add JDK 17 fail-fast to `generate-keystore.sh` (cheap, prevents Phase 14 confusion)

**Found during:** Task 3 execution.
**Issue:** Daisy's macOS had no JDK installed when she first ran the script. The script does check `command -v keytool` (good), but macOS ships a stub at `/usr/bin/java` that prompts the user to install Java via a system dialog before failing — this is confusing UX (looks like the script is hanging). Plan 04's `build.sh` will likely add a JDK 17 fail-fast (since `bubblewrap build` also needs JDK 17); the same prereq check belongs in `generate-keystore.sh` for symmetry and to spare the next Daisy/contributor 5 minutes of head-scratching.
**Suggested fix (for Plan 04 author or follow-up PR):** add at the top of `generate-keystore.sh`:

```bash
# Prereq: JDK 17 (macOS ships a stub that triggers a system dialog instead of a clean error)
if ! /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  echo "ERROR: JDK 17 not found. Install with: brew install openjdk@17" >&2
  echo "       Then symlink: sudo ln -sfn \$(brew --prefix openjdk@17)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk" >&2
  exit 3
fi
```

**Status:** Not blocking for v4.2. Logged here so Plan 04 author considers harmonizing the prereq check across both scripts.

### 2. 1Password attachment of the .keystore file itself (deferred)

**Decision (2026-05-08):** Daisy accepted the risk for v4.2 — only the passwords are in 1Password, the `.keystore` file itself is NOT attached. With 1 test site (NLF) and no production flotte yet, keystore loss = re-generate + re-sideload on 1 Fire Stick. Acceptable.
**Trigger to revisit:** flotte > 5 Fire Sticks OR first non-Daisy contributor needing to sign a release. At that point either attach the .keystore to 1Password OR commit it encrypted (git-crypt / SOPS) per the v4.3 plan documented in README §Keystore.
**Logged at:** Phase 14 follow-up (sideload) when flotte adoption is measurable.

## Deferred Issues

None.

## Next

Plan 04 (`13-04-build-orchestrator-uat`) — build.sh + verify-apk + UAT. It will:

1. Read `$KEYSTORE_PATH`, `$BUBBLEWRAP_KEYSTORE_PASSWORD`, `$BUBBLEWRAP_KEY_PASSWORD` from env (set per the README §Keystore checklist).
2. Run `bubblewrap update --skipVersionUpgrade`.
3. Run `bash scripts/patch-android-manifest.sh` (Plan 02 output).
4. Run `bubblewrap build --skipPwaValidation`.
5. Rename APK to `dist/neopro-firestick-v0.1.0.apk`.
6. Run `apksigner verify --verbose` (smoke for v2 + v3 signatures both true).
7. UAT on physical Fire Stick AFTSS (manual step, captured as checkpoint).

## Self-Check: PASSED

- `firestick-apk/scripts/generate-keystore.sh` — exists, executable (verified `test -x`).
- `firestick-apk/README.md` — contains `## Keystore (TWA-04)` + `## Keystore Rotation` + `keytool -genkey` + `BUBBLEWRAP_KEYSTORE_PASSWORD` + `INSTALL_FAILED_UPDATE_INCOMPATIBLE` + `apksigner verify` (all greps match).
- Commit `33df7170` (feat 13-03 generate-keystore.sh) — found in `git log`.
- Commit `6bcf09ec` (docs 13-03 README §Keystore + §Rotation) — found in `git log`.
- `$HOME/.android-keystores/neopro-firestick-release.keystore` — exists, 2814 bytes, perms 0600 (verified via `ls -la`).
- `git status firestick-apk/` — no `*.keystore` file (out-of-band confirmed, repo hygiene preserved).
- TWA-04 contract satisfied: keystore generated, alias matches `twa-manifest.json` signingKey.alias, env-var contract documented for Plan 04 consumption.
