-- Migration: Conformité templates JOUEUR à la Spec Animation Joueur PDF
--
-- Corrections appliquées suite à l'audit complet PDF vs DB (2026-05-02) :
--
-- 1) CREATE TABLE template_options (ADR-108) + visible_if sur les slots
--    → même contenu que add-template-options-and-conditional-slots.sql,
--      déjà inclus ici pour que cette migration soit auto-suffisante.
-- 2) FPS 30→25 sur BUT Simple + Joueur détaillé
-- 3) duration_ms layers corrigés selon les timecodes spec (secondes+frames @ 25fps)
-- 4) Corrections text_fields : fonts, sizes, positions
-- 5) Corrections image_slots : animation, anchor, safe_zone
-- 6) Insertion options intro_mode + packshot
-- 7) visible_if conditionnels (logoSrc, playerImgSrc, numero-intro)
-- 8) Ajout layer A placeholder ButSimple + slot numero-intro + club_bas

-- =============================================================================
-- 1. TABLE TEMPLATE_OPTIONS (idempotente)
-- =============================================================================
CREATE TABLE IF NOT EXISTS template_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  key             VARCHAR(64) NOT NULL,
  label           VARCHAR(200) NOT NULL,
  type            VARCHAR(20) NOT NULL DEFAULT 'enum',
  values          JSONB NOT NULL,
  default_value   TEXT NOT NULL,
  user_editable   BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, key),
  CHECK (type IN ('enum', 'boolean')),
  CHECK (jsonb_typeof(values) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_template_options_template ON template_options (template_id, sort_order);

CREATE TABLE IF NOT EXISTS template_packshot_refs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE CASCADE,
  option_key           VARCHAR(64) NOT NULL,
  option_value         TEXT NOT NULL,
  packshot_template_id UUID NOT NULL REFERENCES neopro_templates(id) ON DELETE RESTRICT,
  start_at_ms          INTEGER NOT NULL DEFAULT 0,
  z_index_offset       INT NOT NULL DEFAULT 100,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, option_key, option_value),
  CHECK (start_at_ms >= 0),
  CHECK (z_index_offset >= 0)
);
CREATE INDEX IF NOT EXISTS idx_template_packshot_refs_template ON template_packshot_refs (template_id);

ALTER TABLE template_text_fields  ADD COLUMN IF NOT EXISTS visible_if TEXT;
ALTER TABLE template_image_slots  ADD COLUMN IF NOT EXISTS visible_if TEXT;

-- =============================================================================
-- 2. FPS 25 (spec : 25fps, DB avait 30)
-- =============================================================================
UPDATE neopro_templates SET fps = 25
WHERE name IN ('BUT Simple', 'Joueur détaillé') AND fps != 25;

-- =============================================================================
-- 3. DURATION_MS LAYERS — timecodes spec @ 25fps
--    Notation spec : s'f' = secondes + frames
--    BUT Simple : A=1s10f=1400ms, B=2s19f=2760ms, C=packshot=inchangé(5000)
--    Joueur détaillé : A=1s23f=1920ms, B=2s03f=2120ms, C=3s09f=3360ms, D=3s12f=3480ms
-- =============================================================================
UPDATE template_layers SET duration_ms = 2760
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND name = 'BUT_simple_B' AND duration_ms != 2760;

UPDATE template_layers SET duration_ms = 1920
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND name = 'A — fond logo' AND duration_ms != 1920;

UPDATE template_layers SET duration_ms = 2120
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND name = 'B — transition 1' AND duration_ms != 2120;

UPDATE template_layers SET duration_ms = 3360
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND name = 'C — titre + pattern' AND duration_ms != 3360;

UPDATE template_layers SET duration_ms = 3480
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND name = 'D — transition 2' AND duration_ms != 3480;

-- =============================================================================
-- 4. Z_INDEX LAYERS Joueur détaillé (spec A=1,B=2,C=3,D=4,E=5 ; DB était A=0...)
-- =============================================================================
UPDATE template_layers SET z_index = z_index + 1
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND z_index < 1;
-- Note: si déjà à 1+ (migration rejouée), cette UPDATE est no-op.
-- On force les valeurs exactes pour être idempotent :
UPDATE template_layers l SET z_index = expected.z
FROM (VALUES
  ('A — fond logo', 1),
  ('B — transition 1', 2),
  ('C — titre + pattern', 3),
  ('D — transition 2', 4),
  ('E — joueur + nom + coins', 5)
) AS expected(n, z)
WHERE l.name = expected.n
  AND l.template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé');

-- =============================================================================
-- 5. CORRECTIONS TEXT FIELDS — Joueur détaillé
-- =============================================================================
-- titre : 389px, zoom in, scale_from=0.77, position center
UPDATE template_text_fields SET
  font_size = 389, animation = 'zoom', animation_direction = 'in',
  scale_from = 0.77, scale_to = 1.00, position_x = 0.5, position_y = 0.5
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'titre';

-- nom/prénom : 150px, left, x=0.133, y=0.5
UPDATE template_text_fields SET font_size = 150, position_x = 0.133, position_y = 0.5
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'nom';

-- coins nom club : 25px, positions spec exactes
UPDATE template_text_fields SET font_size = 25, position_x = 0.049, position_y = 0.100
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'clubTopLeft';

UPDATE template_text_fields SET font_size = 25, position_x = 0.049, position_y = 0.9185, animation = 'fade', scale_from = 1.0, scale_to = 1.0
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'clubBottomLeft';

UPDATE template_text_fields SET font_size = 25, position_y = 0.9185
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'clubBottomRight';

-- numéro : right, x=0.867, y=0.5
UPDATE template_text_fields SET align = 'right', position_x = 0.867, position_y = 0.5
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'numero';

-- =============================================================================
-- 6. CORRECTIONS TEXT FIELDS — BUT Simple
-- =============================================================================
-- prenom/nom : Bulevar 389px
UPDATE template_text_fields SET font_family = 'Bulevar', font_size = 389, position_y = 0.40, animation = 'none', always_visible = true,
  layer_id = (SELECT id FROM template_layers WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple') AND name = 'BUT_simple_C')
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND slot_key = 'prenom';

UPDATE template_text_fields SET font_family = 'Bulevar', font_size = 389, position_y = 0.60, animation = 'none', always_visible = true,
  layer_id = (SELECT id FROM template_layers WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple') AND name = 'BUT_simple_C')
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND slot_key = 'nom';

-- club haut (renommé depuis 'club')
UPDATE template_text_fields SET
  slot_key = 'club_haut', label = 'Nom du club (haut)',
  font_family = 'General Sans', font_size = 25, position_x = 0.5, position_y = 0.136, align = 'center',
  always_visible = true, animation = 'none',
  layer_id = (SELECT id FROM template_layers WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple') AND name = 'BUT_simple_C')
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND slot_key IN ('club', 'club_haut');

-- club bas
INSERT INTO template_text_fields (
  template_id, slot_key, label, position_x, position_y, max_width,
  font_family, font_size, color, align,
  appear_at, appear_duration, animation, animation_direction,
  always_visible, layer_id, respect_alpha, scale_from, scale_to
)
SELECT
  t.id, 'club_bas', 'Nom du club (bas)', 0.5, 0.864, 0.5,
  'General Sans', 25, '#FFFFFF', 'center',
  0, 5.0, 'none', 'in',
  true, l.id, false, 1.0, 1.0
FROM neopro_templates t
JOIN template_layers l ON l.template_id = t.id AND l.name = 'BUT_simple_C'
WHERE t.name = 'BUT Simple'
ON CONFLICT (template_id, slot_key) DO NOTHING;

-- =============================================================================
-- 7. LAYER A PLACEHOLDER — BUT Simple (WebM designer à livrer)
-- =============================================================================
INSERT INTO template_layers (template_id, name, video_url, z_index, mask_top, mask_bottom, mask_left, mask_right, duration_ms)
SELECT t.id, 'A — intro hexagone (logo/numéro)', '', 0, 0, 0, 0, 0, 1400
FROM neopro_templates t
WHERE t.name = 'BUT Simple'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 8. SLOT NUMERO-INTRO — BUT Simple
-- =============================================================================
INSERT INTO template_text_fields (
  template_id, slot_key, label, position_x, position_y, max_width,
  font_family, font_size, color, align,
  appear_at, appear_duration, animation, animation_direction,
  always_visible, layer_id, respect_alpha, scale_from, scale_to,
  visible_if
)
SELECT
  t.id, 'numero', 'Numéro (intro)', 0.5, 0.5, 0.3,
  'Bulevar', 389, '#FFFFFF', 'center',
  0, 1.4, 'zoom', 'in',
  false, la.id, false, 0.7, 1.0,
  'intro_mode == "numero"'
FROM neopro_templates t
JOIN template_layers la ON la.template_id = t.id AND la.name = 'A — intro hexagone (logo/numéro)'
WHERE t.name = 'BUT Simple'
ON CONFLICT (template_id, slot_key) DO NOTHING;

-- =============================================================================
-- 9. CORRECTIONS IMAGE SLOTS
-- =============================================================================
-- logoSrc Joueur détaillé : zoom, scale 1.0→1.19
UPDATE template_image_slots SET animation = 'zoom', animation_direction = 'in', scale_from = 1.0, scale_to = 1.19
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'logoSrc';

-- playerImgSrc Joueur détaillé : anchor top-center, safe_zone spec
UPDATE template_image_slots SET
  anchor = 'top-center', safe_top_pct = 0, safe_left_pct = 35, safe_width_pct = 30, safe_height_pct = 100
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'playerImgSrc';

-- logoSrc BUT Simple : zoom, scale 1.0→1.19, layer A
UPDATE template_image_slots SET
  animation = 'zoom', animation_direction = 'in', scale_from = 1.0, scale_to = 1.19,
  layer_id = (SELECT id FROM template_layers WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple') AND name = 'A — intro hexagone (logo/numéro)')
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND slot_key = 'logoSrc';

-- =============================================================================
-- 10. OPTIONS TEMPLATE
-- =============================================================================
INSERT INTO template_options (template_id, key, label, type, values, default_value, user_editable, sort_order)
SELECT id, 'packshot', 'Packshot', 'enum', '["generique","img"]'::jsonb, 'img', true, 1
FROM neopro_templates WHERE name = 'Joueur détaillé'
ON CONFLICT (template_id, key) DO NOTHING;

INSERT INTO template_options (template_id, key, label, type, values, default_value, user_editable, sort_order)
SELECT id, 'intro_mode', 'Intro', 'enum', '["logo","numero"]'::jsonb, 'logo', true, 1
FROM neopro_templates WHERE name = 'BUT Simple'
ON CONFLICT (template_id, key) DO NOTHING;

INSERT INTO template_options (template_id, key, label, type, values, default_value, user_editable, sort_order)
SELECT id, 'packshot', 'Packshot', 'enum', '["generique","img"]'::jsonb, 'generique', true, 2
FROM neopro_templates WHERE name = 'BUT Simple'
ON CONFLICT (template_id, key) DO NOTHING;

-- =============================================================================
-- 11. VISIBLE_IF
-- =============================================================================
-- logoSrc ButSimple : visible si intro_mode=logo
UPDATE template_image_slots SET visible_if = 'intro_mode == "logo"'
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'BUT Simple')
  AND slot_key = 'logoSrc';

-- playerImgSrc JoueurDetaille : visible si packshot=img
UPDATE template_image_slots SET visible_if = 'packshot == "img"'
WHERE template_id = (SELECT id FROM neopro_templates WHERE name = 'Joueur détaillé')
  AND slot_key = 'playerImgSrc';
