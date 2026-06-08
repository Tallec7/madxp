# MadXP — Vérité du code, partie 3 (provisioning, realtime, frontend, edge admin, lecture)

> **Statut** : v0.1 — audit code-verified de 5 domaines (provisioning/bootstrap, socket realtime, dashboard Angular, admin Pi `:8080`, moteur de lecture client).
> Suite de [findings](MADXP-code-verified-findings.md) + [findings-2](MADXP-code-verified-findings-2.md).
> **Légende** : ✅ confirmé · 🟢 actif réutilisable · ⚠️ gap/limite · 🔴 correction.

---

## 0. Thèse renforcée + 1 nouveau gap

**Thèse (désormais solide sur 15 domaines)** : la convergence retail est **majoritairement de l'extension, pas de la réécriture**. 3 actifs de plus confirmés réutilisables quasi tels quels :

- 🟢 **Dashboard shell vertical-agnostique** : navigation par **rôle**, pas par vertical. Le retail = un **module de features** + un rôle, **zéro impact** sur le cœur.
- 🟢 **Couche realtime générique** (rooms par `siteId`) : un écran retail piloté à distance la réutilise ; il suffit de **renommer** les concepts sport (phase/score).
- 🟢 **Moteur de lecture client partagé Pi/SaaS**, déjà paramétré par callbacks : une boucle retail réutilise les 4 players double-buffer + anti-flash.

**🔴 C1 re-confirmé (preuve renforcée)** : le cloud-wins est explicite — `sync-profiles.js:164-170` **supprime `categories`/`sponsors`/`timeCategories` locaux avant merge** du profil cloud. Les édits `:8080` offline sont **perdus** au resync (sauf `LOCAL_ONLY_KEYS`). Push-back = ADR-120 Phase 4, **non codé**.

**⚠️ Nouveau gap retail** : **la config de contenu est par-SITE, pas par-ÉCRAN**. `config_profiles` = 1 par site ; `sites.displays` gère le matériel mais la **boucle/catégories/sponsors est partagée** par tous les écrans du site. Un magasin avec N écrans montrant des **contenus différents** (entrée vs gondole vs caisse) n'est **pas** modélisable aujourd'hui. → chantier noyau (config par display).

---

## 1. Provisioning & bootstrap — ✅ flow SaaS réutilisable

**Réalité code** :

- `createSite` (`sites.controller.ts:106-202`) : UUID + **`api_key`** (`randomBytes(32).toString('hex')`, 64 hex, **hashé SHA256** en DB) + profil default auto + hostname slug. **Format api_key immuable** (le changer casse tous les Pi).
- **Bootstrap Pi** : `register-site.js` (admin login → `POST /api/sites` → `/etc/neopro/site.conf`) → handshake Socket.IO `authenticate {siteId, apiKey}` → `syncConfigFromCloud` → heartbeat 30s.
- **Bootstrap SaaS** : `site_type='saas'`, **api_key optionnel** (UUID public suffit), config dans `config_profiles`, accès `GET /api/saas/:id/config` (public, rate-limited). **Pas de matériel.**

**Convergence retail** : provisionner un site retail = **réutiliser le flow SaaS** (+ kiosk captive ADR-079/114 si écrans Fire Stick). **Manque** : hiérarchie enseigne→magasin→écran, auth kiosk distribué, **config par écran** (cf. gap §0). Un ADR « Site Hierarchy & Retail Provisioning » sera nécessaire.

## 2. Socket realtime — 🟢 générique, renommage à faire

**Réalité code** :

- Rooms par `siteId` (pas de namespaces). `saas-relay.handler.ts` tient l'état **in-memory** `saasStates` (score/phase/timer/recording/`tvInstances`/loopState), **perdu au reboot** (Pi autoritaire). Register : ordre critique (join room **avant** DB query, `socket.service.ts:348-356`) — corrige la race subscribe→register. Master-slave TV (ADR-034).
- Relay : `command` → `socket.to(siteId).emit('action')`. Audit fire-and-forget.

**Convergence** 🟢 **hautement réutilisable** pour un écran retail piloté à distance. **Couplages sport = nommage** : `phase` (neutral/before/during/after), `score-update`, `scoreboard-state-push`, `recording`. **Généralisation** (effort bas) : `phase`→`context`, `score`→`metric/counter`, `tvInstances`→`display_group`, `saasStates`→`SiteRuntimeState`. La mécanique (rooms, relay, master-slave) est agnostique.

## 3. Dashboard Angular — 🟢 extension propre, zéro impact cœur

**Réalité code** :

- 100% standalone components, **lazy `loadComponent`**, 24 features, `authGuard` + `roleGuard` (`data.roles`). **Shell (`layout.component.ts`) sans couplage sport dur** : nav conditionnelle par **rôle** (`isClub/isAdmin`), pas par vertical. Thème club via CSS-vars.
- Générique : `sites`, `content`, `analytics`, `users`, `subscriptions`, `advertisers`. Sport isolé : `scoreboard-live`, `templates-studio/players`, type `Match`, `Site.live_score_enabled/scoreOverlay`.
- Feature-gating frontend via `FeatureGateService.canAccess()` (jamais `=== 'premium'` en dur, smoke enforced).

**Convergence** 🟢 : ajouter `features/retail-portal/` + rôle `retail` + `isRetail()` nav + thème = **zéro impact** sur le cœur (pattern identique à club/advertiser/agency portals). **À généraliser** : charger les TimeCategories depuis la DB (au lieu de "Avant/Après-match" hardcodé), entrées retail dans `FeatureKey`, `/templates-studio/players`→`rosters`.

## 4. Admin Pi `:8080` — 🟢 modèle edge générique / 🔴 cloud-wins confirmé

**Réalité code** :

- Express `:8080`, CRUD config locale (categories/sponsors/timeCategories/vidéos/diag/restart), **switch de profil filesystem atomique** (`.tmp+rename`, `profile.service.js:137-156`), `LOCAL_ONLY_KEYS` (~11 clés : auth/apiKey/hotspot/settings…) préservées.
- 🔴 **Cloud-wins confirmé** : `sync-profiles.js:164-170` zeroing categories/sponsors/timeCategories avant merge → **édits locaux écrasés** au resync. **Pas** de routes CRUD profil (Phase 2 future), **pas** de push-back (`POST /api/sites/:id/pi-config-sync`, Phase 4 future), **pas** d'UI conflits (Phase 5).
- **Zéro couplage sport** — vocabulaire métier seulement, aucune validation. Couplages = **Pi-hardware** (chemins `webapp/`, hostapd, systemd), pas métier.

**Convergence** : un opérateur **retail edge** (Pi en magasin offline) aurait **les mêmes besoins** → `:8080` est **généralisable** (~1h refactor chemins). Le modèle `site_type='pi'` (edge autonome) vs `'saas'` (cloud-always) est domaine-agnostique.

## 5. Moteur de lecture client — 🟢 partagé Pi/SaaS, déjà paramétré

**Réalité code** :

- **Un seul `TvComponent`** pour Pi et SaaS (`saasMode` flag). 4 players HTML5 double-buffer + canvas freeze-frame + black overlay. Anti-flash via `requestVideoFrameCallback` + `requestAnimationFrame` chaîné. Playlist pondérée **Bresenham**.
- **GPU Pi5** confirmé : 1 décodeur HD à la fois (SharedImage), `removeAttribute('src')+load()` pour libérer (bug click-twice NLF).
- Ciblage multi-display par `displayIndex`/`target`. **Callbacks `PlaybackCallbacks`** paramètrent déjà phases/analytics → cœur découplé.

**Convergence** 🟢 : moteur **réutilisable tel quel** pour une boucle retail. Couplages sport (score overlay, phases match, recording auto) déjà **en callbacks/conditionnels** → restent dans des composants sport. SaaS et Pi partagent déjà l'archi.

---

## 6. Mise à jour — les chantiers transverses du noyau (consolidé sur 15 domaines)

| Chantier transverse (ni sport ni retail ne l'a)                   | Réf                                     | Effort                |
| ----------------------------------------------------------------- | --------------------------------------- | --------------------- |
| **Push-back substrat→cloud** (édition locale offline qui remonte) | findings §0, `sync-profiles.js:164-170` | chantier (ADR-120 P4) |
| **Hiérarchie tenant** enseigne→magasin→zone + rôle régie          | findings-2 §3                           | ~3-5j                 |
| **Config par ÉCRAN** (aujourd'hui par-site)                       | **nouveau, §0**                         | chantier noyau        |
| **Supervision substrat-agnostique** (player down → alerte)        | findings-2 §4                           | à concevoir           |
| **Audience humaine + CDN** (volume retail)                        | findings-2 §1/§5                        | ~2-3 sprints          |
| **Auth kiosk distribué** (écrans retail sans Pi)                  | §1                                      | ADR à écrire          |

**Actifs réutilisables confirmés (15 domaines)** : delivery strategy registry, SaaS mode, templates studio, web-live-content, LED geometry, entitlement/tiers, analytics+reporting, stockage FTP+proxy, alerting/metrics, **dashboard shell**, **realtime siteId-rooms**, **moteur de lecture client**, **admin edge `:8080`**, **flow de provisioning**.

**Conclusion d'audit** : le backend ET le frontend MadXP sont **massivement réutilisables**. Le retail est **~80% de l'extension** (nouveau vertical/module/rôle/stratégie) + **~20% de chantiers transverses** que MadXP n'a pas résolus pour lui-même (les 6 ci-dessus). C'est ça, le vrai périmètre d'architecture de la plateforme commune.
