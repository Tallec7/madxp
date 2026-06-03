-- PROP-014 §4 : mise en page réelle de l'export LED (pavage du motif).
-- Remplace l'usage du `fit` grossier (centré) par la vraie mise en page
-- (repeated / scrolling / stretched / centered). Le worker plie avec ce layout.

ALTER TABLE led_export_jobs
  ADD COLUMN IF NOT EXISTS layout VARCHAR(16);
