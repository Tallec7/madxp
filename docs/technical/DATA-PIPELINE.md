# Data Pipeline : Pi → Central Server → Dashboard

> Chemin complet des données analytics, de la lecture vidéo sur le Pi jusqu'à l'affichage dashboard.

## 1. Collecte (Raspberry Pi)

```
tv.component.ts  →  AnalyticsService  →  BufferService  →  analytics_buffer.json
                     (VideoPlayEvent)     (flush 5min)       (max 50K events)
```

- `tv.component.ts` émet un `VideoPlayEvent` (~20 champs) à chaque fin de lecture vidéo
- `AnalyticsService` enrichit avec `video_id`, `advertiser_id`, `category` (si metadata présente)
- `BufferService` accumule en mémoire puis persiste dans `analytics_buffer.json`
- Le fichier buffer survit aux redémarrages du process

## 2. Sync (Sync-Agent → Central Server)

```
analytics_buffer.json  →  AnalyticsCollector  →  POST /api/analytics/video-plays
                            (batch 100, 5min)       (bulk insert)
```

- Le sync-agent lit le buffer toutes les 5 minutes
- Envoi par batch de 100 events max
- Retry 3× avec backoff exponentiel
- **Deux endpoints d'ingestion** (héritage historique) :
  - `POST /api/analytics/video-plays` — toutes les catégories → table `video_plays`
  - `POST /api/analytics/impressions` — sponsor uniquement → table `video_plays` (même table)
- Dedup : `ON CONFLICT (site_id, played_at, video_filename) DO NOTHING`
- FK manquantes (`video_id`, `sponsor_id`) : nullifiées silencieusement (pas de rejet)

## 3. Stockage (PostgreSQL)

### Table source de vérité : `video_plays`

19+ colonnes : `site_id`, `video_id`, `video_filename`, `category`, `trigger_type`, `period`, `event_type`, `duration_played`, `video_duration`, `completed`, `audience_estimate`, `played_at`, etc.

### Tables agrégées (CRON J-1)

| Table                    | Granularité         | Agrégé depuis                            |
| ------------------------ | ------------------- | ---------------------------------------- |
| `club_daily_stats`       | site × date         | `video_plays` (toutes catégories)        |
| `advertiser_daily_stats` | video × site × date | `video_plays` WHERE category = 'sponsor' |

- CRON quotidien à 2h00 / 2h30 (`recurring_schedules`, `is_active = true`)
- Agrège **uniquement J-1** (hier)

### VIEWs live (historique + aujourd'hui)

| VIEW                          | Combine                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `club_daily_stats_live`       | `club_daily_stats` (< aujourd'hui) UNION ALL agrégation live `video_plays` (aujourd'hui)               |
| `advertiser_daily_stats_live` | `advertiser_daily_stats` (< aujourd'hui) UNION ALL agrégation live `video_plays` sponsor (aujourd'hui) |

Ces VIEWs sont transparentes : même colonnes que les tables agrégées, mais incluent les données du jour en temps réel.

## 4. Consommation (Dashboard)

### Pages qui utilisent `video_plays` directement (données complètes)

| Page                 | Source                    |
| -------------------- | ------------------------- |
| Club Analytics       | `video_plays`             |
| Fleet Overview       | `video_plays`             |
| Realtime Dashboard   | `video_plays` + Socket.IO |
| Advertiser Analytics | `video_plays`             |
| KPIs & Network Stats | `video_plays`             |
| Traction Metrics     | `video_plays`             |

### Pages qui utilisent les VIEWs live

| Page                            | VIEW                          |
| ------------------------------- | ----------------------------- |
| Comparaison multi-sites         | `club_daily_stats_live`       |
| Portail annonceur (11 méthodes) | `advertiser_daily_stats_live` |

## 5. Schéma global

```
┌─────────────────────────────────────────────────────────────────────────┐
│ RASPBERRY PI                                                            │
│                                                                         │
│  tv.component.ts → AnalyticsService → BufferService → buffer.json      │
│                                                                         │
│  Sync-Agent (5min, batch 100)                                           │
│       ↓                                                                 │
│  POST /api/analytics/video-plays                                        │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CENTRAL SERVER (Express)                                                │
│                                                                         │
│  analytics.controller.ts → analyticsRepository.bulkInsertVideoPlays()  │
│       ↓                                                                 │
│  PostgreSQL : video_plays (source de vérité)                            │
│       ↓                                                                 │
│  CRON 2h00 → club_daily_stats (J-1)                                     │
│  CRON 2h30 → advertiser_daily_stats (J-1)                               │
│       ↓                                                                 │
│  VIEWs : club_daily_stats_live = historique + live aujourd'hui          │
│          advertiser_daily_stats_live = historique + live aujourd'hui     │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ DASHBOARD (Angular)                                                     │
│                                                                         │
│  Club Analytics, Fleet, KPIs ──→ video_plays (temps réel)              │
│  Comparaison multi-sites     ──→ club_daily_stats_live                  │
│  Portail annonceur           ──→ advertiser_daily_stats_live            │
│  Realtime Dashboard          ──→ video_plays + Socket.IO               │
└─────────────────────────────────────────────────────────────────────────┘
```

## 6. Points d'attention

1. **Dual ingestion** : Les endpoints `/video-plays` et `/impressions` écrivent tous deux dans `video_plays`. Le dedup empêche les doublons, mais c'est un vestige à unifier à terme.

2. **FK nullification** : Si `video_id` ou `sponsor_id` n'existe pas en base, le champ est mis à NULL au lieu de rejeter le batch. Les analytics de base (comptage, durée) sont préservées, seul le lien sponsor est perdu.

3. **Metadata enrichment** : Le Pi doit recevoir `enrichConfigWithAnalyticsMetadata()` avant déploiement pour que `video_id`/`advertiser_id`/`analytics_category` soient présents dans les events. Sans enrichissement, `detectCategory()` tombe en fallback path-based.
