-- =============================================================================
-- Migration: Fix config sync race condition
-- Date: 2026-01-23
-- =============================================================================
-- Problème: Quand on déploie une config depuis le dashboard, le Pi la reçoit,
-- mais ensuite renvoie son sync_local_state qui écrase local_config_mirror
-- avec l'ancienne config, causant la réapparition des vidéos supprimées.
--
-- Solution: Ajouter un timestamp qui indique qu'une mise à jour de config
-- est en attente de confirmation. Pendant ce temps, on n'écrase pas
-- local_config_mirror avec les données du sync_local_state.
-- =============================================================================

-- Colonne pour bloquer l'écrasement de local_config_mirror pendant X secondes
-- après l'envoi d'une commande update_config
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS config_update_pending_until TIMESTAMPTZ DEFAULT NULL;

-- Commentaire explicatif
COMMENT ON COLUMN sites.config_update_pending_until IS
'Timestamp jusqu''auquel on ignore les sync_local_state pour éviter d''écraser une config fraîchement déployée. NULL = pas de blocage.';

-- Index pour les queries de nettoyage (optionnel, pour les grandes flottes)
CREATE INDEX IF NOT EXISTS idx_sites_config_update_pending
ON sites (config_update_pending_until)
WHERE config_update_pending_until IS NOT NULL;
