## [2.13.7](https://github.com/Tallec7/neopro/compare/v2.13.6...v2.13.7) (2026-01-08)

### Bug Fixes

- **sync-agent:** use available memory instead of used for accurate RAM metrics ([fadbb56](https://github.com/Tallec7/neopro/commit/fadbb567a8fb5a0e5465fe4d5722841bba4ed278))

## [2.13.6](https://github.com/Tallec7/neopro/compare/v2.13.5...v2.13.6) (2026-01-08)

### Bug Fixes

- **sync-agent:** add try/catch and logging to startVideoWatcher ([d543ef0](https://github.com/Tallec7/neopro/commit/d543ef09571aa55aa2c70557d56843657457d064))

## [2.13.5](https://github.com/Tallec7/neopro/compare/v2.13.4...v2.13.5) (2026-01-08)

### Bug Fixes

- **sync-agent:** use polling instead of recursive fs.watch on Linux ([fa4681e](https://github.com/Tallec7/neopro/commit/fa4681ee78eb93f3f14720ea33b4f4bc702e3347))

## [2.13.4](https://github.com/Tallec7/neopro/compare/v2.13.3...v2.13.4) (2026-01-08)

### Bug Fixes

- sync ([d6b143a](https://github.com/Tallec7/neopro/commit/d6b143a68f94b1d1299d48b92a1c4d4d6d3a680d))

## [2.13.3](https://github.com/Tallec7/neopro/compare/v2.13.2...v2.13.3) (2026-01-08)

### Bug Fixes

- **rate-limit:** apply per-route rate limits to prevent 429 errors ([867318d](https://github.com/Tallec7/neopro/commit/867318dc17625b2248c3f216fd85a26011d8fe4a))

## [2.13.2](https://github.com/Tallec7/neopro/compare/v2.13.1...v2.13.2) (2026-01-08)

### Bug Fixes

- **remote-shell:** allow super_admin to access any path ([95bf2a7](https://github.com/Tallec7/neopro/commit/95bf2a7ac77fb70536eee0548bbde11a54039bfa))

## [2.13.1](https://github.com/Tallec7/neopro/compare/v2.13.0...v2.13.1) (2026-01-08)

### Bug Fixes

- **remote-shell:** allow /dev/null redirection in security blacklist ([56ba965](https://github.com/Tallec7/neopro/commit/56ba965b7547e98ffb5f79c8409002187e903ed2))

# [2.13.0](https://github.com/Tallec7/neopro/compare/v2.12.2...v2.13.0) (2026-01-08)

### Features

- **remote-shell:** allow rm -rf on safe paths for super_admin ([544f968](https://github.com/Tallec7/neopro/commit/544f96831a50c69aae0ba048aff77cb4222f9a89))

## [2.12.2](https://github.com/Tallec7/neopro/compare/v2.12.1...v2.12.2) (2026-01-08)

### Bug Fixes

- **remote-shell:** use WebSocket for command results to avoid Gateway timeout ([e5f7171](https://github.com/Tallec7/neopro/commit/e5f71718285e567444f400ef314494512d30e137))

## [2.12.1](https://github.com/Tallec7/neopro/compare/v2.12.0...v2.12.1) (2026-01-08)

### Bug Fixes

- **deploy:** preserve sync-agent config during SSH deployments ([80a1ec3](https://github.com/Tallec7/neopro/commit/80a1ec3d61fa2f9d5a9d378d4993697f6f602c6e))

# [2.12.0](https://github.com/Tallec7/neopro/compare/v2.11.7...v2.12.0) (2026-01-08)

### Features

- **remote-shell:** add remote shell command support ([94fa09c](https://github.com/Tallec7/neopro/commit/94fa09cb7cf7f2cc4589028d3d17e66660344f51))

## [2.11.7](https://github.com/Tallec7/neopro/compare/v2.11.6...v2.11.7) (2026-01-08)

### Bug Fixes

- **socket:** add periodic DB/WebSocket status sync to fix zombie sites ([46ca20e](https://github.com/Tallec7/neopro/commit/46ca20ebd88556a532610ad44dcef8a15cd8b86d))

## [2.11.6](https://github.com/Tallec7/neopro/compare/v2.11.5...v2.11.6) (2026-01-08)

### Bug Fixes

- **socket:** detect and handle zombie connections ([b731f89](https://github.com/Tallec7/neopro/commit/b731f8912029d3043cc921eff597e69fca7e8d85))

## [2.11.5](https://github.com/Tallec7/neopro/compare/v2.11.4...v2.11.5) (2026-01-08)

### Performance Improvements

- **memory:** optimize for Railway Hobby plan constraints ([5371d8f](https://github.com/Tallec7/neopro/commit/5371d8f28e27cfa5d487ed217d1bdd73512ec9a3))

## [2.11.4](https://github.com/Tallec7/neopro/compare/v2.11.3...v2.11.4) (2026-01-08)

### Performance Improvements

- **memory:** adjust thresholds for Railway Hobby plan ([2d00421](https://github.com/Tallec7/neopro/commit/2d00421bbbfc671ca8241728968f88cbddce8d6e))

## [2.11.3](https://github.com/Tallec7/neopro/compare/v2.11.2...v2.11.3) (2026-01-08)

### Bug Fixes

- **memory:** optimize memory usage for Railway Hobby plan ([60a10a9](https://github.com/Tallec7/neopro/commit/60a10a9bf70e105c99d1845bc08803d64c78f57e))

## [2.11.2](https://github.com/Tallec7/neopro/compare/v2.11.1...v2.11.2) (2026-01-08)

### Bug Fixes

- **audit:** add REMOTE_SHELL audit action types ([732b132](https://github.com/Tallec7/neopro/commit/732b132e05e6fe40a737bc1c6131e8c3b980a666))

## [2.11.1](https://github.com/Tallec7/neopro/compare/v2.11.0...v2.11.1) (2026-01-08)

### Bug Fixes

- **command-executor:** fix TypeScript compilation errors ([2670d11](https://github.com/Tallec7/neopro/commit/2670d11abbd961eca8f21d6156b149d42a044734))

# [2.11.0](https://github.com/Tallec7/neopro/compare/v2.10.5...v2.11.0) (2026-01-08)

### Features

- **debug:** add remote shell terminal for Pi debugging ([dd16146](https://github.com/Tallec7/neopro/commit/dd161467170eb22b4e0cfc484a49811fcab39409))

## [2.10.5](https://github.com/Tallec7/neopro/compare/v2.10.4...v2.10.5) (2026-01-08)

### Bug Fixes

- **central-server:** resolve memory leaks causing 503 errors ([d763ff2](https://github.com/Tallec7/neopro/commit/d763ff2129d6c3be4817e01e73e81964f84a5320))

## [2.10.4](https://github.com/Tallec7/neopro/compare/v2.10.3...v2.10.4) (2026-01-08)

### Bug Fixes

- **raspberry:** add fix_permissions command and preserve permissions after update ([ee8802b](https://github.com/Tallec7/neopro/commit/ee8802b9a84d522fbd29f6239abd52fc39fa8d88))

## [2.10.3](https://github.com/Tallec7/neopro/compare/v2.10.2...v2.10.3) (2026-01-08)

### Bug Fixes

- **raspberry:** remove dead code referencing webapp/videos ([273de1a](https://github.com/Tallec7/neopro/commit/273de1adf254890568b9d69a30e828be8e526ad5))

## [2.10.2](https://github.com/Tallec7/neopro/compare/v2.10.1...v2.10.2) (2026-01-08)

### Bug Fixes

- **sync-agent:** include deploymentId in update_progress events ([35bcd3e](https://github.com/Tallec7/neopro/commit/35bcd3e001a5c58bb20e62ca540918868ece8a93))

## [2.10.1](https://github.com/Tallec7/neopro/compare/v2.10.0...v2.10.1) (2026-01-08)

### Bug Fixes

- **sync-agent:** include deploymentId in update_progress events ([1c25454](https://github.com/Tallec7/neopro/commit/1c254547759bb37e44031fcc648294072a8c81f7))

# [2.10.0](https://github.com/Tallec7/neopro/compare/v2.9.0...v2.10.0) (2026-01-08)

### Features

- **dashboard:** add real-time deployment feedback via Socket.IO ([801f261](https://github.com/Tallec7/neopro/commit/801f26111b4494cfa761734a40b5bf5366781d0f))

# [2.9.0](https://github.com/Tallec7/neopro/compare/v2.8.5...v2.9.0) (2026-01-08)

### Features

- **tv:** implement double-buffer video system for seamless loop transitions ([#340](https://github.com/Tallec7/neopro/issues/340)) ([240e060](https://github.com/Tallec7/neopro/commit/240e0606c1c5642fb1fb0e4ac085d0a22f2fc632))

## [2.8.5](https://github.com/Tallec7/neopro/compare/v2.8.4...v2.8.5) (2026-01-08)

### Bug Fixes

- **sync-agent:** config deployment now properly notifies local app and supports replace mode ([ce6eb57](https://github.com/Tallec7/neopro/commit/ce6eb57ac99e3d4e819e40fbac6f5bc3d5d0eb6c))

## [2.8.4](https://github.com/Tallec7/neopro/compare/v2.8.3...v2.8.4) (2026-01-08)

### Bug Fixes

- **config:** use FTP IP address instead of hostname ([1e2c75c](https://github.com/Tallec7/neopro/commit/1e2c75c26fdaa1fc86659d7ead1fa42582668610))

## [2.8.3](https://github.com/Tallec7/neopro/compare/v2.8.2...v2.8.3) (2026-01-07)

### Bug Fixes

- **dashboard:** restore config button now deploys directly ([#338](https://github.com/Tallec7/neopro/issues/338)) ([3d32ec3](https://github.com/Tallec7/neopro/commit/3d32ec3504cc2a0fef101dd30e8c207b6e134bbe))

## [2.8.2](https://github.com/Tallec7/neopro/compare/v2.8.1...v2.8.2) (2026-01-07)

### Bug Fixes

- **auth:** use SHA256 instead of bcrypt for site API keys ([2ee564d](https://github.com/Tallec7/neopro/commit/2ee564d250fc057cd01b047efa40214e9d50551f))

## [2.8.1](https://github.com/Tallec7/neopro/compare/v2.8.0...v2.8.1) (2026-01-07)

### Bug Fixes

- **api:** fix FTP test route ordering and add package URL diagnostic ([e2044cc](https://github.com/Tallec7/neopro/commit/e2044cc27012af3ced651c95e24f728e075c86ea))

# [2.8.0](https://github.com/Tallec7/neopro/compare/v2.7.3...v2.8.0) (2026-01-07)

### Features

- **updates:** add FTP diagnostic endpoint for software updates ([a7af366](https://github.com/Tallec7/neopro/commit/a7af3664ea60d69658d13330126836ef47d18fec))

## [2.7.3](https://github.com/Tallec7/neopro/compare/v2.7.2...v2.7.3) (2026-01-07)

### Bug Fixes

- **updates:** use commandQueueService for update deployments like update_config ([4832e4f](https://github.com/Tallec7/neopro/commit/4832e4f931165537dd5986428a947bbd4035fd25))

## [2.7.2](https://github.com/Tallec7/neopro/compare/v2.7.1...v2.7.2) (2026-01-07)

### Bug Fixes

- **updates:** add debug logging and endpoint for Socket.IO connection state ([b0962c0](https://github.com/Tallec7/neopro/commit/b0962c092c4e30d6e8e4d643d2602d3ec2fa7006))

## [2.7.1](https://github.com/Tallec7/neopro/compare/v2.7.0...v2.7.1) (2026-01-07)

### Bug Fixes

- **i18n:** replace hardcoded French text with translation keys ([79adc6e](https://github.com/Tallec7/neopro/commit/79adc6edc381981089f5f5429824d55c0ee870d5))

# [2.7.0](https://github.com/Tallec7/neopro/compare/v2.6.1...v2.7.0) (2026-01-07)

### Features

- **dashboard:** add 'Refresh from Pi' button to Content tab ([0e24a86](https://github.com/Tallec7/neopro/commit/0e24a864154600322d0ad9c4b7288d3b72a08600))

## [2.6.1](https://github.com/Tallec7/neopro/compare/v2.6.0...v2.6.1) (2026-01-07)

### Bug Fixes

- **api:** normalize config before diff comparison to avoid false positives ([97a1028](https://github.com/Tallec7/neopro/commit/97a1028ed1a1a83fb32dce2b586ba767b968bd1a))

# [2.6.0](https://github.com/Tallec7/neopro/compare/v2.5.0...v2.6.0) (2026-01-07)

### Features

- **dashboard:** add expandable details to config diff items ([0f886e0](https://github.com/Tallec7/neopro/commit/0f886e0aa083925abaa74dad580bfe3df8961e4c))

# [2.5.0](https://github.com/Tallec7/neopro/compare/v2.4.0...v2.5.0) (2026-01-07)

### Features

- **dashboard:** improve config diff display with human-readable labels ([ed886cd](https://github.com/Tallec7/neopro/commit/ed886cdeb7d0aebe0fc16b5e1f11a5402b0c338a))

# [2.4.0](https://github.com/Tallec7/neopro/compare/v2.3.5...v2.4.0) (2026-01-07)

### Features

- **dashboard:** restore missing features from config editor refactoring ([97ceb1c](https://github.com/Tallec7/neopro/commit/97ceb1c7e00d565e20deef97b7bbbd882fbd042c))

## [2.3.5](https://github.com/Tallec7/neopro/compare/v2.3.4...v2.3.5) (2026-01-07)

### Bug Fixes

- **config:** preserve video owner/locked fields and fix category merge ([36ceb0b](https://github.com/Tallec7/neopro/commit/36ceb0b247b589b30707416841244966eefbb989))

## [2.3.4](https://github.com/Tallec7/neopro/compare/v2.3.3...v2.3.4) (2026-01-07)

### Bug Fixes

- **config:** restore diff preview modal and fix config deployment ([3285724](https://github.com/Tallec7/neopro/commit/3285724b52140ad99c11311239fe417d31f83e63))

## [2.3.3](https://github.com/Tallec7/neopro/compare/v2.3.2...v2.3.3) (2026-01-07)

### Bug Fixes

- **auth:** separate rate limits for login vs session check ([19badc3](https://github.com/Tallec7/neopro/commit/19badc33f5e6b89d69cb17270a9b55e34777eefa))

## [2.3.2](https://github.com/Tallec7/neopro/compare/v2.3.1...v2.3.2) (2026-01-07)

### Bug Fixes

- **logs:** skip backend logging when user is not authenticated ([b66860b](https://github.com/Tallec7/neopro/commit/b66860bc9c4f6fa0845306cb80439201d4504d2c))

## [2.3.1](https://github.com/Tallec7/neopro/compare/v2.3.0...v2.3.1) (2026-01-07)

### Bug Fixes

- **logs:** prevent infinite loop on frontend log rate limiting ([3f326e8](https://github.com/Tallec7/neopro/commit/3f326e840849ac90b22b145e9c9c06633293ebcb))

# [2.3.0](https://github.com/Tallec7/neopro/compare/v2.2.0...v2.3.0) (2026-01-06)

### Features

- **dashboard:** refactor site-detail with tabs, N videos per phase, subcategory mapping ([cc45214](https://github.com/Tallec7/neopro/commit/cc4521454cab904de865b6b428cc3fa756d98815))

# [2.2.0](https://github.com/Tallec7/neopro/compare/v2.1.3...v2.2.0) (2026-01-06)

### Features

- **dashboard:** add centralized error handling system ([f5aa854](https://github.com/Tallec7/neopro/commit/f5aa85428fc9c269029e74ac1bbea5e8dc43693a))

## [2.1.3](https://github.com/Tallec7/neopro/compare/v2.1.2...v2.1.3) (2026-01-06)

### Bug Fixes

- **cors:** allow X-Correlation-ID header in preflight requests ([5499083](https://github.com/Tallec7/neopro/commit/549908342c90968c9c9788dcda331eb63eb7dca8))

## [2.1.2](https://github.com/Tallec7/neopro/compare/v2.1.1...v2.1.2) (2026-01-06)

### Bug Fixes

- **api:** align isConnected with displayStatus in dashboard endpoint ([1f0fa71](https://github.com/Tallec7/neopro/commit/1f0fa71c9b4b896dccac692fc05d597f93d3f3e3))

## [2.1.1](https://github.com/Tallec7/neopro/compare/v2.1.0...v2.1.1) (2026-01-06)

### Bug Fixes

- **api:** relax connection status thresholds to reduce false warnings ([d736511](https://github.com/Tallec7/neopro/commit/d736511db08bd4bfd65c19d7b9c56b7003adb3f0))

# [2.1.0](https://github.com/Tallec7/neopro/compare/v2.0.1...v2.1.0) (2026-01-06)

### Bug Fixes

- **api:** optimize monitoring endpoints to prevent rate limiting ([953bd9b](https://github.com/Tallec7/neopro/commit/953bd9b7fbfc001fe8ce683f5b30e94ee969baa5))
- **api:** use effective connection status in getSiteConnectionStatus ([2c106b6](https://github.com/Tallec7/neopro/commit/2c106b6686bb17da38fd441d367129c96b00613e))
- **api:** use metrics table as fallback for connection status detection ([d2ccf23](https://github.com/Tallec7/neopro/commit/d2ccf233d3f555653bf0992fb54f7e58de8541e4))
- **api:** use real-time Socket.IO status in getSiteStats endpoint ([8bc235b](https://github.com/Tallec7/neopro/commit/8bc235b4e9dbef65ae80d988e59ec090576f0616))
- **ci:** add package-lock.json for semantic-release workflow ([bbe1136](https://github.com/Tallec7/neopro/commit/bbe1136a79e91f9582bb5b5be4b12f137f9cb5bf))
- **ci:** upgrade Node.js to v22 for semantic-release v24 ([1e14353](https://github.com/Tallec7/neopro/commit/1e14353037d818501c274a139d6b9c2e79668ff3))
- **dashboard:** correct type mapping for SiteConnectionStatus ([8f62cdb](https://github.com/Tallec7/neopro/commit/8f62cdbfcb3e557de4f40b33e6779f8cff8d0859))
- **dashboard:** display real-time connection status in sites list ([820fdfc](https://github.com/Tallec7/neopro/commit/820fdfc94e577decaf6af88958a40c9a0439ae1f))
- **dashboard:** persist Socket.IO connection after page refresh ([1632c93](https://github.com/Tallec7/neopro/commit/1632c936005af2dc0957a6b798f0112a8910d44b))
- **dashboard:** trust server status='online' when showing connection state ([cf7da77](https://github.com/Tallec7/neopro/commit/cf7da77d23455606fd3d6a5dda1a15de21dd661d))
- **dashboard:** use real-time connection status in recent sites ([456e4e4](https://github.com/Tallec7/neopro/commit/456e4e4f21d64c99b281e981c80b457b160352d0))
- **dashboard:** use real-time connection status in sites list ([e1cbf68](https://github.com/Tallec7/neopro/commit/e1cbf6854a3d9002af643c132612562633ae6ee5))
- maj claude ([b273178](https://github.com/Tallec7/neopro/commit/b273178582bd62796c27c48a0ae2635daaf29116))
- **setup:** generate config in dashboard-compatible format ([0598ceb](https://github.com/Tallec7/neopro/commit/0598cebae762e3e25c3d9b1612b5fcd927948944))
- **socket:** add JWT authentication for dashboard users ([ebbb09f](https://github.com/Tallec7/neopro/commit/ebbb09fbb4db99c772fbe93d03223279fe4843cd))
- use dynamic URL for analytics API instead of relative path ([70b9ea7](https://github.com/Tallec7/neopro/commit/70b9ea79fa88c598fe012e217997186532fe5f24))

### Features

- **admin:** add bulk video categorization and thumbnail regeneration ([4381d1a](https://github.com/Tallec7/neopro/commit/4381d1ab6850065c6a4334120a96918c70691f21))
- **ci:** implement automatic semantic versioning ([3b564f4](https://github.com/Tallec7/neopro/commit/3b564f42179cb37579ae83b7efcce1b1c1b13b19))
- **dashboard:** optimize API polling with cache and aggregated endpoint ([04b4fe1](https://github.com/Tallec7/neopro/commit/04b4fe1f217a36f6781b0b05bf78861a6f1733fe))
- **login:** display club info on login pages (ports 80 & 8080) ([e4d7ba0](https://github.com/Tallec7/neopro/commit/e4d7ba0376ccb2dbb5bb98418c7b69158baa0a0e))
- **raspberry:** add captive portal support for Android hotspot connectivity ([fc4e7ac](https://github.com/Tallec7/neopro/commit/fc4e7acea7593ac5f80f3c31084d4cbd1720ba7a))
- **sync:** add local video list synchronization from Pi to central ([95426ee](https://github.com/Tallec7/neopro/commit/95426ee6e732bd37aaed2dc1f12be1086bdf090c))
- **testing:** add comprehensive test dashboard and toolkit ([001b6fb](https://github.com/Tallec7/neopro/commit/001b6fb2c8be109938cf1a014a8bc03b67e0c00b))

# Changelog

Généré le 2025-12-08 (Mise à jour 2026-01-03)

> **Note** : Les fichiers de commits individuels (138 fichiers) ont été archivés vers `../archive/commits/` le 25/12/2025.

> **🤖 Versioning Automatique** : À partir de la v2.1.0, ce fichier sera généré automatiquement par **semantic-release**.
> Les versions suivront le format **Semantic Versioning** (v2.1.0, v2.1.1, etc.) sans hash de commit.
> Voir [docs/VERSIONING.md](../VERSIONING.md) pour plus d'informations.

## ✨ Nouvelles fonctionnalités

- **Initialisation langue au démarrage** - La langue (fr/en/es) est maintenant initialisée via `APP_INITIALIZER` au démarrage de l'application, ce qui évite l'affichage des clés de traduction (`nav.dashboard`, `status.connected`) après un refresh. Auparavant `initializeLanguage()` n'était appelé que sur les pages d'auth - 2026-01-05
- **Rate limiting permissif en dev** - Le rate limit sur `/auth/login` est maintenant de 100 req/min en dev (au lieu de 10/15min en prod) pour faciliter les tests - 2026-01-05
- **🤖 Versioning Automatique (v2.1.0)** - Migration vers semantic-release pour gérer automatiquement les versions selon les commits conventionnels. Fin des versions avec hash (`v2.0.1+91ed14a`), adoption de Semantic Versioning propre (`v2.1.0`). Configuration `.releaserc.json`, GitHub Actions workflow, modification du script `build-raspberry.sh`, documentation complète (`docs/VERSIONING.md`, `docs/MIGRATION_VERSIONING.md`), script utilitaire `scripts/check-version.sh`. Les versions seront automatiquement incrémentées : `feat:` → MINOR, `fix:` → PATCH, `BREAKING CHANGE:` → MAJOR. CHANGELOG généré automatiquement, GitHub Releases créées automatiquement - 2026-01-03
- **Affichage infos club sur pages login (ports 80 et 8080)** - Les pages de connexion de l'interface admin (`http://neopro.local:8080/login`) et de l'application Angular (`http://neopro.local/login`) affichent les informations du club (nom, gymnase, sports, localisation) extraites de `configuration.json` sous forme d'un rappel discret en bas de page. Design minimaliste : texte gris clair (11px), une seule ligne avec séparateurs •. Support `club.*` et `sync.*` (rétrocompatibilité). Protection XSS, responsive. Fichiers : `raspberry/admin/admin-server.js`, `admin/test-login-display.html`, `admin/README-LOGIN.md`, `src/app/components/login/login.component.{ts,html,scss}`, `README-LOGIN-ANGULAR.md` - 2026-01-03
- **Catégorisation groupée des vidéos orphelines** - Sélection multiple des vidéos sans catégorie avec checkbox "Tout sélectionner", barre d'action flottante pour assigner une catégorie à plusieurs vidéos en une seule action. Nouvel endpoint `POST /api/videos/add-to-config-bulk` - 2026-01-03
- **Régénération des miniatures** - Bouton "Miniatures" dans l'interface admin pour régénérer les miniatures manquantes ou toutes. Endpoints `POST /api/thumbnails/regenerate` (async) et `POST /api/thumbnails/regenerate-sync` - 2026-01-03
- **Option Premium unifiée** - L'option "Score en Live" devient "Option Premium" et contrôle à la fois le score en live ET l'accès aux options avancées de la télécommande (overlay, chronomètre, animations, breaking news). Un seul toggle dans le Central Dashboard - 2026-01-02
- [Features P1 Janvier 2026](2025-12-30_p1-janvier-2026-features.md) - Objectifs clubs, programmation playlists, cron scheduler, upload vidéos annonceurs (implémenté en avance) - 2025-12-30
- **Objectifs & Alertes Clubs (P1 Janvier 2026)** - Système complet de suivi d'objectifs par club avec alertes automatiques. Tables `club_objectives`, `club_objectives_progress`, `club_objective_alerts`. API CRUD `/api/objectives`. 7 types de métriques (screen_time, videos_played, sessions_count, etc.) - 2025-12-30
- **Programmation Playlists Automatiques (P1 Janvier 2026)** - Mode Programmation réactivé avec planification automatique. Tables `playlist_schedules`, `custom_playlists`, `recurring_schedules`. Service `cron-scheduler.service.ts` (793 lignes). Modes sequential, shuffle, weighted - 2025-12-30
- [Overlay V2 Multi-Sport](2025-12-30_overlay-v2-multi-sport.md) - Support 6 sports, 9 positions, logos équipes, animation but (3 styles + son), périodes auto, présets sauvegardables - 2025-12-30
- **Système de thumbnails vidéos** - Miniatures automatiques pour les vidéos dans la télécommande et section "Récemment lancées", script de génération batch, normalisation Unicode pour accents - 2025-12-30
- **Stockage vidéo FTP Hostinger** - Migration du stockage vidéo de Supabase (limité) vers FTP Hostinger (100GB+) - 2025-12-30
- [Audit RGPD et Sécurité](2025-12-29_gdpr-security-audit.md) - Conformité RGPD, documentation juridique, corrections sécurité - 2025-12-29
- [Migration Sponsor → Advertiser](2025-12-29_sponsor-to-advertiser-migration.md) - Renommage sémantique complet (DB, API, Frontend) - 2025-12-29
- [Overlay Local System](2025-12-28_overlay-local-system.md) - Options, Timer, Breaking News, Templates - 2025-12-28
- **Page Login Raspberry améliorée** - Footer dynamique (clubName/sport), UI modernisée - 2025-12-28
- [Implémentation des TODOs système](2025-12-28_todos-implementation.md) - 2025-12-28
- [Système Sponsors Production-Ready](2025-12-28_sponsor-system-production.md) - 2025-12-28
- [Gestion Utilisateurs & Agences](2025-12-27_user-management-agencies.md) - 2025-12-27
- [Multi-tenant Portals](2025-12-26_multi-tenant-portals.md) - 2025-12-26
- [Personnalisation overlay score](2025-12-24_score-overlay-customization.md) - 2025-12-24
- [Live Score - Finalisation complète](2025-12-23_livescore-complete.md) - 2025-12-23
- [Boucles vidéo par phase de match](2025-12-22_phase-video-loops.md) - 2025-12-22
- [RLS, Swagger, Live Score - Intégration](2025-12-16_rls-livescore-integration.md) - 2025-12-16
- [ add timeCategories and video CRUD management (#81)](../archive/commits/3952296.md) - 2025-12-08
- [ add timeCategories and video CRUD management (#80)](../archive/commits/5af64be.md) - 2025-12-08
- [ add structured config editor with history and diff (#74)](../archive/commits/ff6ac9a.md) - 2025-12-08
- [ implement file upload with multer (#63)](../archive/commits/a563edf.md) - 2025-12-07
- [ load existing site configuration in editor (#62)](../archive/commits/e863589.md) - 2025-12-07
- [ load existing site configuration in editor](../archive/commits/a077c9f.md) - 2025-12-07
- [ improve changelog with per-commit detail files (#56)](../archive/commits/7a31d7b.md) - 2025-12-07
- [ improve deployment scripts and add backup/restore (#50)](../archive/commits/2df3029.md) - 2025-12-07
- [ implement complete club analytics system (MVP + Phase 2 + Phase 3) (#35)](../archive/commits/590c278.md) - 2025-12-06
- [ replace alert() with global toast notifications (#33)](../archive/commits/c885238.md) - 2025-12-06
- [ integrate NEOPRO brand guidelines across all apps (#28)](../archive/commits/a79402a.md) - 2025-12-06
- [ implement all TODO features (#27)](../archive/commits/19e8181.md) - 2025-12-06
- [ add remote config deployment via central dashboard (#26)](../archive/commits/4caea08.md) - 2025-12-06
- [ update central server config and scripts for Supabase/Render](../archive/commits/580027b.md) - 2025-12-05
- [ add missing API routes for content and updates management](../archive/commits/a7cb3ec.md) - 2025-12-04
- [ start central stack locally and add dashboard placeholders bis](../archive/commits/cc5f408.md) - 2025-12-04
- [ complete all dashboard UI components (100%)](../archive/commits/6dabd41.md) - 2025-12-04
- [ start central stack locally and add dashboard placeholders](../archive/commits/ab63833.md) - 2025-12-04
- [ implement complete NEOPRO fleet management system](../archive/commits/6d49bf7.md) - 2025-12-04
- [ update video](../archive/commits/f436308.md) - 2025-12-04
- [ améliorer les uploads et la gestion des vidéos](../archive/commits/4c21e2c.md) - 2025-12-04
- [ Add subcategory support in admin video upload](../archive/commits/896b1bb.md) - 2025-12-04
- [ Add local development setup with admin demo mode](../archive/commits/fe7ca53.md) - 2025-12-04
- [ Add complete Raspberry Pi autonomous system (4 phases)](../archive/commits/f81a0f6.md) - 2025-12-04

## 🐛 Corrections

- **Fix Socket.IO déconnecté après refresh** - Après un refresh de page sur le dashboard, le statut Socket.IO passait à "Déconnecté" car le token JWT n'était plus disponible (stocké en mémoire uniquement lors du login). Solution : le endpoint `/auth/me` retourne maintenant le token JWT dans la réponse, et `AuthService` le stocke **avant** d'émettre l'utilisateur pour éviter la race condition avec `LayoutComponent` - 2026-01-05
- **Fix statut connexion sites incohérent** - Le dashboard affichait deux statuts différents pour le même boîtier : "online" dans la liste mais "Hors ligne" dans les détails. Problème : la liste utilisait uniquement `last_seen_at` tandis que le détail vérifiait aussi Socket.IO. Solution : la liste fait maintenant confiance au champ `site.status` de la DB qui est mis à jour automatiquement par le serveur lors des événements `authenticate`/`disconnect`. Également ajouté l'authentification JWT pour le dashboard dans Socket.IO (avant seuls les Pi pouvaient se connecter) - 2026-01-05
- **Fix dashboard Socket.IO "disconnected"** - Le dashboard affichait toujours "status.disconnected" car Socket.IO n'acceptait que l'authentification Pi (`{siteId, apiKey}`). Ajouté support JWT via `socket.handshake.auth.token` pour les connexions dashboard. Les dashboards rejoignent la room `'dashboard'` et reçoivent les événements temps réel (`deploy_progress`, `command_completed`, etc.) - 2026-01-05
- **Fix URL dynamique Analytics API** - `AnalyticsService` et `SponsorAnalyticsService` utilisaient `environment.socketUrl + '/api/...'` qui devenait `/api/...` (URL relative) en mode Raspberry. Maintenant utilise `getApiUrl()` dynamique avec port 3000, comme `socket.service.ts` - 2026-01-02
- **Fix URL dynamique API auth** - `AuthService.LOCAL_SERVER_URL` utilisait `http://localhost:3000` en dur, ce qui échouait quand l'app était accédée depuis `neopro.local`. Maintenant utilise `window.location.hostname` dynamiquement - 2026-01-02
- **Fix deprecation ngx-translate** - Remplacé `defaultLanguage` par `fallbackLang` dans `app.config.ts` pour éliminer le warning de dépréciation - 2026-01-02
- [Fix Socket.IO mode offline](2025-12-30_offline-socketio-fix.md) - Socket.IO chargeait depuis CDN, empêchant le fonctionnement sans internet. Maintenant inclus localement dans le build - 2025-12-30
- **Fix authentification Safari mobile (iOS/iPadOS)** - Les cookies cross-origin étaient bloqués par ITP. Solution : fallback via header `Authorization: Bearer` - 2025-12-30
- **Fix sessions trop courtes** - Durée étendue de 8h à 7 jours (JWT + cookie) - 2025-12-30
- **Fix requête getAdvertiserVideos** - Correction colonne `status` inexistante dans table `videos` (erreur 500) - 2025-12-30
- **Fix cache.invalidateNamespace error** - Correction appel méthode `invalidateNamespace` (était `clearNamespace`) dans admin-server.js - erreur 500 sur ajout vidéo à catégorie - 2025-12-30
- **Fix sélecteur de langue pages login** - Dropdown s'ouvre maintenant vers le bas (visible à l'écran) sur Raspberry et Central Dashboard - 2025-12-30
- **Fix modal ajout vidéos annonceur** - Correction du parsing réponse API `/api/videos` (format paginé) - 2025-12-30
- **Fix comptage catégories/vidéos télécommande** - Correction du comptage récursif des vidéos dans les sous-catégories - 2025-12-30
- [ fix Angular template arrow function error (#82)](../archive/commits/c072070.md) - 2025-12-08
- [ handle undefined videos/subCategories arrays (#77)](../archive/commits/caedb7d.md) - 2025-12-08
- [ fix trust proxy and deploy_video command data (#70)](../archive/commits/92e5e95.md) - 2025-12-07
- [ add get_config to allowed commands in site registration scripts (#68)](../archive/commits/25e92bc.md) - 2025-12-07
- [ use raspberry configuration for Pi builds](../archive/commits/18b7694.md) - 2025-12-07
- [ convert uptime to integer before database insert (#65)](../archive/commits/e1e506e.md) - 2025-12-07
- [ bridge Angular app to sync-agent for analytics transmission (#64)](../archive/commits/de0c8b4.md) - 2025-12-07
- [ correct params mismatch in update_config command (#61)](../archive/commits/a8380c4.md) - 2025-12-07
- [ correct club config path and improve setup workflow (#54)](../archive/commits/d413ff8.md) - 2025-12-07
- [ convert CRLF to LF line endings (#51)](../archive/commits/2ce368f.md) - 2025-12-07
- [ fix SSH heredoc for credentials in setup-new-club.sh (#49)](../archive/commits/4e78549.md) - 2025-12-07
- [ fix SSH heredoc for credentials in setup-new-club.sh (#48)](../archive/commits/7e290e0.md) - 2025-12-07
- [ improve auth error logging and add diagnostic tools (#47)](../archive/commits/54a4910.md) - 2025-12-07
- [ improve auth error logging and add diagnostic tools (#45)](../archive/commits/4ccf8d9.md) - 2025-12-06
- [ use api_key instead of api_key_hash to match Supabase](../archive/commits/8d5b7b8.md) - 2025-12-06
- [ handle duplicate site names with -N suffix](../archive/commits/d81e73f.md) - 2025-12-06
- [ include sync-agent in deployment and improve error logging](../archive/commits/26d26d6.md) - 2025-12-06
- [ automate sync-agent registration with env vars](../archive/commits/08bcc64.md) - 2025-12-06
- [ allow self-signed SSL certs for cloud database providers (#43)](../archive/commits/b619921.md) - 2025-12-06
- [ allow configurable SSL certificate verification for Render PostgreSQL](../archive/commits/b47ce2e.md) - 2025-12-06
- [ add TypeScript types for PostgreSQL query results](../archive/commits/ccd2512.md) - 2025-12-06
- [ use interactive SSH for sync-agent registration (#42)](../archive/commits/51bb0df.md) - 2025-12-06
- [ use interactive SSH for sync-agent registration](../archive/commits/89993aa.md) - 2025-12-06
- [ suppress macOS xattr warnings on Raspberry Pi (#41)](../archive/commits/08e38a6.md) - 2025-12-06
- [ use generic type for Socket.on callback (#39)](../archive/commits/574dfd0.md) - 2025-12-06
- [ resolve TypeScript strict null check errors (#40)](../archive/commits/253bd8a.md) - 2025-12-06
- [ resolve TypeScript compilation errors (#38)](../archive/commits/5c70178.md) - 2025-12-06
- [ remove inferrable type and replace any with unknown (#37)](../archive/commits/62b160d.md) - 2025-12-06
- [ preserve user data during software updates (#36)](../archive/commits/424b090.md) - 2025-12-06
- [ resolve all ESLint errors and warnings (#34)](../archive/commits/ff18c64.md) - 2025-12-06
- [ resolve 4 critical/high security vulnerabilities (#32)](../archive/commits/5e5c15e.md) - 2025-12-06
- [ remove auth guard from /tv route for kiosk mode (#25)](../archive/commits/c08b79b.md) - 2025-12-06
- [ replace chromium-browser with chromium for Raspberry Pi OS Trixie (#21)](../archive/commits/6025995.md) - 2025-12-05
- [ update API URL to point to neopro-central-production.up.railway.app](../archive/commits/bfe79fd.md) - 2025-12-05
- [ add rootDirectory for central-server deployment](../archive/commits/aeeba6c.md) - 2025-12-05
- [ improve CORS preflight handling for admin interface](../archive/commits/b6d7e11.md) - 2025-12-05
- [ handle CORS preflight manually](../archive/commits/1c446c9.md) - 2025-12-05
- [ ser](../archive/commits/659230c.md) - 2025-12-05
- [ server dash](../archive/commits/f1e0551.md) - 2025-12-05
- [ server](../archive/commits/8966615.md) - 2025-12-05
- [ Fix video list loading in admin interface](../archive/commits/130b42b.md) - 2025-12-04
- [ gitignore](../archive/commits/e3951dc.md) - 2025-12-04
- [ url prod](../archive/commits/974a1cd.md) - 2025-12-03
- [ url prod](../archive/commits/63c8fe5.md) - 2025-12-03

## 📚 Documentation

- Audit et nettoyage documentation (archivage 138 commits, fusion doublons) - 2025-12-25
- [Audit plateforme complet 2025](../audit/AUDIT_PLATEFORME_COMPLET_2025.md) - 2025-12-25
- [Analyse stratégie produit](../audit/PRODUCT_STRATEGY_ANALYSIS.md) - 2025-12-25
- [Audit documentation](../audit/AUDIT_DOCS_2025-12-25.md) - 2025-12-25
- [ update all references from public/ to webapp/ (#83)](../archive/commits/90fceb4.md) - 2025-12-08
- [ add reconfiguration guide for changing club name, SSID and WiFi (#19)](../archive/commits/896f7a4.md) - 2025-12-05
- [ add comprehensive update guide for existing Raspberry Pi (#18)](../archive/commits/6af96a8.md) - 2025-12-05
- [ add comprehensive Raspberry Pi initialization guide](../archive/commits/3bed75e.md) - 2025-12-05
- [ add complete fleet management administration guides](../archive/commits/7e71966.md) - 2025-12-04
- [ Major documentation restructuring (Option B)](../archive/commits/71f92b4.md) - 2025-12-04
- [ Clean up redundant documentation (remove 7 files)](../archive/commits/9328237.md) - 2025-12-04

## ♻️ Refactoring

- **Optimisation CSS remote.component.scss** - Refactoring du fichier SCSS de la télécommande (3391→623 lignes source). Introduction de variables SCSS, mixins réutilisables (`flex-center`, `card-base`, `gradient`, `icon-size`). Consolidation des styles dupliqués et du dark mode. Ajustement des budgets Angular pour la configuration demo (48kB/64kB) - 2026-01-03
- [ clean up project architecture and documentation (#53)](../archive/commits/4b2d5d6.md) - 2025-12-07
- [ Remove redundant quick-install.sh script](../archive/commits/a8a6c2b.md) - 2025-12-04

## 🔧 Maintenance

- [ normalize CORS origins](../archive/commits/ac9f841.md) - 2025-12-05
- [ ignore Angular cache](../archive/commits/947433f.md) - 2025-12-03

## 📝 Autres

- [Optimistic lederberg (#79)](../archive/commits/2280dfb.md) - 2025-12-08
- [Optimistic lederberg (#78)](../archive/commits/622a77c.md) - 2025-12-08
- [Clever villani (#76)](../archive/commits/7273b3a.md) - 2025-12-08
- [Clever villani (#75)](../archive/commits/e0096a5.md) - 2025-12-08
- [Lucid euler (#73)](../archive/commits/d29e200.md) - 2025-12-08
- [Lucid euler (#72)](../archive/commits/2fd474b.md) - 2025-12-08
- [Lucid euler (#71)](../archive/commits/0565c3b.md) - 2025-12-07
- [Nostalgic perlman (#69)](../archive/commits/57a89ba.md) - 2025-12-07
- [Nostalgic perlman (#67)](../archive/commits/b0831ab.md) - 2025-12-07
- [Loving bose (#66)](../archive/commits/2508ff9.md) - 2025-12-07
- [Merge remote-tracking branch 'origin/youthful-newton'](../archive/commits/b943b17.md) - 2025-12-07
- [Optimistic satoshi (#60)](../archive/commits/bbd3f40.md) - 2025-12-07
- [Optimistic satoshi (#59)](../archive/commits/2daef65.md) - 2025-12-07
- [Optimistic satoshi (#58)](../archive/commits/f5e081c.md) - 2025-12-07
- [Optimistic satoshi (#57)](../archive/commits/35d0c21.md) - 2025-12-07
- [Optimistic satoshi (#55)](../archive/commits/f537bd2.md) - 2025-12-07
- [Exciting lumiere (#52)](../archive/commits/ae179ee.md) - 2025-12-07
- [Frosty rosalind (#46)](../archive/commits/5d76ad7.md) - 2025-12-07
- [Merge branch 'clever-maxwell' - fix sync-agent and Supabase compatibility](../archive/commits/8aac50d.md) - 2025-12-06
- [Ecstatic driscoll (#44)](../archive/commits/74dd2d8.md) - 2025-12-06
- [bp](../archive/commits/7b22c62.md) - 2025-12-06
- [Xenodochial visvesvaraya (#31)](../archive/commits/5fb059a.md) - 2025-12-06
- [Xenodochial visvesvaraya (#30)](../archive/commits/1e2b805.md) - 2025-12-06
- [Busy volhard (#29)](../archive/commits/f976ca3.md) - 2025-12-06
- [Interesting nobel (#24)](../archive/commits/704f1c9.md) - 2025-12-06
- [update: install pi](../archive/commits/e109901.md) - 2025-12-05
- [Xenodochial visvesvaraya (#23)](../archive/commits/6b7593a.md) - 2025-12-05
- [Xenodochial visvesvaraya (#22)](../archive/commits/3854778.md) - 2025-12-05
- [Merge pull request #16 from Tallec7/competent-albattani](../archive/commits/c528bcf.md) - 2025-12-05
- [Merge pull request #15 from Tallec7/blissful-wright](../archive/commits/1497140.md) - 2025-12-05
- [Merge pull request #14 from Tallec7/sleepy-brattain](../archive/commits/99a802d.md) - 2025-12-04
- [Merge pull request #13 from Tallec7/hopeful-wilson](../archive/commits/3ace4d4.md) - 2025-12-04
- [mdp admin](../archive/commits/780abef.md) - 2025-12-04
- [Merge pull request #12 from Tallec7/hopeful-wilson](../archive/commits/208d6b3.md) - 2025-12-04
- [Merge pull request #11 from Tallec7/sleepy-brattain](../archive/commits/946ea7d.md) - 2025-12-04
- [Merge branch 'main' into sleepy-brattain](../archive/commits/b9da012.md) - 2025-12-04
- [Add Render.com configuration for NEOPRO Central Server](../archive/commits/9dacf10.md) - 2025-12-04
- [Merge pull request #10 from Tallec7/sleepy-brattain](../archive/commits/c31764f.md) - 2025-12-04
- [Merge pull request #9 from Tallec7/funny-fermat](../archive/commits/aa80875.md) - 2025-12-04
- [Merge pull request #8 from Tallec7/funny-fermat](../archive/commits/fc1007f.md) - 2025-12-04
- [Merge pull request #7 from Tallec7/funny-fermat](../archive/commits/d3b5d9f.md) - 2025-12-04
- [Merge branch 'main' into funny-fermat](../archive/commits/c06542d.md) - 2025-12-04
- [Merge pull request #6 from Tallec7/funny-fermat](../archive/commits/c192b4b.md) - 2025-12-04
- [Merge pull request #5 from Tallec7/funny-fermat](../archive/commits/7ea25cd.md) - 2025-12-04
- [Merge pull request #4 from Tallec7/modest-euclid](../archive/commits/7e8161f.md) - 2025-12-03
- [Refactor remote component with time-based organization](../archive/commits/ed9b7fd.md) - 2025-12-03
- [Remove program mode, keep only authentication](../archive/commits/86f230f.md) - 2025-12-03
- [Merge pull request #3 from Tallec7/modest-euclid](../archive/commits/7160464.md) - 2025-12-03
- [Add authentication and program mode features](../archive/commits/213418a.md) - 2025-12-03
- [Merge pull request #2 from Tallec7/eloquent-bartik](../archive/commits/195b287.md) - 2025-12-03
- [Merge branch 'main' into eloquent-bartik](../archive/commits/85c583d.md) - 2025-12-03
- [Add final deployment instructions](../archive/commits/31a7223.md) - 2025-12-03
- [Update production Socket.IO URL to https://neopro.onrender.com](../archive/commits/103a4ae.md) - 2025-12-03
- [Fix Socket.IO loading by using CDN instead of local path](../archive/commits/3051bcb.md) - 2025-12-03
- [Configure CORS for neopro.kalonpartners.bzh and add deployment guide](../archive/commits/3bc885d.md) - 2025-12-03
- [Merge pull request #1 from Tallec7/eloquent-bartik](../archive/commits/02ec91d.md) - 2025-12-03
- [Add Render deployment configuration for Socket.IO server](../archive/commits/ab715ca.md) - 2025-12-03
