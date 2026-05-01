-- Migration: SPEC PDF JOUEUR — Seed 3 templates manquants
-- -----------------------------------------------------------------------------
-- Source : docs/templates/template-joueur-simple/SPEC.md, template-joueur-but/SPEC.md,
--          packshots/generique/SPEC.md, packshots/img/SPEC.md
-- PDF    : docs/templates/SPEC-Animation-Joueur.pdf (Daisy 30/04/2026)
--
-- Modèle data-driven ADR-086. 4 templates au total pour couvrir le PDF :
--   1. Joueur Simple — Générique  (NEW : 2 layers + packshot generique)
--   2. Joueur Simple — Image      (NEW : 2 layers + packshot img)
--   3. Joueur But — Générique     (NEW : 4 layers + packshot generique)
--   4. Joueur But — Image         (= "Joueur détaillé" existant ADR-086)
--
-- WebM URLs : placeholders Railway sur le pattern existant. À swapper via
-- l'admin Template Studio (PATCH /:id/layers/:layerId) une fois les WebM
-- yuva420p (ou yuv420p si mon diagnostic alpha s'avère faux) uploadés par
-- le designer.
--
-- Idempotent : NOT EXISTS guards sur composition_id.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  base_url TEXT := 'https://neopro-central-production.up.railway.app/remotion-preview/public';
  simple_a_url TEXT := base_url || '/JOUEUR_simple_A.webm';
  simple_b_url TEXT := base_url || '/JOUEUR_simple_B.webm';
  but_a_url TEXT := base_url || '/JOUEUR_but_A.webm';
  but_b_url TEXT := base_url || '/JOUEUR_but_B.webm';
  but_c_url TEXT := base_url || '/JOUEUR_but_C.webm';
  but_d_url TEXT := base_url || '/JOUEUR_but_D.webm';
  packshot_generic_url TEXT := base_url || '/PACKSHOT_GENERIQUE.webm';
  packshot_img_url TEXT := base_url || '/PACKSHOT_IMG.webm';
  tpl_id UUID;
  variant_id UUID;
  layer_a_id UUID;
  layer_b_id UUID;
  layer_c_id UUID;
  layer_d_id UUID;
  layer_packshot_id UUID;
BEGIN

  -- =========================================================================
  -- 1. JOUEUR SIMPLE — GÉNÉRIQUE
  -- =========================================================================
  -- 3 layers : A intro hexagone (logo OU numéro) + B transition + packshot générique
  -- Options : intro_mode (logo/numero)
  -- Durée   : 5.96s @ 25fps (= 5960 ms)

  SELECT id INTO tpl_id FROM neopro_templates
   WHERE composition_id = 'JoueurSimpleGenerique' LIMIT 1;

  IF tpl_id IS NULL THEN
    INSERT INTO neopro_templates (
      name, composition_id, description,
      props_schema, default_props,
      published, schema_version,
      duration_seconds, fps, canvas_width, canvas_height
    ) VALUES (
      'Joueur Simple — Générique',
      'JoueurSimpleGenerique',
      'Annonce joueur courte (logo ou numéro intro) puis packshot générique. SPEC PDF JOUEUR §1A.',
      '[]'::jsonb, '{}'::jsonb,
      TRUE, 2,
      5.96, 25, 1920, 1080
    ) RETURNING id INTO tpl_id;

    -- Variant Classique (fond vide, pas de couleur de fond paramétrable v1)
    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    VALUES (tpl_id, 'Classique', '', 0)
    RETURNING id INTO variant_id;

    -- Layer A : intro hexagone (logo OU numéro)
    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'A — intro hexagone', simple_a_url, 0, 5960)
    RETURNING id INTO layer_a_id;

    -- Layer B : transition vers packshot
    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'B — transition', simple_b_url, 1, 5960)
    RETURNING id INTO layer_b_id;

    -- Layer Packshot : fond + cadre packshot générique
    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'P — packshot générique', packshot_generic_url, 2, 5960)
    RETURNING id INTO layer_packshot_id;

    -- Option intro_mode (logo OU numéro)
    INSERT INTO template_options (template_id, key, label, type, values, default_value, sort_order)
    VALUES (
      tpl_id, 'intro_mode', 'Intro', 'enum',
      '["logo","numero"]'::jsonb, 'logo', 0
    );

    -- Slot logo club (visible si intro_mode = logo)
    INSERT INTO template_image_slots (
      template_id, slot_key, label,
      position_x, position_y, width, height,
      appear_at, appear_duration, animation, animation_direction,
      aspect_ratio, required, sort_order,
      layer_id, anchor, fit_mode,
      safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
      overflow, scale_from, scale_to, visible_if
    ) VALUES (
      tpl_id, 'logoSrc', 'Logo du club',
      0.5, 0.5, 0.25, 0.5,
      0, 1.7, 'zoom', 'in',
      '1:1', FALSE, 0,
      layer_a_id, 'center', 'contain',
      25.0, 37.5, 25.0, 50.0,
      'hidden', 0.0, 1.19,
      'intro_mode == "logo"'
    );

    -- Slot numéro intro (visible si intro_mode = numero)
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha, scale_from, scale_to, visible_if
    ) VALUES (
      tpl_id, 'numeroIntro', 'Numéro (intro)',
      0.5, 0.5, 0.25,
      'Bulevar', 400, '#FFFFFF', 'center',
      0, 1.7, 'zoom', 'in',
      '10', FALSE, 0,
      layer_a_id, FALSE, 0.0, 1.19,
      'intro_mode == "numero"'
    );

    -- Slot Nom du club (haut) — sur layer Packshot, respect_alpha
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha
    ) VALUES (
      tpl_id, 'nomClubHaut', 'Nom du club',
      0.5, 0.136, 0.8,
      'General Sans', 25, '#FFFFFF', 'center',
      0, 0.6, 'fade', 'in',
      'NOM DU CLUB', TRUE, 1,
      layer_packshot_id, TRUE
    );

    -- Slot Nom du club (bas) — auto-rempli depuis nomClubHaut côté UI
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha
    ) VALUES (
      tpl_id, 'nomClubBas', 'Nom du club (bas)',
      0.5, 0.864, 0.8,
      'General Sans', 25, '#FFFFFF', 'center',
      0, 0.6, 'fade', 'in',
      'NOM DU CLUB', FALSE, 2,
      layer_packshot_id, TRUE
    );

    -- Slot Prénom / Nom — gros texte central sur 2 lignes
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha
    ) VALUES (
      tpl_id, 'prenomNom', 'Prénom / Nom',
      0.5, 0.5, 0.85,
      'Bulevar', 389, '#FFFFFF', 'center',
      0, 0.6, 'fade', 'in',
      'PRÉNOM' || E'\n' || 'NOM', TRUE, 3,
      layer_packshot_id, TRUE
    );

    RAISE NOTICE 'Created template: Joueur Simple — Générique (id=%)', tpl_id;
  ELSE
    RAISE NOTICE 'Skipped (already exists): Joueur Simple — Générique';
  END IF;

  -- Reset locals pour le prochain template
  tpl_id := NULL;
  layer_a_id := NULL; layer_b_id := NULL; layer_packshot_id := NULL;

  -- =========================================================================
  -- 2. JOUEUR SIMPLE — IMAGE
  -- =========================================================================
  -- Idem SIMPLE_GENERIQUE mais layer packshot remplacé par packshot IMG
  -- + slot photo joueur + textes asymétriques (gauche prénom, droite numéro)

  SELECT id INTO tpl_id FROM neopro_templates
   WHERE composition_id = 'JoueurSimpleImage' LIMIT 1;

  IF tpl_id IS NULL THEN
    INSERT INTO neopro_templates (
      name, composition_id, description,
      props_schema, default_props,
      published, schema_version,
      duration_seconds, fps, canvas_width, canvas_height
    ) VALUES (
      'Joueur Simple — Image',
      'JoueurSimpleImage',
      'Annonce joueur courte avec photo joueur détourée. SPEC PDF JOUEUR §1A + §2.B.',
      '[]'::jsonb, '{}'::jsonb,
      TRUE, 2,
      5.96, 25, 1920, 1080
    ) RETURNING id INTO tpl_id;

    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    VALUES (tpl_id, 'Classique', '', 0);

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'A — intro hexagone', simple_a_url, 0, 5960)
    RETURNING id INTO layer_a_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'B — transition', simple_b_url, 1, 5960)
    RETURNING id INTO layer_b_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'P — packshot image', packshot_img_url, 2, 5960)
    RETURNING id INTO layer_packshot_id;

    INSERT INTO template_options (template_id, key, label, type, values, default_value, sort_order)
    VALUES (
      tpl_id, 'intro_mode', 'Intro', 'enum',
      '["logo","numero"]'::jsonb, 'logo', 0
    );

    -- Slot logo (intro mode logo)
    INSERT INTO template_image_slots (
      template_id, slot_key, label,
      position_x, position_y, width, height,
      appear_at, appear_duration, animation, animation_direction,
      aspect_ratio, required, sort_order,
      layer_id, anchor, fit_mode,
      safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
      overflow, scale_from, scale_to, visible_if
    ) VALUES (
      tpl_id, 'logoSrc', 'Logo du club',
      0.5, 0.5, 0.25, 0.5,
      0, 1.7, 'zoom', 'in',
      '1:1', FALSE, 0,
      layer_a_id, 'center', 'contain',
      25.0, 37.5, 25.0, 50.0,
      'hidden', 0.0, 1.19,
      'intro_mode == "logo"'
    );

    -- Slot numéro (intro mode numero)
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha, scale_from, scale_to, visible_if
    ) VALUES (
      tpl_id, 'numeroIntro', 'Numéro (intro)',
      0.5, 0.5, 0.25,
      'Bulevar', 400, '#FFFFFF', 'center',
      0, 1.7, 'zoom', 'in',
      '10', FALSE, 0,
      layer_a_id, FALSE, 0.0, 1.19,
      'intro_mode == "numero"'
    );

    -- Photo joueur — safe-zone droite, fill-width-anchor-top
    INSERT INTO template_image_slots (
      template_id, slot_key, label,
      position_x, position_y, width, height,
      appear_at, appear_duration, animation, animation_direction,
      aspect_ratio, required, sort_order,
      layer_id, anchor, fit_mode,
      safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
      overflow, scale_from, scale_to
    ) VALUES (
      tpl_id, 'photoJoueur', 'Photo joueur (PNG détouré)',
      0.7, 0.5, 0.30, 1.0,
      0, 0.6, 'fade', 'in',
      '3:4', FALSE, 1,
      layer_packshot_id, 'top-center', 'fill-width-anchor-top',
      0.0, 50.0, 30.0, 100.0,
      'bottom', NULL, NULL
    );

    -- Nom club coin haut-gauche
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha
    ) VALUES
      (tpl_id, 'clubTopLeft', 'Club (coin haut-gauche)', 0.049, 0.1, 0.4,
       'General Sans', 25, '#FFFFFF', 'left', 0, 0.6, 'fade', 'in',
       'NOM DU CLUB', TRUE, 1, layer_packshot_id, TRUE),
      (tpl_id, 'clubBottomLeft', 'Club (coin bas-gauche)', 0.049, 0.918, 0.4,
       'General Sans', 25, '#FFFFFF', 'left', 0, 0.6, 'fade', 'in',
       'NOM DU CLUB', FALSE, 2, layer_packshot_id, TRUE),
      (tpl_id, 'clubBottomRight', 'Club (coin bas-droit)', 0.95, 0.918, 0.4,
       'General Sans', 25, '#FFFFFF', 'right', 0, 0.6, 'fade', 'in',
       'NOM DU CLUB', FALSE, 3, layer_packshot_id, TRUE),
      -- Prénom / Nom asymétrique gauche
      (tpl_id, 'prenomNom', 'Prénom / Nom', 0.133, 0.5, 0.45,
       'Bulevar', 150, '#FFFFFF', 'left', 0, 0.6, 'fade', 'in',
       'PRÉNOM' || E'\n' || 'NOM', TRUE, 4, layer_packshot_id, TRUE),
      -- Numéro géant droite (sur la photo, pas masqué)
      (tpl_id, 'numero', 'Numéro', 0.867, 0.5, 0.15,
       'Bulevar', 300, '#FFFFFF', 'right', 0, 0.6, 'fade', 'in',
       '10', FALSE, 5, layer_packshot_id, FALSE);

    RAISE NOTICE 'Created template: Joueur Simple — Image (id=%)', tpl_id;
  ELSE
    RAISE NOTICE 'Skipped (already exists): Joueur Simple — Image';
  END IF;

  tpl_id := NULL;
  layer_a_id := NULL; layer_b_id := NULL; layer_c_id := NULL;
  layer_d_id := NULL; layer_packshot_id := NULL;

  -- =========================================================================
  -- 3. JOUEUR BUT — GÉNÉRIQUE
  -- =========================================================================
  -- 5 layers : A logo + B transition1 + C titre + D transition2 + packshot generic
  -- Pas d'option intro_mode (toujours logo en intro pour BUT)
  -- Durée : 6.96s @ 25fps

  SELECT id INTO tpl_id FROM neopro_templates
   WHERE composition_id = 'JoueurButGenerique' LIMIT 1;

  IF tpl_id IS NULL THEN
    INSERT INTO neopro_templates (
      name, composition_id, description,
      props_schema, default_props,
      published, schema_version,
      duration_seconds, fps, canvas_width, canvas_height
    ) VALUES (
      'Joueur But — Générique',
      'JoueurButGenerique',
      'Annonce joueur "BUT" avec titre animé puis packshot générique. SPEC PDF JOUEUR §1B.',
      '[]'::jsonb, '{}'::jsonb,
      TRUE, 2,
      6.96, 25, 1920, 1080
    ) RETURNING id INTO tpl_id;

    INSERT INTO template_variants (template_id, name, background_video_url, sort_order)
    VALUES (tpl_id, 'Classique', '', 0);

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'A — intro logo', but_a_url, 0, 6960)
    RETURNING id INTO layer_a_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'B — transition 1', but_b_url, 1, 6960)
    RETURNING id INTO layer_b_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'C — titre + pattern', but_c_url, 2, 6960)
    RETURNING id INTO layer_c_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'D — transition 2', but_d_url, 3, 6960)
    RETURNING id INTO layer_d_id;

    INSERT INTO template_layers (template_id, name, video_url, z_index, duration_ms)
    VALUES (tpl_id, 'P — packshot générique', packshot_generic_url, 4, 6960)
    RETURNING id INTO layer_packshot_id;

    -- Logo club intro (zoom-in 0 → 1.19, durée 2.12s)
    INSERT INTO template_image_slots (
      template_id, slot_key, label,
      position_x, position_y, width, height,
      appear_at, appear_duration, animation, animation_direction,
      aspect_ratio, required, sort_order,
      layer_id, anchor, fit_mode,
      safe_top_pct, safe_left_pct, safe_width_pct, safe_height_pct,
      overflow, scale_from, scale_to
    ) VALUES (
      tpl_id, 'logoSrc', 'Logo du club',
      0.5, 0.5, 0.25, 0.5,
      0, 2.12, 'zoom', 'in',
      '1:1', FALSE, 0,
      layer_a_id, 'center', 'contain',
      25.0, 37.5, 25.0, 50.0,
      'hidden', 0.0, 1.19
    );

    -- Titre "BUT" zoom-out scale_from=0.77 → scale_to=1.0, délai 0.92s, durée 1.2s
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha, scale_from, scale_to
    ) VALUES (
      tpl_id, 'titre', 'Titre',
      0.5, 0.5, 0.85,
      'Bulevar', 389, '#FFFFFF', 'center',
      0.92, 1.2, 'zoom', 'out',
      'BUT', TRUE, 0,
      layer_c_id, TRUE, 0.77, 1.0
    );

    -- Textes packshot générique (haut + bas + prenom-nom centré)
    INSERT INTO template_text_fields (
      template_id, slot_key, label,
      position_x, position_y, max_width,
      font_family, font_size, color, align,
      appear_at, appear_duration, animation, animation_direction,
      default_value, required, sort_order,
      layer_id, respect_alpha
    ) VALUES
      (tpl_id, 'nomClubHaut', 'Nom du club', 0.5, 0.136, 0.8,
       'General Sans', 25, '#FFFFFF', 'center', 0, 0.6, 'fade', 'in',
       'NOM DU CLUB', TRUE, 1, layer_packshot_id, TRUE),
      (tpl_id, 'nomClubBas', 'Nom du club (bas)', 0.5, 0.864, 0.8,
       'General Sans', 25, '#FFFFFF', 'center', 0, 0.6, 'fade', 'in',
       'NOM DU CLUB', FALSE, 2, layer_packshot_id, TRUE),
      (tpl_id, 'prenomNom', 'Prénom / Nom', 0.5, 0.5, 0.85,
       'Bulevar', 389, '#FFFFFF', 'center', 0, 0.6, 'fade', 'in',
       'PRÉNOM' || E'\n' || 'NOM', TRUE, 3, layer_packshot_id, TRUE);

    RAISE NOTICE 'Created template: Joueur But — Générique (id=%)', tpl_id;
  ELSE
    RAISE NOTICE 'Skipped (already exists): Joueur But — Générique';
  END IF;

END$$;

-- -----------------------------------------------------------------------------
-- À FAIRE après migration :
--   1. Tester rendu de "Joueur Simple — Générique" en super_admin (lance render
--      depuis /content/templates → vérifier vidéo générée).
--   2. Si KO sur les WebM (404 sur Railway), uploader les WebM yuva420p via
--      l'admin Template Studio → re-link via PATCH layers.video_url.
--   3. Le template existant "Joueur détaillé" (ADR-086) sert de "Joueur But —
--      Image" — le renommer manuellement via admin si besoin de cohérence
--      avec le naming PDF.
--   4. Tester chaque template avec l'option intro_mode (logo vs numero) côté
--      formulaire de rendu pour valider visible_if.
-- -----------------------------------------------------------------------------
