-- Migration : FTP paths rebrand NEOPRO → MadXP (ADR-133, Phase 6)
-- -----------------------------------------------------------------------------
-- ⚠️  NE PAS exécuter sans avoir au préalable :
--   1. Créé l'utilisateur FTP `u406531085.madxpvideos` chez Hostinger
--   2. Créé l'utilisateur FTP `u406531085.updatemadxp` chez Hostinger
--   3. Créé les dossiers `/madxp-video/` et `/madxp-update/` côté FTP
--   4. COPIÉ (pas déplacé) tous les fichiers /neopro-video/* → /madxp-video/*
--   5. COPIÉ tous les fichiers /neopro-update/* → /madxp-update/*
--   6. Mis à jour les env vars Railway :
--        FTP_PUBLIC_URL=https://kalonpartners.bzh/madxp-video
--        FTP_UPDATE_PUBLIC_URL=https://kalonpartners.bzh/madxp-update
--        FTP_USER=u406531085.madxpvideos (+ nouveau password)
--        FTP_UPDATE_USER=u406531085.updatemadxp (+ nouveau password)
--   7. Exécuté `npx ts-node src/scripts/audit-ftp-path-rebrand.ts` pour
--      connaître le nombre exact de rows impactées
--
-- Cette migration est IDEMPOTENTE (peut être rerun sans dommage) :
--   - Les UPDATE filtrent uniquement les rows qui contiennent encore le legacy
--     token. Si déjà migré, la condition WHERE matche 0 rows.
--
-- Stratégie : la PLUPART des URLs sont construites au runtime via
-- `${FTP_PUBLIC_URL}/${storage_path}` — donc le simple changement env var
-- migre toutes les URLs dynamiques. CE SCRIPT cible uniquement les colonnes
-- qui stockent une URL résolue (cachée, captured, embedded JSON).
--
-- Tables couvertes (depuis audit-ftp-path-rebrand.ts du 2026-05-26) :
--   - proof_of_broadcasts.screenshot_url      (varchar, URLs cachées)
--   - template_definitions.manifest_json      (jsonb,    asset URLs)
--   - (ajouter ici les autres révélées par l'audit)
--
-- Référence : ADR-133, RUNBOOK_FTP_REBRAND_MIGRATION.md
-- -----------------------------------------------------------------------------

BEGIN;

-- ── proof_of_broadcasts : screenshot_url avec URLs FTP cachées ────────────────
UPDATE public.proof_of_broadcasts
   SET screenshot_url = replace(screenshot_url, 'neopro-video', 'madxp-video')
 WHERE screenshot_url LIKE '%neopro-video%';

-- ── template_definitions.manifest_json : URLs assets embarquées (JSONB) ───────
UPDATE public.template_definitions
   SET manifest_json = replace(manifest_json::text, 'neopro-video', 'madxp-video')::jsonb
 WHERE manifest_json::text LIKE '%neopro-video%';

-- ── neopro_templates (table legacy V2, à vérifier qu'elle existe encore) ──────
-- Notes : table préservée pour rétrocompat post-ADR-129. Si supprimée, ce bloc
-- est ignoré silencieusement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'neopro_templates'
  ) THEN
    EXECUTE 'UPDATE public.neopro_templates
                SET manifest_json = replace(manifest_json::text, ''neopro-video'', ''madxp-video'')::jsonb
              WHERE manifest_json::text LIKE ''%neopro-video%''';
  END IF;
END $$;

-- ── neopro-update (OTA URLs, beaucoup moins fréquent) ─────────────────────────
UPDATE public.proof_of_broadcasts
   SET screenshot_url = replace(screenshot_url, 'neopro-update', 'madxp-update')
 WHERE screenshot_url LIKE '%neopro-update%';

UPDATE public.template_definitions
   SET manifest_json = replace(manifest_json::text, 'neopro-update', 'madxp-update')::jsonb
 WHERE manifest_json::text LIKE '%neopro-update%';

-- Validation finale : SELECT pour reporter combien il reste (devrait être 0).
DO $$
DECLARE
  remaining_video INT;
  remaining_update INT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM public.proof_of_broadcasts WHERE screenshot_url LIKE '%neopro-video%') +
    (SELECT COUNT(*) FROM public.template_definitions WHERE manifest_json::text LIKE '%neopro-video%')
    INTO remaining_video;
  SELECT
    (SELECT COUNT(*) FROM public.proof_of_broadcasts WHERE screenshot_url LIKE '%neopro-update%') +
    (SELECT COUNT(*) FROM public.template_definitions WHERE manifest_json::text LIKE '%neopro-update%')
    INTO remaining_update;
  RAISE NOTICE 'Post-migration : % rows referencent encore neopro-video, % rows neopro-update', remaining_video, remaining_update;
  RAISE NOTICE 'Si ≠ 0, relancer audit-ftp-path-rebrand.ts pour identifier les colonnes manquantes.';
END $$;

COMMIT;
