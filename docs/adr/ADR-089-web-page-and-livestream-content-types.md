# ADR-089: Contenus `web_page` et `livestream` — commandes manuelles (MVP)

**Date** : 2026-04-23
**Statut** : Accepté (Phase 2 livrée)
**Format** : Léger

---

## Contexte

Le benchmark concurrentiel (ADR 29e5d7b5) a identifié deux gaps produit : afficher une **page web arbitraire** (URL) sur la TV comme on lance une vidéo manuelle, et **diffuser un flux live** (HLS/MP4 over HTTP). Le player Pi ne supporte aujourd'hui que les fichiers vidéo locaux (`<video>` HTML5 + double-buffer). Ces deux fonctionnalités sont demandées pour les usages club : infos/réseaux sociaux en incrustation, diffusion de chaînes partenaires ou retransmissions régionales.

## Décision

Introduire deux **nouveaux types de commande manuelle** — `web-page` et `livestream` — qui suivent exactement le flow `play-video` existant (Dashboard → Central API → Socket.IO `cloud-remote-action` → sync-agent relay → Pi local → `action` → `TvComponent.handleTvCommand`). Côté Pi, ajouter un `WebContentService` qui pilote :

- Un `<iframe sandbox>` plein écran (z-index 10) pour `web-page`, avec CSP compatible (same-origin côté Pi) et timeout auto-close optionnel.
- Un `<video>` MP4/HLS (hls.js polyfill côté Chromium Pi 4/5) pour `livestream`, sans boucle, avec gestion d'erreur (retour à la boucle si le flux tombe).

Ces deux contenus **coexistent** avec la vidéo manuelle : même layer z-index, même mécanisme de return-to-loop (`onEnded` / commande explicite `stop-manual`). **Pas d'intégration playlist** dans ce MVP — les deux contenus sont pilotés par la télécommande cloud uniquement.

Le type `Command.type` passe de `'video' | 'sponsors' | 'reload-config'` à `'video' | 'web-page' | 'livestream' | 'sponsors' | 'reload-config'`. Le payload pour les nouveaux types est `{ url: string; durationMs?: number }` (durationMs optionnel → fermeture auto).

## Alternatives rejetées

- **Ajouter `web_page` / `livestream` comme entrées `SponsorVideo` dans la playlist** : rejeté pour le MVP (complexité — Bresenham pondère par "vidéo", un iframe n'a pas de durée intrinsèque, et le double-buffer ne s'applique pas aux iframes). À reprendre en Phase 2 après validation usage.
- **Embarquer la page web comme capture PNG** (screenshot serveur) : rejeté car statique — perd l'intérêt du "live" réseaux sociaux/scores.
- **Lancer un second Chromium `--app=URL`** piloté par xdotool : rejeté (complexité systemd, conflit avec kiosk-watchdog dual-display, perte du double-buffer).
- **Livestream via RTMP/WebRTC** : rejeté pour le MVP — HLS (`.m3u8`) couvre 90 % des sources partenaires (TV régionales, chaînes de fédération), hls.js est bien supporté sur Chromium Pi 5 hardware-decoded.

## Conséquences

- **Positif** : deux content types additionnels livrés avec ~400 lignes de code (service + 2 slots DOM + 2 cases switch backend), réutilisant 100 % du plumbing existant (Socket.IO, sync-agent relay, RBAC remote, PIN profils).
- **Positif** : pas de migration DB, pas de changement de schéma — purement feature additive, backward-compat total.
- **Risque** : un iframe tiers peut **casser la CSP** ou **crasher Chromium** sur Pi 4 (mémoire limitée). Mitigation : `sandbox="allow-scripts allow-same-origin"` par défaut, whitelist des domaines configurables via `configuration.webPageWhitelist[]` (feature flag, Phase 2).
- **Risque** : HLS non-CORS → hls.js échoue. Mitigation : le dashboard vérifie côté client (`HEAD` + `Access-Control-Allow-Origin`) avant d'envoyer la commande, et remonte l'erreur au super_admin.
- **Risque security** : injection d'URL malveillante via remote PIN compromis. Mitigation : même guardrail que `play-video` (ownership site + PIN + rate limit 60/min). Aucun élargissement de surface d'attaque.

## Fichiers impactés

- `central-server/src/controllers/remote.controller.ts` — ajouter `play-web-page` et `play-livestream` dans `validCommands` + cases dans le switch (payload `{ type: 'web-page' | 'livestream', data: { url, durationMs? } }` via `cloud-remote-action`).
- `raspberry/src/app/interfaces/command.interface.ts` — élargir `Command.type` à `'web-page' | 'livestream'`, nouveau sous-type `WebContentPayload`.
- `raspberry/src/app/services/web-content.service.ts` — **nouveau**, gère iframe + livestream player, return-to-loop.
- `raspberry/src/app/components/tv/tv.component.html` — ajouter `<iframe #webFrame>` et `<video #livestreamPlayer>` (z-index 10, même layer que manual).
- `raspberry/src/app/components/tv/tv.component.ts` — brancher `web-content.service` dans `handleTvCommand`.
- `central-dashboard/src/app/core/services/remote.service.ts` — ajouter `playWebPage(siteId, url)` et `playLivestream(siteId, url)` (Phase 2 UI — hors scope MVP).

## Phase 2 (hors scope)

- UI dashboard : bouton "Ouvrir URL" + champ URL dans la vue remote.
- Playlist integration : accepter `type: 'web_page' | 'livestream'` dans `SponsorVideo` avec `duration_ms` obligatoire (pas de double-buffer, transition via black-overlay).
- Whitelist domaines par site (`configuration.webPageWhitelist[]`).
- Support RTMP via `ffmpeg` → HLS local (si demande client).

---

## Addendum — Phase 2 livrée (2026-04-23)

Le périmètre a été étendu au-delà du MVP initial : les `web_page` / `livestream` sont devenus des **contenus de première classe** gérés comme des vidéos, avec visibilité sur les trois surfaces télécommande (CloudRemote, Remote SaaS, Remote Pi).

### Changements additionnels

- **DB** : ajout de `videos.content_type` (`'video' | 'web_page' | 'livestream'`) + `external_url` + `duration` — via migration `add-video-content-type.sql`. `POST /api/videos/web-content` crée une row sans fichier FTP.
- **Injection cross-surface** : nouveau helper partagé `central-server/src/utils/inject-web-content-category.ts` qui ajoute une pseudo-catégorie `web-content` (id `web-content`, name `Web / Live`) dans la config renvoyée par `getRemoteState` (CloudRemote), `getSaasConfig` et `getSaasProfileConfig` (Remote SaaS).
- **Pi** : nouvel endpoint `GET /api/sites/:id/web-content` (auth `authenticateSiteApiKey`) + module sync-agent `services/web-content-sync.js` qui pull les entrées à chaque reconnect et toutes les 30 min, et les merge dans la pseudo-catégorie `web-content` de `configuration.json`. Le Remote Pi (même code Angular que SaaS) voit ainsi les entrées sans modification supplémentaire.
- **Dispatch unifié** : `raspberry/src/app/components/remote/remote.component.ts::launchVideo()` route selon `contentType` vers la commande appropriée (`web-page` / `livestream` / `video`), la TV handle déjà les trois cas via `web-content.service.ts`.

### Fichiers supplémentaires impactés

- `central-server/src/utils/inject-web-content-category.ts` — **nouveau**, helper partagé.
- `central-server/src/controllers/web-content.controller.ts` — ajout `listWebContentForPi` (Pi endpoint).
- `central-server/src/routes/web-content-pi.routes.ts` — **nouveau**, route Pi mount sous `/api/sites`.
- `central-server/src/controllers/saas.controller.ts` — injection dans les 2 endpoints SaaS.
- `central-server/src/repositories/video.repository.ts` — `findWebContentForSite()` + `createWebContent()`.
- `raspberry/sync-agent/src/services/web-content-sync.js` — **nouveau**, pull + merge.
- `raspberry/sync-agent/src/agent.js` — appel `syncWebContentFromCloud()` + refresh 30 min.
- `raspberry/src/app/interfaces/video.interface.ts` — `contentType` / `externalUrl` / `durationSeconds`.
- `raspberry/src/app/components/remote/remote.component.ts` — dispatch par `contentType`.
- `central-server/src/__tests__/smoke/smoke-web-content-adr088.test.ts` — smoke guard de la chaîne complète.

### Supervision

- Prometheus counter `neopro_web_content_fetch_total{status=success|forbidden|error}` émis par `listWebContentForPi`. Un spike `forbidden` indique un Pi mal provisionné (api_key ne matche pas le `site_id`) ; un spike `error` = incident DB.
- Le sync-agent log `web-content-sync: result { action, count }` à chaque cycle (reconnect + 30min). Les actions possibles sont `noop` / `updated` / `cleared` / `skipped` (+ detail).
- Smoke test `__tests__/smoke/smoke-web-content-adr088.test.ts` (14 tests) verrouille la chaîne complète contre régression : helper d'injection, routes, guards, monitoring, sync-agent, Remote/TV components.

### Invariants ADR-089

- La pseudo-catégorie `web-content` dans `configuration.json` est **écrite uniquement** par le sync-agent `web-content-sync.js`. Les autres writers (`update-config.js`, `sync-profiles`) la laissent telle quelle ou la remplacent — la source de vérité reste la DB cloud.
- L'endpoint Pi renvoie toujours `{ siteId, entries }`, même vide (pas de 404 si 0 entries).
- `listWebContentForPi` **DOIT** vérifier `req.siteId === req.params.id` (guard contre Pi A lisant les data de Pi B).
- Les clients `uploaded_for_site_id = NULL` sont des web-content **globaux** (visibles par toutes les flottes) ; les tagués par `site_id` sont privés.
