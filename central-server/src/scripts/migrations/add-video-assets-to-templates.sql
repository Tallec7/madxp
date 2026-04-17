-- Migration: Add videoSrc asset props to ButSimple and ButImgJoueur templates
-- Allows admins to swap background WebM videos from the dashboard without redeploying.
-- type "asset" = file upload UI (admin only), stored as FTP URL in default_props.

UPDATE neopro_templates
SET
  props_schema = '[
    {"key": "prenom",   "label": "Prénom",     "type": "text",   "required": true,  "placeholder": "KEVIN"},
    {"key": "nom",      "label": "Nom",        "type": "text",   "required": true,  "placeholder": "DUPONT"},
    {"key": "club",     "label": "Club",       "type": "text",   "required": true,  "placeholder": "FC NANTES"},
    {"key": "logoSrc",  "label": "Logo club",  "type": "image",  "required": false},
    {"key": "logoSize", "label": "Taille logo","type": "number", "required": false, "min": 100, "max": 1000, "step": 10, "placeholder": "500"},
    {"key": "videoSrcA","label": "Fond animé (A)",  "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcB","label": "Wipe transition (B)","type": "asset","required": false,"admin_only": true},
    {"key": "videoSrcC","label": "Packshot (C)",  "type": "asset", "required": false, "admin_only": true}
  ]',
  updated_at = NOW()
WHERE composition_id = 'ButSimple';

UPDATE neopro_templates
SET
  props_schema = '[
    {"key": "prenom",      "label": "Prénom",        "type": "text",  "required": true,  "placeholder": "KEVIN"},
    {"key": "nom",         "label": "Nom",           "type": "text",  "required": true,  "placeholder": "DUPONT"},
    {"key": "club",        "label": "Club",          "type": "text",  "required": true,  "placeholder": "FC NANTES"},
    {"key": "logoSrc",     "label": "Logo club",     "type": "image", "required": false},
    {"key": "logoSize",    "label": "Taille logo",   "type": "number","required": false, "min": 100, "max": 1000, "step": 10},
    {"key": "playerImgSrc","label": "Photo joueur",  "type": "image", "required": false},
    {"key": "scoreLabel",  "label": "Score",         "type": "text",  "required": false, "placeholder": "+1"},
    {"key": "videoSrcA",   "label": "Couche A",      "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcB",   "label": "Couche B",      "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcC",   "label": "Couche C",      "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcD",   "label": "Couche D",      "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcE",   "label": "Couche E",      "type": "asset", "required": false, "admin_only": true}
  ]',
  updated_at = NOW()
WHERE composition_id = 'ButImgJoueur';
