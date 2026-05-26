# Runbook OPS-04 — Incident Pi offline massif

> **Objectif** : triager + résoudre un scénario où ≥ 5 Pi (10% de la flotte) sont offline simultanément. Communiquer aux clients sans paniquer.
> **Pré-requis** : accès DB prod (psql), Railway dashboard, Grafana/Prometheus, Discord/Slack équipe.
> **Niveau de risque** : 🔴 critique — clients impactés, downtime visible.

---

## Détection

Tu sais qu'il y a un incident massif via :

- Alerte Prometheus `neopro_sites_offline_total > 5` (Alertmanager → email/Discord)
- Métrique Grafana `sites online` qui chute brutalement
- Plusieurs clients qui appellent / écrivent en quelques minutes
- Dashboard "Sites" qui passe massivement au rouge

⏱ **Déclencher le runbook si** ≥ 5 Pi offline depuis ≥ 5 minutes **ou** chute > 30% en < 10 minutes.

---

## Étape 1 — Triage (~3 min)

```bash
export PROD_DATABASE_URL='postgresql://...'

# Combien, depuis quand
psql "$PROD_DATABASE_URL" <<'SQL'
SELECT
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 minutes')   AS online_5m,
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '15 minutes')  AS online_15m,
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '1 hour')      AS online_1h,
  COUNT(*) FILTER (WHERE site_type = 'pi')                            AS total_pi
FROM sites WHERE site_type = 'pi';
SQL
```

```bash
# Quels sites, dernière version OTA, géographie
psql "$PROD_DATABASE_URL" <<'SQL'
SELECT
  s.id, s.name, s.last_seen,
  s.deployed_version,
  c.address_postal_code AS postal,
  c.address_city        AS city,
  EXTRACT(EPOCH FROM (NOW() - s.last_seen))::int AS offline_seconds
FROM sites s
LEFT JOIN clubs c ON c.id = s.club_id
WHERE s.site_type = 'pi'
  AND s.last_seen < NOW() - INTERVAL '5 minutes'
ORDER BY s.last_seen ASC
LIMIT 20;
SQL
```

---

## Étape 2 — Identifier le pattern (~2 min)

Décision tree :

| Pattern observé                               | Cause probable                | Aller à étape |
| --------------------------------------------- | ----------------------------- | ------------- |
| **100% flotte offline**                       | Cloud down (Railway, DNS, WS) | 3a            |
| **Cluster géographique** (même région/CP)     | Panne ISP / opérateur télécom | 3b            |
| **Cluster version** (même `deployed_version`) | OTA cassé sur cette version   | 3c            |
| **Aléatoire, sans pattern**                   | Bug WebSocket / sync-agent    | 3d            |
| **Heartbeats reçus mais "online" KO**         | Bug métrique / dashboard      | 3e            |

---

## Étape 3a — Cloud down

```bash
# Vérifier Railway
curl -fsS https://api.neopro.kalonpartners.bzh/live || echo "API DOWN"
gh run list --workflow=ci.yml --limit=3   # CI accessible?

# Vérifier Railway status global
open https://status.railway.app

# Vérifier DNS
dig api.neopro.kalonpartners.bzh +short
dig neopro-admin.kalonpartners.bzh +short
```

**Actions :**

- Si Railway down : attendre, communiquer aux clients (étape 5), ne rien toucher
- Si DNS cassé : ouvrir Cloudflare/Hostinger DNS, vérifier records A/CNAME
- Si API up mais Pi pas connectés : vérifier Socket.IO (port WebSocket bloqué ?)

---

## Étape 3b — Panne ISP / opérateur télécom

```bash
# Confirmer le cluster géo
psql "$PROD_DATABASE_URL" <<'SQL'
SELECT
  c.address_postal_code AS postal,
  COUNT(*) FILTER (WHERE s.last_seen < NOW() - INTERVAL '5 min') AS offline,
  COUNT(*) AS total
FROM sites s JOIN clubs c ON c.id = s.club_id
WHERE s.site_type = 'pi'
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE s.last_seen < NOW() - INTERVAL '5 min') > 0
ORDER BY offline DESC;
SQL
```

**Actions :**

- Vérifier https://downdetector.fr (Orange, Free, SFR, Bouygues)
- Communiquer aux clients du cluster (template étape 5)
- Pas d'action tech possible, attendre rétablissement ISP
- Surveiller le retour : `last_seen` qui se met à jour progressivement

---

## Étape 3c — OTA cassé (cluster version)

```bash
# Identifier la version coupable
psql "$PROD_DATABASE_URL" <<'SQL'
SELECT
  deployed_version,
  COUNT(*) FILTER (WHERE last_seen < NOW() - INTERVAL '5 min') AS offline,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE last_seen < NOW() - INTERVAL '5 min') / COUNT(*), 1) AS pct_offline
FROM sites WHERE site_type = 'pi'
GROUP BY deployed_version
ORDER BY pct_offline DESC;
SQL
```

**Actions :**

1. Si une version a > 50% offline → OTA cassé sur cette version
2. **Pause cohorte canary** : Dashboard → Déploiements → cohorte concernée → "Pause rollout"
3. **Rollback OTA** : suivre [OPS-01 étape 4](OPS-01-rollback-prod.md#étape-4--rollback-pi-ota)
4. Forcer reboot Pi via remote command :
   ```bash
   # Pour un site spécifique
   curl -X POST https://api.neopro.kalonpartners.bzh/api/sites/<SITE_ID>/remote-command \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"type":"reboot"}'
   ```
5. Attendre re-pull Pi au boot (~3-5 min). Vérifier `deployed_version` qui rebascule.

---

## Étape 3d — Aléatoire (bug WS / sync-agent)

```bash
# Vérifier les Socket.IO connections
curl -fsS https://api.neopro.kalonpartners.bzh/admin/socket-stats \
  -H "Authorization: Bearer $JWT_SUPER_ADMIN" | jq

# Logs Railway récents (Logtail ou Railway dashboard)
# Chercher : "ECONNRESET", "WebSocket closed", "sync-agent timeout"
```

**Actions :**

1. Vérifier mémoire / CPU API Railway (Grafana → `process_resident_memory_bytes`)
2. Si fuite mémoire suspectée : restart Railway service (workflow `railway-restart.yml` existe)
   ```bash
   gh workflow run railway-restart.yml
   ```
3. Si bug sync-agent : forcer reboot des Pi affectés (cf. 3c étape 4)
4. Ouvrir issue post-incident pour root cause (logs, stacks, version sync-agent)

---

## Étape 3e — Heartbeats OK mais dashboard KO

Faux positif côté monitoring. Vérifier :

- Le job qui calcule `online` dans le dashboard (cron ? requête live ?)
- La métrique Prometheus `neopro_sites_online_total` vs reality
- Les seuils d'alertes (peut-être 5 min trop strict pour une réseau 4G client)

**Pas de panique → corriger la métrique, pas le terrain.**

---

## Étape 4 — Forcer reboot flotte (last resort)

Si rien ne fonctionne et que les Pi ne récupèrent pas seuls :

```bash
# Reboot massif des Pi offline depuis > 15 min
psql "$PROD_DATABASE_URL" -t -A -c \
  "SELECT id FROM sites WHERE site_type='pi' AND last_seen < NOW() - INTERVAL '15 minutes'" \
  | while read SITE_ID; do
      [ -z "$SITE_ID" ] && continue
      echo "Reboot $SITE_ID..."
      curl -fsS -X POST "https://api.neopro.kalonpartners.bzh/api/sites/$SITE_ID/remote-command" \
        -H "Authorization: Bearer $JWT_SUPER_ADMIN" \
        -H "Content-Type: application/json" \
        -d '{"type":"reboot"}' &
      sleep 2  # éviter de saturer l'API
    done
wait
```

⚠️ Ne PAS faire ça sans avoir identifié la cause root. Un reboot en boucle ne résout rien si l'OTA est cassé.

---

## Étape 5 — Communication clients

### Template Discord/Slack équipe (interne)

```
🚨 INCIDENT — Pi offline massif
- Détection : <HH:MM>
- Sites impactés : <N>/50
- Cause probable : <ISP / OTA / Cloud>
- ETA résolution : <X min>
- Owner : Guillaume
- Issue : <lien>
Updates toutes les 15 min.
```

### Template email client (externe)

```
Objet : [MadXP] Information service en cours

Bonjour,

Nous détectons actuellement une coupure de service sur la TV MadXP
de votre club <NOM_CLUB>. Nos équipes sont mobilisées.

Cause identifiée : <ISP / coupure réseau / mise à jour technique>
Délai estimé de rétablissement : <X minutes / heures>

Aucune action n'est requise de votre part. Les playlists et
paramètres sont préservés ; le service reprendra automatiquement
au rétablissement.

Pour toute question : contact@neopro.fr

— Équipe MadXP
```

⚠️ Envoyer **uniquement** aux clients impactés (filtrer par `site_type='pi' AND last_seen < ...`). Pas à toute la base.

---

## Étape 6 — Post-incident (~30 min après résolution)

- [ ] Tous les Pi sont retournés online (`SELECT COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 min') = COUNT(*) FROM sites WHERE site_type='pi'`)
- [ ] Issue GitHub `incident` avec timeline complète
- [ ] Postmortem dans `docs/postmortems/YYYY-MM-DD-pi-offline-<short>.md` :
  - Détection (timestamp, source)
  - Root cause
  - Mitigation
  - Communication
  - Action items (smoke test, alerte additionnelle, etc.)
- [ ] Si OTA cassé : ADR léger expliquant la régression + smoke test
- [ ] Email récap clients impactés (transparence + crédit éventuel)
- [ ] Review métriques : MTTD, MTTR, % flotte impactée
- [ ] Entry dans `docs/runbooks/INCIDENT-LOG.md`

---

## Métriques cibles

- **MTTD** (mean time to detect) : < 5 min via Prometheus alerting
- **MTTR** (mean time to recovery) : < 30 min pour incidents OTA / cloud
- **MTTR ISP** : non maîtrisable, mais comm client < 30 min après détection
- **% flotte impactée par incident max** : < 20% (canary cohorte limite blast)

## Référence

- [OPS-01 — Rollback prod](OPS-01-rollback-prod.md) (rollback Pi étape 4)
- [TROUBLESHOOTING.md](../guides/TROUBLESHOOTING.md)
- Workflow restart : `.github/workflows/railway-restart.yml`
- Métriques flotte : Grafana board `neopro-fleet-overview`
