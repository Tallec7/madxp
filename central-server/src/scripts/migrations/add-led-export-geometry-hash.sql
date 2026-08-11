-- ADR-139 — étape D : servir le canvas plié.
--
-- `geometry_hash` transforme `led_export_jobs` en CACHE des canvas pliés :
-- l'empreinte couvre la géométrie du ruban (côtés, pitch, hauteur, bande, ordre),
-- la source et la mise en page. Un profil modifié produit une autre empreinte,
-- donc un cache manquant, donc une refabrication — l'invalidation est automatique
-- et il n'y a aucune logique d'expiration à maintenir (ni à oublier).
--
-- Additif, sans contrainte : les jobs existants gardent `geometry_hash = NULL` et
-- ne seront simplement jamais réutilisés comme cache.

ALTER TABLE led_export_jobs
  ADD COLUMN IF NOT EXISTS geometry_hash VARCHAR(64);

-- Index partiel : la lecture de cache ne cherche QUE des jobs prêts, pour un
-- couple (site, vidéo). Sans lui, chaque enrichissement de config scannerait la
-- table entière — un chemin appelé à chaque déploiement et à chaque config SaaS.
CREATE INDEX IF NOT EXISTS idx_led_export_jobs_cache
  ON led_export_jobs (site_id, video_id, geometry_hash)
  WHERE status = 'ready' AND geometry_hash IS NOT NULL;
