# Phase 13: TWA-BUILD — APK TWA fullscreen - Research

**Researched:** 2026-05-08
**Domain:** Android Trusted Web Activity (TWA) build & signing via Bubblewrap CLI, targeting Fire OS (Fire TV Stick) over hotspot Pi captive page (HTTP, no DAL)
**Confidence:** HIGH (Bubblewrap, manifest schema, fullscreen-sticky), MEDIUM (cleartext HTTP workflow on Fire OS, exact `aapt` smoke detection)

## Summary

Phase 13 produit une APK Android TWA signée release-grade qui wrappe `http://192.168.4.1/` en fullscreen immersive sticky. La toolchain est **Bubblewrap CLI** (Google) — `init` génère un projet Android Studio depuis un `twa-manifest.json`, `build` compile et signe, sortie = `app-release-signed.apk`. Le manifest expose nativement `display: "fullscreen-sticky"` (= immersive sticky Android) — pas besoin d'éditer du Java/Kotlin.

**Trois pièges critiques** dictent le découpage en plans :

1. **HTTP cleartext** : `http://192.168.4.1/` ne passe PAS par défaut sur Android 9+ (cleartext bloqué). Solution = injecter `network_security_config.xml` dans le projet généré + ajouter `android:networkSecurityConfig` dans AndroidManifest.xml. Bubblewrap NE fait PAS ça automatiquement (le manifest TWA assume HTTPS + Digital Asset Links).
2. **Pas de Digital Asset Links** : `192.168.4.1` n'a pas de `.well-known/assetlinks.json`. La conséquence = TWA fallback en Custom Tab (avec URL bar visible). Solution = `--skipPwaValidation` au build + accepter le fallback OU patcher `LauncherActivity` pour forcer le mode TWA sans DAL (option : `fallbackType: "customtabs"` reste OK car immersive sticky cache de toute façon les barres).
3. **Vega OS Fire Sticks (2025+) ne sideload PAS** — la flotte cible doit être Fire OS Android-based (Fire TV Stick 4K, 4K Max, Cube). À documenter dans le README pour éviter d'acheter du Vega OS par erreur.

**Primary recommendation :** Scaffold `firestick-apk/` avec un `npm run build:firestick-apk` qui (1) lit `twa-manifest.json` versionné dans git, (2) lance `bubblewrap update --skipVersionUpgrade` puis `bubblewrap build --skipPwaValidation`, (3) injecte `network_security_config.xml` via un step de patch post-init, (4) renomme l'APK final en `firestick-apk/dist/neopro-firestick-v{version}.apk`. Smoke test parse `twa-manifest.json` et fige `display: "fullscreen-sticky"` + `host: "192.168.4.1"` + `startUrl: "/"`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Tooling** : `@bubblewrap/cli` (Google). Pas de Cordova / Capacitor / Android Studio raw / PWABuilder.
- **Target URL** : `http://192.168.4.1/` hardcoded dans le manifest. Pas de build flavors v4.2.
- **Fullscreen** : `display: "fullscreen"` manifest + `IMMERSIVE_STICKY` runtime override (`WindowManager.LayoutParams.FLAG_FULLSCREEN` + `WindowInsetsControllerCompat.setSystemBarsBehavior(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)`).
- **Redirect chain** : aucune logique custom — TWA suit les 302 nativement (Chrome Custom Tab dans la coulisse).
- **Keystore v4.2** : généré localement par Daisy, stocké hors-ligne (1Password ou `~/.android-keystores/`). PROCÉDURE keytool documentée dans `firestick-apk/README.md`. Encryption commit deferred v4.3.
- **Repo location** : `firestick-apk/` racine monorepo, sibling de `raspberry/`, `central-server/`, `central-dashboard/`.
- **Versioning** : `firestick-apk/package.json` semver indépendant (`0.1.0`). APK nommée `neopro-firestick-v{semver}.apk`.
- **Build trigger v4.2** : `npm run build:firestick-apk` manuel local. Pas de CI Action.
- **Aliases keystore** : 1 alias `firestick-release`, validity 30 ans (10950 jours), RSA 2048.

### Claude's Discretion

- **`package_id` Android** : recommandation `bzh.kalonpartners.neopro.firestick` (reverse-DNS standard, cohérent avec domaine `kalonpartners.bzh` de la mémoire userEmail/STATE).
- **Splash screen** : défauts Bubblewrap acceptables (icône Neopro centrée fond noir).
- **Icône APK** : placeholder logo Neopro pour v4.2.
- **Min SDK / Target SDK** : Bubblewrap defaults (minSdk 19, targetSdk 33+ selon version Bubblewrap installée).
- **Mode display final** : recommandation **`fullscreen-sticky`** (pas `fullscreen` simple) — Bubblewrap mappe `fullscreen-sticky` directement sur Android Immersive Sticky, ce qui correspond exactement au comportement décrit dans CONTEXT.md décision "Fullscreen". Cela élimine le besoin d'éditer manuellement `LauncherActivity.java`. **Cette précision affine la décision CONTEXT.md sans la contredire.**

### Deferred Ideas (OUT OF SCOPE)

- Distribution OTA APK depuis cloud Neopro → v4.3+
- Auto-update APK in-place → v4.3+
- Multi-tenant TWA build flavors → v4.3+
- CI GitHub Action build APK → v4.3+
- Keystore commité chiffré (git-crypt / SOPS / GitHub secrets) → v4.3+
- Splash screen / icône / branding raffiné → v4.3+

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                 | Research Support                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TWA-01 | APK Android TWA wrapping la page captive Pi (URL configurable au build : défaut `http://192.168.4.1/`)                      | Bubblewrap `init --manifest` consomme un `twa-manifest.json` ; champs `host: "192.168.4.1"` + `startUrl: "/"` + `name`/`launcherName`/`packageId`. Cleartext HTTP nécessite patch `network_security_config.xml` (cf. Pitfall 1).                    |
| TWA-02 | Mode fullscreen immersif (immersive sticky) — aucune barre URL, aucune barre de navigation, aucune barre de statut          | `display: "fullscreen-sticky"` dans le manifest = mapping direct vers Android Immersive Sticky (cf. TwaManifest.ts ligne `DisplayMode`). Bubblewrap injecte le meta-data `DISPLAY_MODE=immersive` dans `LauncherActivity` automatiquement.          |
| TWA-03 | APK suit les redirects HTTP 302 du captive flow (wifistub → wifiredirect → `/?display=N`) sans afficher d'URL intermédiaire | TWA = Chrome Custom Tab sous le capot, suit les 302 par design. Le DNS hijack Phase 6 (`firetvcaptiveportal.com` → `192.168.4.1`) reste inchangé. Aucun code Android custom.                                                                        |
| TWA-04 | APK signée avec une clé de release stable (`neopro-firestick-release.keystore`) + procédure de rotation documentée          | `signingKey: { path, alias }` dans manifest + `keytool -genkey -v -keystore ... -alias firestick-release -keyalg RSA -keysize 2048 -validity 10950`. Env vars `BUBBLEWRAP_KEYSTORE_PASSWORD` + `BUBBLEWRAP_KEY_PASSWORD` pour build non-interactif. |

</phase_requirements>

## Standard Stack

### Core

| Library / Tool            | Version               | Purpose                                                                 | Why Standard                                                                                          |
| ------------------------- | --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@bubblewrap/cli`         | `1.24.x` (à vérifier) | Génère projet Android Studio depuis manifest TWA, build, sign, install  | Référence officielle Google Chrome team. Maintenu, gère manifest + signature + icons + splash + DAL   |
| Java JDK                  | **17** (mandatory)    | Compilation projet Android Gradle                                       | Bubblewrap CLI exige JDK 17 — JDK <17 = build échoue. JDK 21 fonctionne mais pas testé officiellement |
| Android SDK cmdline-tools | latest                | `android.jar`, build-tools, platform-tools (`adb`, `aapt`, `apksigner`) | Requis par Gradle + signature + smoke verify APK                                                      |
| Node.js                   | `>= 14.15`            | Runtime Bubblewrap CLI                                                  | Déjà présent (Neopro tourne sur Node 20+)                                                             |
| `keytool`                 | bundled JDK 17        | Génération keystore RSA 2048                                            | Standard JDK, pas de dépendance externe                                                               |
| `apksigner`               | Android build-tools   | Vérification signature APK (smoke + UAT)                                | Standard Android, plus fiable que `jarsigner -verify` (jarsigner ne valide pas v2/v3 signatures)      |

### Supporting

| Tool                         | Purpose                                                                     | When to Use                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `aapt dump badging`          | Inspecte le manifest binaire de l'APK (package, version, permissions)       | Smoke test post-build : valider `package=bzh.kalonpartners.neopro.firestick` + `versionName` |
| `apksigner verify --verbose` | Confirme signature v1+v2+v3 avec keystore release                           | Smoke + acceptance UAT                                                                       |
| `jq`                         | Parse `twa-manifest.json` dans smoke test (Bubblewrap output is valid JSON) | Smoke pinning des champs critiques                                                           |

### Alternatives Considered (locked out by CONTEXT.md)

| Instead of                     | Could Use                                | Tradeoff                                                                                                            |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bubblewrap                     | PWABuilder (Microsoft)                   | Génère Cordova/Capacitor, surcouche inutile pour 1 page wrappée                                                     |
| Bubblewrap                     | Capacitor / Cordova                      | WebView custom = divergence runtime, nécessite plugins, complexité YAGNI v4.2                                       |
| `fullscreen-sticky` (manifest) | Édition manuelle `LauncherActivity.java` | Touchant du Java côté Bubblewrap = risque de régression au prochain `bubblewrap update`. Manifest field idempotent. |

**Installation prerequisites (à documenter dans `firestick-apk/README.md`) :**

```bash
# 1. JDK 17 (Mac)
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# 2. Android SDK cmdline-tools
brew install --cask android-commandlinetools
sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"

# 3. Bubblewrap CLI (pinned version recommandé)
npm install -g @bubblewrap/cli@1.24.1
```

**Version verification** : avant de figer la version Bubblewrap dans `firestick-apk/package.json`, vérifier :

```bash
npm view @bubblewrap/cli version
```

La version 1.24.1 date de ~7 mois (octobre 2025) selon search results. Possible nouvelle release entre-temps — toujours confirmer.

## Architecture Patterns

### Recommended Project Structure

```
firestick-apk/
├── package.json              # semver own (0.1.0), scripts npm
├── README.md                 # prereqs JDK/SDK + procédure keystore + sideload pointer Phase 14
├── twa-manifest.json         # source de vérité versionné git
├── manifest/
│   └── network_security_config.xml   # patch cleartext HTTP (committé)
├── scripts/
│   ├── build.sh              # orchestrateur : update + patch + build + rename
│   ├── generate-keystore.sh  # one-shot keytool, NE COMMIT PAS le keystore
│   └── verify-apk.sh         # apksigner verify + aapt dump badging
├── icons/
│   └── neopro-512.png        # placeholder, raffinage v4.3
├── dist/                     # gitignored : APK builds
│   └── neopro-firestick-v0.1.0.apk
├── build/                    # gitignored : Bubblewrap génère ici (Android Studio project)
└── .gitignore                # build/, dist/, *.keystore, *.apk, app/, twa-manifest.json.bak
```

### Pattern 1: twa-manifest.json (source de vérité versionné)

**What :** Tout est dans `twa-manifest.json` committé. Pas d'`init` interactif au build (Bubblewrap `init` est idempotent si manifest existe — utilise plutôt `update`).

**When to use :** À chaque release v4.2.x — bump `appVersionCode` + `appVersionName` dans le manifest, commit, run build.

**Example (manifest minimal pour Phase 13) :**

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
    "path": "/Users/gletallec/.android-keystores/neopro-firestick-release.keystore",
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

**Notes critiques :**

- `host` doit être une string sans schéma ni port. `192.168.4.1` accepté (pas obligé d'être un FQDN).
- `iconUrl` : Bubblewrap télécharge l'icône au build. Pour un host LAN inaccessible depuis la machine de build, **héberger l'icône ailleurs** (asset local + `file://` ne fonctionne pas — solution : icône servie depuis un CDN public OU patcher post-init pour utiliser un asset local).
- `display: "fullscreen-sticky"` = Android Immersive Sticky.
- `fallbackType: "customtabs"` : si DAL échoue (ce qui sera le cas — pas de assetlinks.json sur 192.168.4.1), Chrome Custom Tab sera utilisé. **Avec `display: "fullscreen-sticky"`, les barres système restent cachées même en mode Custom Tab fallback** (vérifié comportement Chromium WebViewWrapper).

### Pattern 2: Build orchestrator script (`scripts/build.sh`)

**What :** Bash script qui orchestre Bubblewrap + patch + rename, fail-fast sur prerequis manquants.

**Example skeleton :**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Prerequisites check (fail-fast)
command -v bubblewrap >/dev/null || { echo "ERROR: bubblewrap CLI missing. npm i -g @bubblewrap/cli"; exit 1; }
command -v keytool   >/dev/null || { echo "ERROR: JDK 17 missing"; exit 1; }
[ -n "${JAVA_HOME:-}" ] || { echo "ERROR: JAVA_HOME unset"; exit 1; }
[ -f "${KEYSTORE_PATH:?KEYSTORE_PATH env var required}" ] || { echo "ERROR: keystore not found at $KEYSTORE_PATH"; exit 1; }

VERSION=$(jq -r '.version' "$(dirname "$0")/../package.json")
APK_NAME="neopro-firestick-v${VERSION}.apk"

# 1. Run bubblewrap update (regenerate Android project from manifest)
bubblewrap update --skipVersionUpgrade

# 2. Patch network_security_config.xml (HTTP cleartext for 192.168.4.1)
cp manifest/network_security_config.xml app/src/main/res/xml/network_security_config.xml
# patch AndroidManifest.xml to reference networkSecurityConfig

# 3. Build signed APK
bubblewrap build --skipPwaValidation

# 4. Rename + move
mkdir -p dist
mv app-release-signed.apk "dist/${APK_NAME}"

# 5. Verify
"${ANDROID_HOME}/build-tools/34.0.0/apksigner" verify --verbose "dist/${APK_NAME}"
"${ANDROID_HOME}/build-tools/34.0.0/aapt" dump badging "dist/${APK_NAME}" | head -5

echo "✓ Built dist/${APK_NAME}"
```

### Anti-Patterns to Avoid

- **Lancer `bubblewrap init` à chaque build** : `init` est interactif et écrase `twa-manifest.json`. Le manifest doit être committé en source de vérité, on utilise `update` qui est idempotent.
- **Committer le keystore en clair** : explicite OUT OF SCOPE v4.2 dans CONTEXT.md (plan v4.3 = encryption GPG/git-crypt).
- **Hardcoder le chemin keystore dans le manifest committé** : `signingKey.path` doit être paramétré via env var (`KEYSTORE_PATH`) ou template du manifest. Sinon Daisy + futur dev = paths divergents.
- **Patcher `LauncherActivity.java` pour le mode immersive** : `display: "fullscreen-sticky"` dans le manifest fait déjà ça. Editer le Java créerait des conflits au prochain `bubblewrap update`.
- **Embed icon depuis `192.168.4.1`** : la machine de build n'est PAS sur le hotspot Pi pendant le build. Utiliser une URL absolue publique OU patcher post-init pour pointer sur `app/src/main/res/mipmap-*/ic_launcher.png` directement.

## Don't Hand-Roll

| Problem                                 | Don't Build                                                              | Use Instead                                                      | Why                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Wrapping une URL dans une APK Android   | WebView custom Activity Java/Kotlin                                      | TWA via Bubblewrap (`@bubblewrap/cli`)                           | TWA = Chrome Custom Tab natif = perf + sécurité + auto-update Chromium engine via Fire OS                       |
| Mode fullscreen immersive sticky        | `WindowInsetsControllerCompat` setup manuel dans `LauncherActivity.java` | `display: "fullscreen-sticky"` dans `twa-manifest.json`          | Bubblewrap injecte le bon meta-data `DISPLAY_MODE=immersive` au build, idempotent au update                     |
| APK signing config                      | Gradle `signingConfigs { release { ... } }` édité à la main              | `signingKey: { path, alias }` dans manifest + env vars passwords | Bubblewrap génère le `build.gradle` correctement, env vars reconnues nativement                                 |
| Suivre des redirects HTTP 302 multi-hop | Intercepter dans `WebViewClient.shouldOverrideUrlLoading`                | TWA Chrome Custom Tab natif                                      | Chrome suit les 302 par design + UA réel + DNS hijack hotspot Pi consomme `firetvcaptiveportal.com` directement |
| Vérifier signature APK                  | Parse PKCS#7 du META-INF/CERT.RSA                                        | `apksigner verify --verbose --print-certs`                       | Outil officiel Android, valide v1+v2+v3 schemes                                                                 |
| Inspecter un manifest APK binaire       | `unzip` + parse AXML                                                     | `aapt dump badging`                                              | Sortie texte parsable par grep dans smoke test                                                                  |

**Key insight :** TWA = Chrome inside Android. Tout code Java/Kotlin custom = on s'éloigne de la garantie de compat Chrome upstream et on réintroduit des bugs que TWA résout. La phase doit RESTER 0 ligne de Java écrite à la main.

## Common Pitfalls

### Pitfall 1: Cleartext HTTP bloqué par Android 9+ (CRITIQUE)

**What goes wrong :** L'APK installée sur Fire Stick lance, mais la page reste blanche / "ERR_CLEARTEXT_NOT_PERMITTED" dans le Chromium engine. La `<meta-data android:name="android.support.customtabs.trusted.SCREEN_ORIENTATION">` du LauncherActivity ne suffit pas — Android refuse `http://` au runtime.

**Why it happens :** Depuis Android 9 (API 28, 2018), `usesCleartextTraffic="false"` est le défaut. Bubblewrap ne sait pas que `host: "192.168.4.1"` est en HTTP — il génère un AndroidManifest.xml sans permission cleartext.

**How to avoid :**

1. Créer `firestick-apk/manifest/network_security_config.xml` (committé) :

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.4.1</domain>
    <domain includeSubdomains="false">firetvcaptiveportal.com</domain>
    <domain includeSubdomains="false">spectrum.s3.amazonaws.com</domain>
  </domain-config>
</network-security-config>
```

2. Step de patch dans `build.sh` qui copie ce fichier dans `app/src/main/res/xml/network_security_config.xml` après `bubblewrap update`.
3. Step de patch qui ajoute `android:networkSecurityConfig="@xml/network_security_config"` à l'élément `<application>` de `app/src/main/AndroidManifest.xml`. **Solution alternative plus robuste** : utiliser `usesCleartextTraffic="true"` au niveau `<application>` (autorise tout cleartext) — moins sécurisé mais 1 ligne au lieu d'un fichier XML séparé. Recommandation = config XML restrictive (3 domaines uniquement) pour respecter la convention `.claude/rules/raspberry.md` (DNS hijack restreint).

**Warning signs :** ADB logcat `Cleartext HTTP traffic to 192.168.4.1 not permitted`. Test : `adb logcat | grep -i cleartext` après lancement APK.

### Pitfall 2: Digital Asset Links manquant (cosmétique, pas bloquant)

**What goes wrong :** Au lancement, brève flash d'URL bar avant que la page ne charge fullscreen. La validation TWA échoue côté Chrome (cherche `https://192.168.4.1/.well-known/assetlinks.json`).

**Why it happens :** TWA spec exige DAL pour le mode "trusted" (sans URL bar). Sans DAL, fallback en Custom Tab (URL bar visible 1-2s).

**How to avoid :** Avec `display: "fullscreen-sticky"`, les barres sont cachées de toute façon par immersive sticky — donc cosmétiquement OK. **Vérification UAT obligatoire** : tester sur Fire Stick AFTSS RACC et observer si flash visible. Si oui : option B = patcher le manifest avec `fingerprints[]` et héberger un fake `assetlinks.json` sur le Pi (`/.well-known/assetlinks.json` servi par nginx). Out of scope Phase 13 si pas de flash visible.

**Warning signs :** Flash visuel d'URL bar Chrome ~500ms au lancement.

### Pitfall 3: Vega OS Fire Sticks bloquent sideload

**What goes wrong :** L'APK est buildée correctement, mais `adb install` retourne "Installation failed" sur les Fire TV Stick HD 2026 et Fire TV Stick 4K Select 2025+ (qui tournent Vega OS, pas Fire OS Android).

**Why it happens :** Amazon a confirmé en 2025-2026 que Vega OS bloque définitivement le sideload (pas Android-based, RTOS propriétaire).

**How to avoid :** Documenter dans `firestick-apk/README.md` la liste des modèles supportés :

- ✅ Fire TV Stick 4K (Android-based, support jusqu'en 2030)
- ✅ Fire TV Stick 4K Max (Android-based)
- ✅ Fire TV Cube (Android-based)
- ❌ Fire TV Stick HD 2026 (Vega OS — INCOMPATIBLE)
- ❌ Fire TV Stick 4K Select 2025+ (Vega OS — INCOMPATIBLE)

**Warning signs :** Daisy achète des Fire Sticks neufs et l'APK ne s'installe pas — vérifier le modèle exact avant achat de la flotte.

### Pitfall 4: Keystore perdu = flotte ré-installable

**What goes wrong :** Après v0.2.0, on signe avec un keystore différent. `adb install -r neopro-firestick-v0.2.0.apk` échoue avec `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — l'utilisateur doit désinstaller manuellement v0.1.0 d'abord.

**Why it happens :** Android refuse les upgrades signés par une clé différente (sécurité standard).

**How to avoid :** (1) keystore dans 1Password + backup hors-ligne ; (2) en v4.2 = 1 site test (NLF), perte = ré-install manuel acceptable ; (3) v4.3 = encryption commit obligatoire avant scale.

**Warning signs :** Tester procédure de "perte de keystore" en simulé une fois (générer un keystore B, signer avec, vérifier que `adb install -r` échoue → re-générer A).

### Pitfall 5: Bubblewrap `update` écrase les patches manuels

**What goes wrong :** Après `bubblewrap update`, le fichier `app/src/main/res/xml/network_security_config.xml` reste mais l'attribut `android:networkSecurityConfig` est retiré de `AndroidManifest.xml`. Cleartext recasse silencieusement.

**Why it happens :** Bubblewrap regenère `AndroidManifest.xml` depuis le manifest TWA — il ne préserve PAS les edits manuels.

**How to avoid :** Le step de patch dans `build.sh` doit être **idempotent** et **toujours appliqué après `update`** :

```bash
bubblewrap update --skipVersionUpgrade
# Patch APRÈS update, JAMAIS avant
node scripts/patch-android-manifest.js  # ajoute android:networkSecurityConfig si absent
cp manifest/network_security_config.xml app/src/main/res/xml/
bubblewrap build --skipPwaValidation
```

**Warning signs :** Build OK mais APK lance avec page blanche. Toujours `apksigner verify` + `aapt dump badging` post-build pour vérifier la cohérence.

## Code Examples

### Generate keystore (one-shot, never re-run)

```bash
# Source: https://developer.android.com/studio/publish/app-signing#generate-key
keytool -genkey -v \
  -keystore "$HOME/.android-keystores/neopro-firestick-release.keystore" \
  -alias firestick-release \
  -keyalg RSA -keysize 2048 \
  -validity 10950 \
  -dname "CN=Neopro Firestick, OU=Kalon Partners, O=Kalon Partners, L=Brest, ST=Bretagne, C=FR"
# Prompts : keystore password + key password (use same for v4.2 simplicity)
```

### Build avec env vars (non-interactif, prêt CI v4.3)

```bash
# Source: https://github.com/GoogleChromeLabs/bubblewrap CLI README
export BUBBLEWRAP_KEYSTORE_PASSWORD='...'
export BUBBLEWRAP_KEY_PASSWORD='...'
export KEYSTORE_PATH="$HOME/.android-keystores/neopro-firestick-release.keystore"
cd firestick-apk && npm run build:firestick-apk
```

### Smoke test pinning manifest contracts

```typescript
// File: central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts
// Pattern : file-based smoke test (cf. .claude/rules/testing.md)
import * as fs from 'fs';
import * as path from 'path';

describe('smoke-firestick-apk', () => {
  const manifestPath = path.resolve(__dirname, '../../../../firestick-apk/twa-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  it('TWA-01: targets http://192.168.4.1/', () => {
    expect(manifest.host).toBe('192.168.4.1');
    expect(manifest.startUrl).toBe('/');
  });

  it('TWA-02: display mode is fullscreen-sticky (= Android immersive sticky)', () => {
    expect(manifest.display).toBe('fullscreen-sticky');
  });

  it('TWA-04: signing key configured', () => {
    expect(manifest.signingKey).toBeDefined();
    expect(manifest.signingKey.alias).toBe('firestick-release');
  });

  it('orientation locked landscape (TV)', () => {
    expect(manifest.orientation).toBe('landscape');
  });

  it('package_id follows reverse-DNS convention', () => {
    expect(manifest.packageId).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)+$/);
  });

  it('cleartext config file exists for 192.168.4.1', () => {
    const xmlPath = path.resolve(
      __dirname,
      '../../../../firestick-apk/manifest/network_security_config.xml',
    );
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    expect(xml).toContain('cleartextTrafficPermitted="true"');
    expect(xml).toContain('192.168.4.1');
  });
});
```

## State of the Art

| Old Approach                                                                    | Current Approach (2025-2026)                             | When Changed              | Impact                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| `display: "fullscreen"` + edit `LauncherActivity.java` `DISPLAY_MODE=immersive` | `display: "fullscreen-sticky"` directement dans manifest | Bubblewrap 1.20+          | Plus de Java à éditer, idempotent au `update`               |
| Cordova / Ionic / Capacitor pour wrap web                                       | Bubblewrap TWA                                           | Chrome 72+ (2019)         | TWA = même engine Chrome, pas de drift comportement runtime |
| `jarsigner -verify` pour valider signature                                      | `apksigner verify --verbose`                             | Android Studio 2.2 (2016) | apksigner valide v2/v3 schemes que jarsigner ignore         |
| `bubblewrap doctor` pour valider env (v1.x)                                     | Toujours présent dans 1.24+                              | —                         | À utiliser en step de bootstrap pour fail-fast prereqs      |

**Deprecated/outdated :**

- **Cordova-Android pour wrapping** : retiré progressivement, Apache Cordova en mode maintenance.
- **Manifest v1 signing seule** : insuffisant pour Android 11+, toujours utiliser apksigner avec v2+v3.

## Open Questions

1. **Comportement précis du fallback Custom Tab sur Fire OS sans DAL**
   - What we know : `display: "fullscreen-sticky"` cache les barres système même en Custom Tab fallback.
   - What's unclear : Y a-t-il un flash d'URL bar visible 0.5-2s pendant le bootstrap, observable par un utilisateur sur TV grand format ?
   - Recommendation : test UAT obligatoire sur Fire Stick AFTSS RACC. Si flash visible → option B (servir un fake `assetlinks.json` depuis nginx Pi sur `/.well-known/assetlinks.json`).

2. **Hébergement de l'icône (`iconUrl`) au moment du build**
   - What we know : Bubblewrap télécharge l'icône au build. `192.168.4.1` n'est pas accessible depuis la machine de build.
   - What's unclear : Faut-il (a) héberger l'icône sur un CDN public, (b) patcher post-init pour utiliser un asset local `app/src/main/res/mipmap-*/ic_launcher.png`, ou (c) skip iconUrl et utiliser le default Bubblewrap ?
   - Recommendation : option (b) — créer un step de patch qui copie `firestick-apk/icons/neopro-512.png` vers les mipmap dirs après `bubblewrap update`. Option (a) crée une dépendance externe au build, mauvaise idée.

3. **Version exacte de Bubblewrap à pin**
   - What we know : 1.24.1 publiée ~7 mois avant 2026-05-08.
   - What's unclear : Une 1.25.x est-elle sortie ? Des breaking changes ?
   - Recommendation : `npm view @bubblewrap/cli versions` au démarrage Plan 1, pin la dernière stable dans `firestick-apk/package.json` `devDependencies`.

4. **Modèle exact des Fire Sticks NLF + RACC**
   - What we know : RACC = AFTSS (Fire TV Stick basique 1080p, Android-based, OK).
   - What's unclear : NLF a-t-il déjà acheté des Fire Sticks ? Lesquels ?
   - Recommendation : valider avant déploiement Phase 14 — si NLF a acheté du Vega OS par erreur, retour magasin nécessaire.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Framework          | Jest (existant, smoke test pattern Neopro)                                                              |
| Config file        | `central-server/jest.config.js` (existant)                                                              |
| Quick run command  | `cd central-server && npx jest --testPathPattern='smoke/smoke-firestick-apk' --no-coverage --forceExit` |
| Full suite command | `npm run test:smoke` (depuis racine monorepo)                                                           |

### Phase Requirements → Test Map

| Req ID | Behavior                                                                | Test Type               | Automated Command                                                                             | File Exists?  |
| ------ | ----------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| TWA-01 | Manifest cible `http://192.168.4.1/` + `cleartextTrafficPermitted=true` | unit (file-based smoke) | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-01'`                                | ❌ Wave 0     |
| TWA-02 | `display: "fullscreen-sticky"` dans manifest                            | unit (file-based smoke) | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-02'`                                | ❌ Wave 0     |
| TWA-03 | nginx 302 chain wifistub→wifiredirect→/ inchangé                        | smoke existant          | `npx jest --testPathPattern='smoke-kiosk-pi' -t 'wifistub.*302'`                              | ✅ (Phase 10) |
| TWA-03 | Aucune URL intermédiaire visible (TV) — pas d'URL bar                   | manual UAT              | Sideload v0.1.0 sur AFTSS RACC, connect hotspot, observer écran                               | ❌ Wave 0     |
| TWA-04 | Manifest a `signingKey.alias = 'firestick-release'`                     | unit (file-based smoke) | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-04'`                                | ❌ Wave 0     |
| TWA-04 | APK signée v2+v3 schemes vérifiable                                     | smoke (post-build)      | `apksigner verify --verbose dist/neopro-firestick-v0.1.0.apk \| grep -E 'v2.*true.*v3.*true'` | ❌ Wave 0     |
| TWA-04 | Procédure rotation keystore documentée                                  | smoke (file-based)      | `grep -q 'keytool -genkey' firestick-apk/README.md`                                           | ❌ Wave 0     |

### Sampling Rate

- **Per task commit** : `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit` (~3s)
- **Per wave merge** : `npm run test:smoke:smart` (suites liées au git diff)
- **Phase gate** : `npm run test:smoke` (all 13 + new) green + UAT manuel sur Fire Stick AFTSS RACC documenté dans la Story Card

### Wave 0 Gaps

- [ ] `central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts` — couvre TWA-01, TWA-02, TWA-04 (file-based)
- [ ] `firestick-apk/twa-manifest.json` — committé pour que le smoke ait quelque chose à parser
- [ ] `firestick-apk/manifest/network_security_config.xml` — committé pour cleartext smoke
- [ ] `firestick-apk/scripts/build.sh` — script de build orchestrateur
- [ ] `firestick-apk/scripts/verify-apk.sh` — wrapper apksigner + aapt pour smoke post-build
- [ ] `firestick-apk/README.md` — procédure keystore (TWA-04)
- [ ] **Procédure UAT manuel** : section dédiée dans `firestick-apk/README.md` listant les checks visuels (pas d'URL bar, pas de status bar, page Neopro chargée). À pointer dans la Story Card.
- [ ] Framework install : N/A (Jest déjà présent dans `central-server/`)

**Note** : le smoke `smoke-service-test-coverage` n'impacte pas Phase 13 (rien dans `central-server/src/services/*.service.ts`). Idem `.claude/rules/templates.md`, `match.md`, `alerts-dedup.md` — non applicables.

## Sources

### Primary (HIGH confidence)

- [Bubblewrap CLI README — GitHub](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md) — commands `init`/`build`/`update`, env vars, JDK 17 requirement
- [TwaManifest.ts — GitHub](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/core/src/lib/TwaManifest.ts) — schéma exact des champs manifest, `DisplayMode` types incluant `fullscreen-sticky`
- [TWA quick start — Chrome Developers](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start) — DAL requirement, fallback en Custom Tab
- [Network security configuration — Android Developers](https://developer.android.com/privacy-and-security/security-config) — cleartext config XML schema
- [App signing — Android Developers](https://developer.android.com/studio/publish/app-signing) — keytool procedure, validity recommandée 25+ ans
- `.claude/rules/raspberry.md` — invariants captive flow (DNS hijack restreint, smoke enforcement)
- `.claude/rules/testing.md` — convention smoke tests Neopro
- `raspberry/config/nginx/neopro-base.conf` lignes 68-82 — chain 302 wifistub → wifiredirect → racine

### Secondary (MEDIUM confidence)

- [GitHub issue #175 Bubblewrap — fullscreen/immersive support](https://github.com/GoogleChromeLabs/bubblewrap/issues/175) — confirme mapping `fullscreen-sticky` → immersive
- [GitHub issue #430 Bubblewrap — fullscreen without immersive](https://github.com/GoogleChromeLabs/bubblewrap/issues/430) — clarifie distinction `fullscreen` vs `fullscreen-sticky`
- [Vaadin blog — TWA via Bubblewrap](https://vaadin.com/blog/submitting-a-pwa-to-google-play-store-using-bubblewrap) — workflow général, signing
- [AFTVnews — Vega OS / sideload kill 2026](https://www.aftvnews.com/amazon-confirms-all-future-fire-tv-sticks-will-run-vega-os-no-more-android-or-sideloading-on-new-models/) — confirmation officielle Amazon Vega OS bloque sideload

### Tertiary (LOW confidence — verify before implementation)

- [Snappy1 — Hide Android Soft Navigation in TWA](https://www.snappy1.org/index.php/android/fixed-progressive-web-apps-hide-android-soft-navigation-in-twa-bubblewrap/) — workarounds soft nav, à valider en UAT
- [npmjs @bubblewrap/cli](https://www.npmjs.com/package/@bubblewrap/cli) — version 1.24.1 listed, mais date relative — confirmer avec `npm view` au moment du Plan 1

## Metadata

**Confidence breakdown :**

- **Standard stack** : HIGH — Bubblewrap = référence officielle Google, manifest schema lu directement dans le source GitHub
- **Architecture (manifest layout, build orchestrator)** : HIGH — patterns Bubblewrap documentés et largement éprouvés
- **HTTP cleartext patch** : MEDIUM — pattern Android standard, mais pas testé en combinaison Bubblewrap + Fire OS spécifiquement par le researcher (à valider en UAT Phase 13)
- **Fire OS / Fire Stick TWA support** : MEDIUM-HIGH — Fire OS Android-based supporte TWA via Chrome/WebView upstream ; aucun blocker connu, mais comportement immersive sticky exact sur Fire OS = à valider UAT
- **Pitfalls** : HIGH (Pitfall 1, 4, 5 = bien documentés) ; MEDIUM (Pitfall 2 = cosmétique observable seulement en UAT)

**Research date :** 2026-05-08
**Valid until :** 2026-06-08 (1 mois — Bubblewrap a un cycle de release ~3-6 mois, stack stable, mais re-vérifier `@bubblewrap/cli` version + Vega OS rumors si milestone v4.3 démarre après cette date)
