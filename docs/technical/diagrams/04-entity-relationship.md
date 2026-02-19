# Diagramme Entités-Relations (ERD)

> Vue complète du schéma de base de données Neopro — 30+ tables organisées par domaine métier.

## Vue d'ensemble des domaines

```mermaid
graph TB
    subgraph CORE["🏢 Core"]
        users["users"]
        sites["sites"]
        groups["groups"]
        site_groups["site_groups"]
    end

    subgraph CONTENT["🎬 Contenu"]
        videos["videos"]
        content_deployments["content_deployments"]
        orchestrated_deployments["orchestrated_deployments"]
        config_history["config_history"]
        config_drafts["config_drafts"]
    end

    subgraph ANALYTICS["📊 Analytics"]
        club_sessions["club_sessions"]
        video_plays["video_plays"]
        club_daily_stats["club_daily_stats"]
        club_objectives["club_objectives"]
        club_objectives_progress["club_objectives_progress"]
    end

    subgraph ADVERTISERS["📢 Annonceurs"]
        advertisers["advertisers"]
        agencies["agencies"]
        advertiser_videos["advertiser_videos"]
        advertiser_sites["advertiser_sites"]
        advertiser_impressions["advertiser_impressions"]
        advertiser_daily_stats["advertiser_daily_stats"]
    end

    subgraph OPS["⚙️ Opérations"]
        metrics["metrics"]
        alerts["alerts"]
        remote_commands["remote_commands"]
        pending_commands["pending_commands"]
        software_updates["software_updates"]
        update_deployments["update_deployments"]
    end

    subgraph AUTH["🔐 Auth & Audit"]
        password_reset_tokens["password_reset_tokens"]
        audit_logs["audit_logs"]
    end

    subgraph SUBSCRIPTIONS["💳 Abonnements"]
        subscription_history["subscription_history"]
        subscription_suspension_reasons["subscription_suspension_reasons"]
    end

    subgraph REPORTING["📄 Rapports"]
        generated_reports["generated_reports"]
        report_schedules["report_schedules"]
        proof_of_broadcasts["proof_of_broadcasts"]
    end

    sites --> CONTENT
    sites --> ANALYTICS
    sites --> OPS
    sites --> ADVERTISERS
    users --> AUTH
    sites --> SUBSCRIPTIONS
    sites --> REPORTING
```

---

## 1. Domaine Core — Utilisateurs & Sites

```mermaid
erDiagram
    users {
        UUID id PK
        VARCHAR email UK
        VARCHAR password_hash
        VARCHAR full_name
        VARCHAR role "admin|operator|viewer|super_admin|advertiser|agency"
        TIMESTAMP last_login_at
        UUID advertiser_id FK
        UUID agency_id FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    sites {
        UUID id PK
        VARCHAR site_name
        VARCHAR club_name
        JSONB location "city, region, country"
        JSONB sports
        VARCHAR status "online|offline|maintenance|error"
        TIMESTAMP last_seen_at
        VARCHAR last_ip
        VARCHAR local_ip
        VARCHAR software_version
        VARCHAR hardware_model
        VARCHAR api_key UK
        JSONB local_config_mirror
        VARCHAR local_config_hash
        VARCHAR subscription_plan "trial|standard|premium"
        DATE subscription_start
        DATE subscription_end
        BOOLEAN suspended
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    groups {
        UUID id PK
        VARCHAR name
        TEXT description
        VARCHAR type "sport|geography|version|custom"
        JSONB filters
        TIMESTAMP created_at
    }

    site_groups {
        UUID site_id FK
        UUID group_id FK
        TIMESTAMP added_at
    }

    users ||--o| advertisers : "advertiser_id"
    users ||--o| agencies : "agency_id"
    sites ||--o{ site_groups : "site_id"
    groups ||--o{ site_groups : "group_id"
```

---

## 2. Domaine Contenu — Vidéos & Déploiements

```mermaid
erDiagram
    videos {
        UUID id PK
        VARCHAR filename
        VARCHAR original_name
        VARCHAR category
        VARCHAR subcategory
        BIGINT file_size
        INT duration
        VARCHAR storage_path
        VARCHAR storage_backend "ftp|supabase"
        VARCHAR thumbnail_url
        VARCHAR checksum "SHA256"
        VARCHAR upload_status "ready|pending"
        JSONB metadata
        UUID uploaded_by FK
        UUID uploaded_for_site_id FK
        TIMESTAMP created_at
    }

    content_deployments {
        UUID id PK
        UUID video_id FK
        VARCHAR target_type "site|group"
        VARCHAR target_id
        VARCHAR status "pending|in_progress|completed|failed|cancelled"
        INT progress "0-100"
        TEXT error_message
        UUID deployed_by FK
        UUID orchestrated_deployment_id FK
        TIMESTAMP created_at
        TIMESTAMP started_at
        TIMESTAMP completed_at
    }

    config_history {
        UUID id PK
        UUID site_id FK
        JSONB configuration
        UUID deployed_by FK
        TIMESTAMP deployed_at
        TEXT comment
        UUID previous_version_id FK "self-referencing"
        JSONB changes_summary
    }

    config_drafts {
        UUID id PK
        UUID site_id FK "unique"
        VARCHAR name
        JSONB configuration
        UUID_ARRAY referenced_video_ids
        VARCHAR status "draft|deploying|deployed|failed"
        UUID created_by FK
        TIMESTAMP created_at
    }

    orchestrated_deployments {
        UUID id PK
        UUID site_id FK
        UUID draft_id FK
        VARCHAR status "pending|deploying_videos|deploying_config|completed|partial_failure|failed"
        INT total_videos
        INT videos_completed
        INT videos_failed
        BOOLEAN config_deployed
        UUID started_by FK
        TIMESTAMP started_at
        TIMESTAMP completed_at
    }

    videos ||--o{ content_deployments : "video_id"
    users ||--o{ content_deployments : "deployed_by"
    users ||--o{ videos : "uploaded_by"
    sites ||--o| videos : "uploaded_for_site_id"
    sites ||--o{ config_history : "site_id"
    sites ||--o| config_drafts : "site_id (unique)"
    sites ||--o{ orchestrated_deployments : "site_id"
    config_drafts ||--o{ orchestrated_deployments : "draft_id"
    orchestrated_deployments ||--o{ content_deployments : "orchestrated_deployment_id"
    config_history ||--o| config_history : "previous_version_id"
```

---

## 3. Domaine Analytics — Sessions & Lectures

```mermaid
erDiagram
    club_sessions {
        UUID id PK
        UUID site_id FK
        TIMESTAMP started_at
        TIMESTAMP ended_at
        INT duration_seconds
        INT videos_played
        INT manual_triggers
        INT auto_plays
    }

    video_plays {
        UUID id PK
        UUID site_id FK
        UUID session_id FK
        VARCHAR video_filename
        VARCHAR category
        TIMESTAMP played_at
        INT duration_played
        INT video_duration
        BOOLEAN completed
        VARCHAR trigger_type "auto|manual"
        UUID video_id FK
        UUID sponsor_id FK "→ advertisers"
        VARCHAR tv_status "on|standby|disconnected|unknown"
    }

    club_daily_stats {
        UUID id PK
        UUID site_id FK
        DATE date
        INT sessions_count
        INT screen_time_seconds
        INT videos_played
        INT sponsor_plays
        INT jingle_plays
        INT ambiance_plays
        DECIMAL avg_cpu
        DECIMAL avg_temperature
        DECIMAL uptime_percent
        TIMESTAMP calculated_at
    }

    club_objectives {
        UUID id PK
        UUID site_id FK
        VARCHAR name
        VARCHAR metric_type "screen_time|videos_played|sessions_count|..."
        NUMERIC target_value
        NUMERIC at_risk_threshold
        VARCHAR target_period "daily|weekly|monthly"
        VARCHAR status "active|paused|completed|cancelled"
        VARCHAR priority "low|medium|high|critical"
        UUID created_by FK
    }

    club_objectives_progress {
        UUID id PK
        UUID objective_id FK
        DATE period_start
        DATE period_end
        NUMERIC current_value
        NUMERIC target_value
        NUMERIC progress_percent "GENERATED"
        VARCHAR status "in_progress|on_track|at_risk|achieved|missed"
    }

    sites ||--o{ club_sessions : "site_id"
    sites ||--o{ video_plays : "site_id"
    sites ||--o{ club_daily_stats : "site_id (unique par date)"
    sites ||--o{ club_objectives : "site_id"
    club_sessions ||--o{ video_plays : "session_id"
    club_objectives ||--o{ club_objectives_progress : "objective_id"
```

---

## 4. Domaine Annonceurs — Advertisers & Agencies

```mermaid
erDiagram
    agencies {
        UUID id PK
        VARCHAR name
        VARCHAR contact_email
        VARCHAR company_name
        VARCHAR status "active|inactive|pending"
        TEXT notes
    }

    advertisers {
        UUID id PK
        VARCHAR name
        VARCHAR contact_email
        VARCHAR company_name
        UUID agency_id FK
        VARCHAR status "active|inactive|pending"
        TEXT notes
    }

    advertiser_videos {
        UUID advertiser_id FK
        UUID video_id FK
        TIMESTAMP added_at
    }

    advertiser_sites {
        UUID advertiser_id FK
        UUID site_id FK
        TIMESTAMP assigned_at
    }

    agency_sites {
        UUID agency_id FK
        UUID site_id FK
        TIMESTAMP assigned_at
    }

    advertiser_impressions {
        UUID id PK
        UUID site_id FK
        UUID advertiser_id FK
        UUID video_id FK
        VARCHAR video_filename
        TIMESTAMP played_at
        INT duration_played
    }

    advertiser_daily_stats {
        UUID id PK
        DATE date
        UUID advertiser_id FK
        UUID site_id FK
        INT impressions_count
        INT total_duration
        INT unique_videos
    }

    agencies ||--o{ advertisers : "agency_id"
    advertisers ||--o{ advertiser_videos : "advertiser_id"
    videos ||--o{ advertiser_videos : "video_id"
    advertisers ||--o{ advertiser_sites : "advertiser_id"
    sites ||--o{ advertiser_sites : "site_id"
    agencies ||--o{ agency_sites : "agency_id"
    sites ||--o{ agency_sites : "site_id"
    sites ||--o{ advertiser_impressions : "site_id"
    advertisers ||--o{ advertiser_impressions : "advertiser_id"
    advertisers ||--o{ advertiser_daily_stats : "advertiser_id"
    sites ||--o{ advertiser_daily_stats : "site_id"
```

---

## 5. Domaine Opérations — Métriques, Alertes, Commandes

```mermaid
erDiagram
    metrics {
        UUID id PK
        UUID site_id FK
        FLOAT cpu_usage
        FLOAT memory_usage
        FLOAT temperature
        FLOAT disk_usage
        BIGINT uptime
        JSONB network_status
        TIMESTAMP recorded_at
    }

    alerts {
        UUID id PK
        UUID site_id FK
        VARCHAR alert_type
        VARCHAR severity "info|warning|critical"
        TEXT message
        JSONB metadata
        VARCHAR status "active|acknowledged|resolved"
        TIMESTAMP created_at
        TIMESTAMP resolved_at
    }

    remote_commands {
        UUID id PK
        UUID site_id FK
        VARCHAR command_type
        JSONB command_data
        VARCHAR status "pending|executing|completed|failed|timeout"
        JSONB result
        UUID executed_by FK
        UUID pending_command_id FK
        TIMESTAMP executed_at
    }

    pending_commands {
        UUID id PK
        UUID site_id FK
        VARCHAR command_type
        JSONB command_data
        INT priority "1-10"
        UUID created_by FK
        TIMESTAMP expires_at
        INT attempts
        INT max_attempts
    }

    software_updates {
        UUID id PK
        VARCHAR version UK
        TEXT description
        TEXT changelog
        BOOLEAN is_critical
        VARCHAR package_url
        BIGINT package_size
        VARCHAR checksum
        UUID uploaded_by FK
    }

    update_deployments {
        UUID id PK
        UUID update_id FK
        VARCHAR target_type "site|group"
        VARCHAR target_id
        VARCHAR status "pending|in_progress|completed|failed|rolled_back"
        INT progress "0-100"
        VARCHAR backup_path
        UUID deployed_by FK
    }

    sites ||--o{ metrics : "site_id"
    sites ||--o{ alerts : "site_id"
    sites ||--o{ remote_commands : "site_id"
    sites ||--o{ pending_commands : "site_id"
    users ||--o{ remote_commands : "executed_by"
    users ||--o{ pending_commands : "created_by"
    pending_commands ||--o| remote_commands : "pending_command_id"
    software_updates ||--o{ update_deployments : "update_id"
    users ||--o{ software_updates : "uploaded_by"
    users ||--o{ update_deployments : "deployed_by"
```

---

## 6. Domaine Abonnements & Audit

```mermaid
erDiagram
    subscription_suspension_reasons {
        VARCHAR code PK
        VARCHAR label
        TEXT description
        BOOLEAN auto_unblock
        TEXT message_remote
        TEXT message_tv
        VARCHAR severity "warning|error"
    }

    subscription_history {
        UUID id PK
        UUID site_id FK
        VARCHAR action "activated|renewed|suspended|reactivated|expired|plan_changed"
        VARCHAR reason FK "→ suspension_reasons.code"
        DATE previous_end_date
        DATE new_end_date
        VARCHAR previous_plan
        VARCHAR new_plan
        TEXT note
        UUID performed_by FK
    }

    audit_logs {
        UUID id PK
        UUID user_id FK
        VARCHAR action
        VARCHAR entity_type
        UUID entity_id
        JSONB details
        VARCHAR ip_address
        TEXT user_agent
        TIMESTAMP created_at
    }

    password_reset_tokens {
        UUID id PK
        UUID user_id FK
        VARCHAR token UK
        TIMESTAMP expires_at
        TIMESTAMP used_at
    }

    generated_reports {
        UUID id PK
        VARCHAR report_type "club|advertiser|fleet"
        UUID site_id FK
        UUID advertiser_id FK
        DATE period_start
        DATE period_end
        VARCHAR storage_path
        VARCHAR storage_url
        JSONB summary_data
        VARCHAR status "pending|generating|completed|failed"
    }

    proof_of_broadcasts {
        UUID id PK
        UUID site_id FK
        VARCHAR screenshot_url
        VARCHAR storage_path
        TIMESTAMP timestamp_captured
        VARCHAR triggered_by "manual|scheduled|command"
        JSONB metadata
    }

    sites ||--o{ subscription_history : "site_id"
    subscription_suspension_reasons ||--o{ subscription_history : "reason"
    users ||--o{ subscription_history : "performed_by"
    users ||--o{ audit_logs : "user_id"
    users ||--o{ password_reset_tokens : "user_id"
    sites ||--o{ generated_reports : "site_id"
    advertisers ||--o{ generated_reports : "advertiser_id"
    sites ||--o{ proof_of_broadcasts : "site_id"
```

---

## Résumé des relations clés

| Table centrale  | Relations sortantes | Description                                       |
| --------------- | ------------------- | ------------------------------------------------- |
| **sites**       | 20+ FK entrantes    | Hub principal — chaque boîtier Pi = 1 site        |
| **users**       | 10+ FK entrantes    | Tous les acteurs (admin, operator, advertiser...) |
| **videos**      | 4 FK entrantes      | Bibliothèque de contenu partagée                  |
| **advertisers** | 6 FK entrantes      | Annonceurs avec vidéos, sites, impressions        |
| **agencies**    | 3 FK entrantes      | Regroupent plusieurs annonceurs                   |

---

## Index critiques pour les performances

| Index                           | Table               | Colonnes               | Usage                       |
| ------------------------------- | ------------------- | ---------------------- | --------------------------- |
| `idx_metrics_site_time`         | metrics             | (site_id, recorded_at) | Dashboard temps réel        |
| `idx_video_plays_site`          | video_plays         | (site_id)              | Analytics par site          |
| `idx_video_plays_date`          | video_plays         | (played_at)            | Analytics par période       |
| `idx_deployments_status`        | content_deployments | (status)               | File d'attente déploiements |
| `idx_alerts_status`             | alerts              | (status)               | Alertes actives             |
| `idx_pending_commands_priority` | pending_commands    | (priority)             | Queue de commandes          |
| `idx_club_daily_stats_site`     | club_daily_stats    | (site_id, date)        | Stats journalières          |

---

_Dernière mise à jour : 10 février 2026_
