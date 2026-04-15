-- Migration : ajout playerImgBottom + max playerImgSize 5000 pour ButImgJoueur
-- Idempotente : safe à rejouer

UPDATE neopro_templates
SET
  props_schema = '[
    {"key": "prenom", "type": "text", "label": "Prénom", "required": true, "placeholder": "KEVIN"},
    {"key": "nom", "type": "text", "label": "Nom", "required": true, "placeholder": "DUPONT"},
    {"key": "club", "type": "text", "label": "Club", "required": true, "placeholder": "FC NANTES"},
    {"key": "logoSrc", "type": "image", "label": "Logo club", "required": false},
    {"key": "logoSize", "max": 1000, "min": 100, "step": 10, "type": "number", "label": "Taille logo", "required": false},
    {"key": "playerImgSrc", "type": "image", "label": "Photo joueur", "required": false},
    {"key": "playerImgSize", "max": 5000, "min": 400, "step": 20, "type": "number", "label": "Taille photo (px)", "required": false},
    {"key": "playerImgLeft", "max": 1600, "min": 0, "step": 20, "type": "number", "label": "Position gauche (px)", "required": false},
    {"key": "playerImgBottom", "max": 200, "min": -800, "step": 20, "type": "number", "label": "Position bas (px)", "required": false},
    {"key": "scoreLabel", "type": "text", "label": "Score", "required": false, "placeholder": "+1"},
    {"key": "videoSrcA", "type": "asset", "label": "Fond animé (A)", "required": false, "admin_only": true},
    {"key": "videoSrcB", "type": "asset", "label": "Wipe B", "required": false, "admin_only": true},
    {"key": "videoSrcC", "type": "asset", "label": "Transition score (C)", "required": false, "admin_only": true},
    {"key": "videoSrcD", "type": "asset", "label": "Wipe D", "required": false, "admin_only": true},
    {"key": "videoSrcE", "type": "asset", "label": "Transition packshot (E)", "required": false, "admin_only": true}
  ]'::jsonb,
  default_props = default_props || '{"playerImgBottom": 0}'::jsonb
WHERE composition_id = 'ButImgJoueur';
