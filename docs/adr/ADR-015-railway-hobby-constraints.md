# ADR-015: Contraintes Railway Hobby Plan et Optimisations Mémoire

**Date** : Janvier 2026 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le central-server Neopro est hébergé sur **Railway Hobby plan** (~$5/mois). Ce plan impose une limite stricte de **512MB de RAM**. En production, le serveur gère :

- 50+ connexions Socket.IO simultanées
- API REST Express avec JWT
- Connection pool PostgreSQL
- Logs Winston
- Services cron (stats quotidiennes, cleanup)
- Services temps réel (alertes prédictives, benchmark)

Le serveur était régulièrement OOM-killed avant les optimisations.

## Décision

Optimiser tous les composants pour tenir dans **~40MB de heap** avec des seuils de sécurité :

| Paramètre | Avant | Après | Économie |
|-----------|-------|-------|----------|
| Pool DB (`max`) | 20 | **5** | ~60MB RAM |
| Logs Winston | 10MB × 5 fichiers | **2MB × 2** | ~46MB disque |
| Pending commands Socket.IO | 500 | **100** | Mémoire variable |
| Pong entries map | 200 | **50** | Mémoire variable |
| Image-to-video résolution | 1080p | **720p** | Mémoire ffmpeg |
| Image-to-video preset | medium | **ultrafast** | Mémoire ffmpeg |

### Seuils mémoire

```typescript
const MEMORY_WARNING = 0.88;    // 88% → log warning
const MEMORY_CRITICAL = 0.93;   // 93% → force GC si disponible
const MEMORY_EMERGENCY = 0.97;  // 97% → cleanup agressif
```

## Alternatives Considérées

### 1. Upgrader vers Railway Pro ($20/mois, 8GB RAM)

**Avantages** :
- Résout le problème immédiatement
- Pas de compromis techniques

**Inconvénients** :
- Coût ×4 pour une startup early-stage
- Masque les problèmes d'efficacité
- 50 sites ne justifient pas 8GB de RAM

**Verdict** : Rejeté pour le moment - Prématuré. Les optimisations suffisent pour 50 sites.

### 2. Migrer vers Fly.io / Render

**Avantages** :
- Plus de mémoire pour le même prix
- Options de scaling

**Inconvénients** :
- Migration infrastructure
- Risque de régression
- Temps de migration non justifié

**Verdict** : Rejeté - Le problème est l'efficacité du code, pas la plateforme.

### 3. Optimiser pour 512MB ✅

**Avantages** :
- **Coût minimal** : $5/mois
- **Code efficient** : Force de bonnes pratiques
- **Scalabilité future** : Si ça tient dans 512MB, un upgrade sera confortable

**Inconvénients** :
- Pool DB limité à 5 connexions (goulet d'étranglement possible à 100+ sites)
- ffmpeg contraint (720p au lieu de 1080p)
- Marge de manœuvre réduite pour nouvelles features

**Verdict** : Accepté - Suffisant pour la phase actuelle (50 sites).

## Conséquences

### Positives

1. **Coût** : $5/mois au lieu de $20+
2. **Efficacité** : Le code est optimisé par nécessité
3. **Monitoring** : Seuils mémoire explicites avec alertes

### Négatives

1. **Pool limité** : 5 connexions DB → potentiel goulet sous forte charge
2. **ffmpeg contraint** : Conversion image→vidéo en 720p (acceptable pour du contenu sponsor)
3. **Pas de marge** : Une feature gourmande en mémoire nécessitera un upgrade

### Seuil de migration

Envisager l'upgrade Railway Pro quand :
- 100+ sites connectés simultanément
- Pool DB régulièrement saturé (queue de connexions > 2s)
- Mémoire régulièrement au-dessus de 93%

## Références

- [database.ts](../../central-server/src/config/database.ts) - Pool `max: 5`
- [logger.ts](../../central-server/src/config/logger.ts) - Logs réduits
- [socket.service.ts](../../central-server/src/services/socket.service.ts) - Pending commands limité
- [image-to-video.service.ts](../../central-server/src/services/image-to-video.service.ts) - 720p ultrafast
- [Dockerfile](../../central-server/Dockerfile) - ffmpeg avec libx264

---

*Créé le 11 février 2026*
