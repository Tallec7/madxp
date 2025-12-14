-- =============================================================================
-- NEOPRO Central - Analytics Sponsors & Annonceurs
-- =============================================================================
-- Ce fichier crée les tables nécessaires pour le tracking des impressions
-- sponsors et la génération de rapports analytics détaillés.
--
-- Référence: BUSINESS_PLAN_COMPLET.md §13
-- Date: 2025-12-14
-- =============================================================================

-- =============================================================================
-- TABLE DES SPONSORS
-- =============================================================================

-- Table pour gérer les sponsors (partenaires)
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(500),
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_sponsor_status CHECK (status IN ('active', 'inactive', 'paused'))
);

-- Association sponsors <-> vidéos (many-to-many)
-- Une vidéo peut avoir plusieurs sponsors, un sponsor peut avoir plusieurs vidéos
CREATE TABLE IF NOT EXISTS sponsor_videos (
  sponsor_id UUID REFERENCES sponsors(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (sponsor_id, video_id)
);

-- =============================================================================
-- TABLE DES IMPRESSIONS (DONNÉES GRANULAIRES)
-- =============================================================================

-- Table des impressions sponsors (chaque diffusion vidéo)
CREATE TABLE IF NOT EXISTS sponsor_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,

  -- Données de diffusion
  played_at TIMESTAMP NOT NULL,
  duration_played INTEGER NOT NULL,  -- secondes réellement jouées
  video_duration INTEGER NOT NULL,   -- durée totale de la vidéo
  completed BOOLEAN DEFAULT false,   -- vidéo vue entièrement
  interrupted_at INTEGER,            -- seconde d'interruption si pas complété

  -- Contexte de diffusion
  event_type VARCHAR(50),            -- match, training, tournament, other
  period VARCHAR(50),                -- pre_match, halftime, post_match, loop
  trigger_type VARCHAR(20) DEFAULT 'auto',  -- auto, manual
  position_in_loop INTEGER,          -- position dans la boucle (1, 2, 3...)

  -- Audience (optionnel - Phase 3)
  audience_estimate INTEGER,         -- estimation manuelle de l'audience

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_event_type CHECK (event_type IN ('match', 'training', 'tournament', 'other', NULL)),
  CONSTRAINT check_period CHECK (period IN ('pre_match', 'halftime', 'post_match', 'loop', NULL)),
  CONSTRAINT check_trigger_type CHECK (trigger_type IN ('auto', 'manual'))
);

-- Index pour performance des requêtes analytics
CREATE INDEX IF NOT EXISTS idx_impressions_video_date
  ON sponsor_impressions(video_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_impressions_site_date
  ON sponsor_impressions(site_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_impressions_played_at
  ON sponsor_impressions(played_at DESC);

CREATE INDEX IF NOT EXISTS idx_impressions_video_site
  ON sponsor_impressions(video_id, site_id);

-- =============================================================================
-- TABLE DES STATISTIQUES QUOTIDIENNES AGRÉGÉES
-- =============================================================================

-- Table agrégée (calculée quotidiennement via cron job)
CREATE TABLE IF NOT EXISTS sponsor_daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Métriques agrégées globales
  total_impressions INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  completed_plays INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2),  -- pourcentage (0-100)
  unique_events INTEGER DEFAULT 0,

  -- Répartition par période
  pre_match_plays INTEGER DEFAULT 0,
  match_plays INTEGER DEFAULT 0,
  post_match_plays INTEGER DEFAULT 0,
  loop_plays INTEGER DEFAULT 0,

  -- Répartition par type d'événement
  match_events INTEGER DEFAULT 0,
  training_events INTEGER DEFAULT 0,
  tournament_events INTEGER DEFAULT 0,
  other_events INTEGER DEFAULT 0,

  -- Déclenchement
  auto_plays INTEGER DEFAULT 0,
  manual_plays INTEGER DEFAULT 0,

  -- Audience
  total_audience_estimate INTEGER DEFAULT 0,
  avg_audience_per_play DECIMAL(10,2),

  calculated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(video_id, site_id, date)
);

-- Index pour requêtes par période
CREATE INDEX IF NOT EXISTS idx_daily_stats_date
  ON sponsor_daily_stats(date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_stats_video_date
  ON sponsor_daily_stats(video_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_stats_site_date
  ON sponsor_daily_stats(site_id, date DESC);

-- =============================================================================
-- VUES POUR RAPPORTS SPONSORS
-- =============================================================================

-- Vue récapitulative par sponsor
CREATE OR REPLACE VIEW sponsor_analytics_summary AS
SELECT
  s.id as sponsor_id,
  s.name as sponsor_name,
  v.id as video_id,
  v.filename as video_name,
  COUNT(si.*) as total_impressions,
  SUM(si.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN si.completed THEN 100
        ELSE (si.duration_played::float / NULLIF(si.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  SUM(CASE WHEN si.completed THEN 1 ELSE 0 END) as completed_views,
  COUNT(DISTINCT si.site_id) as unique_sites,
  COUNT(DISTINCT DATE(si.played_at)) as active_days,
  SUM(si.audience_estimate) as estimated_total_reach,
  MIN(si.played_at) as first_impression,
  MAX(si.played_at) as last_impression
FROM sponsors s
JOIN sponsor_videos sv ON sv.sponsor_id = s.id
JOIN videos v ON v.id = sv.video_id
LEFT JOIN sponsor_impressions si ON si.video_id = v.id
GROUP BY s.id, s.name, v.id, v.filename;

-- Vue top vidéos sponsors par impressions
CREATE OR REPLACE VIEW top_sponsor_videos AS
SELECT
  v.id as video_id,
  v.filename as video_name,
  s.id as sponsor_id,
  s.name as sponsor_name,
  COUNT(si.*) as total_impressions,
  SUM(si.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN si.completed THEN 100
        ELSE (si.duration_played::float / NULLIF(si.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  COUNT(DISTINCT si.site_id) as unique_sites
FROM videos v
JOIN sponsor_videos sv ON sv.video_id = v.id
JOIN sponsors s ON s.id = sv.sponsor_id
LEFT JOIN sponsor_impressions si ON si.video_id = v.id
WHERE si.played_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY v.id, v.filename, s.id, s.name
ORDER BY total_impressions DESC
LIMIT 50;

-- Vue performance par site pour un sponsor
CREATE OR REPLACE VIEW sponsor_performance_by_site AS
SELECT
  s.id as sponsor_id,
  s.name as sponsor_name,
  st.id as site_id,
  st.site_name,
  st.club_name,
  COUNT(si.*) as total_impressions,
  SUM(si.duration_played) as total_screen_time_seconds,
  ROUND(
    AVG(
      CASE
        WHEN si.completed THEN 100
        ELSE (si.duration_played::float / NULLIF(si.video_duration, 0) * 100)
      END
    )::numeric,
    2
  ) as avg_completion_rate,
  COUNT(DISTINCT DATE(si.played_at)) as active_days
FROM sponsors s
JOIN sponsor_videos sv ON sv.sponsor_id = s.id
JOIN sponsor_impressions si ON si.video_id = sv.video_id
JOIN sites st ON st.id = si.site_id
GROUP BY s.id, s.name, st.id, st.site_name, st.club_name;

-- =============================================================================
-- FONCTIONS POUR CALCULS AGRÉGÉS
-- =============================================================================

-- Fonction pour calculer les stats quotidiennes d'une vidéo pour un site
CREATE OR REPLACE FUNCTION calculate_sponsor_daily_stats(
  p_video_id UUID,
  p_site_id UUID,
  p_date DATE
) RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calcul des métriques agrégées
  SELECT
    COUNT(*) as total_impressions,
    SUM(duration_played) as total_duration,
    SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed,
    ROUND(
      (SUM(CASE WHEN completed THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100)::numeric,
      2
    ) as completion_pct,
    COUNT(DISTINCT event_type) as unique_events,
    -- Par période
    SUM(CASE WHEN period = 'pre_match' THEN 1 ELSE 0 END) as pre_match,
    SUM(CASE WHEN period = 'halftime' THEN 1 ELSE 0 END) as match,
    SUM(CASE WHEN period = 'post_match' THEN 1 ELSE 0 END) as post_match,
    SUM(CASE WHEN period = 'loop' OR period IS NULL THEN 1 ELSE 0 END) as loop,
    -- Par type d'événement
    SUM(CASE WHEN event_type = 'match' THEN 1 ELSE 0 END) as match_events,
    SUM(CASE WHEN event_type = 'training' THEN 1 ELSE 0 END) as training_events,
    SUM(CASE WHEN event_type = 'tournament' THEN 1 ELSE 0 END) as tournament_events,
    SUM(CASE WHEN event_type = 'other' OR event_type IS NULL THEN 1 ELSE 0 END) as other_events,
    -- Par trigger
    SUM(CASE WHEN trigger_type = 'auto' THEN 1 ELSE 0 END) as auto,
    SUM(CASE WHEN trigger_type = 'manual' THEN 1 ELSE 0 END) as manual,
    -- Audience
    SUM(audience_estimate) as total_audience,
    ROUND(AVG(audience_estimate)::numeric, 2) as avg_audience
  INTO v_stats
  FROM sponsor_impressions
  WHERE video_id = p_video_id
    AND site_id = p_site_id
    AND DATE(played_at) = p_date;

  -- Insert ou update
  INSERT INTO sponsor_daily_stats (
    video_id,
    site_id,
    date,
    total_impressions,
    total_duration_seconds,
    completed_plays,
    completion_rate,
    unique_events,
    pre_match_plays,
    match_plays,
    post_match_plays,
    loop_plays,
    match_events,
    training_events,
    tournament_events,
    other_events,
    auto_plays,
    manual_plays,
    total_audience_estimate,
    avg_audience_per_play
  ) VALUES (
    p_video_id,
    p_site_id,
    p_date,
    v_stats.total_impressions,
    v_stats.total_duration,
    v_stats.completed,
    v_stats.completion_pct,
    v_stats.unique_events,
    v_stats.pre_match,
    v_stats.match,
    v_stats.post_match,
    v_stats.loop,
    v_stats.match_events,
    v_stats.training_events,
    v_stats.tournament_events,
    v_stats.other_events,
    v_stats.auto,
    v_stats.manual,
    v_stats.total_audience,
    v_stats.avg_audience
  )
  ON CONFLICT (video_id, site_id, date) DO UPDATE SET
    total_impressions = EXCLUDED.total_impressions,
    total_duration_seconds = EXCLUDED.total_duration_seconds,
    completed_plays = EXCLUDED.completed_plays,
    completion_rate = EXCLUDED.completion_rate,
    unique_events = EXCLUDED.unique_events,
    pre_match_plays = EXCLUDED.pre_match_plays,
    match_plays = EXCLUDED.match_plays,
    post_match_plays = EXCLUDED.post_match_plays,
    loop_plays = EXCLUDED.loop_plays,
    match_events = EXCLUDED.match_events,
    training_events = EXCLUDED.training_events,
    tournament_events = EXCLUDED.tournament_events,
    other_events = EXCLUDED.other_events,
    auto_plays = EXCLUDED.auto_plays,
    manual_plays = EXCLUDED.manual_plays,
    total_audience_estimate = EXCLUDED.total_audience_estimate,
    avg_audience_per_play = EXCLUDED.avg_audience_per_play,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer toutes les stats quotidiennes pour une date
CREATE OR REPLACE FUNCTION calculate_all_sponsor_daily_stats(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Pour chaque combinaison video/site qui a des impressions ce jour-là
  FOR v_record IN
    SELECT DISTINCT video_id, site_id
    FROM sponsor_impressions
    WHERE DATE(played_at) = p_date
  LOOP
    PERFORM calculate_sponsor_daily_stats(v_record.video_id, v_record.site_id, p_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTAIRES SUR LES TABLES
-- =============================================================================

COMMENT ON TABLE sponsors IS 'Sponsors et annonceurs partenaires';
COMMENT ON TABLE sponsor_videos IS 'Association entre sponsors et leurs vidéos';
COMMENT ON TABLE sponsor_impressions IS 'Tracking granulaire de chaque diffusion vidéo sponsor';
COMMENT ON TABLE sponsor_daily_stats IS 'Statistiques quotidiennes agrégées par vidéo et site';

COMMENT ON COLUMN sponsor_impressions.played_at IS 'Timestamp exact de début de lecture';
COMMENT ON COLUMN sponsor_impressions.duration_played IS 'Durée réellement jouée en secondes';
COMMENT ON COLUMN sponsor_impressions.completed IS 'Vidéo visionnée entièrement (95%+)';
COMMENT ON COLUMN sponsor_impressions.event_type IS 'Type événement: match, training, tournament, other';
COMMENT ON COLUMN sponsor_impressions.period IS 'Période: pre_match, halftime, post_match, loop';
COMMENT ON COLUMN sponsor_impressions.trigger_type IS 'Mode déclenchement: auto (boucle) ou manual (télécommande)';
COMMENT ON COLUMN sponsor_impressions.audience_estimate IS 'Estimation manuelle audience présente';

COMMENT ON VIEW sponsor_analytics_summary IS 'Vue récapitulative des analytics par sponsor et vidéo';
COMMENT ON VIEW top_sponsor_videos IS 'Top 50 vidéos sponsors des 30 derniers jours';
COMMENT ON VIEW sponsor_performance_by_site IS 'Performance des sponsors par site/club';

-- =============================================================================
-- DONNÉES INITIALES (OPTIONNEL)
-- =============================================================================

-- Insérer des catégories de sponsors types (optionnel)
-- Ces données peuvent être ajoutées via l'interface admin

-- Exemple:
-- INSERT INTO sponsors (name, status) VALUES
--   ('Sponsor National Exemple', 'active'),
--   ('Sponsor Local Exemple', 'active')
-- ON CONFLICT DO NOTHING;

-- =============================================================================
-- FIN DU SCRIPT
-- =============================================================================
