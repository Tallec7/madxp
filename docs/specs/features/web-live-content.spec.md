# SPEC : Web / Live Content (pages web + livestreams)

> **Owner** : Daisy
> **Statut** : Live (Phase 0 / 0.5 / 0.6 / 1 / 2a livrées) — Phase 2b / 1.5 / 3 / 4 en attente
> **Dernière revue** : 2026-04-29
> **ADR liés** : ADR-089 (Phase 1+2 manuel), ADR-103 (full scope manuel + boucles, 5 phases)
> **Smoke tests** : `smoke-web-content-adr089.test.ts`, `smoke-web-content-adr103-phase05.test.ts`, `smoke-web-content-adr103-phase06.test.ts`, `smoke-web-content-adr103-phase1.test.ts`, `smoke-web-content-adr103-phase2.test.ts`
> **`.claude/rules/` lié** : —

## En une phrase

Un club / operator peut créer des pages web et des livestreams HLS depuis le dashboard, qui apparaissent automatiquement dans une catégorie "Web / Live" de la Remote (V1 + V2), sont lançables manuellement avec timeout 1s sur erreur, et seront jouables dans les boucles automatiques en Phase 2.

## Acteurs impliqués

- **Club / Operator / Super admin** : crée et gère les entrées web_page / livestream depuis le dashboard
- **Staff club** (avec la Remote) : lance manuellement une entrée sur la TV
- **TV (Pi ou SaaS)** : affiche l'iframe / livestream pendant la durée configurée puis revient à la boucle MP4
- **sync-agent (Pi)** : récupère les entrées cloud et merge dans `configuration.json` local

## Périmètre (ce que ce domaine couvre)

- **Services backend** :
  - `central-server/src/utils/inject-web-content-category.ts` (injection pseudo-catégorie + register dans timeCategories)
  - `central-server/src/utils/strip-synthetic-web-content.ts` (Phase 0.5 — anti-crash filter)
  - `central-server/src/controllers/web-content.controller.ts` (POST /api/videos/web-content + GET Pi)
  - `central-server/src/repositories/video.repository.ts` → `createWebContent`, `findWebContentForSite`
- **Controllers** :
  - `central-server/src/controllers/saas.controller.ts` (strip + inject + register)
  - `central-server/src/controllers/remote.controller.ts` (strip + inject + register)
  - `central-server/src/controllers/config-profiles.controller.ts` (refuse synthetic 400)
  - `central-server/src/controllers/config-history.controller.ts` (refuse synthetic dans saveConfigDirect)
- **Sync-agent Pi** :
  - `raspberry/sync-agent/src/services/web-content-sync.js` (merge + register timeCategories)
- **Frontend Raspberry/SaaS** :
  - `raspberry/src/app/services/web-content.service.ts` (Phase 1 player, 1s timeout, analytics)
  - `raspberry/src/app/components/tv/tv.component.ts` (handleTvCommand `web-page` / `livestream` / `stop-manual`)
  - `raspberry/src/app/components/remote/remote.component.ts` (launchVideo dispatch par contentType)
- **Dashboard** :
  - `central-dashboard/src/app/.../web-content-create-modal.component.ts` (modale création ADR-089/094)
- **DB** :
  - Table `videos` colonnes `content_type` ∈ `{video, web_page, livestream}` + `external_url`
  - Table `video_plays` colonne `content_type` + interruption_reason `web_load_failed` (Phase 1)

## Règles métier

### Création d'une entrée

- Endpoint : `POST /api/videos/web-content` (admin / operator / club authentifié, validation Joi).
- Champs requis : `name`, `url` (https), `contentType` ∈ `{web_page, livestream}`.
- Champs optionnels : `duration` (secondes — **obligatoire** si destination = boucle, Phase 2), `category`, `subcategory`, `uploaded_for_site_id` (NULL = global).
- Le row `videos` est créé avec `filename = "<contentType>-<timestamp>"` (synthétique). **Ce path n'est jamais envoyé au lecteur TV** (Phase 0.5 le strip).

### Visibilité dans la Remote (V1 + V2)

- Pseudo-catégorie **"Web / Live"** (id : `web-content`) injectée à la volée par `inject-web-content-category.ts` (cloud) et `web-content-sync.js` (Pi).
- L'id `web-content` est automatiquement enregistré dans chaque `timeCategories[].categoryIds[]` (Phase 0.6) → visible dans toutes les phases (avant-match / pendant / après / neutre).
- Disparaît dynamiquement quand le dernier row web_page/livestream du site est supprimé.

### Lancement manuel (Phase 1 livrée)

- Remote → clic entrée → `launchVideo()` dispatche par `contentType` :
  - `web_page` → command `web-page` `{ url, durationMs, name }`
  - `livestream` → command `livestream` `{ url, mimeType, durationMs, name }`
- TV → `WebContentService.showWebPage()` ou `showLivestream()` :
  - Capture freeze-frame du player MP4 actif (anti-flash).
  - **Timeout chargement = 1s** (`LOAD_TIMEOUT_MS`) → si pas de `load`/`loadeddata` sous 1s, skip + retour boucle (`web_load_failed`).
  - À `load` → opacity 1 + démarrage timer `durationMs`.
  - À fin durée OU action user → return-to-loop : reprend boucle MP4 à `_savedLoopIndex + 1`.

### Ajout dans une catégorie utilisateur ou la boucle (Phase 2a livrée)

- Le backend **accepte** maintenant les entrées web_page/livestream dans `sponsors[]` / `timeCategories[].loopVideos[]` / `categories[].videos[]` (le 400 `SYNTHETIC_WEB_CONTENT_PATH_FORBIDDEN` a été retiré).
- Au moment du read (`GET /api/saas/:siteId/config`, `GET /api/saas/:siteId/profiles/:id/config`, `GET /api/remote/:siteId/state`), le backend appelle `resolveSyntheticWebContent` qui :
  1. Détecte les entrées avec un path `web_page-<ts>` / `livestream-<ts>`
  2. Lookup la row `videos` correspondante en DB
  3. Réécrit l'entrée en `{ path: external_url, contentType, externalUrl, durationSeconds, name, type, thumbnailUrl }` AVANT d'envoyer à la TV / Remote
- L'utilisateur peut donc **ajouter** une page web depuis la bibliothèque dans n'importe quelle catégorie/boucle, et la **lancer manuellement depuis cette catégorie** dans la Remote (le dispatch `launchVideo` par contentType est déjà branché — Phase 1).
- Le strip Phase 0.5 reste actif comme filet de sécurité pour les entrées dont la row DB a été supprimée (lookup miss → strip propre).

### Rotation automatique en boucle (Phase 2b — pas encore livrée)

- **Aujourd'hui** : la boucle MP4 (DoubleBuffer) **filtre toujours** les entrées `contentType !== 'video'` (Phase 0 guard) — elles sont ignorées de la rotation auto.
- **Phase 2b** : `video-playback.service.ts` déléguera à `WebContentService.playInLoop()` quand l'étape suivante a `contentType !== 'video'`. Transition MP4 → web : freeze + fade. À fin du `durationMs` → reprend la boucle MP4 à l'index suivant. Skip ≤ 1s sur erreur.

### Tolérance d'erreur

- URL inaccessible / `X-Frame-Options: DENY` / livestream qui ne démarre pas / Pi hors-ligne → skip ≤ 1s, métrique `web_load_failed`.
- Auto-close `durationMs` atteint → return-to-loop normal, `completed=true`.
- Action manuelle (autre vidéo, stop) → `interruption_reason='manual_action'`.

## Comportements observables

| Action utilisateur                                    | Résultat attendu                                                                  |
|-------------------------------------------------------|-----------------------------------------------------------------------------------|
| Créer un web_page depuis Contenu (`POST /web-content`) | Row `videos` créé, apparait dans Remote dans ≤ 1 reload de config                |
| Cliquer entrée Web/Live dans la Remote                 | TV affiche l'iframe en ≤ 1s ou skip + retour boucle si erreur                    |
| Pas de `load` après 1s                                 | Skip silencieux, `video_plays.interruption_reason='web_load_failed'`             |
| Auto-close `durationMs` atteint                        | TV revient à la boucle MP4 (index `_savedLoopIndex + 1`)                         |
| Ajouter un web_page à `sponsors[]` ou une catégorie    | Backend accepte (Phase 2a). Au read, l'entrée est résolue → contentType + externalUrl propres pour la Remote / TV |
| Ajouter un web_page à la boucle MP4 auto-rotation     | Toujours filtré côté TV pour le moment (Phase 2b à venir) |
| Supprimer le dernier web_page d'un site                | La pseudo-catégorie "Web / Live" disparaît au reload Remote                      |

## Cas d'edge connus

- **Iframe `X-Frame-Options: DENY`** : le navigateur n'émet ni `load` ni `error` → seul le timeout 1s déclenche le skip. Vérifié sur Phase 1.
- **Livestream HLS sur Chromium kiosk** : sans hls.js, seules les sources HLS natives (Safari) jouent. Sur Pi/Chrome, erreur silencieuse → skip 1s. Phase 1.5 ajoutera hls.js.
- **Master/slave dual-display** : aujourd'hui le slave ne suit pas le contenu web/live du master. Le DoubleBuffer sync OK pour MP4 mais pas pour iframe. Phase 1.5.
- **`allow-same-origin` dans la sandbox** : volontaire (clubhouse.scorenco et autres scoreboards live le requièrent). Phase 4 ajoutera une whitelist domaines pour serrer le sandbox sur les sites tiers.
- **CORS freeze-frame** : `canvas.captureStream()` ne peut pas capturer le contenu d'une iframe cross-origin. Les transitions web → MP4 utilisent un fond noir 200ms au lieu d'un freeze-frame.

## Ce qui n'est PAS dans le scope

- **Twitch / YouTube live embed** : nécessite leurs SDK propriétaires. Reporté à un futur ADR-104 (décision Daisy 2026-04-29).
- **Cache offline web_page** : Pi sans Internet → skip 1s + retour boucle. Pas de service worker. Reporté (décision Daisy 2026-04-29).
- **DRM / contenu payant** : pas de support Widevine, FairPlay.
- **Interactivité utilisateur dans l'iframe TV** : la TV affiche, ne permet pas le clic / scroll. La Remote garde le contrôle.
- **Captures d'écran dashboard preview** : pas de screenshot iframe (cross-origin) ; preview = iframe live dans le dashboard.

## États (Phase de livraison)

| Phase | Scope                                          | État        | PR                                                         |
|-------|------------------------------------------------|-------------|------------------------------------------------------------|
| 0     | Filets défensifs TV + cleanup DB               | ✅ Livrée   | [#699](https://github.com/Tallec7/neopro/pull/699)          |
| 0.5   | Strip serveur + reject 400                     | ✅ Livrée   | [#701](https://github.com/Tallec7/neopro/pull/701)          |
| 0.6   | Visibilité Web/Live dans Remote                | ✅ Livrée   | [#703](https://github.com/Tallec7/neopro/pull/703)          |
| 1     | WebContentPlayer manuel + 1s timeout + analytics | ✅ Livrée   | [#705](https://github.com/Tallec7/neopro/pull/705)          |
| **2a** | **Backend résout les paths synthétiques au read + drop 400 reject** | **✅ Livrée** | **(cette PR)**                          |
| 2b    | TV runtime délègue à WebContentService pour la rotation auto | ⏳ À venir | —                                                  |
| 1.5   | hls.js + master/slave sync                      | ⏳ À venir  | —                                                          |
| 3     | Dashboard UX (sélecteur, validation, preview)   | ⏳ À venir  | —                                                          |
| 4     | Supervision + ADR fermeture                     | ⏳ À venir  | —                                                          |

## Référence code

- [WebContentService](../../../raspberry/src/app/services/web-content.service.ts)
- [Remote V1 launchVideo](../../../raspberry/src/app/components/remote/remote.component.ts)
- [TV handleTvCommand](../../../raspberry/src/app/components/tv/tv.component.ts)
- [injectWebContentCategory + registerWebContentInTimeCategories](../../../central-server/src/utils/inject-web-content-category.ts)
- [stripSyntheticWebContent](../../../central-server/src/utils/strip-synthetic-web-content.ts)
- [sync-agent web-content-sync.js](../../../raspberry/sync-agent/src/services/web-content-sync.js)
