-- ADR-111 : Dedup au niveau alertRepository
-- Ajoute last_seen_at + occurrences pour transformer alerts.create() en upsert.
-- Avant cette migration : un emitter en boucle (ex: cron stuck-deployments avec cooldown
-- in-memory reseté à chaque restart Railway) crée N rows distinctes pour un même
-- (site_id, alert_type) actif. Constat 2026-05-05 : 22 688 rows à resolved en cleanup
-- (16 912 Déploiement bloqué sur RACC, 4 405 saas_empty_profile sur NOOR, etc.).

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS occurrences INTEGER DEFAULT 1 NOT NULL;

-- Backfill : pour les rows existantes, last_seen_at = created_at (pas de NULL).
UPDATE alerts SET last_seen_at = created_at WHERE last_seen_at IS NULL;

ALTER TABLE alerts ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE alerts ALTER COLUMN last_seen_at SET DEFAULT NOW();

-- Index partiel pour accélérer le lookup dedup (uniquement sur les actives).
CREATE INDEX IF NOT EXISTS idx_alerts_dedup_active
  ON alerts (site_id, alert_type)
  WHERE status = 'active';

COMMENT ON COLUMN alerts.last_seen_at IS 'Dernière fois que cette alerte a été déclenchée (bumpée à chaque récurrence). ADR-111.';
COMMENT ON COLUMN alerts.occurrences IS 'Nombre de fois que cette alerte a été déclenchée depuis sa création. ADR-111.';
