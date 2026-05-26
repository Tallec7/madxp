-- Migration: Fix default value `prenomNom` — retour à la ligne littéral
-- -----------------------------------------------------------------------------
-- Le default `'PRÉNOM' || E'\n' || 'NOM'` génère un LF stocké en DB, mais le
-- runtime affiche `\n` littéral car il ne convertit pas LF en <br> au render.
--
-- Fix : valeur sur une seule ligne. Le user pourra éditer dans l'UI s'il veut
-- forcer un retour à la ligne (à voir si l'input textarea le permet).
-- -----------------------------------------------------------------------------

UPDATE template_text_fields
SET default_value = 'PRÉNOM NOM'
WHERE slot_key = 'prenomNom'
  AND template_id IN (
    SELECT id FROM madxp_templates
    WHERE composition_id IN ('JoueurSimpleGenerique', 'JoueurSimpleImage', 'JoueurButGenerique')
  )
  AND default_value LIKE '%' || E'\n' || '%';
