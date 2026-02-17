-- =============================================================================
-- Migration: Add hostname_slug to sites table
-- =============================================================================
-- Stores the derived hostname for each Pi (e.g., "neopro-usap").
-- Auto-derived from club_name, unique across the fleet.
-- Allows multiple Pi to be distinguished on the same network via mDNS.
-- =============================================================================

-- 1. Ensure unaccent extension is available (needed for backfill)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Add the hostname_slug column
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS hostname_slug VARCHAR(63) DEFAULT NULL;

-- 3. Unique partial index (NULL values are not constrained)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_hostname_slug
ON sites (hostname_slug) WHERE hostname_slug IS NOT NULL;

-- 4. Backfill existing sites with derived hostnames
DO $$
DECLARE
  r RECORD;
  v_base_slug TEXT;
  v_final_slug TEXT;
  v_suffix INT;
BEGIN
  FOR r IN SELECT id, club_name FROM sites WHERE hostname_slug IS NULL ORDER BY created_at ASC LOOP
    -- Derive base slug: neopro- + slugified club_name
    v_base_slug := 'neopro-' || left(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(unaccent(r.club_name)),
            '[^a-z0-9]', '-', 'g'          -- non-alphanum → hyphen
          ),
          '-+', '-', 'g'                    -- collapse consecutive hyphens
        ),
        '^-|-$', '', 'g'                    -- trim leading/trailing hyphens
      ),
      56                                     -- max slug part length (63 - 7 for "neopro-")
    );

    -- Handle empty slug (club_name was only special chars)
    IF v_base_slug = 'neopro-' THEN
      v_base_slug := 'neopro-club';
    END IF;

    -- Resolve collisions
    v_final_slug := v_base_slug;
    v_suffix := 2;
    WHILE EXISTS (SELECT 1 FROM sites WHERE hostname_slug = v_final_slug AND id != r.id) LOOP
      v_final_slug := v_base_slug || '-' || v_suffix;
      v_suffix := v_suffix + 1;
    END LOOP;

    UPDATE sites SET hostname_slug = v_final_slug WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON COLUMN sites.hostname_slug IS 'Derived hostname for the Pi mDNS (e.g., neopro-usap). Unique, auto-derived from club_name.';

DO $$
BEGIN
  RAISE NOTICE 'Migration add-hostname-slug applied successfully. % sites backfilled.',
    (SELECT count(*) FROM sites WHERE hostname_slug IS NOT NULL);
END $$;
