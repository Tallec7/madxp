# ADR-008: Double-Buffer Vidéo avec Freeze-Frame Pré-capturé

**Date** : Janvier-Février 2026 (v2.24-v3.9.x)
**Statut** : Accepté (itéré sur 5 commits majeurs + correctifs v3.9.x)
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

### Stratégie de transition (boucle) — v3.9.x

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
  3. Attend canplaythrough (timeout 3s)
  4. switchPlayers() : nouveau z-index 2 → play → 2×rAF + 300ms → cache ancien
Après switch :
  5. cleanupInactivePlayer() → libère buffers décodeur GPU (~30-50MB)
```

### Disk cache warming (boucles 20-100+ vidéos) — v3.9.x

Pour les longues boucles, la vidéo 0 est évincée du cache disque OS après 19+ vidéos.
`warmDiskCache()` utilise `fetch()` pour pré-lire les 3 prochaines vidéos dans le page cache kernel,
rendant le preload quasi-instantané même au wrap (vidéo N → vidéo 0).

```
fetch(video.path) → response.arrayBuffer() → discard (données restent en page cache kernel)
```

### Règles critiques Pi

**NE JAMAIS faire** (cause saccades) :

- Transitions CSS opacity (repaints causent saccades)
- Capture live dans `onVideoEnded()` (frame buffer déjà libéré)
- `display: none` sur le freeze canvas (cause reflow layout complet)
- Garder les buffers décodeur de l'ancien player après un switch (fuite mémoire → OOM)

**TOUJOURS faire** :

- Pré-capture périodique toutes les 500ms
- `opacity: 0/1` uniquement pour montrer/cacher le canvas
- Listener `timeupdate` throttlé (200ms) pour preload anticipé et early switch
- Attendre `canplaythrough` avant de jouer
- Délai 300ms dans `switchPlayers()` pour le compositor GPU
- `cleanupInactivePlayer()` après chaque switch (libère décodeur GPU)
- `warmDiskCache()` via fetch() à mi-vidéo (prochaines 3 vidéos)

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

### Négatives

1. **Complexité** : ~500 lignes de code pour la gestion des transitions
2. **Légère pause** : ~300-500ms entre les vidéos de boucle (acceptable vs flash)
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

## Références

- `raspberry/src/app/components/tv/tv.component.ts` — Logique complète
- `raspberry/src/app/components/tv/tv.component.html` — 4 vidéos + canvas + overlay
- `raspberry/src/app/services/video-error-recovery.service.ts` — Récupération d'erreurs
- `raspberry/src/app/services/double-buffer-video.service.ts` — Service double-buffer
- `.claude/rules/raspberry-tv.md` — Règles pour modifications futures

---

_Créé le 9 février 2026_
