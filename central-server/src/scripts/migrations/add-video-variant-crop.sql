-- PROP-015 / ADR-140 — détourage des marges d'une variante LED, sur validation.
--
-- `crop` porte le rectangle VALIDÉ PAR UN HUMAIN : `{ "x":0, "y":554, "w":4096, "h":306 }`.
-- Tant qu'il est NULL, rien n'est détouré — le détecteur peut proposer autant qu'il
-- veut, seule cette colonne fait foi. C'est le pendant de `serve_folded` (ADR-139) :
-- ce qui change ce qu'un processeur reçoit ne s'active pas tout seul.
--
-- Additif et sans défaut : toutes les variantes existantes restent à NULL, donc
-- strictement au comportement actuel.

ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS crop JSONB;

COMMENT ON COLUMN video_variants.crop IS
  'PROP-015 — rectangle de détourage {x,y,w,h} validé par un opérateur, appliqué avant '
  'la mise à l''échelle du pliage LED. NULL = aucun détourage (défaut).';
