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

**Agrégation CRON obligatoire** : `video_plays` est purgée après 15 jours. Les fonctions PG `calculate_all_daily_stats()`, `calculate_all_advertiser_daily_stats()` et `calculate_site_sponsor_daily_stats()` agrègent les données de J-1 vers les tables permanentes. `alerting.service.ts` alerte si l'agrégation n'a pas tourné depuis >36h (`aggregation_stale` critique). Les requêtes sponsor `getStatsSummary`, `getDailyTrends`, `getBenchmark` lisent `site_sponsor_daily_stats` (pas `video_plays`).

## Règles

- **JAMAIS** modifier les migrations déjà en production
- **JAMAIS** changer le format des api_key des sites
- Toujours utiliser `npm run db:migrate` pour les changements
- Requêtes SQL paramétrées uniquement : `query('...WHERE id = $1', [id])`

## NE JAMAIS FAIRE (smoke test enforced)

- Utiliser `GROUP BY vp.column` quand le SELECT utilise `COALESCE(NULLIF(TRIM(vp.column), ''), 'default')` (le GROUP BY brut ne coalese pas les variantes vide/null/whitespace → lignes dupliquées — toujours aligner le GROUP BY sur l'expression COALESCE du SELECT)
- Retirer `uploaded_for_site_id` du SELECT de `findVideoById()` dans `video.repository.ts` (le guard ownership club compare ce champ — sans lui, guard rejette TOUTES les suppressions club avec 403)
- Supprimer `setTypeParser(20, ...)` de `database.ts` (PostgreSQL BIGINT OID 20 est retourné comme string par `pg` — sans ce parser, `file_size` et `duration` arrivent comme string au frontend)
- Retirer `site_type` du SELECT de `findWithLocalContent()` dans `site.repository.ts` (le filtre club SaaS en a besoin pour décider de fallback sur `config_profiles`)
