-- Migration: Add deployment_details JSONB to update_deployments
-- Purpose: Store structured step-by-step OTA report from the Pi
-- Format: [{name, label, status, durationMs, detail?}]

ALTER TABLE update_deployments
  ADD COLUMN IF NOT EXISTS deployment_details JSONB;

COMMENT ON COLUMN update_deployments.deployment_details IS
  'Structured OTA step report: [{name, label, status: ok|warn|fail|skip, durationMs, detail?}]';
