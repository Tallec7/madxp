# MadXP — Vérité du code (audit convergence)

> **Statut** : v0.1 — findings **vérifiés contre le code vivant** (pas la doc), via 5 explorations ciblées.
> **But** : (1) corriger les `✅` du CDC qui étaient « vérifiés-doc » et non « vérifiés-code », (2) inventorier 4 actifs MadXP réutilisables que j'avais sous-comptés.
> **Légende** : ✅ confirmé code · 🔴 correction (le CDC disait faux) · 🟢 actif réutilisable confirmé · ⚠️ partiel/roadmap.

---

## 0. Les 3 corrections majeures au CDC

### 🔴 C1 — Le sport est **cloud-wins aujourd'hui**, pas Pi-owned (ADR-120 non implémenté)

| Ce que mon CDC/spec disait                                                          | Réalité code (HEAD)                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « conflit cloud↔Pi → push-back Pi gagne ✅ » (SPEC-CORE-PLAYER §8, OFFLINE-EDGE I4) | **Faux.** `mergeConfigurations()` applique **cloud-wins** : `config-merge.js:269-342` (categories), `:222` (sponsors remplacés), `:130-133` (timeCategories 100% cloud) |
| « Pi = source de vérité config locale (ADR-120) ✅ »                                | ADR-120 est une **décision proposée 2026-05-14, non codée**. Pas de 3-way merge, pas de table `config_conflicts`, pas de push-back `POST /api/sites/:id/pi-config-sync` |
| `local_config_mirror` = reflet du profil actif                                      | Colonne existe (`site.repository.ts:135`) mais **jamais écrite** — `grep "local_config_mirror.*=" ` = 0 UPDATE. Orphelin.                                               |

**Ce qui EST vrai** ✅ : le Pi **joue** sa dernière config offline (autonomie de **diffusion** réelle) ; et les **`LOCAL_ONLY_SETTINGS`** (auth/remote password, settings, siteId, hotspot) sont **préservés** au merge (`config-merge.js:21-35`, ADR-115). Donc : **autonomie playback = réelle ✅ ; ownership edge de la config = roadmap ❌**.

**Impact convergence** : la « source de vérité duale » (Décision D) est **en partie aspirationnelle**. Pour un 3ᵉ substrat retail, la bonne nouvelle = le modèle réel actuel (**cloud-wins**) est _déjà_ celui qu'on veut pour le retail. La dette = le sens Pi→cloud, qui n'existe ni pour le sport ni pour le retail.

### 🟢 C2 — Le « port player » que je théorisais existe déjà : Delivery Strategy Registry (ADR-069)

`deliveryStrategyRegistry.resolve(site)` → `SaasDirectStrategy` (`saas-direct.strategy.ts:19-36`) **ou** `PiSocketStrategy`, **sans `if site_type` dispersé** (smoke `noLegacySaasShortCircuit`). C'est **exactement** le pattern port/adaptateur de SPEC-CORE-PLAYER. **Le retail = une 3ᵉ stratégie**, ~5 fichiers de typage + une stratégie. À réutiliser tel quel.

### 🟢 C3 — SaaS **est déjà le modèle retail** (production-ready)

Cloud = source de vérité (`config_profiles`, `saas.controller.ts:254-262`), zéro hardware, médias servis par **URL FTP résolues serveur** (`saas.controller.ts:93-108`), relay Socket.IO (`saas-relay.handler.ts`), **club portal** 4 composants (dashboard/diagnostic/loop/sponsors). Verdict explo : `site_type='retail'` ≈ diff UI/provisioning ; **backend 100% réutilisable**. Specs ADR-037 **alignées au code** (zéro drift stratégique).

---

## 1. Pi ↔ SaaS — ownership & priorité (qui gagne)

| Champ                                  | Vérité réelle (HEAD)                        | Code                                                        |
| -------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| categories / sponsors / timeCategories | **cloud-wins** (remplace)                   | `config-merge.js:130-342`                                   |
| `auth`, settings, hotspot, siteId      | **Pi-local préservé** (LOCAL_ONLY_SETTINGS) | `config-merge.js:21-35`                                     |
| profiles/{id}.json                     | cloud pousse → Pi applique                  | `sync-profiles.js:34-94`                                    |
| displays (receiver)                    | cloud → Pi write-through (ADR-114)          | `command-dispatch.js` handler `receiver_assignment_updated` |
| `local_config_mirror`                  | **orphelin, jamais écrit**                  | `site.repository.ts:135`                                    |
| vidéos                                 | cloud-owns, Pi stocke                       | `deployment.service.ts`                                     |

**Conflit réel** : pas de 3-way. Au resync, le cloud renvoie le profil entier ; `mergeCategories()` préserve les catégories locales **sans équivalent cloud** (`:327-333`) mais écrase le reste. **Édits offline de contenu = perdus** (sauf LOCAL_ONLY_SETTINGS).

**Couplages durs pour un 3ᵉ substrat retail** (depuis l'explo) :

1. `site_type` dichotomique `'pi'|'saas'|'demo'` → ajouter `'retail'` (trivial, ~5 fichiers Joi+TS).
2. `LOCAL_ONLY_SETTINGS` hardcodé Pi (auth hotspot) → paramétrer par substrat.
3. Push-back par substrat inexistant (ni Pi ni retail) → à concevoir une fois pour toutes.
4. `command-queue` `REALTIME_ONLY_COMMANDS` hardcodé → modes par site_type.

**→ Conséquence spec** : je corrige SPEC-CORE-PLAYER §8/§10 et SPECS-SPORT OFFLINE-EDGE (cf. §5 ci-dessous). La résolution de conflit du noyau doit être **`ownsTruth` par substrat** — mais en posant que **l'état actuel est cloud-wins partout**, et que l'edge-authoritative (ADR-120) est un _objectif_, pas un acquis.

---

## 2. SaaS mode (ADR-037) — 🟢 actif majeur

- Type : `'pi'|'saas'|'demo'` (`types/index.ts:89`), guards stricts (`saas.controller.ts:250,430,469`).
- Livraison : `SaasDirectStrategy` marque `completed` immédiat (`content-deployment.controller.ts:61`).
- Médias : URL FTP résolues serveur, option proxy JWT HMAC (ADR-068, `VIDEO_STREAM_PROXY_ENABLED`).
- Config : `config_profiles` défaut (cloud only) ; `local_config_mirror` ignoré (NULL by design).
- Rendu : **même `tv.component.ts`** que le Pi, via `SaasConfigService.loadConfiguration()` (HTTP) au lieu du fichier local.
- Offline : **impossible** (assumé, `lan-receiver-precache.service.ts:41` guard).
- Club portal : `/club/:siteId/{dashboard,diagnostic,loop,sponsors}`.

**Pour `site_type='retail'`** (effort, depuis l'explo) : type (trivial) · déploiement (hérité SaasDirectStrategy, 0) · remote (hérité relay, 0) · provisioning/UX admin (~100 lignes) · analytics retail `dwell_time`/`motion` (colonnes optionnelles) · multi-écrans LAN (master-slave TV sync ADR-033 existant).

---

## 3. Templates Studio V1 (Remotion) — 🟢 moteur créa réutilisable 85%

- Modèle : **code-driven** `.tsx` + `manifest.json` par template (3 vivants : `but_generique`, `entree_joueur`, `faits_de_jeu`). Assets résolus DB via bindings. **V2 data-driven supprimé (ADR-129, 2026-05-16)**.
- Pipeline : worker **in-process**, poll 2s, claim `FOR UPDATE SKIP LOCKED` (`templates-studio.repository.ts:168-181`), bundle Remotion, `renderMedia` concurrency=1 (limite RAM Railway), upload FTP (`studio-render-worker.service.ts:184-294`).
- Assets : `studio_assets` (dédup SHA256) + `studio_template_asset_bindings`. Fonts custom **en DB** via `useCustomFont` (ADR-127).
- **Couplage sport = ZÉRO dans le moteur** (pas de `if sport`). Bindings `input.*`/`brandKit.*`/`literal`.
- Couplages soft (effort medium 2-4j) : table `players` (prenom/nom/numero/poste) + page UI « Joueurs » → généraliser en `CatalogItem`/roster (produit, prix…).

**⚠️ Drift de rule à corriger** : la rule archivée `_archive/templates.md` (« `template_fonts` n'existe pas, fonts hardcodées », « runtime data-driven `TemplateRuntime.tsx` ») décrit **V2, qui est mort**. Les fonts custom **sont** en DB (ADR-127). Ne pas s'appuyer sur cette rule.

---

## 4. Web-live-content (ADR-103) — 🟢 actif retail direct

- Contenu : `web_page` (iframe) ou `livestream` (HLS via hls.js), `videos.content_type` + `external_url` (`video.repository.ts:25`).
- Rendu : `<iframe sandbox>` z-index 10, timeout load **1s**, anti-flash (fond noir + reveal 250ms), auto-close `durationMs` (`web-content.service.ts`).
- **Couplage sport = ZÉRO** (dispatch pur par `contentType`).
- **Retail direct** : prix/promos/stock live via page web frameable (refresh côté page), livestream promo magasin.
- Gaps non-bloquants : pas de cache offline · sandbox `allow-same-origin` laxiste (whitelist Phase 4) · détection `X-Frame-Options` (Phase 3) · auth page (cookies cross-origin ne passent pas le sandbox).

---

## 5. LED perimeter (ADR-135) — 🟢 surface paramétrique généralisable

- Géométrie : `sites.displays[type='led-perimeter'].led` = `{ sides[], pitch, height, spacing_m, canvas_in }` (`validation.ts:155-174`). **Topologie en données, jamais en code.**
- Contenu par côté : `video_variants.side_files[]` (JSONB sur **la variante**, pas l'écran — révision ADR-135).
- Modèle plier/déplier : `led-fold.service.ts` (`computeRibbonDimensions`, `computeFoldGeometryPerSide:302-347`). Le processeur LED **déplie** (hors MadXP).
- **Couplage sport = ZÉRO** dans `led-fold.service.ts`. Généralisable aux **murs/gondoles retail** : `sides=[5]` (mur), `sides=[1,2,1]` (gondole).
- **⚠️ Limite prod** : la **diffusion par côté (étape D)** est **POC labo, pas déployée** — `enrichConfigWithDisplayVariants()` ne pivote pas encore la compose vers le Pi. Le modèle est bon, la chaîne de diffusion multi-côtés n'est pas finie.

---

## 6. Récapitulatif — ce que MadXP apporte VRAIMENT au noyau commun

| Actif MadXP                          | Convergence                  | Réutilisable                               | Réf                               |
| ------------------------------------ | ---------------------------- | ------------------------------------------ | --------------------------------- |
| Delivery Strategy Registry (ADR-069) | **= le port player**         | ✅ direct (3ᵉ stratégie retail)            | `strategy-registry.ts`            |
| SaaS mode (ADR-037)                  | **= le modèle retail**       | ✅ backend 100%                            | `saas.controller.ts`              |
| Templates Studio V1                  | moteur créa commun           | 🟢 85% (rename roster)                     | `studio-render-worker.service.ts` |
| Web-live-content (ADR-103)           | prix/promo/stock live retail | ✅ direct                                  | `web-content.service.ts`          |
| LED geometry (ADR-135)               | murs/gondoles retail         | 🟢 géométrie ✅, diffusion par côté ⚠️ POC | `led-fold.service.ts`             |
| Rotation Bresenham + attribution     | moteur régie                 | ✅ (cf. SPEC-CORE-REGIE)                   | sponsors                          |
| Match/scoreboard/remote/hotspot      | vertical sport pur           | 🔱 ne pas mutualiser                       | —                                 |

**Dette transverse découverte** (vaut pour sport ET retail) : **aucun push-back substrat→cloud n'existe** (ADR-120 non codé). Si la plateforme commune veut un edge éditable localement (Pi _ou_ retail offline), c'est **à concevoir une fois pour toutes** dans le noyau — c'est un vrai chantier, pas un acquis.

---

## 7. Corrections appliquées aux livrables

- `SPEC-CORE-PLAYER-detailed.md` §6/§8/§10 : « push-back Pi gagne ✅ » → **cloud-wins aujourd'hui ; edge-authoritative = ADR-120 roadmap** ; `local_config_mirror` orphelin ; port = Delivery Strategy Registry.
- `SPECS-SPORT-detailed.md` OFFLINE-EDGE : I4 + AC conflit corrigés (autonomie **playback** ✅ ; ownership edge ❌ roadmap ; LOCAL_ONLY_SETTINGS préservés).
- `CDC-plateforme-commune.md` Décision D : annoter « source de vérité duale = objectif ADR-120, **non implémenté** ; état actuel = cloud-wins ».
- Rule `_archive/templates.md` : marquée obsolète (décrit V2 mort).
