-- ADR-103 Phase 0 — Cleanup web_page / livestream synthetic entries from
-- config_profiles.configuration JSONB. These entries were inadvertently added
-- via the dashboard video selector to sponsors[], categories[].videos[], or
-- timeCategories.loopVideos[] with `path = 'web_page-<ts>'` / `livestream-<ts>'`
-- (synthetic filenames), causing the TV to crash in MEDIA_ELEMENT_ERROR loop
-- (NLF SaaS incident, 2026-04-28).
--
-- This script is IDEMPOTENT: re-runs are safe (no-op if no synthetic entries
-- remain). Run via:
--
--   psql "$DATABASE_URL" -f central-server/src/scripts/cleanup-web-content-in-loops.sql
--
-- Side-effect: emits a NOTICE per profile cleaned with the count removed.
-- The pseudo-category 'Web / Live' (id='web-content') is preserved — it is
-- injected at runtime by `injectWebContentCategory` and not stored in
-- `configuration.json`. Only the rogue synthetic entries are stripped.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  rec RECORD;
  cleaned_sponsors JSONB;
  cleaned_time_categories JSONB;
  cleaned_categories JSONB;
  total_removed INT;
  profile_removed INT;
BEGIN
  total_removed := 0;

  FOR rec IN
    SELECT id, site_id, name, configuration
    FROM config_profiles
    WHERE configuration::text ~ '"path"\s*:\s*"[^"]*(web_page|livestream)-\d+'
  LOOP
    profile_removed := 0;

    -- Strip synthetic entries from sponsors[]
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO cleaned_sponsors
    FROM jsonb_array_elements(COALESCE(rec.configuration->'sponsors', '[]'::jsonb)) elem
    WHERE elem->>'path' !~ '(web_page|livestream)-\d+$';

    profile_removed := profile_removed + (
      jsonb_array_length(COALESCE(rec.configuration->'sponsors', '[]'::jsonb))
        - jsonb_array_length(cleaned_sponsors)
    );

    -- Strip synthetic entries from each timeCategories[].loopVideos[]
    SELECT COALESCE(jsonb_agg(
      tc - 'loopVideos' ||
      jsonb_build_object(
        'loopVideos',
        COALESCE((
          SELECT jsonb_agg(lv)
          FROM jsonb_array_elements(COALESCE(tc->'loopVideos', '[]'::jsonb)) lv
          WHERE lv->>'path' !~ '(web_page|livestream)-\d+$'
        ), '[]'::jsonb)
      )
    ), '[]'::jsonb)
      INTO cleaned_time_categories
    FROM jsonb_array_elements(COALESCE(rec.configuration->'timeCategories', '[]'::jsonb)) tc;

    -- Strip synthetic entries from each categories[].videos[]
    -- (recursion into subCategories left out for now — none observed in prod)
    SELECT COALESCE(jsonb_agg(
      c - 'videos' ||
      jsonb_build_object(
        'videos',
        COALESCE((
          SELECT jsonb_agg(v)
          FROM jsonb_array_elements(COALESCE(c->'videos', '[]'::jsonb)) v
          WHERE v->>'path' !~ '(web_page|livestream)-\d+$'
        ), '[]'::jsonb)
      )
    ), '[]'::jsonb)
      INTO cleaned_categories
    FROM jsonb_array_elements(COALESCE(rec.configuration->'categories', '[]'::jsonb)) c;

    UPDATE config_profiles
    SET configuration = configuration
        || jsonb_build_object('sponsors', cleaned_sponsors)
        || jsonb_build_object('timeCategories', cleaned_time_categories)
        || jsonb_build_object('categories', cleaned_categories)
    WHERE id = rec.id;

    RAISE NOTICE 'Cleaned profile % (site=%, name=%): removed % sponsor synthetic entr(y/ies)',
      rec.id, rec.site_id, rec.name, profile_removed;

    total_removed := total_removed + profile_removed;
  END LOOP;

  RAISE NOTICE 'Cleanup complete. Total sponsor synthetic entries removed: %.', total_removed;
  RAISE NOTICE 'Note: timeCategories and categories were also rewritten (any synthetic entries within stripped).';
END $$;

-- Verification: this should return 0 rows after the cleanup.
SELECT
  cp.id,
  cp.site_id,
  cp.name,
  cp.configuration::text ~ '"path"\s*:\s*"[^"]*(web_page|livestream)-\d+' AS still_has_synthetic
FROM config_profiles cp
WHERE cp.configuration::text ~ '"path"\s*:\s*"[^"]*(web_page|livestream)-\d+';

COMMIT;
