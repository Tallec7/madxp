# ADR-099 : `connection_events` comme source de vérité de l'uptime sites

**Date** : 2026-04-27
**Statut** : Accepté
**Format** : Léger

---

## Contexte

L'investigation autour du dashboard NLF Handball (issue #644) a révélé un bug
silencieux qui touchait **toute la flotte** : la page détail d'un site
affichait systématiquement un uptime de l'ordre de **9-11%** sur 24h, avec un
badge orange "Connexion instable", même pour des Pi parfaitement stables.

La requête de diagnostic sur 48h pour le Pi NLF (`c994620c-…`) montrait un
nombre de heartbeats parfaitement constant (~12 par heure), aucun trou —
indiquant qu'il n'y avait jamais eu d'instabilité réelle.

### Cause racine

Le calcul d'uptime mélangeait deux signaux distincts :

| Signal Pi → Cloud        | Cadence                                                                                        | Rôle                            |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| `heartbeat` Socket.IO    | 30 s ([raspberry/sync-agent/src/config.js:99](../../raspberry/sync-agent/src/config.js))       | Met à jour `sites.last_seen_at` |
| Écriture table `metrics` | **5 min** ([raspberry/sync-agent/src/config.js:100](../../raspberry/sync-agent/src/config.js)) | Loggue CPU / RAM / temp         |

Le dashboard ([central-server/src/controllers/site-fleet-dashboard.controller.ts](../../central-server/src/controllers/site-fleet-dashboard.controller.ts)) calculait :

```
uptime % = COUNT(metrics) / 2880 × 100
```

en supposant 2880 rows / 24h (intervalle 30s), alors que la table `metrics`
est échantillonnée toutes les **5 minutes** (288 rows / 24h max). Résultat :
~10% systématique pour tout site sain.

Le coupage entre la fréquence de logging des métriques système et la mesure
de connectivité était une fragilité de fond : changer `metricsInterval` (par
exemple pour économiser de l'egress DB) cassait silencieusement le calcul
d'uptime.

## Décision

On découple **complètement** le suivi de connectivité des métriques système
en introduisant une nouvelle table dédiée :

```sql
CREATE TABLE connection_events (
  id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('connected','disconnected')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason VARCHAR(100),
  socket_id VARCHAR(64),
  client_ip VARCHAR(45)
);
```

### Comment elle est alimentée

Le `socketService` insère un row à deux moments précis :

- **`connected`** : juste après l'authentification réussie de l'agent (pile
  où `sites.status` passe à `'online'`).
- **`disconnected`** : dans le `handleDisconnection`, **uniquement** dans la
  branche réelle (la stale-socket race — un nouveau socket prend la place
  d'un ancien — ne génère pas d'event, sinon on aurait des faux disconnects
  toutes les ~1s lors d'une reconnexion rapide).

L'écriture est best-effort : une erreur DB est loggée mais ne bloque jamais
le flux connect/disconnect.

### Comment elle est lue

`connectionEventsRepository.getUptimeStats(siteId, hours)` calcule sur la
fenêtre demandée :

- `uptimePercent` (0-100, ou `null` si aucun event — site jamais connecté)
- `disconnectCount` (nombre de coupures sur la fenêtre)
- `longestGapSeconds` (durée de la plus longue coupure)
- `currentState` (`'connected' | 'disconnected' | 'unknown'`)

L'algorithme alterne les events dans l'ordre chronologique, somme les durées
en état `connected`, et utilise le dernier event antérieur à la fenêtre pour
connaître l'état initial.

Le dashboard expose ces 4 valeurs via `connection.uptime` dans la réponse de
`/api/sites/:id/dashboard`. Le champ `heartbeat_24h` est conservé (compat
front), mais le front doit basculer sur `connection.uptime` dès que ses
champs sont disponibles.

### Rétention

Pas de purge dans le scope de cet ADR. Une méthode
`connectionEventsRepository.purgeOlderThan(retentionDays)` est exposée, à
brancher sur un CRON dans une PR ultérieure (cible : 90 jours, à confirmer
quand on aura un volume de prod réel).

## Alternatives écartées

### A. Corriger la formule en divisant par 288 au lieu de 2880

Solution mécanique, mais ne traite pas la cause : le couplage entre la
fréquence de logging des métriques système et la mesure de connectivité
reste. Si demain on passe `metricsInterval` à 1 min ou 10 min pour des
raisons de coût ou de granularité, le badge ment à nouveau.

### B. Utiliser `sites.last_seen_at` seul

Simple mais binaire (connecté maintenant / pas connecté). Ne permet pas de
répondre à "Combien de coupures hier ?" ou "Quelle a été la plus longue
coupure ?", qui sont des signaux importants pour distinguer un Pi qui flap
(vraie instabilité réseau) d'un Pi parfaitement stable.

### C. Stream Prometheus + alerting

Pour de l'alerting fin (SLO, page on-call), Prometheus est l'outil. Mais le
dashboard a besoin d'un signal par site requêtable depuis le central-server,
et brancher Prometheus en sync sur ce besoin transverse est dispro pour le
problème direct (badge UI). On peut alimenter Prometheus depuis
`connection_events` plus tard si nécessaire.

## Conséquences

- **Badge "Instable" devient fiable** : déclenché uniquement quand
  `disconnectCount` ou `longestGapSeconds` sortent d'un seuil défini, plus
  par une formule corrompue.
- **Les opérateurs distinguent enfin** un site sain (`uptimePercent ≥ 99`)
  d'un site qui flap (`disconnectCount > 5/24h`).
- **Le suivi est rétroactif** : la rétention par défaut de 90j permet des
  post-mortems sur "pourquoi le Pi NLF était-il rouge le 25/04 ?".
- **Découplage total** : changer la cadence des metrics système ne touche
  plus la mesure d'uptime.
- Le champ `connection.heartbeat_24h` du DTO dashboard reste exposé pour
  rétrocompat front, mais devient déprécié (à supprimer après bascule front).

## Garde-fous

Le smoke test [smoke-connection-events.test.ts](../../central-server/src/__tests__/smoke/smoke-connection-events.test.ts) verrouille :

- L'existence de la migration et de la table dans `full-schema.sql`.
- L'existence du repository et de ses méthodes (`record`, `getUptimeStats`,
  `purgeOlderThan`).
- L'export via le barrel `repositories/index.ts`.
- La présence des deux hooks dans `socket.service.ts` (connect + disconnect).
- L'absence du diviseur magique `2880` dans le controller dashboard (régression
  guard pour issue #644).

Les tests unitaires
[connection-events.repository.test.ts](../../central-server/src/repositories/connection-events.repository.test.ts)
couvrent les cas d'algorithme : pas d'events (état neutre), site stable
(~100%), site flapping (uptime cohérent + disconnectCount), coupure encore en
cours, et un test "regression guard" qui interdit qu'un site stable retombe
à 10% (le bug d'origine).

## Références

- Issue : [Tallec7/neopro#644](https://github.com/Tallec7/madxp/issues/644)
- Code Pi : [raspberry/sync-agent/src/config.js:99-100](../../raspberry/sync-agent/src/config.js)
- Migration : [add-connection-events.sql](../../central-server/src/scripts/migrations/add-connection-events.sql)
