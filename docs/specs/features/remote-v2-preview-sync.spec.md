# SPEC : Remote V2 — Preview iframe sync 1:1

> **Owner** : Daisy
> **Statut** : Live (ADR-106 — semaine 18 / 2026-04-30)
> **Dernière revue** : 2026-04-30
> **Code principal** :
>
> - `raspberry/src/app/components/tv/tv.component.ts` (branche `isPreviewMode` — preview-slave init, handler `handlePreviewLoopState`)
> - `raspberry/src/app/services/tv-sync.service.ts` (compat — le preview-slave skip `init()`)
> - `raspberry/server/socket/handlers.js` (handler `tv-preview-register`)
> - `central-server/src/handlers/saas-relay.handler.ts` (handler `tv-preview-register`)
>
> **ADR liés** : ADR-105 (iframe local-first, contexte décision), ADR-106 (preview-slave sync — cette SPEC)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-preview-slave-sync.test.ts`

## En une phrase

Le mini-thumb 60×38 du hero Remote V2 charge un iframe `?preview=1` qui s'enregistre comme **preview-slave** : il reçoit les `tv-loop-state` du master sans compter dans `tvInstances` ni `getSaasClientCount`, joue mute la même vidéo seekée à la position du master, et n'émet jamais de `tv-loop-update`.

## Périmètre

Domaine restreint au mini-aperçu TV embarqué dans la Remote V2 (mobile + tablette + PC C régie pro).

- **Composants client** : `TvComponent` (branche `isPreviewMode === true`), `TvSyncService` (skip init)
- **Handlers serveur** : `tv-preview-register` côté Pi local (port 3000) ET côté central-server SaaS relay
- **Mode d'activation** : URL contient `?preview=1` (déjà câblé par ADR-105)

## Règles métier (ce qui DOIT marcher)

1. **Sync vidéo boucle** — quand le master change de vidéo (rotation Bresenham auto), le preview joue la même vidéo en ≤ 500 ms.
2. **Sync vidéo manuelle** — quand la remote déclenche une vidéo manuelle, le preview rattrape direct (`manualVideoService.play()`, sans preload+reveal).
3. **Sync par index** — le preview utilise `state.videoIndex % loopVideos.length` pour résoudre la vidéo locale, **jamais** `videoPath` (variants secondaires ont des chemins différents — pattern master-slave réutilisé).
4. **Seek approximatif** — position de lecture initialement seekée à `(now - state.videoStartedAt) % durationMs`, drift toléré ±1 s.
5. **Mute permanent** — l'iframe n'émet jamais d'audio (un seul flux audio = celui de la TV physique).
6. **Compteurs préservés** — `tvInstances`, `getSaasClientCount`, `displays-changed` ne bougent pas quand un preview-slave se connecte ou se déconnecte.
7. **Lecture seule** — le preview n'émet jamais `tv-loop-update`, `tv-register`, `score-update`, `phase-change` ni aucun signal métier.
8. **Pas d'analytics** — `analyticsService.startSession()`, `recordingState.startRecording()`, `playbackService.startSeamlessLoop()` skippés (déjà câblé ADR-105 pour les deux premiers, ADR-106 ajoute le skip de `startSeamlessLoop`).

## Comportements observables

- Au boot Remote V2 : iframe `<r2-tv-thumb>` charge `display/0?preview=1`, s'enregistre via `tv-preview-register`, reçoit immédiatement le `tv-loop-state` courant et joue la même vidéo que la TV physique.
- À chaque changement de vidéo master : transition fluide dans le thumb (réutilise `doubleBufferService.playOnActivePlayer`).
- Master déconnecté → preview gèle sur la dernière frame avec badge `⚠ déconnecté` dans le coin.
- Tab Remote en background (Page Visibility API) → preview met `<video>` en pause ; retour foreground → re-sync sur prochain `tv-loop-state`.

## Cas d'edge connus

- **2 Remote ouvertes** : 2 preview-slaves dans la même room, chacun reçoit le broadcast → OK.
- **Connexion preview après le master** : le serveur émet `state.loopState` (Pi) ou `state.loopState` (central-server) immédiatement au socket du nouveau preview, donc pas de fenêtre noire.
- **Master reboot** : preview reste sur dernière frame jusqu'au retour ; pas de fallback boucle locale (afficher du désynchro = pire que rien).
- **PROP-002 multi-display** : le preview suit toujours `display/0` (master canonique). Suivi du display sélectionné dans la remote = follow-up B (deferred tant qu'aucun client client n'a > 1 display).

## Contraintes / NE PAS FAIRE

- **Ne JAMAIS** retirer le handler `tv-preview-register` côté Pi server ou central-server (smoke test enforced).
- **Ne JAMAIS** ajouter `state.tvInstances.set(...)` dans le handler `tv-preview-register` (casserait l'invariant compteur display).
- **Ne JAMAIS** émettre `displays-changed` depuis le handler preview (casserait le compteur PROP-002).
- **Ne JAMAIS** retirer la garde `if (this.isPreviewMode) { return; }` qui empêche `tv-loop-update` côté client.
- **Ne JAMAIS** appeler `playbackService.startSeamlessLoop()` quand `isPreviewMode === true` (boucle locale parasite, désynchro garantie).
- **Sync par index** uniquement, jamais par path (pattern master-slave réutilisé).

## Ce qui n'est PAS dans le scope

- Capture pixel-stream (MJPEG / CDP / HTTP pull) — abandonnée par ADR-105.
- Toggle utilisateur "désactiver l'aperçu" — économie auto via Page Visibility suffit (follow-up si retour terrain).
- Mosaïque multi-display dans le thumb (le thumb 60×38 est trop petit ; éventuellement en vue C régie PC en follow-up).
- Sync remote → preview (ex: la remote ne peut pas dire au preview "saute à la frame X" — c'est le master qui pilote).

## Évolutions possibles (backlog léger)

- **Follow-up B** (PROP-002) : le preview suit le display sélectionné dans la remote au lieu du display 0.
- **Toggle pref user** : ajouter `preview_enabled` dans `user_prefs` (ADR-104) si retour terrain "consomme trop".
- **Vue régie PC C** : mosaïque multi-display côte-à-côte si client demande visu N TVs simultanées.

## Référence

- ADR-106 : `docs/adr/ADR-106-preview-slave-sync.md`
- ADR-105 : `docs/adr/ADR-105-tv-preview-iframe-local-first.md`
- Invariants smoke-testés : `central-server/src/__tests__/smoke/smoke-preview-slave-sync.test.ts`
- `.claude/rules/raspberry-tv.md` § "Synchronisation TV Master-Slave" (pattern réutilisé)
