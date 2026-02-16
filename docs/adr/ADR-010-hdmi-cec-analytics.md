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

| État TV        | Comportement analytics                                |
| -------------- | ----------------------------------------------------- |
| `on`           | Vidéo trackée (comptée dans les stats)                |
| `standby`      | Vidéo ignorée (TV en veille)                          |
| `disconnected` | Vidéo ignorée (HDMI débranché)                        |
| `unknown`      | Vidéo trackée (CEC non disponible, bénéfice du doute) |

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

---

## Évolution : Détection EDID (v3.44.0)

**Date** : Février 2026

### Problème

Quand un Pi est connecté à un **moniteur PC** (qui ne supporte pas CEC), le dashboard affichait "❓ Non détecté" pour l'alimentation TV et 0 périphériques CEC. Cet affichage était confus car il laissait penser à un problème alors que le comportement est normal pour un moniteur.

### Solution : Lecture EDID brute

En complément du CEC, le Pi lit maintenant les données **EDID** (Extended Display Identification Data) directement depuis `/sys/class/drm/card*-HDMI-*/edid`. Le parsing est fait en JS pur (aucune dépendance externe).

**Données extraites de l'EDID :**

| Donnée     | Source EDID                    | Exemple                       |
| ---------- | ------------------------------ | ----------------------------- |
| Fabricant  | Bytes 8-9 (code 3 lettres)     | `SAM` (Samsung), `DEL` (Dell) |
| Modèle     | Descriptor tag 0xFC (ASCII)    | `DELL P2419H`                 |
| Résolution | Detailed Timing Descriptor     | `1920x1080`                   |
| Série      | Descriptor tag 0xFF            | `H4ZN500001`                  |
| Type écran | CEA Extension Block (byte 128) | TV si présent                 |

**Heuristique de type d'écran (par priorité) :**

1. CEC devices > 0 → `tv` (CEC = protocole TV)
2. CEA extension dans EDID (byte 128 = 0x02) → `tv`
3. CEC disponible + 0 devices + écran connecté (EDID ou DRM status file) → `monitor`
4. Sinon → `unknown`

> **Détection de connexion physique :** La présence d'un écran est vérifiée via deux sources fiables : le fichier EDID (taille > 0) ou le fichier `/sys/class/drm/card*-HDMI-*/status` (contenu = `connected`). Le signal `tv_connected` de `cec-client` n'est **pas** utilisé car il génère des faux positifs — sur Pi 5, `cec-client` retourne `power status: unknown` même sans écran branché.

**Impact sur l'affichage dashboard :**

| Type détecté | Section HDMI                                          | Warning CEC          |
| ------------ | ----------------------------------------------------- | -------------------- |
| `tv`         | "📺 État TV (HDMI-CEC)" avec métriques CEC complètes  | Normal si CEC absent |
| `monitor`    | "🖥️ Écran (Moniteur PC)" avec infos écran, CEC masqué | Supprimé (normal)    |
| `unknown`    | "📺 Écran connecté" avec infos si disponibles         | Affiché              |

**Cache :** Résultat EDID mis en cache 5 minutes (l'écran connecté change rarement).

### Fichiers impactés

- `raspberry/sync-agent/src/metrics.js` — `_findEdidPath()`, `_parseEdid()`, `getDisplayInfo()`
- `raspberry/server/services/hdmi.service.js` — `getDisplayInfo()`, `getFullStatus()`
- `raspberry/server/routes/hdmi.js` — Route enrichie avec display info
- `central-dashboard/.../site-debug-tab.component.ts` — Affichage adaptatif
- `raspberry/sync-agent/src/__tests__/display-info.test.js` — 18 tests unitaires

## Références

- [hdmi-status.service.ts](../../raspberry/src/app/services/hdmi-status.service.ts)
- [analytics.service.ts](../../raspberry/src/app/services/analytics.service.ts)
- [analytics.controller.ts](../../central-server/src/controllers/analytics.controller.ts)
- [add-tv-status-analytics.sql](../../central-server/src/scripts/migrations/add-tv-status-analytics.sql)
- [hdmi.service.js](../../raspberry/server/services/hdmi.service.js) — Service EDID + CEC
- [metrics.js](../../raspberry/sync-agent/src/metrics.js) — Collecte EDID pour health status
- ADR-009 : Suppression des Analytics dashboard

---

_Créé le 11 février 2026 — Mis à jour le 16 février 2026 (EDID v3.44.0)_
