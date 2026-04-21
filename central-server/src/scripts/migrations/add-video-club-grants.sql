-- ADR-082: Grants d'accès vidéo pour les clubs
-- Permet à un super_admin d'autoriser plusieurs clubs à placer
-- une vidéo admin dans leurs boucles/catégories, sans leur donner
-- les droits de suppression.

CREATE TABLE IF NOT EXISTS video_club_grants (
  video_id  UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  site_id   UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (video_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_vcg_video_id ON video_club_grants(video_id);
CREATE INDEX IF NOT EXISTS idx_vcg_site_id  ON video_club_grants(site_id);
