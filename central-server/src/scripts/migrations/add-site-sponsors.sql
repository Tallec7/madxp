-- =============================================================================
-- Migration: Add site_sponsors unified model
-- =============================================================================
-- Date: 2026-02-17
-- ADR: docs/analytics/ADR-SITE-SPONSORS-ANALYTICS.md (Palier 1)
-- Description:
--   1. Créer table site_sponsors (modèle unifié sponsor-par-site)
--   2. Créer table site_sponsor_videos (liaison vidéos)
--   3. Ajouter site_sponsor_id sur advertiser_impressions
--   4. Ajouter avg_spectators sur sites
--   5. Migrer données existantes depuis advertiser_sites + advertiser_videos
--   6. Backfill site_sponsor_id sur impressions existantes
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. TABLE site_sponsors
-- =============================================================================
-- Modèle unifié : un enregistrement par sponsor PAR site.
-- source='neopro' → créé automatiquement quand un advertiser est assigné à un site
-- source='local'  → créé par le club via l'admin local du Pi (Palier 3)

CREATE TABLE IF NOT EXISTS site_sponsors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    advertiser_id   UUID REFERENCES advertisers(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    logo_url        TEXT,
    contract_amount DECIMAL(10,2),
    contract_start  DATE,
    contract_end    DATE,
    source          VARCHAR(20) NOT NULL DEFAULT 'local',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_site_sponsor_source CHECK (source IN ('local', 'neopro')),
    CONSTRAINT chk_site_sponsor_status CHECK (status IN ('active', 'expired', 'paused'))
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_site_sponsors_site ON site_sponsors(site_id);
CREATE INDEX IF NOT EXISTS idx_site_sponsors_advertiser ON site_sponsors(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_site_sponsors_active ON site_sponsors(site_id, status) WHERE status = 'active';

-- Un seul site_sponsor par couple (advertiser, site) quand advertiser_id est renseigné
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_sponsors_advertiser_site
    ON site_sponsors(advertiser_id, site_id)
    WHERE advertiser_id IS NOT NULL;

-- =============================================================================
-- 2. TABLE site_sponsor_videos
-- =============================================================================
-- Liaison entre un site_sponsor et les vidéos déployées sur CE site.
-- Permet de savoir quelles vidéos sont trackées pour chaque sponsor de site.

CREATE TABLE IF NOT EXISTS site_sponsor_videos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id     UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    video_id            UUID REFERENCES videos(id) ON DELETE SET NULL,
    video_filename      VARCHAR(255) NOT NULL,
    is_primary          BOOLEAN DEFAULT false,
    added_at            TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_site_sponsor_video UNIQUE (site_sponsor_id, video_filename)
);

CREATE INDEX IF NOT EXISTS idx_site_sponsor_videos_sponsor ON site_sponsor_videos(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_site_sponsor_videos_filename ON site_sponsor_videos(video_filename);

-- =============================================================================
-- 3. AJOUTER site_sponsor_id SUR advertiser_impressions
-- =============================================================================
-- Permet de rattacher chaque impression à un sponsor de site spécifique

ALTER TABLE advertiser_impressions
    ADD COLUMN IF NOT EXISTS site_sponsor_id UUID REFERENCES site_sponsors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_impressions_site_sponsor
    ON advertiser_impressions(site_sponsor_id);
CREATE INDEX IF NOT EXISTS idx_impressions_site_sponsor_date
    ON advertiser_impressions(site_sponsor_id, played_at);

-- =============================================================================
-- 4. AJOUTER avg_spectators SUR sites
-- =============================================================================
-- Nombre moyen de spectateurs par séance, utilisé pour le calcul du reach

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS avg_spectators INTEGER;

-- =============================================================================
-- 5. MIGRATION DONNÉES : advertiser_sites → site_sponsors
-- =============================================================================
-- Créer un site_sponsor pour chaque couple (advertiser, site) existant

INSERT INTO site_sponsors (site_id, advertiser_id, name, contact_name, contact_email,
    contract_amount, contract_start, contract_end, source, status)
SELECT
    ads.site_id,
    ads.advertiser_id,
    a.name,
    a.contact_name,
    a.contact_email,
    NULL, -- contract_amount non disponible dans advertiser_sites
    ads.contract_start,
    ads.contract_end,
    'neopro',
    CASE WHEN ads.is_active THEN 'active' ELSE 'paused' END
FROM advertiser_sites ads
JOIN advertisers a ON a.id = ads.advertiser_id
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. MIGRATION DONNÉES : advertiser_videos → site_sponsor_videos
-- =============================================================================
-- Pour chaque vidéo d'annonceur, créer une entrée site_sponsor_videos
-- pour CHAQUE site_sponsor lié à cet annonceur

INSERT INTO site_sponsor_videos (site_sponsor_id, video_id, video_filename, is_primary)
SELECT
    ss.id,
    av.video_id,
    v.filename,
    av.is_primary
FROM advertiser_videos av
JOIN videos v ON v.id = av.video_id
JOIN site_sponsors ss ON ss.advertiser_id = (
    SELECT ads2.advertiser_id
    FROM advertiser_videos ads2
    WHERE ads2.video_id = av.video_id
    AND ads2.advertiser_id = ss.advertiser_id
    LIMIT 1
)
ON CONFLICT (site_sponsor_id, video_filename) DO NOTHING;

-- =============================================================================
-- 7. BACKFILL site_sponsor_id SUR IMPRESSIONS EXISTANTES
-- =============================================================================
-- Relier les impressions existantes au bon site_sponsor via video_id + site_id

UPDATE advertiser_impressions ai
SET site_sponsor_id = ss.id
FROM site_sponsor_videos ssv
JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id
WHERE ai.video_id = ssv.video_id
  AND ai.site_id = ss.site_id
  AND ai.site_sponsor_id IS NULL;

-- =============================================================================
-- 8. RLS POLICIES pour site_sponsors et site_sponsor_videos
-- =============================================================================

ALTER TABLE site_sponsors ENABLE ROW LEVEL SECURITY;

-- Policy INSERT : site authentifié peut créer ses propres sponsors
DROP POLICY IF EXISTS site_insert_own_sponsors ON site_sponsors;
CREATE POLICY site_insert_own_sponsors ON site_sponsors
    FOR INSERT
    WITH CHECK (
        (current_site_id() IS NOT NULL AND site_id = current_site_id())
        OR
        (current_site_id() IS NULL) -- Admin access
    );

-- Policy SELECT : site voit ses propres sponsors, admin voit tout
DROP POLICY IF EXISTS site_select_own_sponsors ON site_sponsors;
CREATE POLICY site_select_own_sponsors ON site_sponsors
    FOR SELECT
    USING (
        (current_site_id() IS NOT NULL AND site_id = current_site_id())
        OR
        (current_site_id() IS NULL) -- Admin access
    );

-- Policy UPDATE : admin seulement (les sites ne modifient pas directement)
DROP POLICY IF EXISTS admin_update_sponsors ON site_sponsors;
CREATE POLICY admin_update_sponsors ON site_sponsors
    FOR UPDATE
    USING (current_site_id() IS NULL);

-- Policy DELETE : admin seulement
DROP POLICY IF EXISTS admin_delete_sponsors ON site_sponsors;
CREATE POLICY admin_delete_sponsors ON site_sponsors
    FOR DELETE
    USING (current_site_id() IS NULL);

-- RLS pour site_sponsor_videos
ALTER TABLE site_sponsor_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_manage_sponsor_videos ON site_sponsor_videos;
CREATE POLICY site_manage_sponsor_videos ON site_sponsor_videos
    FOR ALL
    USING (
        site_sponsor_id IN (
            SELECT id FROM site_sponsors
            WHERE (current_site_id() IS NOT NULL AND site_id = current_site_id())
            OR (current_site_id() IS NULL)
        )
    );

-- =============================================================================
-- FIN
-- =============================================================================

COMMIT;

DO $$
DECLARE
    sponsors_count INTEGER;
    videos_count INTEGER;
    backfill_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO sponsors_count FROM site_sponsors;
    SELECT COUNT(*) INTO videos_count FROM site_sponsor_videos;
    SELECT COUNT(*) INTO backfill_count FROM advertiser_impressions WHERE site_sponsor_id IS NOT NULL;

    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Migration site_sponsors terminée!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Table site_sponsors créée (% enregistrements migrés)', sponsors_count;
    RAISE NOTICE '✅ Table site_sponsor_videos créée (% enregistrements migrés)', videos_count;
    RAISE NOTICE '✅ Colonne site_sponsor_id ajoutée sur advertiser_impressions';
    RAISE NOTICE '✅ Colonne avg_spectators ajoutée sur sites';
    RAISE NOTICE '✅ % impressions backfillées avec site_sponsor_id', backfill_count;
    RAISE NOTICE '✅ RLS policies configurées';
END $$;
