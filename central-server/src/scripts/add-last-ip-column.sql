-- Migration: Ajouter les colonnes IP à la table sites
-- last_ip: IP publique vue par le serveur central (lors de la connexion WebSocket)
-- local_ip: IP locale du boîtier sur son réseau (envoyée via heartbeat)

ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_ip VARCHAR(45);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS local_ip VARCHAR(45);

-- Commentaires sur les colonnes
COMMENT ON COLUMN sites.last_ip IS 'IP publique du boîtier vue par le serveur central';
COMMENT ON COLUMN sites.local_ip IS 'IP locale du boîtier sur son réseau (ex: 192.168.x.x)';
