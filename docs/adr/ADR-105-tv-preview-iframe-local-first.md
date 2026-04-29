# ADR-105 — Preview TV via iframe local-first

> **Statut** : Accepté · **Date** : 29 avril 2026 · **Format** : léger
> **Remplace** : [ADR-101](ADR-101-tv-preview-mjpeg-strategy.md) (MJPEG Pi → Remote, jamais déployé OTA), [ADR-103](ADR-103-tv-preview-layout-mutex.md) (mutex single-subscriber MJPEG), [ADR-104](ADR-104-tv-preview-saas-http-pull.md) (HTTP pull SaaS — incident 429)

## Contexte

La tuile `<app-r2-tv-monitor>` du layout régie pro PC C (et la mini-thumb du hero pour les autres layouts) doit afficher en temps réel ce que la TV diffuse. Trois itérations successives ont été tentées en 6 jours :

1. **PR #690 + ADR-101 (28 avr)** — MJPEG Pi → Remote via `/preview.mjpeg`, capture HDMI + encode MJPEG côté Pi, consommé par `<img multipart/x-mixed-replace>` côté Remote V2.
2. **PR #692 (28 avr)** — Extension SaaS via push Socket.IO (`tv-preview:saas-frame`), TV browser capture canvas → data: URI → relay central.
3. **PRs #704/#707/#709/#711/#713/#715/#717 (25-28 avr)** — 7 fixes successifs sur le push Socket.IO (race subscribe→register, kick post-deploy Railway, CORS canvas, cache-bust data: URLs, capability event reset, etc.).
4. **PR #725 + ADR-104 (29 avr)** — Bascule en HTTP pull (POST `/api/saas/:id/tv-snapshot` 4Hz × GET 4Hz) pour résoudre la fragilité Socket.IO.
5. **PR #728 (29 avr)** — Kill-switch ADR-104 après incident 429 SaaS sur le site `3c62b930-…-0052` : `remoteRateLimit` (60/min/IP) saturé par 480 req/min de tuyauterie tv-snapshot.

Constat post-mortem : **aucun Pi de la flotte n'a reçu d'OTA depuis le 22 avril**. Tout le stack ADR-101/103/104 vit uniquement dans le code central + dev builds — il n'a **jamais tourné** sur 1 seul Pi en production. La régie pro PC C voyait toujours le placeholder gradient (état pré-#690).

Le besoin produit réel est trivial : "le staff dans le club veut voir ce que la TV affiche". Or staff et TV sont **physiquement sur le même réseau local** par définition (même WiFi club). Aucun acteur distant à servir : zéro composant `central-dashboard/` ne consommait les routes tv-snapshot (vérifié par grep).

## Décision

Le composant `<app-r2-tv-monitor>` charge un **`<iframe>`** pointant sur la même page TV avec `?preview=1` :

```
window.location.origin + ?preview=1 [+ &site=<uuid> en mode SaaS]
```

Le mode `?preview=1` côté `TvComponent` :

- Skip `analyticsService.startSession()` (pas de double comptage `video_plays`).
- Skip `recordingState.startRecording()`.
- Skip `socket.emit('saas-register')` (la tuile preview ne doit pas être comptée dans `getSaasClientCount`).
- Audio déjà mute par défaut sur les players HTML5 (`<video muted>` dans `double-buffer-video.service.ts`).

Le composant utilise `DomSanitizer.bypassSecurityTrustResourceUrl()` + sandbox `allow-scripts allow-same-origin` + `pointer-events: none` (preview-only).

## Conséquences

**Suppressions** (~3 000 lignes) :

- Cloud — `tv-snapshot.service.ts`, routes `POST/GET /api/saas/:id/tv-snapshot`, validation Joi `tvSnapshotPush`, métriques Prometheus `neopro_tv_preview_*` (4 séries), dashboard Grafana `neopro-tv-preview-cloud.json`, snapshot tv-preview dans le heartbeat handler.
- Pi — `raspberry/server/services/tv-preview.service.js`, `raspberry/server/routes/tv-preview.js`, exposition CDP port 9222, `raspberry/sync-agent/src/services/tv-preview-bootstrap.js`, fetch `get-tv-preview-metrics` côté heartbeat sync-agent, événements Socket.IO `tv-preview:capability` / `tv-preview:throttled` / `tv-preview:start` / `tv-preview:stop` / `tv-preview:saas-subscribe` / `tv-preview:saas-unsubscribe` / `tv-preview:saas-frame`.
- Frontend — `setupSaasPreviewCapture()` + `emitSaasPreviewFrame()` + canvas + flag `TV_SNAPSHOT_HTTP_PULL_ENABLED` côté `TvComponent` ; `setupSaasTvPreviewConsumer()` + `handleTvPreviewCapability()` + `resolveTvPreviewUrl()` + signal `tvPreviewThrottled` côté `RemoteV2Component`.
- Docs — ADR-101, ADR-103 (mutex MJPEG), SPEC-V2-TVMON-01 + CDC HTML, smoke-tv-preview.test.ts, entrées README associées.

**Garde** : ADR-103 "web-and-livestream-content-in-playback-loops" (homonyme accidentel — proposé, non lié au tv-preview) est conservé et garde son numéro.

## Garde-fous

- Le mode `?preview=1` ne doit pas démarrer de session analytics ni s'enregistrer comme display SaaS — sans ça, double comptage `video_plays` + faux compteur `getSaasClientCount`.
- L'iframe est sandbox `allow-scripts allow-same-origin` (besoin de scripts pour Angular + same-origin pour ne pas casser les services qui lisent localStorage). Aucune URL externe ne doit être passée — le sanitizer Angular construit l'URL à partir de `window.location.origin`.
- `pointer-events: none` obligatoire — la tuile preview ne doit jamais capter les clics (sinon le staff joue accidentellement avec sa propre TV via la preview).

## Référence

- Incident 429 : conversation 29 avril 2026 + PR #728 (kill-switch).
- Audit dates : `git log --all --pretty=format:"%h %ad %s" --date=short | grep tv-preview` → tout daté 28-29 avril 2026.
- Audit prod flotte : aucun OTA déployé semaine du 22-29 avril → 0 Pi exécute le code MJPEG.
