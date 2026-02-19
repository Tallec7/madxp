# ADR-008: Double-Buffer Vidéo avec Freeze-Frame Pré-capturé

**Date** : Janvier-Février 2026 (v2.24-v3.23.x)
**Statut** : Accepté (itéré sur 5 commits majeurs + correctifs v3.9.x-v3.23.x)
**Décideurs** : Équipe Neopro

---

## Contexte

L'affichage TV sur Raspberry Pi doit diffuser une boucle continue de vidéos (sponsors, jingles, ambiance) avec des transitions fluides. Plusieurs contraintes matérielles rendent cela difficile :

1. **Décodeur hardware limité** : Le VideoCore du Pi ne supporte pas le décodage parallèle de 2 vidéos
2. **Frame buffer libéré à `ended`** : Sur Chromium/Pi, le buffer vidéo est libéré immédiatement quand la vidéo se termine
3. **GPU lent** : Le compositing d'un nouveau player prend 200-400ms sur VideoCore VI/VII
4. **Sessions longues** : La TV tourne 5h+ par jour avec 3-4 déclenchements manuels/minute pendant les matchs
5. **Mémoire limitée** : Le Pi dispose de 1-4GB RAM partagés entre CPU et GPU

## Décision

Adopter un **double-buffer avec 4 couches z-index, freeze-frame pré-capturé et black overlay** :

```
z-index 20: Canvas freeze-frame (pré-capturé toutes les 500ms)
z-index 10: Player manuel (vidéos déclenchées manuellement)
z-index  5: Black overlay (bloque la boucle pendant transitions)
z-index 1-2: Players boucle A/B (alternent pour la boucle continue)
```

### Stratégie de transition (boucle) — v3.23.x

```
Pendant lecture :
  - setInterval(500ms) → captureLastFrame() → canvas freeze-frame
  - timeupdate (throttle 200ms) :
    - À 50% de la vidéo → warmDiskCache() (fetch des 3 prochaines vidéos)
    - À 1.5s de la fin → preloadOnInactivePlayer()
    - À 0.5s de la fin → triggerSwitch() (early switch)
À ended (fallback si early switch raté) :
  1. Affiche freeze-frame (opacity 1, PAS display:block)
  2. Charge vidéo suivante sur player inactif
  3. Attend canplaythrough + polling readyState>=3 /50ms (timeout 1.5s)
  4. switchPlayers() : nouveau z-index 2 → play → détection frame réel → cache ancien
Après switch :
  5. cleanupInactivePlayer() → libère buffers décodeur GPU (~30-50MB)
     (skip si vidéo active < 5s pour éviter la race condition avec le preload)
```

### Détection de frame réel (v3.23.x)

Au lieu d'un timer fixe de 300ms pour cacher le freeze-frame après un switch,
le système attend un **signal réel** que le décodeur produit des pixels :

- Polling `readyState >= 4 && currentTime > 0` via `requestAnimationFrame`
- Listener `timeupdate` comme signal de confirmation
- Safety timeout 1.5s (ne devrait jamais être atteint en fonctionnement normal)

Cela élimine les trous noirs sur Pi 5 où les erreurs GPU (SharedImageStub)
ralentissent le décodeur au-delà des 300ms fixes.

### Reprise de la boucle après vidéo manuelle — v3.60.1

Lorsqu'une vidéo manuelle est déclenchée (télécommande), `onVideoEnded()` ignore les transitions de boucle (`isManualMode` guard). La boucle meurt pendant la lecture manuelle. À la fin, `onManualEnded()` relance la boucle via `startSeamlessLoop(resumeIndex)` :

```
play(video):
  1. _savedLoopIndex = currentLoopIndex  // Sauvegarde position
  2. isManualMode = true                 // Bloque les transitions boucle
  ...
onManualEnded():
  1. isManualMode = false
  2. Si boucle morte → startSeamlessLoop(_savedLoopIndex + 1)
     // Reprend à la vidéo SUIVANTE (celle en cours a été interrompue)

startSeamlessLoop(resumeIndex?):
  - Si resumeIndex fourni → startIndex = resumeIndex % validVideos.length
  - Sinon → startIndex = 0 (démarrage normal / changement de phase)
```

### Disk cache warming (boucles 20-100+ vidéos) — v3.9.x

Pour les longues boucles, la vidéo 0 est évincée du cache disque OS après 19+ vidéos.
`warmDiskCache()` utilise `fetch()` pour pré-lire les 3 prochaines vidéos dans le page cache kernel,
rendant le preload quasi-instantané même au wrap (vidéo N → vidéo 0).

```
fetch(video.path) → response.arrayBuffer() → discard (données restent en page cache kernel)
```

### Règles critiques Pi

**NE JAMAIS faire** (cause saccades ou bugs visuels) :

- Transitions CSS opacity (repaints causent saccades)
- Capture live dans `onVideoEnded()` (frame buffer déjà libéré)
- `display: none` sur le freeze canvas (cause reflow layout complet)
- Garder les buffers décodeur de l'ancien player après un switch (fuite mémoire → OOM)
- Appeler `hideBlackOverlay()` depuis la boucle quand `isManualMode === true` (retire le masque protégeant la vidéo manuelle — invisible sur Pi/HW overlay mais casse l'affichage sur navigateur desktop)

**TOUJOURS faire** :

- Pré-capture périodique toutes les 500ms
- `opacity: 0/1` uniquement pour montrer/cacher le canvas
- Listener `timeupdate` throttlé (200ms) pour preload anticipé et early switch — avec garde `isManualMode` pour ne pas interférer avec les vidéos manuelles
- Attendre `canplaythrough` avant de jouer
- Détection de frame réel dans `switchPlayers()` (readyState + timeupdate, PAS timer fixe)
- `cleanupInactivePlayer()` après chaque switch (libère décodeur GPU) — skip si vidéo < 5s
- `warmDiskCache()` via fetch() à mi-vidéo (prochaines 3 vidéos)
- Sauvegarder `currentLoopIndex` dans `_savedLoopIndex` avant d'entrer en mode manuel, et passer `_savedLoopIndex + 1` à `startSeamlessLoop()` pour reprendre au bon endroit

## Alternatives Considérées (et abandonnées)

### 1. Player unique avec préchargement anticipé

**Tentative** : Précharger la vidéo suivante 2s avant la fin
**Résultat** : Saccades permanentes — le décodeur hardware ne gère pas 2 flux simultanés
**Verdict** : Rejeté (v2.24)

### 2. Capture live du dernier frame dans `onVideoEnded()`

**Tentative** : `canvas.drawImage(video)` dans le handler `ended`
**Résultat** : Frame noir capturé — le buffer est libéré avant l'appel du handler sur Chromium/Pi
**Verdict** : Rejeté (v3.7.7)

### 3. Transition CSS opacity entre players

**Tentative** : `transition: opacity 200ms` sur les éléments vidéo
**Résultat** : Repaints CSS causent des micro-saccades sur le GPU lent du Pi
**Verdict** : Rejeté (v3.7.7)

### 4. `display: none/block` pour le freeze canvas

**Tentative** : Alterner `display` au lieu de `opacity`
**Résultat** : Reflow layout complet exposant 1-2 frames noirs sur le GPU
**Verdict** : Rejeté (v3.7.8, commit 4)

### 5. Z-index identique pendant transition

**Tentative** : Les deux players boucle à z-index 1 pendant le switch
**Résultat** : Ordre de rendu indéterminé, flash aléatoire
**Verdict** : Rejeté (v3.7.8, commit 3)

### 6. Double-buffer + freeze pré-capturé + black overlay (choisi) ✅

**Résultat** : Zéro flash sur Chromium/Pi et navigateurs desktop
**Verdict** : Accepté après 5 itérations successives.

## Conséquences

### Positives

1. **Transitions sans flash** : Aucun écran noir/blanc entre les vidéos (early switch 0.5s avant la fin)
2. **Stabilité longue durée** : Sessions de 5h+ sans dégradation (cleanup après chaque switch)
3. **Boucles 100+ vidéos** : Disk cache warming via fetch() élimine le problème de cache disque au wrap
4. **Mémoire stable** : ~50-60MB Chromium constant quel que soit le nombre de vidéos
5. **Vidéos manuelles fluides** : Le freeze-frame masque le chargement de la vidéo manuelle
6. **Compatible Pi 4 et Pi 5** : Fonctionne avec VideoCore VI et VII
7. **Robuste aux erreurs GPU** : Détection de frame réel tolère les ralentissements du décodeur

### Négatives

1. **Complexité** : ~500 lignes de code pour la gestion des transitions
2. **Légère pause** : Imperceptible en fonctionnement normal (détection de frame réel)
3. **Mémoire canvas** : ~4.5MB pour le canvas 720p (réduit de 1080p pour économie)
4. **Maintenance** : Toute modification du TV component nécessite des tests sur Pi réel

### Risques Mitigés

| Risque                        | Mitigation                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Erreur décodage GPU           | Watchdog 10s + error recovery (skip/reset après 3 erreurs)                             |
| Fuite mémoire                 | `cleanupInactivePlayer()` après chaque switch + cleanup périodique (30min / 50 vidéos) |
| Cache disque (20-100+ vidéos) | `warmDiskCache()` préchauffe le page cache kernel via fetch()                          |
| Vidéo corrompue               | Skip automatique avec 1s delay, pas de crash                                           |
| Changement de phase           | Token `switchGeneration` annule les callbacks + `resetPrefetchState()`                 |
| Boucle reset après vidéo man. | `_savedLoopIndex` sauvegardé, `startSeamlessLoop(resumeIndex)` reprend au bon endroit  |

## Références

- `raspberry/src/app/components/tv/tv.component.ts` — Logique complète
- `raspberry/src/app/components/tv/tv.component.html` — 4 vidéos + canvas + overlay
- `raspberry/src/app/services/video-error-recovery.service.ts` — Récupération d'erreurs
- `raspberry/src/app/services/double-buffer-video.service.ts` — Service double-buffer
- `.claude/rules/raspberry-tv.md` — Règles pour modifications futures

---

_Créé le 9 février 2026_
