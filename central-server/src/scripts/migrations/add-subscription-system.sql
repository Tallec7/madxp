-- Migration: Add Subscription System
-- Date: 2026-01-25
-- Description: Adds subscription management capabilities to sites
--   - Subscription dates and plans
--   - Suspension mechanism with reasons
--   - History tracking for audit

-- ============================================
-- 1. Add subscription columns to sites table
-- ============================================

DO $$
BEGIN
    -- Subscription start date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'subscription_start') THEN
        ALTER TABLE sites ADD COLUMN subscription_start DATE;
        COMMENT ON COLUMN sites.subscription_start IS 'Date de début de l''abonnement';
    END IF;

    -- Subscription end date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'subscription_end') THEN
        ALTER TABLE sites ADD COLUMN subscription_end DATE;
        COMMENT ON COLUMN sites.subscription_end IS 'Date de fin de l''abonnement';
    END IF;

    -- Subscription plan (trial, standard, premium)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'subscription_plan') THEN
        ALTER TABLE sites ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'standard';
        COMMENT ON COLUMN sites.subscription_plan IS 'Type de plan: trial, standard, premium';
    END IF;

    -- Suspended flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'suspended') THEN
        ALTER TABLE sites ADD COLUMN suspended BOOLEAN DEFAULT false;
        COMMENT ON COLUMN sites.suspended IS 'Site suspendu manuellement';
    END IF;

    -- Suspension reason code
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'suspension_reason') THEN
        ALTER TABLE sites ADD COLUMN suspension_reason VARCHAR(50);
        COMMENT ON COLUMN sites.suspension_reason IS 'Code du motif de suspension';
    END IF;

    -- Suspension date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'suspension_date') THEN
        ALTER TABLE sites ADD COLUMN suspension_date TIMESTAMPTZ;
        COMMENT ON COLUMN sites.suspension_date IS 'Date de la suspension';
    END IF;

    -- Suspension note (internal)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sites' AND column_name = 'suspension_note') THEN
        ALTER TABLE sites ADD COLUMN suspension_note TEXT;
        COMMENT ON COLUMN sites.suspension_note IS 'Note interne sur la suspension (visible uniquement par les admins)';
    END IF;
END $$;

-- ============================================
-- 2. Create suspension reasons reference table
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_suspension_reasons (
    code VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    auto_unblock BOOLEAN DEFAULT false,
    message_remote TEXT,
    message_tv TEXT,
    severity VARCHAR(20) DEFAULT 'error',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subscription_suspension_reasons IS 'Table de référence des motifs de suspension';
COMMENT ON COLUMN subscription_suspension_reasons.code IS 'Code unique du motif';
COMMENT ON COLUMN subscription_suspension_reasons.label IS 'Libellé affiché dans le dashboard';
COMMENT ON COLUMN subscription_suspension_reasons.description IS 'Description détaillée pour les admins';
COMMENT ON COLUMN subscription_suspension_reasons.auto_unblock IS 'Si true, le site peut être débloqué automatiquement';
COMMENT ON COLUMN subscription_suspension_reasons.message_remote IS 'Message affiché sur /remote (visible par le staff)';
COMMENT ON COLUMN subscription_suspension_reasons.message_tv IS 'Message affiché sur /tv (visible par le public - doit être neutre)';
COMMENT ON COLUMN subscription_suspension_reasons.severity IS 'Niveau de sévérité: warning, error';

-- Insert default suspension reasons
INSERT INTO subscription_suspension_reasons (code, label, description, auto_unblock, message_remote, message_tv, severity) VALUES
    ('unpaid', 'Impayé', 'Facture(s) impayée(s)', true,
     'Veuillez régulariser votre situation financière.',
     'Service temporairement indisponible', 'error'),
    ('expired', 'Abonnement expiré', 'Date de fin d''abonnement dépassée (> 7 jours de grace)', true,
     'Votre abonnement a expiré.',
     'Service temporairement indisponible', 'error'),
    ('abuse', 'Utilisation abusive', 'Non-respect des CGU', false,
     'Service suspendu pour non-respect des conditions d''utilisation.',
     'Service temporairement indisponible', 'error'),
    ('maintenance', 'Maintenance', 'Maintenance technique Neopro', true,
     'Maintenance en cours, merci de patienter.',
     'Maintenance en cours', 'warning'),
    ('request', 'Demande client', 'Suspendu à la demande du client', false,
     'Service suspendu à votre demande.',
     'Service temporairement indisponible', 'warning'),
    ('hardware', 'Problème matériel', 'Problème technique nécessitant intervention', false,
     'Problème technique détecté. Contactez le support.',
     'Service temporairement indisponible', 'error'),
    ('trial_ended', 'Fin période d''essai', 'La période d''essai gratuite est terminée', true,
     'Votre période d''essai est terminée. Souscrivez un abonnement pour continuer.',
     'Service temporairement indisponible', 'warning'),
    ('connection', 'Connexion requise', 'Boîtier non connecté depuis trop longtemps (> 14 jours)', true,
     'Connectez le boîtier à Internet pour valider votre licence.',
     'Connexion Internet requise', 'warning')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    auto_unblock = EXCLUDED.auto_unblock,
    message_remote = EXCLUDED.message_remote,
    message_tv = EXCLUDED.message_tv,
    severity = EXCLUDED.severity;

-- ============================================
-- 3. Create subscription history table
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    reason VARCHAR(50),
    previous_end_date DATE,
    new_end_date DATE,
    previous_plan VARCHAR(50),
    new_plan VARCHAR(50),
    note TEXT,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE subscription_history IS 'Historique des changements d''abonnement pour audit';
COMMENT ON COLUMN subscription_history.action IS 'Type d''action: activated, renewed, suspended, reactivated, expired, plan_changed';
COMMENT ON COLUMN subscription_history.reason IS 'Code du motif (pour suspensions)';
COMMENT ON COLUMN subscription_history.previous_end_date IS 'Date de fin précédente (pour prolongations)';
COMMENT ON COLUMN subscription_history.new_end_date IS 'Nouvelle date de fin';
COMMENT ON COLUMN subscription_history.previous_plan IS 'Plan précédent (pour changements de plan)';
COMMENT ON COLUMN subscription_history.new_plan IS 'Nouveau plan';
COMMENT ON COLUMN subscription_history.note IS 'Note interne de l''admin';
COMMENT ON COLUMN subscription_history.performed_by IS 'ID de l''utilisateur ayant effectué l''action';

-- ============================================
-- 4. Create indexes for performance
-- ============================================

-- Index for querying sites by subscription end date (expiring soon, expired)
CREATE INDEX IF NOT EXISTS idx_sites_subscription_end
    ON sites(subscription_end)
    WHERE subscription_end IS NOT NULL;

-- Index for querying suspended sites
CREATE INDEX IF NOT EXISTS idx_sites_suspended
    ON sites(suspended)
    WHERE suspended = true;

-- Index for querying by plan type
CREATE INDEX IF NOT EXISTS idx_sites_subscription_plan
    ON sites(subscription_plan)
    WHERE subscription_plan IS NOT NULL;

-- Index for subscription history by site
CREATE INDEX IF NOT EXISTS idx_subscription_history_site
    ON subscription_history(site_id);

-- Index for subscription history by date (recent first)
CREATE INDEX IF NOT EXISTS idx_subscription_history_created
    ON subscription_history(created_at DESC);

-- ============================================
-- 5. Create useful views
-- ============================================

-- View: Sites with subscription status summary
CREATE OR REPLACE VIEW subscription_status_summary AS
SELECT
    s.id,
    s.site_name,
    s.club_name,
    s.subscription_plan,
    s.subscription_start,
    s.subscription_end,
    s.suspended,
    s.suspension_reason,
    s.suspension_date,
    ssr.label as suspension_label,
    CASE
        WHEN s.suspended = true THEN 'suspended'
        WHEN s.subscription_end IS NULL THEN 'no_subscription'
        WHEN s.subscription_end < CURRENT_DATE - INTERVAL '7 days' THEN 'blocked'
        WHEN s.subscription_end < CURRENT_DATE THEN 'grace_period'
        WHEN s.subscription_end < CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_urgent'
        WHEN s.subscription_end < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
        ELSE 'active'
    END as subscription_status,
    CASE
        WHEN s.subscription_end IS NOT NULL
        THEN s.subscription_end - CURRENT_DATE
        ELSE NULL
    END as days_until_expiry
FROM sites s
LEFT JOIN subscription_suspension_reasons ssr ON s.suspension_reason = ssr.code;

COMMENT ON VIEW subscription_status_summary IS 'Vue résumant le statut d''abonnement de chaque site';

-- View: Subscription statistics
CREATE OR REPLACE VIEW subscription_stats AS
SELECT
    COUNT(*) FILTER (WHERE subscription_end > CURRENT_DATE AND suspended = false) as active_count,
    COUNT(*) FILTER (WHERE subscription_end > CURRENT_DATE
                     AND subscription_end < CURRENT_DATE + INTERVAL '30 days'
                     AND suspended = false) as expiring_soon_count,
    COUNT(*) FILTER (WHERE subscription_end < CURRENT_DATE
                     AND subscription_end >= CURRENT_DATE - INTERVAL '7 days'
                     AND suspended = false) as grace_period_count,
    COUNT(*) FILTER (WHERE subscription_end < CURRENT_DATE - INTERVAL '7 days'
                     OR suspended = true) as blocked_count,
    COUNT(*) FILTER (WHERE suspended = true) as suspended_count,
    COUNT(*) FILTER (WHERE subscription_plan = 'trial') as trial_count,
    COUNT(*) FILTER (WHERE subscription_plan = 'standard') as standard_count,
    COUNT(*) FILTER (WHERE subscription_plan = 'premium') as premium_count,
    COUNT(*) as total_count
FROM sites;

COMMENT ON VIEW subscription_stats IS 'Statistiques globales des abonnements';

-- ============================================
-- 6. Add constraint for valid plan values
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_subscription_plan_check') THEN
        ALTER TABLE sites ADD CONSTRAINT sites_subscription_plan_check
            CHECK (subscription_plan IN ('trial', 'standard', 'premium') OR subscription_plan IS NULL);
    END IF;
END $$;

-- ============================================
-- 7. Add constraint for valid suspension reason
-- ============================================

-- Note: We use a trigger instead of FK to allow flexibility
-- The suspension_reason should match a code in subscription_suspension_reasons
-- but we don't enforce it as a hard FK to allow for custom reasons if needed

-- ============================================
-- Done
-- ============================================

-- To verify the migration:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sites' AND column_name LIKE 'subscription%' OR column_name LIKE 'suspend%';
-- SELECT * FROM subscription_suspension_reasons;
-- SELECT * FROM subscription_status_summary LIMIT 5;
-- SELECT * FROM subscription_stats;
