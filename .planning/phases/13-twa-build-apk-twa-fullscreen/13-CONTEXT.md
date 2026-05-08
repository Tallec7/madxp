# Phase 13: TWA-BUILD — APK TWA fullscreen - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Mode:** Auto-decided (no interactive Q&A — directives utilisateur "no clarifying questions"). Toute décision est révisable.

<domain>
## Phase Boundary

**In scope (Phase 13)** : Construire et signer une APK Android TWA fullscreen. L'APK wrappe la page captive Pi (`http://192.168.4.1/`), suit le redirect-chain 302 wifistub → wifiredirect → racine, et affiche le dashboard Neopro en mode immersive sticky sans aucune URL bar ni barre système. La sortie de cette phase est **un fichier APK signé release-grade prêt à sideload**, pas son déploiement (Phase 14) ni son auto-launch (Phase 15).

**Out of scope (Phase 13)** : Sideload procedure (Phase 14), auto-launch wiring (Phase 15), Prometheus métrique (Phase 15), distribution OTA (v4.3+).

</domain>

<decisions>
## Implementation Decisions

### Tooling — Bubblewrap CLI (Google official)

- **Choix** : `@bubblewrap/cli` (Google) pour générer le projet Android Studio depuis un manifest TWA.
- **Pourquoi** : référence officielle TWA, maintenu par Google Chrome team, gère signature + manifest + icons + splash screen. Alternative `PWABuilder` (Microsoft) générerait du Cordova/Capacitor — over-engineered pour notre cas (1 page web wrappée).
- **Implication research** : pas besoin de creuser Cordova / Capacitor / React Native ; le scope est `bubblewrap init` + `bubblewrap build`.

### Target URL — Hardcoded `http://192.168.4.1/` (v0.1)

- **Choix** : URL cible du TWA = `http://192.168.4.1/` en dur dans le manifest.
- **Pourquoi** : la page captive du Pi tourne TOUJOURS sur cette IP en mode hotspot (DHCP fixe Pi-side, cf. `raspberry/config/nginx/neopro-base.conf`). Une APK = un Pi captif. Pas de SaaS multi-tenant à gérer en v4.2.
- **Build flavors** : pas de build flavors maintenant. Si v4.3+ introduit des Pi avec IP différente, basculer en flavors `firestick-apk-prod`/`firestick-apk-staging`.
- **HTTP autorisé** : Fire OS autorise `http://` sur réseau local — OK pour TWA. Pas besoin de TLS sur le Pi (réseau hotspot isolé, pas d'internet club).

### Fullscreen — Immersive Sticky + display=fullscreen + theme transparent

- **Choix** : `display: "fullscreen"` dans le manifest TWA + `WindowManager.LayoutParams.FLAG_FULLSCREEN` runtime + `WindowInsetsControllerCompat.setSystemBarsBehavior(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)`.
- **Pourquoi** : Fire OS respecte le manifest TWA pour cacher l'URL bar, mais la barre système (clock, network) nécessite une intent extra `IMMERSIVE_STICKY`. Configuré au niveau du `LauncherActivity.java` généré par Bubblewrap, override le default.
- **Splash screen** : utiliser le splash Bubblewrap default (icon Neopro centré sur fond noir) pour masquer le 1er paint du Player Remotion.

### Redirect chain — Bubblewrap respecte 302 nativement

- **Constat** : TWA = Chrome Custom Tab dans la coulisse, suit les 302 par design.
- **Implication** : aucune logique custom Java/Kotlin pour suivre wifistub → wifiredirect → `/?display=N`. La chain captive existante (Phase 10 v4.1) fonctionne sans modification.
- **Validation** : test smoke à écrire — taper `http://192.168.4.1/kindle-wifi/wifistub.html` depuis l'APK doit landed sur `/?display=N` final sans intermediate URL flash.

### Keystore — Out-of-band stockage initial, encryption commit en v4.3

- **Choix v4.2** : keystore `neopro-firestick-release.keystore` généré localement par Daisy, stocké dans 1Password (ou `~/.android-keystores/` sur la machine de signature). PROCÉDURE de génération + procédure de signature documentées dans `firestick-apk/README.md`.
- **Pourquoi pas commit chiffré tout de suite** : (1) flotte v4.2 = 1 site test (NLF), pas critique de centraliser ; (2) commit chiffré nécessite intégration KMS / git-crypt / SOPS — over-engineered pour MVP ; (3) la perte du keystore en v4.2 = re-générer + ré-installer 1 APK manuellement.
- **Plan futur (v4.3)** : commit `neopro-firestick-release.keystore.gpg` chiffré + GitHub secret `KEYSTORE_PASSWORD` + script `firestick-apk-sign.sh` qui décrypte au build.
- **Aliases keystore** : 1 alias `firestick-release` avec validity 30 ans (pratique standard Android).

### Repo location — `firestick-apk/` à la racine du monorepo

- **Choix** : nouveau répertoire `firestick-apk/` sibling de `raspberry/`, `central-server/`, `central-dashboard/`.
- **Pourquoi** : (1) cohérent avec l'arch monorepo Neopro (chaque tier = 1 dossier racine) ; (2) builds Android sont auto-contenus (gradle + Android SDK) — pas de couplage avec npm workspaces ; (3) facilite `.gitignore` pour `build/`, `*.keystore`, etc.
- **Contenu** : `firestick-apk/manifest/twa-manifest.json`, `firestick-apk/build/` (gitignored), `firestick-apk/scripts/build.sh`, `firestick-apk/README.md`.

### Versioning — Indépendant `firestick-apk/package.json` semver

- **Choix** : `firestick-apk` a son propre `package.json` avec version semver (`0.1.0` au démarrage). Pas couplé au cycle Neopro core (qui suit `vX.Y` milestones).
- **Pourquoi** : APK aura ses propres release notes + cycle de release (sideload manuel = rare). Coupling au monorepo créerait du bruit (chaque PR Neopro core bumperait l'APK).
- **Naming convention** : APK file = `neopro-firestick-v{semver}.apk`. Exposée par nginx Pi en `/firestick.apk` (alias symbolique vers le latest).

### Build trigger — Manual local + npm script (v4.2)

- **Choix** : `npm run build:firestick-apk` (script orchestrateur qui appelle `bubblewrap build`). Pas de CI build pour l'instant.
- **Pourquoi** : (1) flotte ≤ 5 Fire Sticks attendus en v4.2 (NLF + RACC) — rebuild rare ; (2) CI Android job = SDK ~1.5 GB + 5-10 min build = non-rentable maintenant ; (3) Bubblewrap build local fonctionne sur Mac/Linux avec Android SDK installé.
- **Plan futur (v4.3+)** : GitHub Action `build-firestick-apk` déclenchée sur tag `firestick-v*` qui produit l'APK + l'attache à la release GitHub.

### Claude's Discretion

- Choix exact du `package_id` Android (probablement `com.neopro.tv.firestick` ou `bzh.kalonpartners.neopro.firestick` — convention reverse-DNS standard).
- Détails du splash screen (durée, animation) — défauts Bubblewrap acceptables.
- Choix de l'icône APK (placeholder logo Neopro suffit pour v4.2, raffinage en v4.3).
- Min SDK / Target SDK Android (Bubblewrap default = 19/33, OK).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements

- `.planning/REQUIREMENTS.md` — TWA-01/02/03/04 (4 requirements de cette phase)
- `.planning/ROADMAP.md` — Phase 13 details (success criteria 1-3)
- `.planning/PROJECT.md` — Current Milestone v4.2 section

### Captive flow existant (target URL chain à respecter)

- `raspberry/config/nginx/neopro-base.conf` §lines 68-82 — wifistub 302 → wifiredirect 302 → `/`
- `raspberry/captive/CAPTIVE-AUTO-OTA.md` (si existe — guide OTA Phase 10 v4.1)
- `.claude/rules/raspberry.md` — invariants captive flow (DNS hijack restreint, 302 chain mandatory)

### Décisions produit antérieures

- `.planning/milestones/v4.1-ROADMAP.md` — Phase 10 CAPTIVE-AUTO (Silk auto-launch dont l'APK prend la suite)
- ADRs Fire Stick existants : `docs/adr/` (rechercher `firestick`, `captive`, `receivers` lors du research)

### TWA / Android (référence externe — researcher à creuser)

- Bubblewrap CLI : https://github.com/GoogleChromeLabs/bubblewrap
- Trusted Web Activity spec : https://developer.chrome.com/docs/android/trusted-web-activity/
- Fire OS sideload doc : Amazon Developer Console (researcher à confirmer current state)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Captive flow nginx (Phase 10)** : `raspberry/config/nginx/neopro-base.conf` — 302 chain wifistub → wifiredirect → `192.168.4.1/`. L'APK consommera cette chain telle quelle, AUCUNE modification serveur requise pour Phase 13.
- **DNS hijack** (`raspberry/config/dnsmasq.d/captive.conf` patrolling `firetvcaptiveportal.com`, `spectrum.s3.amazonaws.com`) — l'APK Bubblewrap génère un manifest avec `host` = origine du target URL ; on pointera sur `192.168.4.1` pas sur le hostname captive (différence importante).
- **Page captive Angular** (`/?display=N`) : déjà testée fullscreen-friendly via Phase 10 (Silk Browser). Aucun changement Angular requis.

### Established Patterns

- **Repo monorepo flat** : chaque tier (`raspberry/`, `central-server/`, `central-dashboard/`) = dossier racine. Pattern à appliquer pour `firestick-apk/`.
- **Smoke tests file-based** : convention Neopro = un smoke test fige les contrats observables d'un fichier (`grep` sur conf, marker check). À reproduire pour APK : smoke `smoke-firestick-apk-manifest.test.ts` qui parse `twa-manifest.json` et fige `display: fullscreen`, `start_url: http://192.168.4.1/`, etc.
- **`.gitignore` aware** : `firestick-apk/build/`, `firestick-apk/*.keystore`, `firestick-apk/*.apk` doivent être ignorés. Le seul produit committé est le manifest + le script de build.

### Integration Points

- **Aucune en Phase 13** — l'APK est un artifact standalone. Les intégrations (sideload, auto-launch, métrique) sont en Phases 14-15.
- **Future Phase 14** : nginx Pi servira `firestick.apk` depuis `/var/www/neopro/firestick.apk` (location à ajouter dans `neopro-base.conf`).

</code_context>

<specifics>
## Specific Ideas

- **Référence visuelle utilisateur final** : "TV plein écran sans aucun chrome navigateur" — c'est le critère acceptance. Si une URL bar ou status bar reste visible après build, la phase n'est pas livrée.
- **Test acceptance manuel** : installer APK v0.1 sur Fire Stick AFTSS RACC (Pi `neopro.local` connu via mémoire), connecter au hotspot, lancer manuellement l'APK depuis le launcher Fire OS — observer : (1) pas d'URL bar, (2) page Neopro `/?display=0` chargée, (3) pas de barre système visible.
- **Référence keystore convention** : `keytool -genkey -v -keystore neopro-firestick-release.keystore -alias firestick-release -keyalg RSA -keysize 2048 -validity 10950` (30 ans = pratique Android).

</specifics>

<deferred>
## Deferred Ideas

- **Distribution OTA APK depuis cloud Neopro** → Future Requirement v4.3+ (déjà noté dans REQUIREMENTS.md)
- **Auto-update APK in-place** → Future Requirement v4.3+ (déjà noté)
- **Multi-tenant TWA build flavors** → si v4.3+ Pi à IP différente, ré-évaluer build flavors
- **CI GitHub Action build APK** → v4.3+ quand la flotte > 5 Fire Sticks justifie l'investissement infra
- **Keystore commité chiffré (git-crypt / SOPS / GitHub secrets)** → v4.3+ après stabilisation procédure release manuelle
- **Splash screen / icône / branding raffiné** → v4.3+ ; v4.2 utilise les défauts Bubblewrap + logo Neopro existant

</deferred>

---

_Phase: 13-twa-build-apk-twa-fullscreen_
_Context gathered: 2026-05-08_
