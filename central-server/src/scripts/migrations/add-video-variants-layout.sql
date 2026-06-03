-- PROP-014 étape 4 / ADR-134 : mise en page de la variante LED périmétrique.
-- Ajoute `layout` sur video_variants — porte la stratégie de composition du motif
-- pour une variante ciblant un display de type 'led-perimeter' :
--   'repeated'  → motif répété le long du ruban (défaut produit)
--   'scrolling' → défilement
--   'stretched' → étalé sur toute la longueur
-- NULL pour les variantes non-LED (tv, secondary, totem…) — la colonne reste
-- sémantiquement inerte hors du domaine LED (piloté par TYPE, pas par variante).
--
-- Valeurs contraintes côté API (content-variant.controller.ts) + côté UI (dropdown).
-- Pas de CHECK DB pour rester idempotent et tolérer un futur slug sans nouvelle
-- migration de contrainte.

ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS layout VARCHAR(16);
