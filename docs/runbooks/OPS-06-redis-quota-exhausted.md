# Runbook OPS-06 — Redis Upstash quota exhausted (Socket.IO adapter) — 📦 ARCHIVÉ

> **🚨 Note post-cleanup 2026-05-13** : ce scénario **ne peut plus se reproduire en l'état**. Suite à l'incident, le Redis adapter Socket.IO a été **supprimé définitivement du central-server** (choix A étape 4). `redis` et `@socket.io/redis-adapter` sont retirés de `central-server/package.json`. Le smoke test `smoke-redis-adapter-incident-2026-05-13.test.ts` (11 assertions) bloque toute réintroduction silencieuse.
>
> Ce runbook reste comme **document historique** + **playbook au cas où** quelqu'un (toi, Claude, futur dev) re-introduit Redis un jour pour scaler horizontalement. **Si tu le ré-introduis** : remets AUSSI un quota check + alerting Prometheus AVANT de toucher à la prod.

---

> **Objectif (historique)** : remettre en ligne la flotte quand le quota Upstash Redis est épuisé et que le central-server boucle sur `ERR max requests limit exceeded`. Référence : incident NLF 2026-05-13 (P0 — flotte entière).
> **Pré-requis** : CLI Railway authentifiée (`railway whoami`), accès au dashboard Upstash (optionnel pour vérifier le quota).
> **Niveau de risque** : 🔴 critique — toute la flotte apparaît `Hors ligne` côté dashboard alors que les Pi heartbeatent normalement. Symptôme silencieux, pas d'alerte directe.

---

## Détection

Tu reconnais cet incident si **TOUS** ces signaux sont présents :

| Signal                                                                                            | Source                                  | Anomalie                                                                                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sites.last_seen_at` figé pour TOUS les Pi qui devraient être online                              | DB                                      | > 30 min sur 2+ sites en même temps                                                                                                        |
| `connection_events` n'a aucune entrée récente (toute la flotte)                                   | DB                                      | `MAX(occurred_at) > 1h` sur l'ensemble de la table                                                                                         |
| `metrics` n'a plus de heartbeat sample récent                                                     | DB                                      | `MAX(recorded_at) > 30 min`                                                                                                                |
| `video_plays` continue à être inséré frais (analytics HTTP non-Redis)                             | DB                                      | `MAX(played_at) < 15 min` ← **important : HTTP analytics OK = cloud n'est pas down, c'est seulement le pub/sub Redis qui casse Socket.IO** |
| Logs Railway central-server : `Redis pub client error: ERR max requests limit exceeded` en boucle | `railway logs --service neopro-central` | Erreur stack `@redis/client` qui répète toutes les 1-2s                                                                                    |

Si tu vois les 5 → c'est le quota Upstash. Pas une apiKey, pas un crash Pi, pas un deploy storm.

---

## Diagnostic en 1 ligne

```bash
railway logs --service neopro-central 2>&1 | grep -c "max requests limit exceeded"
```

Si ≥ 10 dans la dernière minute → confirmé.

Cross-check côté DB :

```sql
SELECT
  (SELECT MAX(played_at)    FROM video_plays)        AS http_alive,         -- doit être récent
  (SELECT MAX(occurred_at)  FROM connection_events)  AS socket_dead,        -- doit être stale > 1h
  (SELECT MAX(recorded_at)  FROM metrics)            AS heartbeat_dead,     -- doit être stale > 30 min
  (SELECT MAX(last_seen_at) FROM sites WHERE site_type = 'pi') AS last_seen_max;
```

Si `http_alive` est frais ET `socket_dead`/`heartbeat_dead` sont stales sur la même fenêtre → quota Redis épuisé.

---

## Étape 1 — Couper Redis côté Railway (~1 min)

Deux options selon ce qui est plus rapide d'accès pour toi.

### Option A — Dashboard Railway (UI, le plus simple)

1. Railway dashboard → service `neopro-central` → onglet **Variables**
2. Trouver `REDIS_URL`
3. Icône 🗑️ → confirmer la suppression
4. Railway redéploie automatiquement (~30s)

### Option B — CLI avec kill-switch (depuis le fix 2026-05-13)

Si tu ne peux pas supprimer la variable (linking Railway, secrets gérés hors UI), utilise le kill-switch ajouté dans `socket.service.ts` :

```bash
railway variables --service neopro-central --set REDIS_ENABLED=false
railway redeploy --service neopro-central
```

Le code vérifie maintenant `process.env.REDIS_ENABLED !== 'false'` AVANT de regarder `REDIS_URL`. Si désactivé, Socket.IO tombe en single-instance mode sans plus jamais tenter de se connecter à Redis.

---

## Étape 2 — Vérifier la remise en ligne (~2 min)

Après le redeploy (suivre la jauge dans Railway dashboard), surveille le bump du `last_seen_at` pour un Pi attendu online :

```bash
# Boucle simple : tu dois voir l'age descendre sous 1 min en moins de 60s
watch -n 5 'psql "$PROD_DATABASE_URL" -c "
  SELECT site_name, last_seen_at, NOW() - last_seen_at AS age
  FROM sites WHERE site_type = '\''pi'\'' AND id = '\''<site_id>'\''
"'
```

Attendu :

- Logs Railway : la ligne `Redis adapter explicitly disabled` ou `REDIS_URL not configured - single-instance mode`
- Plus aucun `Redis pub client error`
- `last_seen_at` bumpe en < 30s pour le premier Pi qui se reconnecte
- `connection_events` reçoit de nouveaux events `connected`
- Dashboard : badge "En ligne" revient

---

## Étape 3 — Investigation post-mortem du quota (~10 min)

**500 000 req/mois ≈ 16k/jour ≈ 11/min** — c'est BEAUCOUP trop pour une flotte de quelques Pi qui font 2 events/min (connect + occasional broadcast). Donc il y a un emitter qui spam.

Pistes à creuser :

1. **Boucle de reconnexion Redis cassée** dans une instance qui a planté
2. **Broadcast non-throttle** (cf. heartbeat handler 30s × 50 sites × 2 events Redis = 200/min × 60 × 24 × 30 = 8.6M/mois — possible si tous les Pi sont online en permanence)
3. **CRON qui spam un broadcast Socket.IO** sans regarder s'il y a des subscribers
4. **Logs metrics Redis** : Upstash dashboard → Metrics → voir le pic horaire de commandes

À documenter dans un ADR léger si on garde Redis (sinon supprimer la dépendance proprement).

---

## Étape 4 — Décision durable

Trois choix :

| Choix                                                    | Quand                                                             | Coût                |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------- |
| **A. Supprimer Redis définitivement**                    | Railway tourne en 1 replica (cas actuel, vérifier `railway.json`) | Gratuit, simplifie  |
| **B. Garder Redis + upgrade plan Upstash**               | On prévoit de scale > 1 replica Railway                           | ~$5-10/mois Upstash |
| **C. Garder le kill-switch, Redis désactivé par défaut** | Compromis : on peut le réactiver en 1 set var quand on scale      | Gratuit             |

Recommandation 2026-05-13 : **A** ou **C** tant qu'on est en 1 replica. La PR #979 ajoute déjà le kill-switch (choix C).

---

## Cause racine de l'incident 2026-05-13

- **Trigger** : usage organique → 500 000 commandes Redis atteintes sur le mois (free tier Upstash)
- **Faille de design** :
  - Le Redis adapter est branché alors qu'il n'a pas d'utilité en 1 replica (over-engineering)
  - Pas d'alerte préventive sur le quota Upstash (pas de monitoring)
  - Le fallback `catch` ne nettoyait pas `removeAllListeners('error')` avant `quit()` → spam de logs en boucle après crash (PR #979 fix)
- **Symptôme côté DB** :
  - `sites.last_seen_at` figé depuis 2026-05-13 06:45 UTC pour NLF
  - `connection_events` muet depuis 2026-05-12 20:34 UTC (toute flotte)
  - `metrics` dernier sample 2026-05-13 06:40 UTC
  - `video_plays` continue frais (HTTP analytics OK)
- **Faux signaux qu'on a chassés avant de trouver Redis** :
  - Apparente apiKey mismatch (hash/raw) → swap propre, mais inutile, le pub/sub Redis bloquait l'auth handler en amont
  - Apparente cascade ADR-117 storm (l'origine timeline du crash) → cause secondaire mais réelle, le throttle hardening PR #977 reste valide

## Fix appliqué (PR #979)

| Composant                             | Changement                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `socket.service.ts:setupRedisAdapter` | Kill-switch `REDIS_ENABLED=false` qui prend le pas sur `REDIS_URL`. Default = `'true'` pour pas de breaking change.             |
| `socket.service.ts` catch fallback    | Ajout `removeAllListeners('error')` avant `quit()` pour les 2 clients (pub + sub) — stoppe le spam de logs après crash adapter. |
| Smoke test                            | `smoke-redis-adapter-incident-2026-05-13.test.ts` — 5 assertions (kill-switch, ordre, default, listener cleanup).               |

## Suivi à programmer

- [ ] Monitor Prometheus pour Redis : exporter `redis_commands_total` et alerter à 80 % du quota mensuel
- [ ] Décider A/B/C pour la stratégie Redis durable (cf. tableau étape 4)
- [ ] Si **A** retenu : supprimer toutes les références à `@socket.io/redis-adapter` et `redis` dans `socket.service.ts` + désinstaller dépendances
- [ ] Audit des broadcasts Socket.IO pour identifier le hot-emitter (cf. étape 3 piste 2)
