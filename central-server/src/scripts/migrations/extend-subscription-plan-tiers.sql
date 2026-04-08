-- ============================================================================
-- Migration: Extension des tiers d'abonnement (play / club / pro)
-- ============================================================================
-- Contexte: La grille tarifaire commerciale est passee a 4 offres:
--   Play (essai/entree) | Club (standard avec boitier) | Pro | Premium
--
-- La colonne sites.subscription_plan existe deja avec les valeurs legacy
-- 'trial' | 'standard' | 'premium'. Au lieu de renommer brutalement les
-- donnees (breaking pour pitch-deck metrics, badges CSS, filtres dashboard,
-- billing, metrics Prometheus, tests), cette migration est ADDITIVE:
--
--   1. La contrainte CHECK accepte les 6 valeurs: trial|standard|premium
--      + play|club|pro
--   2. Les sites existants restent sur leur valeur actuelle (aucun UPDATE)
--   3. Les nouvelles offres commerciales peuvent etre posees sur les sites
--   4. Cote applicatif, FeatureGateService traite 'standard' = 'club' et
--      'trial' = 'play' comme des alias (meme niveau de droits)
--
-- Rename de terminologie ultérieur: voir ADR-039, PR de cleanup dediee.
--
-- Pas d'impact sur:
--   - pitch-deck-metrics.sql (compte toujours trial/standard/premium)
--   - subscription.repository.ts counts (idem)
--   - metrics.service.ts Prometheus gauge labels (idem)
--   - billing.service.ts default 'standard' (idem)
--   - subscriptions-management.component.ts badges CSS `.plan-standard`
-- ============================================================================

-- 1. Remplacer la contrainte CHECK si elle existe
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Chercher et drop toute contrainte CHECK existante sur subscription_plan
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'sites'::regclass
      AND c.contype = 'c'
      AND a.attname = 'subscription_plan'
  LOOP
    EXECUTE 'ALTER TABLE sites DROP CONSTRAINT ' || quote_ident(constraint_name);
  END LOOP;
END $$;

-- 2. Ajouter la nouvelle contrainte CHECK elargie
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_subscription_plan_tier_check'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT sites_subscription_plan_tier_check
      CHECK (
        subscription_plan IS NULL
        OR subscription_plan IN (
          -- Legacy (inchangé pour retro-compat)
          'trial', 'standard', 'premium',
          -- Nouveaux tiers commerciaux
          'play', 'club', 'pro'
        )
      );
  END IF;
END $$;

-- 3. Index sur subscription_plan pour les filtres dashboard (idempotent)
CREATE INDEX IF NOT EXISTS idx_sites_subscription_plan
  ON sites (subscription_plan);

-- 4. Documentation
COMMENT ON COLUMN sites.subscription_plan IS
  'Offre commerciale du site. Valeurs legacy: trial|standard|premium. '
  'Nouveaux tiers: play|club|pro|premium. '
  'FeatureGateService traite standard=club et trial=play comme alias. '
  'Voir ADR-039 pour la strategie additive et le rename ulterieur.';
