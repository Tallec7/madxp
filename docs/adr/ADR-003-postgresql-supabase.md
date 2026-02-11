# ADR-003: PostgreSQL avec Supabase

**Date** : Octobre 2024
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Neopro nécessite une base de données pour stocker :

1. **Données transactionnelles** : Utilisateurs, sites, vidéos, déploiements
2. **Données analytiques** : Impressions sponsors, lectures vidéos
3. **Configuration** : États des sites, historique de configuration

Contraintes :
- Multi-tenant (isolation des données par rôle)
- Haute disponibilité (service 24/7)
- Budget limité (startup)
- Compétences équipe : SQL/PostgreSQL

## Décision

Utiliser **PostgreSQL** hébergé sur **Supabase** avec :

- Row-Level Security (RLS) pour le multi-tenant
- Connection pooling (PgBouncer)
- Backups automatiques

```sql
-- Exemple RLS pour isolation multi-tenant
CREATE POLICY sites_by_role ON sites
  FOR SELECT
  USING (
    current_setting('app.user_role') = 'super_admin'
    OR id = ANY(get_user_site_ids(current_setting('app.user_id')::uuid))
  );
```

## Alternatives Considérées

### 1. MongoDB

**Avantages** :
- Schéma flexible (configuration JSON)
- Horizontal scaling natif

**Inconvénients** :
- Pas de RLS natif
- Transactions ACID limitées
- Courbe d'apprentissage équipe

**Verdict** : Rejeté - Le multi-tenant est critique, RLS PostgreSQL est supérieur.

### 2. MySQL

**Avantages** :
- Familier pour l'équipe
- Large écosystème

**Inconvénients** :
- Pas de RLS natif
- JSONB moins performant
- Moins d'extensions (pas de PostGIS si besoin)

**Verdict** : Rejeté - PostgreSQL offre RLS natif.

### 3. Firebase Firestore

**Avantages** :
- Temps réel natif
- Scaling automatique
- Règles de sécurité déclaratives

**Inconvénients** :
- Vendor lock-in Google
- Coûts imprévisibles à l'échelle
- Requêtes complexes difficiles

**Verdict** : Rejeté - Coûts et flexibilité insuffisants.

### 4. PostgreSQL + Supabase ✅

**Avantages** :
- RLS natif pour multi-tenant
- JSONB performant (config, metadata)
- Supabase Auth intégré (optionnel)
- Tier gratuit généreux
- Connection pooling (PgBouncer)
- Backups automatiques

**Inconvénients** :
- Dépendance Supabase (mitigé : export PostgreSQL standard)
- Latence US/EU selon région

**Verdict** : Accepté - Meilleur rapport fonctionnalités/coût.

### 5. Self-hosted PostgreSQL

**Avantages** :
- Contrôle total
- Pas de vendor lock-in

**Inconvénients** :
- DevOps à gérer (backups, upgrades, HA)
- Coût infra + temps équipe

**Verdict** : Rejeté - Ressources insuffisantes pour maintenir.

## Conséquences

### Positives

1. **Sécurité** : RLS garantit l'isolation des données
2. **Performance** : Connection pooling (5 connexions suffisent)
3. **Coût** : Tier gratuit pour le développement
4. **Flexibilité** : JSONB pour les configs variables

### Négatives

1. **Dépendance** : Supabase (mitigé : export PostgreSQL standard possible)
2. **Latence** : Région EU disponible mais légèrement plus lente

### Configuration Optimisée

```typescript
// database.ts - Optimisé pour Railway Hobby plan
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,                    // Pool réduit (Railway 512MB)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});
```

## Schéma Clé

```sql
-- Tables principales
users (id, email, password_hash, role, advertiser_id?, agency_id?)
sites (id, site_name, api_key UNIQUE, status, local_config_mirror JSONB)
videos (id, filename, storage_path, category, checksum SHA256)
content_deployments (id, video_id, target_type, target_id, status, progress)

-- Analytics
video_plays (id, site_id, video_filename, played_at)
sponsor_impressions (id, site_id, sponsor_id, viewed_at, duration)
club_daily_stats (site_id, date, total_videos, total_impressions) -- Agrégation
```

---

## Évolutions (2025-2026)

### Contraintes mémoire Railway Hobby plan (v2.11)

Le pool de connexions a été réduit de 20 à **5 connexions** pour tenir dans les 512MB de RAM de Railway Hobby plan. Voir ADR-015 pour les détails.

Optimisations associées :
- Pending commands Socket.IO : 500 → 100
- Logs Winston : 10MB×5 → 2MB×2
- Seuils mémoire : warning 88%, critical 93%, emergency 97%

### Politique de rétention des données (v2.16)

La croissance non contrôlée de la DB a nécessité une politique de cleanup automatique :

| Table | Rétention | Justification |
|-------|-----------|---------------|
| `video_plays` | 90 jours | `club_daily_stats` conserve l'historique long terme |
| `advertiser_impressions` | 90 jours | `advertiser_daily_stats` conserve l'agrégation |
| `metrics` | 7 jours | Debug court terme (CPU, RAM, temp) |
| `config_history` | 20 versions/site | Rollback réaliste |
| `remote_commands` | 30 jours | Historique debug |
| `alerts`, `audit_logs` | 90 jours | Conformité/audit |

**Tables préservées indéfiniment** (agrégations pré-calculées) :
- `club_daily_stats`, `advertiser_daily_stats`

Jobs cron quotidiens à 3h du matin via `cron-scheduler.service.ts`.

### Nouvelles tables majeures (v2.27 → v3.0)

| Table | Version | Usage |
|-------|---------|-------|
| `config_drafts` | v2.27 | Brouillons de configuration (1 par site, UNIQUE) |
| `orchestrated_deployments` | v2.27 | Suivi déploiements vidéos + config |
| `subscription_suspension_reasons` | v2.47 | Motifs de suspension avec messages TV/Remote |
| `subscription_history` | v2.47 | Historique changements abonnement |
| `alert_thresholds` | v3.0 | Seuils pour alertes prédictives (14 métriques) |

### Vues matérialisées et agrégation

12 vues analytics ajoutées pour éviter les requêtes complexes répétées :
- `subscription_status_summary` : Sites enrichis avec statut calculé
- `subscription_stats` : Compteurs globaux par statut/plan
- `club_analytics_summary`, `top_videos_by_site`
- `advertiser_analytics_summary`, `advertiser_performance_by_site`

### Colonnes JSONB stratégiques

| Colonne | Table | Usage |
|---------|-------|-------|
| `local_config_mirror` | `sites` | Copie de la config du Pi (sync bidirectionnel) |
| `network_profile` | `sites` | Profil réseau auto-détecté (simple/mesh/enterprise) |
| `configuration` | `config_drafts` | Brouillon de config pré-déploiement |
| `metadata` | `videos` | Métadonnées variables par vidéo |

### Schéma étendu

```sql
-- Tables ajoutées depuis la version initiale
config_drafts (site_id UNIQUE, configuration JSONB, referenced_video_ids UUID[])
orchestrated_deployments (site_id, draft_id, status, videos_completed, videos_failed)
subscription_suspension_reasons (code, label, auto_unblock, message_tv, message_remote)
subscription_history (site_id, action, reason, previous_end_date, new_end_date, note)
alert_thresholds (metric_name, warning_threshold, critical_threshold)
alerts (site_id, type, severity, message, active, resolved_at)

-- Colonnes ajoutées sur sites
sites += (subscription_start, subscription_end, subscription_plan,
          suspended, suspension_reason, suspension_date, suspension_note,
          network_profile JSONB, network_profile_updated_at,
          config_update_pending_until TIMESTAMP)

-- Colonnes ajoutées sur videos
videos += (uploaded_for_site_id UUID, upload_status, upload_verified_at, upload_verified_size)

-- Colonne ajoutée sur video_plays
video_plays += (tv_status TEXT) -- 'on', 'standby', 'disconnected', 'unknown'
```

## Références

- [database.ts](../../central-server/src/config/database.ts)
- [full-schema.sql](../../central-server/src/scripts/full-schema.sql)
- [RLS_SECURITY.md](../technical/RLS_SECURITY.md)
- ADR-010 : Détection HDMI-CEC pour analytics
- ADR-015 : Contraintes Railway Hobby plan

---

*Créé le 9 janvier 2026 — Mis à jour le 11 février 2026*
