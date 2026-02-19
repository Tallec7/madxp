-- Migration: Add fan_status column to metrics table
-- Date: 2026-02-17
-- Purpose: Store Raspberry Pi fan state data from heartbeat

DO $$
BEGIN
    -- Add fan_status JSONB column to metrics table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'metrics' AND column_name = 'fan_status'
    ) THEN
        ALTER TABLE metrics ADD COLUMN fan_status JSONB DEFAULT NULL;
        COMMENT ON COLUMN metrics.fan_status IS 'Fan state: {present, type, curState, maxState, speedPercent, is_pi5}';
    END IF;
END $$;
