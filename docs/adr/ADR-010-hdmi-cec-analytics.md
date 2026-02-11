# ADR-010: Détection HDMI-CEC pour Fiabilité Analytics

**Date** : Février 2026
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Les analytics Neopro comptaient toutes les lectures vidéo, y compris quand la TV était éteinte ou débranchée. Le Pi continue de lire des vidéos en boucle même si personne ne regarde.

**Exemple réel** : Un club affichait 1200h/jour de "temps de diffusion" et 3000 vidéos jouées alors que la TV était débranchée depuis des semaines.

Ce problème a conduit à la suppression des pages analytics (voir ADR-009).

## Décision

Utiliser **HDMI-CEC** pour détecter l'état de la TV et ne compter que les lectures avec TV réellement allumée :

| État TV | Comportement analytics |
|---------|----------------------|
| `on` | Vidéo trackée (comptée dans les stats) |
| `standby` | Vidéo ignorée (TV en veille) |
| `disconnected` | Vidéo ignorée (HDMI débranché) |
| `unknown` | Vidéo trackée (CEC non disponible, bénéfice du doute) |

```typescript
// analytics.service.ts
if (tvStatus === 'standby' || tvStatus === 'disconnected') {
  return; // Ne pas tracker cette lecture
}
trackVideoPlay(video, tvStatus);
```

## Alternatives Considérées

### 1. Compter toutes les lectures (status quo)

**Avantages** :
- Simple
- Chiffres plus impressionnants

**Inconvénients** :
- Données fondamentalement fausses
- Sponsors trompés par des chiffres gonflés
- Impossible de construire un business de preuve de diffusion

**Verdict** : Rejeté - A causé la suppression des analytics (ADR-009).

### 2. Détection via luminosité ambiante (capteur)

**Avantages** :
- Indépendant du protocole TV

**Inconvénients** :
- Nécessite du hardware additionnel
- Mesure indirecte et peu fiable
- Coût par boîtier

**Verdict** : Rejeté - Trop complexe et peu fiable.

### 3. HDMI-CEC via cec-client ✅

**Avantages** :
- **Précis** : Détecte directement l'état d'alimentation de la TV
- **Gratuit** : `cec-utils` est un package standard Linux
- **Universel** : CEC est supporté par la majorité des TV modernes
- **Aucun hardware** : Utilise le câble HDMI existant

**Inconvénients** :
- Certaines TV ne supportent pas CEC correctement
- `cec-client` peut être lent (~2s par requête)
- État `unknown` si CEC non disponible

**Verdict** : Accepté - Meilleur rapport fiabilité/coût.

### 4. Détection via consommation HDMI (hot plug detect)

**Avantages** :
- Plus rapide que CEC

**Inconvénients** :
- Détecte uniquement si le câble est branché, pas si la TV est allumée
- APIs Linux limitées pour HPD

**Verdict** : Rejeté - Ne distingue pas TV allumée de TV en veille.

## Conséquences

### Positives

1. **Données fiables** : Les analytics reflètent la réalité de la diffusion
2. **Confiance sponsors** : Les impressions comptées sont réelles
3. **Base pour reconstruire** : Permet de remettre des pages analytics dans le dashboard

### Négatives

1. **Chiffres plus bas** : Les stats vont baisser drastiquement (normal : elles étaient gonflées)
2. **CEC non universel** : ~10-15% des TV ne supportent pas CEC → fallback `unknown` (trackées)
3. **Prérequis** : `cec-utils` doit être installé sur chaque Pi

### Colonne ajoutée

```sql
ALTER TABLE video_plays ADD COLUMN tv_status TEXT DEFAULT 'unknown';
-- Valeurs : 'on', 'standby', 'disconnected', 'unknown'
```

## Références

- [hdmi-status.service.ts](../../raspberry/src/app/services/hdmi-status.service.ts)
- [analytics.service.ts](../../raspberry/src/app/services/analytics.service.ts)
- [analytics.controller.ts](../../central-server/src/controllers/analytics.controller.ts)
- [add-tv-status-analytics.sql](../../central-server/src/scripts/migrations/add-tv-status-analytics.sql)
- ADR-009 : Suppression des Analytics dashboard

---

*Créé le 11 février 2026*
