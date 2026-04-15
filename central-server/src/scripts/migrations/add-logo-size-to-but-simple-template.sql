-- Migration: Add logoSize prop to ButSimple template
-- Adds a number slider for logo width (px) — default 500, range 100-1000

UPDATE neopro_templates
SET
  props_schema = '[
    {"key": "prenom",   "label": "Prénom",     "type": "text",   "required": true,  "placeholder": "KEVIN"},
    {"key": "nom",      "label": "Nom",        "type": "text",   "required": true,  "placeholder": "DUPONT"},
    {"key": "club",     "label": "Club",       "type": "text",   "required": true,  "placeholder": "FC NANTES"},
    {"key": "logoSrc",  "label": "Logo club",  "type": "image",  "required": false},
    {"key": "logoSize", "label": "Taille logo","type": "number", "required": false, "min": 100, "max": 1000, "step": 10, "placeholder": "500"}
  ]',
  default_props = '{"prenom": "PRENOM", "nom": "NOM", "club": "NOM DU CLUB", "logoSize": 500}',
  updated_at = NOW()
WHERE composition_id = 'ButSimple';
