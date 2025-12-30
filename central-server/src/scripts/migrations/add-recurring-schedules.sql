-- Migration: Add recurring schedules support
-- Date: 2025-12-30
-- Description: Ajoute le support des tâches récurrentes (cron) pour rapports et autres jobs

-- Table des planifications récurrentes
CREATE TABLE IF NOT EXISTS recurring_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Type de tâche
    task_type VARCHAR(50) NOT NULL,  -- 'report', 'cleanup', 'aggregation', 'backup'

    -- Configuration de récurrence (format cron ou presets)
    cron_expression VARCHAR(100),  -- Format cron: '0 9 * * 1' (Lundi 9h)
    frequency VARCHAR(20),  -- 'daily', 'weekly', 'monthly' (alternative au cron)
    day_of_week INTEGER,  -- 0-6 (0=Dimanche) pour weekly
    day_of_month INTEGER,  -- 1-31 pour monthly
    hour INTEGER DEFAULT 9,  -- Heure d'exécution
    minute INTEGER DEFAULT 0,  -- Minute d'exécution
    timezone VARCHAR(50) DEFAULT 'Europe/Paris',

    -- Configuration de la tâche (JSON)
    task_config JSONB DEFAULT '{}',
    -- Exemples:
    -- report: {"report_type": "summary", "recipients": ["admin@club.fr"], "sites": ["all"] | ["uuid1", "uuid2"]}
    -- cleanup: {"older_than_days": 30, "tables": ["video_plays"]}

    -- Statut
    is_active BOOLEAN DEFAULT true,

    -- Tracking
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),  -- 'success', 'failed', 'skipped'
    last_run_error TEXT,
    next_run_at TIMESTAMP WITH TIME ZONE,
    run_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_task_type CHECK (task_type IN ('report', 'cleanup', 'aggregation', 'backup', 'objective_check')),
    CONSTRAINT check_frequency CHECK (frequency IS NULL OR frequency IN ('daily', 'weekly', 'monthly')),
    CONSTRAINT check_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
    CONSTRAINT check_day_of_month CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
    CONSTRAINT check_hour CHECK (hour >= 0 AND hour <= 23),
    CONSTRAINT check_minute CHECK (minute >= 0 AND minute <= 59)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_active ON recurring_schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_next_run ON recurring_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_task_type ON recurring_schedules(task_type);

-- Table historique des exécutions
CREATE TABLE IF NOT EXISTS recurring_schedule_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,

    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed', 'skipped'
    error_message TEXT,
    result_summary JSONB,  -- Résumé du résultat (nombre d'emails envoyés, etc.)

    CONSTRAINT check_execution_status CHECK (status IN ('running', 'success', 'failed', 'skipped'))
);

-- Index pour les requêtes d'historique
CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule ON recurring_schedule_executions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_executions_date ON recurring_schedule_executions(started_at DESC);

-- Fonction pour calculer la prochaine exécution
CREATE OR REPLACE FUNCTION calculate_next_run(
    p_frequency VARCHAR(20),
    p_day_of_week INTEGER,
    p_day_of_month INTEGER,
    p_hour INTEGER,
    p_minute INTEGER,
    p_timezone VARCHAR(50) DEFAULT 'Europe/Paris'
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE;
    v_next TIMESTAMP WITH TIME ZONE;
    v_target_time TIME;
BEGIN
    v_now := NOW() AT TIME ZONE p_timezone;
    v_target_time := make_time(p_hour, p_minute, 0);

    CASE p_frequency
        WHEN 'daily' THEN
            -- Prochaine occurrence quotidienne
            v_next := date_trunc('day', v_now) + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 day';
            END IF;

        WHEN 'weekly' THEN
            -- Prochaine occurrence hebdomadaire
            v_next := date_trunc('week', v_now) + (p_day_of_week || ' days')::INTERVAL + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 week';
            END IF;

        WHEN 'monthly' THEN
            -- Prochaine occurrence mensuelle
            v_next := date_trunc('month', v_now) + ((p_day_of_month - 1) || ' days')::INTERVAL + v_target_time;
            IF v_next <= v_now THEN
                v_next := v_next + INTERVAL '1 month';
            END IF;

        ELSE
            -- Par défaut, demain à l'heure spécifiée
            v_next := date_trunc('day', v_now) + INTERVAL '1 day' + v_target_time;
    END CASE;

    RETURN v_next AT TIME ZONE p_timezone;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_recurring_schedule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_recurring_schedule ON recurring_schedules;
CREATE TRIGGER trigger_update_recurring_schedule
    BEFORE UPDATE ON recurring_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_recurring_schedule_timestamp();

-- Insérer les schedules par défaut (désactivés par défaut)
INSERT INTO recurring_schedules (name, description, task_type, frequency, day_of_week, hour, minute, task_config, is_active)
VALUES
    -- Rapport hebdomadaire le lundi à 9h
    ('Rapport hebdomadaire', 'Envoi automatique du rapport hebdomadaire aux administrateurs', 'report', 'weekly', 1, 9, 0,
     '{"report_type": "weekly_summary", "recipients": ["admin"], "include_charts": true}', false),

    -- Rapport mensuel le 1er à 8h
    ('Rapport mensuel', 'Envoi automatique du rapport mensuel complet', 'report', 'monthly', NULL, 8, 0,
     '{"report_type": "monthly_summary", "recipients": ["admin"], "include_pdf": true}', false),

    -- Nettoyage des logs anciens (30 jours) - quotidien à 3h
    ('Nettoyage logs', 'Suppression des logs de plus de 30 jours', 'cleanup', 'daily', NULL, 3, 0,
     '{"older_than_days": 30, "tables": ["recurring_schedule_executions"]}', false),

    -- Vérification des objectifs quotidienne à 23h
    ('Vérification objectifs', 'Évaluation quotidienne des objectifs clubs', 'objective_check', 'daily', NULL, 23, 0,
     '{"check_type": "daily_progress", "send_alerts": true}', false)
ON CONFLICT DO NOTHING;

-- Commentaires
COMMENT ON TABLE recurring_schedules IS 'Planifications de tâches récurrentes (cron)';
COMMENT ON TABLE recurring_schedule_executions IS 'Historique des exécutions de tâches planifiées';
COMMENT ON COLUMN recurring_schedules.cron_expression IS 'Expression cron standard (minute hour day month weekday)';
COMMENT ON COLUMN recurring_schedules.frequency IS 'Alternative simplifiée: daily, weekly, monthly';
COMMENT ON COLUMN recurring_schedules.task_config IS 'Configuration JSON spécifique au type de tâche';
