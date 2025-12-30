-- Migration: Add club objectives system
-- Date: 2025-12-30
-- Description: Système de suivi des objectifs par club avec alertes automatiques

-- Table principale des objectifs clubs
CREATE TABLE IF NOT EXISTS club_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

    -- Définition de l'objectif
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_type VARCHAR(50) NOT NULL,
    target_value NUMERIC NOT NULL,
    target_period VARCHAR(20) NOT NULL,  -- daily, weekly, monthly

    -- Paramètres
    status VARCHAR(20) DEFAULT 'active',
    priority VARCHAR(20) DEFAULT 'medium',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,

    -- Alertes automatiques
    alert_on_at_risk BOOLEAN DEFAULT true,
    alert_on_achieved BOOLEAN DEFAULT true,
    at_risk_threshold NUMERIC DEFAULT 50,  -- % en dessous duquel c'est "at risk"

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_metric_type CHECK (metric_type IN (
        'screen_time_seconds',     -- Temps d'écran total
        'videos_played',           -- Nombre de vidéos jouées
        'sessions_count',          -- Nombre de sessions
        'manual_triggers',         -- Déclenchements manuels
        'sponsor_plays',           -- Lectures sponsors
        'uptime_percent',          -- Pourcentage de disponibilité
        'avg_videos_per_session'   -- Moyenne vidéos par session
    )),
    CONSTRAINT check_target_period CHECK (target_period IN ('daily', 'weekly', 'monthly')),
    CONSTRAINT check_status CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    CONSTRAINT check_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_club_objectives_site ON club_objectives(site_id);
CREATE INDEX IF NOT EXISTS idx_club_objectives_status ON club_objectives(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_club_objectives_dates ON club_objectives(start_date, end_date);

-- Table de suivi de progression des objectifs
CREATE TABLE IF NOT EXISTS club_objectives_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES club_objectives(id) ON DELETE CASCADE,

    -- Période de suivi
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Valeurs
    current_value NUMERIC NOT NULL DEFAULT 0,
    target_value NUMERIC NOT NULL,
    progress_percent NUMERIC(6,2) GENERATED ALWAYS AS (
        CASE WHEN target_value > 0 THEN (current_value / target_value * 100) ELSE 0 END
    ) STORED,

    -- Statut
    status VARCHAR(20) DEFAULT 'in_progress',

    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_progress_status CHECK (status IN ('in_progress', 'on_track', 'at_risk', 'achieved', 'missed')),
    UNIQUE(objective_id, period_start)
);

-- Index pour les requêtes de progression
CREATE INDEX IF NOT EXISTS idx_objectives_progress_objective ON club_objectives_progress(objective_id);
CREATE INDEX IF NOT EXISTS idx_objectives_progress_period ON club_objectives_progress(period_start DESC);

-- Table d'alertes d'objectifs
CREATE TABLE IF NOT EXISTS club_objective_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID NOT NULL REFERENCES club_objectives(id) ON DELETE CASCADE,
    progress_id UUID REFERENCES club_objectives_progress(id) ON DELETE CASCADE,

    alert_type VARCHAR(50) NOT NULL,  -- at_risk, achieved, missed, reminder
    severity VARCHAR(20) DEFAULT 'info',
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_alert_type CHECK (alert_type IN ('at_risk', 'achieved', 'missed', 'reminder')),
    CONSTRAINT check_severity CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_objective_alerts_objective ON club_objective_alerts(objective_id);
CREATE INDEX IF NOT EXISTS idx_objective_alerts_sent ON club_objective_alerts(sent_at) WHERE sent_at IS NOT NULL;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_club_objective_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_club_objective ON club_objectives;
CREATE TRIGGER trigger_update_club_objective
    BEFORE UPDATE ON club_objectives
    FOR EACH ROW
    EXECUTE FUNCTION update_club_objective_timestamp();

-- Fonction pour calculer la progression d'un objectif
CREATE OR REPLACE FUNCTION calculate_objective_progress(p_objective_id UUID)
RETURNS TABLE (
    current_value NUMERIC,
    target_value NUMERIC,
    progress_percent NUMERIC,
    status VARCHAR
) AS $$
DECLARE
    v_objective RECORD;
    v_period_start DATE;
    v_period_end DATE;
    v_value NUMERIC;
BEGIN
    -- Récupérer l'objectif
    SELECT * INTO v_objective FROM club_objectives WHERE id = p_objective_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Calculer les dates de période
    CASE v_objective.target_period
        WHEN 'daily' THEN
            v_period_start := CURRENT_DATE;
            v_period_end := CURRENT_DATE;
        WHEN 'weekly' THEN
            v_period_start := date_trunc('week', CURRENT_DATE)::DATE;
            v_period_end := (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE;
        WHEN 'monthly' THEN
            v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
            v_period_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
    END CASE;

    -- Calculer la valeur actuelle selon le type de métrique
    CASE v_objective.metric_type
        WHEN 'screen_time_seconds' THEN
            SELECT COALESCE(SUM(screen_time_seconds), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'videos_played' THEN
            SELECT COALESCE(SUM(videos_played), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'sessions_count' THEN
            SELECT COALESCE(SUM(sessions_count), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'manual_triggers' THEN
            SELECT COALESCE(SUM(manual_triggers), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'sponsor_plays' THEN
            SELECT COALESCE(SUM(sponsor_plays), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'uptime_percent' THEN
            SELECT COALESCE(AVG(uptime_percent), 0) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        WHEN 'avg_videos_per_session' THEN
            SELECT COALESCE(
                CASE WHEN SUM(sessions_count) > 0
                     THEN SUM(videos_played)::NUMERIC / SUM(sessions_count)
                     ELSE 0
                END, 0
            ) INTO v_value
            FROM club_daily_stats
            WHERE site_id = v_objective.site_id
              AND date BETWEEN v_period_start AND v_period_end;

        ELSE
            v_value := 0;
    END CASE;

    -- Calculer le pourcentage et le statut
    RETURN QUERY
    SELECT
        v_value AS current_value,
        v_objective.target_value AS target_value,
        CASE WHEN v_objective.target_value > 0
             THEN ROUND(v_value / v_objective.target_value * 100, 2)
             ELSE 0::NUMERIC
        END AS progress_percent,
        CASE
            WHEN v_value >= v_objective.target_value THEN 'achieved'::VARCHAR
            WHEN (v_value / NULLIF(v_objective.target_value, 0) * 100) >= v_objective.at_risk_threshold THEN 'on_track'::VARCHAR
            WHEN (v_value / NULLIF(v_objective.target_value, 0) * 100) < v_objective.at_risk_threshold THEN 'at_risk'::VARCHAR
            ELSE 'in_progress'::VARCHAR
        END AS status;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour la progression de tous les objectifs actifs
CREATE OR REPLACE FUNCTION update_all_objectives_progress()
RETURNS INTEGER AS $$
DECLARE
    v_objective RECORD;
    v_progress RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_objective IN
        SELECT * FROM club_objectives
        WHERE status = 'active'
          AND start_date <= CURRENT_DATE
          AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    LOOP
        -- Calculer la progression
        SELECT * INTO v_progress FROM calculate_objective_progress(v_objective.id);

        IF v_progress IS NOT NULL THEN
            -- Calculer les dates de période
            DECLARE
                v_period_start DATE;
                v_period_end DATE;
            BEGIN
                CASE v_objective.target_period
                    WHEN 'daily' THEN
                        v_period_start := CURRENT_DATE;
                        v_period_end := CURRENT_DATE;
                    WHEN 'weekly' THEN
                        v_period_start := date_trunc('week', CURRENT_DATE)::DATE;
                        v_period_end := (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::DATE;
                    WHEN 'monthly' THEN
                        v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
                        v_period_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
                END CASE;

                -- Upsert la progression
                INSERT INTO club_objectives_progress (objective_id, period_start, period_end, current_value, target_value, status)
                VALUES (v_objective.id, v_period_start, v_period_end, v_progress.current_value, v_progress.target_value, v_progress.status)
                ON CONFLICT (objective_id, period_start)
                DO UPDATE SET
                    current_value = EXCLUDED.current_value,
                    target_value = EXCLUDED.target_value,
                    status = EXCLUDED.status,
                    calculated_at = NOW();

                v_count := v_count + 1;
            END;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE club_objectives IS 'Objectifs de performance par club';
COMMENT ON TABLE club_objectives_progress IS 'Suivi de progression des objectifs';
COMMENT ON TABLE club_objective_alerts IS 'Alertes générées par les objectifs';
COMMENT ON FUNCTION calculate_objective_progress(UUID) IS 'Calcule la progression actuelle d''un objectif';
COMMENT ON FUNCTION update_all_objectives_progress() IS 'Met à jour la progression de tous les objectifs actifs';
