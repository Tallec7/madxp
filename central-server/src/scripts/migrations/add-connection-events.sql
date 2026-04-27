-- Migration: connection_events table for accurate uptime tracking (ADR-099)
-- Date: 2026-04-27
-- Description:
--   Persiste les événements de connexion/déconnexion socket par site.
--   Source de vérité pour l'uptime, distincte de la table `metrics` (samples
--   CPU/RAM/temp toutes les 5 min) qui ne mesure pas la connectivité.
--
-- Avant cette migration, le dashboard calculait `uptime % = COUNT(metrics) / 2880`
-- en supposant un intervalle de heartbeat de 30s, alors que `metrics` est échantillonné
-- toutes les 5 min (288 rows/24h max). Résultat : ~10% d'uptime affiché en permanence
-- pour toute la flotte, même sur des Pi parfaitement stables (cf. issue #644).
--
-- Backward compat:
--   Aucun impact sur les tables existantes. Le calcul d'uptime sera basculé
--   progressivement sur ce nouveau signal après backfill (les sites n'ayant
--   pas encore d'events affichent un état neutre, pas de faux "instable").

CREATE TABLE IF NOT EXISTS connection_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('connected', 'disconnected')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason VARCHAR(100),
  socket_id VARCHAR(64),
  client_ip VARCHAR(45)
);

-- Index principal : timeline par site (DESC pour les récents en tête).
CREATE INDEX IF NOT EXISTS idx_connection_events_site_time
  ON connection_events(site_id, occurred_at DESC);

-- Index pour la purge rétention (cron 90j) — scan-friendly.
CREATE INDEX IF NOT EXISTS idx_connection_events_occurred_at
  ON connection_events(occurred_at);

COMMENT ON TABLE connection_events IS
  'Événements de connexion/déconnexion socket. Source de vérité de l''uptime, '
  'distincte de la table metrics (samples système toutes les 5 min).';

COMMENT ON COLUMN connection_events.event_type IS
  'connected (socket authentifié) ou disconnected (socket fermé, hors stale-socket racing).';

COMMENT ON COLUMN connection_events.reason IS
  'Raison de l''événement: pour disconnected, valeur Socket.IO (transport close, '
  'ping timeout, server namespace disconnect, etc.). NULL pour connected.';
