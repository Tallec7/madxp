-- ADR-102 — Remote preferences persisted per (site, profile) in DB.
--
-- Source de vérité unique pour : prefs UX (haptics, highContrast, lockRotation,
-- fontSize, layoutMobile, layoutDesktop) + activation widgets (score/chrono/
-- breaking). Recents restent en localStorage (volume + privacy device-local).
--
-- Avant cette migration (ADR-062 + PR #688) : les prefs vivaient en
-- localStorage scopé `<base>:<siteId>:<profileId>`. Bénéfice du scoping mais
-- prefs perdues entre devices/navigateurs. Cette table résout le partage
-- multi-device pour un staff donné en gardant la même clé logique
-- (site, profile).

CREATE TABLE IF NOT EXISTS remote_preferences (
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES config_profiles(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  widgets jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, profile_id)
);

COMMENT ON TABLE remote_preferences IS
  'ADR-102 — Préférences UX télécommande par (site, profil). prefs={haptics,highContrast,lockRotation,fontSize,layoutMobile,layoutDesktop}. widgets={score,chrono,breaking}.';

-- Index sur updated_at pour le futur reporting "préférences modifiées récemment"
-- (analytics prefs adoption layouts dense vs régie pro). Pas de query plan
-- bloquant aujourd''hui mais coût faible (volume estimé < 10k rows à 1 an).
CREATE INDEX IF NOT EXISTS idx_remote_preferences_updated_at
  ON remote_preferences(updated_at DESC);
