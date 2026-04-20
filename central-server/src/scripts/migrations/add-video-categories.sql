-- Migration: Add video_categories table
-- Sprint 6 — Catégories vidéo CRUD (remplace les catégories ad-hoc dans config.categories[])
-- Date: 2026-04-20

BEGIN;

CREATE TABLE IF NOT EXISTS video_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(50)  NOT NULL DEFAULT 'action',
  icon          VARCHAR(50),
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT video_categories_type_check CHECK (type IN ('action', 'loop', 'match'))
);

CREATE INDEX IF NOT EXISTS idx_video_categories_site_id
  ON video_categories(site_id, sort_order);

COMMIT;
