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

## Références

- [database.ts](../../central-server/src/config/database.ts)
- [full-schema.sql](../../central-server/src/scripts/full-schema.sql)
- [RLS_SECURITY.md](../technical/RLS_SECURITY.md)

---

*Créé le 9 janvier 2026*
