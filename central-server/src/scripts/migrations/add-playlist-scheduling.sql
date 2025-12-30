-- Migration: Add playlist scheduling system
-- Date: 2025-12-30
-- Description: Programmation horaire des playlists par site et catégorie

-- Table des règles de programmation de playlists
CREATE TABLE IF NOT EXISTS playlist_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

    -- Nom et description
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Catégorie de contenu à jouer
    content_category VARCHAR(50) NOT NULL,  -- sponsor, jingle, ambiance, custom
    custom_playlist_id UUID,  -- Si category = 'custom', référence à une playlist personnalisée

    -- Planification temporelle
    start_time TIME NOT NULL,  -- Heure de début (ex: 14:00)
    end_time TIME NOT NULL,    -- Heure de fin (ex: 18:00)
    days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',  -- 0=Dim, 1=Lun, ..., 6=Sam

    -- Contexte de match (optionnel)
    match_phase VARCHAR(20),  -- before, during, after, all
    event_type VARCHAR(50),   -- match, training, tournament, all

    -- Priorité (si plusieurs règles s'appliquent)
    priority INTEGER DEFAULT 50,  -- Plus haut = plus prioritaire

    -- Statut
    is_active BOOLEAN DEFAULT true,

    -- Période de validité (optionnel)
    valid_from DATE,
    valid_until DATE,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_content_category CHECK (content_category IN ('sponsor', 'jingle', 'ambiance', 'other', 'custom')),
    CONSTRAINT check_match_phase CHECK (match_phase IS NULL OR match_phase IN ('before', 'during', 'after', 'all')),
    CONSTRAINT check_days_of_week CHECK (days_of_week <@ '{0,1,2,3,4,5,6}'::INTEGER[])
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_playlist_schedules_site ON playlist_schedules(site_id);
CREATE INDEX IF NOT EXISTS idx_playlist_schedules_active ON playlist_schedules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_playlist_schedules_time ON playlist_schedules(start_time, end_time);

-- Table des playlists personnalisées
CREATE TABLE IF NOT EXISTS custom_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,  -- NULL = disponible pour tous

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Vidéos de la playlist (ordre)
    video_ids UUID[] DEFAULT '{}',

    -- Paramètres
    loop_mode VARCHAR(20) DEFAULT 'sequential',  -- sequential, shuffle, weighted
    transition_duration INTEGER DEFAULT 0,  -- Durée transition en ms

    -- Statut
    is_public BOOLEAN DEFAULT false,  -- Visible par tous les sites

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_loop_mode CHECK (loop_mode IN ('sequential', 'shuffle', 'weighted'))
);

CREATE INDEX IF NOT EXISTS idx_custom_playlists_site ON custom_playlists(site_id);

-- Historique des changements de programmation appliqués
CREATE TABLE IF NOT EXISTS playlist_schedule_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES playlist_schedules(id) ON DELETE SET NULL,

    event_type VARCHAR(50) NOT NULL,  -- activated, deactivated, video_played
    content_category VARCHAR(50),
    video_id UUID REFERENCES videos(id) ON DELETE SET NULL,

    -- Contexte
    trigger_time TIME,
    match_phase VARCHAR(20),

    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_event_type CHECK (event_type IN ('activated', 'deactivated', 'video_played', 'schedule_matched'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_site ON playlist_schedule_events(site_id);
CREATE INDEX IF NOT EXISTS idx_schedule_events_date ON playlist_schedule_events(occurred_at DESC);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_playlist_schedule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_playlist_schedule ON playlist_schedules;
CREATE TRIGGER trigger_update_playlist_schedule
    BEFORE UPDATE ON playlist_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_playlist_schedule_timestamp();

DROP TRIGGER IF EXISTS trigger_update_custom_playlist ON custom_playlists;
CREATE TRIGGER trigger_update_custom_playlist
    BEFORE UPDATE ON custom_playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_playlist_schedule_timestamp();

-- Fonction pour obtenir les règles de programmation actives pour un moment donné
CREATE OR REPLACE FUNCTION get_active_playlist_rules(
    p_site_id UUID,
    p_time TIME DEFAULT CURRENT_TIME,
    p_day_of_week INTEGER DEFAULT EXTRACT(DOW FROM CURRENT_DATE)::INTEGER,
    p_match_phase VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    content_category VARCHAR(50),
    custom_playlist_id UUID,
    priority INTEGER,
    match_phase VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ps.id,
        ps.name,
        ps.content_category,
        ps.custom_playlist_id,
        ps.priority,
        ps.match_phase
    FROM playlist_schedules ps
    WHERE ps.site_id = p_site_id
      AND ps.is_active = true
      -- Vérifier l'heure
      AND (
          (ps.start_time <= ps.end_time AND p_time BETWEEN ps.start_time AND ps.end_time)
          OR
          (ps.start_time > ps.end_time AND (p_time >= ps.start_time OR p_time <= ps.end_time))
      )
      -- Vérifier le jour
      AND p_day_of_week = ANY(ps.days_of_week)
      -- Vérifier la période de validité
      AND (ps.valid_from IS NULL OR CURRENT_DATE >= ps.valid_from)
      AND (ps.valid_until IS NULL OR CURRENT_DATE <= ps.valid_until)
      -- Vérifier la phase de match si spécifiée
      AND (ps.match_phase IS NULL OR ps.match_phase = 'all' OR ps.match_phase = p_match_phase)
    ORDER BY ps.priority DESC, ps.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON TABLE playlist_schedules IS 'Règles de programmation horaire des playlists par site';
COMMENT ON TABLE custom_playlists IS 'Playlists personnalisées avec ordre de vidéos';
COMMENT ON TABLE playlist_schedule_events IS 'Historique des événements de programmation';
COMMENT ON FUNCTION get_active_playlist_rules IS 'Retourne les règles de programmation actives pour un moment donné';
