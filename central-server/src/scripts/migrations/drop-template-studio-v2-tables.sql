-- ADR-129 — Kill Templates Studio V2 (data-driven legacy).
--
-- Drop des 12 tables V2 + 2 trigger functions associées.
-- Audit pré-PR (2026-05-16) : 0 usage actif en production.
--   - madxp_templates : 11 rows (9 archived, 2 zombies draft/published)
--   - template_layers/text_fields/image_slots/variants/options/versions/...
--   - remotion_render_jobs : 1 job historique du 2026-05-07 (failed)
--   - template_backgrounds : 1 row catalogue, 0 grants actifs
--
-- V1 code-driven (template_definitions + studio_*) reste intact.
-- CASCADE pour purger les FK silencieuses (template_text_fields → template_layers, etc.).
--
-- Rollback : irréversible. Si besoin de récupérer les rows, restaurer depuis
-- backup Railway de la veille (les tables et leur contenu sont préservés dans
-- les snapshots quotidiens auto-managés par Railway).

BEGIN;

-- Tables enfants (FK vers madxp_templates / template_layers / template_options) en premier.
DROP TABLE IF EXISTS madxp_template_versions CASCADE;
DROP TABLE IF EXISTS template_versions CASCADE;
DROP TABLE IF EXISTS template_packshot_refs CASCADE;
DROP TABLE IF EXISTS template_options CASCADE;
DROP TABLE IF EXISTS template_image_slots CASCADE;
DROP TABLE IF EXISTS template_text_fields CASCADE;
DROP TABLE IF EXISTS template_layers CASCADE;
DROP TABLE IF EXISTS template_variants CASCADE;
DROP TABLE IF EXISTS remotion_render_jobs CASCADE;
DROP TABLE IF EXISTS template_backgrounds_grants CASCADE;
DROP TABLE IF EXISTS template_backgrounds CASCADE;

-- Table racine.
DROP TABLE IF EXISTS madxp_templates CASCADE;

-- Trigger functions devenues orphelines (les triggers eux-mêmes sont
-- supprimés par CASCADE avec leurs tables).
DROP FUNCTION IF EXISTS madxp_templates_snapshot_version() CASCADE;
DROP FUNCTION IF EXISTS remotion_render_jobs_set_updated_at() CASCADE;

COMMIT;
