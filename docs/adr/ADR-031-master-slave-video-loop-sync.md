# ADR-031: Synchronisation master-slave des boucles vidéo dual-display

**Date** : 2026-02-25
**Statut** : Accepté
**Format** : Léger
**Composant** : `raspberry/src/app/components/tv`, `raspberry/server/socket`
**Lié** : [ADR-029](ADR-029-dual-hdmi-tv-led.md) (Dual HDMI), [ADR-008](ADR-008-double-buffer-video-pi.md) (Double-buffer)
**Epic SAFe** : [E-22](../safe/FEATURES.md#e-22--contenus-différenciés-tv--led)

---

## Contexte

En dual-display, deux instances Chromium séparées (`--user-data-dir` distincts) affichent `/tv` et `/secondary`. BroadcastChannel ne fonctionne pas entre processus Chromium distincts. Socket.IO (via le serveur local port 3000) est le **seul canal de communication**.

Trois problèmes de désynchronisation identifiés :

1. **Race condition** : `startSeamlessLoop()` s'exécute dans `ngOnInit()` **avant** `tv-register` (Socket.IO round-trip). Le slave joue sa boucle indépendamment pendant ~200ms.
2. **Path mismatch** : les variantes secondaires ont des chemins différents (`variants.secondary.path`). La synchronisation par `videoPath` échoue systématiquement (`findIndex` retourne -1).
3. **Relance parasite** : `switchToPhase()` et `sponsors()` rappellent `startSeamlessLoop()` sans vérifier `isSlaveMode`.

## Décision

**Synchronisation par `videoIndex`** (position ordinale dans la boucle) au lieu de `videoPath` (chemin fichier). Le slave est passif : il pause sa boucle dès `tv-role-assigned` et attend les directives du master via `tv-loop-state`.

Protocole :

1. Les deux instances démarrent (`ngOnInit` appelle `startSeamlessLoop`)
2. Le serveur assigne les rôles (`tv-role-assigned` : first = master, subsequent = slave)
3. Le slave **pause immédiatement** ses players + freeze-frame
4. Le master diffuse `tv-loop-update` à chaque transition vidéo (inclut `videoIndex`, `videoPath`, `videoStartedAt`)
5. Le serveur relaie en `tv-loop-state` aux slaves
6. Le slave applique `videoIndex % localLoopLength` + seek approximatif au temps master

## Alternatives rejetées

- **BroadcastChannel** : rejeté car ne traverse pas les processus Chromium séparés (`--user-data-dir` distincts)
- **Sync par `videoPath`** : rejeté car les variantes secondaires ont des chemins différents du master (ex. `video-secondary.mp4` vs `video.mp4`)
- **Sync par `videoId`** : rejeté car le modèle `LoopVideo` n'a pas de champ `id` stable dans la boucle client-side ; `videoIndex` est plus simple et fiable
- **Démarrage séquentiel** (slave attend le master avant `ngOnInit`) : rejeté car nécessiterait de bloquer le rendu Angular, complexité disproportionnée

## Conséquences

- Les deux écrans restent synchronisés (< 500ms de décalage, compensé par seek)
- Le slave ne peut jamais avancer seul dans la boucle (toute transition vient du master)
- Si le master se déconnecte, le serveur promeut le plus ancien slave en master (`unregisterTv`)
- **Invariant** : les boucles master et slave doivent avoir le **même nombre et ordre** de vidéos (seuls les chemins variant)
- 6 smoke tests empêchent la régression (section `E-22 TvComponent master-slave sync guards`)

## Fichiers impactés

- `raspberry/src/app/components/tv/tv.component.ts` — pause slave, early return `startSeamlessLoop`, sync par `videoIndex`
- `raspberry/server/socket/handlers.js` — `tv-register` (rôle) + `tv-loop-update` (broadcast) [lu, non modifié]
- `raspberry/server/services/state.service.js` — `_loopState` avec `videoIndex` + `videoStartedAt` [lu, non modifié]
- `central-server/src/__tests__/smoke.test.ts` — 6 guards anti-régression
