-- =============================================================================
-- Migration: Validation des contrats sponsors
-- =============================================================================
-- Date: 2025-12-28
-- Description: Ajoute les index et fonctions pour la validation des contrats
--              sponsors lors du déploiement et de l'affichage des analytics.
-- =============================================================================

-- =============================================================================
-- 1. INDEX POUR PERFORMANCE DES REQUÊTES PAR DATES DE CONTRAT
-- =============================================================================

-- Index composite pour filtrage par sponsor et dates de contrat actif
CREATE INDEX IF NOT EXISTS idx_sponsor_sites_contract_active
  ON sponsor_sites(sponsor_id, site_id)
  WHERE is_active = true;

-- Index pour recherche par dates de contrat
CREATE INDEX IF NOT EXISTS idx_sponsor_sites_contract_dates
  ON sponsor_sites(contract_start, contract_end)
  WHERE is_active = true;

-- =============================================================================
-- 2. FONCTION DE VÉRIFICATION DE CONTRAT ACTIF
-- =============================================================================

/**
 * Vérifie si un contrat sponsor est actif pour un site donné à une date donnée.
 *
 * Un contrat est considéré actif si:
 * - is_active = true
 * - contract_start est NULL ou <= date de vérification
 * - contract_end est NULL ou >= date de vérification
 *
 * @param p_sponsor_id UUID du sponsor
 * @param p_site_id UUID du site
 * @param p_check_date Date de vérification (défaut: aujourd'hui)
 * @returns BOOLEAN true si le contrat est actif
 */
CREATE OR REPLACE FUNCTION is_sponsor_contract_active(
  p_sponsor_id UUID,
  p_site_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sponsor_sites
    WHERE sponsor_id = p_sponsor_id
      AND site_id = p_site_id
      AND is_active = true
      AND (contract_start IS NULL OR contract_start <= p_check_date)
      AND (contract_end IS NULL OR contract_end >= p_check_date)
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_sponsor_contract_active IS
  'Vérifie si un contrat sponsor-site est actif à une date donnée';

-- =============================================================================
-- 3. FONCTION POUR OBTENIR LES SITES AVEC CONTRAT ACTIF D'UN SPONSOR
-- =============================================================================

/**
 * Retourne les IDs des sites ayant un contrat actif avec un sponsor.
 *
 * @param p_sponsor_id UUID du sponsor
 * @param p_check_date Date de vérification (défaut: aujourd'hui)
 * @returns TABLE(site_id UUID) Liste des sites avec contrat actif
 */
CREATE OR REPLACE FUNCTION get_sponsor_active_sites(
  p_sponsor_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(site_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT ss.site_id
  FROM sponsor_sites ss
  WHERE ss.sponsor_id = p_sponsor_id
    AND ss.is_active = true
    AND (ss.contract_start IS NULL OR ss.contract_start <= p_check_date)
    AND (ss.contract_end IS NULL OR ss.contract_end >= p_check_date);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_sponsor_active_sites IS
  'Retourne les sites ayant un contrat actif avec un sponsor';

-- =============================================================================
-- 4. FONCTION POUR OBTENIR LES SPONSORS ACTIFS D'UN SITE
-- =============================================================================

/**
 * Retourne les IDs des sponsors ayant un contrat actif avec un site.
 *
 * @param p_site_id UUID du site
 * @param p_check_date Date de vérification (défaut: aujourd'hui)
 * @returns TABLE(sponsor_id UUID) Liste des sponsors avec contrat actif
 */
CREATE OR REPLACE FUNCTION get_site_active_sponsors(
  p_site_id UUID,
  p_check_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(sponsor_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT ss.sponsor_id
  FROM sponsor_sites ss
  WHERE ss.site_id = p_site_id
    AND ss.is_active = true
    AND (ss.contract_start IS NULL OR ss.contract_start <= p_check_date)
    AND (ss.contract_end IS NULL OR ss.contract_end >= p_check_date);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_site_active_sponsors IS
  'Retourne les sponsors ayant un contrat actif avec un site';

-- =============================================================================
-- 5. VUE MISE À JOUR: SITES ACCESSIBLES PAR SPONSOR AVEC STATUT CONTRAT
-- =============================================================================

-- Remplacer la vue existante avec le statut du contrat
DROP VIEW IF EXISTS sponsor_accessible_sites;

CREATE VIEW sponsor_accessible_sites AS
SELECT
  ss.sponsor_id,
  s.id as site_id,
  s.site_name,
  s.club_name,
  s.location,
  s.status,
  s.last_seen_at,
  ss.contract_start,
  ss.contract_end,
  ss.is_active,
  -- Calcul du statut du contrat
  CASE
    WHEN NOT ss.is_active THEN 'inactive'
    WHEN ss.contract_start IS NOT NULL AND ss.contract_start > CURRENT_DATE THEN 'pending'
    WHEN ss.contract_end IS NOT NULL AND ss.contract_end < CURRENT_DATE THEN 'expired'
    ELSE 'active'
  END as contract_status,
  -- Jours restants avant expiration (NULL si pas de date de fin)
  CASE
    WHEN ss.contract_end IS NOT NULL AND ss.contract_end >= CURRENT_DATE
    THEN ss.contract_end - CURRENT_DATE
    ELSE NULL
  END as days_remaining
FROM sponsor_sites ss
JOIN sites s ON s.id = ss.site_id;

COMMENT ON VIEW sponsor_accessible_sites IS
  'Sites accessibles pour un sponsor avec statut du contrat (active/pending/expired/inactive)';

-- =============================================================================
-- 6. COMMENTAIRES
-- =============================================================================

COMMENT ON INDEX idx_sponsor_sites_contract_active IS
  'Index pour recherche rapide des contrats actifs par sponsor';

COMMENT ON INDEX idx_sponsor_sites_contract_dates IS
  'Index pour filtrage par dates de contrat';

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Migration sponsor-contract-validation terminée!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Fonctions ajoutées:';
  RAISE NOTICE '  - is_sponsor_contract_active(sponsor_id, site_id, date)';
  RAISE NOTICE '  - get_sponsor_active_sites(sponsor_id, date)';
  RAISE NOTICE '  - get_site_active_sponsors(site_id, date)';
  RAISE NOTICE '';
  RAISE NOTICE 'Vue mise à jour:';
  RAISE NOTICE '  - sponsor_accessible_sites (avec contract_status et days_remaining)';
END $$;
