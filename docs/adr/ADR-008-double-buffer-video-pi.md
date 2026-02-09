# ADR-008: Double-Buffer Vidéo avec Freeze-Frame Pré-capturé

**Date** : Janvier-Février 2026 (v2.24-v3.7.8)
**Statut** : Accepté (itéré sur 5 commits majeurs)
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

### Stratégie de transition (boucle)

```
Pendant lecture : setInterval(500ms) → captureLastFrame() → canvas
À ended :
  1. Affiche freeze-frame (opacity 1, PAS display:block)
  2. Charge vidéo suivante sur player inactif
  3. Attend canplaythrough (timeout 3s)
  4. switchPlayers() : nouveau z-index 2 → play → 2×rAF + 300ms → cache ancien
```

### Règles critiques Pi

**NE JAMAIS faire** (cause saccades) :
- Préchargement pendant la lecture (décodeur ne supporte pas 2 vidéos parallèles)
- Listener `timeupdate` (même throttlé, cause micro-freezes)
- Transitions CSS opacity (repaints causent saccades)
- Capture live dans `onVideoEnded()` (frame buffer déjà libéré)
- `display: none` sur le freeze canvas (cause reflow layout complet)

**TOUJOURS faire** :
- Pré-capture périodique toutes les 500ms
- `opacity: 0/1` uniquement pour montrer/cacher le canvas
- Préchargement au `ended` seulement
- Attendre `canplaythrough` avant de jouer
- Délai 300ms dans `switchPlayers()` pour le compositor GPU

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

1. **Transitions sans flash** : Aucun écran noir/blanc entre les vidéos
2. **Stabilité longue durée** : Sessions de 5h+ sans dégradation (cleanup mémoire périodique)
3. **Vidéos manuelles fluides** : Le freeze-frame masque le chargement de la vidéo manuelle
4. **Compatible Pi 4 et Pi 5** : Fonctionne avec VideoCore VI et VII

### Négatives

1. **Complexité** : ~400 lignes de code pour la gestion des transitions
2. **Légère pause** : ~300-500ms entre les vidéos de boucle (acceptable vs flash)
3. **Mémoire canvas** : ~4.5MB pour le canvas 720p (réduit de 1080p pour économie)
4. **Maintenance** : Toute modification du TV component nécessite des tests sur Pi réel

### Risques Mitigés

| Risque | Mitigation |
|--------|------------|
| Erreur décodage GPU | Watchdog 10s + error recovery (skip/reset après 3 erreurs) |
| Fuite mémoire | Cleanup toutes les 30min OU après 50 vidéos |
| Vidéo corrompue | Skip automatique avec 1s delay, pas de crash |
| Changement de phase | Token `switchGeneration` annule les callbacks obsolètes |

## Références

- `raspberry/src/app/components/tv/tv.component.ts` — Logique complète
- `raspberry/src/app/components/tv/tv.component.html` — 4 vidéos + canvas + overlay
- `raspberry/src/app/services/video-error-recovery.service.ts` — Récupération d'erreurs
- `raspberry/src/app/services/double-buffer-video.service.ts` — Service double-buffer
- `.claude/rules/raspberry-tv.md` — Règles pour modifications futures

---

*Créé le 9 février 2026*
