# SPEC : Transitions vidéo manuelle (Pi TV)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-30

## En une phrase

Quand l'opérateur déclenche une vidéo manuelle depuis la télécommande (entrée joueur, replay, jingle), la TV bascule sur cette vidéo de manière **fluide et instantanée**, sans jamais montrer la boucle de fond ni un écran noir entre 2 vidéos.

## Acteurs impliqués

- **Speaker / staff club** (rôle Club Staff, cf. `docs/PERSONAE.md`) : déclenche depuis la télécommande pendant un match (présentation joueurs, but, sponsoring breaking news)
- **Régisseur** (Club opérateur dual-display) : pilote 30+ vidéos par match avec aperçu mini-thumb dans la télécommande PC C
- **Spectateurs** : voient la TV publique du club — l'expérience perçue est le **vrai succès métier**

## Périmètre (ce que ce domaine couvre)

- **Composants UI** :
  - `raspberry/src/app/components/tv/tv.component.ts` (orchestrateur)
  - `raspberry/src/app/services/manual-video.service.ts` (master `play()` + slave `preloadManualVideo`/`revealPreloadedVideo`)
  - `raspberry/src/app/services/double-buffer-video.service.ts` (4 players + canvas freeze + overlay noir)
- **3 paths distincts** :
  - **Master Pi kiosk** : reçoit la commande Socket.IO, joue la vidéo en double-buffer
  - **Slave web** (browser preview, dual-display SaaS) : preload silencieux + reveal sur signal master
  - **Slave Pi physique** : même path slave que web, mais Chromium kiosk (pas d'autoplay policy)
- **ADR** : ADR-033 (race master-slave), ADR-034 (preload + reveal), ADR-042 (DoubleBuffer/VideoPlayback/ErrorRecovery), ADR-057 (latence launch)
- **Smoke tests** : `smoke-kiosk-pi.test.ts` (suite "Manual video transition flash prevention guards") + `smoke-display.test.ts` (suite "ADR-034 ...")
- **`.claude/rules/`** : [`raspberry-tv.md`](../../../.claude/rules/raspberry-tv.md) — sections "Manual Video Transitions", "Preload & Reveal (ADR-034)", "Transition Manuel→Manuel"

## Règles métier (ce qui DOIT marcher cross-composant)

1. **1 clic = 1 vidéo affichée** — chaque clic sur la télécommande déclenche directement l'affichage. Aucune répétition n'est nécessaire (pas de "click-twice").
2. **Aucune frame de la boucle de fond visible entre 2 vidéos manuelles** — la transition affiche le frame figé du joueur précédent, jamais le sponsor/jingle de la boucle automatique.
3. **Aucun écran noir visible pendant la transition** — la couleur de fond noire est tolérée si elle est imperceptible (<16ms perçus = 1 frame à 60Hz).
4. **Cadence acceptable speaker** — l'opérateur peut enchaîner 1 vidéo toutes les 1-10s sans dégradation de fluidité (cas NLF présentation joueurs).
5. **Synchronisation TV physique ↔ aperçu Régie** — la mini-TV preview dans la télécommande PC C affiche exactement ce qui passe à l'antenne (drift toléré ±1s, ADR-106).
6. **Retour boucle après vidéo manuelle** — quand la vidéo manuelle se termine naturellement OU est stoppée, la TV reprend la boucle là où elle en était (`_savedLoopIndex + 1`).
7. **Spam protection** — si l'opérateur clique 2× en <150ms (debounce), seul le premier clic est traité (le 2ᵉ est ignoré, pas mis en file).

## Comportements observables

| Action opérateur                              | Ce que voit le speaker              | Ce que voit le spectateur (TV)                                           |
| --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Boucle en cours → clic vidéo joueur 1         | Toast "Joueur 1 lancée sur l'écran" | Sponsor du moment se fige ~150ms → joueur 1 démarre                      |
| Joueur 1 en cours → clic joueur 2 (1s+ après) | Toast "Joueur 2 lancée"             | Frame figé de joueur 1 ~150-300ms → joueur 2 démarre instantanément      |
| Joueur en cours → clic STOP                   | Toast "Retour à la boucle"          | Frame figé du joueur ~150ms → reprise boucle (vidéo suivante du sponsor) |
| Vidéo manuelle se termine naturellement       | Bouton joueur dégrise dans Remote   | Reprise boucle automatique sans flash                                    |
| Régisseur en PC C dual-display                | Mini-TV preview suit la TV publique | (idem TV publique)                                                       |

## Architecture du masquage en transition manuel→manuel

Trois couches qui se relaient pour garantir 0 frame de boucle visible :

| Couche                  | z-index  | Contenu                                                               | Active dès                          | Hidden quand                                  |
| ----------------------- | -------- | --------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| **Freeze-frame canvas** | 20       | Frame capturé LIVE depuis `getActiveManualPlayer()` au moment du clic | Clic reçu                           | rVFC + 1 rAF (paint commit du nouveau player) |
| **Black-overlay div**   | 5        | Solide noir opaque (filet de sécurité pour gap rVFC)                  | Clic reçu (en plus du freeze-frame) | Idem (rVFC + 1 rAF)                           |
| **Manual player video** | 10 ou 11 | La nouvelle vidéo, opacity=1 après 1ʳᵉ frame ready                    | Au reveal post-`play()`             | (toujours présent une fois peint)             |

**Ordre des opérations master `play()`** (manuel→manuel) :

1. Capture freeze-frame LIVE depuis le player actif (frame du joueur précédent)
2. Show black-overlay (z=5) — invisible sous le freeze-frame, sert de filet de sécurité
3. Pause + `removeAttribute('src') + load()` sur l'ancien player → libère le SharedImage backing GPU Pi 5
4. Set `opacity=0`, `zIndex=11` sur le nouveau player (inactive) + load nouvelle src
5. Sur `loadeddata` : `play()` → 1×rAF → `opacity=1` + `swapActiveManualPlayer()`
6. Register `requestVideoFrameCallback` → dans le callback, `requestAnimationFrame` → hide freeze-frame + black-overlay

## Cas d'edge connus

- **Pi 5 SharedImage saturation** : sans libération du décodeur HW de l'ancien player (`removeAttribute('src') + load()`), le compositeur Chromium ne peut pas allouer un SharedImage backing pour le nouveau décodeur → la nouvelle vidéo charge mais ne paint pas → bug "click-twice" (résolu PR #778, smoke-test enforced).
- **Slave web autoplay-policy** : Chromium navigateur (hors kiosk) bloque `unmute()` sans interaction utilisateur → fallback `muted=true; play()` automatique. La TV physique kiosk a `--autoplay-policy=no-user-gesture-required`, n'a pas cette restriction.
- **`<video>` transparent avant 1ʳᵉ frame** : Chromium n'applique pas `background:#000` CSS tant qu'aucune frame n'est décodée → la couche black-overlay est nécessaire (ne pas compter sur le bg CSS du `<video>`).
- **`requestVideoFrameCallback` fire AVANT paint final** : rVFC fire pendant le DOM update, pas après le compositor flush → 1 rAF chaîné nécessaire pour vraiment attendre le paint composé.
- **Race master-slave** (ADR-033) : si master émet un `tv-loop-state` non-manual juste après une commande, le slave ignorerait pendant 2s (`_lastActionReceivedAt` guard).
- **Régisseur en hotspot mobile (NAT)** : la mini-TV preview reçoit les frames via Socket.IO + token HMAC TTL 5 min (ADR-106), pas de port-forwarding nécessaire.

## Ce qui n'est PAS dans le scope

- ❌ **Transition boucle→manuel** : utilise un freeze-frame pré-capturé du loop player (path différent, pas de risque GPU saturation car 1 seul décodeur loop encore actif lors du load manuel — l'ancien loop player reste sur sa frame courante avec son décodeur).
- ❌ **Transition manuel→boucle** : géré par `onManualEnded` qui restart la boucle à `savedLoopIndex+1`.
- ❌ **Web-content (page web/livestream)** : path séparé `WebContentService` (cf. SPEC `web-live-content.spec.md`).
- ❌ **Score overlays** (z-index 30+) : couche au-dessus indépendante des transitions vidéo.
- ❌ **Synchronisation Stramatel** : pas de lien direct, le scoreboard a son propre cycle.

## Évolutions possibles

- **Helper `smoothManualTransition()`** dans `DoubleBufferVideoService` : extraire le pattern "capture freeze + show overlay + libération HW + reveal pixel-perfect" en un helper réutilisable. Master `play()` et slave `revealPreloadedVideo()` ont aujourd'hui du code dupliqué.
- **Test E2E "présentation joueurs NLF"** dans `e2e/tests/hardware-matrix.spec.ts` : séquence de 5 vidéos manuelles consécutives en <10s, assert pas d'écran noir et pas de "click-twice" (mesure visuelle ou Prometheus counter).
- **Métrique Prometheus `neopro_manual_video_transition_duration_ms`** (P95/P99) : suivre la latence perçue T0 (clic Remote) → T1 (1ʳᵉ frame paintée). Cible <300ms.
