-- P5: Branding club pour les rapports PDF sponsor
-- Ajoute logo + couleurs du club sur la table sites
-- Ces champs sont injectes dans generateSiteSponsorPdf() pour personnaliser le rapport

ALTER TABLE sites ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS color_primary VARCHAR(7) DEFAULT NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS color_secondary VARCHAR(7) DEFAULT NULL;

COMMENT ON COLUMN sites.logo_url IS 'URL du logo du club (FTP ou external). Affiche dans header PDF.';
COMMENT ON COLUMN sites.color_primary IS 'Couleur primaire du club (hex #RRGGBB). Utilisee dans PDF reports.';
COMMENT ON COLUMN sites.color_secondary IS 'Couleur secondaire du club (hex #RRGGBB). Fallback = bleu clair NEOPRO.';
