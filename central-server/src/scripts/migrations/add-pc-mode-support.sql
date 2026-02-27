-- E-23 US-23.2.2: Add pc_mode_enabled column to sites
-- Allows dashboard to configure a site for PC browser access (no physical Pi required)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS pc_mode_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN sites.pc_mode_enabled IS
  'Enable PC browser mode — allows accessing the TV display from any browser (no Pi kiosk required)';
