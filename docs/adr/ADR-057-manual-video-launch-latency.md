# ADR-057: Réduction de la latence de lancement des vidéos manuelles sur Pi

**Date** : 2026-04-17
**Statut** : Accepté
**Format** : Léger

---

## Contexte

La lecture d'une vidéo manuelle (télécommande → TV Pi) présentait une latence perçue de 500–1500ms entre le clic et l'apparition de la vidéo. L'audit a identifié 4 contributeurs principaux côté Angular kiosk (`manual-video.service.ts`, master path) :

1. Attente de `canplaythrough` (bufferisation complète) avant lecture (200–500ms selon bitrate et SD)
2. `setTimeout(200)` + `requestAnimationFrame` x 2 post-`play()` avant de rendre le player visible (~230ms fixes)
3. Debounce de 500ms qui avalait silencieusement les clics rapides (UX "pas réactif")
4. Bloc `removeEventListener('ended') + pause()` dupliqué (code mort, présent en source mais pas dans le build — risque futur)

Le double-buffer (freeze-frame + black overlay — ADR-008, ADR-042) masque déjà la boucle pendant le chargement, rendant l'attente de `canplaythrough` redondante.

## Décision

On démarre la lecture dès `loadeddata` (premier frame décodé), on révèle le player en un seul `requestAnimationFrame` après `play().then()`, on ramène le debounce à 150ms, et on supprime le bloc de nettoyage dupliqué. Instrumentation ajoutée : chaque transition manuelle log `+<ms>ms` pour `loadeddata` et `visible`, permettant le monitoring post-déploiement via `journalctl`.

## Alternatives rejetées

- **Garder `canplaythrough`** : rejeté car le double-buffer couvre déjà la fenêtre de bufferisation — attendre 100% bufferisé n'apporte rien visuellement et coûte 200–500ms.
- **Précharger la vidéo manuelle au hover de la télécommande** : rejeté pour l'instant (complexité master/slave, coût mémoire N vidéos), envisageable en v2 si la latence reste perçue.
- **Passer en décodage software forcé pour uniformiser** : rejeté, perte de perf énorme sur Pi 4 (HW H.264 natif).
- **Supprimer complètement le rAF post-`play()`** : rejeté, sans rAF on risque un flash (opacity passe à 1 avant que le 1er frame soit peint).

## Conséquences

- **Positif** : latence perçue réduite de ~400–700ms selon SD et bitrate ; UX télécommande réactive sur clics rapprochés ; instrumentation permet de suivre la latence dans le temps via logs.
- **Risque** : `loadeddata` fire avant bufferisation complète → en cas de connexion SD extrêmement lente, bégaiement possible. Mitigation : le timeout hard de 5s reste en place, et la plupart des vidéos sont déjà présentes localement (pas de download).
- **Non-régression** : smoke test `smoke-kiosk-pi` verrouille les 4 invariants (loadeddata, debounce ≤200ms, pas de `setTimeout(200)`, pas de doublon cleanup).

## Fichiers impactés

- `raspberry/src/app/services/manual-video.service.ts` — fixes latence + instrumentation log
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` — anti-régression
