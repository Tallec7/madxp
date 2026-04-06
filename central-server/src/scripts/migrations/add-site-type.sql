-- Migration: Add site_type column to sites table
-- Supports: 'pi' (hardware Raspberry Pi), 'saas' (browser-only), 'demo' (showcase)

ALTER TABLE sites ADD COLUMN IF NOT EXISTS site_type VARCHAR(20) DEFAULT 'pi';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_site_type_check'
  ) THEN
    ALTER TABLE sites ADD CONSTRAINT sites_site_type_check
      CHECK (site_type IN ('pi', 'saas', 'demo'));
  END IF;
END $$;

COMMENT ON COLUMN sites.site_type IS 'Type de site: pi (hardware), saas (browser-only), demo (vitrine)';
