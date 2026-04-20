-- Migration: Template Studio V2 — Club Scoping (ADR-075 Roadmap V2 "white-glove")
--
-- Ajoute `site_id` nullable sur `neopro_templates` pour permettre à l'équipe
-- Neopro (super_admin) de créer des templates dédiés à un club pilote
-- (processus white-glove : club envoie vidéo + brief → wizard super_admin crée
-- le template scopé `site_id`).
--
-- Sémantique :
--   - site_id = NULL      → template global (catalogue Neopro, visible par tous)
--   - site_id = <uuid>    → template club perso (visible uniquement par ce site)
--
-- Retro-compat totale : tous les templates existants ont site_id = NULL (global).

ALTER TABLE neopro_templates
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

COMMENT ON COLUMN neopro_templates.site_id IS
  'ADR-075 V2 : NULL = template global (catalogue Neopro), UUID = template club perso (white-glove). Feature gate template_studio_club_scoped (Premium).';

-- Index pour accélérer le filtre "global OR mes templates" côté API
CREATE INDEX IF NOT EXISTS idx_neopro_templates_site_id
  ON neopro_templates (site_id)
  WHERE site_id IS NOT NULL;
