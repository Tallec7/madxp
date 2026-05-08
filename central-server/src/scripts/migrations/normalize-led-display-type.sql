-- Migration : normalise video_variants.display_type de 'led' vers 'led-banner'
-- Contexte : la convention dashboard utilise 'led-banner' (sites.displays[].type),
--            mais 54 rows avaient été insérées avec le raccourci 'led'.
--            Vérifié 2026-05-08 : 0 site avec displays[].type='led', 54 rows impactées.
UPDATE video_variants
SET display_type = 'led-banner'
WHERE display_type = 'led';

-- Cleanup legacy 'secondary' orphelins (2 rows) si aucun site ne les utilise
-- NE PAS exécuter sans audit préalable (commenté intentionnellement).
-- UPDATE video_variants SET display_type = 'led-banner' WHERE display_type = 'secondary';
