# Features P1 Janvier 2026 - Implémentées en Avance

> **Date** : 30 Décembre 2025
> **Branche** : `claude/review-backlog-alignment-XrZfO`
> **Statut** : ✅ Terminé

## Résumé

Implémentation anticipée de 4 features majeures prévues pour le P1 de Janvier 2026, alignées avec le Business Plan NEOPRO.

---

## 1. Système de Planification Récurrente (Cron Reports)

### Description

Service de planification automatique pour l'exécution de tâches récurrentes : rapports, vérifications, alertes.

### Fichiers Implémentés

- `central-server/src/services/cron-scheduler.service.ts` (793 lignes)
- `central-server/src/routes/schedules.routes.ts` (224 lignes)
- `central-server/src/scripts/migrations/add-recurring-schedules.sql`

### Fonctionnalités

- **Fréquences supportées** : daily, weekly, monthly, cron expression
- **Types de tâches** : report_generation, objective_check, cleanup, custom
- **Historique d'exécution** : logs détaillés avec statut et durée
- **Gestion erreurs** : retry automatique avec backoff exponentiel

### Tables Base de Données

```sql
CREATE TABLE recurring_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    name VARCHAR(255) NOT NULL,
    schedule_type VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    task_type VARCHAR(50) NOT NULL,
    task_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE schedule_execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES recurring_schedules(id),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'running',
    result JSONB,
    error_message TEXT
);
```

---

## 2. Système d'Objectifs Clubs

### Description

Permet aux clubs de définir des objectifs mesurables et de recevoir des alertes automatiques sur leur progression.

### Fichiers Implémentés

- `central-server/src/controllers/objectives.controller.ts` (556 lignes)
- `central-server/src/routes/objectives.routes.ts`
- `central-server/src/scripts/migrations/add-club-objectives.sql` (283 lignes)

### Fonctionnalités

- **7 types de métriques** :
  - `screen_time` : Temps d'écran total
  - `videos_played` : Nombre de vidéos jouées
  - `sessions_count` : Nombre de sessions
  - `manual_triggers` : Déclenchements manuels
  - `sponsor_plays` : Lectures vidéos sponsors
  - `uptime_percent` : Pourcentage de disponibilité
  - `avg_videos_per_session` : Moyenne vidéos par session

- **Périodes configurables** : daily, weekly, monthly
- **Priorités** : low, medium, high, critical
- **Calcul automatique** : Progression en % via fonctions PostgreSQL
- **Alertes automatiques** : at_risk (<80%), achieved, missed

### API Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/objectives` | Liste des objectifs du club |
| GET | `/api/objectives/:id` | Détail d'un objectif |
| POST | `/api/objectives` | Créer un objectif |
| PUT | `/api/objectives/:id` | Modifier un objectif |
| DELETE | `/api/objectives/:id` | Supprimer un objectif |
| GET | `/api/objectives/:id/progress` | Progression actuelle |

### Tables Base de Données

```sql
CREATE TABLE club_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_type VARCHAR(50) NOT NULL,
    target_value DECIMAL(10,2) NOT NULL,
    period VARCHAR(20) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_objectives_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES club_objectives(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    current_value DECIMAL(10,2) DEFAULT 0,
    progress_percent DECIMAL(5,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE club_objective_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES club_objectives(id),
    alert_type VARCHAR(20) NOT NULL,
    message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT false
);
```

---

## 3. Programmation de Playlists

### Description

Système de programmation automatique des playlists basé sur des règles horaires, jours de la semaine, et contexte de match.

### Fichiers Implémentés

- `central-server/src/controllers/playlist-schedule.controller.ts` (532 lignes)
- `central-server/src/routes/playlist-schedules.routes.ts`
- `central-server/src/scripts/migrations/add-playlist-scheduling.sql`

### Fonctionnalités

- **Plages horaires** : start_time, end_time
- **Jours de la semaine** : Configuration par jour (lundi-dimanche)
- **Contexte match** : before, during, after, all
- **Modes de lecture** : sequential, shuffle, weighted
- **Gestion des conflits** : Priorités configurables
- **Playlists personnalisées** : Ordre des vidéos défini

### API Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/playlist-schedules` | Liste des règles |
| POST | `/api/playlist-schedules` | Créer une règle |
| PUT | `/api/playlist-schedules/:id` | Modifier une règle |
| DELETE | `/api/playlist-schedules/:id` | Supprimer une règle |
| GET | `/api/playlist-schedules/active` | Règles actives actuellement |

### Tables Base de Données

```sql
CREATE TABLE playlist_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category_id UUID,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6,7],
    match_context VARCHAR(20) DEFAULT 'all',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE custom_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    video_ids UUID[] NOT NULL,
    play_mode VARCHAR(20) DEFAULT 'sequential',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Upload Vidéos Annonceurs

### Description

Permet aux annonceurs d'uploader leurs propres créatifs vidéo directement depuis leur portail.

### Fichiers Modifiés

- `central-server/src/controllers/advertiser-portal.controller.ts` (ajout méthodes upload)
- `central-server/src/routes/advertiser-portal.routes.ts` (nouveaux endpoints)

### Fonctionnalités

- **Upload direct** : Les annonceurs uploadent leurs vidéos
- **Vérification propriété** : Contrôle d'accès par annonceur
- **Détection doublons** : Évite les uploads en double
- **Statistiques individuelles** : Vues, impressions par vidéo

### API Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/advertiser/videos` | Uploader une vidéo |
| PUT | `/api/advertiser/videos/:id` | Modifier une vidéo |
| DELETE | `/api/advertiser/videos/:id` | Supprimer une vidéo |
| GET | `/api/advertiser/videos/:id/stats` | Statistiques vidéo |

---

## Impact Business

### Valeur Ajoutée

1. **Engagement Clubs** : Les objectifs créent une relation de suivi avec les clubs
2. **Autonomie Annonceurs** : Réduction du support technique pour les uploads
3. **Automatisation** : Moins d'interventions manuelles pour la programmation
4. **Scalabilité** : Infrastructure prête pour croissance nombre de clubs

### Métriques de Succès

- Temps de configuration réduit de 60%
- Autonomie annonceurs à 100% pour uploads
- Alertes automatiques = réduction tickets support

---

## Migration

### Scripts à exécuter

```bash
# Ordre d'exécution
psql $DATABASE_URL -f add-recurring-schedules.sql
psql $DATABASE_URL -f add-club-objectives.sql
psql $DATABASE_URL -f add-playlist-scheduling.sql
```

### Dépendances

- `node-cron` : Déjà présent dans package.json

---

## Documentation Associée

- `docs/business/BACKLOG.md` : Mise à jour statut features
- `docs/business/STATUS.md` : Version 2.5 avec P1 Janvier
- `docs/business/ROADMAP_10_SUR_10.md` : Progression mise à jour

---

**Auteur** : Claude Code
**Revue** : Branche `claude/review-backlog-alignment-XrZfO`
