-- Migration: Template Options + Conditional Slots — PDF JOUEUR §démarrage
--
-- Trois capabilities moteur manquantes pour répondre vraiment à la demande
-- initiale du PDF Specs Animation Joueur :
--
--   1) Options template-level (intro_mode, packshot, etc.) : choix posés au
--      démarrage par le user (« sur la Central, je souhaite avoir certaines
--      options au démarrage : choix template / choix packshot / choix
--      logo ou numéro en intro »).
--
--   2) Slots conditionnels : un slot peut être visible uniquement si une
--      option a une certaine valeur (ex. logo-club visible si intro_mode = 'logo').
--      Permet à un seul template de couvrir plusieurs combinaisons sans dupliquer
--      les rows.
--
--   3) Packshot pluggable : un template peut avoir un slot de référence vers
--      un AUTRE template (le packshot), monté en couche additionnelle au timecode
--      configuré. Permet à JOUEUR_simple/JOUEUR_but de partager 2 packshots
--      réutilisables (generique + img) sans dupliquer leurs slots.
--
-- Refs :
--   - PDF Specs Animation Joueur (intent initial)
--   - SPEC famille JOUEUR §3 (invariants partagés)
--   - ADR-108 (extension propre du runtime, pas hardcode)

-- =============================================================================
-- 1) TEMPLATE OPTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS template_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES madxp_templates(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_template_options_template
  ON template_options (template_id, sort_order);

COMMENT ON TABLE template_options IS
  'Options template-level exposées au user au démarrage (ex: intro_mode logo|numero, packshot generique|img).';
COMMENT ON COLUMN template_options.values IS
  'JSONB array des valeurs autorisées (enum) ou [true,false] (boolean).';

-- =============================================================================
-- 2) SLOTS CONDITIONNELS — visible_if expression
-- =============================================================================
--
-- Format : "<option_key> == \"<value>\"" (string match strict, single condition).
-- Format minimal volontaire pour éviter d''embarquer un parser d''expression.
-- Cas d''usage actuels (PDF JOUEUR) :
--   - logo-club : visible_if = 'intro_mode == "logo"'
--   - numero-intro : visible_if = 'intro_mode == "numero"'
--   - photo-joueur : visible_if = 'packshot == "img"'

ALTER TABLE template_text_fields
  ADD COLUMN IF NOT EXISTS visible_if TEXT;

ALTER TABLE template_image_slots
  ADD COLUMN IF NOT EXISTS visible_if TEXT;

COMMENT ON COLUMN template_text_fields.visible_if IS
  'Expression "<option_key> == \"<value>\"" — slot visible uniquement si match. NULL = toujours visible.';
COMMENT ON COLUMN template_image_slots.visible_if IS
  'Expression "<option_key> == \"<value>\"" — slot visible uniquement si match. NULL = toujours visible.';

-- =============================================================================
-- 3) PACKSHOT PLUGGABLE — référence vers un AUTRE template
-- =============================================================================
--
-- Le user choisit le packshot via une option (ex: option packshot=img/generique).
-- Le mapping "valeur option → template packshot référencé" est dans cette table.

CREATE TABLE IF NOT EXISTS template_packshot_refs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id              UUID NOT NULL REFERENCES madxp_templates(id) ON DELETE CASCADE,
  option_key               VARCHAR(64) NOT NULL,
  option_value             TEXT NOT NULL,
  packshot_template_id     UUID NOT NULL REFERENCES madxp_templates(id) ON DELETE RESTRICT,
  start_at_ms              INTEGER NOT NULL DEFAULT 0,
  z_index_offset           INT NOT NULL DEFAULT 100,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, option_key, option_value),
  CHECK (start_at_ms >= 0),
  CHECK (z_index_offset >= 0)
);

CREATE INDEX IF NOT EXISTS idx_template_packshot_refs_template
  ON template_packshot_refs (template_id);

COMMENT ON TABLE template_packshot_refs IS
  'Packshot pluggable : pour chaque (template, option_key, option_value), pointe vers le template packshot à monter en surcouche au timecode start_at_ms.';
COMMENT ON COLUMN template_packshot_refs.start_at_ms IS
  'Timecode (ms) où la couche packshot apparaît dans le clip parent.';
COMMENT ON COLUMN template_packshot_refs.z_index_offset IS
  'z_index appliqué aux layers packshot pour les empiler au-dessus du parent (default 100).';

-- =============================================================================
-- 4) Pas de backfill nécessaire — toutes les colonnes/tables sont nullable/empty.
-- =============================================================================
