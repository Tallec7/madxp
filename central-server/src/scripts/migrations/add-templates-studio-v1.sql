-- Migration: Templates Studio V1 — système code-driven parallèle
-- Date: 2026-05-13
-- Spec: studio-template/templates-remotion/spec/STUDIO_V1.md
-- Description:
--   Crée les 4 tables du nouveau Template Studio V1 (code-driven, manifest.json
--   co-localisé). Coexiste avec le système data-driven legacy (`remotion_templates`,
--   `template_layers`, etc.) sans dépendance — risque #1 du spec.
--
--   Tables :
--     - template_definitions : catalogue des templates V1 (seedé par scan des
--       templates-remotion/src/templates/<slug>/manifest.json au boot API)
--     - render_requests : 1 ligne par MP4/PNG demandé (queue PG-pollée par worker)
--     - site_brand_kits : identité visuelle club (couleurs, logo, fonts) — 1 par site
--     - players : roster joueurs avec photo brute + photo détourée (rembg)
--
-- Tenant : toutes les FK pointent vers `sites(id)` (la table métier Neopro est
-- `sites`, pas `clubs` — cf §9 du spec après Q&A dev).
--
-- Backward compat :
--   - Aucune table legacy touchée (system parallèle)
--   - `IF NOT EXISTS` partout = idempotent
--   - Pas de seed initial : les manifests seront seedés par un script au boot
--     de l'API (livrable Jour 3)

CREATE TABLE IF NOT EXISTS template_definitions (
  id                      UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  slug                    TEXT NOT NULL UNIQUE,
  version                 TEXT NOT NULL,
  label                   TEXT NOT NULL,
  description             TEXT,
  kind                    TEXT NOT NULL CHECK (kind IN ('video', 'still')),
  manifest_json           JSONB NOT NULL,
  remotion_composition_id TEXT NOT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE template_definitions IS
  'Templates Studio V1 — catalogue alimenté par scan des manifest.json au boot. Lecture seule depuis l''UI.';
COMMENT ON COLUMN template_definitions.kind IS
  'video → renderMedia (MP4) ; still → renderStill (PNG, 1 frame).';
COMMENT ON COLUMN template_definitions.manifest_json IS
  'Le manifest complet ({inputSchema, bindings, format, ...}) pour rendre l''UI form-gen sans aller-retour disque.';

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS render_requests (
  id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  site_id      UUID NOT NULL REFERENCES sites(id),
  template_id  UUID NOT NULL REFERENCES template_definitions(id),
  props_json   JSONB NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued', 'rendering', 'ready', 'failed')),
  output_url   TEXT,
  error_msg    TEXT,
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE render_requests IS
  'Queue PG-pollée par studio-render-worker. Index partiel sur status actifs pour SKIP LOCKED rapide.';
COMMENT ON COLUMN render_requests.props_json IS
  'Payload résolu après cascade brand kit + bindings du manifest. C''est ce qui est passé en inputProps à renderMedia/renderStill.';
COMMENT ON COLUMN render_requests.output_url IS
  'URL publique FTP du MP4/PNG final, alimentée par le worker.';

CREATE INDEX IF NOT EXISTS render_requests_status_idx
  ON render_requests(status, created_at)
  WHERE status IN ('queued', 'rendering');

CREATE INDEX IF NOT EXISTS render_requests_site_idx
  ON render_requests(site_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_brand_kits (
  site_id       UUID PRIMARY KEY REFERENCES sites(id),
  club_name     TEXT,
  colors_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  logos_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  fonts_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  sponsors_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE site_brand_kits IS
  'Identité visuelle Studio V1 — 1 ligne par site. Consommée par le résolveur de bindings.';
COMMENT ON COLUMN site_brand_kits.sponsors_json IS
  'V1 : reste vide. V2 : alimenté en lecture depuis site_sponsors quand un template déclare un slot sponsor.';

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  site_id           UUID NOT NULL REFERENCES sites(id),
  prenom            TEXT NOT NULL,
  nom               TEXT NOT NULL,
  numero            INT,
  poste             TEXT,
  photo_raw_url     TEXT,
  photo_cutout_url  TEXT,
  cutout_status     TEXT NOT NULL CHECK (cutout_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE players IS
  'Roster joueurs Studio V1. Détourage via worker rembg séparé (container Python Railway). RGPD : photos servies via URL FTP publique (cf risque #8 spec).';

CREATE INDEX IF NOT EXISTS players_site_idx ON players(site_id);

CREATE INDEX IF NOT EXISTS players_cutout_pending_idx
  ON players(cutout_status, created_at)
  WHERE cutout_status IN ('pending', 'processing');

-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE 'Migration complete: Templates Studio V1 — 4 tables créées (template_definitions, render_requests, site_brand_kits, players)';
END $$;
