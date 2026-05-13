# Runbook OPS-05 — Auto-deploy storm cleanup (ADR-117)

> **Objectif** : nettoyer une cascade d'auto-déploiements vidéos qui a écrasé un Pi (`neopro-app` crashé, dashboard en `Hors ligne`, queue de déploys stuck en `in_progress`). Référence : incident NLF 2026-05-13.
> **Pré-requis** : accès DB prod (psql), accès physique ou SSH au Pi concerné, Railway dashboard.
> **Niveau de risque** : 🟠 élevé — un seul site impacté, mais aucun signal de remise en ligne automatique tant que `neopro-app` n'est pas restart.

---

## Détection

Tu sais qu'un Pi est victime d'un storm ADR-117 si TOUS les critères suivants sont vrais :

| Signal                                                            | Source                                      | Seuil suspect                 |
| ----------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `last_seen_at` figé                                               | `sites.last_seen_at`                        | > 10 min                      |
| `last_config_sync` qui devient stale lui aussi (~2h après)        | `sites.last_config_sync`                    | > 30 min                      |
| Aucun `connection_events.event_type = 'connected'` récent         | `connection_events`                         | 0 sur 12h                     |
| Pic de `content_deployments` pour le site dans une fenêtre courte | `content_deployments.started_at`            | > 15 deploys / 5 min          |
| Un deploy `in_progress` qui ne se complete jamais                 | `content_deployments.status` + `started_at` | `in_progress` depuis > 10 min |

Optionnel : métrique Prometheus `neopro_auto_deploy_throttled_total{reason}` qui spike → le throttle a refusé des deploys, mais le mal était déjà fait avant le déploiement du fix.

---

## Étape 1 — Confirmer le diagnostic (~2 min)

```bash
export PROD_DATABASE_URL='postgresql://...'

# Reconstituer la timeline du site suspect
psql "$PROD_DATABASE_URL" <<'SQL'
\set site_id 'c994620c-2016-40f3-9399-2d0345f69274'  -- remplacer

SELECT
  site_name, club_name, status,
  last_seen_at, NOW() - last_seen_at AS seen_age,
  last_config_sync, NOW() - last_config_sync AS sync_age,
  software_version
FROM sites WHERE id = :'site_id';

-- Storm de déploiements ?
SELECT
  COUNT(*) AS deploys_last_30min,
  COUNT(*) FILTER (WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '10 minutes') AS stuck,
  MIN(started_at) AS first, MAX(started_at) AS last,
  EXTRACT(EPOCH FROM (MAX(started_at) - MIN(started_at))) AS span_seconds
FROM content_deployments
WHERE target_id = :'site_id' AND started_at > NOW() - INTERVAL '30 minutes';

-- Pic CPU juste avant le crash ?
SELECT recorded_at, cpu_usage, memory_usage, temperature
FROM metrics
WHERE site_id = :'site_id' AND recorded_at > NOW() - INTERVAL '2 hours'
ORDER BY recorded_at DESC LIMIT 10;
SQL
```

Si tu vois ≥ 15 deploys dans les 5 min précédant `last_seen_at`, et CPU qui spike sur la dernière metric → **c'est un storm ADR-117**. Passe à l'étape 2.

---

## Étape 2 — Geler la cascade côté cloud (~1 min)

Avant de relever le Pi, **annule la queue d'auto-deploys restants** pour éviter qu'ils ré-écrasent le Pi dès qu'il revient.

```bash
psql "$PROD_DATABASE_URL" <<'SQL'
\set site_id 'c994620c-2016-40f3-9399-2d0345f69274'

-- Marquer les deploys stuck comme failed
UPDATE content_deployments
SET status = 'failed',
    completed_at = NOW(),
    error_message = 'Auto-failed by OPS-05 — storm cleanup ADR-117 (incident 2026-05-13)'
WHERE target_id = :'site_id'
  AND status = 'in_progress'
  AND started_at < NOW() - INTERVAL '10 minutes'
RETURNING id, video_id;

-- Marquer aussi les deploys pending qui restent dans la file
UPDATE content_deployments
SET status = 'failed',
    completed_at = NOW(),
    error_message = 'Auto-failed by OPS-05 — frozen pending queue'
WHERE target_id = :'site_id'
  AND status = 'pending'
RETURNING id, video_id;
SQL
```

**Pourquoi failed et pas cancelled ?** `failed` est un état terminal que `hasActiveDeploymentByPath` ne considère plus comme bloquant → quand on re-déploie après remise en ligne, le système retente proprement.

---

## Étape 3 — Remettre le Pi en ligne (accès physique / SSH local)

`neopro-sync-guardian` ne surveille **PAS** `neopro-app`. Si `neopro-app` est crashé, il faut intervenir manuellement.

### Option A — Accès SSH (Tailscale / VPN club / sur place)

```bash
ssh pi@<ip-locale-du-club>   # ip dans sites.local_ip

# Vérifier l'état des services
systemctl status neopro-app neopro-sync-agent neopro-kiosk

# Si neopro-app est dead :
sudo systemctl restart neopro-app

# Si tout le Pi semble figé (impossible de SSH) :
# → coupure secteur 30s puis rebranchement (demander au club)
```

### Option B — Pas d'accès distant possible

1. Contacter le club au téléphone
2. Demander un cycle d'alim : débrancher le Pi (boîtier noir avec écran) 30 secondes, rebrancher
3. Attendre 2-3 min que les services Pi redémarrent

---

## Étape 4 — Vérifier la remise en ligne (~3 min)

```bash
# Surveiller le bump last_seen_at
psql "$PROD_DATABASE_URL" -c "
  SELECT site_name, last_seen_at, NOW() - last_seen_at AS age
  FROM sites WHERE id = '<site_id>';
"
```

Attendu : `age` < 1 min dans les 60 secondes suivant le restart.

Côté dashboard : badge "En ligne" doit revenir. Si le site reste `Hors ligne` 5 min après le restart, vérifier les logs Pi :

```bash
ssh pi@<ip>
journalctl -u neopro-app -n 50 --no-pager
journalctl -u neopro-sync-agent -n 50 --no-pager
```

---

## Étape 5 — Re-déclencher les déploiements légitimes (~1 min)

Une fois le Pi en ligne et le throttle ADR-117 hardening déployé en prod (PR du fix `smoke-adr-117-incident-2026-05-13`), tu peux relancer la sauvegarde du profil. Le hook respectera maintenant la cap `MAX_IN_FLIGHT_PER_SITE = 8` et sérialisera à 1.5s entre chaque deploy.

Surveiller la métrique :

```
neopro_auto_deploy_throttled_total{site_id="...",reason="in_flight_cap"}
```

Si elle incrémente, c'est que la cap protège — c'est bon signe. Les deploys restants se feront naturellement aux prochaines sauvegardes.

---

## Cause racine de l'incident 2026-05-13

- **PR origine** : #972 (ADR-117, commité 2026-05-11) — auto-deploy on profile config save
- **Trigger** : sauvegarde profil "KBC" (Kalon Breizh Cup) sur NLF, 17 vidéos × master+secondary variant = 34 deploys
- **Faille de design** :
  - `MAX_AUTO_DEPLOY = 10` était un cap PAR APPEL, pas global
  - `deployProfile` (oldConfig=null) + `updateProfileConfiguration` (diff) sont 2 chemins qui peuvent se déclencher en rafale
  - Pas de pause entre deploys → cadence 1-3s a saturé le Pi
- **Symptôme côté Pi** : CPU `neopro-app` ×10 (0.9% → 8.8%), RAM +14%, crash silencieux à 06:45:11 UTC
- **Symptôme observabilité cloud** : `last_seen_at` figé + alertes hourly absentes (07:34 et 08:34) + dashboard "Hors ligne"

## Fix appliqué

| Composant                                          | Changement                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `deploymentRepository.countActivePerSite(siteId)`  | Nouvelle méthode : compte les `pending\|in_progress` par site                                                                              |
| `deploymentService.triggerMissingVideoDeployments` | `MAX_AUTO_DEPLOY: 10 → 5` + `MAX_IN_FLIGHT_PER_SITE = 8` (cap global) + `INTER_DEPLOY_DELAY_MS = 1500` (sérialisation) + re-check mid-loop |
| `metricsService.recordAutoDeployThrottled`         | Nouvelle métrique Prometheus `neopro_auto_deploy_throttled_total{site_id,reason}`                                                          |
| Smoke test                                         | `smoke-adr-117-incident-2026-05-13.test.ts` — 10 assertions pour bloquer toute régression                                                  |

## Suivi à programmer

- [ ] Patcher `neopro-sync-guardian` pour qu'il surveille aussi `neopro-app` (trou de supervision révélé par l'incident — le Pi ne s'auto-relève pas si `neopro-app` crashe)
- [ ] Étendre le smoke test pour vérifier la présence du watchdog `neopro-app` dans `sync-guardian`
- [ ] Étudier la possibilité d'un signal "Pi unhealthy" côté cloud → suspendre auto-deploys quand `last_seen_at` > 5 min
