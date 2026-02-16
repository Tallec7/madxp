# ADR-006: Double-Buffer Vidéo sans Préchargement

**Date** : Janvier 2026 (documenté rétroactivement)
**Statut** : ⚠️ Supersédé par [ADR-008](./ADR-008-double-buffer-video-pi.md) — Version initiale simplifiée, remplacée par la version itérée avec freeze-frame pré-capturé et disk cache warming.
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le composant TV du Raspberry Pi doit lire des vidéos en boucle continue (5h+ par jour) avec des transitions fluides entre les vidéos. Le Pi dispose d'un décodeur vidéo hardware (VideoCore IV/VII) avec des limitations strictes.

Problèmes rencontrés en production :

1. **Flash blanc entre vidéos** : Quand un player HTML5 termine et le suivant démarre, l'écran flashe
2. **Crash GPU après 2h** : `MEDIA_ERR_DECODE` (code 3) causé par la surchauffe du décodeur hardware
3. **Saccades lors du préchargement** : Charger la vidéo suivante pendant la lecture de l'actuelle surcharge le GPU

## Décision

Adopter un système **double-buffer avec 4 layers + freeze-frame** mais **sans préchargement anticipé** :

```
z-index 20: Canvas freeze-frame (capture image de transition)
z-index 10: Player manuel (vidéos déclenchées par la télécommande)
z-index 5:  Black overlay (masque la boucle pendant les transitions)
z-index 1-2: Players boucle A/B (alternent pour la boucle continue)
```

**Règle critique** : Une seule vidéo décode à la fois. Le préchargement se fait uniquement au `ended` de la vidéo en cours, jamais pendant la lecture.

## Alternatives Considérées

### 1. Player unique avec préchargement

**Avantages** :

- Simple à implémenter
- Transitions potentiellement plus rapides

**Inconvénients** :

- Flash blanc systématique entre chaque vidéo
- Préchargement surcharge le GPU Pi

**Verdict** : Rejeté - Flash inacceptable pour un affichage professionnel.

### 2. Double-buffer avec préchargement anticipé (timeupdate)

**Avantages** :

- Transitions instantanées (vidéo suivante prête en mémoire)

**Inconvénients** :

- Le décodeur hardware Pi ne supporte pas 2 décodages simultanés
- L'événement `timeupdate` lui-même causait des micro-freezes même throttlé
- Saccades visibles pendant la lecture

**Verdict** : Rejeté - Testé et abandonné. Le GPU Pi est trop limité.

### 3. Double-buffer sans préchargement (at ended) ✅

**Avantages** :

- **Zéro saccade** : Une seule vidéo décode à la fois
- **Pas de flash** : Le freeze-frame couvre la transition
- Lecture fluide sur sessions longues (5h+)

**Inconvénients** :

- Légère pause entre vidéos (< 1s) le temps de charger la suivante
- Complexité du système de layers (4 players + canvas + overlay)

**Verdict** : Accepté - Le compromis pause < 1s est acceptable pour une lecture fluide.

## Conséquences

### Positives

1. **Stabilité** : Sessions de 5h+ sans crash GPU
2. **Fluidité** : Zéro saccade pendant la lecture
3. **Transitions propres** : Le freeze-frame masque le chargement
4. **Mémoire contrôlée** : Cleanup préventif toutes les 30 min

### Négatives

1. **Pause inter-vidéo** : ~0.5-1s entre chaque vidéo (acceptable)
2. **Complexité code** : Le tv.component.ts gère 4 players + canvas + overlay
3. **Mémoire canvas** : Réduit à 720p (1280×720) pour économiser ~4.5MB

### Système de récupération d'erreurs

Après 3 erreurs consécutives → full reset avec pause GPU de 3 secondes :

```
Error → consecutiveErrors++ →  < 3 : Skip vidéo (1s delay)
                                >= 3 : Full Reset (3s GPU cooldown)

Watchdog (10s) → Vidéo pausée ? → play()
                 Vidéo bloquée ? → Skip to next

Memory Cleanup (30min OU 50 vidéos) → clearRect canvas + clear buffers
```

## Ce qui a été désactivé (causait des saccades)

| Feature                | Pourquoi désactivée                      |
| ---------------------- | ---------------------------------------- |
| `timeupdate` listener  | Même throttlé, causait des micro-freezes |
| Préchargement anticipé | Décodage parallèle surchargeait le GPU   |
| Transition CSS opacity | Repaints causaient des saccades          |

**Avertissement** : Ne pas réintroduire ces features sans tester sur un Pi physique avec une boucle de 2h+. Les tests courts ne révèlent pas les problèmes thermiques.

## Références

- [tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts) - Logique double-buffer
- [tv.component.html](../../raspberry/src/app/components/tv/tv.component.html) - 4 vidéos + canvas + overlay
- [double-buffer-video.service.ts](../../raspberry/src/app/services/double-buffer-video.service.ts)
- [video-error-recovery.service.ts](../../raspberry/src/app/services/video-error-recovery.service.ts)

---

_Créé le 11 février 2026_
