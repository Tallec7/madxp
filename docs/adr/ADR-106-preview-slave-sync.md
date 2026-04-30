# ADR-106 : Sync 1:1 du preview iframe avec le master TV (preview-slave)

**Date** : 2026-04-30
**Statut** : Accepté
**Format** : Léger
**Étend** : ADR-105 (preview iframe local-first)

---

## Contexte

ADR-105 a remis le preview TV de la Remote V2 dans une `<iframe>` qui charge `/display/0?preview=1`. Cette iframe instancie un **second `TvComponent` autonome** : il a sa propre boucle Bresenham via `videoPlayback.service.ts`, son propre `tvSyncService` qui s'enregistre comme TV (master ou slave selon l'ordre d'arrivée), et joue les vidéos indépendamment du master physique.

Conséquence observable : à un instant t, l'iframe preview joue (par ex.) `intro-neopro.mp4` alors que la TV physique master joue `lidl-sponsor.mp4`. Le staff voit **un aperçu désynchronisé**, donc inutile pour vérifier ce qui passe à l'antenne.

Trois axes étaient possibles :

1. **Capture pixel-stream** (MJPEG/CDP/HTTP pull) — déjà tenté ADR-101/103/104, abandonné par ADR-105 (jamais OTA, incidents 429).
2. **Sync 1:1 par signal de boucle** — l'iframe écoute le state que le master émet déjà (`tv-loop-state`) et joue la même vidéo, à la même position, mute. Approche déjà éprouvée pour le multi-display Pi (ADR-033/034).
3. **Iframe avec son propre rôle "preview-slave"** — isolement explicite : ni master, ni slave classique, ni compteur SaaS. Lecture seule.

L'option 3 réutilise toute l'infrastructure existante (`tv-loop-state`, double-buffer, sync par index) avec un risque minimal et zéro nouvelle dépendance hardware.

## Décision

Introduire un **rôle "preview-slave"** distinct du master/slave classique.

### Côté serveur — nouveau handler `tv-preview-register`

**Pi server** (`raspberry/server/socket/handlers.js`) :

- Sur `tv-preview-register` : `socket.join(...)` simple si applicable, **pas** d'appel à `stateService.registerTv()` (le preview ne compte pas dans `tvInstances` ni `connectedDisplays`).
- Émet immédiatement `tv-loop-state` courant au socket (`stateService.getLoopState()`).
- N'émet **pas** `displays-changed` (préserve le compteur PROP-002).

**Central-server SaaS relay** (`central-server/src/handlers/saas-relay.handler.ts`) :

- Sur `tv-preview-register` (payload `{ siteId }`) : `socket.join(siteId)` pour recevoir les broadcasts room, **pas** d'ajout à `state.tvInstances`, **pas** d'incrément `getSaasClientCount`.
- Émet immédiatement `state.loopState` courant si présent.
- Le `disconnect` n'a rien à nettoyer côté preview (rien n'a été inscrit).

⚠️ **Le listener `tv-preview-register` doit être attaché AU NIVEAU connection global** (`socket.service.ts handleConnection()`), via `registerPreviewSlaveOnSocket(io, socket)`, **PAS** dans `registerSaasRelay()`. Raison : la preview iframe skip volontairement `saas-register` (pour ne pas compter dans `getSaasClientCount`), or `registerSaasRelay` n'est appelé QUE depuis `saas-register`. Si le listener y est gated, il n'est jamais attaché au socket de la preview → l'event est silencieusement ignoré → la preview ne joint jamais la room → 0 broadcast reçu → boucle locale par défaut. C'était le bug initial corrigé par PR #759.

### Côté client — branche preview-slave dans `TvComponent`

Quand `isPreviewMode === true` (déjà détecté par ADR-105 via `?preview=1`) :

- **Skip** `tvSyncService.init()` (pas d'élection master/slave classique — le preview n'est ni l'un ni l'autre).
- **Garde** `playbackService.startSeamlessLoop()` pour populer `_currentLoopVideos` (l'index emis par le master référence cette liste). La 1ʳᵉ vidéo joue ~50 ms en local le temps que le `tv-loop-state` initial arrive (le serveur l'émet immédiatement sur `tv-preview-register`), puis le sync prend la main.
- Émet `tv-preview-register` (au lieu de `tv-register`) après l'init du socket.
- Souscrit à `tv-loop-state` et appelle un nouveau handler `handlePreviewLoopState(state)` qui :
  - Sync par `videoIndex` (jamais `videoPath`, cf. variants secondaires — invariant ADR-033).
  - Délègue au `doubleBufferService.playOnActivePlayer(localVideo.path, syncIndex)` puis seek à `(now - videoStartedAt) % durationMs`.
  - Si `state.isManualMode && state.manualVideoPath` : joue la vidéo manuelle via `manualVideoService.play()` (pas de preload+reveal — le master a déjà fait sa transition, le preview rattrape direct).

### Garde-fous explicites

Le preview-slave **ne doit jamais** :

- Être promu master en cas de déconnexion réelle (pas dans `tvInstances`, donc pas éligible à `promoteSlave()`).
- Émettre `tv-loop-update` (lecture seule, garde côté client : la branche émettrice n'est jamais empruntée si `isPreviewMode`).
- Appeler `recordingState.startRecording()` ni `analyticsService.startSession()` (déjà skippé par ADR-105).
- Compter dans `getSaasClientCount` (handler central skip explicitement `state.tvInstances.set`).
- Émettre `displays-changed` (préserve le compteur PROP-002).

### Multi-display (PROP-002)

L'iframe charge toujours `display/0?preview=1` → le preview suit le **display 0** (master canonique). Suffit pour 95 % des cas (1 display/site). Follow-up `B` (preview suit le display sélectionné dans la remote) déféré tant qu'aucun client n'a > 1 display.

Vrai pour Pi (multi-HDMI) **et** SaaS (PROP-002) — même `displays` JSONB, même rôle dans `state.tvInstances`.

### Recovery offline

Si le master se déconnecte et qu'aucun successeur n'est élu (cas réel pour le preview, qui est le seul "client" en plus du master) : le preview **gèle sur la dernière frame** + affiche un badge `⚠ déconnecté` dans le coin du thumb. Aucun fallback boucle locale (le but est précisément la sync : afficher une boucle locale désynchronisée serait pire que rien).

### Économie bande passante

Le preview consomme le même décodeur que la TV principale (deux `<video>` HTML5 simultanés dans le browser de la régie). Pour limiter l'impact :

- **Page Visibility API** : si le tab Remote passe en background (autre app au-dessus, écran verrouillé), le preview pause son `<video>` jusqu'au retour. Implémentation : listener `visibilitychange` dans `TvComponent`, pause/resume sur les players.
- Pas de toggle utilisateur explicite (économie auto suffit, follow-up si retour terrain).

## Conséquences

**Ajouts** :

- Pi server : `socket.on('tv-preview-register', ...)` (~10 lignes).
- Central-server SaaS relay : `socket.on('tv-preview-register', ...)` (~15 lignes).
- `TvSyncService` : `setPreviewSlaveMode(true)` getter (utilisé par les helpers métriques pour skip émissions).
- `TvComponent` : branche conditionnelle dans `ngOnInit` (`if (isPreviewMode) { ...preview-slave init... } else { ...existing... }`), méthode `handlePreviewLoopState(state)`, listener `visibilitychange`.

**Smoke tests** (`smoke-preview-slave-sync.test.ts`) :

- Pi server expose `tv-preview-register`.
- Central-server SaaS relay expose `tv-preview-register`.
- Le handler preview ne touche pas `state.tvInstances` (grep absence).
- Le handler preview émet `tv-loop-state` au register (présence).
- TvComponent en `isPreviewMode` skip `tvSyncService.init()` et `startSeamlessLoop()`.
- TvComponent en `isPreviewMode` émet `tv-preview-register` (pas `tv-register`).
- TvComponent en `isPreviewMode` n'émet jamais `tv-loop-update` (grep absence dans la branche preview).

**Non touché** :

- ADR-105 reste le contrat global du preview (iframe local-first, sandbox, pointer-events: none).
- ADR-033/034 (race condition master-slave classique) — preview-slave n'a pas ce problème (pas d'action manuelle émise depuis le preview).
- Compteur SaaS clients (`getSaasClientCount`) — préservé.

## Garde-fous (smoke test enforced)

- Ne **jamais** retirer `tv-preview-register` de `raspberry/server/socket/handlers.js` ou `central-server/src/handlers/saas-relay.handler.ts`.
- Ne **jamais** ajouter `state.tvInstances.set(...)` dans le handler `tv-preview-register` (casserait l'invariant "preview ne compte pas").
- Ne **jamais** émettre `displays-changed` depuis le handler `tv-preview-register` (casserait le compteur PROP-002).
- Ne **jamais** retirer la garde `if (this.isPreviewMode) return;` qui protège l'émission de `tv-loop-update` côté client.
- Ne **jamais** retirer l'appel à `playbackService.startSeamlessLoop()` en preview (sans lui `_currentLoopVideos` reste vide → l'index master ne peut pas être résolu côté preview).
- Sync **par index**, pas par path (invariant ADR-033 réutilisé).
- Ne **jamais** déplacer `registerPreviewSlaveOnSocket(io, socket)` depuis `socket.service.ts handleConnection()` vers `registerSaasRelay()` (régression #759 : la preview skip saas-register, donc le listener ne serait jamais attaché → boucle locale par défaut pour toujours).
- Ne **jamais** retirer le payload `{ siteId }` de l'émission `tv-preview-register` côté client (sans lui le serveur ne peut pas faire `socket.join(siteId)` → 0 broadcast reçu).

## Référence

- ADR-105 — preview iframe local-first (contexte décision iframe).
- ADR-033/034 — master-slave race condition (pattern réutilisé).
- `.claude/rules/raspberry-tv.md` § "Synchronisation TV Master-Slave".
- Implémentation : `raspberry/server/socket/handlers.js`, `central-server/src/handlers/saas-relay.handler.ts`, `raspberry/src/app/components/tv/tv.component.ts`, `raspberry/src/app/services/tv-sync.service.ts`.
- Smoke test : `central-server/src/__tests__/smoke/smoke-preview-slave-sync.test.ts`.
