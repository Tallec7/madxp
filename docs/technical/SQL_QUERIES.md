# Requêtes SQL Utiles - Neopro

> Requêtes SQL courantes pour le debugging, monitoring et analytics.

## Sites et Métriques

### Sites avec métriques récentes

```sql
-- Sites avec leur dernière métrique (< 5 min = online)
SELECT
  s.id,
  s.site_name,
  s.club_name,
  s.status,
  s.last_seen_at,
  m.cpu_usage,
  m.memory_usage,
  m.temperature,
  CASE
    WHEN s.last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
    ELSE 'offline'
  END AS real_status
FROM sites s
LEFT JOIN LATERAL (
  SELECT * FROM metrics
  WHERE site_id = s.id
  ORDER BY recorded_at DESC
  LIMIT 1
) m ON true
ORDER BY s.last_seen_at DESC NULLS LAST;
```

### Santé de la flotte

```sql
-- Vue globale de la flotte avec alertes
SELECT
  COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '5 min') as online,
  COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '5 min'
                      OR last_seen_at IS NULL) as offline,
  COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance,
  COUNT(*) FILTER (WHERE status = 'error') as error,
  (
    SELECT COUNT(DISTINCT site_id)
    FROM metrics
    WHERE recorded_at > NOW() - INTERVAL '1 hour'
      AND temperature > 70
  ) as overheating,
  (
    SELECT COUNT(DISTINCT site_id)
    FROM metrics
    WHERE recorded_at > NOW() - INTERVAL '1 hour'
      AND disk_usage > 90
  ) as disk_critical
FROM sites;
```

---

## Analytics

### Top vidéos par club

```sql
-- Top 10 vidéos les plus jouées par site sur 30 jours
SELECT
  s.club_name,
  vp.video_filename,
  COUNT(*) as play_count,
  SUM(CASE WHEN vp.completed THEN 1 ELSE 0 END) as completed_count,
  ROUND(AVG(vp.duration_played)::numeric, 1) as avg_watch_seconds
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
WHERE vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY s.club_name, vp.video_filename
ORDER BY s.club_name, play_count DESC;
```

### Advertiser ROI

```sql
-- Stats impressions par annonceur sur 30 jours
SELECT
  a.name as advertiser,
  COUNT(DISTINCT av.video_id) as videos_count,
  COUNT(DISTINCT vp.site_id) as sites_reached,
  COUNT(vp.id) as total_impressions,
  SUM(vp.duration_played) / 3600.0 as hours_watched,
  ROUND(
    COUNT(vp.id)::numeric / NULLIF(COUNT(DISTINCT vp.site_id), 0),
    1
  ) as avg_impressions_per_site
FROM advertisers a
JOIN advertiser_videos av ON av.advertiser_id = a.id
JOIN videos v ON v.id = av.video_id
LEFT JOIN video_plays vp ON vp.video_filename = v.filename
  AND vp.played_at > NOW() - INTERVAL '30 days'
GROUP BY a.id, a.name
ORDER BY total_impressions DESC;
```

---

## Déploiements

### Déploiements en échec à retry

```sql
-- Déploiements failed récents avec infos pour debug
SELECT
  cd.id,
  cd.status,
  cd.error_message,
  cd.progress,
  cd.created_at,
  v.filename as video,
  CASE cd.target_type
    WHEN 'site' THEN (SELECT site_name FROM sites WHERE id = cd.target_id)
    WHEN 'group' THEN (SELECT name FROM groups WHERE id = cd.target_id)
  END as target_name,
  u.email as deployed_by
FROM content_deployments cd
JOIN videos v ON v.id = cd.video_id
LEFT JOIN users u ON u.id = cd.deployed_by
WHERE cd.status = 'failed'
  AND cd.created_at > NOW() - INTERVAL '24 hours'
ORDER BY cd.created_at DESC;
```

### Reset déploiements bloqués

```sql
-- Vérifier les déploiements en cours
SELECT id, status, progress, error_message
FROM content_deployments
WHERE status = 'in_progress';

-- Reset si bloqué (> 1 heure)
UPDATE content_deployments SET status = 'failed'
WHERE status = 'in_progress' AND started_at < NOW() - INTERVAL '1 hour';
```

---

## Configuration

### Config diff entre deux versions

```sql
-- Comparer deux versions de config d'un site
WITH versions AS (
  SELECT
    id,
    configuration,
    deployed_at,
    ROW_NUMBER() OVER (ORDER BY deployed_at DESC) as rn
  FROM config_history
  WHERE site_id = 'UUID_DU_SITE'
)
SELECT
  v1.deployed_at as current_date,
  v2.deployed_at as previous_date,
  jsonb_diff(v2.configuration, v1.configuration) as changes
FROM versions v1
JOIN versions v2 ON v2.rn = v1.rn + 1
WHERE v1.rn = 1;
```

---

## Utilisateurs et Auth

### Reset MFA pour un user

```sql
UPDATE users SET
  mfa_enabled = false,
  mfa_secret = NULL,
  mfa_backup_codes = NULL
WHERE email = 'user@example.com';
```

### Lister les users par rôle

```sql
SELECT
  role,
  COUNT(*) as count,
  array_agg(email ORDER BY created_at DESC) as emails
FROM users
GROUP BY role
ORDER BY count DESC;
```
