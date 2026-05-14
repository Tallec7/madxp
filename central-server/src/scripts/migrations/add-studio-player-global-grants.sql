-- Migration: Templates Studio V1 — players globaux + grants multi-sites
-- Date: 2026-05-14
-- Pattern: ADR-082 (video_club_grants) appliqué au roster joueurs.
-- Description:
--   Étend `players` pour permettre des joueurs *globaux* (créés par
--   super_admin / operator) octroyés explicitement à N sites via
--   `studio_player_site_grants`. Les joueurs créés par un user `club`
--   conservent le comportement legacy (`site_id` non-null = exclusivité).
--
-- Règles métier :
--   - `players.site_id IS NULL`        → joueur global (catalogue admin)
--   - `players.site_id = '<uuid>'`     → joueur exclusif à ce site (legacy)
--   - `studio_player_site_grants(player_id, site_id)` → octroi cross-site
--     d'un joueur global vers un site spécifique.
--
-- Visibilité :
--   - Pour un site donné : tous les `players` où `site_id = $X`
--     ∪ tous les `players` (global) qui ont un grant vers ce site.
--
-- Backward compat :
--   - `IF NOT EXISTS` partout, idempotent.
--   - Les rows `players` existants gardent leur `site_id` (NOT NULL drop
--     n'invalide rien). Aucun backfill nécessaire.
--   - Pas de changement de comportement pour les joueurs club existants.

-- ────────────────────────────────────────────────────────────────────────────
-- Étape 1 : autoriser players.site_id à être NULL (joueur global)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE players ALTER COLUMN site_id DROP NOT NULL;

COMMENT ON COLUMN players.site_id IS
  'NULL = joueur global (catalogue admin, octroyé via studio_player_site_grants). UUID = joueur exclusif à ce site (créé par user club ou attribution directe).';

-- ────────────────────────────────────────────────────────────────────────────
-- Étape 2 : table pivot des grants (player global → site)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_player_site_grants (
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, site_id)
);

COMMENT ON TABLE studio_player_site_grants IS
  'ADR-082 pattern : grants explicites des joueurs globaux (players.site_id IS NULL) vers des sites spécifiques. Ne s''applique pas aux joueurs site-locaux (players.site_id = uuid).';

CREATE INDEX IF NOT EXISTS idx_studio_player_grants_site
  ON studio_player_site_grants(site_id);

CREATE INDEX IF NOT EXISTS idx_studio_player_grants_player
  ON studio_player_site_grants(player_id);

-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: players.site_id nullable + studio_player_site_grants créée';
END $$;
