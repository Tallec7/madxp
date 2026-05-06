-- Migration : fix-saas-empty-default-profiles.sql
-- Issue #842 : les sites SaaS créés avant ce fix ont un profil par défaut avec
-- configuration = '{}', ce qui déclenche l'alerte saas_empty_profile toutes les ~30 min.
-- On initialise les clés minimales (sponsors/categories/timeCategories) pour stopper le spam.
-- Les profils qui ont déjà du contenu ne sont pas touchés (filtre sur la condition du check).

UPDATE config_profiles cp
SET
  configuration = '{"sponsors":[],"categories":[],"timeCategories":[]}'::jsonb,
  updated_at = NOW()
FROM sites s
WHERE cp.site_id = s.id
  AND s.site_type = 'saas'
  AND cp.is_default = true
  AND (
    cp.configuration IS NULL
    OR cp.configuration = '{}'::jsonb
    OR (
      NOT cp.configuration ? 'sponsors'
      AND NOT cp.configuration ? 'categories'
      AND NOT cp.configuration ? 'timeCategories'
    )
  );
