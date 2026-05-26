-- Migration: HELLO TEST — Template minimal pour valider le moteur from scratch
-- -----------------------------------------------------------------------------
-- Template ultra-minimal pour valider la chaîne de rendu Remotion V2 sans
-- aucune dépendance complexe (pas de safe-zone, pas de packshot, pas
-- d'options, pas de visible_if).
--
-- Composition :
--   - 1 layer WebM (asset Railway connu fonctionnel)
--   - 1 slot texte centré (Prénom)
--   - 1 slot image optionnel (logo)
--
-- Si ce template rend une vidéo correctement, on a confirmé que :
--   1. La queue async Remotion tourne
--   2. Les WebM yuv420p Railway sont compatibles avec le moteur
--   3. Les slots texte se composent bien sur les WebM
--   4. Les image_slots fonctionnent
--
-- Idempotent : NOT EXISTS guard sur composition_id.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  tpl_id UUID;
  variant_id UUID;
  layer_id UUID;
  -- Asset Railway connu fonctionnel (utilisé par "Joueur détaillé")
  webm_url TEXT := 'https://neopro-central-production.up.railway.app/remotion-preview/public/BUT_img_joueur_E.webm';
BEGIN
  SELECT id INTO tpl_id FROM madxp_templates
   WHERE composition_id = 'HelloTest' LIMIT 1;

  IF tpl_id IS NOT NULL THEN
    RAISE NOTICE 'Skipped (already exists): Hello Test (id=%)', tpl_id;
    RETURN;
  END IF;

  -- ── 1. Template row ─────────────────────────────────────────────────────
  INSERT INTO madxp_templates (
    name, composition_id, description,
    props_schema, default_props,
    published, schema_version,
    duration_seconds, fps, canvas_width, canvas_height
  ) VALUES (
    'Hello Test',
    'HelloTest',
    'Template minimal pour valider le moteur Remotion V2 from scratch (1 layer + 1 texte + 1 image).',
    '[]'::jsonb, '{}'::jsonb,
    TRUE, 2,
    5.0, 30, 1920, 1080
  ) RETURNING id INTO tpl_id;

  -- ── 2. Variant par défaut ───────────────────────────────────────────────
  INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
  VALUES (tpl_id, 'Classique', '', 0)
  RETURNING id INTO variant_id;

  -- ── 3. Layer unique ─────────────────────────────────────────────────────
  INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
  VALUES (tpl_id, 'Fond test', webm_url, 0, 5000)
  RETURNING id INTO layer_id;

  -- ── 4. Text field unique ────────────────────────────────────────────────
  INSERT INTO template_text_fields (
    template_id, slot_key, label,
    position_x, position_y, max_width,
    font_family, font_size, color, align,
    appear_at, appear_duration, animation, animation_direction,
    default_value, required, sort_order,
    layer_id, respect_alpha, scale_from, scale_to
  ) VALUES (
    tpl_id, 'message', 'Message',
    0.5, 0.5, 0.8,
    'Bulevar', 200, '#FFFFFF', 'center',
    0, 0.6, 'fade', 'in',
    'HELLO !', TRUE, 0,
    layer_id, FALSE, 1.0, 1.0
  );

  -- ── 5. Image slot unique (optionnel — facilite le test sans uploader) ──
  INSERT INTO template_image_slots (
    template_id, slot_key, label,
    position_x, position_y, width, height,
    appear_at, appear_duration, animation, animation_direction,
    aspect_ratio, required, sort_order,
    layer_id, anchor, fit_mode,
    overflow, scale_from, scale_to
  ) VALUES (
    tpl_id, 'logo', 'Logo (optionnel)',
    0.5, 0.2, 0.15, 0.15,
    0, 0.4, 'fade', 'in',
    '1:1', FALSE, 0,
    layer_id, 'center', 'contain',
    'hidden', 0.0, 1.0
  );

  RAISE NOTICE 'Created template: Hello Test (id=%)', tpl_id;
END$$;
