-- =============================================================================
-- Migration: Remote Command Audit (ADR-081 Phase 0)
-- =============================================================================
-- Trace chaque commande télécommande relayée par le central server.
-- Permet de mesurer le taux de drop apparent (roomSize === 0) et de préparer
-- l'infrastructure pour l'ACK/retry des phases suivantes.
-- TTL: 7 jours (cleanup quotidien via cron-scheduler).
-- =============================================================================

CREATE TABLE IF NOT EXISTS remote_command_audit (
  command_id UUID PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  command_type VARCHAR(50) NOT NULL,
  emitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  acked_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'emitted',
  latency_ms INTEGER,
  room_size INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',

  CONSTRAINT check_status CHECK (status IN ('emitted', 'acked', 'dropped', 'debounced', 'unreachable'))
);

CREATE INDEX IF NOT EXISTS idx_remote_command_audit_site_emitted
  ON remote_command_audit(site_id, emitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_remote_command_audit_emitted
  ON remote_command_audit(emitted_at);

CREATE INDEX IF NOT EXISTS idx_remote_command_audit_status
  ON remote_command_audit(status) WHERE status != 'acked';

CREATE OR REPLACE FUNCTION cleanup_expired_remote_command_audit()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM remote_command_audit
  WHERE emitted_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE remote_command_audit IS 'ADR-081 P0: Audit des commandes télécommande relayées (TTL 7j)';
COMMENT ON COLUMN remote_command_audit.command_id IS 'UUID généré par le remote avant émission';
COMMENT ON COLUMN remote_command_audit.room_size IS 'Nombre de sockets TV dans la room au moment du relay (0 = drop apparent)';
COMMENT ON COLUMN remote_command_audit.status IS 'emitted, acked, dropped, debounced, unreachable';
COMMENT ON COLUMN remote_command_audit.latency_ms IS 'Latence emit→ack (rempli en Phase 1+)';

DO $$
BEGIN
  RAISE NOTICE 'Migration remote-command-audit appliquée avec succès!';
  RAISE NOTICE 'Table créée: remote_command_audit';
  RAISE NOTICE 'Fonction créée: cleanup_expired_remote_command_audit()';
END $$;
