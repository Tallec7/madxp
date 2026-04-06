---
paths:
  - 'central-server/src/config/database*'
  - 'central-server/src/scripts/**'
  - 'central-server/src/middleware/rls*'
---

# Base de Données

Schéma complet : `central-server/src/scripts/full-schema.sql`

## Tables principales

```
users → id, email (UNIQUE), password_hash, role, full_name, advertiser_id?, agency_id?
sites → id, site_name, club_name, status, api_key (UNIQUE), last_seen_at, local_config_mirror (JSONB)
videos → id, filename, category, storage_path, checksum (SHA256), uploaded_for_site_id?
content_deployments → video → site/group, status, progress
config_drafts → site_id (UNIQUE), configuration (JSONB), referenced_video_ids
config_history → site_id, configuration (JSONB), previous_version_id
club_sessions / video_plays / club_daily_stats → Analytics
advertisers / advertiser_videos / advertiser_sites / advertiser_impressions → Pub
agencies / agency_sites → Multi-agence
subscription_suspension_reasons / subscription_history → Abonnements
alerts / alert_thresholds → Alertes
```

## Row-Level Security (Multi-tenant)

```typescript
await query(`SELECT set_config('app.user_role', $1, false)`, [role]);
```

## Rétention des données

| Table                               | Rétention       |
| ----------------------------------- | --------------- |
| video_plays, advertiser_impressions | 15 jours        |
| metrics                             | 3 jours         |
| config_history                      | 5 versions/site |
| remote_commands                     | 7 jours         |
| alerts, audit_logs                  | 30 jours        |

Tables préservées indéfiniment : `club_daily_stats`, `site_sponsor_daily_stats`

## Règles

- **JAMAIS** modifier les migrations déjà en production
- **JAMAIS** changer le format des api_key des sites
- Toujours utiliser `npm run db:migrate` pour les changements
- Requêtes SQL paramétrées uniquement : `query('...WHERE id = $1', [id])`
