-- Migration: ADR-086 — Seed template "Joueur détaillé" (data-driven v2)
-- -----------------------------------------------------------------------------
-- Premier template livré 100 % via rows DB + assets FTP — aucun .tsx dédié.
-- Valide le moteur v2 étendu (ADR-086) : textes enfants de layer, safe-zone
-- photo, animation zoom-out, logo-pop, respect_alpha.
--
-- Assets WebM attendus à :
--   https://kalonpartners.bzh/neopro-video/template-assets/studio/joueur-detaille/
--     {A,B,C,D,E}.webm
--
-- Idempotent : NOT EXISTS guards sur le template, variant et layers.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  tpl_id    UUID;
  variant_id UUID;
  layer_a_id UUID;
  layer_b_id UUID;
  layer_c_id UUID;
  layer_d_id UUID;
  layer_e_id UUID;
  base_url  TEXT := 'https://kalonpartners.bzh/neopro-video/template-assets/studio/joueur-detaille';
BEGIN
  -- ── 1. Template row (schema_version=2 direct) ───────────────────────────
  SELECT id INTO tpl_id FROM neopro_templates WHERE composition_id = 'JoueurDetaille' LIMIT 1;

  IF tpl_id IS NULL THEN
    INSERT INTO neopro_templates (
      name, composition_id, description,
      props_schema, default_props,
      published, schema_version,
      duration_seconds, fps, canvas_width, canvas_height
    ) VALUES (
      'Joueur détaillé',
      'JoueurDetaille',
      'Template data-driven ADR-086 — 5 layers (logo-pop, titre zoom-out, photo joueur safe-zone, coins club). Toutes les capacités v2 en un seul template.',
      '[]'::jsonb, '{}'::jsonb,
      TRUE, 2,
      5.0, 30, 1920, 1080
    )
    RETURNING id INTO tpl_id;
  END IF;

  -- ── 2. Variant par défaut ────────────────────────────────────────────────
  SELECT id INTO variant_id FROM template_variants WHERE template_id = tpl_id LIMIT 1;
  IF variant_id IS NULL THEN
    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    VALUES (tpl_id, 'Classique', '', 0)
    RETURNING id INTO variant_id;
  END IF;

  -- ── 3. Layers A..E (chacun 5s, hérité par slots enfants) ─────────────────
  IF NOT EXISTS (SELECT 1 FROM template_layers WHERE template_id = tpl_id) THEN
    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'A — fond logo',      base_url || '/A.webm', 0, 5000)
    RETURNING id INTO layer_a_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'B — transition 1',   base_url || '/B.webm', 1, 5000)
    RETURNING id INTO layer_b_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'C — titre + pattern', base_url || '/C.webm', 2, 5000)
    RETURNING id INTO layer_c_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'D — transition 2',   base_url || '/D.webm', 3, 5000)
    RETURNING id INTO layer_d_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'E — joueur + nom + coins', base_url || '/E.webm', 4, 5000)
    RETURNING id INTO layer_e_id;
  ELSE
    -- Idempotent re-run : récupère les IDs existants
    SELECT id INTO layer_a_id FROM template_layers WHERE template_id = tpl_id AND z_index = 0;
    SELECT id INTO layer_b_id FROM template_layers WHERE template_id = tpl_id AND z_index = 1;
    SELECT id INTO layer_c_id FROM template_layers WHERE template_id = tpl_id AND z_index = 2;
    SELECT id INTO layer_d_id FROM template_layers WHERE template_id = tpl_id AND z_index = 3;
    SELECT id INTO layer_e_id FROM template_layers WHERE template_id = tpl_id AND z_index = 4;
  END IF;

  -- ── 4. Text fields (enfants de layer, ADR-086) ───────────────────────────
  -- Titre : layer C, zoom-out (preset=zoom, direction=out, scaleFrom=1 → scaleTo=1.5)
  INSERT INTO template_text_fields (
    template_id, slot_key, label,
    position_x, position_y, max_width,
    font_family, font_size, color, align,
    appear_at, appear_duration, animation, animation_direction,
    default_value, required, sort_order,
    layer_id, respect_alpha, scale_from, scale_to
  )
  VALUES
    (tpl_id, 'titre', 'Titre', 0.5, 0.25, 0.9,
     'Bulevar', 140, '#FFFFFF', 'center',
     0, 0.8, 'zoom', 'out',
     'BUT !', TRUE, 0,
     layer_c_id, FALSE, 1.0, 1.5),

    -- Prénom : layer E, respect_alpha (visible hors zones opaques de E)
    (tpl_id, 'prenom', 'Prénom', 0.05, 0.45, 0.45,
     'Bulevar', 180, '#FFFFFF', 'left',
     0, 0.6, 'fade', 'in',
     'PRÉNOM', TRUE, 1,
     layer_e_id, TRUE, 1.0, 1.0),

    -- Nom : layer E, respect_alpha
    (tpl_id, 'nom', 'Nom', 0.05, 0.58, 0.45,
     'Bulevar', 180, '#FFFFFF', 'left',
     0, 0.6, 'fade', 'in',
     'NOM', TRUE, 2,
     layer_e_id, TRUE, 1.0, 1.0),

    -- Club coin haut-gauche
    (tpl_id, 'clubTopLeft', 'Club (coin haut-gauche)', 0.05, 0.05, 0.4,
     'General Sans', 28, '#FFFFFF', 'left',
     0, 0.6, 'fade', 'in',
     'CLUB', FALSE, 3,
     layer_e_id, FALSE, 1.0, 1.0),

    -- Club coin bas-gauche
    (tpl_id, 'clubBottomLeft', 'Club (coin bas-gauche)', 0.05, 0.95, 0.4,
     'General Sans', 28, '#FFFFFF', 'left',
     0, 0.6, 'fade', 'in',
     'CLUB', FALSE, 4,
     layer_e_id, FALSE, 1.0, 1.0),

    -- Club coin bas-droit
    (tpl_id, 'clubBottomRight', 'Club (coin bas-droit)', 0.95, 0.95, 0.4,
     'General Sans', 28, '#FFFFFF', 'right',
     0, 0.6, 'fade', 'in',
     'CLUB', FALSE, 5,
     layer_e_id, FALSE, 1.0, 1.0),

    -- Numéro joueur : layer E, respect_alpha (affiché sous E, révélé par alpha)
    (tpl_id, 'numero', 'Numéro', 0.75, 0.35, 0.25,
     'Bulevar', 300, '#FFFFFF', 'center',
     0, 0.8, 'fade', 'in',
     '9', FALSE, 6,
     layer_e_id, TRUE, 1.0, 1.0)
  ON CONFLICT (template_id, slot_key) DO NOTHING;

  -- ── 5. Image slots ───────────────────────────────────────────────────────
  -- Logo : layer A, logo-pop (scaleFrom=0 → scaleTo=1), centré
  INSERT INTO template_image_slots (
    template_id, slot_key, label,
    position_x, position_y, width, height,
    appear_at, appear_duration, animation, animation_direction,
    aspect_ratio, required, sort_order,
    layer_id, anchor, fit_mode,
    safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
    overflow, scale_from, scale_to
  )
  VALUES
    (tpl_id, 'logoSrc', 'Logo club',
     0.5, 0.5, 0.20, 0.20,
     0, 0.4, 'logo-pop', 'in',
     '1:1', FALSE, 0,
     layer_a_id, 'center', 'contain',
     NULL, NULL, NULL, NULL,
     'hidden', 0.0, 1.0),

    -- Photo joueur : layer E, safe-zone droite de l'écran (fill-width-anchor-top)
    -- rectangle safe 55..95 % largeur, 10..95 % hauteur (bas du cadre) — la photo
    -- remplit la largeur du safe et se cale ancrée haut, débordement bas masqué.
    (tpl_id, 'playerImgSrc', 'Photo joueur',
     0.75, 0.55, 0.40, 0.85,
     0, 0.6, 'fade', 'in',
     '3:4', FALSE, 1,
     layer_e_id, 'bottom-center', 'fill-width-anchor-top',
     10.0, 55.0, 40.0, 85.0,
     'bottom', NULL, NULL)
  ON CONFLICT (template_id, slot_key) DO NOTHING;
END$$;

COMMENT ON COLUMN neopro_templates.schema_version IS
  'ADR-075/086 : 1 = legacy (composition codée), 2 = data-driven (runtime générique). Joueur détaillé = premier template 100 % data-driven.';
