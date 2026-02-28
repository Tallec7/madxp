-- ============================================================================
-- Migration: Rename LED → Secondary Display
-- ============================================================================
-- Contexte: Le terme "LED" était trop restrictif. Le HDMI secondaire du Pi
-- peut alimenter un panneau LED bord de terrain, un parc de TV tribunes,
-- un écran géant, etc. On généralise en "secondary display".
--
-- Changements:
--   sites.led_enabled           → sites.secondary_display_enabled
--   sites.led_resolution        → sites.secondary_display_resolution
--   video_variants.display_type → valeurs 'tv'|'secondary' (était 'tv'|'led')
--   Index idx_sites_led_enabled → idx_sites_secondary_display_enabled
--
-- Rétrocompatibilité:
--   - Les Pi déjà déployés ont "ledEnabled" dans configuration.json.
--     Le watchdog et le sync-agent gèrent le fallback côté applicatif.
--   - Le répertoire "videos-led/" sur les Pi existants est renommé
--     en "videos-secondary/" par le sync-agent au prochain déploiement.
-- ============================================================================

-- 1. Rename columns on sites table (idempotent: skip if target already exists)
DO $$
BEGIN
  -- If both old and new columns exist, drop the old one (data already in new column)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'led_enabled')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'secondary_display_enabled') THEN
    ALTER TABLE sites DROP COLUMN led_enabled;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'led_enabled') THEN
    ALTER TABLE sites RENAME COLUMN led_enabled TO secondary_display_enabled;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'led_resolution')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'secondary_display_resolution') THEN
    ALTER TABLE sites DROP COLUMN led_resolution;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'led_resolution') THEN
    ALTER TABLE sites RENAME COLUMN led_resolution TO secondary_display_resolution;
  END IF;
END $$;

-- 2. Update display_type values in video_variants
UPDATE video_variants SET display_type = 'secondary' WHERE display_type = 'led';

-- 3. Drop old CHECK constraint and create new one
-- (constraint name may vary — use DO block for safety)
DO $$
BEGIN
  -- Drop all CHECK constraints on display_type column
  PERFORM 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'video_variants'
      AND column_name = 'display_type';

  IF FOUND THEN
    EXECUTE (
      SELECT string_agg(
        'ALTER TABLE video_variants DROP CONSTRAINT ' || quote_ident(conname),
        '; '
      )
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'video_variants'::regclass
        AND c.contype = 'c'
        AND a.attname = 'display_type'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_variants_display_type_check') THEN
    ALTER TABLE video_variants
      ADD CONSTRAINT video_variants_display_type_check
      CHECK (display_type IN ('tv', 'secondary'));
  END IF;
END $$;

-- 4. Rename index
ALTER INDEX IF EXISTS idx_sites_led_enabled
  RENAME TO idx_sites_secondary_display_enabled;

-- 5. Add comments for documentation
COMMENT ON COLUMN sites.secondary_display_enabled IS
  'Enable secondary display output on HDMI 1 (LED panel, chained TVs, giant screen, etc.)';
COMMENT ON COLUMN sites.secondary_display_resolution IS
  'Secondary display resolution in WxH format (e.g., 1920x384 for LED banner, 1920x1080 for TV)';
