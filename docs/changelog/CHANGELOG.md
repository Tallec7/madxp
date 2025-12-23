# Changelog

Généré le 2025-12-08 (Mise à jour 2025-12-23)

## ✨ Nouvelles fonctionnalités

- [Live Score - Finalisation complète](2025-12-23_livescore-complete.md) - 2025-12-23
- [Boucles vidéo par phase de match](2025-12-22_phase-video-loops.md) - 2025-12-22
- [RLS, Swagger, Live Score - Intégration](2025-12-16_rls-livescore-integration.md) - 2025-12-16
- [ add timeCategories and video CRUD management (#81)](commits/3952296.md) - 2025-12-08
- [ add timeCategories and video CRUD management (#80)](commits/5af64be.md) - 2025-12-08
- [ add structured config editor with history and diff (#74)](commits/ff6ac9a.md) - 2025-12-08
- [ implement file upload with multer (#63)](commits/a563edf.md) - 2025-12-07
- [ load existing site configuration in editor (#62)](commits/e863589.md) - 2025-12-07
- [ load existing site configuration in editor](commits/a077c9f.md) - 2025-12-07
- [ improve changelog with per-commit detail files (#56)](commits/7a31d7b.md) - 2025-12-07
- [ improve deployment scripts and add backup/restore (#50)](commits/2df3029.md) - 2025-12-07
- [ implement complete club analytics system (MVP + Phase 2 + Phase 3) (#35)](commits/590c278.md) - 2025-12-06
- [ replace alert() with global toast notifications (#33)](commits/c885238.md) - 2025-12-06
- [ integrate NEOPRO brand guidelines across all apps (#28)](commits/a79402a.md) - 2025-12-06
- [ implement all TODO features (#27)](commits/19e8181.md) - 2025-12-06
- [ add remote config deployment via central dashboard (#26)](commits/4caea08.md) - 2025-12-06
- [ update central server config and scripts for Supabase/Render](commits/580027b.md) - 2025-12-05
- [ add missing API routes for content and updates management](commits/a7cb3ec.md) - 2025-12-04
- [ start central stack locally and add dashboard placeholders bis](commits/cc5f408.md) - 2025-12-04
- [ complete all dashboard UI components (100%)](commits/6dabd41.md) - 2025-12-04
- [ start central stack locally and add dashboard placeholders](commits/ab63833.md) - 2025-12-04
- [ implement complete NEOPRO fleet management system](commits/6d49bf7.md) - 2025-12-04
- [ update video](commits/f436308.md) - 2025-12-04
- [ améliorer les uploads et la gestion des vidéos](commits/4c21e2c.md) - 2025-12-04
- [ Add subcategory support in admin video upload](commits/896b1bb.md) - 2025-12-04
- [ Add local development setup with admin demo mode](commits/fe7ca53.md) - 2025-12-04
- [ Add complete Raspberry Pi autonomous system (4 phases)](commits/f81a0f6.md) - 2025-12-04

## 🐛 Corrections

- [ fix Angular template arrow function error (#82)](commits/c072070.md) - 2025-12-08
- [ handle undefined videos/subCategories arrays (#77)](commits/caedb7d.md) - 2025-12-08
- [ fix trust proxy and deploy_video command data (#70)](commits/92e5e95.md) - 2025-12-07
- [ add get_config to allowed commands in site registration scripts (#68)](commits/25e92bc.md) - 2025-12-07
- [ use raspberry configuration for Pi builds](commits/18b7694.md) - 2025-12-07
- [ convert uptime to integer before database insert (#65)](commits/e1e506e.md) - 2025-12-07
- [ bridge Angular app to sync-agent for analytics transmission (#64)](commits/de0c8b4.md) - 2025-12-07
- [ correct params mismatch in update_config command (#61)](commits/a8380c4.md) - 2025-12-07
- [ correct club config path and improve setup workflow (#54)](commits/d413ff8.md) - 2025-12-07
- [ convert CRLF to LF line endings (#51)](commits/2ce368f.md) - 2025-12-07
- [ fix SSH heredoc for credentials in setup-new-club.sh (#49)](commits/4e78549.md) - 2025-12-07
- [ fix SSH heredoc for credentials in setup-new-club.sh (#48)](commits/7e290e0.md) - 2025-12-07
- [ improve auth error logging and add diagnostic tools (#47)](commits/54a4910.md) - 2025-12-07
- [ improve auth error logging and add diagnostic tools (#45)](commits/4ccf8d9.md) - 2025-12-06
- [ use api_key instead of api_key_hash to match Supabase](commits/8d5b7b8.md) - 2025-12-06
- [ handle duplicate site names with -N suffix](commits/d81e73f.md) - 2025-12-06
- [ include sync-agent in deployment and improve error logging](commits/26d26d6.md) - 2025-12-06
- [ automate sync-agent registration with env vars](commits/08bcc64.md) - 2025-12-06
- [ allow self-signed SSL certs for cloud database providers (#43)](commits/b619921.md) - 2025-12-06
- [ allow configurable SSL certificate verification for Render PostgreSQL](commits/b47ce2e.md) - 2025-12-06
- [ add TypeScript types for PostgreSQL query results](commits/ccd2512.md) - 2025-12-06
- [ use interactive SSH for sync-agent registration (#42)](commits/51bb0df.md) - 2025-12-06
- [ use interactive SSH for sync-agent registration](commits/89993aa.md) - 2025-12-06
- [ suppress macOS xattr warnings on Raspberry Pi (#41)](commits/08e38a6.md) - 2025-12-06
- [ use generic type for Socket.on callback (#39)](commits/574dfd0.md) - 2025-12-06
- [ resolve TypeScript strict null check errors (#40)](commits/253bd8a.md) - 2025-12-06
- [ resolve TypeScript compilation errors (#38)](commits/5c70178.md) - 2025-12-06
- [ remove inferrable type and replace any with unknown (#37)](commits/62b160d.md) - 2025-12-06
- [ preserve user data during software updates (#36)](commits/424b090.md) - 2025-12-06
- [ resolve all ESLint errors and warnings (#34)](commits/ff18c64.md) - 2025-12-06
- [ resolve 4 critical/high security vulnerabilities (#32)](commits/5e5c15e.md) - 2025-12-06
- [ remove auth guard from /tv route for kiosk mode (#25)](commits/c08b79b.md) - 2025-12-06
- [ replace chromium-browser with chromium for Raspberry Pi OS Trixie (#21)](commits/6025995.md) - 2025-12-05
- [ update API URL to point to neopro-central.onrender.com](commits/bfe79fd.md) - 2025-12-05
- [ add rootDirectory for central-server deployment](commits/aeeba6c.md) - 2025-12-05
- [ improve CORS preflight handling for admin interface](commits/b6d7e11.md) - 2025-12-05
- [ handle CORS preflight manually](commits/1c446c9.md) - 2025-12-05
- [ ser](commits/659230c.md) - 2025-12-05
- [ server dash](commits/f1e0551.md) - 2025-12-05
- [ server](commits/8966615.md) - 2025-12-05
- [ Fix video list loading in admin interface](commits/130b42b.md) - 2025-12-04
- [ gitignore](commits/e3951dc.md) - 2025-12-04
- [ url prod](commits/974a1cd.md) - 2025-12-03
- [ url prod](commits/63c8fe5.md) - 2025-12-03

## 📚 Documentation

- [ update all references from public/ to webapp/ (#83)](commits/90fceb4.md) - 2025-12-08
- [ add reconfiguration guide for changing club name, SSID and WiFi (#19)](commits/896f7a4.md) - 2025-12-05
- [ add comprehensive update guide for existing Raspberry Pi (#18)](commits/6af96a8.md) - 2025-12-05
- [ add comprehensive Raspberry Pi initialization guide](commits/3bed75e.md) - 2025-12-05
- [ add complete fleet management administration guides](commits/7e71966.md) - 2025-12-04
- [ Major documentation restructuring (Option B)](commits/71f92b4.md) - 2025-12-04
- [ Clean up redundant documentation (remove 7 files)](commits/9328237.md) - 2025-12-04

## ♻️ Refactoring

- [ clean up project architecture and documentation (#53)](commits/4b2d5d6.md) - 2025-12-07
- [ Remove redundant quick-install.sh script](commits/a8a6c2b.md) - 2025-12-04

## 🔧 Maintenance

- [ normalize CORS origins](commits/ac9f841.md) - 2025-12-05
- [ ignore Angular cache](commits/947433f.md) - 2025-12-03

## 📝 Autres

- [Optimistic lederberg (#79)](commits/2280dfb.md) - 2025-12-08
- [Optimistic lederberg (#78)](commits/622a77c.md) - 2025-12-08
- [Clever villani (#76)](commits/7273b3a.md) - 2025-12-08
- [Clever villani (#75)](commits/e0096a5.md) - 2025-12-08
- [Lucid euler (#73)](commits/d29e200.md) - 2025-12-08
- [Lucid euler (#72)](commits/2fd474b.md) - 2025-12-08
- [Lucid euler (#71)](commits/0565c3b.md) - 2025-12-07
- [Nostalgic perlman (#69)](commits/57a89ba.md) - 2025-12-07
- [Nostalgic perlman (#67)](commits/b0831ab.md) - 2025-12-07
- [Loving bose (#66)](commits/2508ff9.md) - 2025-12-07
- [Merge remote-tracking branch 'origin/youthful-newton'](commits/b943b17.md) - 2025-12-07
- [Optimistic satoshi (#60)](commits/bbd3f40.md) - 2025-12-07
- [Optimistic satoshi (#59)](commits/2daef65.md) - 2025-12-07
- [Optimistic satoshi (#58)](commits/f5e081c.md) - 2025-12-07
- [Optimistic satoshi (#57)](commits/35d0c21.md) - 2025-12-07
- [Optimistic satoshi (#55)](commits/f537bd2.md) - 2025-12-07
- [Exciting lumiere (#52)](commits/ae179ee.md) - 2025-12-07
- [Frosty rosalind (#46)](commits/5d76ad7.md) - 2025-12-07
- [Merge branch 'clever-maxwell' - fix sync-agent and Supabase compatibility](commits/8aac50d.md) - 2025-12-06
- [Ecstatic driscoll (#44)](commits/74dd2d8.md) - 2025-12-06
- [bp](commits/7b22c62.md) - 2025-12-06
- [Xenodochial visvesvaraya (#31)](commits/5fb059a.md) - 2025-12-06
- [Xenodochial visvesvaraya (#30)](commits/1e2b805.md) - 2025-12-06
- [Busy volhard (#29)](commits/f976ca3.md) - 2025-12-06
- [Interesting nobel (#24)](commits/704f1c9.md) - 2025-12-06
- [update: install pi](commits/e109901.md) - 2025-12-05
- [Xenodochial visvesvaraya (#23)](commits/6b7593a.md) - 2025-12-05
- [Xenodochial visvesvaraya (#22)](commits/3854778.md) - 2025-12-05
- [Merge pull request #16 from Tallec7/competent-albattani](commits/c528bcf.md) - 2025-12-05
- [Merge pull request #15 from Tallec7/blissful-wright](commits/1497140.md) - 2025-12-05
- [Merge pull request #14 from Tallec7/sleepy-brattain](commits/99a802d.md) - 2025-12-04
- [Merge pull request #13 from Tallec7/hopeful-wilson](commits/3ace4d4.md) - 2025-12-04
- [mdp admin](commits/780abef.md) - 2025-12-04
- [Merge pull request #12 from Tallec7/hopeful-wilson](commits/208d6b3.md) - 2025-12-04
- [Merge pull request #11 from Tallec7/sleepy-brattain](commits/946ea7d.md) - 2025-12-04
- [Merge branch 'main' into sleepy-brattain](commits/b9da012.md) - 2025-12-04
- [Add Render.com configuration for NEOPRO Central Server](commits/9dacf10.md) - 2025-12-04
- [Merge pull request #10 from Tallec7/sleepy-brattain](commits/c31764f.md) - 2025-12-04
- [Merge pull request #9 from Tallec7/funny-fermat](commits/aa80875.md) - 2025-12-04
- [Merge pull request #8 from Tallec7/funny-fermat](commits/fc1007f.md) - 2025-12-04
- [Merge pull request #7 from Tallec7/funny-fermat](commits/d3b5d9f.md) - 2025-12-04
- [Merge branch 'main' into funny-fermat](commits/c06542d.md) - 2025-12-04
- [Merge pull request #6 from Tallec7/funny-fermat](commits/c192b4b.md) - 2025-12-04
- [Merge pull request #5 from Tallec7/funny-fermat](commits/7ea25cd.md) - 2025-12-04
- [Merge pull request #4 from Tallec7/modest-euclid](commits/7e8161f.md) - 2025-12-03
- [Refactor remote component with time-based organization](commits/ed9b7fd.md) - 2025-12-03
- [Remove program mode, keep only authentication](commits/86f230f.md) - 2025-12-03
- [Merge pull request #3 from Tallec7/modest-euclid](commits/7160464.md) - 2025-12-03
- [Add authentication and program mode features](commits/213418a.md) - 2025-12-03
- [Merge pull request #2 from Tallec7/eloquent-bartik](commits/195b287.md) - 2025-12-03
- [Merge branch 'main' into eloquent-bartik](commits/85c583d.md) - 2025-12-03
- [Add final deployment instructions](commits/31a7223.md) - 2025-12-03
- [Update production Socket.IO URL to https://neopro.onrender.com](commits/103a4ae.md) - 2025-12-03
- [Fix Socket.IO loading by using CDN instead of local path](commits/3051bcb.md) - 2025-12-03
- [Configure CORS for neopro.kalonpartners.bzh and add deployment guide](commits/3bc885d.md) - 2025-12-03
- [Merge pull request #1 from Tallec7/eloquent-bartik](commits/02ec91d.md) - 2025-12-03
- [Add Render deployment configuration for Socket.IO server](commits/ab715ca.md) - 2025-12-03
