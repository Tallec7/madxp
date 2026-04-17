-- Migration: Add neopro_templates table
-- Templates vidéo Remotion publiables par les admins, utilisables par les clubs (feature: video_templates)

CREATE TABLE IF NOT EXISTS neopro_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  composition_id VARCHAR(100) NOT NULL,        -- ID de la composition Remotion (ex: 'ButSimple')
  description   TEXT,
  props_schema  JSONB NOT NULL DEFAULT '{}',   -- Schéma des props editables (label, type, required...)
  default_props JSONB NOT NULL DEFAULT '{}',   -- Valeurs par défaut
  thumbnail_url VARCHAR(500),                  -- Aperçu statique
  published     BOOLEAN NOT NULL DEFAULT false, -- Visible aux clubs si true
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Seed: template but-simple initial
INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, published)
VALUES (
  'BUT Simple',
  'ButSimple',
  'Animation de but avec logo club, transition et packshot joueur',
  '[
    {"key": "prenom", "label": "Prénom", "type": "text", "required": true, "placeholder": "KEVIN"},
    {"key": "nom",    "label": "Nom",    "type": "text", "required": true, "placeholder": "DUPONT"},
    {"key": "club",   "label": "Club",   "type": "text", "required": true, "placeholder": "FC NANTES"},
    {"key": "logoSrc","label": "Logo club","type": "image","required": false}
  ]',
  '{"prenom": "PRENOM", "nom": "NOM", "club": "NOM DU CLUB"}',
  true
);

COMMENT ON TABLE neopro_templates IS 'Templates vidéo Remotion — ADR-052';
