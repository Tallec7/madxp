# 1.0.0 (2026-01-11)

### Bug Fixes

- add CommonModule import to TvComponent to resolve \*ngIf warnings ([5a75dcb](https://github.com/Tallec7/neopro/commit/5a75dcb7ed2f241d6050d8ae4ffc17f50382da8a))
- add error logging to connection indicator component ([#160](https://github.com/Tallec7/neopro/issues/160)) ([0bdb9c3](https://github.com/Tallec7/neopro/commit/0bdb9c37ffe351e4f1ec745faa8f7baf15efd63a))
- add neoProContent property to Site interface ([#231](https://github.com/Tallec7/neopro/issues/231)) ([8842571](https://github.com/Tallec7/neopro/commit/884257112900203e37cd755115895359d071f0e7))
- add permissions to GitHub Actions workflow for releases ([#255](https://github.com/Tallec7/neopro/issues/255)) ([66f592c](https://github.com/Tallec7/neopro/commit/66f592c22a39284d82614ff8ddd769a759eae74c))
- add rootDirectory for central-server deployment ([cd1d708](https://github.com/Tallec7/neopro/commit/cd1d708d89428668c58147d1cea3ddcb1375c4d2))
- add validation for update_config command to prevent empty payload errors ([2d8e23f](https://github.com/Tallec7/neopro/commit/2d8e23f5dd9fb8ac63c481fa24f759bf59969d48))
- add validation for update_config command to prevent empty payload errors ([#136](https://github.com/Tallec7/neopro/issues/136)) ([85c0b10](https://github.com/Tallec7/neopro/commit/85c0b10f8250516417c70fc606bf7acdbbb70ef0))
- **admin:** Add 401 redirect to login and fix aria-hidden warnings ([9b4cfc9](https://github.com/Tallec7/neopro/commit/9b4cfc99ad5cdc9319110c0f4de122def0d950a9))
- **admin:** Add credentials to API fetch calls to fix 401 errors ([#330](https://github.com/Tallec7/neopro/issues/330)) ([9a1f871](https://github.com/Tallec7/neopro/commit/9a1f871094dbc3e57d2a06bce2f97f9233156882))
- **admin:** allow sudo restarts from local UI ([725b98e](https://github.com/Tallec7/neopro/commit/725b98ef2c37ba7655d5e144895ee748edd206bc))
- **admin:** Fix authentication cookie and fetch credentials for HTTP ([057d149](https://github.com/Tallec7/neopro/commit/057d149855eb63c166624af815322bf787aaf564))
- **admin:** Fix cache.invalidateNamespace method call ([84392a4](https://github.com/Tallec7/neopro/commit/84392a4907ddcef9f7988ef54f7bf2dfbeb1f9d9))
- **admin:** load video categories dynamically from configuration ([#107](https://github.com/Tallec7/neopro/issues/107)) ([a8fc9cf](https://github.com/Tallec7/neopro/commit/a8fc9cfd954479ad79863899d68f0cb87aa470df))
- **admin:** Serve thumbnails directory as static files ([5b73a5e](https://github.com/Tallec7/neopro/commit/5b73a5e536f4fb83b2c2c0a76a0b0f3ae05dcd0f))
- **admin:** serve video files statically on port 8080 ([#116](https://github.com/Tallec7/neopro/issues/116)) ([04d7679](https://github.com/Tallec7/neopro/commit/04d7679a60499517c9c8da57739a20d9b41e79ba))
- **admin:** serve video files statically on port 8080 ([#117](https://github.com/Tallec7/neopro/issues/117)) ([cfa1596](https://github.com/Tallec7/neopro/commit/cfa1596c1c416ac0a54c49147aced0bc406824a9))
- **analytics:** add TypeScript types for PostgreSQL query results ([c56d32d](https://github.com/Tallec7/neopro/commit/c56d32d90fe766c5ae9afb03e0fb813afd20bff6))
- **analytics:** align backend API responses with frontend interfaces ([#122](https://github.com/Tallec7/neopro/issues/122)) ([9289368](https://github.com/Tallec7/neopro/commit/9289368b3200379d72faf1ca4586c3ebacb481c1))
- **analytics:** bridge Angular app to sync-agent for analytics transmission ([#64](https://github.com/Tallec7/neopro/issues/64)) ([c4ab053](https://github.com/Tallec7/neopro/commit/c4ab053d8a0c08020612aa5e779d9e7d96897f53))
- **analytics:** resolve TypeScript strict null check errors ([#40](https://github.com/Tallec7/neopro/issues/40)) ([d08a46b](https://github.com/Tallec7/neopro/commit/d08a46bd7d1a591b94247c78424c345ab2232cc3))
- **api:** align isConnected with displayStatus in dashboard endpoint ([9a5f0fd](https://github.com/Tallec7/neopro/commit/9a5f0fd0607106cc01acbded3e17890702219437))
- **api:** fix FTP test route ordering and add package URL diagnostic ([d716b98](https://github.com/Tallec7/neopro/commit/d716b98f45a2400c98cb0cb2c832dba370325174))
- **api:** Fix sponsor site filtering SQL - use sponsor_videos table ([3986407](https://github.com/Tallec7/neopro/commit/398640774e83c7284cb379c091b5ef21044eaaab))
- **api:** normalize config before diff comparison to avoid false positives ([cd9b184](https://github.com/Tallec7/neopro/commit/cd9b184fd0cf811eb028741d832675d78d4b8c34))
- **api:** optimize monitoring endpoints to prevent rate limiting ([fa9a720](https://github.com/Tallec7/neopro/commit/fa9a7206fdf816ea76278727b9360849a096c2d9))
- **api:** relax connection status thresholds to reduce false warnings ([3924342](https://github.com/Tallec7/neopro/commit/3924342ec7d4ed3ddbf673ec009879bc54704660))
- **api:** Return empty data instead of 403 for unassigned portal users ([bf504e7](https://github.com/Tallec7/neopro/commit/bf504e71cd71d3a4fc00ab01b5c3d19d22a982b9))
- **api:** use effective connection status in getSiteConnectionStatus ([2538796](https://github.com/Tallec7/neopro/commit/2538796e2cfadd36eb7adbf844c54d28edecfc6d))
- **api:** use metrics table as fallback for connection status detection ([9d6ebd7](https://github.com/Tallec7/neopro/commit/9d6ebd717290072745bd1d7c30e7d9a10547dcb0))
- **api:** use real-time Socket.IO status in getSiteStats endpoint ([82ef761](https://github.com/Tallec7/neopro/commit/82ef7614489df6a933f0b433ead868ff628dbc40))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#203](https://github.com/Tallec7/neopro/issues/203)) ([971229d](https://github.com/Tallec7/neopro/commit/971229d414b764fdf5a572ad40582e21d03fe17e))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#204](https://github.com/Tallec7/neopro/issues/204)) ([eb8deca](https://github.com/Tallec7/neopro/commit/eb8deca2024d7fcd92f0c8a8201aedefb8299794))
- **audit:** add REMOTE_SHELL audit action types ([9b44e0a](https://github.com/Tallec7/neopro/commit/9b44e0aa98beabbf8d24b81d2d80c6f92fef8279))
- **auth:** Add Authorization header fallback for mobile Safari ([5817603](https://github.com/Tallec7/neopro/commit/5817603fc4428d4e74cf252a681551991e6a4725))
- **auth:** Enable cross-origin cookies for separate frontend/backend domains ([c18a1ab](https://github.com/Tallec7/neopro/commit/c18a1ab59ea4fe83f2dc0dd9660261426d722006))
- **auth:** Fix race condition after login redirect ([6660cfb](https://github.com/Tallec7/neopro/commit/6660cfb409a61b5c61ce04bfcfd7becab311a674))
- **auth:** Include super_admin role in layout permission checks ([6a397eb](https://github.com/Tallec7/neopro/commit/6a397ebe3ea7c6ab42e00501b16e53e1efa1aed1))
- **auth:** Safari mobile support via Authorization header fallback ([ded2118](https://github.com/Tallec7/neopro/commit/ded2118f4ce27f7dc7e01acd86b126e8a05146ad))
- **auth:** Safari support + 7 day sessions ([59c69be](https://github.com/Tallec7/neopro/commit/59c69bed63dd42531647a79ec4e76b1d231a491b))
- **auth:** Safari support + 7 day sessions ([d620981](https://github.com/Tallec7/neopro/commit/d62098111f8c0f65bf3284f2b37ab0edf7699da0))
- **auth:** separate rate limits for login vs session check ([f22c2d9](https://github.com/Tallec7/neopro/commit/f22c2d9abec5b2fef012e42cad3041d8fb971e33))
- **auth:** use SHA256 instead of bcrypt for site API keys ([50fbd75](https://github.com/Tallec7/neopro/commit/50fbd75e68c41b890d350933cbd643352019344e))
- auto-detect Chromium path for kiosk mode on Raspberry Pi ([#233](https://github.com/Tallec7/neopro/issues/233)) ([1e5d2af](https://github.com/Tallec7/neopro/commit/1e5d2afc20581d9046723493bd129e56fd50c345))
- **build:** include generate-all-thumbnails.sh in raspberry deploy ([c58936e](https://github.com/Tallec7/neopro/commit/c58936eb38504fb023ffe0624db6a63ad81bd935))
- **build:** resolve TypeScript compilation errors ([#38](https://github.com/Tallec7/neopro/issues/38)) ([7cde92c](https://github.com/Tallec7/neopro/commit/7cde92cc48908e050867f2db57856b482c63d359))
- **build:** use generic type for Socket.on callback ([#39](https://github.com/Tallec7/neopro/issues/39)) ([0437ee1](https://github.com/Tallec7/neopro/commit/0437ee171f2b24e5086d81b6c8de05298a012504))
- **build:** use raspberry configuration for Pi builds ([8561839](https://github.com/Tallec7/neopro/commit/85618391c24395439dd78bb2ef6be6998d563163))
- **central-server:** fix trust proxy and deploy_video command data ([#70](https://github.com/Tallec7/neopro/issues/70)) ([883a061](https://github.com/Tallec7/neopro/commit/883a061d6d74c1a8cc78f03cbf19b0d5f4159e35))
- **central-server:** resolve memory leaks causing 503 errors ([ce26498](https://github.com/Tallec7/neopro/commit/ce26498fc1541a4f732a448845f2fd68cdd31c08))
- **central-server:** use api_key instead of api_key_hash to match Supabase ([1f440dd](https://github.com/Tallec7/neopro/commit/1f440dd788ba9f81f85a5c4c1949c9bb0fea777f))
- **ci:** add package-lock.json for semantic-release workflow ([9f8f544](https://github.com/Tallec7/neopro/commit/9f8f544cc09a8324bbd2dc7ecc26e6dfdd7c4d5e))
- **ci:** upgrade Node.js to v22 for semantic-release v24 ([7bfd614](https://github.com/Tallec7/neopro/commit/7bfd614b3e1240a62109fd20ed819c345e03b58a))
- **command-executor:** fix TypeScript compilation errors ([4a106cc](https://github.com/Tallec7/neopro/commit/4a106ccc9069a7ec1f8819833b4ec6ec305bd116))
- config ([40c5bd2](https://github.com/Tallec7/neopro/commit/40c5bd294fc8eb59cb2f7683d7ca05499a7222ff))
- **config-editor:** fix Angular template arrow function error ([#82](https://github.com/Tallec7/neopro/issues/82)) ([8c03bd6](https://github.com/Tallec7/neopro/commit/8c03bd6b55a811495ce2845650f376e13dce17c8))
- **config-editor:** fix categories display and analytics mapping ([a335203](https://github.com/Tallec7/neopro/commit/a33520323bf932917277e67d533cbc4d670d0dd9))
- **config-editor:** force change detection after loading completes ([3442d9c](https://github.com/Tallec7/neopro/commit/3442d9cd7b11ae4056568a6ddefbf017b7aebc41))
- **config-editor:** force detectChanges in loading setter ([d187293](https://github.com/Tallec7/neopro/commit/d18729316cbd3f30f328b9b07c30dab46aeec030))
- **config-editor:** handle undefined videos/subCategories arrays ([#77](https://github.com/Tallec7/neopro/issues/77)) ([794db72](https://github.com/Tallec7/neopro/commit/794db7275612c561fa5323048610e0fd4231701e))
- **config-editor:** show tabs during loading and add debug traces ([549f29e](https://github.com/Tallec7/neopro/commit/549f29e0efb367a7baac5691c93b1d7d8a0021ae))
- **config-editor:** use Angular signal for loading state ([3a4e763](https://github.com/Tallec7/neopro/commit/3a4e763e56f19ac769bd9876130fd304f676e211))
- **config-editor:** use NgZone.run for change detection ([009f037](https://github.com/Tallec7/neopro/commit/009f037d32daac22ed22f1049635ed2b1e3619ad))
- **config-editor:** use setTimeout + ngZone.run for reliable change detection ([9ff785e](https://github.com/Tallec7/neopro/commit/9ff785e8ea1dc3ba5c324d78c3b18d5d57c328c3))
- **config-editor:** use setTimeout and markForCheck for change detection ([49a9182](https://github.com/Tallec7/neopro/commit/49a918269ab8c15e04a9617fec3ecd73e486c82d))
- **config-editor:** use setTimeout to force Angular change detection for categories ([ce7e354](https://github.com/Tallec7/neopro/commit/ce7e354bd6f06839337309580d90ac7abc9fae25))
- **config-editor:** wrap state changes in ngZone.run to fix spinner ([73d376f](https://github.com/Tallec7/neopro/commit/73d376f826a2604d900b6fe198a5ac770b9b2cc2))
- **config:** preserve video owner/locked fields and fix category merge ([f4767dd](https://github.com/Tallec7/neopro/commit/f4767ddefef9cc8c25484235a1afc645771c1053))
- **config:** restore diff preview modal and fix config deployment ([15f0e13](https://github.com/Tallec7/neopro/commit/15f0e130582d4693a4e8ae8fd34e80af5c355643))
- **config:** use FTP IP address instead of hostname ([ffbb839](https://github.com/Tallec7/neopro/commit/ffbb83925349e13438467fa3bef35a435e7c6cbb))
- **content:** add checksum calculation to bulk video upload ([6afa699](https://github.com/Tallec7/neopro/commit/6afa699d5ce0c4fdc58ff80a1cf7cfbbf6d05011))
- **content:** use original filename instead of UUID for video storage ([6d429a1](https://github.com/Tallec7/neopro/commit/6d429a1d9d1248cbfef1fd092cb86b54e85b9ad7))
- controller ([498f90a](https://github.com/Tallec7/neopro/commit/498f90ad3f1d94d7f674138c2c834be122ef5316))
- correct offline queue method call (getQueueSize → getStats) ([#261](https://github.com/Tallec7/neopro/issues/261)) ([a04986c](https://github.com/Tallec7/neopro/commit/a04986c2cfe57f078613b65bf69f42be04bf2d60))
- correct params mismatch in update_config command ([#61](https://github.com/Tallec7/neopro/issues/61)) ([aca8029](https://github.com/Tallec7/neopro/commit/aca8029e8503e83a7f8470c7be382939fd154d8a))
- correct RLS policies to allow unauthenticated analytics from Raspberry Pi ([#230](https://github.com/Tallec7/neopro/issues/230)) ([1a73d90](https://github.com/Tallec7/neopro/commit/1a73d9026b9f69485423548d73ead2b0aae5326e))
- correct static publish path for dashboard health endpoint ([#269](https://github.com/Tallec7/neopro/issues/269)) ([ce5923d](https://github.com/Tallec7/neopro/commit/ce5923d31566faf793681d3f9b47841f4126514b))
- correct video deletion endpoint routing ([#271](https://github.com/Tallec7/neopro/issues/271)) ([11d5cba](https://github.com/Tallec7/neopro/commit/11d5cba03d71033930ac0babe185631ac3cef340))
- **cors:** allow X-Correlation-ID header in preflight requests ([d791004](https://github.com/Tallec7/neopro/commit/d7910041d71c7642cb9c0e3c146bed3901fc19d2))
- **cors:** normalize origins and improve CORS debugging ([4210dd7](https://github.com/Tallec7/neopro/commit/4210dd71067978ad0c5a765282cd400623a99976))
- **cors:** normalize origins and improve CORS debugging ([#170](https://github.com/Tallec7/neopro/issues/170)) ([2141786](https://github.com/Tallec7/neopro/commit/21417864bd914cf7ff8ed501a364789b2790dc2f))
- **cron:** handle self-referential FK in config_history cleanup ([9a7114d](https://github.com/Tallec7/neopro/commit/9a7114dda15d25d3a2f0c6632fde60f02271ea9e))
- dashboard health endpoint and static publishing ([#272](https://github.com/Tallec7/neopro/issues/272)) ([b4a32fb](https://github.com/Tallec7/neopro/commit/b4a32fbc283bc91368f89613bc8dbfb5f259e35d))
- **dashboard:** add media-src CSP for FTP video hosting ([fd035d8](https://github.com/Tallec7/neopro/commit/fd035d82cdc3953c0c75a20b411b68dfb10ac77f))
- **dashboard:** add optional chaining to network info template ([58f3768](https://github.com/Tallec7/neopro/commit/58f376824b4f03c719d9272fa0851639efabd5e4))
- **dashboard:** correct type mapping for SiteConnectionStatus ([9edbc61](https://github.com/Tallec7/neopro/commit/9edbc61917f3cf3596e283211d562fa78cc7e2a7))
- **dashboard:** display original video filename instead of UUID ([1d4ded8](https://github.com/Tallec7/neopro/commit/1d4ded899db47b60dd31a8c9631951e79f1bb643))
- **dashboard:** display real-time connection status in sites list ([9f5c7f2](https://github.com/Tallec7/neopro/commit/9f5c7f2a76109281e75614f607003d92e73d8617))
- **dashboard:** handle paginated API response format for sites ([b9774b6](https://github.com/Tallec7/neopro/commit/b9774b60bd9f7d359a6c4259e245348bbf2a94f0))
- **dashboard:** persist Socket.IO connection after page refresh ([ac3ddfc](https://github.com/Tallec7/neopro/commit/ac3ddfc458cea2db9863a127670bb35ad44f7e96))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#119](https://github.com/Tallec7/neopro/issues/119)) ([57cb728](https://github.com/Tallec7/neopro/commit/57cb728aa868aae8b364f227f9ff17ce7db01d2e))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#120](https://github.com/Tallec7/neopro/issues/120)) ([2a980c7](https://github.com/Tallec7/neopro/commit/2a980c7b449bf1189094d3e16148a3a97a516ecd))
- **dashboard:** restore config button now deploys directly ([#338](https://github.com/Tallec7/neopro/issues/338)) ([044a4f7](https://github.com/Tallec7/neopro/commit/044a4f766c7c85c0f505acfa65a389541e36db69))
- **dashboard:** trust server status='online' when showing connection state ([71d0b76](https://github.com/Tallec7/neopro/commit/71d0b76d0139b327e21040dd7bdca14f3ab7d8ed))
- **dashboard:** use real-time connection status in recent sites ([2c012ce](https://github.com/Tallec7/neopro/commit/2c012ce77bfa227b1658cfd93a082e70ce89a0ab))
- **dashboard:** use real-time connection status in sites list ([72ca128](https://github.com/Tallec7/neopro/commit/72ca12888a18b18ecfc276a02181d7e6d46c8b49))
- **db:** allow configurable SSL certificate verification for Render PostgreSQL ([d0783b4](https://github.com/Tallec7/neopro/commit/d0783b4611f1a287c23ebd3fee889caf0652fdbf))
- default update_config to replace when mode missing ([3d0a853](https://github.com/Tallec7/neopro/commit/3d0a8530429767f068319a00077f9007d8b0855e))
- **demo:** correct video paths and socket port for NARH demo ([#98](https://github.com/Tallec7/neopro/issues/98)) ([d1d2c60](https://github.com/Tallec7/neopro/commit/d1d2c60ac0e9c7cfb7523229c6636744c26c5b09))
- **deploy:** add npm install for sync-agent in all deploy scripts ([4916c85](https://github.com/Tallec7/neopro/commit/4916c8529d3af2ed0e1aafc757d032582f4145e7))
- **deploy:** allow self-signed SSL certs for cloud database providers ([#43](https://github.com/Tallec7/neopro/issues/43)) ([ccf61a6](https://github.com/Tallec7/neopro/commit/ccf61a637e07a3b10bc460a0c53170f66890b4f8))
- **deploy:** handle port 3000 already in use during deployment ([#128](https://github.com/Tallec7/neopro/issues/128)) ([289bb31](https://github.com/Tallec7/neopro/commit/289bb318c2acafa5c4f5b0e12dc6907730dfcfef))
- **deploy:** handle port 3000 already in use during deployment ([#131](https://github.com/Tallec7/neopro/issues/131)) ([d4d972c](https://github.com/Tallec7/neopro/commit/d4d972c4aaf5446cbeaa696733f2d61466a3fd7e))
- **deploy:** handle port 3000 already in use during deployment ([#133](https://github.com/Tallec7/neopro/issues/133)) ([671e165](https://github.com/Tallec7/neopro/commit/671e1656b88d7f5480d1b2c555c2b54273779d83))
- **deploy:** include sync-agent in deployment and improve error logging ([b6adb14](https://github.com/Tallec7/neopro/commit/b6adb1458c7b9ba3a53c0b9e7776bb057e44c67b))
- **deployment:** use correct storage URL for video downloads ([497f174](https://github.com/Tallec7/neopro/commit/497f1743d8c2a216b209d7a9fd108e9d1df5755c))
- **deploy:** preserve sync-agent config during SSH deployments ([8f90ea0](https://github.com/Tallec7/neopro/commit/8f90ea04a975c2413953da253d7bec9adc72625e))
- **deploy:** suppress macOS xattr warnings on Raspberry Pi ([#41](https://github.com/Tallec7/neopro/issues/41)) ([cad8d37](https://github.com/Tallec7/neopro/commit/cad8d37ce7b044164b5b0b8831fa08390d46ae09))
- enable non-interactive mode for online installation ([#247](https://github.com/Tallec7/neopro/issues/247)) ([f92030f](https://github.com/Tallec7/neopro/commit/f92030fb59d42ddfe512e85edf3fe10a744cdf77))
- ensure analytics auth cookies and DB SSL ([b199259](https://github.com/Tallec7/neopro/commit/b19925974e0bd7de5b529010e1119c296875e62f))
- Fix video list loading in admin interface ([83a7cd2](https://github.com/Tallec7/neopro/commit/83a7cd28d4b66fb1cd241f13e54d4b90f4a83a1e))
- gitignore ([0742415](https://github.com/Tallec7/neopro/commit/0742415b999c6d3afa81067ae9e7aa96f8a14b26))
- handle CORS preflight manually ([4823041](https://github.com/Tallec7/neopro/commit/4823041760d8dda8d5451f555422e073a1f6c075))
- handle liveScoreEnabled in config merge for Raspberry Pi deployment ([#232](https://github.com/Tallec7/neopro/issues/232)) ([0a55db1](https://github.com/Tallec7/neopro/commit/0a55db13504d26fa4fb62497e028b7b391abda1d))
- health ([2ae2477](https://github.com/Tallec7/neopro/commit/2ae2477c6d8bfd51d7e4cf790274070ff85639f0))
- **i18n:** Fix ngx-translate configuration for Angular 20 ([3ecb7df](https://github.com/Tallec7/neopro/commit/3ecb7df95ee4cbbdb869b478414d7d6688d75fae))
- **i18n:** replace hardcoded French text with translation keys ([c25e0c4](https://github.com/Tallec7/neopro/commit/c25e0c449fedabe92f2fd837dd7757e2a13f98d5))
- improve CORS preflight handling for admin interface ([d39cc15](https://github.com/Tallec7/neopro/commit/d39cc1585bbf5332f6daa3a4f1ebe5e79014fdd8))
- improve error handling for software update creation ([#274](https://github.com/Tallec7/neopro/issues/274)) ([45a87fc](https://github.com/Tallec7/neopro/commit/45a87fcf0e25cfd30b86ce4baa18a003bd72163e))
- improve error handling in /api/update endpoint ([#235](https://github.com/Tallec7/neopro/issues/235)) ([6be6860](https://github.com/Tallec7/neopro/commit/6be6860ae0cf7d33345a665aa3842aa677317653))
- improve generate-config-from-videos.sh script reliability ([#140](https://github.com/Tallec7/neopro/issues/140)) ([95d8388](https://github.com/Tallec7/neopro/commit/95d838857c5bd3b5bd7b80fcfb57217349429f78))
- improve raspberry build speed and version deployment ([#282](https://github.com/Tallec7/neopro/issues/282)) ([6b2d3e2](https://github.com/Tallec7/neopro/commit/6b2d3e2f4ab68c9e3ec37846a1f5d627f7cf01d3))
- include .htaccess in central-dashboard build output ([#316](https://github.com/Tallec7/neopro/issues/316)) ([478143c](https://github.com/Tallec7/neopro/commit/478143cd9c8f747e8eb88ae5bfc5eedf6ba820e1))
- include .htaccess in central-dashboard build output ([#320](https://github.com/Tallec7/neopro/issues/320)) ([946f610](https://github.com/Tallec7/neopro/commit/946f610cdb708ff19e04e424b78f2d37a066dc7f))
- initialize required directories at admin server startup ([#317](https://github.com/Tallec7/neopro/issues/317)) ([ee149fe](https://github.com/Tallec7/neopro/commit/ee149fe611693af0a80fd70f217fb021fbda64e8))
- **kiosk:** configure gpu_mem=256 for video decoding ([2315edf](https://github.com/Tallec7/neopro/commit/2315edfbe1719c01fabec9999d432cd55cab6925))
- **layout:** add missing slideIn animation definition ([#189](https://github.com/Tallec7/neopro/issues/189)) ([9770546](https://github.com/Tallec7/neopro/commit/9770546a2b51ed43cad1c0f035c8aaf1d0b48f66))
- **lint:** remove inferrable type and replace any with unknown ([#37](https://github.com/Tallec7/neopro/issues/37)) ([978c7aa](https://github.com/Tallec7/neopro/commit/978c7aaafc2b0f91b2bfd5a366da2deac4246d96))
- **lint:** resolve all ESLint errors and warnings ([#34](https://github.com/Tallec7/neopro/issues/34)) ([61a40e6](https://github.com/Tallec7/neopro/commit/61a40e62ffdc532337b6c3aac0972ce8eac70c3a))
- **local-admin:** fix TypeScript error in clientForm definition ([9e6ea6e](https://github.com/Tallec7/neopro/commit/9e6ea6e61985e70050066280745b2126a330912c))
- **local-admin:** handle nullable form values in createClient ([109b213](https://github.com/Tallec7/neopro/commit/109b2131e1c8fad14afcc9549599eba8c57d0003))
- **logs:** prevent infinite loop on frontend log rate limiting ([dc0f358](https://github.com/Tallec7/neopro/commit/dc0f3580c984a737c1c7db982cb50c5bb5846542))
- **logs:** skip backend logging when user is not authenticated ([817e916](https://github.com/Tallec7/neopro/commit/817e916732f51cdb1b7989724fd1790db18d6461))
- maj claude ([021721f](https://github.com/Tallec7/neopro/commit/021721fe8cad398bf5612a5aaa66dcf8d515f434))
- **memory:** optimize memory usage for Railway Hobby plan ([a7d9652](https://github.com/Tallec7/neopro/commit/a7d9652c99f0e3df4c1edd351b036ce70f26287d))
- metric ([3514ddb](https://github.com/Tallec7/neopro/commit/3514ddb16cab72648a5768491728ff5f5d3161bd))
- **metrics:** convert uptime to integer before database insert ([#65](https://github.com/Tallec7/neopro/issues/65)) ([937d598](https://github.com/Tallec7/neopro/commit/937d598304ab64bd87ef48a4db98baa6831e14b5))
- **overlay:** Add Socket.IO relay for cross-device communication ([775c09d](https://github.com/Tallec7/neopro/commit/775c09d82e0e3620b02f80d2de51be30f0346794))
- **overlay:** Fix preview position for 9-position overlay system ([3280b1a](https://github.com/Tallec7/neopro/commit/3280b1aff35b38e5b032b74032c8d50111c2b171))
- **overlay:** Fix timer sync and options loading between Remote and TV ([7b9514b](https://github.com/Tallec7/neopro/commit/7b9514b9269c0fc72e1fcc03bbd8e05127ee8db7))
- privilege remote ([11c3803](https://github.com/Tallec7/neopro/commit/11c38032a2fdd7be1c0493bf1d060341cd1d5abf))
- push full config from dashboard ([3caf233](https://github.com/Tallec7/neopro/commit/3caf233c34faf4de530bc2947556aba4b9bdc148))
- **qr-code:** use real hotspot SSID and display neopro.local ([fe00fb6](https://github.com/Tallec7/neopro/commit/fe00fb6558c03dbb14496516317bec318ade5c57))
- **railway:** Configure Node 20 for Nixpacks build ([b1256d3](https://github.com/Tallec7/neopro/commit/b1256d3fd5ea240f24f63883876a3d3d2f6c415e))
- **railway:** Move railway.json to root with correct start command ([b83b1ed](https://github.com/Tallec7/neopro/commit/b83b1edb61869ffc54c4fcf7d8419d5422383695))
- **railway:** Use correct Nixpacks package name for Node 20 ([f0d72fa](https://github.com/Tallec7/neopro/commit/f0d72fadea2dfbaaa599f2e97e672777e09a0259))
- **railway:** Use generic nodejs package in nixpacks ([b5a1396](https://github.com/Tallec7/neopro/commit/b5a139695bcb1aa4a3837d353b43a04ed575a534))
- **railway:** Use Node 22 via nixpacks.toml ([5815ab6](https://github.com/Tallec7/neopro/commit/5815ab6ed5cc80dc39624e12860ddc1c11ea4d5c))
- **raspberry:** add fix_permissions command and preserve permissions after update ([a2c814e](https://github.com/Tallec7/neopro/commit/a2c814eb2b0b62be97a8a7f6f7d7ec4d6f545cf5))
- **raspberry:** correct webapp permissions for sync-agent ([#123](https://github.com/Tallec7/neopro/issues/123)) ([349458c](https://github.com/Tallec7/neopro/commit/349458c98da875c2027e826ccc52203997ad92f9))
- **raspberry:** Enable Socket.IO offline mode for autonomous operation ([c0691fe](https://github.com/Tallec7/neopro/commit/c0691feb7153ae388ac4c36bacdc661d4e12e08e))
- **raspberry:** Include i18n assets in Angular build ([674179e](https://github.com/Tallec7/neopro/commit/674179e78a3db79094196447c0bd4003ec3996b8))
- **raspberry:** remove dead code referencing webapp/videos ([ad307ca](https://github.com/Tallec7/neopro/commit/ad307ca90f06f306570f6b2d908c9f0bcdc43d24))
- **rate-limit:** apply per-route rate limits to prevent 429 errors ([bc4e25d](https://github.com/Tallec7/neopro/commit/bc4e25d01e8f06b58f95caeb7e2f7859676b1958))
- **remote-shell:** allow /dev/null redirection in security blacklist ([ff6dc93](https://github.com/Tallec7/neopro/commit/ff6dc93766b560522577237a890f17d2863d2711))
- **remote-shell:** allow super_admin to access any path ([51c608f](https://github.com/Tallec7/neopro/commit/51c608f47f250d3d44a207536ad8644052d6340c))
- **remote-shell:** use WebSocket for command results to avoid Gateway timeout ([1f09838](https://github.com/Tallec7/neopro/commit/1f098389fee7e5a3d2561b4d8b6c46c84f475249))
- **remote:** Fix category and video count in telecommande ([433db91](https://github.com/Tallec7/neopro/commit/433db91041280115a190cd62a05e07da615822ce))
- **remote:** sort search results alphabetically ([a0fc934](https://github.com/Tallec7/neopro/commit/a0fc93446409a77c11c68ef3b25e836cf4e4fcad))
- remove auth guard from /tv route for kiosk mode ([#25](https://github.com/Tallec7/neopro/issues/25)) ([37034d4](https://github.com/Tallec7/neopro/commit/37034d4d1d06b6150ea0cafdfebc7a08dd6e54ec))
- remove duplicate formatJson and clean diff display ([d7752c3](https://github.com/Tallec7/neopro/commit/d7752c38aba60f21291391c625251236bc8d8a04))
- remove non-existent status column from videos query ([dfde042](https://github.com/Tallec7/neopro/commit/dfde042cd10c8165173335643514c34874518245))
- remove npm cache and use npm install instead of npm ci ([#287](https://github.com/Tallec7/neopro/issues/287)) ([1f3c2c0](https://github.com/Tallec7/neopro/commit/1f3c2c0eaa5ab32f08840eb628dc83666f546f4c))
- replace chromium-browser with chromium for Raspberry Pi OS Trixie ([#21](https://github.com/Tallec7/neopro/issues/21)) ([cfec79d](https://github.com/Tallec7/neopro/commit/cfec79d00968b56f9d074b5692e22f96a7542195))
- resolve Angular build warnings ([#219](https://github.com/Tallec7/neopro/issues/219)) ([295f413](https://github.com/Tallec7/neopro/commit/295f4139dbf36246a8f433f0de4f3f34383c3bff))
- resolve CSP blocking external images and improve video upload error handling ([#263](https://github.com/Tallec7/neopro/issues/263)) ([a36c812](https://github.com/Tallec7/neopro/commit/a36c812b0795dd21b5255e47dd19e93732af3784))
- **routes:** Move portal routes before :id routes to fix 403 error ([3b04abf](https://github.com/Tallec7/neopro/commit/3b04abf93c3848f825ce1d5e0afc184b67c0ab1b))
- **scripts:** add timeout to xattr to prevent build-and-deploy hang ([#167](https://github.com/Tallec7/neopro/issues/167)) ([011a015](https://github.com/Tallec7/neopro/commit/011a01562a53fd9db83ae0e328070bd55ebf5a20))
- **scripts:** convert CRLF to LF line endings ([#51](https://github.com/Tallec7/neopro/issues/51)) ([01e8702](https://github.com/Tallec7/neopro/commit/01e870271047ccae2e35b20a687df0239db57c3c))
- **scripts:** correct club config path and improve setup workflow ([#54](https://github.com/Tallec7/neopro/issues/54)) ([f3fdd37](https://github.com/Tallec7/neopro/commit/f3fdd37cea0950b196f263cabf421f8673451f9c))
- **scripts:** correct test script to use ng test ([#91](https://github.com/Tallec7/neopro/issues/91)) ([bfcefac](https://github.com/Tallec7/neopro/commit/bfcefacbc5db904fd08fb26c8514bf4d792cb19d))
- **security:** resolve 4 critical/high security vulnerabilities ([#32](https://github.com/Tallec7/neopro/issues/32)) ([32184d4](https://github.com/Tallec7/neopro/commit/32184d4d959d68125a36c481a05a15bae58b4ee4))
- ser ([c6b7e6c](https://github.com/Tallec7/neopro/commit/c6b7e6c0046563503046f2e07ad3146563b2d17b))
- server ([c0a47a9](https://github.com/Tallec7/neopro/commit/c0a47a9f1df16838326b79fe876ab0d83201530b))
- server dash ([03b6546](https://github.com/Tallec7/neopro/commit/03b654606c1ab538145f61029646b20235cb05cb))
- server render ([2bd5a24](https://github.com/Tallec7/neopro/commit/2bd5a243804ccefa714f7f487dc2a6ceb986e3c6))
- **server:** allow DB CA files ([14036b0](https://github.com/Tallec7/neopro/commit/14036b077e298b66db350314bdb228b419b5216d))
- **server:** start HTTP server immediately for Render health checks ([5469556](https://github.com/Tallec7/neopro/commit/5469556db1c66a8de39b3c15b9a781ae080d0f50))
- **server:** start HTTP server immediately for Render health checks ([#162](https://github.com/Tallec7/neopro/issues/162)) ([7d31c81](https://github.com/Tallec7/neopro/commit/7d31c818732838cab912237dbb7bccd2220179cc))
- **setup:** automate sync-agent registration with env vars ([8b7452d](https://github.com/Tallec7/neopro/commit/8b7452dfd94e0ace277c9bad50238a07e7d53c0f))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#48](https://github.com/Tallec7/neopro/issues/48)) ([a73ac93](https://github.com/Tallec7/neopro/commit/a73ac937ec3e90eb68db1939daaa0293f09e4c40))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#49](https://github.com/Tallec7/neopro/issues/49)) ([a025c92](https://github.com/Tallec7/neopro/commit/a025c928217847a0113c73f0c4c042047ded09a6))
- **setup:** generate config in dashboard-compatible format ([475ce26](https://github.com/Tallec7/neopro/commit/475ce2642b893890d41813f00b8887b627da438c))
- **setup:** use interactive SSH for sync-agent registration ([d2f883f](https://github.com/Tallec7/neopro/commit/d2f883fd5df05d57b403aeb439a08341716505e3))
- **setup:** use interactive SSH for sync-agent registration ([#42](https://github.com/Tallec7/neopro/issues/42)) ([6199ea5](https://github.com/Tallec7/neopro/commit/6199ea537233a7a8ee1ce238e8f0b71eaa2299f3))
- simplify CI/CD for Render.com deployment ([#285](https://github.com/Tallec7/neopro/issues/285)) ([d367c4c](https://github.com/Tallec7/neopro/commit/d367c4c09d6b0a7cc1c4b27c07e0a8eff8fc7208))
- **sites:** handle duplicate site names with -N suffix ([ca598a3](https://github.com/Tallec7/neopro/commit/ca598a3e6a798d68acdd0cbfdf5e2f2d6b8b0248))
- **sites:** use actual hardware model instead of hardcoded value ([#84](https://github.com/Tallec7/neopro/issues/84)) ([371dfc6](https://github.com/Tallec7/neopro/commit/371dfc6ee4eaa2fadb9626a0f18021c0123f0a0a))
- socket ([b54a573](https://github.com/Tallec7/neopro/commit/b54a5730e10b2864daee918f725d8e0d99c17d02))
- **socket:** add JWT authentication for dashboard users ([8fba417](https://github.com/Tallec7/neopro/commit/8fba4174e22521c60b002e3e86d40f39bdc949c0))
- **socket:** add periodic DB/WebSocket status sync to fix zombie sites ([fc03ea5](https://github.com/Tallec7/neopro/commit/fc03ea55b8e835adcd524a8deeceb00c53ecac89))
- **socket:** command timeout now handles 'executing' status ([#152](https://github.com/Tallec7/neopro/issues/152)) ([d92cdaa](https://github.com/Tallec7/neopro/commit/d92cdaabad76600a267a6726713cdeb971b0dca1))
- **socket:** detect and handle zombie connections ([3ac863f](https://github.com/Tallec7/neopro/commit/3ac863ff8eba5ac492b4b74bef9f550b77aa9512))
- **socket:** disable verbose logs in production ([#192](https://github.com/Tallec7/neopro/issues/192)) ([50f1e12](https://github.com/Tallec7/neopro/commit/50f1e125016d8a046387de5d05d947ae54686a91))
- sponsor detail API response format + TypeScript build errors ([#205](https://github.com/Tallec7/neopro/issues/205)) ([e2ed287](https://github.com/Tallec7/neopro/commit/e2ed287f87817618211b089598be39d1a9d6ede8))
- sync ([cfadf1d](https://github.com/Tallec7/neopro/commit/cfadf1deb95fc5cb15481fea90591d6691aeceb5))
- sync-agent ([977156d](https://github.com/Tallec7/neopro/commit/977156dc4b5cb86ca08a7366e300622ff94a748e))
- **sync-agent:** add get_config to allowed commands in site registration scripts ([#68](https://github.com/Tallec7/neopro/issues/68)) ([53af0f2](https://github.com/Tallec7/neopro/commit/53af0f2b824c05897cd356e98606cd73df567729))
- **sync-agent:** add npm install for sync-agent in update-software.js ([b11f7f2](https://github.com/Tallec7/neopro/commit/b11f7f2efa1eed687dff31f49eed6d053c1ad259))
- **sync-agent:** add retry logic and service existence check to startServices ([d301dd9](https://github.com/Tallec7/neopro/commit/d301dd98156ebe8afbdf9a8c9abcbe9ef34ff331))
- **sync-agent:** Add scoreOverlay support in config merge ([06fcc93](https://github.com/Tallec7/neopro/commit/06fcc93e6efc2ab829c813f3c1f96ba58fc68ecc))
- **sync-agent:** add try/catch and logging to startVideoWatcher ([c1670bc](https://github.com/Tallec7/neopro/commit/c1670bc176cdb205e7f4f51d32dce1a402858ce2))
- **sync-agent:** align update-software.js with deploy-remote.sh ([4ffb4d7](https://github.com/Tallec7/neopro/commit/4ffb4d75b66e1aa8ef00faf24a1a81e6191e25ef))
- **sync-agent:** config deployment now properly notifies local app and supports replace mode ([8ba4968](https://github.com/Tallec7/neopro/commit/8ba4968d4a7b8e4d89ca920b2fa682c26daaf95e))
- **sync-agent:** correct path concatenation in update-software.js ([d51f269](https://github.com/Tallec7/neopro/commit/d51f26967b43a3f0539f7bfdf6e2dc949436ec2c))
- **sync-agent:** deploy remotePassword to auth.password for /remote login ([49e49f1](https://github.com/Tallec7/neopro/commit/49e49f174c7fcb2da9650d5d9c79ef8ac928c2e8))
- **sync-agent:** detect and recover from zombie connections ([fe55b89](https://github.com/Tallec7/neopro/commit/fe55b89827a3acf38f3d0262590a6bb10910620f))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#45](https://github.com/Tallec7/neopro/issues/45)) ([529c949](https://github.com/Tallec7/neopro/commit/529c9491c15277a13caa8cca6f29627086fe6376))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#47](https://github.com/Tallec7/neopro/issues/47)) ([edb2294](https://github.com/Tallec7/neopro/commit/edb2294e75cd82035b711ccdde5cc5c9ed60664f))
- **sync-agent:** include deploymentId in update_progress events ([30985fc](https://github.com/Tallec7/neopro/commit/30985fc408cffdfd5e3efd4518926279435ff563))
- **sync-agent:** include deploymentId in update_progress events ([5522b39](https://github.com/Tallec7/neopro/commit/5522b394c67b32eaeddf72330e4ab30776ab29f0))
- **sync-agent:** send analytics independently of WebSocket connection ([#145](https://github.com/Tallec7/neopro/issues/145)) ([7d59247](https://github.com/Tallec7/neopro/commit/7d5924723b0b398b4861a5d97568d7664ab999ca))
- **sync-agent:** use available memory instead of used for accurate RAM metrics ([1c082b7](https://github.com/Tallec7/neopro/commit/1c082b759886d4c33ee25910aa2f3e6324aad1c7))
- **sync-agent:** use polling instead of recursive fs.watch on Linux ([bfb3eac](https://github.com/Tallec7/neopro/commit/bfb3eac948cc461bd19b447e5d73780807d516ab))
- **sync-agent:** use sudo for VERSION/release.json to handle root ownership ([1ecd7a5](https://github.com/Tallec7/neopro/commit/1ecd7a5b7f4ca04d9f819d45b4a7ed81a4a35ee1))
- **thumbnails:** add cache-buster to refresh thumbnails after regeneration ([01d016c](https://github.com/Tallec7/neopro/commit/01d016cea5b9bf7e9f2c15e2e0ec80f634e14907))
- **thumbnails:** move thumbnail when video is renamed ([b955386](https://github.com/Tallec7/neopro/commit/b9553865203bf7bc0b0be5bc606a18b11869aee0))
- tighten pending config typings ([23f2b73](https://github.com/Tallec7/neopro/commit/23f2b7309338175c0ea78dff555269944266d231))
- **tv:** improve double-buffer video transitions to prevent stuttering ([#342](https://github.com/Tallec7/neopro/issues/342)) ([b95d271](https://github.com/Tallec7/neopro/commit/b95d2710c7f14c5cff75e07d4d95f8af759d1d71))
- **tv:** require liveScoreEnabled from central to display score overlay ([8e1b2b8](https://github.com/Tallec7/neopro/commit/8e1b2b883e98d999991ddae62c2524cbd968c930))
- type-safe diff counts in config editor ([9f759f2](https://github.com/Tallec7/neopro/commit/9f759f2c1a15d7fca0622a64a97b81289fe82f64))
- **types:** Add index signatures for PostgreSQL QueryResultRow compatibility ([ae56672](https://github.com/Tallec7/neopro/commit/ae56672840e77f3dc692d27a3a827f388e967384))
- **ui:** Fix language selector dropdown on login pages ([89af4d3](https://github.com/Tallec7/neopro/commit/89af4d326f359dd939234e4cb85a87d3cbca0024))
- **ui:** Replace Tailwind classes with native CSS in agencies-management component ([83edcd3](https://github.com/Tallec7/neopro/commit/83edcd3dc27675e3867e944ebd9879763c4af983))
- **ui:** Replace Tailwind classes with native CSS in users-management component ([c63e6c1](https://github.com/Tallec7/neopro/commit/c63e6c11dca7a3de14c2c6cb95b7112335388459))
- update angular.json paths from raspberry/frontend to raspberry/src ([#242](https://github.com/Tallec7/neopro/issues/242)) ([ba4881e](https://github.com/Tallec7/neopro/commit/ba4881eb42683ba60e2844be67ca3ea26b9b06ce))
- update API URL to point to neopro-central.onrender.com ([7161f2c](https://github.com/Tallec7/neopro/commit/7161f2ced955378a2e264e16e491de9d15fb1ae6))
- update parm ([03f4c79](https://github.com/Tallec7/neopro/commit/03f4c79eac7fba5763c2d1d59ab30257c3b34f93))
- update Render URL from neopro-central-server to neopro-central ([15e53e0](https://github.com/Tallec7/neopro/commit/15e53e00e9cfddd7c85afb32f3767f6de200e4a0))
- update render.yaml to use raspberry/server for Socket.IO ([1459da1](https://github.com/Tallec7/neopro/commit/1459da126f9f192530ff15fc020dda277146af3c))
- update sponsors array during video deployment for analytics tracking ([#273](https://github.com/Tallec7/neopro/issues/273)) ([0b370de](https://github.com/Tallec7/neopro/commit/0b370de2a281187318593f55da3223a601022a6c))
- **updates:** add debug logging and endpoint for Socket.IO connection state ([cfae283](https://github.com/Tallec7/neopro/commit/cfae28356af5e2fd796f80fdc4b13e430074a508))
- **updates:** preserve user data during software updates ([#36](https://github.com/Tallec7/neopro/issues/36)) ([e897a22](https://github.com/Tallec7/neopro/commit/e897a225bb3a4dc7972d10825ad46d64cf15aedb))
- **updates:** use commandQueueService for update deployments like update_config ([818ede3](https://github.com/Tallec7/neopro/commit/818ede35eb466c6f202006f126dbd13f1f780f5c))
- url prod ([6799b0f](https://github.com/Tallec7/neopro/commit/6799b0fce3b577b13c0b5deb99b9276eb914f574))
- url prod ([49766d5](https://github.com/Tallec7/neopro/commit/49766d57e75f03459d53ffe2b990a979e46d6928))
- use chromium binary for kiosk service ([d412061](https://github.com/Tallec7/neopro/commit/d412061517f588d546b6a0df70cbc735ab3be6b2))
- use dynamic URL for analytics API instead of relative path ([f65951e](https://github.com/Tallec7/neopro/commit/f65951e8587d27cdcc093123d0ec53244e555924))
- use dynamic URL for auth API instead of localhost ([b0ecaa1](https://github.com/Tallec7/neopro/commit/b0ecaa11c6695c19c9775ea109c837e29d38da83))
- use fallbackLang instead of deprecated defaultLanguage ([8a8f71f](https://github.com/Tallec7/neopro/commit/8a8f71f82c69213da84e58cee584f9c239f93097))
- video inter ([f9a1b8f](https://github.com/Tallec7/neopro/commit/f9a1b8f31e0279b5b8d53b44e791d1defad6df6d))
- **websocket:** Connect WebSocket after user authentication ([4809af7](https://github.com/Tallec7/neopro/commit/4809af73914001fd44a56141876b8b9de6236c76))

### Code Refactoring

- **structure:** reorganize monorepo with unified Angular workspace ([#96](https://github.com/Tallec7/neopro/issues/96)) ([4f5cbe8](https://github.com/Tallec7/neopro/commit/4f5cbe8ae07831ea31149b5c5b88ad566e2cf6de))

### Features

- add /admin demo mode for Hostinger deployment ([#138](https://github.com/Tallec7/neopro/issues/138)) ([3b979e2](https://github.com/Tallec7/neopro/commit/3b979e282b10e8d794b8967a45e72e6308d52358))
- add automated script to create golden image from Mac ([#239](https://github.com/Tallec7/neopro/issues/239)) ([b782d1d](https://github.com/Tallec7/neopro/commit/b782d1ddade204a3140df20afbb7f38080cdbf3d))
- Add complete Raspberry Pi autonomous system (4 phases) ([302cb1a](https://github.com/Tallec7/neopro/commit/302cb1a97b4e48c24f337b1c049ac3072ffed7f5))
- add comprehensive security, performance, and accessibility improvements to admin panel ([#259](https://github.com/Tallec7/neopro/issues/259)) ([556893a](https://github.com/Tallec7/neopro/commit/556893a6db043e354371bf1053d507d4e1d9af59)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- Add local development setup with admin demo mode ([8fa4529](https://github.com/Tallec7/neopro/commit/8fa4529b9ea5ce7e44bb75da8af6eb28e25cf470))
- add missing API routes for content and updates management ([b9baa4d](https://github.com/Tallec7/neopro/commit/b9baa4dce914f79e01e3677ea6f21f64f6c7df62))
- add monitoring, alerting and frontend tests ([#124](https://github.com/Tallec7/neopro/issues/124)) ([cf9c12c](https://github.com/Tallec7/neopro/commit/cf9c12cfe32f3bc09e5e539e21219210284f9df2))
- Add Real-Time Connection Status Indicator ([#262](https://github.com/Tallec7/neopro/issues/262)) ([476e445](https://github.com/Tallec7/neopro/commit/476e445f123dcbd56239702cc289222338b8a68a)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- add remote club setup without local dependencies ([#256](https://github.com/Tallec7/neopro/issues/256)) ([77ca008](https://github.com/Tallec7/neopro/commit/77ca0086ce99d2eb4c4f2798af5bc41553fb49d6))
- add remote config deployment via central dashboard ([#26](https://github.com/Tallec7/neopro/issues/26)) ([2f28980](https://github.com/Tallec7/neopro/commit/2f289807af0de32b12b01b038aa34e2b1a626f2d))
- add script to generate club config from video directory ([#137](https://github.com/Tallec7/neopro/issues/137)) ([50e6386](https://github.com/Tallec7/neopro/commit/50e63865b2e1493f319e17732726303427802d67))
- add Sponsors navigation link to sidebar menu ([#196](https://github.com/Tallec7/neopro/issues/196)) ([8d581b5](https://github.com/Tallec7/neopro/commit/8d581b55fa49dedb7302ab5f4c112c144f8e81a6))
- Add subcategory support in admin video upload ([492b158](https://github.com/Tallec7/neopro/commit/492b1588b6c1d0dd97d2a77fe11daaf8baeff581))
- add video loop per match phase (before/during/after) ([#279](https://github.com/Tallec7/neopro/issues/279)) ([5257ff8](https://github.com/Tallec7/neopro/commit/5257ff84f2e5907c0ff126de01cb8da083eea180))
- **admin:** add bulk video categorization and thumbnail regeneration ([73560d7](https://github.com/Tallec7/neopro/commit/73560d722fca9d039248b8c536c71776a7cce3e7))
- **admin:** Add user management and password reset features ([aaf3f95](https://github.com/Tallec7/neopro/commit/aaf3f95c8cb7b567c66a03ba8f1564d05f3d920b))
- améliorer les uploads et la gestion des vidéos ([590c2e8](https://github.com/Tallec7/neopro/commit/590c2e8f28b44dee1162634b5a127a831c561c06))
- **analytics:** configurable analytics categories per site ([#147](https://github.com/Tallec7/neopro/issues/147)) ([ebe8a0f](https://github.com/Tallec7/neopro/commit/ebe8a0f56d60d7b47baee0da84cda907bab376a2))
- **analytics:** implement complete club analytics system (MVP + Phase 2 + Phase 3) ([#35](https://github.com/Tallec7/neopro/issues/35)) ([8d54c54](https://github.com/Tallec7/neopro/commit/8d54c54419d54a9a960950bda7d8c17a35533fdd))
- **api:** Add multi-tenant site filtering for agency and sponsor users ([ce59dba](https://github.com/Tallec7/neopro/commit/ce59dbaa2d12d98cfc3cc88c2a5ec90b010bf00d))
- **audit:** add live match event auditing ([05c2ab8](https://github.com/Tallec7/neopro/commit/05c2ab8520ad393bfd4915c860b4ab26b2fc7c44))
- auto deploy pending config ([5fcd1fe](https://github.com/Tallec7/neopro/commit/5fcd1fe625b3074beb4f1e5d252f0b19d2205e06))
- automatic deployment of live score option to Raspberry Pi ([#229](https://github.com/Tallec7/neopro/issues/229)) ([784b541](https://github.com/Tallec7/neopro/commit/784b541d035d82719886d9ca91e0c67a543b2363))
- **build:** add integrity check and version sync to build-raspberry.sh ([dd0cf5d](https://github.com/Tallec7/neopro/commit/dd0cf5dfc1daa4acec0c0410f3768bb77fd1c23c))
- **build:** include node_modules in deploy archive ([f6203be](https://github.com/Tallec7/neopro/commit/f6203be9ea1d28337356c53f42fe557554d85af9))
- **central-dashboard:** implement all TODO features ([#27](https://github.com/Tallec7/neopro/issues/27)) ([06b6778](https://github.com/Tallec7/neopro/commit/06b67786f96d65c361a788d0fc5605fe9c3eb241))
- **ci:** implement automatic semantic versioning ([d763138](https://github.com/Tallec7/neopro/commit/d76313854eb5733b16a4c078ac823d7511f8de5e))
- complete all dashboard UI components (100%) ([96607d2](https://github.com/Tallec7/neopro/commit/96607d256b632fad6730c9b3a8da3279a0387c36))
- comprehensive test coverage and sync reliability improvements ([#139](https://github.com/Tallec7/neopro/issues/139)) ([370e713](https://github.com/Tallec7/neopro/commit/370e713ff69d90a06f8a2c8dbc84c30d70c8ed24))
- **config-editor:** add structured config editor with history and diff ([#74](https://github.com/Tallec7/neopro/issues/74)) ([28c220d](https://github.com/Tallec7/neopro/commit/28c220d6644e5eb499a4dcfde061c8093818989c))
- **config:** add timeCategories and video CRUD management ([#80](https://github.com/Tallec7/neopro/issues/80)) ([ce4f091](https://github.com/Tallec7/neopro/commit/ce4f091ffc1750e5a87b13e35a1d333a94b0033c))
- **config:** add timeCategories and video CRUD management ([#81](https://github.com/Tallec7/neopro/issues/81)) ([c163795](https://github.com/Tallec7/neopro/commit/c1637956daeee6bc4437047796c9e7c026c2bcce))
- **core:** Migrate Sponsor → Advertiser (Annonceur) terminology ([83955ad](https://github.com/Tallec7/neopro/commit/83955ad8d3d88741fad6ca8661868c4258669775))
- **dashboard:** add 'Refresh from Pi' button to Content tab ([6d16afa](https://github.com/Tallec7/neopro/commit/6d16afafe3cff6b2d05ef648c3420896231a80a0))
- **dashboard:** add centralized error handling system ([53887b8](https://github.com/Tallec7/neopro/commit/53887b824f82d9b5cdcbfad4d58254acb10f3042))
- **dashboard:** add expandable details to config diff items ([2f99207](https://github.com/Tallec7/neopro/commit/2f9920712475f8a88a7423d8f59e736787036464))
- **dashboard:** add live score toggle in site detail page ([#209](https://github.com/Tallec7/neopro/issues/209)) ([8d962df](https://github.com/Tallec7/neopro/commit/8d962df15c140d65ca25fd3596f808f6ab3a7f8a))
- **dashboard:** add log throttling to prevent 429 errors ([ee27f4d](https://github.com/Tallec7/neopro/commit/ee27f4d42a1fc672a75c1b997ac379e14bf16ea9))
- **dashboard:** add QR code generator for remote access ([b716549](https://github.com/Tallec7/neopro/commit/b716549b5e7c01555859afce8e5602210905d819))
- **dashboard:** add real-time deployment feedback via Socket.IO ([7910bc2](https://github.com/Tallec7/neopro/commit/7910bc2f6201881e19c2b7ec626ecb6e1b3c6363))
- **dashboard:** add remote network diagnostics for sites ([#212](https://github.com/Tallec7/neopro/issues/212)) ([1d175c8](https://github.com/Tallec7/neopro/commit/1d175c82ba143f814f847d2407c674b44e50661d))
- **dashboard:** allow multi-video deployments ([75962a8](https://github.com/Tallec7/neopro/commit/75962a86a1263471d0a1270f176c35716babc6c8))
- **dashboard:** improve config diff display with human-readable labels ([c70207b](https://github.com/Tallec7/neopro/commit/c70207b0cd1b1f070b3135de7f07b1d7eb807355))
- **dashboard:** improve debug tab with timeline, export bundle and UI cleanup ([f0dba6b](https://github.com/Tallec7/neopro/commit/f0dba6b83696f08bb997d450502ec2ea768f51cd))
- **dashboard:** load existing site configuration in editor ([ba31600](https://github.com/Tallec7/neopro/commit/ba31600f022e3b0825ef6e4cd98d4058e036b0e6))
- **dashboard:** load existing site configuration in editor ([#62](https://github.com/Tallec7/neopro/issues/62)) ([65e4b06](https://github.com/Tallec7/neopro/commit/65e4b064bc30faf254403874edf6b08d949e0555))
- **dashboard:** optimize API polling with cache and aggregated endpoint ([a1012db](https://github.com/Tallec7/neopro/commit/a1012db473bd5b95e603583894dd7efb5c40c3b8))
- **dashboard:** refactor site-detail with tabs, N videos per phase, subcategory mapping ([3def8e1](https://github.com/Tallec7/neopro/commit/3def8e1c372ee3b12295476e7bb43e50585a2118))
- **dashboard:** replace alert() with global toast notifications ([#33](https://github.com/Tallec7/neopro/issues/33)) ([331e2ad](https://github.com/Tallec7/neopro/commit/331e2ad31b456c4d40924912f18dbada39d735cc))
- **dashboard:** restore missing features from config editor refactoring ([9c6def2](https://github.com/Tallec7/neopro/commit/9c6def2dc0448eec03fd166ff7745693304e9206))
- **data-retention:** add automatic cleanup for historical data ([e99a044](https://github.com/Tallec7/neopro/commit/e99a0447890e892f3eb436d61ca284f011f5a0cd))
- **debug:** add remote shell terminal for Pi debugging ([8cf244e](https://github.com/Tallec7/neopro/commit/8cf244e34f3274dbf4fc65d5d915241578843a70))
- **demo:** add demo build configuration and update docs ([#86](https://github.com/Tallec7/neopro/issues/86)) ([6124fdc](https://github.com/Tallec7/neopro/commit/6124fdcfc61f4916f11438cf6691bb3fd2331961))
- **demo:** add demo mode with club selector for presentations ([#85](https://github.com/Tallec7/neopro/issues/85)) ([d836a6d](https://github.com/Tallec7/neopro/commit/d836a6d1eaa480a4f018b6abe315bc2eae5c4b7f))
- **demo:** load clubs list dynamically from JSON file ([#89](https://github.com/Tallec7/neopro/issues/89)) ([95ea0af](https://github.com/Tallec7/neopro/commit/95ea0af79f07bb5442b85890edfc602902e88ede))
- **deployment:** use commandQueueService for video deployments ([770457c](https://github.com/Tallec7/neopro/commit/770457c448e01202fb9c74a7f7ecae5a90dd104e))
- editable ownership (Club vs NEOPRO) for categories, subcats, videos ([1bf8ca6](https://github.com/Tallec7/neopro/commit/1bf8ca6d311fb0f805641806946707738531f40f))
- granular config diff for arrays by id ([87748bc](https://github.com/Tallec7/neopro/commit/87748bce3c2bfe47205b392d2877ab39ed347b67))
- Implement all system TODOs (7 items) ([832ad00](https://github.com/Tallec7/neopro/commit/832ad00d9616bf73f34f0662c745fbb8ba68a431))
- implement automatic software update deployment to Raspberry Pi ([#275](https://github.com/Tallec7/neopro/issues/275)) ([d924bb7](https://github.com/Tallec7/neopro/commit/d924bb749b93e70fd3f2f02a842f0aef2d1667b6))
- implement complete NEOPRO fleet management system ([197e2f7](https://github.com/Tallec7/neopro/commit/197e2f7d848803be1aec449686d102f5964f9d25))
- integrate NEOPRO brand guidelines across all apps ([#28](https://github.com/Tallec7/neopro/issues/28)) ([f148152](https://github.com/Tallec7/neopro/commit/f1481521a61084541c032213820a32612e948f24))
- IP tracking and remote hotspot WiFi configuration ([#132](https://github.com/Tallec7/neopro/issues/132)) ([89ac5b9](https://github.com/Tallec7/neopro/commit/89ac5b900e5d3abb45050e5f48ade88189f0ae0b))
- **kiosk:** add watchdog to recover from Chromium "Aw, Snap!" crashes ([013ed4a](https://github.com/Tallec7/neopro/commit/013ed4aaf7064fde7d11741cd74fde267dde5ed3))
- let admins choose merge vs replace and improve diff preview ([fd4b9fe](https://github.com/Tallec7/neopro/commit/fd4b9fed7fd7ae28a2773812095ed7b9aaa9dac8))
- Live Score - Fonctionnalité complète ([#292](https://github.com/Tallec7/neopro/issues/292)) ([17bdb8a](https://github.com/Tallec7/neopro/commit/17bdb8a492e8139d7b4f2510d70d4bbb56ac1a2f))
- **login:** display club info on login pages (ports 80 & 8080) ([c8892d5](https://github.com/Tallec7/neopro/commit/c8892d5eedd10676d6e423df95f991ae0ce0c57e))
- major features implementation - RLS, Live-Score, OpenAPI docs ([#222](https://github.com/Tallec7/neopro/issues/222)) ([53894f5](https://github.com/Tallec7/neopro/commit/53894f599b5873cc6bda79ab5e6a9318e6eebf1c))
- migrate backend from Render to Railway ([6909adb](https://github.com/Tallec7/neopro/commit/6909adb987d215d9421aa07f4737ee62bd314687))
- **overlay:** Implement local overlay system with Options, Timer, Breaking News ([f4a030a](https://github.com/Tallec7/neopro/commit/f4a030a558842fa5803a8e1634202f713bb5e115))
- **overlay:** Major V2 with multi-sport support and animations ([f412646](https://github.com/Tallec7/neopro/commit/f4126464eefbd16cab20875b6b68622c0b07a579))
- ownership selector for sponsors and types updated ([21355b1](https://github.com/Tallec7/neopro/commit/21355b1d3c534de95c0a08e3012c8af5038a6850))
- propagate release version everywhere ([414d276](https://github.com/Tallec7/neopro/commit/414d27656906ec92b77ef56a7eac1ed96fc463fe))
- propagate release version everywhere ([322c499](https://github.com/Tallec7/neopro/commit/322c499dfb56135d32020e6d33767d391303fdc3))
- propagate video_id, sponsor_id and analytics_category through deployment and tracking ([#270](https://github.com/Tallec7/neopro/issues/270)) ([58e4a0a](https://github.com/Tallec7/neopro/commit/58e4a0a55c227b31b45552757a37747b31297c36))
- **qr-code:** add dedicated hotspot-config endpoint for real SSID ([88f01fc](https://github.com/Tallec7/neopro/commit/88f01fc32976d761cb75379d43a2c3364badf1a2))
- **qr-code:** fetch real SSID via get_hotspot_config command ([d5ddaa1](https://github.com/Tallec7/neopro/commit/d5ddaa1f54ae0a7d8167cb5e751293408a8de427))
- **qr-code:** use Neopro logo image instead of text ([fa0c833](https://github.com/Tallec7/neopro/commit/fa0c83386188870d31de5985747d4292800cf4f5))
- **raspberry:** add captive portal support for Android hotspot connectivity ([c8ffe4f](https://github.com/Tallec7/neopro/commit/c8ffe4ffbf4f12d5f78c4e7e2dae63af5e53b7f7))
- **raspberry:** improve deployment scripts and add backup/restore ([#50](https://github.com/Tallec7/neopro/issues/50)) ([1c852fb](https://github.com/Tallec7/neopro/commit/1c852fb16a3cc784f07156f7aa47f517655bddda))
- **raspberry:** Improve login page UI and make footer dynamic ([83ea158](https://github.com/Tallec7/neopro/commit/83ea15880369f76c519190c8028ee315059185a1))
- remote sync-agent update and hotspot configuration ([#135](https://github.com/Tallec7/neopro/issues/135)) ([518524c](https://github.com/Tallec7/neopro/commit/518524c983c198ea20a38e1e620c6ebe604eec8e))
- **remote-shell:** add remote shell command support ([b69f89b](https://github.com/Tallec7/neopro/commit/b69f89bad7cfdc8cdb862789e8da4286e51f387e))
- **remote-shell:** allow rm -rf on safe paths for super_admin ([a548a2e](https://github.com/Tallec7/neopro/commit/a548a2e413da5f0cf9d10badfe6ec4bff689164d))
- **remote:** Enhance sponsor display with overlay and improved UI ([468af29](https://github.com/Tallec7/neopro/commit/468af297ce3c6861d64c4851482142ee9578d039))
- **remote:** refonte télécommande v2 avec affluence et live score ([#206](https://github.com/Tallec7/neopro/issues/206)) ([1eeb5fa](https://github.com/Tallec7/neopro/commit/1eeb5fa12cbc24b94d7eb5cf3618b9159078dd6c))
- **scripts:** improve changelog with per-commit detail files ([#56](https://github.com/Tallec7/neopro/issues/56)) ([8b0bd6a](https://github.com/Tallec7/neopro/commit/8b0bd6ae83e58b19a8edfe4b8abaa5d66f0cb4f0))
- **server:** Implement January 2026 P1 features ([#333](https://github.com/Tallec7/neopro/issues/333)) ([2547aaa](https://github.com/Tallec7/neopro/commit/2547aaa5cc8e975aa049ec103c73f54f1adc1d13))
- **sponsors:** Complete sponsor usage management (100% BP §13) ([#325](https://github.com/Tallec7/neopro/issues/325)) ([9669087](https://github.com/Tallec7/neopro/commit/9669087db4f154a5b467d0ad7dc39b28251badac))
- start central stack locally and add dashboard placeholders ([37234dc](https://github.com/Tallec7/neopro/commit/37234dc7735805fae3319b711cdd1f5f7e6b3470))
- start central stack locally and add dashboard placeholders bis ([5a07144](https://github.com/Tallec7/neopro/commit/5a0714457641c6ef5b048b077e951b14435d35f3))
- **sync-agent:** keep human friendly video names ([4090511](https://github.com/Tallec7/neopro/commit/4090511151ec41a74ba33be5d6b903ae2ae5aa4a))
- **sync:** add local video list synchronization from Pi to central ([cc514d6](https://github.com/Tallec7/neopro/commit/cc514d6a94463e1834da7b5eff79cf242089d617))
- **testing:** add comprehensive test dashboard and toolkit ([788a883](https://github.com/Tallec7/neopro/commit/788a88393be6b2a4eb50bbfbcf0bd1d27f6eea1e))
- **tv:** add video error recovery system with watchdog ([0455c38](https://github.com/Tallec7/neopro/commit/0455c388e8238c2465e215f44471ecd30a8b105e))
- **tv:** implement double-buffer video system for seamless loop transitions ([#340](https://github.com/Tallec7/neopro/issues/340)) ([8063b0e](https://github.com/Tallec7/neopro/commit/8063b0e69719a4e265ec2c6ea7856a81b6ff38f6))
- unify premium option for score and remote options ([db6351f](https://github.com/Tallec7/neopro/commit/db6351fb89faaf734d8460256fcd3b497aab5d95))
- update central server config and scripts for Supabase/Render ([e537a3f](https://github.com/Tallec7/neopro/commit/e537a3f0518d2d31d5dce917f5053eb008812f24))
- update video ([5ef86ba](https://github.com/Tallec7/neopro/commit/5ef86ba0ce98b22f6290904547990e5c2a794618))
- **updates:** add FTP diagnostic endpoint for software updates ([7f5543b](https://github.com/Tallec7/neopro/commit/7f5543b2450e7d24f2074e1dd93b79285056f6bc))
- **updates:** add upload progress tracking with retry ([30416b9](https://github.com/Tallec7/neopro/commit/30416b905a7eee9c69bfa0fdc3ab1abdb03be3dc))
- **upload:** add multiple video upload support ([#125](https://github.com/Tallec7/neopro/issues/125)) ([22ae329](https://github.com/Tallec7/neopro/commit/22ae32948457bb1dba826a95f6de4efc0f929f5b))
- **video-library:** add multi-select, category column, duration extraction ([9a4f501](https://github.com/Tallec7/neopro/commit/9a4f5016146f7cfe82c82eb1568737f93eb512a9))
- **video-upload:** implement file upload with multer ([#63](https://github.com/Tallec7/neopro/issues/63)) ([8543604](https://github.com/Tallec7/neopro/commit/85436041462667e797ac0e776c33296c77e0c663))
- **websocket:** améliorer la détection de connexion avec ping/pong ([#295](https://github.com/Tallec7/neopro/issues/295)) ([6896ce3](https://github.com/Tallec7/neopro/commit/6896ce3dc55d13b2b2e9f83eaa65cdce6742691e))

### Performance Improvements

- **memory:** adjust thresholds for Railway Hobby plan ([ab703a2](https://github.com/Tallec7/neopro/commit/ab703a26cedb693fcb2a4c029234a5ab9b9b08f4))
- **memory:** optimize for Railway Hobby plan constraints ([9cbe517](https://github.com/Tallec7/neopro/commit/9cbe517b11c7f4c75711f9c56155450f3a20a1cb))

### Reverts

- remove NgZone/ChangeDetectorRef hacks, return to simple working code ([0eda9df](https://github.com/Tallec7/neopro/commit/0eda9df8efd6c83021ec83256899c85d0ac8834b))

### BREAKING CHANGES

- **structure:** Project structure changed

* src/ -> raspberry/frontend/
* public/ -> raspberry/public/
* ng build -> ng build raspberry
* ng test -> ng test raspberry (or central-dashboard)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-authored-by: Claude <noreply@anthropic.com>

# 1.0.0 (2026-01-11)

### Bug Fixes

- add CommonModule import to TvComponent to resolve \*ngIf warnings ([5a75dcb](https://github.com/Tallec7/neopro/commit/5a75dcb7ed2f241d6050d8ae4ffc17f50382da8a))
- add error logging to connection indicator component ([#160](https://github.com/Tallec7/neopro/issues/160)) ([0bdb9c3](https://github.com/Tallec7/neopro/commit/0bdb9c37ffe351e4f1ec745faa8f7baf15efd63a))
- add neoProContent property to Site interface ([#231](https://github.com/Tallec7/neopro/issues/231)) ([8842571](https://github.com/Tallec7/neopro/commit/884257112900203e37cd755115895359d071f0e7))
- add permissions to GitHub Actions workflow for releases ([#255](https://github.com/Tallec7/neopro/issues/255)) ([66f592c](https://github.com/Tallec7/neopro/commit/66f592c22a39284d82614ff8ddd769a759eae74c))
- add rootDirectory for central-server deployment ([cd1d708](https://github.com/Tallec7/neopro/commit/cd1d708d89428668c58147d1cea3ddcb1375c4d2))
- add validation for update_config command to prevent empty payload errors ([2d8e23f](https://github.com/Tallec7/neopro/commit/2d8e23f5dd9fb8ac63c481fa24f759bf59969d48))
- add validation for update_config command to prevent empty payload errors ([#136](https://github.com/Tallec7/neopro/issues/136)) ([85c0b10](https://github.com/Tallec7/neopro/commit/85c0b10f8250516417c70fc606bf7acdbbb70ef0))
- **admin:** Add 401 redirect to login and fix aria-hidden warnings ([9b4cfc9](https://github.com/Tallec7/neopro/commit/9b4cfc99ad5cdc9319110c0f4de122def0d950a9))
- **admin:** Add credentials to API fetch calls to fix 401 errors ([#330](https://github.com/Tallec7/neopro/issues/330)) ([9a1f871](https://github.com/Tallec7/neopro/commit/9a1f871094dbc3e57d2a06bce2f97f9233156882))
- **admin:** allow sudo restarts from local UI ([725b98e](https://github.com/Tallec7/neopro/commit/725b98ef2c37ba7655d5e144895ee748edd206bc))
- **admin:** Fix authentication cookie and fetch credentials for HTTP ([057d149](https://github.com/Tallec7/neopro/commit/057d149855eb63c166624af815322bf787aaf564))
- **admin:** Fix cache.invalidateNamespace method call ([84392a4](https://github.com/Tallec7/neopro/commit/84392a4907ddcef9f7988ef54f7bf2dfbeb1f9d9))
- **admin:** load video categories dynamically from configuration ([#107](https://github.com/Tallec7/neopro/issues/107)) ([a8fc9cf](https://github.com/Tallec7/neopro/commit/a8fc9cfd954479ad79863899d68f0cb87aa470df))
- **admin:** Serve thumbnails directory as static files ([5b73a5e](https://github.com/Tallec7/neopro/commit/5b73a5e536f4fb83b2c2c0a76a0b0f3ae05dcd0f))
- **admin:** serve video files statically on port 8080 ([#116](https://github.com/Tallec7/neopro/issues/116)) ([04d7679](https://github.com/Tallec7/neopro/commit/04d7679a60499517c9c8da57739a20d9b41e79ba))
- **admin:** serve video files statically on port 8080 ([#117](https://github.com/Tallec7/neopro/issues/117)) ([cfa1596](https://github.com/Tallec7/neopro/commit/cfa1596c1c416ac0a54c49147aced0bc406824a9))
- **analytics:** add TypeScript types for PostgreSQL query results ([c56d32d](https://github.com/Tallec7/neopro/commit/c56d32d90fe766c5ae9afb03e0fb813afd20bff6))
- **analytics:** align backend API responses with frontend interfaces ([#122](https://github.com/Tallec7/neopro/issues/122)) ([9289368](https://github.com/Tallec7/neopro/commit/9289368b3200379d72faf1ca4586c3ebacb481c1))
- **analytics:** bridge Angular app to sync-agent for analytics transmission ([#64](https://github.com/Tallec7/neopro/issues/64)) ([c4ab053](https://github.com/Tallec7/neopro/commit/c4ab053d8a0c08020612aa5e779d9e7d96897f53))
- **analytics:** resolve TypeScript strict null check errors ([#40](https://github.com/Tallec7/neopro/issues/40)) ([d08a46b](https://github.com/Tallec7/neopro/commit/d08a46bd7d1a591b94247c78424c345ab2232cc3))
- **api:** align isConnected with displayStatus in dashboard endpoint ([9a5f0fd](https://github.com/Tallec7/neopro/commit/9a5f0fd0607106cc01acbded3e17890702219437))
- **api:** fix FTP test route ordering and add package URL diagnostic ([d716b98](https://github.com/Tallec7/neopro/commit/d716b98f45a2400c98cb0cb2c832dba370325174))
- **api:** Fix sponsor site filtering SQL - use sponsor_videos table ([3986407](https://github.com/Tallec7/neopro/commit/398640774e83c7284cb379c091b5ef21044eaaab))
- **api:** normalize config before diff comparison to avoid false positives ([cd9b184](https://github.com/Tallec7/neopro/commit/cd9b184fd0cf811eb028741d832675d78d4b8c34))
- **api:** optimize monitoring endpoints to prevent rate limiting ([fa9a720](https://github.com/Tallec7/neopro/commit/fa9a7206fdf816ea76278727b9360849a096c2d9))
- **api:** relax connection status thresholds to reduce false warnings ([3924342](https://github.com/Tallec7/neopro/commit/3924342ec7d4ed3ddbf673ec009879bc54704660))
- **api:** Return empty data instead of 403 for unassigned portal users ([bf504e7](https://github.com/Tallec7/neopro/commit/bf504e71cd71d3a4fc00ab01b5c3d19d22a982b9))
- **api:** use effective connection status in getSiteConnectionStatus ([2538796](https://github.com/Tallec7/neopro/commit/2538796e2cfadd36eb7adbf844c54d28edecfc6d))
- **api:** use metrics table as fallback for connection status detection ([9d6ebd7](https://github.com/Tallec7/neopro/commit/9d6ebd717290072745bd1d7c30e7d9a10547dcb0))
- **api:** use real-time Socket.IO status in getSiteStats endpoint ([82ef761](https://github.com/Tallec7/neopro/commit/82ef7614489df6a933f0b433ead868ff628dbc40))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#203](https://github.com/Tallec7/neopro/issues/203)) ([971229d](https://github.com/Tallec7/neopro/commit/971229d414b764fdf5a572ad40582e21d03fe17e))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#204](https://github.com/Tallec7/neopro/issues/204)) ([eb8deca](https://github.com/Tallec7/neopro/commit/eb8deca2024d7fcd92f0c8a8201aedefb8299794))
- **audit:** add REMOTE_SHELL audit action types ([9b44e0a](https://github.com/Tallec7/neopro/commit/9b44e0aa98beabbf8d24b81d2d80c6f92fef8279))
- **auth:** Add Authorization header fallback for mobile Safari ([5817603](https://github.com/Tallec7/neopro/commit/5817603fc4428d4e74cf252a681551991e6a4725))
- **auth:** Enable cross-origin cookies for separate frontend/backend domains ([c18a1ab](https://github.com/Tallec7/neopro/commit/c18a1ab59ea4fe83f2dc0dd9660261426d722006))
- **auth:** Fix race condition after login redirect ([6660cfb](https://github.com/Tallec7/neopro/commit/6660cfb409a61b5c61ce04bfcfd7becab311a674))
- **auth:** Include super_admin role in layout permission checks ([6a397eb](https://github.com/Tallec7/neopro/commit/6a397ebe3ea7c6ab42e00501b16e53e1efa1aed1))
- **auth:** Safari mobile support via Authorization header fallback ([ded2118](https://github.com/Tallec7/neopro/commit/ded2118f4ce27f7dc7e01acd86b126e8a05146ad))
- **auth:** Safari support + 7 day sessions ([59c69be](https://github.com/Tallec7/neopro/commit/59c69bed63dd42531647a79ec4e76b1d231a491b))
- **auth:** Safari support + 7 day sessions ([d620981](https://github.com/Tallec7/neopro/commit/d62098111f8c0f65bf3284f2b37ab0edf7699da0))
- **auth:** separate rate limits for login vs session check ([f22c2d9](https://github.com/Tallec7/neopro/commit/f22c2d9abec5b2fef012e42cad3041d8fb971e33))
- **auth:** use SHA256 instead of bcrypt for site API keys ([50fbd75](https://github.com/Tallec7/neopro/commit/50fbd75e68c41b890d350933cbd643352019344e))
- auto-detect Chromium path for kiosk mode on Raspberry Pi ([#233](https://github.com/Tallec7/neopro/issues/233)) ([1e5d2af](https://github.com/Tallec7/neopro/commit/1e5d2afc20581d9046723493bd129e56fd50c345))
- **build:** include generate-all-thumbnails.sh in raspberry deploy ([c58936e](https://github.com/Tallec7/neopro/commit/c58936eb38504fb023ffe0624db6a63ad81bd935))
- **build:** resolve TypeScript compilation errors ([#38](https://github.com/Tallec7/neopro/issues/38)) ([7cde92c](https://github.com/Tallec7/neopro/commit/7cde92cc48908e050867f2db57856b482c63d359))
- **build:** use generic type for Socket.on callback ([#39](https://github.com/Tallec7/neopro/issues/39)) ([0437ee1](https://github.com/Tallec7/neopro/commit/0437ee171f2b24e5086d81b6c8de05298a012504))
- **build:** use raspberry configuration for Pi builds ([8561839](https://github.com/Tallec7/neopro/commit/85618391c24395439dd78bb2ef6be6998d563163))
- **central-server:** fix trust proxy and deploy_video command data ([#70](https://github.com/Tallec7/neopro/issues/70)) ([883a061](https://github.com/Tallec7/neopro/commit/883a061d6d74c1a8cc78f03cbf19b0d5f4159e35))
- **central-server:** resolve memory leaks causing 503 errors ([ce26498](https://github.com/Tallec7/neopro/commit/ce26498fc1541a4f732a448845f2fd68cdd31c08))
- **central-server:** use api_key instead of api_key_hash to match Supabase ([1f440dd](https://github.com/Tallec7/neopro/commit/1f440dd788ba9f81f85a5c4c1949c9bb0fea777f))
- **ci:** add package-lock.json for semantic-release workflow ([9f8f544](https://github.com/Tallec7/neopro/commit/9f8f544cc09a8324bbd2dc7ecc26e6dfdd7c4d5e))
- **ci:** upgrade Node.js to v22 for semantic-release v24 ([7bfd614](https://github.com/Tallec7/neopro/commit/7bfd614b3e1240a62109fd20ed819c345e03b58a))
- **command-executor:** fix TypeScript compilation errors ([4a106cc](https://github.com/Tallec7/neopro/commit/4a106ccc9069a7ec1f8819833b4ec6ec305bd116))
- config ([40c5bd2](https://github.com/Tallec7/neopro/commit/40c5bd294fc8eb59cb2f7683d7ca05499a7222ff))
- **config-editor:** fix Angular template arrow function error ([#82](https://github.com/Tallec7/neopro/issues/82)) ([8c03bd6](https://github.com/Tallec7/neopro/commit/8c03bd6b55a811495ce2845650f376e13dce17c8))
- **config-editor:** fix categories display and analytics mapping ([a335203](https://github.com/Tallec7/neopro/commit/a33520323bf932917277e67d533cbc4d670d0dd9))
- **config-editor:** force change detection after loading completes ([3442d9c](https://github.com/Tallec7/neopro/commit/3442d9cd7b11ae4056568a6ddefbf017b7aebc41))
- **config-editor:** force detectChanges in loading setter ([d187293](https://github.com/Tallec7/neopro/commit/d18729316cbd3f30f328b9b07c30dab46aeec030))
- **config-editor:** handle undefined videos/subCategories arrays ([#77](https://github.com/Tallec7/neopro/issues/77)) ([794db72](https://github.com/Tallec7/neopro/commit/794db7275612c561fa5323048610e0fd4231701e))
- **config-editor:** show tabs during loading and add debug traces ([549f29e](https://github.com/Tallec7/neopro/commit/549f29e0efb367a7baac5691c93b1d7d8a0021ae))
- **config-editor:** use Angular signal for loading state ([3a4e763](https://github.com/Tallec7/neopro/commit/3a4e763e56f19ac769bd9876130fd304f676e211))
- **config-editor:** use NgZone.run for change detection ([009f037](https://github.com/Tallec7/neopro/commit/009f037d32daac22ed22f1049635ed2b1e3619ad))
- **config-editor:** use setTimeout + ngZone.run for reliable change detection ([9ff785e](https://github.com/Tallec7/neopro/commit/9ff785e8ea1dc3ba5c324d78c3b18d5d57c328c3))
- **config-editor:** use setTimeout and markForCheck for change detection ([49a9182](https://github.com/Tallec7/neopro/commit/49a918269ab8c15e04a9617fec3ecd73e486c82d))
- **config-editor:** use setTimeout to force Angular change detection for categories ([ce7e354](https://github.com/Tallec7/neopro/commit/ce7e354bd6f06839337309580d90ac7abc9fae25))
- **config-editor:** wrap state changes in ngZone.run to fix spinner ([73d376f](https://github.com/Tallec7/neopro/commit/73d376f826a2604d900b6fe198a5ac770b9b2cc2))
- **config:** preserve video owner/locked fields and fix category merge ([f4767dd](https://github.com/Tallec7/neopro/commit/f4767ddefef9cc8c25484235a1afc645771c1053))
- **config:** restore diff preview modal and fix config deployment ([15f0e13](https://github.com/Tallec7/neopro/commit/15f0e130582d4693a4e8ae8fd34e80af5c355643))
- **config:** use FTP IP address instead of hostname ([ffbb839](https://github.com/Tallec7/neopro/commit/ffbb83925349e13438467fa3bef35a435e7c6cbb))
- **content:** add checksum calculation to bulk video upload ([6afa699](https://github.com/Tallec7/neopro/commit/6afa699d5ce0c4fdc58ff80a1cf7cfbbf6d05011))
- **content:** use original filename instead of UUID for video storage ([6d429a1](https://github.com/Tallec7/neopro/commit/6d429a1d9d1248cbfef1fd092cb86b54e85b9ad7))
- controller ([498f90a](https://github.com/Tallec7/neopro/commit/498f90ad3f1d94d7f674138c2c834be122ef5316))
- correct offline queue method call (getQueueSize → getStats) ([#261](https://github.com/Tallec7/neopro/issues/261)) ([a04986c](https://github.com/Tallec7/neopro/commit/a04986c2cfe57f078613b65bf69f42be04bf2d60))
- correct params mismatch in update_config command ([#61](https://github.com/Tallec7/neopro/issues/61)) ([aca8029](https://github.com/Tallec7/neopro/commit/aca8029e8503e83a7f8470c7be382939fd154d8a))
- correct RLS policies to allow unauthenticated analytics from Raspberry Pi ([#230](https://github.com/Tallec7/neopro/issues/230)) ([1a73d90](https://github.com/Tallec7/neopro/commit/1a73d9026b9f69485423548d73ead2b0aae5326e))
- correct static publish path for dashboard health endpoint ([#269](https://github.com/Tallec7/neopro/issues/269)) ([ce5923d](https://github.com/Tallec7/neopro/commit/ce5923d31566faf793681d3f9b47841f4126514b))
- correct video deletion endpoint routing ([#271](https://github.com/Tallec7/neopro/issues/271)) ([11d5cba](https://github.com/Tallec7/neopro/commit/11d5cba03d71033930ac0babe185631ac3cef340))
- **cors:** allow X-Correlation-ID header in preflight requests ([d791004](https://github.com/Tallec7/neopro/commit/d7910041d71c7642cb9c0e3c146bed3901fc19d2))
- **cors:** normalize origins and improve CORS debugging ([4210dd7](https://github.com/Tallec7/neopro/commit/4210dd71067978ad0c5a765282cd400623a99976))
- **cors:** normalize origins and improve CORS debugging ([#170](https://github.com/Tallec7/neopro/issues/170)) ([2141786](https://github.com/Tallec7/neopro/commit/21417864bd914cf7ff8ed501a364789b2790dc2f))
- **cron:** handle self-referential FK in config_history cleanup ([9a7114d](https://github.com/Tallec7/neopro/commit/9a7114dda15d25d3a2f0c6632fde60f02271ea9e))
- dashboard health endpoint and static publishing ([#272](https://github.com/Tallec7/neopro/issues/272)) ([b4a32fb](https://github.com/Tallec7/neopro/commit/b4a32fbc283bc91368f89613bc8dbfb5f259e35d))
- **dashboard:** add media-src CSP for FTP video hosting ([fd035d8](https://github.com/Tallec7/neopro/commit/fd035d82cdc3953c0c75a20b411b68dfb10ac77f))
- **dashboard:** correct type mapping for SiteConnectionStatus ([9edbc61](https://github.com/Tallec7/neopro/commit/9edbc61917f3cf3596e283211d562fa78cc7e2a7))
- **dashboard:** display original video filename instead of UUID ([1d4ded8](https://github.com/Tallec7/neopro/commit/1d4ded899db47b60dd31a8c9631951e79f1bb643))
- **dashboard:** display real-time connection status in sites list ([9f5c7f2](https://github.com/Tallec7/neopro/commit/9f5c7f2a76109281e75614f607003d92e73d8617))
- **dashboard:** handle paginated API response format for sites ([b9774b6](https://github.com/Tallec7/neopro/commit/b9774b60bd9f7d359a6c4259e245348bbf2a94f0))
- **dashboard:** persist Socket.IO connection after page refresh ([ac3ddfc](https://github.com/Tallec7/neopro/commit/ac3ddfc458cea2db9863a127670bb35ad44f7e96))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#119](https://github.com/Tallec7/neopro/issues/119)) ([57cb728](https://github.com/Tallec7/neopro/commit/57cb728aa868aae8b364f227f9ff17ce7db01d2e))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#120](https://github.com/Tallec7/neopro/issues/120)) ([2a980c7](https://github.com/Tallec7/neopro/commit/2a980c7b449bf1189094d3e16148a3a97a516ecd))
- **dashboard:** restore config button now deploys directly ([#338](https://github.com/Tallec7/neopro/issues/338)) ([044a4f7](https://github.com/Tallec7/neopro/commit/044a4f766c7c85c0f505acfa65a389541e36db69))
- **dashboard:** trust server status='online' when showing connection state ([71d0b76](https://github.com/Tallec7/neopro/commit/71d0b76d0139b327e21040dd7bdca14f3ab7d8ed))
- **dashboard:** use real-time connection status in recent sites ([2c012ce](https://github.com/Tallec7/neopro/commit/2c012ce77bfa227b1658cfd93a082e70ce89a0ab))
- **dashboard:** use real-time connection status in sites list ([72ca128](https://github.com/Tallec7/neopro/commit/72ca12888a18b18ecfc276a02181d7e6d46c8b49))
- **db:** allow configurable SSL certificate verification for Render PostgreSQL ([d0783b4](https://github.com/Tallec7/neopro/commit/d0783b4611f1a287c23ebd3fee889caf0652fdbf))
- default update_config to replace when mode missing ([3d0a853](https://github.com/Tallec7/neopro/commit/3d0a8530429767f068319a00077f9007d8b0855e))
- **demo:** correct video paths and socket port for NARH demo ([#98](https://github.com/Tallec7/neopro/issues/98)) ([d1d2c60](https://github.com/Tallec7/neopro/commit/d1d2c60ac0e9c7cfb7523229c6636744c26c5b09))
- **deploy:** add npm install for sync-agent in all deploy scripts ([4916c85](https://github.com/Tallec7/neopro/commit/4916c8529d3af2ed0e1aafc757d032582f4145e7))
- **deploy:** allow self-signed SSL certs for cloud database providers ([#43](https://github.com/Tallec7/neopro/issues/43)) ([ccf61a6](https://github.com/Tallec7/neopro/commit/ccf61a637e07a3b10bc460a0c53170f66890b4f8))
- **deploy:** handle port 3000 already in use during deployment ([#128](https://github.com/Tallec7/neopro/issues/128)) ([289bb31](https://github.com/Tallec7/neopro/commit/289bb318c2acafa5c4f5b0e12dc6907730dfcfef))
- **deploy:** handle port 3000 already in use during deployment ([#131](https://github.com/Tallec7/neopro/issues/131)) ([d4d972c](https://github.com/Tallec7/neopro/commit/d4d972c4aaf5446cbeaa696733f2d61466a3fd7e))
- **deploy:** handle port 3000 already in use during deployment ([#133](https://github.com/Tallec7/neopro/issues/133)) ([671e165](https://github.com/Tallec7/neopro/commit/671e1656b88d7f5480d1b2c555c2b54273779d83))
- **deploy:** include sync-agent in deployment and improve error logging ([b6adb14](https://github.com/Tallec7/neopro/commit/b6adb1458c7b9ba3a53c0b9e7776bb057e44c67b))
- **deployment:** use correct storage URL for video downloads ([497f174](https://github.com/Tallec7/neopro/commit/497f1743d8c2a216b209d7a9fd108e9d1df5755c))
- **deploy:** preserve sync-agent config during SSH deployments ([8f90ea0](https://github.com/Tallec7/neopro/commit/8f90ea04a975c2413953da253d7bec9adc72625e))
- **deploy:** suppress macOS xattr warnings on Raspberry Pi ([#41](https://github.com/Tallec7/neopro/issues/41)) ([cad8d37](https://github.com/Tallec7/neopro/commit/cad8d37ce7b044164b5b0b8831fa08390d46ae09))
- enable non-interactive mode for online installation ([#247](https://github.com/Tallec7/neopro/issues/247)) ([f92030f](https://github.com/Tallec7/neopro/commit/f92030fb59d42ddfe512e85edf3fe10a744cdf77))
- ensure analytics auth cookies and DB SSL ([b199259](https://github.com/Tallec7/neopro/commit/b19925974e0bd7de5b529010e1119c296875e62f))
- Fix video list loading in admin interface ([83a7cd2](https://github.com/Tallec7/neopro/commit/83a7cd28d4b66fb1cd241f13e54d4b90f4a83a1e))
- gitignore ([0742415](https://github.com/Tallec7/neopro/commit/0742415b999c6d3afa81067ae9e7aa96f8a14b26))
- handle CORS preflight manually ([4823041](https://github.com/Tallec7/neopro/commit/4823041760d8dda8d5451f555422e073a1f6c075))
- handle liveScoreEnabled in config merge for Raspberry Pi deployment ([#232](https://github.com/Tallec7/neopro/issues/232)) ([0a55db1](https://github.com/Tallec7/neopro/commit/0a55db13504d26fa4fb62497e028b7b391abda1d))
- health ([2ae2477](https://github.com/Tallec7/neopro/commit/2ae2477c6d8bfd51d7e4cf790274070ff85639f0))
- **i18n:** Fix ngx-translate configuration for Angular 20 ([3ecb7df](https://github.com/Tallec7/neopro/commit/3ecb7df95ee4cbbdb869b478414d7d6688d75fae))
- **i18n:** replace hardcoded French text with translation keys ([c25e0c4](https://github.com/Tallec7/neopro/commit/c25e0c449fedabe92f2fd837dd7757e2a13f98d5))
- improve CORS preflight handling for admin interface ([d39cc15](https://github.com/Tallec7/neopro/commit/d39cc1585bbf5332f6daa3a4f1ebe5e79014fdd8))
- improve error handling for software update creation ([#274](https://github.com/Tallec7/neopro/issues/274)) ([45a87fc](https://github.com/Tallec7/neopro/commit/45a87fcf0e25cfd30b86ce4baa18a003bd72163e))
- improve error handling in /api/update endpoint ([#235](https://github.com/Tallec7/neopro/issues/235)) ([6be6860](https://github.com/Tallec7/neopro/commit/6be6860ae0cf7d33345a665aa3842aa677317653))
- improve generate-config-from-videos.sh script reliability ([#140](https://github.com/Tallec7/neopro/issues/140)) ([95d8388](https://github.com/Tallec7/neopro/commit/95d838857c5bd3b5bd7b80fcfb57217349429f78))
- improve raspberry build speed and version deployment ([#282](https://github.com/Tallec7/neopro/issues/282)) ([6b2d3e2](https://github.com/Tallec7/neopro/commit/6b2d3e2f4ab68c9e3ec37846a1f5d627f7cf01d3))
- include .htaccess in central-dashboard build output ([#316](https://github.com/Tallec7/neopro/issues/316)) ([478143c](https://github.com/Tallec7/neopro/commit/478143cd9c8f747e8eb88ae5bfc5eedf6ba820e1))
- include .htaccess in central-dashboard build output ([#320](https://github.com/Tallec7/neopro/issues/320)) ([946f610](https://github.com/Tallec7/neopro/commit/946f610cdb708ff19e04e424b78f2d37a066dc7f))
- initialize required directories at admin server startup ([#317](https://github.com/Tallec7/neopro/issues/317)) ([ee149fe](https://github.com/Tallec7/neopro/commit/ee149fe611693af0a80fd70f217fb021fbda64e8))
- **kiosk:** configure gpu_mem=256 for video decoding ([2315edf](https://github.com/Tallec7/neopro/commit/2315edfbe1719c01fabec9999d432cd55cab6925))
- **layout:** add missing slideIn animation definition ([#189](https://github.com/Tallec7/neopro/issues/189)) ([9770546](https://github.com/Tallec7/neopro/commit/9770546a2b51ed43cad1c0f035c8aaf1d0b48f66))
- **lint:** remove inferrable type and replace any with unknown ([#37](https://github.com/Tallec7/neopro/issues/37)) ([978c7aa](https://github.com/Tallec7/neopro/commit/978c7aaafc2b0f91b2bfd5a366da2deac4246d96))
- **lint:** resolve all ESLint errors and warnings ([#34](https://github.com/Tallec7/neopro/issues/34)) ([61a40e6](https://github.com/Tallec7/neopro/commit/61a40e62ffdc532337b6c3aac0972ce8eac70c3a))
- **local-admin:** fix TypeScript error in clientForm definition ([9e6ea6e](https://github.com/Tallec7/neopro/commit/9e6ea6e61985e70050066280745b2126a330912c))
- **local-admin:** handle nullable form values in createClient ([109b213](https://github.com/Tallec7/neopro/commit/109b2131e1c8fad14afcc9549599eba8c57d0003))
- **logs:** prevent infinite loop on frontend log rate limiting ([dc0f358](https://github.com/Tallec7/neopro/commit/dc0f3580c984a737c1c7db982cb50c5bb5846542))
- **logs:** skip backend logging when user is not authenticated ([817e916](https://github.com/Tallec7/neopro/commit/817e916732f51cdb1b7989724fd1790db18d6461))
- maj claude ([021721f](https://github.com/Tallec7/neopro/commit/021721fe8cad398bf5612a5aaa66dcf8d515f434))
- **memory:** optimize memory usage for Railway Hobby plan ([a7d9652](https://github.com/Tallec7/neopro/commit/a7d9652c99f0e3df4c1edd351b036ce70f26287d))
- metric ([3514ddb](https://github.com/Tallec7/neopro/commit/3514ddb16cab72648a5768491728ff5f5d3161bd))
- **metrics:** convert uptime to integer before database insert ([#65](https://github.com/Tallec7/neopro/issues/65)) ([937d598](https://github.com/Tallec7/neopro/commit/937d598304ab64bd87ef48a4db98baa6831e14b5))
- **overlay:** Add Socket.IO relay for cross-device communication ([775c09d](https://github.com/Tallec7/neopro/commit/775c09d82e0e3620b02f80d2de51be30f0346794))
- **overlay:** Fix preview position for 9-position overlay system ([3280b1a](https://github.com/Tallec7/neopro/commit/3280b1aff35b38e5b032b74032c8d50111c2b171))
- **overlay:** Fix timer sync and options loading between Remote and TV ([7b9514b](https://github.com/Tallec7/neopro/commit/7b9514b9269c0fc72e1fcc03bbd8e05127ee8db7))
- privilege remote ([11c3803](https://github.com/Tallec7/neopro/commit/11c38032a2fdd7be1c0493bf1d060341cd1d5abf))
- push full config from dashboard ([3caf233](https://github.com/Tallec7/neopro/commit/3caf233c34faf4de530bc2947556aba4b9bdc148))
- **qr-code:** use real hotspot SSID and display neopro.local ([fe00fb6](https://github.com/Tallec7/neopro/commit/fe00fb6558c03dbb14496516317bec318ade5c57))
- **railway:** Configure Node 20 for Nixpacks build ([b1256d3](https://github.com/Tallec7/neopro/commit/b1256d3fd5ea240f24f63883876a3d3d2f6c415e))
- **railway:** Move railway.json to root with correct start command ([b83b1ed](https://github.com/Tallec7/neopro/commit/b83b1edb61869ffc54c4fcf7d8419d5422383695))
- **railway:** Use correct Nixpacks package name for Node 20 ([f0d72fa](https://github.com/Tallec7/neopro/commit/f0d72fadea2dfbaaa599f2e97e672777e09a0259))
- **railway:** Use generic nodejs package in nixpacks ([b5a1396](https://github.com/Tallec7/neopro/commit/b5a139695bcb1aa4a3837d353b43a04ed575a534))
- **railway:** Use Node 22 via nixpacks.toml ([5815ab6](https://github.com/Tallec7/neopro/commit/5815ab6ed5cc80dc39624e12860ddc1c11ea4d5c))
- **raspberry:** add fix_permissions command and preserve permissions after update ([a2c814e](https://github.com/Tallec7/neopro/commit/a2c814eb2b0b62be97a8a7f6f7d7ec4d6f545cf5))
- **raspberry:** correct webapp permissions for sync-agent ([#123](https://github.com/Tallec7/neopro/issues/123)) ([349458c](https://github.com/Tallec7/neopro/commit/349458c98da875c2027e826ccc52203997ad92f9))
- **raspberry:** Enable Socket.IO offline mode for autonomous operation ([c0691fe](https://github.com/Tallec7/neopro/commit/c0691feb7153ae388ac4c36bacdc661d4e12e08e))
- **raspberry:** Include i18n assets in Angular build ([674179e](https://github.com/Tallec7/neopro/commit/674179e78a3db79094196447c0bd4003ec3996b8))
- **raspberry:** remove dead code referencing webapp/videos ([ad307ca](https://github.com/Tallec7/neopro/commit/ad307ca90f06f306570f6b2d908c9f0bcdc43d24))
- **rate-limit:** apply per-route rate limits to prevent 429 errors ([bc4e25d](https://github.com/Tallec7/neopro/commit/bc4e25d01e8f06b58f95caeb7e2f7859676b1958))
- **remote-shell:** allow /dev/null redirection in security blacklist ([ff6dc93](https://github.com/Tallec7/neopro/commit/ff6dc93766b560522577237a890f17d2863d2711))
- **remote-shell:** allow super_admin to access any path ([51c608f](https://github.com/Tallec7/neopro/commit/51c608f47f250d3d44a207536ad8644052d6340c))
- **remote-shell:** use WebSocket for command results to avoid Gateway timeout ([1f09838](https://github.com/Tallec7/neopro/commit/1f098389fee7e5a3d2561b4d8b6c46c84f475249))
- **remote:** Fix category and video count in telecommande ([433db91](https://github.com/Tallec7/neopro/commit/433db91041280115a190cd62a05e07da615822ce))
- **remote:** sort search results alphabetically ([a0fc934](https://github.com/Tallec7/neopro/commit/a0fc93446409a77c11c68ef3b25e836cf4e4fcad))
- remove auth guard from /tv route for kiosk mode ([#25](https://github.com/Tallec7/neopro/issues/25)) ([37034d4](https://github.com/Tallec7/neopro/commit/37034d4d1d06b6150ea0cafdfebc7a08dd6e54ec))
- remove duplicate formatJson and clean diff display ([d7752c3](https://github.com/Tallec7/neopro/commit/d7752c38aba60f21291391c625251236bc8d8a04))
- remove non-existent status column from videos query ([dfde042](https://github.com/Tallec7/neopro/commit/dfde042cd10c8165173335643514c34874518245))
- remove npm cache and use npm install instead of npm ci ([#287](https://github.com/Tallec7/neopro/issues/287)) ([1f3c2c0](https://github.com/Tallec7/neopro/commit/1f3c2c0eaa5ab32f08840eb628dc83666f546f4c))
- replace chromium-browser with chromium for Raspberry Pi OS Trixie ([#21](https://github.com/Tallec7/neopro/issues/21)) ([cfec79d](https://github.com/Tallec7/neopro/commit/cfec79d00968b56f9d074b5692e22f96a7542195))
- resolve Angular build warnings ([#219](https://github.com/Tallec7/neopro/issues/219)) ([295f413](https://github.com/Tallec7/neopro/commit/295f4139dbf36246a8f433f0de4f3f34383c3bff))
- resolve CSP blocking external images and improve video upload error handling ([#263](https://github.com/Tallec7/neopro/issues/263)) ([a36c812](https://github.com/Tallec7/neopro/commit/a36c812b0795dd21b5255e47dd19e93732af3784))
- **routes:** Move portal routes before :id routes to fix 403 error ([3b04abf](https://github.com/Tallec7/neopro/commit/3b04abf93c3848f825ce1d5e0afc184b67c0ab1b))
- **scripts:** add timeout to xattr to prevent build-and-deploy hang ([#167](https://github.com/Tallec7/neopro/issues/167)) ([011a015](https://github.com/Tallec7/neopro/commit/011a01562a53fd9db83ae0e328070bd55ebf5a20))
- **scripts:** convert CRLF to LF line endings ([#51](https://github.com/Tallec7/neopro/issues/51)) ([01e8702](https://github.com/Tallec7/neopro/commit/01e870271047ccae2e35b20a687df0239db57c3c))
- **scripts:** correct club config path and improve setup workflow ([#54](https://github.com/Tallec7/neopro/issues/54)) ([f3fdd37](https://github.com/Tallec7/neopro/commit/f3fdd37cea0950b196f263cabf421f8673451f9c))
- **scripts:** correct test script to use ng test ([#91](https://github.com/Tallec7/neopro/issues/91)) ([bfcefac](https://github.com/Tallec7/neopro/commit/bfcefacbc5db904fd08fb26c8514bf4d792cb19d))
- **security:** resolve 4 critical/high security vulnerabilities ([#32](https://github.com/Tallec7/neopro/issues/32)) ([32184d4](https://github.com/Tallec7/neopro/commit/32184d4d959d68125a36c481a05a15bae58b4ee4))
- ser ([c6b7e6c](https://github.com/Tallec7/neopro/commit/c6b7e6c0046563503046f2e07ad3146563b2d17b))
- server ([c0a47a9](https://github.com/Tallec7/neopro/commit/c0a47a9f1df16838326b79fe876ab0d83201530b))
- server dash ([03b6546](https://github.com/Tallec7/neopro/commit/03b654606c1ab538145f61029646b20235cb05cb))
- server render ([2bd5a24](https://github.com/Tallec7/neopro/commit/2bd5a243804ccefa714f7f487dc2a6ceb986e3c6))
- **server:** allow DB CA files ([14036b0](https://github.com/Tallec7/neopro/commit/14036b077e298b66db350314bdb228b419b5216d))
- **server:** start HTTP server immediately for Render health checks ([5469556](https://github.com/Tallec7/neopro/commit/5469556db1c66a8de39b3c15b9a781ae080d0f50))
- **server:** start HTTP server immediately for Render health checks ([#162](https://github.com/Tallec7/neopro/issues/162)) ([7d31c81](https://github.com/Tallec7/neopro/commit/7d31c818732838cab912237dbb7bccd2220179cc))
- **setup:** automate sync-agent registration with env vars ([8b7452d](https://github.com/Tallec7/neopro/commit/8b7452dfd94e0ace277c9bad50238a07e7d53c0f))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#48](https://github.com/Tallec7/neopro/issues/48)) ([a73ac93](https://github.com/Tallec7/neopro/commit/a73ac937ec3e90eb68db1939daaa0293f09e4c40))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#49](https://github.com/Tallec7/neopro/issues/49)) ([a025c92](https://github.com/Tallec7/neopro/commit/a025c928217847a0113c73f0c4c042047ded09a6))
- **setup:** generate config in dashboard-compatible format ([475ce26](https://github.com/Tallec7/neopro/commit/475ce2642b893890d41813f00b8887b627da438c))
- **setup:** use interactive SSH for sync-agent registration ([d2f883f](https://github.com/Tallec7/neopro/commit/d2f883fd5df05d57b403aeb439a08341716505e3))
- **setup:** use interactive SSH for sync-agent registration ([#42](https://github.com/Tallec7/neopro/issues/42)) ([6199ea5](https://github.com/Tallec7/neopro/commit/6199ea537233a7a8ee1ce238e8f0b71eaa2299f3))
- simplify CI/CD for Render.com deployment ([#285](https://github.com/Tallec7/neopro/issues/285)) ([d367c4c](https://github.com/Tallec7/neopro/commit/d367c4c09d6b0a7cc1c4b27c07e0a8eff8fc7208))
- **sites:** handle duplicate site names with -N suffix ([ca598a3](https://github.com/Tallec7/neopro/commit/ca598a3e6a798d68acdd0cbfdf5e2f2d6b8b0248))
- **sites:** use actual hardware model instead of hardcoded value ([#84](https://github.com/Tallec7/neopro/issues/84)) ([371dfc6](https://github.com/Tallec7/neopro/commit/371dfc6ee4eaa2fadb9626a0f18021c0123f0a0a))
- socket ([b54a573](https://github.com/Tallec7/neopro/commit/b54a5730e10b2864daee918f725d8e0d99c17d02))
- **socket:** add JWT authentication for dashboard users ([8fba417](https://github.com/Tallec7/neopro/commit/8fba4174e22521c60b002e3e86d40f39bdc949c0))
- **socket:** add periodic DB/WebSocket status sync to fix zombie sites ([fc03ea5](https://github.com/Tallec7/neopro/commit/fc03ea55b8e835adcd524a8deeceb00c53ecac89))
- **socket:** command timeout now handles 'executing' status ([#152](https://github.com/Tallec7/neopro/issues/152)) ([d92cdaa](https://github.com/Tallec7/neopro/commit/d92cdaabad76600a267a6726713cdeb971b0dca1))
- **socket:** detect and handle zombie connections ([3ac863f](https://github.com/Tallec7/neopro/commit/3ac863ff8eba5ac492b4b74bef9f550b77aa9512))
- **socket:** disable verbose logs in production ([#192](https://github.com/Tallec7/neopro/issues/192)) ([50f1e12](https://github.com/Tallec7/neopro/commit/50f1e125016d8a046387de5d05d947ae54686a91))
- sponsor detail API response format + TypeScript build errors ([#205](https://github.com/Tallec7/neopro/issues/205)) ([e2ed287](https://github.com/Tallec7/neopro/commit/e2ed287f87817618211b089598be39d1a9d6ede8))
- sync ([cfadf1d](https://github.com/Tallec7/neopro/commit/cfadf1deb95fc5cb15481fea90591d6691aeceb5))
- sync-agent ([977156d](https://github.com/Tallec7/neopro/commit/977156dc4b5cb86ca08a7366e300622ff94a748e))
- **sync-agent:** add get_config to allowed commands in site registration scripts ([#68](https://github.com/Tallec7/neopro/issues/68)) ([53af0f2](https://github.com/Tallec7/neopro/commit/53af0f2b824c05897cd356e98606cd73df567729))
- **sync-agent:** add npm install for sync-agent in update-software.js ([b11f7f2](https://github.com/Tallec7/neopro/commit/b11f7f2efa1eed687dff31f49eed6d053c1ad259))
- **sync-agent:** add retry logic and service existence check to startServices ([d301dd9](https://github.com/Tallec7/neopro/commit/d301dd98156ebe8afbdf9a8c9abcbe9ef34ff331))
- **sync-agent:** Add scoreOverlay support in config merge ([06fcc93](https://github.com/Tallec7/neopro/commit/06fcc93e6efc2ab829c813f3c1f96ba58fc68ecc))
- **sync-agent:** add try/catch and logging to startVideoWatcher ([c1670bc](https://github.com/Tallec7/neopro/commit/c1670bc176cdb205e7f4f51d32dce1a402858ce2))
- **sync-agent:** align update-software.js with deploy-remote.sh ([4ffb4d7](https://github.com/Tallec7/neopro/commit/4ffb4d75b66e1aa8ef00faf24a1a81e6191e25ef))
- **sync-agent:** config deployment now properly notifies local app and supports replace mode ([8ba4968](https://github.com/Tallec7/neopro/commit/8ba4968d4a7b8e4d89ca920b2fa682c26daaf95e))
- **sync-agent:** correct path concatenation in update-software.js ([d51f269](https://github.com/Tallec7/neopro/commit/d51f26967b43a3f0539f7bfdf6e2dc949436ec2c))
- **sync-agent:** deploy remotePassword to auth.password for /remote login ([49e49f1](https://github.com/Tallec7/neopro/commit/49e49f174c7fcb2da9650d5d9c79ef8ac928c2e8))
- **sync-agent:** detect and recover from zombie connections ([fe55b89](https://github.com/Tallec7/neopro/commit/fe55b89827a3acf38f3d0262590a6bb10910620f))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#45](https://github.com/Tallec7/neopro/issues/45)) ([529c949](https://github.com/Tallec7/neopro/commit/529c9491c15277a13caa8cca6f29627086fe6376))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#47](https://github.com/Tallec7/neopro/issues/47)) ([edb2294](https://github.com/Tallec7/neopro/commit/edb2294e75cd82035b711ccdde5cc5c9ed60664f))
- **sync-agent:** include deploymentId in update_progress events ([30985fc](https://github.com/Tallec7/neopro/commit/30985fc408cffdfd5e3efd4518926279435ff563))
- **sync-agent:** include deploymentId in update_progress events ([5522b39](https://github.com/Tallec7/neopro/commit/5522b394c67b32eaeddf72330e4ab30776ab29f0))
- **sync-agent:** send analytics independently of WebSocket connection ([#145](https://github.com/Tallec7/neopro/issues/145)) ([7d59247](https://github.com/Tallec7/neopro/commit/7d5924723b0b398b4861a5d97568d7664ab999ca))
- **sync-agent:** use available memory instead of used for accurate RAM metrics ([1c082b7](https://github.com/Tallec7/neopro/commit/1c082b759886d4c33ee25910aa2f3e6324aad1c7))
- **sync-agent:** use polling instead of recursive fs.watch on Linux ([bfb3eac](https://github.com/Tallec7/neopro/commit/bfb3eac948cc461bd19b447e5d73780807d516ab))
- **sync-agent:** use sudo for VERSION/release.json to handle root ownership ([1ecd7a5](https://github.com/Tallec7/neopro/commit/1ecd7a5b7f4ca04d9f819d45b4a7ed81a4a35ee1))
- **thumbnails:** add cache-buster to refresh thumbnails after regeneration ([01d016c](https://github.com/Tallec7/neopro/commit/01d016cea5b9bf7e9f2c15e2e0ec80f634e14907))
- **thumbnails:** move thumbnail when video is renamed ([b955386](https://github.com/Tallec7/neopro/commit/b9553865203bf7bc0b0be5bc606a18b11869aee0))
- tighten pending config typings ([23f2b73](https://github.com/Tallec7/neopro/commit/23f2b7309338175c0ea78dff555269944266d231))
- **tv:** improve double-buffer video transitions to prevent stuttering ([#342](https://github.com/Tallec7/neopro/issues/342)) ([b95d271](https://github.com/Tallec7/neopro/commit/b95d2710c7f14c5cff75e07d4d95f8af759d1d71))
- **tv:** require liveScoreEnabled from central to display score overlay ([8e1b2b8](https://github.com/Tallec7/neopro/commit/8e1b2b883e98d999991ddae62c2524cbd968c930))
- type-safe diff counts in config editor ([9f759f2](https://github.com/Tallec7/neopro/commit/9f759f2c1a15d7fca0622a64a97b81289fe82f64))
- **types:** Add index signatures for PostgreSQL QueryResultRow compatibility ([ae56672](https://github.com/Tallec7/neopro/commit/ae56672840e77f3dc692d27a3a827f388e967384))
- **ui:** Fix language selector dropdown on login pages ([89af4d3](https://github.com/Tallec7/neopro/commit/89af4d326f359dd939234e4cb85a87d3cbca0024))
- **ui:** Replace Tailwind classes with native CSS in agencies-management component ([83edcd3](https://github.com/Tallec7/neopro/commit/83edcd3dc27675e3867e944ebd9879763c4af983))
- **ui:** Replace Tailwind classes with native CSS in users-management component ([c63e6c1](https://github.com/Tallec7/neopro/commit/c63e6c11dca7a3de14c2c6cb95b7112335388459))
- update angular.json paths from raspberry/frontend to raspberry/src ([#242](https://github.com/Tallec7/neopro/issues/242)) ([ba4881e](https://github.com/Tallec7/neopro/commit/ba4881eb42683ba60e2844be67ca3ea26b9b06ce))
- update API URL to point to neopro-central.onrender.com ([7161f2c](https://github.com/Tallec7/neopro/commit/7161f2ced955378a2e264e16e491de9d15fb1ae6))
- update parm ([03f4c79](https://github.com/Tallec7/neopro/commit/03f4c79eac7fba5763c2d1d59ab30257c3b34f93))
- update Render URL from neopro-central-server to neopro-central ([15e53e0](https://github.com/Tallec7/neopro/commit/15e53e00e9cfddd7c85afb32f3767f6de200e4a0))
- update render.yaml to use raspberry/server for Socket.IO ([1459da1](https://github.com/Tallec7/neopro/commit/1459da126f9f192530ff15fc020dda277146af3c))
- update sponsors array during video deployment for analytics tracking ([#273](https://github.com/Tallec7/neopro/issues/273)) ([0b370de](https://github.com/Tallec7/neopro/commit/0b370de2a281187318593f55da3223a601022a6c))
- **updates:** add debug logging and endpoint for Socket.IO connection state ([cfae283](https://github.com/Tallec7/neopro/commit/cfae28356af5e2fd796f80fdc4b13e430074a508))
- **updates:** preserve user data during software updates ([#36](https://github.com/Tallec7/neopro/issues/36)) ([e897a22](https://github.com/Tallec7/neopro/commit/e897a225bb3a4dc7972d10825ad46d64cf15aedb))
- **updates:** use commandQueueService for update deployments like update_config ([818ede3](https://github.com/Tallec7/neopro/commit/818ede35eb466c6f202006f126dbd13f1f780f5c))
- url prod ([6799b0f](https://github.com/Tallec7/neopro/commit/6799b0fce3b577b13c0b5deb99b9276eb914f574))
- url prod ([49766d5](https://github.com/Tallec7/neopro/commit/49766d57e75f03459d53ffe2b990a979e46d6928))
- use chromium binary for kiosk service ([d412061](https://github.com/Tallec7/neopro/commit/d412061517f588d546b6a0df70cbc735ab3be6b2))
- use dynamic URL for analytics API instead of relative path ([f65951e](https://github.com/Tallec7/neopro/commit/f65951e8587d27cdcc093123d0ec53244e555924))
- use dynamic URL for auth API instead of localhost ([b0ecaa1](https://github.com/Tallec7/neopro/commit/b0ecaa11c6695c19c9775ea109c837e29d38da83))
- use fallbackLang instead of deprecated defaultLanguage ([8a8f71f](https://github.com/Tallec7/neopro/commit/8a8f71f82c69213da84e58cee584f9c239f93097))
- video inter ([f9a1b8f](https://github.com/Tallec7/neopro/commit/f9a1b8f31e0279b5b8d53b44e791d1defad6df6d))
- **websocket:** Connect WebSocket after user authentication ([4809af7](https://github.com/Tallec7/neopro/commit/4809af73914001fd44a56141876b8b9de6236c76))

### Code Refactoring

- **structure:** reorganize monorepo with unified Angular workspace ([#96](https://github.com/Tallec7/neopro/issues/96)) ([4f5cbe8](https://github.com/Tallec7/neopro/commit/4f5cbe8ae07831ea31149b5c5b88ad566e2cf6de))

### Features

- add /admin demo mode for Hostinger deployment ([#138](https://github.com/Tallec7/neopro/issues/138)) ([3b979e2](https://github.com/Tallec7/neopro/commit/3b979e282b10e8d794b8967a45e72e6308d52358))
- add automated script to create golden image from Mac ([#239](https://github.com/Tallec7/neopro/issues/239)) ([b782d1d](https://github.com/Tallec7/neopro/commit/b782d1ddade204a3140df20afbb7f38080cdbf3d))
- Add complete Raspberry Pi autonomous system (4 phases) ([302cb1a](https://github.com/Tallec7/neopro/commit/302cb1a97b4e48c24f337b1c049ac3072ffed7f5))
- add comprehensive security, performance, and accessibility improvements to admin panel ([#259](https://github.com/Tallec7/neopro/issues/259)) ([556893a](https://github.com/Tallec7/neopro/commit/556893a6db043e354371bf1053d507d4e1d9af59)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- Add local development setup with admin demo mode ([8fa4529](https://github.com/Tallec7/neopro/commit/8fa4529b9ea5ce7e44bb75da8af6eb28e25cf470))
- add missing API routes for content and updates management ([b9baa4d](https://github.com/Tallec7/neopro/commit/b9baa4dce914f79e01e3677ea6f21f64f6c7df62))
- add monitoring, alerting and frontend tests ([#124](https://github.com/Tallec7/neopro/issues/124)) ([cf9c12c](https://github.com/Tallec7/neopro/commit/cf9c12cfe32f3bc09e5e539e21219210284f9df2))
- Add Real-Time Connection Status Indicator ([#262](https://github.com/Tallec7/neopro/issues/262)) ([476e445](https://github.com/Tallec7/neopro/commit/476e445f123dcbd56239702cc289222338b8a68a)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- add remote club setup without local dependencies ([#256](https://github.com/Tallec7/neopro/issues/256)) ([77ca008](https://github.com/Tallec7/neopro/commit/77ca0086ce99d2eb4c4f2798af5bc41553fb49d6))
- add remote config deployment via central dashboard ([#26](https://github.com/Tallec7/neopro/issues/26)) ([2f28980](https://github.com/Tallec7/neopro/commit/2f289807af0de32b12b01b038aa34e2b1a626f2d))
- add script to generate club config from video directory ([#137](https://github.com/Tallec7/neopro/issues/137)) ([50e6386](https://github.com/Tallec7/neopro/commit/50e63865b2e1493f319e17732726303427802d67))
- add Sponsors navigation link to sidebar menu ([#196](https://github.com/Tallec7/neopro/issues/196)) ([8d581b5](https://github.com/Tallec7/neopro/commit/8d581b55fa49dedb7302ab5f4c112c144f8e81a6))
- Add subcategory support in admin video upload ([492b158](https://github.com/Tallec7/neopro/commit/492b1588b6c1d0dd97d2a77fe11daaf8baeff581))
- add video loop per match phase (before/during/after) ([#279](https://github.com/Tallec7/neopro/issues/279)) ([5257ff8](https://github.com/Tallec7/neopro/commit/5257ff84f2e5907c0ff126de01cb8da083eea180))
- **admin:** add bulk video categorization and thumbnail regeneration ([73560d7](https://github.com/Tallec7/neopro/commit/73560d722fca9d039248b8c536c71776a7cce3e7))
- **admin:** Add user management and password reset features ([aaf3f95](https://github.com/Tallec7/neopro/commit/aaf3f95c8cb7b567c66a03ba8f1564d05f3d920b))
- améliorer les uploads et la gestion des vidéos ([590c2e8](https://github.com/Tallec7/neopro/commit/590c2e8f28b44dee1162634b5a127a831c561c06))
- **analytics:** configurable analytics categories per site ([#147](https://github.com/Tallec7/neopro/issues/147)) ([ebe8a0f](https://github.com/Tallec7/neopro/commit/ebe8a0f56d60d7b47baee0da84cda907bab376a2))
- **analytics:** implement complete club analytics system (MVP + Phase 2 + Phase 3) ([#35](https://github.com/Tallec7/neopro/issues/35)) ([8d54c54](https://github.com/Tallec7/neopro/commit/8d54c54419d54a9a960950bda7d8c17a35533fdd))
- **api:** Add multi-tenant site filtering for agency and sponsor users ([ce59dba](https://github.com/Tallec7/neopro/commit/ce59dbaa2d12d98cfc3cc88c2a5ec90b010bf00d))
- **audit:** add live match event auditing ([05c2ab8](https://github.com/Tallec7/neopro/commit/05c2ab8520ad393bfd4915c860b4ab26b2fc7c44))
- auto deploy pending config ([5fcd1fe](https://github.com/Tallec7/neopro/commit/5fcd1fe625b3074beb4f1e5d252f0b19d2205e06))
- automatic deployment of live score option to Raspberry Pi ([#229](https://github.com/Tallec7/neopro/issues/229)) ([784b541](https://github.com/Tallec7/neopro/commit/784b541d035d82719886d9ca91e0c67a543b2363))
- **build:** add integrity check and version sync to build-raspberry.sh ([dd0cf5d](https://github.com/Tallec7/neopro/commit/dd0cf5dfc1daa4acec0c0410f3768bb77fd1c23c))
- **build:** include node_modules in deploy archive ([f6203be](https://github.com/Tallec7/neopro/commit/f6203be9ea1d28337356c53f42fe557554d85af9))
- **central-dashboard:** implement all TODO features ([#27](https://github.com/Tallec7/neopro/issues/27)) ([06b6778](https://github.com/Tallec7/neopro/commit/06b67786f96d65c361a788d0fc5605fe9c3eb241))
- **ci:** implement automatic semantic versioning ([d763138](https://github.com/Tallec7/neopro/commit/d76313854eb5733b16a4c078ac823d7511f8de5e))
- complete all dashboard UI components (100%) ([96607d2](https://github.com/Tallec7/neopro/commit/96607d256b632fad6730c9b3a8da3279a0387c36))
- comprehensive test coverage and sync reliability improvements ([#139](https://github.com/Tallec7/neopro/issues/139)) ([370e713](https://github.com/Tallec7/neopro/commit/370e713ff69d90a06f8a2c8dbc84c30d70c8ed24))
- **config-editor:** add structured config editor with history and diff ([#74](https://github.com/Tallec7/neopro/issues/74)) ([28c220d](https://github.com/Tallec7/neopro/commit/28c220d6644e5eb499a4dcfde061c8093818989c))
- **config:** add timeCategories and video CRUD management ([#80](https://github.com/Tallec7/neopro/issues/80)) ([ce4f091](https://github.com/Tallec7/neopro/commit/ce4f091ffc1750e5a87b13e35a1d333a94b0033c))
- **config:** add timeCategories and video CRUD management ([#81](https://github.com/Tallec7/neopro/issues/81)) ([c163795](https://github.com/Tallec7/neopro/commit/c1637956daeee6bc4437047796c9e7c026c2bcce))
- **core:** Migrate Sponsor → Advertiser (Annonceur) terminology ([83955ad](https://github.com/Tallec7/neopro/commit/83955ad8d3d88741fad6ca8661868c4258669775))
- **dashboard:** add 'Refresh from Pi' button to Content tab ([6d16afa](https://github.com/Tallec7/neopro/commit/6d16afafe3cff6b2d05ef648c3420896231a80a0))
- **dashboard:** add centralized error handling system ([53887b8](https://github.com/Tallec7/neopro/commit/53887b824f82d9b5cdcbfad4d58254acb10f3042))
- **dashboard:** add expandable details to config diff items ([2f99207](https://github.com/Tallec7/neopro/commit/2f9920712475f8a88a7423d8f59e736787036464))
- **dashboard:** add live score toggle in site detail page ([#209](https://github.com/Tallec7/neopro/issues/209)) ([8d962df](https://github.com/Tallec7/neopro/commit/8d962df15c140d65ca25fd3596f808f6ab3a7f8a))
- **dashboard:** add log throttling to prevent 429 errors ([ee27f4d](https://github.com/Tallec7/neopro/commit/ee27f4d42a1fc672a75c1b997ac379e14bf16ea9))
- **dashboard:** add QR code generator for remote access ([b716549](https://github.com/Tallec7/neopro/commit/b716549b5e7c01555859afce8e5602210905d819))
- **dashboard:** add real-time deployment feedback via Socket.IO ([7910bc2](https://github.com/Tallec7/neopro/commit/7910bc2f6201881e19c2b7ec626ecb6e1b3c6363))
- **dashboard:** add remote network diagnostics for sites ([#212](https://github.com/Tallec7/neopro/issues/212)) ([1d175c8](https://github.com/Tallec7/neopro/commit/1d175c82ba143f814f847d2407c674b44e50661d))
- **dashboard:** allow multi-video deployments ([75962a8](https://github.com/Tallec7/neopro/commit/75962a86a1263471d0a1270f176c35716babc6c8))
- **dashboard:** improve config diff display with human-readable labels ([c70207b](https://github.com/Tallec7/neopro/commit/c70207b0cd1b1f070b3135de7f07b1d7eb807355))
- **dashboard:** improve debug tab with timeline, export bundle and UI cleanup ([f0dba6b](https://github.com/Tallec7/neopro/commit/f0dba6b83696f08bb997d450502ec2ea768f51cd))
- **dashboard:** load existing site configuration in editor ([ba31600](https://github.com/Tallec7/neopro/commit/ba31600f022e3b0825ef6e4cd98d4058e036b0e6))
- **dashboard:** load existing site configuration in editor ([#62](https://github.com/Tallec7/neopro/issues/62)) ([65e4b06](https://github.com/Tallec7/neopro/commit/65e4b064bc30faf254403874edf6b08d949e0555))
- **dashboard:** optimize API polling with cache and aggregated endpoint ([a1012db](https://github.com/Tallec7/neopro/commit/a1012db473bd5b95e603583894dd7efb5c40c3b8))
- **dashboard:** refactor site-detail with tabs, N videos per phase, subcategory mapping ([3def8e1](https://github.com/Tallec7/neopro/commit/3def8e1c372ee3b12295476e7bb43e50585a2118))
- **dashboard:** replace alert() with global toast notifications ([#33](https://github.com/Tallec7/neopro/issues/33)) ([331e2ad](https://github.com/Tallec7/neopro/commit/331e2ad31b456c4d40924912f18dbada39d735cc))
- **dashboard:** restore missing features from config editor refactoring ([9c6def2](https://github.com/Tallec7/neopro/commit/9c6def2dc0448eec03fd166ff7745693304e9206))
- **data-retention:** add automatic cleanup for historical data ([e99a044](https://github.com/Tallec7/neopro/commit/e99a0447890e892f3eb436d61ca284f011f5a0cd))
- **debug:** add remote shell terminal for Pi debugging ([8cf244e](https://github.com/Tallec7/neopro/commit/8cf244e34f3274dbf4fc65d5d915241578843a70))
- **demo:** add demo build configuration and update docs ([#86](https://github.com/Tallec7/neopro/issues/86)) ([6124fdc](https://github.com/Tallec7/neopro/commit/6124fdcfc61f4916f11438cf6691bb3fd2331961))
- **demo:** add demo mode with club selector for presentations ([#85](https://github.com/Tallec7/neopro/issues/85)) ([d836a6d](https://github.com/Tallec7/neopro/commit/d836a6d1eaa480a4f018b6abe315bc2eae5c4b7f))
- **demo:** load clubs list dynamically from JSON file ([#89](https://github.com/Tallec7/neopro/issues/89)) ([95ea0af](https://github.com/Tallec7/neopro/commit/95ea0af79f07bb5442b85890edfc602902e88ede))
- **deployment:** use commandQueueService for video deployments ([770457c](https://github.com/Tallec7/neopro/commit/770457c448e01202fb9c74a7f7ecae5a90dd104e))
- editable ownership (Club vs NEOPRO) for categories, subcats, videos ([1bf8ca6](https://github.com/Tallec7/neopro/commit/1bf8ca6d311fb0f805641806946707738531f40f))
- granular config diff for arrays by id ([87748bc](https://github.com/Tallec7/neopro/commit/87748bce3c2bfe47205b392d2877ab39ed347b67))
- Implement all system TODOs (7 items) ([832ad00](https://github.com/Tallec7/neopro/commit/832ad00d9616bf73f34f0662c745fbb8ba68a431))
- implement automatic software update deployment to Raspberry Pi ([#275](https://github.com/Tallec7/neopro/issues/275)) ([d924bb7](https://github.com/Tallec7/neopro/commit/d924bb749b93e70fd3f2f02a842f0aef2d1667b6))
- implement complete NEOPRO fleet management system ([197e2f7](https://github.com/Tallec7/neopro/commit/197e2f7d848803be1aec449686d102f5964f9d25))
- integrate NEOPRO brand guidelines across all apps ([#28](https://github.com/Tallec7/neopro/issues/28)) ([f148152](https://github.com/Tallec7/neopro/commit/f1481521a61084541c032213820a32612e948f24))
- IP tracking and remote hotspot WiFi configuration ([#132](https://github.com/Tallec7/neopro/issues/132)) ([89ac5b9](https://github.com/Tallec7/neopro/commit/89ac5b900e5d3abb45050e5f48ade88189f0ae0b))
- **kiosk:** add watchdog to recover from Chromium "Aw, Snap!" crashes ([013ed4a](https://github.com/Tallec7/neopro/commit/013ed4aaf7064fde7d11741cd74fde267dde5ed3))
- let admins choose merge vs replace and improve diff preview ([fd4b9fe](https://github.com/Tallec7/neopro/commit/fd4b9fed7fd7ae28a2773812095ed7b9aaa9dac8))
- Live Score - Fonctionnalité complète ([#292](https://github.com/Tallec7/neopro/issues/292)) ([17bdb8a](https://github.com/Tallec7/neopro/commit/17bdb8a492e8139d7b4f2510d70d4bbb56ac1a2f))
- **login:** display club info on login pages (ports 80 & 8080) ([c8892d5](https://github.com/Tallec7/neopro/commit/c8892d5eedd10676d6e423df95f991ae0ce0c57e))
- major features implementation - RLS, Live-Score, OpenAPI docs ([#222](https://github.com/Tallec7/neopro/issues/222)) ([53894f5](https://github.com/Tallec7/neopro/commit/53894f599b5873cc6bda79ab5e6a9318e6eebf1c))
- migrate backend from Render to Railway ([6909adb](https://github.com/Tallec7/neopro/commit/6909adb987d215d9421aa07f4737ee62bd314687))
- **overlay:** Implement local overlay system with Options, Timer, Breaking News ([f4a030a](https://github.com/Tallec7/neopro/commit/f4a030a558842fa5803a8e1634202f713bb5e115))
- **overlay:** Major V2 with multi-sport support and animations ([f412646](https://github.com/Tallec7/neopro/commit/f4126464eefbd16cab20875b6b68622c0b07a579))
- ownership selector for sponsors and types updated ([21355b1](https://github.com/Tallec7/neopro/commit/21355b1d3c534de95c0a08e3012c8af5038a6850))
- propagate release version everywhere ([414d276](https://github.com/Tallec7/neopro/commit/414d27656906ec92b77ef56a7eac1ed96fc463fe))
- propagate release version everywhere ([322c499](https://github.com/Tallec7/neopro/commit/322c499dfb56135d32020e6d33767d391303fdc3))
- propagate video_id, sponsor_id and analytics_category through deployment and tracking ([#270](https://github.com/Tallec7/neopro/issues/270)) ([58e4a0a](https://github.com/Tallec7/neopro/commit/58e4a0a55c227b31b45552757a37747b31297c36))
- **qr-code:** add dedicated hotspot-config endpoint for real SSID ([88f01fc](https://github.com/Tallec7/neopro/commit/88f01fc32976d761cb75379d43a2c3364badf1a2))
- **qr-code:** fetch real SSID via get_hotspot_config command ([d5ddaa1](https://github.com/Tallec7/neopro/commit/d5ddaa1f54ae0a7d8167cb5e751293408a8de427))
- **qr-code:** use Neopro logo image instead of text ([fa0c833](https://github.com/Tallec7/neopro/commit/fa0c83386188870d31de5985747d4292800cf4f5))
- **raspberry:** add captive portal support for Android hotspot connectivity ([c8ffe4f](https://github.com/Tallec7/neopro/commit/c8ffe4ffbf4f12d5f78c4e7e2dae63af5e53b7f7))
- **raspberry:** improve deployment scripts and add backup/restore ([#50](https://github.com/Tallec7/neopro/issues/50)) ([1c852fb](https://github.com/Tallec7/neopro/commit/1c852fb16a3cc784f07156f7aa47f517655bddda))
- **raspberry:** Improve login page UI and make footer dynamic ([83ea158](https://github.com/Tallec7/neopro/commit/83ea15880369f76c519190c8028ee315059185a1))
- remote sync-agent update and hotspot configuration ([#135](https://github.com/Tallec7/neopro/issues/135)) ([518524c](https://github.com/Tallec7/neopro/commit/518524c983c198ea20a38e1e620c6ebe604eec8e))
- **remote-shell:** add remote shell command support ([b69f89b](https://github.com/Tallec7/neopro/commit/b69f89bad7cfdc8cdb862789e8da4286e51f387e))
- **remote-shell:** allow rm -rf on safe paths for super_admin ([a548a2e](https://github.com/Tallec7/neopro/commit/a548a2e413da5f0cf9d10badfe6ec4bff689164d))
- **remote:** Enhance sponsor display with overlay and improved UI ([468af29](https://github.com/Tallec7/neopro/commit/468af297ce3c6861d64c4851482142ee9578d039))
- **remote:** refonte télécommande v2 avec affluence et live score ([#206](https://github.com/Tallec7/neopro/issues/206)) ([1eeb5fa](https://github.com/Tallec7/neopro/commit/1eeb5fa12cbc24b94d7eb5cf3618b9159078dd6c))
- **scripts:** improve changelog with per-commit detail files ([#56](https://github.com/Tallec7/neopro/issues/56)) ([8b0bd6a](https://github.com/Tallec7/neopro/commit/8b0bd6ae83e58b19a8edfe4b8abaa5d66f0cb4f0))
- **server:** Implement January 2026 P1 features ([#333](https://github.com/Tallec7/neopro/issues/333)) ([2547aaa](https://github.com/Tallec7/neopro/commit/2547aaa5cc8e975aa049ec103c73f54f1adc1d13))
- **sponsors:** Complete sponsor usage management (100% BP §13) ([#325](https://github.com/Tallec7/neopro/issues/325)) ([9669087](https://github.com/Tallec7/neopro/commit/9669087db4f154a5b467d0ad7dc39b28251badac))
- start central stack locally and add dashboard placeholders ([37234dc](https://github.com/Tallec7/neopro/commit/37234dc7735805fae3319b711cdd1f5f7e6b3470))
- start central stack locally and add dashboard placeholders bis ([5a07144](https://github.com/Tallec7/neopro/commit/5a0714457641c6ef5b048b077e951b14435d35f3))
- **sync-agent:** keep human friendly video names ([4090511](https://github.com/Tallec7/neopro/commit/4090511151ec41a74ba33be5d6b903ae2ae5aa4a))
- **sync:** add local video list synchronization from Pi to central ([cc514d6](https://github.com/Tallec7/neopro/commit/cc514d6a94463e1834da7b5eff79cf242089d617))
- **testing:** add comprehensive test dashboard and toolkit ([788a883](https://github.com/Tallec7/neopro/commit/788a88393be6b2a4eb50bbfbcf0bd1d27f6eea1e))
- **tv:** add video error recovery system with watchdog ([0455c38](https://github.com/Tallec7/neopro/commit/0455c388e8238c2465e215f44471ecd30a8b105e))
- **tv:** implement double-buffer video system for seamless loop transitions ([#340](https://github.com/Tallec7/neopro/issues/340)) ([8063b0e](https://github.com/Tallec7/neopro/commit/8063b0e69719a4e265ec2c6ea7856a81b6ff38f6))
- unify premium option for score and remote options ([db6351f](https://github.com/Tallec7/neopro/commit/db6351fb89faaf734d8460256fcd3b497aab5d95))
- update central server config and scripts for Supabase/Render ([e537a3f](https://github.com/Tallec7/neopro/commit/e537a3f0518d2d31d5dce917f5053eb008812f24))
- update video ([5ef86ba](https://github.com/Tallec7/neopro/commit/5ef86ba0ce98b22f6290904547990e5c2a794618))
- **updates:** add FTP diagnostic endpoint for software updates ([7f5543b](https://github.com/Tallec7/neopro/commit/7f5543b2450e7d24f2074e1dd93b79285056f6bc))
- **updates:** add upload progress tracking with retry ([30416b9](https://github.com/Tallec7/neopro/commit/30416b905a7eee9c69bfa0fdc3ab1abdb03be3dc))
- **upload:** add multiple video upload support ([#125](https://github.com/Tallec7/neopro/issues/125)) ([22ae329](https://github.com/Tallec7/neopro/commit/22ae32948457bb1dba826a95f6de4efc0f929f5b))
- **video-library:** add multi-select, category column, duration extraction ([9a4f501](https://github.com/Tallec7/neopro/commit/9a4f5016146f7cfe82c82eb1568737f93eb512a9))
- **video-upload:** implement file upload with multer ([#63](https://github.com/Tallec7/neopro/issues/63)) ([8543604](https://github.com/Tallec7/neopro/commit/85436041462667e797ac0e776c33296c77e0c663))
- **websocket:** améliorer la détection de connexion avec ping/pong ([#295](https://github.com/Tallec7/neopro/issues/295)) ([6896ce3](https://github.com/Tallec7/neopro/commit/6896ce3dc55d13b2b2e9f83eaa65cdce6742691e))

### Performance Improvements

- **memory:** adjust thresholds for Railway Hobby plan ([ab703a2](https://github.com/Tallec7/neopro/commit/ab703a26cedb693fcb2a4c029234a5ab9b9b08f4))
- **memory:** optimize for Railway Hobby plan constraints ([9cbe517](https://github.com/Tallec7/neopro/commit/9cbe517b11c7f4c75711f9c56155450f3a20a1cb))

### Reverts

- remove NgZone/ChangeDetectorRef hacks, return to simple working code ([0eda9df](https://github.com/Tallec7/neopro/commit/0eda9df8efd6c83021ec83256899c85d0ac8834b))

### BREAKING CHANGES

- **structure:** Project structure changed

* src/ -> raspberry/frontend/
* public/ -> raspberry/public/
* ng build -> ng build raspberry
* ng test -> ng test raspberry (or central-dashboard)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-authored-by: Claude <noreply@anthropic.com>

# 1.0.0 (2026-01-11)

### Bug Fixes

- add CommonModule import to TvComponent to resolve \*ngIf warnings ([5a75dcb](https://github.com/Tallec7/neopro/commit/5a75dcb7ed2f241d6050d8ae4ffc17f50382da8a))
- add error logging to connection indicator component ([#160](https://github.com/Tallec7/neopro/issues/160)) ([0bdb9c3](https://github.com/Tallec7/neopro/commit/0bdb9c37ffe351e4f1ec745faa8f7baf15efd63a))
- add neoProContent property to Site interface ([#231](https://github.com/Tallec7/neopro/issues/231)) ([8842571](https://github.com/Tallec7/neopro/commit/884257112900203e37cd755115895359d071f0e7))
- add permissions to GitHub Actions workflow for releases ([#255](https://github.com/Tallec7/neopro/issues/255)) ([66f592c](https://github.com/Tallec7/neopro/commit/66f592c22a39284d82614ff8ddd769a759eae74c))
- add rootDirectory for central-server deployment ([cd1d708](https://github.com/Tallec7/neopro/commit/cd1d708d89428668c58147d1cea3ddcb1375c4d2))
- add validation for update_config command to prevent empty payload errors ([2d8e23f](https://github.com/Tallec7/neopro/commit/2d8e23f5dd9fb8ac63c481fa24f759bf59969d48))
- add validation for update_config command to prevent empty payload errors ([#136](https://github.com/Tallec7/neopro/issues/136)) ([85c0b10](https://github.com/Tallec7/neopro/commit/85c0b10f8250516417c70fc606bf7acdbbb70ef0))
- **admin:** Add 401 redirect to login and fix aria-hidden warnings ([9b4cfc9](https://github.com/Tallec7/neopro/commit/9b4cfc99ad5cdc9319110c0f4de122def0d950a9))
- **admin:** Add credentials to API fetch calls to fix 401 errors ([#330](https://github.com/Tallec7/neopro/issues/330)) ([9a1f871](https://github.com/Tallec7/neopro/commit/9a1f871094dbc3e57d2a06bce2f97f9233156882))
- **admin:** allow sudo restarts from local UI ([725b98e](https://github.com/Tallec7/neopro/commit/725b98ef2c37ba7655d5e144895ee748edd206bc))
- **admin:** Fix authentication cookie and fetch credentials for HTTP ([057d149](https://github.com/Tallec7/neopro/commit/057d149855eb63c166624af815322bf787aaf564))
- **admin:** Fix cache.invalidateNamespace method call ([84392a4](https://github.com/Tallec7/neopro/commit/84392a4907ddcef9f7988ef54f7bf2dfbeb1f9d9))
- **admin:** load video categories dynamically from configuration ([#107](https://github.com/Tallec7/neopro/issues/107)) ([a8fc9cf](https://github.com/Tallec7/neopro/commit/a8fc9cfd954479ad79863899d68f0cb87aa470df))
- **admin:** Serve thumbnails directory as static files ([5b73a5e](https://github.com/Tallec7/neopro/commit/5b73a5e536f4fb83b2c2c0a76a0b0f3ae05dcd0f))
- **admin:** serve video files statically on port 8080 ([#116](https://github.com/Tallec7/neopro/issues/116)) ([04d7679](https://github.com/Tallec7/neopro/commit/04d7679a60499517c9c8da57739a20d9b41e79ba))
- **admin:** serve video files statically on port 8080 ([#117](https://github.com/Tallec7/neopro/issues/117)) ([cfa1596](https://github.com/Tallec7/neopro/commit/cfa1596c1c416ac0a54c49147aced0bc406824a9))
- **analytics:** add TypeScript types for PostgreSQL query results ([c56d32d](https://github.com/Tallec7/neopro/commit/c56d32d90fe766c5ae9afb03e0fb813afd20bff6))
- **analytics:** align backend API responses with frontend interfaces ([#122](https://github.com/Tallec7/neopro/issues/122)) ([9289368](https://github.com/Tallec7/neopro/commit/9289368b3200379d72faf1ca4586c3ebacb481c1))
- **analytics:** bridge Angular app to sync-agent for analytics transmission ([#64](https://github.com/Tallec7/neopro/issues/64)) ([c4ab053](https://github.com/Tallec7/neopro/commit/c4ab053d8a0c08020612aa5e779d9e7d96897f53))
- **analytics:** resolve TypeScript strict null check errors ([#40](https://github.com/Tallec7/neopro/issues/40)) ([d08a46b](https://github.com/Tallec7/neopro/commit/d08a46bd7d1a591b94247c78424c345ab2232cc3))
- **api:** align isConnected with displayStatus in dashboard endpoint ([9a5f0fd](https://github.com/Tallec7/neopro/commit/9a5f0fd0607106cc01acbded3e17890702219437))
- **api:** fix FTP test route ordering and add package URL diagnostic ([d716b98](https://github.com/Tallec7/neopro/commit/d716b98f45a2400c98cb0cb2c832dba370325174))
- **api:** Fix sponsor site filtering SQL - use sponsor_videos table ([3986407](https://github.com/Tallec7/neopro/commit/398640774e83c7284cb379c091b5ef21044eaaab))
- **api:** normalize config before diff comparison to avoid false positives ([cd9b184](https://github.com/Tallec7/neopro/commit/cd9b184fd0cf811eb028741d832675d78d4b8c34))
- **api:** optimize monitoring endpoints to prevent rate limiting ([fa9a720](https://github.com/Tallec7/neopro/commit/fa9a7206fdf816ea76278727b9360849a096c2d9))
- **api:** relax connection status thresholds to reduce false warnings ([3924342](https://github.com/Tallec7/neopro/commit/3924342ec7d4ed3ddbf673ec009879bc54704660))
- **api:** Return empty data instead of 403 for unassigned portal users ([bf504e7](https://github.com/Tallec7/neopro/commit/bf504e71cd71d3a4fc00ab01b5c3d19d22a982b9))
- **api:** use effective connection status in getSiteConnectionStatus ([2538796](https://github.com/Tallec7/neopro/commit/2538796e2cfadd36eb7adbf844c54d28edecfc6d))
- **api:** use metrics table as fallback for connection status detection ([9d6ebd7](https://github.com/Tallec7/neopro/commit/9d6ebd717290072745bd1d7c30e7d9a10547dcb0))
- **api:** use real-time Socket.IO status in getSiteStats endpoint ([82ef761](https://github.com/Tallec7/neopro/commit/82ef7614489df6a933f0b433ead868ff628dbc40))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#203](https://github.com/Tallec7/neopro/issues/203)) ([971229d](https://github.com/Tallec7/neopro/commit/971229d414b764fdf5a572ad40582e21d03fe17e))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#204](https://github.com/Tallec7/neopro/issues/204)) ([eb8deca](https://github.com/Tallec7/neopro/commit/eb8deca2024d7fcd92f0c8a8201aedefb8299794))
- **audit:** add REMOTE_SHELL audit action types ([9b44e0a](https://github.com/Tallec7/neopro/commit/9b44e0aa98beabbf8d24b81d2d80c6f92fef8279))
- **auth:** Add Authorization header fallback for mobile Safari ([5817603](https://github.com/Tallec7/neopro/commit/5817603fc4428d4e74cf252a681551991e6a4725))
- **auth:** Enable cross-origin cookies for separate frontend/backend domains ([c18a1ab](https://github.com/Tallec7/neopro/commit/c18a1ab59ea4fe83f2dc0dd9660261426d722006))
- **auth:** Fix race condition after login redirect ([6660cfb](https://github.com/Tallec7/neopro/commit/6660cfb409a61b5c61ce04bfcfd7becab311a674))
- **auth:** Include super_admin role in layout permission checks ([6a397eb](https://github.com/Tallec7/neopro/commit/6a397ebe3ea7c6ab42e00501b16e53e1efa1aed1))
- **auth:** Safari mobile support via Authorization header fallback ([ded2118](https://github.com/Tallec7/neopro/commit/ded2118f4ce27f7dc7e01acd86b126e8a05146ad))
- **auth:** Safari support + 7 day sessions ([59c69be](https://github.com/Tallec7/neopro/commit/59c69bed63dd42531647a79ec4e76b1d231a491b))
- **auth:** Safari support + 7 day sessions ([d620981](https://github.com/Tallec7/neopro/commit/d62098111f8c0f65bf3284f2b37ab0edf7699da0))
- **auth:** separate rate limits for login vs session check ([f22c2d9](https://github.com/Tallec7/neopro/commit/f22c2d9abec5b2fef012e42cad3041d8fb971e33))
- **auth:** use SHA256 instead of bcrypt for site API keys ([50fbd75](https://github.com/Tallec7/neopro/commit/50fbd75e68c41b890d350933cbd643352019344e))
- auto-detect Chromium path for kiosk mode on Raspberry Pi ([#233](https://github.com/Tallec7/neopro/issues/233)) ([1e5d2af](https://github.com/Tallec7/neopro/commit/1e5d2afc20581d9046723493bd129e56fd50c345))
- **build:** include generate-all-thumbnails.sh in raspberry deploy ([c58936e](https://github.com/Tallec7/neopro/commit/c58936eb38504fb023ffe0624db6a63ad81bd935))
- **build:** resolve TypeScript compilation errors ([#38](https://github.com/Tallec7/neopro/issues/38)) ([7cde92c](https://github.com/Tallec7/neopro/commit/7cde92cc48908e050867f2db57856b482c63d359))
- **build:** use generic type for Socket.on callback ([#39](https://github.com/Tallec7/neopro/issues/39)) ([0437ee1](https://github.com/Tallec7/neopro/commit/0437ee171f2b24e5086d81b6c8de05298a012504))
- **build:** use raspberry configuration for Pi builds ([8561839](https://github.com/Tallec7/neopro/commit/85618391c24395439dd78bb2ef6be6998d563163))
- **central-server:** fix trust proxy and deploy_video command data ([#70](https://github.com/Tallec7/neopro/issues/70)) ([883a061](https://github.com/Tallec7/neopro/commit/883a061d6d74c1a8cc78f03cbf19b0d5f4159e35))
- **central-server:** resolve memory leaks causing 503 errors ([ce26498](https://github.com/Tallec7/neopro/commit/ce26498fc1541a4f732a448845f2fd68cdd31c08))
- **central-server:** use api_key instead of api_key_hash to match Supabase ([1f440dd](https://github.com/Tallec7/neopro/commit/1f440dd788ba9f81f85a5c4c1949c9bb0fea777f))
- **ci:** add package-lock.json for semantic-release workflow ([9f8f544](https://github.com/Tallec7/neopro/commit/9f8f544cc09a8324bbd2dc7ecc26e6dfdd7c4d5e))
- **ci:** upgrade Node.js to v22 for semantic-release v24 ([7bfd614](https://github.com/Tallec7/neopro/commit/7bfd614b3e1240a62109fd20ed819c345e03b58a))
- **command-executor:** fix TypeScript compilation errors ([4a106cc](https://github.com/Tallec7/neopro/commit/4a106ccc9069a7ec1f8819833b4ec6ec305bd116))
- config ([40c5bd2](https://github.com/Tallec7/neopro/commit/40c5bd294fc8eb59cb2f7683d7ca05499a7222ff))
- **config-editor:** fix Angular template arrow function error ([#82](https://github.com/Tallec7/neopro/issues/82)) ([8c03bd6](https://github.com/Tallec7/neopro/commit/8c03bd6b55a811495ce2845650f376e13dce17c8))
- **config-editor:** fix categories display and analytics mapping ([a335203](https://github.com/Tallec7/neopro/commit/a33520323bf932917277e67d533cbc4d670d0dd9))
- **config-editor:** force change detection after loading completes ([3442d9c](https://github.com/Tallec7/neopro/commit/3442d9cd7b11ae4056568a6ddefbf017b7aebc41))
- **config-editor:** force detectChanges in loading setter ([d187293](https://github.com/Tallec7/neopro/commit/d18729316cbd3f30f328b9b07c30dab46aeec030))
- **config-editor:** handle undefined videos/subCategories arrays ([#77](https://github.com/Tallec7/neopro/issues/77)) ([794db72](https://github.com/Tallec7/neopro/commit/794db7275612c561fa5323048610e0fd4231701e))
- **config-editor:** show tabs during loading and add debug traces ([549f29e](https://github.com/Tallec7/neopro/commit/549f29e0efb367a7baac5691c93b1d7d8a0021ae))
- **config-editor:** use Angular signal for loading state ([3a4e763](https://github.com/Tallec7/neopro/commit/3a4e763e56f19ac769bd9876130fd304f676e211))
- **config-editor:** use NgZone.run for change detection ([009f037](https://github.com/Tallec7/neopro/commit/009f037d32daac22ed22f1049635ed2b1e3619ad))
- **config-editor:** use setTimeout + ngZone.run for reliable change detection ([9ff785e](https://github.com/Tallec7/neopro/commit/9ff785e8ea1dc3ba5c324d78c3b18d5d57c328c3))
- **config-editor:** use setTimeout and markForCheck for change detection ([49a9182](https://github.com/Tallec7/neopro/commit/49a918269ab8c15e04a9617fec3ecd73e486c82d))
- **config-editor:** use setTimeout to force Angular change detection for categories ([ce7e354](https://github.com/Tallec7/neopro/commit/ce7e354bd6f06839337309580d90ac7abc9fae25))
- **config-editor:** wrap state changes in ngZone.run to fix spinner ([73d376f](https://github.com/Tallec7/neopro/commit/73d376f826a2604d900b6fe198a5ac770b9b2cc2))
- **config:** preserve video owner/locked fields and fix category merge ([f4767dd](https://github.com/Tallec7/neopro/commit/f4767ddefef9cc8c25484235a1afc645771c1053))
- **config:** restore diff preview modal and fix config deployment ([15f0e13](https://github.com/Tallec7/neopro/commit/15f0e130582d4693a4e8ae8fd34e80af5c355643))
- **config:** use FTP IP address instead of hostname ([ffbb839](https://github.com/Tallec7/neopro/commit/ffbb83925349e13438467fa3bef35a435e7c6cbb))
- **content:** add checksum calculation to bulk video upload ([6afa699](https://github.com/Tallec7/neopro/commit/6afa699d5ce0c4fdc58ff80a1cf7cfbbf6d05011))
- **content:** use original filename instead of UUID for video storage ([6d429a1](https://github.com/Tallec7/neopro/commit/6d429a1d9d1248cbfef1fd092cb86b54e85b9ad7))
- controller ([498f90a](https://github.com/Tallec7/neopro/commit/498f90ad3f1d94d7f674138c2c834be122ef5316))
- correct offline queue method call (getQueueSize → getStats) ([#261](https://github.com/Tallec7/neopro/issues/261)) ([a04986c](https://github.com/Tallec7/neopro/commit/a04986c2cfe57f078613b65bf69f42be04bf2d60))
- correct params mismatch in update_config command ([#61](https://github.com/Tallec7/neopro/issues/61)) ([aca8029](https://github.com/Tallec7/neopro/commit/aca8029e8503e83a7f8470c7be382939fd154d8a))
- correct RLS policies to allow unauthenticated analytics from Raspberry Pi ([#230](https://github.com/Tallec7/neopro/issues/230)) ([1a73d90](https://github.com/Tallec7/neopro/commit/1a73d9026b9f69485423548d73ead2b0aae5326e))
- correct static publish path for dashboard health endpoint ([#269](https://github.com/Tallec7/neopro/issues/269)) ([ce5923d](https://github.com/Tallec7/neopro/commit/ce5923d31566faf793681d3f9b47841f4126514b))
- correct video deletion endpoint routing ([#271](https://github.com/Tallec7/neopro/issues/271)) ([11d5cba](https://github.com/Tallec7/neopro/commit/11d5cba03d71033930ac0babe185631ac3cef340))
- **cors:** allow X-Correlation-ID header in preflight requests ([d791004](https://github.com/Tallec7/neopro/commit/d7910041d71c7642cb9c0e3c146bed3901fc19d2))
- **cors:** normalize origins and improve CORS debugging ([4210dd7](https://github.com/Tallec7/neopro/commit/4210dd71067978ad0c5a765282cd400623a99976))
- **cors:** normalize origins and improve CORS debugging ([#170](https://github.com/Tallec7/neopro/issues/170)) ([2141786](https://github.com/Tallec7/neopro/commit/21417864bd914cf7ff8ed501a364789b2790dc2f))
- **cron:** handle self-referential FK in config_history cleanup ([9a7114d](https://github.com/Tallec7/neopro/commit/9a7114dda15d25d3a2f0c6632fde60f02271ea9e))
- dashboard health endpoint and static publishing ([#272](https://github.com/Tallec7/neopro/issues/272)) ([b4a32fb](https://github.com/Tallec7/neopro/commit/b4a32fbc283bc91368f89613bc8dbfb5f259e35d))
- **dashboard:** add media-src CSP for FTP video hosting ([fd035d8](https://github.com/Tallec7/neopro/commit/fd035d82cdc3953c0c75a20b411b68dfb10ac77f))
- **dashboard:** correct type mapping for SiteConnectionStatus ([9edbc61](https://github.com/Tallec7/neopro/commit/9edbc61917f3cf3596e283211d562fa78cc7e2a7))
- **dashboard:** display original video filename instead of UUID ([1d4ded8](https://github.com/Tallec7/neopro/commit/1d4ded899db47b60dd31a8c9631951e79f1bb643))
- **dashboard:** display real-time connection status in sites list ([9f5c7f2](https://github.com/Tallec7/neopro/commit/9f5c7f2a76109281e75614f607003d92e73d8617))
- **dashboard:** handle paginated API response format for sites ([b9774b6](https://github.com/Tallec7/neopro/commit/b9774b60bd9f7d359a6c4259e245348bbf2a94f0))
- **dashboard:** persist Socket.IO connection after page refresh ([ac3ddfc](https://github.com/Tallec7/neopro/commit/ac3ddfc458cea2db9863a127670bb35ad44f7e96))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#119](https://github.com/Tallec7/neopro/issues/119)) ([57cb728](https://github.com/Tallec7/neopro/commit/57cb728aa868aae8b364f227f9ff17ce7db01d2e))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#120](https://github.com/Tallec7/neopro/issues/120)) ([2a980c7](https://github.com/Tallec7/neopro/commit/2a980c7b449bf1189094d3e16148a3a97a516ecd))
- **dashboard:** restore config button now deploys directly ([#338](https://github.com/Tallec7/neopro/issues/338)) ([044a4f7](https://github.com/Tallec7/neopro/commit/044a4f766c7c85c0f505acfa65a389541e36db69))
- **dashboard:** trust server status='online' when showing connection state ([71d0b76](https://github.com/Tallec7/neopro/commit/71d0b76d0139b327e21040dd7bdca14f3ab7d8ed))
- **dashboard:** use real-time connection status in recent sites ([2c012ce](https://github.com/Tallec7/neopro/commit/2c012ce77bfa227b1658cfd93a082e70ce89a0ab))
- **dashboard:** use real-time connection status in sites list ([72ca128](https://github.com/Tallec7/neopro/commit/72ca12888a18b18ecfc276a02181d7e6d46c8b49))
- **db:** allow configurable SSL certificate verification for Render PostgreSQL ([d0783b4](https://github.com/Tallec7/neopro/commit/d0783b4611f1a287c23ebd3fee889caf0652fdbf))
- default update_config to replace when mode missing ([3d0a853](https://github.com/Tallec7/neopro/commit/3d0a8530429767f068319a00077f9007d8b0855e))
- **demo:** correct video paths and socket port for NARH demo ([#98](https://github.com/Tallec7/neopro/issues/98)) ([d1d2c60](https://github.com/Tallec7/neopro/commit/d1d2c60ac0e9c7cfb7523229c6636744c26c5b09))
- **deploy:** add npm install for sync-agent in all deploy scripts ([4916c85](https://github.com/Tallec7/neopro/commit/4916c8529d3af2ed0e1aafc757d032582f4145e7))
- **deploy:** allow self-signed SSL certs for cloud database providers ([#43](https://github.com/Tallec7/neopro/issues/43)) ([ccf61a6](https://github.com/Tallec7/neopro/commit/ccf61a637e07a3b10bc460a0c53170f66890b4f8))
- **deploy:** handle port 3000 already in use during deployment ([#128](https://github.com/Tallec7/neopro/issues/128)) ([289bb31](https://github.com/Tallec7/neopro/commit/289bb318c2acafa5c4f5b0e12dc6907730dfcfef))
- **deploy:** handle port 3000 already in use during deployment ([#131](https://github.com/Tallec7/neopro/issues/131)) ([d4d972c](https://github.com/Tallec7/neopro/commit/d4d972c4aaf5446cbeaa696733f2d61466a3fd7e))
- **deploy:** handle port 3000 already in use during deployment ([#133](https://github.com/Tallec7/neopro/issues/133)) ([671e165](https://github.com/Tallec7/neopro/commit/671e1656b88d7f5480d1b2c555c2b54273779d83))
- **deploy:** include sync-agent in deployment and improve error logging ([b6adb14](https://github.com/Tallec7/neopro/commit/b6adb1458c7b9ba3a53c0b9e7776bb057e44c67b))
- **deployment:** use correct storage URL for video downloads ([497f174](https://github.com/Tallec7/neopro/commit/497f1743d8c2a216b209d7a9fd108e9d1df5755c))
- **deploy:** preserve sync-agent config during SSH deployments ([8f90ea0](https://github.com/Tallec7/neopro/commit/8f90ea04a975c2413953da253d7bec9adc72625e))
- **deploy:** suppress macOS xattr warnings on Raspberry Pi ([#41](https://github.com/Tallec7/neopro/issues/41)) ([cad8d37](https://github.com/Tallec7/neopro/commit/cad8d37ce7b044164b5b0b8831fa08390d46ae09))
- enable non-interactive mode for online installation ([#247](https://github.com/Tallec7/neopro/issues/247)) ([f92030f](https://github.com/Tallec7/neopro/commit/f92030fb59d42ddfe512e85edf3fe10a744cdf77))
- ensure analytics auth cookies and DB SSL ([b199259](https://github.com/Tallec7/neopro/commit/b19925974e0bd7de5b529010e1119c296875e62f))
- Fix video list loading in admin interface ([83a7cd2](https://github.com/Tallec7/neopro/commit/83a7cd28d4b66fb1cd241f13e54d4b90f4a83a1e))
- gitignore ([0742415](https://github.com/Tallec7/neopro/commit/0742415b999c6d3afa81067ae9e7aa96f8a14b26))
- handle CORS preflight manually ([4823041](https://github.com/Tallec7/neopro/commit/4823041760d8dda8d5451f555422e073a1f6c075))
- handle liveScoreEnabled in config merge for Raspberry Pi deployment ([#232](https://github.com/Tallec7/neopro/issues/232)) ([0a55db1](https://github.com/Tallec7/neopro/commit/0a55db13504d26fa4fb62497e028b7b391abda1d))
- health ([2ae2477](https://github.com/Tallec7/neopro/commit/2ae2477c6d8bfd51d7e4cf790274070ff85639f0))
- **i18n:** Fix ngx-translate configuration for Angular 20 ([3ecb7df](https://github.com/Tallec7/neopro/commit/3ecb7df95ee4cbbdb869b478414d7d6688d75fae))
- **i18n:** replace hardcoded French text with translation keys ([c25e0c4](https://github.com/Tallec7/neopro/commit/c25e0c449fedabe92f2fd837dd7757e2a13f98d5))
- improve CORS preflight handling for admin interface ([d39cc15](https://github.com/Tallec7/neopro/commit/d39cc1585bbf5332f6daa3a4f1ebe5e79014fdd8))
- improve error handling for software update creation ([#274](https://github.com/Tallec7/neopro/issues/274)) ([45a87fc](https://github.com/Tallec7/neopro/commit/45a87fcf0e25cfd30b86ce4baa18a003bd72163e))
- improve error handling in /api/update endpoint ([#235](https://github.com/Tallec7/neopro/issues/235)) ([6be6860](https://github.com/Tallec7/neopro/commit/6be6860ae0cf7d33345a665aa3842aa677317653))
- improve generate-config-from-videos.sh script reliability ([#140](https://github.com/Tallec7/neopro/issues/140)) ([95d8388](https://github.com/Tallec7/neopro/commit/95d838857c5bd3b5bd7b80fcfb57217349429f78))
- improve raspberry build speed and version deployment ([#282](https://github.com/Tallec7/neopro/issues/282)) ([6b2d3e2](https://github.com/Tallec7/neopro/commit/6b2d3e2f4ab68c9e3ec37846a1f5d627f7cf01d3))
- include .htaccess in central-dashboard build output ([#316](https://github.com/Tallec7/neopro/issues/316)) ([478143c](https://github.com/Tallec7/neopro/commit/478143cd9c8f747e8eb88ae5bfc5eedf6ba820e1))
- include .htaccess in central-dashboard build output ([#320](https://github.com/Tallec7/neopro/issues/320)) ([946f610](https://github.com/Tallec7/neopro/commit/946f610cdb708ff19e04e424b78f2d37a066dc7f))
- initialize required directories at admin server startup ([#317](https://github.com/Tallec7/neopro/issues/317)) ([ee149fe](https://github.com/Tallec7/neopro/commit/ee149fe611693af0a80fd70f217fb021fbda64e8))
- **kiosk:** configure gpu_mem=256 for video decoding ([2315edf](https://github.com/Tallec7/neopro/commit/2315edfbe1719c01fabec9999d432cd55cab6925))
- **layout:** add missing slideIn animation definition ([#189](https://github.com/Tallec7/neopro/issues/189)) ([9770546](https://github.com/Tallec7/neopro/commit/9770546a2b51ed43cad1c0f035c8aaf1d0b48f66))
- **lint:** remove inferrable type and replace any with unknown ([#37](https://github.com/Tallec7/neopro/issues/37)) ([978c7aa](https://github.com/Tallec7/neopro/commit/978c7aaafc2b0f91b2bfd5a366da2deac4246d96))
- **lint:** resolve all ESLint errors and warnings ([#34](https://github.com/Tallec7/neopro/issues/34)) ([61a40e6](https://github.com/Tallec7/neopro/commit/61a40e62ffdc532337b6c3aac0972ce8eac70c3a))
- **local-admin:** fix TypeScript error in clientForm definition ([9e6ea6e](https://github.com/Tallec7/neopro/commit/9e6ea6e61985e70050066280745b2126a330912c))
- **local-admin:** handle nullable form values in createClient ([109b213](https://github.com/Tallec7/neopro/commit/109b2131e1c8fad14afcc9549599eba8c57d0003))
- **logs:** prevent infinite loop on frontend log rate limiting ([dc0f358](https://github.com/Tallec7/neopro/commit/dc0f3580c984a737c1c7db982cb50c5bb5846542))
- **logs:** skip backend logging when user is not authenticated ([817e916](https://github.com/Tallec7/neopro/commit/817e916732f51cdb1b7989724fd1790db18d6461))
- maj claude ([021721f](https://github.com/Tallec7/neopro/commit/021721fe8cad398bf5612a5aaa66dcf8d515f434))
- **memory:** optimize memory usage for Railway Hobby plan ([a7d9652](https://github.com/Tallec7/neopro/commit/a7d9652c99f0e3df4c1edd351b036ce70f26287d))
- metric ([3514ddb](https://github.com/Tallec7/neopro/commit/3514ddb16cab72648a5768491728ff5f5d3161bd))
- **metrics:** convert uptime to integer before database insert ([#65](https://github.com/Tallec7/neopro/issues/65)) ([937d598](https://github.com/Tallec7/neopro/commit/937d598304ab64bd87ef48a4db98baa6831e14b5))
- **overlay:** Add Socket.IO relay for cross-device communication ([775c09d](https://github.com/Tallec7/neopro/commit/775c09d82e0e3620b02f80d2de51be30f0346794))
- **overlay:** Fix preview position for 9-position overlay system ([3280b1a](https://github.com/Tallec7/neopro/commit/3280b1aff35b38e5b032b74032c8d50111c2b171))
- **overlay:** Fix timer sync and options loading between Remote and TV ([7b9514b](https://github.com/Tallec7/neopro/commit/7b9514b9269c0fc72e1fcc03bbd8e05127ee8db7))
- privilege remote ([11c3803](https://github.com/Tallec7/neopro/commit/11c38032a2fdd7be1c0493bf1d060341cd1d5abf))
- push full config from dashboard ([3caf233](https://github.com/Tallec7/neopro/commit/3caf233c34faf4de530bc2947556aba4b9bdc148))
- **qr-code:** use real hotspot SSID and display neopro.local ([fe00fb6](https://github.com/Tallec7/neopro/commit/fe00fb6558c03dbb14496516317bec318ade5c57))
- **railway:** Configure Node 20 for Nixpacks build ([b1256d3](https://github.com/Tallec7/neopro/commit/b1256d3fd5ea240f24f63883876a3d3d2f6c415e))
- **railway:** Move railway.json to root with correct start command ([b83b1ed](https://github.com/Tallec7/neopro/commit/b83b1edb61869ffc54c4fcf7d8419d5422383695))
- **railway:** Use correct Nixpacks package name for Node 20 ([f0d72fa](https://github.com/Tallec7/neopro/commit/f0d72fadea2dfbaaa599f2e97e672777e09a0259))
- **railway:** Use generic nodejs package in nixpacks ([b5a1396](https://github.com/Tallec7/neopro/commit/b5a139695bcb1aa4a3837d353b43a04ed575a534))
- **railway:** Use Node 22 via nixpacks.toml ([5815ab6](https://github.com/Tallec7/neopro/commit/5815ab6ed5cc80dc39624e12860ddc1c11ea4d5c))
- **raspberry:** add fix_permissions command and preserve permissions after update ([a2c814e](https://github.com/Tallec7/neopro/commit/a2c814eb2b0b62be97a8a7f6f7d7ec4d6f545cf5))
- **raspberry:** correct webapp permissions for sync-agent ([#123](https://github.com/Tallec7/neopro/issues/123)) ([349458c](https://github.com/Tallec7/neopro/commit/349458c98da875c2027e826ccc52203997ad92f9))
- **raspberry:** Enable Socket.IO offline mode for autonomous operation ([c0691fe](https://github.com/Tallec7/neopro/commit/c0691feb7153ae388ac4c36bacdc661d4e12e08e))
- **raspberry:** Include i18n assets in Angular build ([674179e](https://github.com/Tallec7/neopro/commit/674179e78a3db79094196447c0bd4003ec3996b8))
- **raspberry:** remove dead code referencing webapp/videos ([ad307ca](https://github.com/Tallec7/neopro/commit/ad307ca90f06f306570f6b2d908c9f0bcdc43d24))
- **rate-limit:** apply per-route rate limits to prevent 429 errors ([bc4e25d](https://github.com/Tallec7/neopro/commit/bc4e25d01e8f06b58f95caeb7e2f7859676b1958))
- **remote-shell:** allow /dev/null redirection in security blacklist ([ff6dc93](https://github.com/Tallec7/neopro/commit/ff6dc93766b560522577237a890f17d2863d2711))
- **remote-shell:** allow super_admin to access any path ([51c608f](https://github.com/Tallec7/neopro/commit/51c608f47f250d3d44a207536ad8644052d6340c))
- **remote-shell:** use WebSocket for command results to avoid Gateway timeout ([1f09838](https://github.com/Tallec7/neopro/commit/1f098389fee7e5a3d2561b4d8b6c46c84f475249))
- **remote:** Fix category and video count in telecommande ([433db91](https://github.com/Tallec7/neopro/commit/433db91041280115a190cd62a05e07da615822ce))
- **remote:** sort search results alphabetically ([a0fc934](https://github.com/Tallec7/neopro/commit/a0fc93446409a77c11c68ef3b25e836cf4e4fcad))
- remove auth guard from /tv route for kiosk mode ([#25](https://github.com/Tallec7/neopro/issues/25)) ([37034d4](https://github.com/Tallec7/neopro/commit/37034d4d1d06b6150ea0cafdfebc7a08dd6e54ec))
- remove duplicate formatJson and clean diff display ([d7752c3](https://github.com/Tallec7/neopro/commit/d7752c38aba60f21291391c625251236bc8d8a04))
- remove non-existent status column from videos query ([dfde042](https://github.com/Tallec7/neopro/commit/dfde042cd10c8165173335643514c34874518245))
- remove npm cache and use npm install instead of npm ci ([#287](https://github.com/Tallec7/neopro/issues/287)) ([1f3c2c0](https://github.com/Tallec7/neopro/commit/1f3c2c0eaa5ab32f08840eb628dc83666f546f4c))
- replace chromium-browser with chromium for Raspberry Pi OS Trixie ([#21](https://github.com/Tallec7/neopro/issues/21)) ([cfec79d](https://github.com/Tallec7/neopro/commit/cfec79d00968b56f9d074b5692e22f96a7542195))
- resolve Angular build warnings ([#219](https://github.com/Tallec7/neopro/issues/219)) ([295f413](https://github.com/Tallec7/neopro/commit/295f4139dbf36246a8f433f0de4f3f34383c3bff))
- resolve CSP blocking external images and improve video upload error handling ([#263](https://github.com/Tallec7/neopro/issues/263)) ([a36c812](https://github.com/Tallec7/neopro/commit/a36c812b0795dd21b5255e47dd19e93732af3784))
- **routes:** Move portal routes before :id routes to fix 403 error ([3b04abf](https://github.com/Tallec7/neopro/commit/3b04abf93c3848f825ce1d5e0afc184b67c0ab1b))
- **scripts:** add timeout to xattr to prevent build-and-deploy hang ([#167](https://github.com/Tallec7/neopro/issues/167)) ([011a015](https://github.com/Tallec7/neopro/commit/011a01562a53fd9db83ae0e328070bd55ebf5a20))
- **scripts:** convert CRLF to LF line endings ([#51](https://github.com/Tallec7/neopro/issues/51)) ([01e8702](https://github.com/Tallec7/neopro/commit/01e870271047ccae2e35b20a687df0239db57c3c))
- **scripts:** correct club config path and improve setup workflow ([#54](https://github.com/Tallec7/neopro/issues/54)) ([f3fdd37](https://github.com/Tallec7/neopro/commit/f3fdd37cea0950b196f263cabf421f8673451f9c))
- **scripts:** correct test script to use ng test ([#91](https://github.com/Tallec7/neopro/issues/91)) ([bfcefac](https://github.com/Tallec7/neopro/commit/bfcefacbc5db904fd08fb26c8514bf4d792cb19d))
- **security:** resolve 4 critical/high security vulnerabilities ([#32](https://github.com/Tallec7/neopro/issues/32)) ([32184d4](https://github.com/Tallec7/neopro/commit/32184d4d959d68125a36c481a05a15bae58b4ee4))
- ser ([c6b7e6c](https://github.com/Tallec7/neopro/commit/c6b7e6c0046563503046f2e07ad3146563b2d17b))
- server ([c0a47a9](https://github.com/Tallec7/neopro/commit/c0a47a9f1df16838326b79fe876ab0d83201530b))
- server dash ([03b6546](https://github.com/Tallec7/neopro/commit/03b654606c1ab538145f61029646b20235cb05cb))
- server render ([2bd5a24](https://github.com/Tallec7/neopro/commit/2bd5a243804ccefa714f7f487dc2a6ceb986e3c6))
- **server:** allow DB CA files ([14036b0](https://github.com/Tallec7/neopro/commit/14036b077e298b66db350314bdb228b419b5216d))
- **server:** start HTTP server immediately for Render health checks ([5469556](https://github.com/Tallec7/neopro/commit/5469556db1c66a8de39b3c15b9a781ae080d0f50))
- **server:** start HTTP server immediately for Render health checks ([#162](https://github.com/Tallec7/neopro/issues/162)) ([7d31c81](https://github.com/Tallec7/neopro/commit/7d31c818732838cab912237dbb7bccd2220179cc))
- **setup:** automate sync-agent registration with env vars ([8b7452d](https://github.com/Tallec7/neopro/commit/8b7452dfd94e0ace277c9bad50238a07e7d53c0f))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#48](https://github.com/Tallec7/neopro/issues/48)) ([a73ac93](https://github.com/Tallec7/neopro/commit/a73ac937ec3e90eb68db1939daaa0293f09e4c40))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#49](https://github.com/Tallec7/neopro/issues/49)) ([a025c92](https://github.com/Tallec7/neopro/commit/a025c928217847a0113c73f0c4c042047ded09a6))
- **setup:** generate config in dashboard-compatible format ([475ce26](https://github.com/Tallec7/neopro/commit/475ce2642b893890d41813f00b8887b627da438c))
- **setup:** use interactive SSH for sync-agent registration ([d2f883f](https://github.com/Tallec7/neopro/commit/d2f883fd5df05d57b403aeb439a08341716505e3))
- **setup:** use interactive SSH for sync-agent registration ([#42](https://github.com/Tallec7/neopro/issues/42)) ([6199ea5](https://github.com/Tallec7/neopro/commit/6199ea537233a7a8ee1ce238e8f0b71eaa2299f3))
- simplify CI/CD for Render.com deployment ([#285](https://github.com/Tallec7/neopro/issues/285)) ([d367c4c](https://github.com/Tallec7/neopro/commit/d367c4c09d6b0a7cc1c4b27c07e0a8eff8fc7208))
- **sites:** handle duplicate site names with -N suffix ([ca598a3](https://github.com/Tallec7/neopro/commit/ca598a3e6a798d68acdd0cbfdf5e2f2d6b8b0248))
- **sites:** use actual hardware model instead of hardcoded value ([#84](https://github.com/Tallec7/neopro/issues/84)) ([371dfc6](https://github.com/Tallec7/neopro/commit/371dfc6ee4eaa2fadb9626a0f18021c0123f0a0a))
- socket ([b54a573](https://github.com/Tallec7/neopro/commit/b54a5730e10b2864daee918f725d8e0d99c17d02))
- **socket:** add JWT authentication for dashboard users ([8fba417](https://github.com/Tallec7/neopro/commit/8fba4174e22521c60b002e3e86d40f39bdc949c0))
- **socket:** add periodic DB/WebSocket status sync to fix zombie sites ([fc03ea5](https://github.com/Tallec7/neopro/commit/fc03ea55b8e835adcd524a8deeceb00c53ecac89))
- **socket:** command timeout now handles 'executing' status ([#152](https://github.com/Tallec7/neopro/issues/152)) ([d92cdaa](https://github.com/Tallec7/neopro/commit/d92cdaabad76600a267a6726713cdeb971b0dca1))
- **socket:** detect and handle zombie connections ([3ac863f](https://github.com/Tallec7/neopro/commit/3ac863ff8eba5ac492b4b74bef9f550b77aa9512))
- **socket:** disable verbose logs in production ([#192](https://github.com/Tallec7/neopro/issues/192)) ([50f1e12](https://github.com/Tallec7/neopro/commit/50f1e125016d8a046387de5d05d947ae54686a91))
- sponsor detail API response format + TypeScript build errors ([#205](https://github.com/Tallec7/neopro/issues/205)) ([e2ed287](https://github.com/Tallec7/neopro/commit/e2ed287f87817618211b089598be39d1a9d6ede8))
- sync ([cfadf1d](https://github.com/Tallec7/neopro/commit/cfadf1deb95fc5cb15481fea90591d6691aeceb5))
- sync-agent ([977156d](https://github.com/Tallec7/neopro/commit/977156dc4b5cb86ca08a7366e300622ff94a748e))
- **sync-agent:** add get_config to allowed commands in site registration scripts ([#68](https://github.com/Tallec7/neopro/issues/68)) ([53af0f2](https://github.com/Tallec7/neopro/commit/53af0f2b824c05897cd356e98606cd73df567729))
- **sync-agent:** add npm install for sync-agent in update-software.js ([b11f7f2](https://github.com/Tallec7/neopro/commit/b11f7f2efa1eed687dff31f49eed6d053c1ad259))
- **sync-agent:** add retry logic and service existence check to startServices ([d301dd9](https://github.com/Tallec7/neopro/commit/d301dd98156ebe8afbdf9a8c9abcbe9ef34ff331))
- **sync-agent:** Add scoreOverlay support in config merge ([06fcc93](https://github.com/Tallec7/neopro/commit/06fcc93e6efc2ab829c813f3c1f96ba58fc68ecc))
- **sync-agent:** add try/catch and logging to startVideoWatcher ([c1670bc](https://github.com/Tallec7/neopro/commit/c1670bc176cdb205e7f4f51d32dce1a402858ce2))
- **sync-agent:** align update-software.js with deploy-remote.sh ([4ffb4d7](https://github.com/Tallec7/neopro/commit/4ffb4d75b66e1aa8ef00faf24a1a81e6191e25ef))
- **sync-agent:** config deployment now properly notifies local app and supports replace mode ([8ba4968](https://github.com/Tallec7/neopro/commit/8ba4968d4a7b8e4d89ca920b2fa682c26daaf95e))
- **sync-agent:** correct path concatenation in update-software.js ([d51f269](https://github.com/Tallec7/neopro/commit/d51f26967b43a3f0539f7bfdf6e2dc949436ec2c))
- **sync-agent:** deploy remotePassword to auth.password for /remote login ([49e49f1](https://github.com/Tallec7/neopro/commit/49e49f174c7fcb2da9650d5d9c79ef8ac928c2e8))
- **sync-agent:** detect and recover from zombie connections ([fe55b89](https://github.com/Tallec7/neopro/commit/fe55b89827a3acf38f3d0262590a6bb10910620f))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#45](https://github.com/Tallec7/neopro/issues/45)) ([529c949](https://github.com/Tallec7/neopro/commit/529c9491c15277a13caa8cca6f29627086fe6376))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#47](https://github.com/Tallec7/neopro/issues/47)) ([edb2294](https://github.com/Tallec7/neopro/commit/edb2294e75cd82035b711ccdde5cc5c9ed60664f))
- **sync-agent:** include deploymentId in update_progress events ([30985fc](https://github.com/Tallec7/neopro/commit/30985fc408cffdfd5e3efd4518926279435ff563))
- **sync-agent:** include deploymentId in update_progress events ([5522b39](https://github.com/Tallec7/neopro/commit/5522b394c67b32eaeddf72330e4ab30776ab29f0))
- **sync-agent:** send analytics independently of WebSocket connection ([#145](https://github.com/Tallec7/neopro/issues/145)) ([7d59247](https://github.com/Tallec7/neopro/commit/7d5924723b0b398b4861a5d97568d7664ab999ca))
- **sync-agent:** use available memory instead of used for accurate RAM metrics ([1c082b7](https://github.com/Tallec7/neopro/commit/1c082b759886d4c33ee25910aa2f3e6324aad1c7))
- **sync-agent:** use polling instead of recursive fs.watch on Linux ([bfb3eac](https://github.com/Tallec7/neopro/commit/bfb3eac948cc461bd19b447e5d73780807d516ab))
- **sync-agent:** use sudo for VERSION/release.json to handle root ownership ([1ecd7a5](https://github.com/Tallec7/neopro/commit/1ecd7a5b7f4ca04d9f819d45b4a7ed81a4a35ee1))
- **thumbnails:** add cache-buster to refresh thumbnails after regeneration ([01d016c](https://github.com/Tallec7/neopro/commit/01d016cea5b9bf7e9f2c15e2e0ec80f634e14907))
- **thumbnails:** move thumbnail when video is renamed ([b955386](https://github.com/Tallec7/neopro/commit/b9553865203bf7bc0b0be5bc606a18b11869aee0))
- tighten pending config typings ([23f2b73](https://github.com/Tallec7/neopro/commit/23f2b7309338175c0ea78dff555269944266d231))
- **tv:** improve double-buffer video transitions to prevent stuttering ([#342](https://github.com/Tallec7/neopro/issues/342)) ([b95d271](https://github.com/Tallec7/neopro/commit/b95d2710c7f14c5cff75e07d4d95f8af759d1d71))
- **tv:** require liveScoreEnabled from central to display score overlay ([8e1b2b8](https://github.com/Tallec7/neopro/commit/8e1b2b883e98d999991ddae62c2524cbd968c930))
- type-safe diff counts in config editor ([9f759f2](https://github.com/Tallec7/neopro/commit/9f759f2c1a15d7fca0622a64a97b81289fe82f64))
- **types:** Add index signatures for PostgreSQL QueryResultRow compatibility ([ae56672](https://github.com/Tallec7/neopro/commit/ae56672840e77f3dc692d27a3a827f388e967384))
- **ui:** Fix language selector dropdown on login pages ([89af4d3](https://github.com/Tallec7/neopro/commit/89af4d326f359dd939234e4cb85a87d3cbca0024))
- **ui:** Replace Tailwind classes with native CSS in agencies-management component ([83edcd3](https://github.com/Tallec7/neopro/commit/83edcd3dc27675e3867e944ebd9879763c4af983))
- **ui:** Replace Tailwind classes with native CSS in users-management component ([c63e6c1](https://github.com/Tallec7/neopro/commit/c63e6c11dca7a3de14c2c6cb95b7112335388459))
- update angular.json paths from raspberry/frontend to raspberry/src ([#242](https://github.com/Tallec7/neopro/issues/242)) ([ba4881e](https://github.com/Tallec7/neopro/commit/ba4881eb42683ba60e2844be67ca3ea26b9b06ce))
- update API URL to point to neopro-central.onrender.com ([7161f2c](https://github.com/Tallec7/neopro/commit/7161f2ced955378a2e264e16e491de9d15fb1ae6))
- update parm ([03f4c79](https://github.com/Tallec7/neopro/commit/03f4c79eac7fba5763c2d1d59ab30257c3b34f93))
- update Render URL from neopro-central-server to neopro-central ([15e53e0](https://github.com/Tallec7/neopro/commit/15e53e00e9cfddd7c85afb32f3767f6de200e4a0))
- update render.yaml to use raspberry/server for Socket.IO ([1459da1](https://github.com/Tallec7/neopro/commit/1459da126f9f192530ff15fc020dda277146af3c))
- update sponsors array during video deployment for analytics tracking ([#273](https://github.com/Tallec7/neopro/issues/273)) ([0b370de](https://github.com/Tallec7/neopro/commit/0b370de2a281187318593f55da3223a601022a6c))
- **updates:** add debug logging and endpoint for Socket.IO connection state ([cfae283](https://github.com/Tallec7/neopro/commit/cfae28356af5e2fd796f80fdc4b13e430074a508))
- **updates:** preserve user data during software updates ([#36](https://github.com/Tallec7/neopro/issues/36)) ([e897a22](https://github.com/Tallec7/neopro/commit/e897a225bb3a4dc7972d10825ad46d64cf15aedb))
- **updates:** use commandQueueService for update deployments like update_config ([818ede3](https://github.com/Tallec7/neopro/commit/818ede35eb466c6f202006f126dbd13f1f780f5c))
- url prod ([6799b0f](https://github.com/Tallec7/neopro/commit/6799b0fce3b577b13c0b5deb99b9276eb914f574))
- url prod ([49766d5](https://github.com/Tallec7/neopro/commit/49766d57e75f03459d53ffe2b990a979e46d6928))
- use chromium binary for kiosk service ([d412061](https://github.com/Tallec7/neopro/commit/d412061517f588d546b6a0df70cbc735ab3be6b2))
- use dynamic URL for analytics API instead of relative path ([f65951e](https://github.com/Tallec7/neopro/commit/f65951e8587d27cdcc093123d0ec53244e555924))
- use dynamic URL for auth API instead of localhost ([b0ecaa1](https://github.com/Tallec7/neopro/commit/b0ecaa11c6695c19c9775ea109c837e29d38da83))
- use fallbackLang instead of deprecated defaultLanguage ([8a8f71f](https://github.com/Tallec7/neopro/commit/8a8f71f82c69213da84e58cee584f9c239f93097))
- video inter ([f9a1b8f](https://github.com/Tallec7/neopro/commit/f9a1b8f31e0279b5b8d53b44e791d1defad6df6d))
- **websocket:** Connect WebSocket after user authentication ([4809af7](https://github.com/Tallec7/neopro/commit/4809af73914001fd44a56141876b8b9de6236c76))

### Code Refactoring

- **structure:** reorganize monorepo with unified Angular workspace ([#96](https://github.com/Tallec7/neopro/issues/96)) ([4f5cbe8](https://github.com/Tallec7/neopro/commit/4f5cbe8ae07831ea31149b5c5b88ad566e2cf6de))

### Features

- add /admin demo mode for Hostinger deployment ([#138](https://github.com/Tallec7/neopro/issues/138)) ([3b979e2](https://github.com/Tallec7/neopro/commit/3b979e282b10e8d794b8967a45e72e6308d52358))
- add automated script to create golden image from Mac ([#239](https://github.com/Tallec7/neopro/issues/239)) ([b782d1d](https://github.com/Tallec7/neopro/commit/b782d1ddade204a3140df20afbb7f38080cdbf3d))
- Add complete Raspberry Pi autonomous system (4 phases) ([302cb1a](https://github.com/Tallec7/neopro/commit/302cb1a97b4e48c24f337b1c049ac3072ffed7f5))
- add comprehensive security, performance, and accessibility improvements to admin panel ([#259](https://github.com/Tallec7/neopro/issues/259)) ([556893a](https://github.com/Tallec7/neopro/commit/556893a6db043e354371bf1053d507d4e1d9af59)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- Add local development setup with admin demo mode ([8fa4529](https://github.com/Tallec7/neopro/commit/8fa4529b9ea5ce7e44bb75da8af6eb28e25cf470))
- add missing API routes for content and updates management ([b9baa4d](https://github.com/Tallec7/neopro/commit/b9baa4dce914f79e01e3677ea6f21f64f6c7df62))
- add monitoring, alerting and frontend tests ([#124](https://github.com/Tallec7/neopro/issues/124)) ([cf9c12c](https://github.com/Tallec7/neopro/commit/cf9c12cfe32f3bc09e5e539e21219210284f9df2))
- Add Real-Time Connection Status Indicator ([#262](https://github.com/Tallec7/neopro/issues/262)) ([476e445](https://github.com/Tallec7/neopro/commit/476e445f123dcbd56239702cc289222338b8a68a)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- add remote club setup without local dependencies ([#256](https://github.com/Tallec7/neopro/issues/256)) ([77ca008](https://github.com/Tallec7/neopro/commit/77ca0086ce99d2eb4c4f2798af5bc41553fb49d6))
- add remote config deployment via central dashboard ([#26](https://github.com/Tallec7/neopro/issues/26)) ([2f28980](https://github.com/Tallec7/neopro/commit/2f289807af0de32b12b01b038aa34e2b1a626f2d))
- add script to generate club config from video directory ([#137](https://github.com/Tallec7/neopro/issues/137)) ([50e6386](https://github.com/Tallec7/neopro/commit/50e63865b2e1493f319e17732726303427802d67))
- add Sponsors navigation link to sidebar menu ([#196](https://github.com/Tallec7/neopro/issues/196)) ([8d581b5](https://github.com/Tallec7/neopro/commit/8d581b55fa49dedb7302ab5f4c112c144f8e81a6))
- Add subcategory support in admin video upload ([492b158](https://github.com/Tallec7/neopro/commit/492b1588b6c1d0dd97d2a77fe11daaf8baeff581))
- add video loop per match phase (before/during/after) ([#279](https://github.com/Tallec7/neopro/issues/279)) ([5257ff8](https://github.com/Tallec7/neopro/commit/5257ff84f2e5907c0ff126de01cb8da083eea180))
- **admin:** add bulk video categorization and thumbnail regeneration ([73560d7](https://github.com/Tallec7/neopro/commit/73560d722fca9d039248b8c536c71776a7cce3e7))
- **admin:** Add user management and password reset features ([aaf3f95](https://github.com/Tallec7/neopro/commit/aaf3f95c8cb7b567c66a03ba8f1564d05f3d920b))
- améliorer les uploads et la gestion des vidéos ([590c2e8](https://github.com/Tallec7/neopro/commit/590c2e8f28b44dee1162634b5a127a831c561c06))
- **analytics:** configurable analytics categories per site ([#147](https://github.com/Tallec7/neopro/issues/147)) ([ebe8a0f](https://github.com/Tallec7/neopro/commit/ebe8a0f56d60d7b47baee0da84cda907bab376a2))
- **analytics:** implement complete club analytics system (MVP + Phase 2 + Phase 3) ([#35](https://github.com/Tallec7/neopro/issues/35)) ([8d54c54](https://github.com/Tallec7/neopro/commit/8d54c54419d54a9a960950bda7d8c17a35533fdd))
- **api:** Add multi-tenant site filtering for agency and sponsor users ([ce59dba](https://github.com/Tallec7/neopro/commit/ce59dbaa2d12d98cfc3cc88c2a5ec90b010bf00d))
- **audit:** add live match event auditing ([05c2ab8](https://github.com/Tallec7/neopro/commit/05c2ab8520ad393bfd4915c860b4ab26b2fc7c44))
- auto deploy pending config ([5fcd1fe](https://github.com/Tallec7/neopro/commit/5fcd1fe625b3074beb4f1e5d252f0b19d2205e06))
- automatic deployment of live score option to Raspberry Pi ([#229](https://github.com/Tallec7/neopro/issues/229)) ([784b541](https://github.com/Tallec7/neopro/commit/784b541d035d82719886d9ca91e0c67a543b2363))
- **build:** add integrity check and version sync to build-raspberry.sh ([dd0cf5d](https://github.com/Tallec7/neopro/commit/dd0cf5dfc1daa4acec0c0410f3768bb77fd1c23c))
- **build:** include node_modules in deploy archive ([f6203be](https://github.com/Tallec7/neopro/commit/f6203be9ea1d28337356c53f42fe557554d85af9))
- **central-dashboard:** implement all TODO features ([#27](https://github.com/Tallec7/neopro/issues/27)) ([06b6778](https://github.com/Tallec7/neopro/commit/06b67786f96d65c361a788d0fc5605fe9c3eb241))
- **ci:** implement automatic semantic versioning ([d763138](https://github.com/Tallec7/neopro/commit/d76313854eb5733b16a4c078ac823d7511f8de5e))
- complete all dashboard UI components (100%) ([96607d2](https://github.com/Tallec7/neopro/commit/96607d256b632fad6730c9b3a8da3279a0387c36))
- comprehensive test coverage and sync reliability improvements ([#139](https://github.com/Tallec7/neopro/issues/139)) ([370e713](https://github.com/Tallec7/neopro/commit/370e713ff69d90a06f8a2c8dbc84c30d70c8ed24))
- **config-editor:** add structured config editor with history and diff ([#74](https://github.com/Tallec7/neopro/issues/74)) ([28c220d](https://github.com/Tallec7/neopro/commit/28c220d6644e5eb499a4dcfde061c8093818989c))
- **config:** add timeCategories and video CRUD management ([#80](https://github.com/Tallec7/neopro/issues/80)) ([ce4f091](https://github.com/Tallec7/neopro/commit/ce4f091ffc1750e5a87b13e35a1d333a94b0033c))
- **config:** add timeCategories and video CRUD management ([#81](https://github.com/Tallec7/neopro/issues/81)) ([c163795](https://github.com/Tallec7/neopro/commit/c1637956daeee6bc4437047796c9e7c026c2bcce))
- **core:** Migrate Sponsor → Advertiser (Annonceur) terminology ([83955ad](https://github.com/Tallec7/neopro/commit/83955ad8d3d88741fad6ca8661868c4258669775))
- **dashboard:** add 'Refresh from Pi' button to Content tab ([6d16afa](https://github.com/Tallec7/neopro/commit/6d16afafe3cff6b2d05ef648c3420896231a80a0))
- **dashboard:** add centralized error handling system ([53887b8](https://github.com/Tallec7/neopro/commit/53887b824f82d9b5cdcbfad4d58254acb10f3042))
- **dashboard:** add expandable details to config diff items ([2f99207](https://github.com/Tallec7/neopro/commit/2f9920712475f8a88a7423d8f59e736787036464))
- **dashboard:** add live score toggle in site detail page ([#209](https://github.com/Tallec7/neopro/issues/209)) ([8d962df](https://github.com/Tallec7/neopro/commit/8d962df15c140d65ca25fd3596f808f6ab3a7f8a))
- **dashboard:** add log throttling to prevent 429 errors ([ee27f4d](https://github.com/Tallec7/neopro/commit/ee27f4d42a1fc672a75c1b997ac379e14bf16ea9))
- **dashboard:** add QR code generator for remote access ([b716549](https://github.com/Tallec7/neopro/commit/b716549b5e7c01555859afce8e5602210905d819))
- **dashboard:** add real-time deployment feedback via Socket.IO ([7910bc2](https://github.com/Tallec7/neopro/commit/7910bc2f6201881e19c2b7ec626ecb6e1b3c6363))
- **dashboard:** add remote network diagnostics for sites ([#212](https://github.com/Tallec7/neopro/issues/212)) ([1d175c8](https://github.com/Tallec7/neopro/commit/1d175c82ba143f814f847d2407c674b44e50661d))
- **dashboard:** allow multi-video deployments ([75962a8](https://github.com/Tallec7/neopro/commit/75962a86a1263471d0a1270f176c35716babc6c8))
- **dashboard:** improve config diff display with human-readable labels ([c70207b](https://github.com/Tallec7/neopro/commit/c70207b0cd1b1f070b3135de7f07b1d7eb807355))
- **dashboard:** load existing site configuration in editor ([ba31600](https://github.com/Tallec7/neopro/commit/ba31600f022e3b0825ef6e4cd98d4058e036b0e6))
- **dashboard:** load existing site configuration in editor ([#62](https://github.com/Tallec7/neopro/issues/62)) ([65e4b06](https://github.com/Tallec7/neopro/commit/65e4b064bc30faf254403874edf6b08d949e0555))
- **dashboard:** optimize API polling with cache and aggregated endpoint ([a1012db](https://github.com/Tallec7/neopro/commit/a1012db473bd5b95e603583894dd7efb5c40c3b8))
- **dashboard:** refactor site-detail with tabs, N videos per phase, subcategory mapping ([3def8e1](https://github.com/Tallec7/neopro/commit/3def8e1c372ee3b12295476e7bb43e50585a2118))
- **dashboard:** replace alert() with global toast notifications ([#33](https://github.com/Tallec7/neopro/issues/33)) ([331e2ad](https://github.com/Tallec7/neopro/commit/331e2ad31b456c4d40924912f18dbada39d735cc))
- **dashboard:** restore missing features from config editor refactoring ([9c6def2](https://github.com/Tallec7/neopro/commit/9c6def2dc0448eec03fd166ff7745693304e9206))
- **data-retention:** add automatic cleanup for historical data ([e99a044](https://github.com/Tallec7/neopro/commit/e99a0447890e892f3eb436d61ca284f011f5a0cd))
- **debug:** add remote shell terminal for Pi debugging ([8cf244e](https://github.com/Tallec7/neopro/commit/8cf244e34f3274dbf4fc65d5d915241578843a70))
- **demo:** add demo build configuration and update docs ([#86](https://github.com/Tallec7/neopro/issues/86)) ([6124fdc](https://github.com/Tallec7/neopro/commit/6124fdcfc61f4916f11438cf6691bb3fd2331961))
- **demo:** add demo mode with club selector for presentations ([#85](https://github.com/Tallec7/neopro/issues/85)) ([d836a6d](https://github.com/Tallec7/neopro/commit/d836a6d1eaa480a4f018b6abe315bc2eae5c4b7f))
- **demo:** load clubs list dynamically from JSON file ([#89](https://github.com/Tallec7/neopro/issues/89)) ([95ea0af](https://github.com/Tallec7/neopro/commit/95ea0af79f07bb5442b85890edfc602902e88ede))
- **deployment:** use commandQueueService for video deployments ([770457c](https://github.com/Tallec7/neopro/commit/770457c448e01202fb9c74a7f7ecae5a90dd104e))
- editable ownership (Club vs NEOPRO) for categories, subcats, videos ([1bf8ca6](https://github.com/Tallec7/neopro/commit/1bf8ca6d311fb0f805641806946707738531f40f))
- granular config diff for arrays by id ([87748bc](https://github.com/Tallec7/neopro/commit/87748bce3c2bfe47205b392d2877ab39ed347b67))
- Implement all system TODOs (7 items) ([832ad00](https://github.com/Tallec7/neopro/commit/832ad00d9616bf73f34f0662c745fbb8ba68a431))
- implement automatic software update deployment to Raspberry Pi ([#275](https://github.com/Tallec7/neopro/issues/275)) ([d924bb7](https://github.com/Tallec7/neopro/commit/d924bb749b93e70fd3f2f02a842f0aef2d1667b6))
- implement complete NEOPRO fleet management system ([197e2f7](https://github.com/Tallec7/neopro/commit/197e2f7d848803be1aec449686d102f5964f9d25))
- integrate NEOPRO brand guidelines across all apps ([#28](https://github.com/Tallec7/neopro/issues/28)) ([f148152](https://github.com/Tallec7/neopro/commit/f1481521a61084541c032213820a32612e948f24))
- IP tracking and remote hotspot WiFi configuration ([#132](https://github.com/Tallec7/neopro/issues/132)) ([89ac5b9](https://github.com/Tallec7/neopro/commit/89ac5b900e5d3abb45050e5f48ade88189f0ae0b))
- **kiosk:** add watchdog to recover from Chromium "Aw, Snap!" crashes ([013ed4a](https://github.com/Tallec7/neopro/commit/013ed4aaf7064fde7d11741cd74fde267dde5ed3))
- let admins choose merge vs replace and improve diff preview ([fd4b9fe](https://github.com/Tallec7/neopro/commit/fd4b9fed7fd7ae28a2773812095ed7b9aaa9dac8))
- Live Score - Fonctionnalité complète ([#292](https://github.com/Tallec7/neopro/issues/292)) ([17bdb8a](https://github.com/Tallec7/neopro/commit/17bdb8a492e8139d7b4f2510d70d4bbb56ac1a2f))
- **login:** display club info on login pages (ports 80 & 8080) ([c8892d5](https://github.com/Tallec7/neopro/commit/c8892d5eedd10676d6e423df95f991ae0ce0c57e))
- major features implementation - RLS, Live-Score, OpenAPI docs ([#222](https://github.com/Tallec7/neopro/issues/222)) ([53894f5](https://github.com/Tallec7/neopro/commit/53894f599b5873cc6bda79ab5e6a9318e6eebf1c))
- migrate backend from Render to Railway ([6909adb](https://github.com/Tallec7/neopro/commit/6909adb987d215d9421aa07f4737ee62bd314687))
- **overlay:** Implement local overlay system with Options, Timer, Breaking News ([f4a030a](https://github.com/Tallec7/neopro/commit/f4a030a558842fa5803a8e1634202f713bb5e115))
- **overlay:** Major V2 with multi-sport support and animations ([f412646](https://github.com/Tallec7/neopro/commit/f4126464eefbd16cab20875b6b68622c0b07a579))
- ownership selector for sponsors and types updated ([21355b1](https://github.com/Tallec7/neopro/commit/21355b1d3c534de95c0a08e3012c8af5038a6850))
- propagate release version everywhere ([414d276](https://github.com/Tallec7/neopro/commit/414d27656906ec92b77ef56a7eac1ed96fc463fe))
- propagate release version everywhere ([322c499](https://github.com/Tallec7/neopro/commit/322c499dfb56135d32020e6d33767d391303fdc3))
- propagate video_id, sponsor_id and analytics_category through deployment and tracking ([#270](https://github.com/Tallec7/neopro/issues/270)) ([58e4a0a](https://github.com/Tallec7/neopro/commit/58e4a0a55c227b31b45552757a37747b31297c36))
- **qr-code:** add dedicated hotspot-config endpoint for real SSID ([88f01fc](https://github.com/Tallec7/neopro/commit/88f01fc32976d761cb75379d43a2c3364badf1a2))
- **qr-code:** fetch real SSID via get_hotspot_config command ([d5ddaa1](https://github.com/Tallec7/neopro/commit/d5ddaa1f54ae0a7d8167cb5e751293408a8de427))
- **qr-code:** use Neopro logo image instead of text ([fa0c833](https://github.com/Tallec7/neopro/commit/fa0c83386188870d31de5985747d4292800cf4f5))
- **raspberry:** add captive portal support for Android hotspot connectivity ([c8ffe4f](https://github.com/Tallec7/neopro/commit/c8ffe4ffbf4f12d5f78c4e7e2dae63af5e53b7f7))
- **raspberry:** improve deployment scripts and add backup/restore ([#50](https://github.com/Tallec7/neopro/issues/50)) ([1c852fb](https://github.com/Tallec7/neopro/commit/1c852fb16a3cc784f07156f7aa47f517655bddda))
- **raspberry:** Improve login page UI and make footer dynamic ([83ea158](https://github.com/Tallec7/neopro/commit/83ea15880369f76c519190c8028ee315059185a1))
- remote sync-agent update and hotspot configuration ([#135](https://github.com/Tallec7/neopro/issues/135)) ([518524c](https://github.com/Tallec7/neopro/commit/518524c983c198ea20a38e1e620c6ebe604eec8e))
- **remote-shell:** add remote shell command support ([b69f89b](https://github.com/Tallec7/neopro/commit/b69f89bad7cfdc8cdb862789e8da4286e51f387e))
- **remote-shell:** allow rm -rf on safe paths for super_admin ([a548a2e](https://github.com/Tallec7/neopro/commit/a548a2e413da5f0cf9d10badfe6ec4bff689164d))
- **remote:** Enhance sponsor display with overlay and improved UI ([468af29](https://github.com/Tallec7/neopro/commit/468af297ce3c6861d64c4851482142ee9578d039))
- **remote:** refonte télécommande v2 avec affluence et live score ([#206](https://github.com/Tallec7/neopro/issues/206)) ([1eeb5fa](https://github.com/Tallec7/neopro/commit/1eeb5fa12cbc24b94d7eb5cf3618b9159078dd6c))
- **scripts:** improve changelog with per-commit detail files ([#56](https://github.com/Tallec7/neopro/issues/56)) ([8b0bd6a](https://github.com/Tallec7/neopro/commit/8b0bd6ae83e58b19a8edfe4b8abaa5d66f0cb4f0))
- **server:** Implement January 2026 P1 features ([#333](https://github.com/Tallec7/neopro/issues/333)) ([2547aaa](https://github.com/Tallec7/neopro/commit/2547aaa5cc8e975aa049ec103c73f54f1adc1d13))
- **sponsors:** Complete sponsor usage management (100% BP §13) ([#325](https://github.com/Tallec7/neopro/issues/325)) ([9669087](https://github.com/Tallec7/neopro/commit/9669087db4f154a5b467d0ad7dc39b28251badac))
- start central stack locally and add dashboard placeholders ([37234dc](https://github.com/Tallec7/neopro/commit/37234dc7735805fae3319b711cdd1f5f7e6b3470))
- start central stack locally and add dashboard placeholders bis ([5a07144](https://github.com/Tallec7/neopro/commit/5a0714457641c6ef5b048b077e951b14435d35f3))
- **sync-agent:** keep human friendly video names ([4090511](https://github.com/Tallec7/neopro/commit/4090511151ec41a74ba33be5d6b903ae2ae5aa4a))
- **sync:** add local video list synchronization from Pi to central ([cc514d6](https://github.com/Tallec7/neopro/commit/cc514d6a94463e1834da7b5eff79cf242089d617))
- **testing:** add comprehensive test dashboard and toolkit ([788a883](https://github.com/Tallec7/neopro/commit/788a88393be6b2a4eb50bbfbcf0bd1d27f6eea1e))
- **tv:** add video error recovery system with watchdog ([0455c38](https://github.com/Tallec7/neopro/commit/0455c388e8238c2465e215f44471ecd30a8b105e))
- **tv:** implement double-buffer video system for seamless loop transitions ([#340](https://github.com/Tallec7/neopro/issues/340)) ([8063b0e](https://github.com/Tallec7/neopro/commit/8063b0e69719a4e265ec2c6ea7856a81b6ff38f6))
- unify premium option for score and remote options ([db6351f](https://github.com/Tallec7/neopro/commit/db6351fb89faaf734d8460256fcd3b497aab5d95))
- update central server config and scripts for Supabase/Render ([e537a3f](https://github.com/Tallec7/neopro/commit/e537a3f0518d2d31d5dce917f5053eb008812f24))
- update video ([5ef86ba](https://github.com/Tallec7/neopro/commit/5ef86ba0ce98b22f6290904547990e5c2a794618))
- **updates:** add FTP diagnostic endpoint for software updates ([7f5543b](https://github.com/Tallec7/neopro/commit/7f5543b2450e7d24f2074e1dd93b79285056f6bc))
- **updates:** add upload progress tracking with retry ([30416b9](https://github.com/Tallec7/neopro/commit/30416b905a7eee9c69bfa0fdc3ab1abdb03be3dc))
- **upload:** add multiple video upload support ([#125](https://github.com/Tallec7/neopro/issues/125)) ([22ae329](https://github.com/Tallec7/neopro/commit/22ae32948457bb1dba826a95f6de4efc0f929f5b))
- **video-library:** add multi-select, category column, duration extraction ([9a4f501](https://github.com/Tallec7/neopro/commit/9a4f5016146f7cfe82c82eb1568737f93eb512a9))
- **video-upload:** implement file upload with multer ([#63](https://github.com/Tallec7/neopro/issues/63)) ([8543604](https://github.com/Tallec7/neopro/commit/85436041462667e797ac0e776c33296c77e0c663))
- **websocket:** améliorer la détection de connexion avec ping/pong ([#295](https://github.com/Tallec7/neopro/issues/295)) ([6896ce3](https://github.com/Tallec7/neopro/commit/6896ce3dc55d13b2b2e9f83eaa65cdce6742691e))

### Performance Improvements

- **memory:** adjust thresholds for Railway Hobby plan ([ab703a2](https://github.com/Tallec7/neopro/commit/ab703a26cedb693fcb2a4c029234a5ab9b9b08f4))
- **memory:** optimize for Railway Hobby plan constraints ([9cbe517](https://github.com/Tallec7/neopro/commit/9cbe517b11c7f4c75711f9c56155450f3a20a1cb))

### Reverts

- remove NgZone/ChangeDetectorRef hacks, return to simple working code ([0eda9df](https://github.com/Tallec7/neopro/commit/0eda9df8efd6c83021ec83256899c85d0ac8834b))

### BREAKING CHANGES

- **structure:** Project structure changed

* src/ -> raspberry/frontend/
* public/ -> raspberry/public/
* ng build -> ng build raspberry
* ng test -> ng test raspberry (or central-dashboard)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-authored-by: Claude <noreply@anthropic.com>

# 1.0.0 (2026-01-11)

### Bug Fixes

- add CommonModule import to TvComponent to resolve \*ngIf warnings ([5a75dcb](https://github.com/Tallec7/neopro/commit/5a75dcb7ed2f241d6050d8ae4ffc17f50382da8a))
- add error logging to connection indicator component ([#160](https://github.com/Tallec7/neopro/issues/160)) ([0bdb9c3](https://github.com/Tallec7/neopro/commit/0bdb9c37ffe351e4f1ec745faa8f7baf15efd63a))
- add neoProContent property to Site interface ([#231](https://github.com/Tallec7/neopro/issues/231)) ([8842571](https://github.com/Tallec7/neopro/commit/884257112900203e37cd755115895359d071f0e7))
- add permissions to GitHub Actions workflow for releases ([#255](https://github.com/Tallec7/neopro/issues/255)) ([66f592c](https://github.com/Tallec7/neopro/commit/66f592c22a39284d82614ff8ddd769a759eae74c))
- add rootDirectory for central-server deployment ([cd1d708](https://github.com/Tallec7/neopro/commit/cd1d708d89428668c58147d1cea3ddcb1375c4d2))
- add validation for update_config command to prevent empty payload errors ([2d8e23f](https://github.com/Tallec7/neopro/commit/2d8e23f5dd9fb8ac63c481fa24f759bf59969d48))
- add validation for update_config command to prevent empty payload errors ([#136](https://github.com/Tallec7/neopro/issues/136)) ([85c0b10](https://github.com/Tallec7/neopro/commit/85c0b10f8250516417c70fc606bf7acdbbb70ef0))
- **admin:** Add 401 redirect to login and fix aria-hidden warnings ([9b4cfc9](https://github.com/Tallec7/neopro/commit/9b4cfc99ad5cdc9319110c0f4de122def0d950a9))
- **admin:** Add credentials to API fetch calls to fix 401 errors ([#330](https://github.com/Tallec7/neopro/issues/330)) ([9a1f871](https://github.com/Tallec7/neopro/commit/9a1f871094dbc3e57d2a06bce2f97f9233156882))
- **admin:** allow sudo restarts from local UI ([725b98e](https://github.com/Tallec7/neopro/commit/725b98ef2c37ba7655d5e144895ee748edd206bc))
- **admin:** Fix authentication cookie and fetch credentials for HTTP ([057d149](https://github.com/Tallec7/neopro/commit/057d149855eb63c166624af815322bf787aaf564))
- **admin:** Fix cache.invalidateNamespace method call ([84392a4](https://github.com/Tallec7/neopro/commit/84392a4907ddcef9f7988ef54f7bf2dfbeb1f9d9))
- **admin:** load video categories dynamically from configuration ([#107](https://github.com/Tallec7/neopro/issues/107)) ([a8fc9cf](https://github.com/Tallec7/neopro/commit/a8fc9cfd954479ad79863899d68f0cb87aa470df))
- **admin:** Serve thumbnails directory as static files ([5b73a5e](https://github.com/Tallec7/neopro/commit/5b73a5e536f4fb83b2c2c0a76a0b0f3ae05dcd0f))
- **admin:** serve video files statically on port 8080 ([#116](https://github.com/Tallec7/neopro/issues/116)) ([04d7679](https://github.com/Tallec7/neopro/commit/04d7679a60499517c9c8da57739a20d9b41e79ba))
- **admin:** serve video files statically on port 8080 ([#117](https://github.com/Tallec7/neopro/issues/117)) ([cfa1596](https://github.com/Tallec7/neopro/commit/cfa1596c1c416ac0a54c49147aced0bc406824a9))
- **analytics:** add TypeScript types for PostgreSQL query results ([c56d32d](https://github.com/Tallec7/neopro/commit/c56d32d90fe766c5ae9afb03e0fb813afd20bff6))
- **analytics:** align backend API responses with frontend interfaces ([#122](https://github.com/Tallec7/neopro/issues/122)) ([9289368](https://github.com/Tallec7/neopro/commit/9289368b3200379d72faf1ca4586c3ebacb481c1))
- **analytics:** bridge Angular app to sync-agent for analytics transmission ([#64](https://github.com/Tallec7/neopro/issues/64)) ([c4ab053](https://github.com/Tallec7/neopro/commit/c4ab053d8a0c08020612aa5e779d9e7d96897f53))
- **analytics:** resolve TypeScript strict null check errors ([#40](https://github.com/Tallec7/neopro/issues/40)) ([d08a46b](https://github.com/Tallec7/neopro/commit/d08a46bd7d1a591b94247c78424c345ab2232cc3))
- **api:** align isConnected with displayStatus in dashboard endpoint ([9a5f0fd](https://github.com/Tallec7/neopro/commit/9a5f0fd0607106cc01acbded3e17890702219437))
- **api:** fix FTP test route ordering and add package URL diagnostic ([d716b98](https://github.com/Tallec7/neopro/commit/d716b98f45a2400c98cb0cb2c832dba370325174))
- **api:** Fix sponsor site filtering SQL - use sponsor_videos table ([3986407](https://github.com/Tallec7/neopro/commit/398640774e83c7284cb379c091b5ef21044eaaab))
- **api:** normalize config before diff comparison to avoid false positives ([cd9b184](https://github.com/Tallec7/neopro/commit/cd9b184fd0cf811eb028741d832675d78d4b8c34))
- **api:** optimize monitoring endpoints to prevent rate limiting ([fa9a720](https://github.com/Tallec7/neopro/commit/fa9a7206fdf816ea76278727b9360849a096c2d9))
- **api:** relax connection status thresholds to reduce false warnings ([3924342](https://github.com/Tallec7/neopro/commit/3924342ec7d4ed3ddbf673ec009879bc54704660))
- **api:** Return empty data instead of 403 for unassigned portal users ([bf504e7](https://github.com/Tallec7/neopro/commit/bf504e71cd71d3a4fc00ab01b5c3d19d22a982b9))
- **api:** use effective connection status in getSiteConnectionStatus ([2538796](https://github.com/Tallec7/neopro/commit/2538796e2cfadd36eb7adbf844c54d28edecfc6d))
- **api:** use metrics table as fallback for connection status detection ([9d6ebd7](https://github.com/Tallec7/neopro/commit/9d6ebd717290072745bd1d7c30e7d9a10547dcb0))
- **api:** use real-time Socket.IO status in getSiteStats endpoint ([82ef761](https://github.com/Tallec7/neopro/commit/82ef7614489df6a933f0b433ead868ff628dbc40))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#203](https://github.com/Tallec7/neopro/issues/203)) ([971229d](https://github.com/Tallec7/neopro/commit/971229d414b764fdf5a572ad40582e21d03fe17e))
- **api:** wrap getSponsor response in { sponsor: ... } object ([#204](https://github.com/Tallec7/neopro/issues/204)) ([eb8deca](https://github.com/Tallec7/neopro/commit/eb8deca2024d7fcd92f0c8a8201aedefb8299794))
- **audit:** add REMOTE_SHELL audit action types ([9b44e0a](https://github.com/Tallec7/neopro/commit/9b44e0aa98beabbf8d24b81d2d80c6f92fef8279))
- **auth:** Add Authorization header fallback for mobile Safari ([5817603](https://github.com/Tallec7/neopro/commit/5817603fc4428d4e74cf252a681551991e6a4725))
- **auth:** Enable cross-origin cookies for separate frontend/backend domains ([c18a1ab](https://github.com/Tallec7/neopro/commit/c18a1ab59ea4fe83f2dc0dd9660261426d722006))
- **auth:** Fix race condition after login redirect ([6660cfb](https://github.com/Tallec7/neopro/commit/6660cfb409a61b5c61ce04bfcfd7becab311a674))
- **auth:** Include super_admin role in layout permission checks ([6a397eb](https://github.com/Tallec7/neopro/commit/6a397ebe3ea7c6ab42e00501b16e53e1efa1aed1))
- **auth:** Safari mobile support via Authorization header fallback ([ded2118](https://github.com/Tallec7/neopro/commit/ded2118f4ce27f7dc7e01acd86b126e8a05146ad))
- **auth:** Safari support + 7 day sessions ([59c69be](https://github.com/Tallec7/neopro/commit/59c69bed63dd42531647a79ec4e76b1d231a491b))
- **auth:** Safari support + 7 day sessions ([d620981](https://github.com/Tallec7/neopro/commit/d62098111f8c0f65bf3284f2b37ab0edf7699da0))
- **auth:** separate rate limits for login vs session check ([f22c2d9](https://github.com/Tallec7/neopro/commit/f22c2d9abec5b2fef012e42cad3041d8fb971e33))
- **auth:** use SHA256 instead of bcrypt for site API keys ([50fbd75](https://github.com/Tallec7/neopro/commit/50fbd75e68c41b890d350933cbd643352019344e))
- auto-detect Chromium path for kiosk mode on Raspberry Pi ([#233](https://github.com/Tallec7/neopro/issues/233)) ([1e5d2af](https://github.com/Tallec7/neopro/commit/1e5d2afc20581d9046723493bd129e56fd50c345))
- **build:** include generate-all-thumbnails.sh in raspberry deploy ([c58936e](https://github.com/Tallec7/neopro/commit/c58936eb38504fb023ffe0624db6a63ad81bd935))
- **build:** resolve TypeScript compilation errors ([#38](https://github.com/Tallec7/neopro/issues/38)) ([7cde92c](https://github.com/Tallec7/neopro/commit/7cde92cc48908e050867f2db57856b482c63d359))
- **build:** use generic type for Socket.on callback ([#39](https://github.com/Tallec7/neopro/issues/39)) ([0437ee1](https://github.com/Tallec7/neopro/commit/0437ee171f2b24e5086d81b6c8de05298a012504))
- **build:** use raspberry configuration for Pi builds ([8561839](https://github.com/Tallec7/neopro/commit/85618391c24395439dd78bb2ef6be6998d563163))
- **central-server:** fix trust proxy and deploy_video command data ([#70](https://github.com/Tallec7/neopro/issues/70)) ([883a061](https://github.com/Tallec7/neopro/commit/883a061d6d74c1a8cc78f03cbf19b0d5f4159e35))
- **central-server:** resolve memory leaks causing 503 errors ([ce26498](https://github.com/Tallec7/neopro/commit/ce26498fc1541a4f732a448845f2fd68cdd31c08))
- **central-server:** use api_key instead of api_key_hash to match Supabase ([1f440dd](https://github.com/Tallec7/neopro/commit/1f440dd788ba9f81f85a5c4c1949c9bb0fea777f))
- **ci:** add package-lock.json for semantic-release workflow ([9f8f544](https://github.com/Tallec7/neopro/commit/9f8f544cc09a8324bbd2dc7ecc26e6dfdd7c4d5e))
- **ci:** upgrade Node.js to v22 for semantic-release v24 ([7bfd614](https://github.com/Tallec7/neopro/commit/7bfd614b3e1240a62109fd20ed819c345e03b58a))
- **command-executor:** fix TypeScript compilation errors ([4a106cc](https://github.com/Tallec7/neopro/commit/4a106ccc9069a7ec1f8819833b4ec6ec305bd116))
- config ([40c5bd2](https://github.com/Tallec7/neopro/commit/40c5bd294fc8eb59cb2f7683d7ca05499a7222ff))
- **config-editor:** fix Angular template arrow function error ([#82](https://github.com/Tallec7/neopro/issues/82)) ([8c03bd6](https://github.com/Tallec7/neopro/commit/8c03bd6b55a811495ce2845650f376e13dce17c8))
- **config-editor:** fix categories display and analytics mapping ([a335203](https://github.com/Tallec7/neopro/commit/a33520323bf932917277e67d533cbc4d670d0dd9))
- **config-editor:** force change detection after loading completes ([3442d9c](https://github.com/Tallec7/neopro/commit/3442d9cd7b11ae4056568a6ddefbf017b7aebc41))
- **config-editor:** force detectChanges in loading setter ([d187293](https://github.com/Tallec7/neopro/commit/d18729316cbd3f30f328b9b07c30dab46aeec030))
- **config-editor:** handle undefined videos/subCategories arrays ([#77](https://github.com/Tallec7/neopro/issues/77)) ([794db72](https://github.com/Tallec7/neopro/commit/794db7275612c561fa5323048610e0fd4231701e))
- **config-editor:** show tabs during loading and add debug traces ([549f29e](https://github.com/Tallec7/neopro/commit/549f29e0efb367a7baac5691c93b1d7d8a0021ae))
- **config-editor:** use Angular signal for loading state ([3a4e763](https://github.com/Tallec7/neopro/commit/3a4e763e56f19ac769bd9876130fd304f676e211))
- **config-editor:** use NgZone.run for change detection ([009f037](https://github.com/Tallec7/neopro/commit/009f037d32daac22ed22f1049635ed2b1e3619ad))
- **config-editor:** use setTimeout + ngZone.run for reliable change detection ([9ff785e](https://github.com/Tallec7/neopro/commit/9ff785e8ea1dc3ba5c324d78c3b18d5d57c328c3))
- **config-editor:** use setTimeout and markForCheck for change detection ([49a9182](https://github.com/Tallec7/neopro/commit/49a918269ab8c15e04a9617fec3ecd73e486c82d))
- **config-editor:** use setTimeout to force Angular change detection for categories ([ce7e354](https://github.com/Tallec7/neopro/commit/ce7e354bd6f06839337309580d90ac7abc9fae25))
- **config-editor:** wrap state changes in ngZone.run to fix spinner ([73d376f](https://github.com/Tallec7/neopro/commit/73d376f826a2604d900b6fe198a5ac770b9b2cc2))
- **config:** preserve video owner/locked fields and fix category merge ([f4767dd](https://github.com/Tallec7/neopro/commit/f4767ddefef9cc8c25484235a1afc645771c1053))
- **config:** restore diff preview modal and fix config deployment ([15f0e13](https://github.com/Tallec7/neopro/commit/15f0e130582d4693a4e8ae8fd34e80af5c355643))
- **config:** use FTP IP address instead of hostname ([ffbb839](https://github.com/Tallec7/neopro/commit/ffbb83925349e13438467fa3bef35a435e7c6cbb))
- **content:** add checksum calculation to bulk video upload ([6afa699](https://github.com/Tallec7/neopro/commit/6afa699d5ce0c4fdc58ff80a1cf7cfbbf6d05011))
- **content:** use original filename instead of UUID for video storage ([6d429a1](https://github.com/Tallec7/neopro/commit/6d429a1d9d1248cbfef1fd092cb86b54e85b9ad7))
- controller ([498f90a](https://github.com/Tallec7/neopro/commit/498f90ad3f1d94d7f674138c2c834be122ef5316))
- correct offline queue method call (getQueueSize → getStats) ([#261](https://github.com/Tallec7/neopro/issues/261)) ([a04986c](https://github.com/Tallec7/neopro/commit/a04986c2cfe57f078613b65bf69f42be04bf2d60))
- correct params mismatch in update_config command ([#61](https://github.com/Tallec7/neopro/issues/61)) ([aca8029](https://github.com/Tallec7/neopro/commit/aca8029e8503e83a7f8470c7be382939fd154d8a))
- correct RLS policies to allow unauthenticated analytics from Raspberry Pi ([#230](https://github.com/Tallec7/neopro/issues/230)) ([1a73d90](https://github.com/Tallec7/neopro/commit/1a73d9026b9f69485423548d73ead2b0aae5326e))
- correct static publish path for dashboard health endpoint ([#269](https://github.com/Tallec7/neopro/issues/269)) ([ce5923d](https://github.com/Tallec7/neopro/commit/ce5923d31566faf793681d3f9b47841f4126514b))
- correct video deletion endpoint routing ([#271](https://github.com/Tallec7/neopro/issues/271)) ([11d5cba](https://github.com/Tallec7/neopro/commit/11d5cba03d71033930ac0babe185631ac3cef340))
- **cors:** allow X-Correlation-ID header in preflight requests ([d791004](https://github.com/Tallec7/neopro/commit/d7910041d71c7642cb9c0e3c146bed3901fc19d2))
- **cors:** normalize origins and improve CORS debugging ([4210dd7](https://github.com/Tallec7/neopro/commit/4210dd71067978ad0c5a765282cd400623a99976))
- **cors:** normalize origins and improve CORS debugging ([#170](https://github.com/Tallec7/neopro/issues/170)) ([2141786](https://github.com/Tallec7/neopro/commit/21417864bd914cf7ff8ed501a364789b2790dc2f))
- **cron:** handle self-referential FK in config_history cleanup ([9a7114d](https://github.com/Tallec7/neopro/commit/9a7114dda15d25d3a2f0c6632fde60f02271ea9e))
- dashboard health endpoint and static publishing ([#272](https://github.com/Tallec7/neopro/issues/272)) ([b4a32fb](https://github.com/Tallec7/neopro/commit/b4a32fbc283bc91368f89613bc8dbfb5f259e35d))
- **dashboard:** add media-src CSP for FTP video hosting ([fd035d8](https://github.com/Tallec7/neopro/commit/fd035d82cdc3953c0c75a20b411b68dfb10ac77f))
- **dashboard:** correct type mapping for SiteConnectionStatus ([9edbc61](https://github.com/Tallec7/neopro/commit/9edbc61917f3cf3596e283211d562fa78cc7e2a7))
- **dashboard:** display original video filename instead of UUID ([1d4ded8](https://github.com/Tallec7/neopro/commit/1d4ded899db47b60dd31a8c9631951e79f1bb643))
- **dashboard:** display real-time connection status in sites list ([9f5c7f2](https://github.com/Tallec7/neopro/commit/9f5c7f2a76109281e75614f607003d92e73d8617))
- **dashboard:** handle paginated API response format for sites ([b9774b6](https://github.com/Tallec7/neopro/commit/b9774b60bd9f7d359a6c4259e245348bbf2a94f0))
- **dashboard:** persist Socket.IO connection after page refresh ([ac3ddfc](https://github.com/Tallec7/neopro/commit/ac3ddfc458cea2db9863a127670bb35ad44f7e96))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#119](https://github.com/Tallec7/neopro/issues/119)) ([57cb728](https://github.com/Tallec7/neopro/commit/57cb728aa868aae8b364f227f9ff17ce7db01d2e))
- **dashboard:** remove unnecessary optional chaining in config-editor ([#120](https://github.com/Tallec7/neopro/issues/120)) ([2a980c7](https://github.com/Tallec7/neopro/commit/2a980c7b449bf1189094d3e16148a3a97a516ecd))
- **dashboard:** restore config button now deploys directly ([#338](https://github.com/Tallec7/neopro/issues/338)) ([044a4f7](https://github.com/Tallec7/neopro/commit/044a4f766c7c85c0f505acfa65a389541e36db69))
- **dashboard:** trust server status='online' when showing connection state ([71d0b76](https://github.com/Tallec7/neopro/commit/71d0b76d0139b327e21040dd7bdca14f3ab7d8ed))
- **dashboard:** use real-time connection status in recent sites ([2c012ce](https://github.com/Tallec7/neopro/commit/2c012ce77bfa227b1658cfd93a082e70ce89a0ab))
- **dashboard:** use real-time connection status in sites list ([72ca128](https://github.com/Tallec7/neopro/commit/72ca12888a18b18ecfc276a02181d7e6d46c8b49))
- **db:** allow configurable SSL certificate verification for Render PostgreSQL ([d0783b4](https://github.com/Tallec7/neopro/commit/d0783b4611f1a287c23ebd3fee889caf0652fdbf))
- default update_config to replace when mode missing ([3d0a853](https://github.com/Tallec7/neopro/commit/3d0a8530429767f068319a00077f9007d8b0855e))
- **demo:** correct video paths and socket port for NARH demo ([#98](https://github.com/Tallec7/neopro/issues/98)) ([d1d2c60](https://github.com/Tallec7/neopro/commit/d1d2c60ac0e9c7cfb7523229c6636744c26c5b09))
- **deploy:** add npm install for sync-agent in all deploy scripts ([4916c85](https://github.com/Tallec7/neopro/commit/4916c8529d3af2ed0e1aafc757d032582f4145e7))
- **deploy:** allow self-signed SSL certs for cloud database providers ([#43](https://github.com/Tallec7/neopro/issues/43)) ([ccf61a6](https://github.com/Tallec7/neopro/commit/ccf61a637e07a3b10bc460a0c53170f66890b4f8))
- **deploy:** handle port 3000 already in use during deployment ([#128](https://github.com/Tallec7/neopro/issues/128)) ([289bb31](https://github.com/Tallec7/neopro/commit/289bb318c2acafa5c4f5b0e12dc6907730dfcfef))
- **deploy:** handle port 3000 already in use during deployment ([#131](https://github.com/Tallec7/neopro/issues/131)) ([d4d972c](https://github.com/Tallec7/neopro/commit/d4d972c4aaf5446cbeaa696733f2d61466a3fd7e))
- **deploy:** handle port 3000 already in use during deployment ([#133](https://github.com/Tallec7/neopro/issues/133)) ([671e165](https://github.com/Tallec7/neopro/commit/671e1656b88d7f5480d1b2c555c2b54273779d83))
- **deploy:** include sync-agent in deployment and improve error logging ([b6adb14](https://github.com/Tallec7/neopro/commit/b6adb1458c7b9ba3a53c0b9e7776bb057e44c67b))
- **deployment:** use correct storage URL for video downloads ([497f174](https://github.com/Tallec7/neopro/commit/497f1743d8c2a216b209d7a9fd108e9d1df5755c))
- **deploy:** preserve sync-agent config during SSH deployments ([8f90ea0](https://github.com/Tallec7/neopro/commit/8f90ea04a975c2413953da253d7bec9adc72625e))
- **deploy:** suppress macOS xattr warnings on Raspberry Pi ([#41](https://github.com/Tallec7/neopro/issues/41)) ([cad8d37](https://github.com/Tallec7/neopro/commit/cad8d37ce7b044164b5b0b8831fa08390d46ae09))
- enable non-interactive mode for online installation ([#247](https://github.com/Tallec7/neopro/issues/247)) ([f92030f](https://github.com/Tallec7/neopro/commit/f92030fb59d42ddfe512e85edf3fe10a744cdf77))
- ensure analytics auth cookies and DB SSL ([b199259](https://github.com/Tallec7/neopro/commit/b19925974e0bd7de5b529010e1119c296875e62f))
- Fix video list loading in admin interface ([83a7cd2](https://github.com/Tallec7/neopro/commit/83a7cd28d4b66fb1cd241f13e54d4b90f4a83a1e))
- gitignore ([0742415](https://github.com/Tallec7/neopro/commit/0742415b999c6d3afa81067ae9e7aa96f8a14b26))
- handle CORS preflight manually ([4823041](https://github.com/Tallec7/neopro/commit/4823041760d8dda8d5451f555422e073a1f6c075))
- handle liveScoreEnabled in config merge for Raspberry Pi deployment ([#232](https://github.com/Tallec7/neopro/issues/232)) ([0a55db1](https://github.com/Tallec7/neopro/commit/0a55db13504d26fa4fb62497e028b7b391abda1d))
- health ([2ae2477](https://github.com/Tallec7/neopro/commit/2ae2477c6d8bfd51d7e4cf790274070ff85639f0))
- **i18n:** Fix ngx-translate configuration for Angular 20 ([3ecb7df](https://github.com/Tallec7/neopro/commit/3ecb7df95ee4cbbdb869b478414d7d6688d75fae))
- **i18n:** replace hardcoded French text with translation keys ([c25e0c4](https://github.com/Tallec7/neopro/commit/c25e0c449fedabe92f2fd837dd7757e2a13f98d5))
- improve CORS preflight handling for admin interface ([d39cc15](https://github.com/Tallec7/neopro/commit/d39cc1585bbf5332f6daa3a4f1ebe5e79014fdd8))
- improve error handling for software update creation ([#274](https://github.com/Tallec7/neopro/issues/274)) ([45a87fc](https://github.com/Tallec7/neopro/commit/45a87fcf0e25cfd30b86ce4baa18a003bd72163e))
- improve error handling in /api/update endpoint ([#235](https://github.com/Tallec7/neopro/issues/235)) ([6be6860](https://github.com/Tallec7/neopro/commit/6be6860ae0cf7d33345a665aa3842aa677317653))
- improve generate-config-from-videos.sh script reliability ([#140](https://github.com/Tallec7/neopro/issues/140)) ([95d8388](https://github.com/Tallec7/neopro/commit/95d838857c5bd3b5bd7b80fcfb57217349429f78))
- improve raspberry build speed and version deployment ([#282](https://github.com/Tallec7/neopro/issues/282)) ([6b2d3e2](https://github.com/Tallec7/neopro/commit/6b2d3e2f4ab68c9e3ec37846a1f5d627f7cf01d3))
- include .htaccess in central-dashboard build output ([#316](https://github.com/Tallec7/neopro/issues/316)) ([478143c](https://github.com/Tallec7/neopro/commit/478143cd9c8f747e8eb88ae5bfc5eedf6ba820e1))
- include .htaccess in central-dashboard build output ([#320](https://github.com/Tallec7/neopro/issues/320)) ([946f610](https://github.com/Tallec7/neopro/commit/946f610cdb708ff19e04e424b78f2d37a066dc7f))
- initialize required directories at admin server startup ([#317](https://github.com/Tallec7/neopro/issues/317)) ([ee149fe](https://github.com/Tallec7/neopro/commit/ee149fe611693af0a80fd70f217fb021fbda64e8))
- **kiosk:** configure gpu_mem=256 for video decoding ([2315edf](https://github.com/Tallec7/neopro/commit/2315edfbe1719c01fabec9999d432cd55cab6925))
- **layout:** add missing slideIn animation definition ([#189](https://github.com/Tallec7/neopro/issues/189)) ([9770546](https://github.com/Tallec7/neopro/commit/9770546a2b51ed43cad1c0f035c8aaf1d0b48f66))
- **lint:** remove inferrable type and replace any with unknown ([#37](https://github.com/Tallec7/neopro/issues/37)) ([978c7aa](https://github.com/Tallec7/neopro/commit/978c7aaafc2b0f91b2bfd5a366da2deac4246d96))
- **lint:** resolve all ESLint errors and warnings ([#34](https://github.com/Tallec7/neopro/issues/34)) ([61a40e6](https://github.com/Tallec7/neopro/commit/61a40e62ffdc532337b6c3aac0972ce8eac70c3a))
- **local-admin:** fix TypeScript error in clientForm definition ([9e6ea6e](https://github.com/Tallec7/neopro/commit/9e6ea6e61985e70050066280745b2126a330912c))
- **local-admin:** handle nullable form values in createClient ([109b213](https://github.com/Tallec7/neopro/commit/109b2131e1c8fad14afcc9549599eba8c57d0003))
- **logs:** prevent infinite loop on frontend log rate limiting ([dc0f358](https://github.com/Tallec7/neopro/commit/dc0f3580c984a737c1c7db982cb50c5bb5846542))
- **logs:** skip backend logging when user is not authenticated ([817e916](https://github.com/Tallec7/neopro/commit/817e916732f51cdb1b7989724fd1790db18d6461))
- maj claude ([021721f](https://github.com/Tallec7/neopro/commit/021721fe8cad398bf5612a5aaa66dcf8d515f434))
- **memory:** optimize memory usage for Railway Hobby plan ([a7d9652](https://github.com/Tallec7/neopro/commit/a7d9652c99f0e3df4c1edd351b036ce70f26287d))
- metric ([3514ddb](https://github.com/Tallec7/neopro/commit/3514ddb16cab72648a5768491728ff5f5d3161bd))
- **metrics:** convert uptime to integer before database insert ([#65](https://github.com/Tallec7/neopro/issues/65)) ([937d598](https://github.com/Tallec7/neopro/commit/937d598304ab64bd87ef48a4db98baa6831e14b5))
- **overlay:** Add Socket.IO relay for cross-device communication ([775c09d](https://github.com/Tallec7/neopro/commit/775c09d82e0e3620b02f80d2de51be30f0346794))
- **overlay:** Fix preview position for 9-position overlay system ([3280b1a](https://github.com/Tallec7/neopro/commit/3280b1aff35b38e5b032b74032c8d50111c2b171))
- **overlay:** Fix timer sync and options loading between Remote and TV ([7b9514b](https://github.com/Tallec7/neopro/commit/7b9514b9269c0fc72e1fcc03bbd8e05127ee8db7))
- privilege remote ([11c3803](https://github.com/Tallec7/neopro/commit/11c38032a2fdd7be1c0493bf1d060341cd1d5abf))
- push full config from dashboard ([3caf233](https://github.com/Tallec7/neopro/commit/3caf233c34faf4de530bc2947556aba4b9bdc148))
- **qr-code:** use real hotspot SSID and display neopro.local ([fe00fb6](https://github.com/Tallec7/neopro/commit/fe00fb6558c03dbb14496516317bec318ade5c57))
- **railway:** Configure Node 20 for Nixpacks build ([b1256d3](https://github.com/Tallec7/neopro/commit/b1256d3fd5ea240f24f63883876a3d3d2f6c415e))
- **railway:** Move railway.json to root with correct start command ([b83b1ed](https://github.com/Tallec7/neopro/commit/b83b1edb61869ffc54c4fcf7d8419d5422383695))
- **railway:** Use correct Nixpacks package name for Node 20 ([f0d72fa](https://github.com/Tallec7/neopro/commit/f0d72fadea2dfbaaa599f2e97e672777e09a0259))
- **railway:** Use generic nodejs package in nixpacks ([b5a1396](https://github.com/Tallec7/neopro/commit/b5a139695bcb1aa4a3837d353b43a04ed575a534))
- **railway:** Use Node 22 via nixpacks.toml ([5815ab6](https://github.com/Tallec7/neopro/commit/5815ab6ed5cc80dc39624e12860ddc1c11ea4d5c))
- **raspberry:** add fix_permissions command and preserve permissions after update ([a2c814e](https://github.com/Tallec7/neopro/commit/a2c814eb2b0b62be97a8a7f6f7d7ec4d6f545cf5))
- **raspberry:** correct webapp permissions for sync-agent ([#123](https://github.com/Tallec7/neopro/issues/123)) ([349458c](https://github.com/Tallec7/neopro/commit/349458c98da875c2027e826ccc52203997ad92f9))
- **raspberry:** Enable Socket.IO offline mode for autonomous operation ([c0691fe](https://github.com/Tallec7/neopro/commit/c0691feb7153ae388ac4c36bacdc661d4e12e08e))
- **raspberry:** Include i18n assets in Angular build ([674179e](https://github.com/Tallec7/neopro/commit/674179e78a3db79094196447c0bd4003ec3996b8))
- **raspberry:** remove dead code referencing webapp/videos ([ad307ca](https://github.com/Tallec7/neopro/commit/ad307ca90f06f306570f6b2d908c9f0bcdc43d24))
- **rate-limit:** apply per-route rate limits to prevent 429 errors ([bc4e25d](https://github.com/Tallec7/neopro/commit/bc4e25d01e8f06b58f95caeb7e2f7859676b1958))
- **remote-shell:** allow /dev/null redirection in security blacklist ([ff6dc93](https://github.com/Tallec7/neopro/commit/ff6dc93766b560522577237a890f17d2863d2711))
- **remote-shell:** allow super_admin to access any path ([51c608f](https://github.com/Tallec7/neopro/commit/51c608f47f250d3d44a207536ad8644052d6340c))
- **remote-shell:** use WebSocket for command results to avoid Gateway timeout ([1f09838](https://github.com/Tallec7/neopro/commit/1f098389fee7e5a3d2561b4d8b6c46c84f475249))
- **remote:** Fix category and video count in telecommande ([433db91](https://github.com/Tallec7/neopro/commit/433db91041280115a190cd62a05e07da615822ce))
- **remote:** sort search results alphabetically ([a0fc934](https://github.com/Tallec7/neopro/commit/a0fc93446409a77c11c68ef3b25e836cf4e4fcad))
- remove auth guard from /tv route for kiosk mode ([#25](https://github.com/Tallec7/neopro/issues/25)) ([37034d4](https://github.com/Tallec7/neopro/commit/37034d4d1d06b6150ea0cafdfebc7a08dd6e54ec))
- remove duplicate formatJson and clean diff display ([d7752c3](https://github.com/Tallec7/neopro/commit/d7752c38aba60f21291391c625251236bc8d8a04))
- remove non-existent status column from videos query ([dfde042](https://github.com/Tallec7/neopro/commit/dfde042cd10c8165173335643514c34874518245))
- remove npm cache and use npm install instead of npm ci ([#287](https://github.com/Tallec7/neopro/issues/287)) ([1f3c2c0](https://github.com/Tallec7/neopro/commit/1f3c2c0eaa5ab32f08840eb628dc83666f546f4c))
- replace chromium-browser with chromium for Raspberry Pi OS Trixie ([#21](https://github.com/Tallec7/neopro/issues/21)) ([cfec79d](https://github.com/Tallec7/neopro/commit/cfec79d00968b56f9d074b5692e22f96a7542195))
- resolve Angular build warnings ([#219](https://github.com/Tallec7/neopro/issues/219)) ([295f413](https://github.com/Tallec7/neopro/commit/295f4139dbf36246a8f433f0de4f3f34383c3bff))
- resolve CSP blocking external images and improve video upload error handling ([#263](https://github.com/Tallec7/neopro/issues/263)) ([a36c812](https://github.com/Tallec7/neopro/commit/a36c812b0795dd21b5255e47dd19e93732af3784))
- **routes:** Move portal routes before :id routes to fix 403 error ([3b04abf](https://github.com/Tallec7/neopro/commit/3b04abf93c3848f825ce1d5e0afc184b67c0ab1b))
- **scripts:** add timeout to xattr to prevent build-and-deploy hang ([#167](https://github.com/Tallec7/neopro/issues/167)) ([011a015](https://github.com/Tallec7/neopro/commit/011a01562a53fd9db83ae0e328070bd55ebf5a20))
- **scripts:** convert CRLF to LF line endings ([#51](https://github.com/Tallec7/neopro/issues/51)) ([01e8702](https://github.com/Tallec7/neopro/commit/01e870271047ccae2e35b20a687df0239db57c3c))
- **scripts:** correct club config path and improve setup workflow ([#54](https://github.com/Tallec7/neopro/issues/54)) ([f3fdd37](https://github.com/Tallec7/neopro/commit/f3fdd37cea0950b196f263cabf421f8673451f9c))
- **scripts:** correct test script to use ng test ([#91](https://github.com/Tallec7/neopro/issues/91)) ([bfcefac](https://github.com/Tallec7/neopro/commit/bfcefacbc5db904fd08fb26c8514bf4d792cb19d))
- **security:** resolve 4 critical/high security vulnerabilities ([#32](https://github.com/Tallec7/neopro/issues/32)) ([32184d4](https://github.com/Tallec7/neopro/commit/32184d4d959d68125a36c481a05a15bae58b4ee4))
- ser ([c6b7e6c](https://github.com/Tallec7/neopro/commit/c6b7e6c0046563503046f2e07ad3146563b2d17b))
- server ([c0a47a9](https://github.com/Tallec7/neopro/commit/c0a47a9f1df16838326b79fe876ab0d83201530b))
- server dash ([03b6546](https://github.com/Tallec7/neopro/commit/03b654606c1ab538145f61029646b20235cb05cb))
- server render ([2bd5a24](https://github.com/Tallec7/neopro/commit/2bd5a243804ccefa714f7f487dc2a6ceb986e3c6))
- **server:** allow DB CA files ([14036b0](https://github.com/Tallec7/neopro/commit/14036b077e298b66db350314bdb228b419b5216d))
- **server:** start HTTP server immediately for Render health checks ([5469556](https://github.com/Tallec7/neopro/commit/5469556db1c66a8de39b3c15b9a781ae080d0f50))
- **server:** start HTTP server immediately for Render health checks ([#162](https://github.com/Tallec7/neopro/issues/162)) ([7d31c81](https://github.com/Tallec7/neopro/commit/7d31c818732838cab912237dbb7bccd2220179cc))
- **setup:** automate sync-agent registration with env vars ([8b7452d](https://github.com/Tallec7/neopro/commit/8b7452dfd94e0ace277c9bad50238a07e7d53c0f))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#48](https://github.com/Tallec7/neopro/issues/48)) ([a73ac93](https://github.com/Tallec7/neopro/commit/a73ac937ec3e90eb68db1939daaa0293f09e4c40))
- **setup:** fix SSH heredoc for credentials in setup-new-club.sh ([#49](https://github.com/Tallec7/neopro/issues/49)) ([a025c92](https://github.com/Tallec7/neopro/commit/a025c928217847a0113c73f0c4c042047ded09a6))
- **setup:** generate config in dashboard-compatible format ([475ce26](https://github.com/Tallec7/neopro/commit/475ce2642b893890d41813f00b8887b627da438c))
- **setup:** use interactive SSH for sync-agent registration ([d2f883f](https://github.com/Tallec7/neopro/commit/d2f883fd5df05d57b403aeb439a08341716505e3))
- **setup:** use interactive SSH for sync-agent registration ([#42](https://github.com/Tallec7/neopro/issues/42)) ([6199ea5](https://github.com/Tallec7/neopro/commit/6199ea537233a7a8ee1ce238e8f0b71eaa2299f3))
- simplify CI/CD for Render.com deployment ([#285](https://github.com/Tallec7/neopro/issues/285)) ([d367c4c](https://github.com/Tallec7/neopro/commit/d367c4c09d6b0a7cc1c4b27c07e0a8eff8fc7208))
- **sites:** handle duplicate site names with -N suffix ([ca598a3](https://github.com/Tallec7/neopro/commit/ca598a3e6a798d68acdd0cbfdf5e2f2d6b8b0248))
- **sites:** use actual hardware model instead of hardcoded value ([#84](https://github.com/Tallec7/neopro/issues/84)) ([371dfc6](https://github.com/Tallec7/neopro/commit/371dfc6ee4eaa2fadb9626a0f18021c0123f0a0a))
- socket ([b54a573](https://github.com/Tallec7/neopro/commit/b54a5730e10b2864daee918f725d8e0d99c17d02))
- **socket:** add JWT authentication for dashboard users ([8fba417](https://github.com/Tallec7/neopro/commit/8fba4174e22521c60b002e3e86d40f39bdc949c0))
- **socket:** add periodic DB/WebSocket status sync to fix zombie sites ([fc03ea5](https://github.com/Tallec7/neopro/commit/fc03ea55b8e835adcd524a8deeceb00c53ecac89))
- **socket:** command timeout now handles 'executing' status ([#152](https://github.com/Tallec7/neopro/issues/152)) ([d92cdaa](https://github.com/Tallec7/neopro/commit/d92cdaabad76600a267a6726713cdeb971b0dca1))
- **socket:** detect and handle zombie connections ([3ac863f](https://github.com/Tallec7/neopro/commit/3ac863ff8eba5ac492b4b74bef9f550b77aa9512))
- **socket:** disable verbose logs in production ([#192](https://github.com/Tallec7/neopro/issues/192)) ([50f1e12](https://github.com/Tallec7/neopro/commit/50f1e125016d8a046387de5d05d947ae54686a91))
- sponsor detail API response format + TypeScript build errors ([#205](https://github.com/Tallec7/neopro/issues/205)) ([e2ed287](https://github.com/Tallec7/neopro/commit/e2ed287f87817618211b089598be39d1a9d6ede8))
- sync ([cfadf1d](https://github.com/Tallec7/neopro/commit/cfadf1deb95fc5cb15481fea90591d6691aeceb5))
- sync-agent ([977156d](https://github.com/Tallec7/neopro/commit/977156dc4b5cb86ca08a7366e300622ff94a748e))
- **sync-agent:** add get_config to allowed commands in site registration scripts ([#68](https://github.com/Tallec7/neopro/issues/68)) ([53af0f2](https://github.com/Tallec7/neopro/commit/53af0f2b824c05897cd356e98606cd73df567729))
- **sync-agent:** add npm install for sync-agent in update-software.js ([b11f7f2](https://github.com/Tallec7/neopro/commit/b11f7f2efa1eed687dff31f49eed6d053c1ad259))
- **sync-agent:** add retry logic and service existence check to startServices ([d301dd9](https://github.com/Tallec7/neopro/commit/d301dd98156ebe8afbdf9a8c9abcbe9ef34ff331))
- **sync-agent:** Add scoreOverlay support in config merge ([06fcc93](https://github.com/Tallec7/neopro/commit/06fcc93e6efc2ab829c813f3c1f96ba58fc68ecc))
- **sync-agent:** add try/catch and logging to startVideoWatcher ([c1670bc](https://github.com/Tallec7/neopro/commit/c1670bc176cdb205e7f4f51d32dce1a402858ce2))
- **sync-agent:** align update-software.js with deploy-remote.sh ([4ffb4d7](https://github.com/Tallec7/neopro/commit/4ffb4d75b66e1aa8ef00faf24a1a81e6191e25ef))
- **sync-agent:** config deployment now properly notifies local app and supports replace mode ([8ba4968](https://github.com/Tallec7/neopro/commit/8ba4968d4a7b8e4d89ca920b2fa682c26daaf95e))
- **sync-agent:** correct path concatenation in update-software.js ([d51f269](https://github.com/Tallec7/neopro/commit/d51f26967b43a3f0539f7bfdf6e2dc949436ec2c))
- **sync-agent:** deploy remotePassword to auth.password for /remote login ([49e49f1](https://github.com/Tallec7/neopro/commit/49e49f174c7fcb2da9650d5d9c79ef8ac928c2e8))
- **sync-agent:** detect and recover from zombie connections ([fe55b89](https://github.com/Tallec7/neopro/commit/fe55b89827a3acf38f3d0262590a6bb10910620f))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#45](https://github.com/Tallec7/neopro/issues/45)) ([529c949](https://github.com/Tallec7/neopro/commit/529c9491c15277a13caa8cca6f29627086fe6376))
- **sync-agent:** improve auth error logging and add diagnostic tools ([#47](https://github.com/Tallec7/neopro/issues/47)) ([edb2294](https://github.com/Tallec7/neopro/commit/edb2294e75cd82035b711ccdde5cc5c9ed60664f))
- **sync-agent:** include deploymentId in update_progress events ([30985fc](https://github.com/Tallec7/neopro/commit/30985fc408cffdfd5e3efd4518926279435ff563))
- **sync-agent:** include deploymentId in update_progress events ([5522b39](https://github.com/Tallec7/neopro/commit/5522b394c67b32eaeddf72330e4ab30776ab29f0))
- **sync-agent:** send analytics independently of WebSocket connection ([#145](https://github.com/Tallec7/neopro/issues/145)) ([7d59247](https://github.com/Tallec7/neopro/commit/7d5924723b0b398b4861a5d97568d7664ab999ca))
- **sync-agent:** use available memory instead of used for accurate RAM metrics ([1c082b7](https://github.com/Tallec7/neopro/commit/1c082b759886d4c33ee25910aa2f3e6324aad1c7))
- **sync-agent:** use polling instead of recursive fs.watch on Linux ([bfb3eac](https://github.com/Tallec7/neopro/commit/bfb3eac948cc461bd19b447e5d73780807d516ab))
- **sync-agent:** use sudo for VERSION/release.json to handle root ownership ([1ecd7a5](https://github.com/Tallec7/neopro/commit/1ecd7a5b7f4ca04d9f819d45b4a7ed81a4a35ee1))
- **thumbnails:** add cache-buster to refresh thumbnails after regeneration ([01d016c](https://github.com/Tallec7/neopro/commit/01d016cea5b9bf7e9f2c15e2e0ec80f634e14907))
- **thumbnails:** move thumbnail when video is renamed ([b955386](https://github.com/Tallec7/neopro/commit/b9553865203bf7bc0b0be5bc606a18b11869aee0))
- tighten pending config typings ([23f2b73](https://github.com/Tallec7/neopro/commit/23f2b7309338175c0ea78dff555269944266d231))
- **tv:** improve double-buffer video transitions to prevent stuttering ([#342](https://github.com/Tallec7/neopro/issues/342)) ([b95d271](https://github.com/Tallec7/neopro/commit/b95d2710c7f14c5cff75e07d4d95f8af759d1d71))
- **tv:** require liveScoreEnabled from central to display score overlay ([8e1b2b8](https://github.com/Tallec7/neopro/commit/8e1b2b883e98d999991ddae62c2524cbd968c930))
- type-safe diff counts in config editor ([9f759f2](https://github.com/Tallec7/neopro/commit/9f759f2c1a15d7fca0622a64a97b81289fe82f64))
- **types:** Add index signatures for PostgreSQL QueryResultRow compatibility ([ae56672](https://github.com/Tallec7/neopro/commit/ae56672840e77f3dc692d27a3a827f388e967384))
- **ui:** Fix language selector dropdown on login pages ([89af4d3](https://github.com/Tallec7/neopro/commit/89af4d326f359dd939234e4cb85a87d3cbca0024))
- **ui:** Replace Tailwind classes with native CSS in agencies-management component ([83edcd3](https://github.com/Tallec7/neopro/commit/83edcd3dc27675e3867e944ebd9879763c4af983))
- **ui:** Replace Tailwind classes with native CSS in users-management component ([c63e6c1](https://github.com/Tallec7/neopro/commit/c63e6c11dca7a3de14c2c6cb95b7112335388459))
- update angular.json paths from raspberry/frontend to raspberry/src ([#242](https://github.com/Tallec7/neopro/issues/242)) ([ba4881e](https://github.com/Tallec7/neopro/commit/ba4881eb42683ba60e2844be67ca3ea26b9b06ce))
- update API URL to point to neopro-central.onrender.com ([7161f2c](https://github.com/Tallec7/neopro/commit/7161f2ced955378a2e264e16e491de9d15fb1ae6))
- update parm ([03f4c79](https://github.com/Tallec7/neopro/commit/03f4c79eac7fba5763c2d1d59ab30257c3b34f93))
- update Render URL from neopro-central-server to neopro-central ([15e53e0](https://github.com/Tallec7/neopro/commit/15e53e00e9cfddd7c85afb32f3767f6de200e4a0))
- update render.yaml to use raspberry/server for Socket.IO ([1459da1](https://github.com/Tallec7/neopro/commit/1459da126f9f192530ff15fc020dda277146af3c))
- update sponsors array during video deployment for analytics tracking ([#273](https://github.com/Tallec7/neopro/issues/273)) ([0b370de](https://github.com/Tallec7/neopro/commit/0b370de2a281187318593f55da3223a601022a6c))
- **updates:** add debug logging and endpoint for Socket.IO connection state ([cfae283](https://github.com/Tallec7/neopro/commit/cfae28356af5e2fd796f80fdc4b13e430074a508))
- **updates:** preserve user data during software updates ([#36](https://github.com/Tallec7/neopro/issues/36)) ([e897a22](https://github.com/Tallec7/neopro/commit/e897a225bb3a4dc7972d10825ad46d64cf15aedb))
- **updates:** use commandQueueService for update deployments like update_config ([818ede3](https://github.com/Tallec7/neopro/commit/818ede35eb466c6f202006f126dbd13f1f780f5c))
- url prod ([6799b0f](https://github.com/Tallec7/neopro/commit/6799b0fce3b577b13c0b5deb99b9276eb914f574))
- url prod ([49766d5](https://github.com/Tallec7/neopro/commit/49766d57e75f03459d53ffe2b990a979e46d6928))
- use chromium binary for kiosk service ([d412061](https://github.com/Tallec7/neopro/commit/d412061517f588d546b6a0df70cbc735ab3be6b2))
- use dynamic URL for analytics API instead of relative path ([f65951e](https://github.com/Tallec7/neopro/commit/f65951e8587d27cdcc093123d0ec53244e555924))
- use dynamic URL for auth API instead of localhost ([b0ecaa1](https://github.com/Tallec7/neopro/commit/b0ecaa11c6695c19c9775ea109c837e29d38da83))
- use fallbackLang instead of deprecated defaultLanguage ([8a8f71f](https://github.com/Tallec7/neopro/commit/8a8f71f82c69213da84e58cee584f9c239f93097))
- video inter ([f9a1b8f](https://github.com/Tallec7/neopro/commit/f9a1b8f31e0279b5b8d53b44e791d1defad6df6d))
- **websocket:** Connect WebSocket after user authentication ([4809af7](https://github.com/Tallec7/neopro/commit/4809af73914001fd44a56141876b8b9de6236c76))

### Code Refactoring

- **structure:** reorganize monorepo with unified Angular workspace ([#96](https://github.com/Tallec7/neopro/issues/96)) ([4f5cbe8](https://github.com/Tallec7/neopro/commit/4f5cbe8ae07831ea31149b5c5b88ad566e2cf6de))

### Features

- add /admin demo mode for Hostinger deployment ([#138](https://github.com/Tallec7/neopro/issues/138)) ([3b979e2](https://github.com/Tallec7/neopro/commit/3b979e282b10e8d794b8967a45e72e6308d52358))
- add automated script to create golden image from Mac ([#239](https://github.com/Tallec7/neopro/issues/239)) ([b782d1d](https://github.com/Tallec7/neopro/commit/b782d1ddade204a3140df20afbb7f38080cdbf3d))
- Add complete Raspberry Pi autonomous system (4 phases) ([302cb1a](https://github.com/Tallec7/neopro/commit/302cb1a97b4e48c24f337b1c049ac3072ffed7f5))
- add comprehensive security, performance, and accessibility improvements to admin panel ([#259](https://github.com/Tallec7/neopro/issues/259)) ([556893a](https://github.com/Tallec7/neopro/commit/556893a6db043e354371bf1053d507d4e1d9af59)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- Add local development setup with admin demo mode ([8fa4529](https://github.com/Tallec7/neopro/commit/8fa4529b9ea5ce7e44bb75da8af6eb28e25cf470))
- add missing API routes for content and updates management ([b9baa4d](https://github.com/Tallec7/neopro/commit/b9baa4dce914f79e01e3677ea6f21f64f6c7df62))
- add monitoring, alerting and frontend tests ([#124](https://github.com/Tallec7/neopro/issues/124)) ([cf9c12c](https://github.com/Tallec7/neopro/commit/cf9c12cfe32f3bc09e5e539e21219210284f9df2))
- Add Real-Time Connection Status Indicator ([#262](https://github.com/Tallec7/neopro/issues/262)) ([476e445](https://github.com/Tallec7/neopro/commit/476e445f123dcbd56239702cc289222338b8a68a)), closes [#main-content](https://github.com/Tallec7/neopro/issues/main-content)
- add remote club setup without local dependencies ([#256](https://github.com/Tallec7/neopro/issues/256)) ([77ca008](https://github.com/Tallec7/neopro/commit/77ca0086ce99d2eb4c4f2798af5bc41553fb49d6))
- add remote config deployment via central dashboard ([#26](https://github.com/Tallec7/neopro/issues/26)) ([2f28980](https://github.com/Tallec7/neopro/commit/2f289807af0de32b12b01b038aa34e2b1a626f2d))
- add script to generate club config from video directory ([#137](https://github.com/Tallec7/neopro/issues/137)) ([50e6386](https://github.com/Tallec7/neopro/commit/50e63865b2e1493f319e17732726303427802d67))
- add Sponsors navigation link to sidebar menu ([#196](https://github.com/Tallec7/neopro/issues/196)) ([8d581b5](https://github.com/Tallec7/neopro/commit/8d581b55fa49dedb7302ab5f4c112c144f8e81a6))
- Add subcategory support in admin video upload ([492b158](https://github.com/Tallec7/neopro/commit/492b1588b6c1d0dd97d2a77fe11daaf8baeff581))
- add video loop per match phase (before/during/after) ([#279](https://github.com/Tallec7/neopro/issues/279)) ([5257ff8](https://github.com/Tallec7/neopro/commit/5257ff84f2e5907c0ff126de01cb8da083eea180))
- **admin:** add bulk video categorization and thumbnail regeneration ([73560d7](https://github.com/Tallec7/neopro/commit/73560d722fca9d039248b8c536c71776a7cce3e7))
- **admin:** Add user management and password reset features ([aaf3f95](https://github.com/Tallec7/neopro/commit/aaf3f95c8cb7b567c66a03ba8f1564d05f3d920b))
- améliorer les uploads et la gestion des vidéos ([590c2e8](https://github.com/Tallec7/neopro/commit/590c2e8f28b44dee1162634b5a127a831c561c06))
- **analytics:** configurable analytics categories per site ([#147](https://github.com/Tallec7/neopro/issues/147)) ([ebe8a0f](https://github.com/Tallec7/neopro/commit/ebe8a0f56d60d7b47baee0da84cda907bab376a2))
- **analytics:** implement complete club analytics system (MVP + Phase 2 + Phase 3) ([#35](https://github.com/Tallec7/neopro/issues/35)) ([8d54c54](https://github.com/Tallec7/neopro/commit/8d54c54419d54a9a960950bda7d8c17a35533fdd))
- **api:** Add multi-tenant site filtering for agency and sponsor users ([ce59dba](https://github.com/Tallec7/neopro/commit/ce59dbaa2d12d98cfc3cc88c2a5ec90b010bf00d))
- **audit:** add live match event auditing ([05c2ab8](https://github.com/Tallec7/neopro/commit/05c2ab8520ad393bfd4915c860b4ab26b2fc7c44))
- auto deploy pending config ([5fcd1fe](https://github.com/Tallec7/neopro/commit/5fcd1fe625b3074beb4f1e5d252f0b19d2205e06))
- automatic deployment of live score option to Raspberry Pi ([#229](https://github.com/Tallec7/neopro/issues/229)) ([784b541](https://github.com/Tallec7/neopro/commit/784b541d035d82719886d9ca91e0c67a543b2363))
- **build:** add integrity check and version sync to build-raspberry.sh ([dd0cf5d](https://github.com/Tallec7/neopro/commit/dd0cf5dfc1daa4acec0c0410f3768bb77fd1c23c))
- **build:** include node_modules in deploy archive ([f6203be](https://github.com/Tallec7/neopro/commit/f6203be9ea1d28337356c53f42fe557554d85af9))
- **central-dashboard:** implement all TODO features ([#27](https://github.com/Tallec7/neopro/issues/27)) ([06b6778](https://github.com/Tallec7/neopro/commit/06b67786f96d65c361a788d0fc5605fe9c3eb241))
- **ci:** implement automatic semantic versioning ([d763138](https://github.com/Tallec7/neopro/commit/d76313854eb5733b16a4c078ac823d7511f8de5e))
- complete all dashboard UI components (100%) ([96607d2](https://github.com/Tallec7/neopro/commit/96607d256b632fad6730c9b3a8da3279a0387c36))
- comprehensive test coverage and sync reliability improvements ([#139](https://github.com/Tallec7/neopro/issues/139)) ([370e713](https://github.com/Tallec7/neopro/commit/370e713ff69d90a06f8a2c8dbc84c30d70c8ed24))
- **config-editor:** add structured config editor with history and diff ([#74](https://github.com/Tallec7/neopro/issues/74)) ([28c220d](https://github.com/Tallec7/neopro/commit/28c220d6644e5eb499a4dcfde061c8093818989c))
- **config:** add timeCategories and video CRUD management ([#80](https://github.com/Tallec7/neopro/issues/80)) ([ce4f091](https://github.com/Tallec7/neopro/commit/ce4f091ffc1750e5a87b13e35a1d333a94b0033c))
- **config:** add timeCategories and video CRUD management ([#81](https://github.com/Tallec7/neopro/issues/81)) ([c163795](https://github.com/Tallec7/neopro/commit/c1637956daeee6bc4437047796c9e7c026c2bcce))
- **core:** Migrate Sponsor → Advertiser (Annonceur) terminology ([83955ad](https://github.com/Tallec7/neopro/commit/83955ad8d3d88741fad6ca8661868c4258669775))
- **dashboard:** add 'Refresh from Pi' button to Content tab ([6d16afa](https://github.com/Tallec7/neopro/commit/6d16afafe3cff6b2d05ef648c3420896231a80a0))
- **dashboard:** add centralized error handling system ([53887b8](https://github.com/Tallec7/neopro/commit/53887b824f82d9b5cdcbfad4d58254acb10f3042))
- **dashboard:** add expandable details to config diff items ([2f99207](https://github.com/Tallec7/neopro/commit/2f9920712475f8a88a7423d8f59e736787036464))
- **dashboard:** add live score toggle in site detail page ([#209](https://github.com/Tallec7/neopro/issues/209)) ([8d962df](https://github.com/Tallec7/neopro/commit/8d962df15c140d65ca25fd3596f808f6ab3a7f8a))
- **dashboard:** add log throttling to prevent 429 errors ([ee27f4d](https://github.com/Tallec7/neopro/commit/ee27f4d42a1fc672a75c1b997ac379e14bf16ea9))
- **dashboard:** add QR code generator for remote access ([b716549](https://github.com/Tallec7/neopro/commit/b716549b5e7c01555859afce8e5602210905d819))
- **dashboard:** add real-time deployment feedback via Socket.IO ([7910bc2](https://github.com/Tallec7/neopro/commit/7910bc2f6201881e19c2b7ec626ecb6e1b3c6363))
- **dashboard:** add remote network diagnostics for sites ([#212](https://github.com/Tallec7/neopro/issues/212)) ([1d175c8](https://github.com/Tallec7/neopro/commit/1d175c82ba143f814f847d2407c674b44e50661d))
- **dashboard:** allow multi-video deployments ([75962a8](https://github.com/Tallec7/neopro/commit/75962a86a1263471d0a1270f176c35716babc6c8))
- **dashboard:** improve config diff display with human-readable labels ([c70207b](https://github.com/Tallec7/neopro/commit/c70207b0cd1b1f070b3135de7f07b1d7eb807355))
- **dashboard:** load existing site configuration in editor ([ba31600](https://github.com/Tallec7/neopro/commit/ba31600f022e3b0825ef6e4cd98d4058e036b0e6))
- **dashboard:** load existing site configuration in editor ([#62](https://github.com/Tallec7/neopro/issues/62)) ([65e4b06](https://github.com/Tallec7/neopro/commit/65e4b064bc30faf254403874edf6b08d949e0555))
- **dashboard:** optimize API polling with cache and aggregated endpoint ([a1012db](https://github.com/Tallec7/neopro/commit/a1012db473bd5b95e603583894dd7efb5c40c3b8))
- **dashboard:** refactor site-detail with tabs, N videos per phase, subcategory mapping ([3def8e1](https://github.com/Tallec7/neopro/commit/3def8e1c372ee3b12295476e7bb43e50585a2118))
- **dashboard:** replace alert() with global toast notifications ([#33](https://github.com/Tallec7/neopro/issues/33)) ([331e2ad](https://github.com/Tallec7/neopro/commit/331e2ad31b456c4d40924912f18dbada39d735cc))
- **dashboard:** restore missing features from config editor refactoring ([9c6def2](https://github.com/Tallec7/neopro/commit/9c6def2dc0448eec03fd166ff7745693304e9206))
- **data-retention:** add automatic cleanup for historical data ([e99a044](https://github.com/Tallec7/neopro/commit/e99a0447890e892f3eb436d61ca284f011f5a0cd))
- **debug:** add remote shell terminal for Pi debugging ([8cf244e](https://github.com/Tallec7/neopro/commit/8cf244e34f3274dbf4fc65d5d915241578843a70))
- **demo:** add demo build configuration and update docs ([#86](https://github.com/Tallec7/neopro/issues/86)) ([6124fdc](https://github.com/Tallec7/neopro/commit/6124fdcfc61f4916f11438cf6691bb3fd2331961))
- **demo:** add demo mode with club selector for presentations ([#85](https://github.com/Tallec7/neopro/issues/85)) ([d836a6d](https://github.com/Tallec7/neopro/commit/d836a6d1eaa480a4f018b6abe315bc2eae5c4b7f))
- **demo:** load clubs list dynamically from JSON file ([#89](https://github.com/Tallec7/neopro/issues/89)) ([95ea0af](https://github.com/Tallec7/neopro/commit/95ea0af79f07bb5442b85890edfc602902e88ede))
- **deployment:** use commandQueueService for video deployments ([770457c](https://github.com/Tallec7/neopro/commit/770457c448e01202fb9c74a7f7ecae5a90dd104e))
- editable ownership (Club vs NEOPRO) for categories, subcats, videos ([1bf8ca6](https://github.com/Tallec7/neopro/commit/1bf8ca6d311fb0f805641806946707738531f40f))
- granular config diff for arrays by id ([87748bc](https://github.com/Tallec7/neopro/commit/87748bce3c2bfe47205b392d2877ab39ed347b67))
- Implement all system TODOs (7 items) ([832ad00](https://github.com/Tallec7/neopro/commit/832ad00d9616bf73f34f0662c745fbb8ba68a431))
- implement automatic software update deployment to Raspberry Pi ([#275](https://github.com/Tallec7/neopro/issues/275)) ([d924bb7](https://github.com/Tallec7/neopro/commit/d924bb749b93e70fd3f2f02a842f0aef2d1667b6))
- implement complete NEOPRO fleet management system ([197e2f7](https://github.com/Tallec7/neopro/commit/197e2f7d848803be1aec449686d102f5964f9d25))
- integrate NEOPRO brand guidelines across all apps ([#28](https://github.com/Tallec7/neopro/issues/28)) ([f148152](https://github.com/Tallec7/neopro/commit/f1481521a61084541c032213820a32612e948f24))
- IP tracking and remote hotspot WiFi configuration ([#132](https://github.com/Tallec7/neopro/issues/132)) ([89ac5b9](https://github.com/Tallec7/neopro/commit/89ac5b900e5d3abb45050e5f48ade88189f0ae0b))
- **kiosk:** add watchdog to recover from Chromium "Aw, Snap!" crashes ([013ed4a](https://github.com/Tallec7/neopro/commit/013ed4aaf7064fde7d11741cd74fde267dde5ed3))
- let admins choose merge vs replace and improve diff preview ([fd4b9fe](https://github.com/Tallec7/neopro/commit/fd4b9fed7fd7ae28a2773812095ed7b9aaa9dac8))
- Live Score - Fonctionnalité complète ([#292](https://github.com/Tallec7/neopro/issues/292)) ([17bdb8a](https://github.com/Tallec7/neopro/commit/17bdb8a492e8139d7b4f2510d70d4bbb56ac1a2f))
- **login:** display club info on login pages (ports 80 & 8080) ([c8892d5](https://github.com/Tallec7/neopro/commit/c8892d5eedd10676d6e423df95f991ae0ce0c57e))
- major features implementation - RLS, Live-Score, OpenAPI docs ([#222](https://github.com/Tallec7/neopro/issues/222)) ([53894f5](https://github.com/Tallec7/neopro/commit/53894f599b5873cc6bda79ab5e6a9318e6eebf1c))
- migrate backend from Render to Railway ([6909adb](https://github.com/Tallec7/neopro/commit/6909adb987d215d9421aa07f4737ee62bd314687))
- **overlay:** Implement local overlay system with Options, Timer, Breaking News ([f4a030a](https://github.com/Tallec7/neopro/commit/f4a030a558842fa5803a8e1634202f713bb5e115))
- **overlay:** Major V2 with multi-sport support and animations ([f412646](https://github.com/Tallec7/neopro/commit/f4126464eefbd16cab20875b6b68622c0b07a579))
- ownership selector for sponsors and types updated ([21355b1](https://github.com/Tallec7/neopro/commit/21355b1d3c534de95c0a08e3012c8af5038a6850))
- propagate release version everywhere ([414d276](https://github.com/Tallec7/neopro/commit/414d27656906ec92b77ef56a7eac1ed96fc463fe))
- propagate release version everywhere ([322c499](https://github.com/Tallec7/neopro/commit/322c499dfb56135d32020e6d33767d391303fdc3))
- propagate video_id, sponsor_id and analytics_category through deployment and tracking ([#270](https://github.com/Tallec7/neopro/issues/270)) ([58e4a0a](https://github.com/Tallec7/neopro/commit/58e4a0a55c227b31b45552757a37747b31297c36))
- **qr-code:** add dedicated hotspot-config endpoint for real SSID ([88f01fc](https://github.com/Tallec7/neopro/commit/88f01fc32976d761cb75379d43a2c3364badf1a2))
- **qr-code:** fetch real SSID via get_hotspot_config command ([d5ddaa1](https://github.com/Tallec7/neopro/commit/d5ddaa1f54ae0a7d8167cb5e751293408a8de427))
- **qr-code:** use Neopro logo image instead of text ([fa0c833](https://github.com/Tallec7/neopro/commit/fa0c83386188870d31de5985747d4292800cf4f5))
- **raspberry:** add captive portal support for Android hotspot connectivity ([c8ffe4f](https://github.com/Tallec7/neopro/commit/c8ffe4ffbf4f12d5f78c4e7e2dae63af5e53b7f7))
- **raspberry:** improve deployment scripts and add backup/restore ([#50](https://github.com/Tallec7/neopro/issues/50)) ([1c852fb](https://github.com/Tallec7/neopro/commit/1c852fb16a3cc784f07156f7aa47f517655bddda))
- **raspberry:** Improve login page UI and make footer dynamic ([83ea158](https://github.com/Tallec7/neopro/commit/83ea15880369f76c519190c8028ee315059185a1))
- remote sync-agent update and hotspot configuration ([#135](https://github.com/Tallec7/neopro/issues/135)) ([518524c](https://github.com/Tallec7/neopro/commit/518524c983c198ea20a38e1e620c6ebe604eec8e))
- **remote-shell:** add remote shell command support ([b69f89b](https://github.com/Tallec7/neopro/commit/b69f89bad7cfdc8cdb862789e8da4286e51f387e))
- **remote-shell:** allow rm -rf on safe paths for super_admin ([a548a2e](https://github.com/Tallec7/neopro/commit/a548a2e413da5f0cf9d10badfe6ec4bff689164d))
- **remote:** Enhance sponsor display with overlay and improved UI ([468af29](https://github.com/Tallec7/neopro/commit/468af297ce3c6861d64c4851482142ee9578d039))
- **remote:** refonte télécommande v2 avec affluence et live score ([#206](https://github.com/Tallec7/neopro/issues/206)) ([1eeb5fa](https://github.com/Tallec7/neopro/commit/1eeb5fa12cbc24b94d7eb5cf3618b9159078dd6c))
- **scripts:** improve changelog with per-commit detail files ([#56](https://github.com/Tallec7/neopro/issues/56)) ([8b0bd6a](https://github.com/Tallec7/neopro/commit/8b0bd6ae83e58b19a8edfe4b8abaa5d66f0cb4f0))
- **server:** Implement January 2026 P1 features ([#333](https://github.com/Tallec7/neopro/issues/333)) ([2547aaa](https://github.com/Tallec7/neopro/commit/2547aaa5cc8e975aa049ec103c73f54f1adc1d13))
- **sponsors:** Complete sponsor usage management (100% BP §13) ([#325](https://github.com/Tallec7/neopro/issues/325)) ([9669087](https://github.com/Tallec7/neopro/commit/9669087db4f154a5b467d0ad7dc39b28251badac))
- start central stack locally and add dashboard placeholders ([37234dc](https://github.com/Tallec7/neopro/commit/37234dc7735805fae3319b711cdd1f5f7e6b3470))
- start central stack locally and add dashboard placeholders bis ([5a07144](https://github.com/Tallec7/neopro/commit/5a0714457641c6ef5b048b077e951b14435d35f3))
- **sync-agent:** keep human friendly video names ([4090511](https://github.com/Tallec7/neopro/commit/4090511151ec41a74ba33be5d6b903ae2ae5aa4a))
- **sync:** add local video list synchronization from Pi to central ([cc514d6](https://github.com/Tallec7/neopro/commit/cc514d6a94463e1834da7b5eff79cf242089d617))
- **testing:** add comprehensive test dashboard and toolkit ([788a883](https://github.com/Tallec7/neopro/commit/788a88393be6b2a4eb50bbfbcf0bd1d27f6eea1e))
- **tv:** add video error recovery system with watchdog ([0455c38](https://github.com/Tallec7/neopro/commit/0455c388e8238c2465e215f44471ecd30a8b105e))
- **tv:** implement double-buffer video system for seamless loop transitions ([#340](https://github.com/Tallec7/neopro/issues/340)) ([8063b0e](https://github.com/Tallec7/neopro/commit/8063b0e69719a4e265ec2c6ea7856a81b6ff38f6))
- unify premium option for score and remote options ([db6351f](https://github.com/Tallec7/neopro/commit/db6351fb89faaf734d8460256fcd3b497aab5d95))
- update central server config and scripts for Supabase/Render ([e537a3f](https://github.com/Tallec7/neopro/commit/e537a3f0518d2d31d5dce917f5053eb008812f24))
- update video ([5ef86ba](https://github.com/Tallec7/neopro/commit/5ef86ba0ce98b22f6290904547990e5c2a794618))
- **updates:** add FTP diagnostic endpoint for software updates ([7f5543b](https://github.com/Tallec7/neopro/commit/7f5543b2450e7d24f2074e1dd93b79285056f6bc))
- **updates:** add upload progress tracking with retry ([30416b9](https://github.com/Tallec7/neopro/commit/30416b905a7eee9c69bfa0fdc3ab1abdb03be3dc))
- **upload:** add multiple video upload support ([#125](https://github.com/Tallec7/neopro/issues/125)) ([22ae329](https://github.com/Tallec7/neopro/commit/22ae32948457bb1dba826a95f6de4efc0f929f5b))
- **video-library:** add multi-select, category column, duration extraction ([9a4f501](https://github.com/Tallec7/neopro/commit/9a4f5016146f7cfe82c82eb1568737f93eb512a9))
- **video-upload:** implement file upload with multer ([#63](https://github.com/Tallec7/neopro/issues/63)) ([8543604](https://github.com/Tallec7/neopro/commit/85436041462667e797ac0e776c33296c77e0c663))
- **websocket:** améliorer la détection de connexion avec ping/pong ([#295](https://github.com/Tallec7/neopro/issues/295)) ([6896ce3](https://github.com/Tallec7/neopro/commit/6896ce3dc55d13b2b2e9f83eaa65cdce6742691e))

### Performance Improvements

- **memory:** adjust thresholds for Railway Hobby plan ([ab703a2](https://github.com/Tallec7/neopro/commit/ab703a26cedb693fcb2a4c029234a5ab9b9b08f4))
- **memory:** optimize for Railway Hobby plan constraints ([9cbe517](https://github.com/Tallec7/neopro/commit/9cbe517b11c7f4c75711f9c56155450f3a20a1cb))

### Reverts

- remove NgZone/ChangeDetectorRef hacks, return to simple working code ([0eda9df](https://github.com/Tallec7/neopro/commit/0eda9df8efd6c83021ec83256899c85d0ac8834b))

### BREAKING CHANGES

- **structure:** Project structure changed

* src/ -> raspberry/frontend/
* public/ -> raspberry/public/
* ng build -> ng build raspberry
* ng test -> ng test raspberry (or central-dashboard)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-authored-by: Claude <noreply@anthropic.com>

# [2.26.0](https://github.com/Tallec7/neopro/compare/v2.25.1...v2.26.0) (2026-01-11)

### Features

- **dashboard:** add log throttling to prevent 429 errors ([7cc6a8b](https://github.com/Tallec7/neopro/commit/7cc6a8b46886ebe2079a21fd0aa2f5eb71111ba2))

## [2.25.1](https://github.com/Tallec7/neopro/compare/v2.25.0...v2.25.1) (2026-01-11)

### Bug Fixes

- **kiosk:** configure gpu_mem=256 for video decoding ([d4eac37](https://github.com/Tallec7/neopro/commit/d4eac37e4f442e8c9da9826da12b8c31b9a362c3))

# [2.25.0](https://github.com/Tallec7/neopro/compare/v2.24.0...v2.25.0) (2026-01-11)

### Features

- **kiosk:** add watchdog to recover from Chromium "Aw, Snap!" crashes ([07ffe1e](https://github.com/Tallec7/neopro/commit/07ffe1ec4b16526ceccc535478e5d0a8ec4ad8c5))

# [2.24.0](https://github.com/Tallec7/neopro/compare/v2.23.2...v2.24.0) (2026-01-11)

### Features

- **tv:** add video error recovery system with watchdog ([00a5a16](https://github.com/Tallec7/neopro/commit/00a5a16b7df88cc533b35dcab98599f43a93b2a5))

## [2.23.2](https://github.com/Tallec7/neopro/compare/v2.23.1...v2.23.2) (2026-01-10)

### Bug Fixes

- **thumbnails:** move thumbnail when video is renamed ([0699329](https://github.com/Tallec7/neopro/commit/0699329d5c99782f0b08000326cf234bdfbbc6ab))

## [2.23.1](https://github.com/Tallec7/neopro/compare/v2.23.0...v2.23.1) (2026-01-10)

### Bug Fixes

- **dashboard:** add media-src CSP for FTP video hosting ([8ce7036](https://github.com/Tallec7/neopro/commit/8ce7036896bd64f4668244f80408e5dbb77ecf7a))
- **thumbnails:** add cache-buster to refresh thumbnails after regeneration ([b00aece](https://github.com/Tallec7/neopro/commit/b00aeceace94be79ff6eb79e8a0b26f7480453f9))

# [2.23.0](https://github.com/Tallec7/neopro/compare/v2.22.1...v2.23.0) (2026-01-09)

### Features

- **updates:** add upload progress tracking with retry ([490a474](https://github.com/Tallec7/neopro/commit/490a474613f904cf807d2157619186f73e4427de))

## [2.22.1](https://github.com/Tallec7/neopro/compare/v2.22.0...v2.22.1) (2026-01-09)

### Bug Fixes

- **content:** add checksum calculation to bulk video upload ([106bb8e](https://github.com/Tallec7/neopro/commit/106bb8e8f1255c12af39d61ab71ae205010b64fa))

# [2.22.0](https://github.com/Tallec7/neopro/compare/v2.21.4...v2.22.0) (2026-01-09)

### Features

- **video-library:** add multi-select, category column, duration extraction ([c5cbc7c](https://github.com/Tallec7/neopro/commit/c5cbc7c875aae80de2b3fbf85b16765143300f58))

## [2.21.4](https://github.com/Tallec7/neopro/compare/v2.21.3...v2.21.4) (2026-01-09)

### Bug Fixes

- **sync-agent:** use sudo for VERSION/release.json to handle root ownership ([92ceb34](https://github.com/Tallec7/neopro/commit/92ceb344a15e4c2d2ba955c29f5ae4a9256cc901))

## [2.21.3](https://github.com/Tallec7/neopro/compare/v2.21.2...v2.21.3) (2026-01-09)

### Bug Fixes

- **build:** include generate-all-thumbnails.sh in raspberry deploy ([2133eb7](https://github.com/Tallec7/neopro/commit/2133eb7e10fa12bd375e768243b5b042db8b5340))

## [2.21.2](https://github.com/Tallec7/neopro/compare/v2.21.1...v2.21.2) (2026-01-09)

### Bug Fixes

- **sync-agent:** correct path concatenation in update-software.js ([d62bcfb](https://github.com/Tallec7/neopro/commit/d62bcfb5435da2ed746c51a0d3727c25f70e8410))

## [2.21.1](https://github.com/Tallec7/neopro/compare/v2.21.0...v2.21.1) (2026-01-09)

### Bug Fixes

- **sync-agent:** deploy remotePassword to auth.password for /remote login ([4f789d7](https://github.com/Tallec7/neopro/commit/4f789d749e0c7874882f29c219bfdecf14431eac))

# [2.21.0](https://github.com/Tallec7/neopro/compare/v2.20.0...v2.21.0) (2026-01-09)

### Features

- **qr-code:** use Neopro logo image instead of text ([e74ef69](https://github.com/Tallec7/neopro/commit/e74ef6935cfb6872a30a70151b965ce563224355))

# [2.20.0](https://github.com/Tallec7/neopro/compare/v2.19.0...v2.20.0) (2026-01-09)

### Features

- **qr-code:** add dedicated hotspot-config endpoint for real SSID ([60d15a6](https://github.com/Tallec7/neopro/commit/60d15a654b66c1e8f5f58e650c38f859c9962ebb))

# [2.19.0](https://github.com/Tallec7/neopro/compare/v2.18.1...v2.19.0) (2026-01-09)

### Features

- **qr-code:** fetch real SSID via get_hotspot_config command ([f40bc4a](https://github.com/Tallec7/neopro/commit/f40bc4a2c59e3b559f31f6e3fb8ccedf8bce27d3))

## [2.18.1](https://github.com/Tallec7/neopro/compare/v2.18.0...v2.18.1) (2026-01-09)

### Bug Fixes

- **qr-code:** use real hotspot SSID and display neopro.local ([6c9d06e](https://github.com/Tallec7/neopro/commit/6c9d06e98feaeaa1970240f7fd51b4c752f49ca1))

# [2.18.0](https://github.com/Tallec7/neopro/compare/v2.17.1...v2.18.0) (2026-01-09)

### Features

- **dashboard:** add QR code generator for remote access ([bdbfd3b](https://github.com/Tallec7/neopro/commit/bdbfd3b855af50db257a34328e3e2f0bf22b07c0))

## [2.17.1](https://github.com/Tallec7/neopro/compare/v2.17.0...v2.17.1) (2026-01-09)

### Bug Fixes

- **tv:** require liveScoreEnabled from central to display score overlay ([2168784](https://github.com/Tallec7/neopro/commit/21687843519f3ae288fa2291b7268b53c7207e4d))

# [2.17.0](https://github.com/Tallec7/neopro/compare/v2.16.0...v2.17.0) (2026-01-09)

### Features

- **build:** add integrity check and version sync to build-raspberry.sh ([67c8fb0](https://github.com/Tallec7/neopro/commit/67c8fb0a3771095ce3a1693e673e26e230d14625))

# [2.16.0](https://github.com/Tallec7/neopro/compare/v2.15.4...v2.16.0) (2026-01-09)

### Features

- **build:** include node_modules in deploy archive ([9182ab8](https://github.com/Tallec7/neopro/commit/9182ab8762ab38a3cce0a45cd40b2b707836949a))

## [2.15.4](https://github.com/Tallec7/neopro/compare/v2.15.3...v2.15.4) (2026-01-09)

### Bug Fixes

- **deploy:** add npm install for sync-agent in all deploy scripts ([70dc460](https://github.com/Tallec7/neopro/commit/70dc4605532321d96fbfe8fbc42e035da97a9527))

## [2.15.3](https://github.com/Tallec7/neopro/compare/v2.15.2...v2.15.3) (2026-01-09)

### Bug Fixes

- **sync-agent:** add npm install for sync-agent in update-software.js ([1c0139f](https://github.com/Tallec7/neopro/commit/1c0139f79badd9aecb796eb1afeaf71647e5fb4f))

## [2.15.2](https://github.com/Tallec7/neopro/compare/v2.15.1...v2.15.2) (2026-01-09)

### Bug Fixes

- **tv:** improve double-buffer video transitions to prevent stuttering ([#342](https://github.com/Tallec7/neopro/issues/342)) ([aab40f8](https://github.com/Tallec7/neopro/commit/aab40f81f79bc95301d1778e4aca38b8266e2114))

## [2.15.1](https://github.com/Tallec7/neopro/compare/v2.15.0...v2.15.1) (2026-01-09)

### Bug Fixes

- **cron:** handle self-referential FK in config_history cleanup ([58d1ce5](https://github.com/Tallec7/neopro/commit/58d1ce54f91c5443b041165eaa1a37224723cff3))

# [2.15.0](https://github.com/Tallec7/neopro/compare/v2.14.7...v2.15.0) (2026-01-09)

### Features

- **data-retention:** add automatic cleanup for historical data ([5d57781](https://github.com/Tallec7/neopro/commit/5d57781511029f04c7a6252b579d09fcacafbb20))

## [2.14.7](https://github.com/Tallec7/neopro/compare/v2.14.6...v2.14.7) (2026-01-09)

### Bug Fixes

- **sync-agent:** add retry logic and service existence check to startServices ([094d2d4](https://github.com/Tallec7/neopro/commit/094d2d4fc81746e4dd108393cff15ce318e8805a))

## [2.14.6](https://github.com/Tallec7/neopro/compare/v2.14.5...v2.14.6) (2026-01-09)

### Bug Fixes

- **sync-agent:** align update-software.js with deploy-remote.sh ([bf60097](https://github.com/Tallec7/neopro/commit/bf600977e44724fa8a2ad705155351c353e358c8))

## [2.14.5](https://github.com/Tallec7/neopro/compare/v2.14.4...v2.14.5) (2026-01-09)

### Bug Fixes

- **remote:** sort search results alphabetically ([71dff26](https://github.com/Tallec7/neopro/commit/71dff2691733a3b6c95bbf2ce9ca19342cfdf4ff))

## [2.14.4](https://github.com/Tallec7/neopro/compare/v2.14.3...v2.14.4) (2026-01-08)

### Bug Fixes

- **deployment:** use correct storage URL for video downloads ([5e4fa5f](https://github.com/Tallec7/neopro/commit/5e4fa5fbe8ffa6da1bd7d9776b7d0dc9ce28695a))

## [2.14.3](https://github.com/Tallec7/neopro/compare/v2.14.2...v2.14.3) (2026-01-08)

### Bug Fixes

- **content:** use original filename instead of UUID for video storage ([d5c5ffe](https://github.com/Tallec7/neopro/commit/d5c5ffee9300f8d473552011eb609d054d760da7))

## [2.14.2](https://github.com/Tallec7/neopro/compare/v2.14.1...v2.14.2) (2026-01-08)

### Bug Fixes

- **dashboard:** display original video filename instead of UUID ([7035fda](https://github.com/Tallec7/neopro/commit/7035fda873e4cc2ff27515d85977146111db4c9e))

## [2.14.1](https://github.com/Tallec7/neopro/compare/v2.14.0...v2.14.1) (2026-01-08)

### Bug Fixes

- **sync-agent:** detect and recover from zombie connections ([093cac0](https://github.com/Tallec7/neopro/commit/093cac07952c340ef9941516cb52046b2b14a1cd))

# [2.14.0](https://github.com/Tallec7/neopro/compare/v2.13.7...v2.14.0) (2026-01-08)

### Features

- **deployment:** use commandQueueService for video deployments ([027d365](https://github.com/Tallec7/neopro/commit/027d36563541a204dae0b417c6312922a78bfcb7))

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
