-- Migration: Add interruption_reason to video_plays
-- PoC Proof of Play: track WHY a video was interrupted (not just completed=false)
-- Values: 'manual_action', 'profile_switch', 'video_error', 'hdmi_lost', 'loop_advance', 'browser_close', NULL (completed normally)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'video_plays' AND column_name = 'interruption_reason'
  ) THEN
    ALTER TABLE video_plays ADD COLUMN interruption_reason VARCHAR(30) DEFAULT NULL;

    COMMENT ON COLUMN video_plays.interruption_reason IS
      'Why the video was interrupted: manual_action, profile_switch, video_error, hdmi_lost, loop_advance, browser_close. NULL if completed normally.';

    RAISE NOTICE 'Added interruption_reason column to video_plays';
  ELSE
    RAISE NOTICE 'Column interruption_reason already exists on video_plays';
  END IF;
END $$;
