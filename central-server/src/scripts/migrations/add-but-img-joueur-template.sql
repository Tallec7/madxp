-- Migration: Insert ButImgJoueur template into neopro_templates
-- Le template ButSimple était déjà inséré dans add-neopro-templates.sql.
-- add-video-assets-to-templates.sql faisait un UPDATE sur ButImgJoueur
-- mais aucun INSERT n'existait → no-op silencieux. Cette migration corrige ça.
--
-- Idempotent : ne fait rien si le template existe déjà (pas de UNIQUE sur composition_id).

INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, published)
SELECT
  'BUT Img Joueur',
  'ButImgJoueur',
  'Animation de but avec photo joueur, score "+1"/"+2", logo club et packshot nom',
  '[
    {"key": "prenom",      "label": "Prénom",        "type": "text",   "required": true,  "placeholder": "KEVIN"},
    {"key": "nom",         "label": "Nom",           "type": "text",   "required": true,  "placeholder": "DUPONT"},
    {"key": "club",        "label": "Club",          "type": "text",   "required": true,  "placeholder": "FC NANTES"},
    {"key": "logoSrc",     "label": "Logo club",     "type": "image",  "required": false},
    {"key": "logoSize",    "label": "Taille logo",   "type": "number", "required": false, "min": 100, "max": 1000, "step": 10},
    {"key": "playerImgSrc","label": "Photo joueur",  "type": "image",  "required": false},
    {"key": "scoreLabel",  "label": "Score",         "type": "text",   "required": false, "placeholder": "+1"},
    {"key": "videoSrcA",   "label": "Fond animé (A)",           "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcB",   "label": "Wipe B",                   "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcC",   "label": "Transition score (C)",     "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcD",   "label": "Wipe D",                   "type": "asset", "required": false, "admin_only": true},
    {"key": "videoSrcE",   "label": "Transition packshot (E)",  "type": "asset", "required": false, "admin_only": true}
  ]'::jsonb,
  '{"prenom": "PRENOM", "nom": "NOM", "club": "NOM DU CLUB", "logoSize": 400, "scoreLabel": "+1"}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM neopro_templates WHERE composition_id = 'ButImgJoueur'
);
