/**
 * Templates Studio V1 — repository.
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md
 * Migration : add-templates-studio-v1.sql
 *
 * Système code-driven parallèle au Template Studio v2 legacy (data-driven).
 * Aucune dépendance vers `TemplateRuntime`, `remotion_templates`, `template_layers`
 * — c'est le risque #1 du spec (smoke test enforced).
 *
 * 4 entités, 4 BaseRepository singletons exposés ici en un seul fichier
 * (conventions Neopro plates §9 du spec).
 */

import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// ────────────────────────────────────────────────────────────────────────────
// template_definitions — catalogue (alimenté par seed manifest)
// ────────────────────────────────────────────────────────────────────────────

export type TemplateKind = 'video' | 'still';

export interface TemplateDefinitionRow extends QueryResultRow {
  id: string;
  slug: string;
  version: string;
  label: string;
  description: string | null;
  kind: TemplateKind;
  manifest_json: Record<string, unknown>;
  remotion_composition_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertTemplateDefinitionInput {
  slug: string;
  version: string;
  label: string;
  description: string | null;
  kind: TemplateKind;
  manifest_json: Record<string, unknown>;
  remotion_composition_id: string;
}

class TemplateDefinitionRepositoryImpl extends BaseRepository<TemplateDefinitionRow> {
  constructor() {
    super('template_definitions');
  }

  async findActive(): Promise<TemplateDefinitionRow[]> {
    const result = await query<TemplateDefinitionRow>(
      `SELECT * FROM template_definitions WHERE is_active = TRUE ORDER BY label`,
    );
    return result.rows;
  }

  async findBySlug(slug: string): Promise<TemplateDefinitionRow | null> {
    const result = await query<TemplateDefinitionRow>(
      `SELECT * FROM template_definitions WHERE slug = $1`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Upsert via (slug, version) — appelé par le script de seed manifest au boot.
   * Une bump de version = nouvelle row + on désactive l'ancienne (cf règle de
   * versioning §5 du spec : on ne supprime jamais, FK depuis render_requests).
   */
  async upsertFromManifest(
    input: UpsertTemplateDefinitionInput,
  ): Promise<TemplateDefinitionRow> {
    const result = await query<TemplateDefinitionRow>(
      `INSERT INTO template_definitions
         (slug, version, label, description, kind, manifest_json, remotion_composition_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         version = EXCLUDED.version,
         label = EXCLUDED.label,
         description = EXCLUDED.description,
         kind = EXCLUDED.kind,
         manifest_json = EXCLUDED.manifest_json,
         remotion_composition_id = EXCLUDED.remotion_composition_id,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING *`,
      [
        input.slug,
        input.version,
        input.label,
        input.description,
        input.kind,
        JSON.stringify(input.manifest_json),
        input.remotion_composition_id,
      ],
    );
    return result.rows[0];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// render_requests — queue PG-pollée
// ────────────────────────────────────────────────────────────────────────────

export type RenderStatus = 'queued' | 'rendering' | 'ready' | 'failed';

export interface RenderRequestRow extends QueryResultRow {
  id: string;
  site_id: string;
  template_id: string;
  props_json: Record<string, unknown>;
  status: RenderStatus;
  output_url: string | null;
  error_msg: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRenderRequestInput {
  site_id: string;
  template_id: string;
  props_json: Record<string, unknown>;
  created_by: string;
}

class RenderRequestRepositoryImpl extends BaseRepository<RenderRequestRow> {
  constructor() {
    super('render_requests');
  }

  async create(input: CreateRenderRequestInput): Promise<RenderRequestRow> {
    const result = await query<RenderRequestRow>(
      `INSERT INTO render_requests
         (site_id, template_id, props_json, status, created_by)
       VALUES ($1, $2, $3, 'queued', $4)
       RETURNING *`,
      [
        input.site_id,
        input.template_id,
        JSON.stringify(input.props_json),
        input.created_by,
      ],
    );
    return result.rows[0];
  }

  async findBySite(siteId: string, limit = 50): Promise<RenderRequestRow[]> {
    const result = await query<RenderRequestRow>(
      `SELECT * FROM render_requests
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [siteId, limit],
    );
    return result.rows;
  }

  /**
   * Claim atomique de la prochaine demande en queue pour le worker.
   * FOR UPDATE SKIP LOCKED permet à N workers parallèles de drainer sans collision.
   * Le worker doit ensuite appeler `markReady` ou `markFailed`.
   */
  async claimNextQueued(): Promise<RenderRequestRow | null> {
    const result = await query<RenderRequestRow>(
      `UPDATE render_requests SET status = 'rendering', updated_at = NOW()
       WHERE id = (
         SELECT id FROM render_requests
         WHERE status = 'queued'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
    );
    return result.rows[0] ?? null;
  }

  async markReady(id: string, outputUrl: string): Promise<void> {
    await query(
      `UPDATE render_requests
       SET status = 'ready', output_url = $1, updated_at = NOW()
       WHERE id = $2`,
      [outputUrl, id],
    );
  }

  async markFailed(id: string, errorMsg: string): Promise<void> {
    await query(
      `UPDATE render_requests
       SET status = 'failed', error_msg = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, id],
    );
  }

  /**
   * Garde-fou boot : remet en `queued` toute row `rendering` claimée par un
   * process mort (Railway redeploy, crash, etc). Sans ça, un user ne peut
   * jamais retry — la row reste bloquée ad vitam.
   *
   * Pattern repris du worker legacy ADR-054 (cf `.claude/rules/services.md`,
   * invariant `failStaleRunningJobs` smoke enforced).
   */
  async failStaleRunning(maxAgeMinutes: number): Promise<number> {
    const result = await query(
      `UPDATE render_requests
       SET status = 'queued', updated_at = NOW()
       WHERE status = 'rendering'
         AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [String(maxAgeMinutes)],
    );
    return result.rowCount ?? 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// site_brand_kits — identité visuelle club (1 par site)
// ────────────────────────────────────────────────────────────────────────────

export interface SiteBrandKitRow extends QueryResultRow {
  site_id: string;
  club_name: string | null;
  colors_json: Record<string, unknown>;
  logos_json: Record<string, unknown>;
  fonts_json: Record<string, unknown>;
  sponsors_json: Record<string, unknown>;
  updated_at: Date;
}

export interface UpsertSiteBrandKitInput {
  site_id: string;
  club_name?: string | null;
  colors_json?: Record<string, unknown>;
  logos_json?: Record<string, unknown>;
  fonts_json?: Record<string, unknown>;
}

class SiteBrandKitRepositoryImpl {
  async findBySite(siteId: string): Promise<SiteBrandKitRow | null> {
    const result = await query<SiteBrandKitRow>(
      `SELECT * FROM site_brand_kits WHERE site_id = $1`,
      [siteId],
    );
    return result.rows[0] ?? null;
  }

  async upsert(input: UpsertSiteBrandKitInput): Promise<SiteBrandKitRow> {
    // PUT partiel : un payload peut n'envoyer que `colors` (sans logos/fonts).
    // INSERT path → on coalesce vers `{}` pour respecter NOT NULL.
    // UPDATE path → on coalesce vers la valeur existante via `$N::jsonb` direct
    // (pas EXCLUDED, qui aurait déjà été coalesced à `{}` côté VALUES → écraserait).
    const result = await query<SiteBrandKitRow>(
      `INSERT INTO site_brand_kits
         (site_id, club_name, colors_json, logos_json, fonts_json)
       VALUES (
         $1,
         $2,
         COALESCE($3::jsonb, '{}'::jsonb),
         COALESCE($4::jsonb, '{}'::jsonb),
         COALESCE($5::jsonb, '{}'::jsonb)
       )
       ON CONFLICT (site_id) DO UPDATE SET
         club_name = COALESCE(EXCLUDED.club_name, site_brand_kits.club_name),
         colors_json = COALESCE($3::jsonb, site_brand_kits.colors_json),
         logos_json = COALESCE($4::jsonb, site_brand_kits.logos_json),
         fonts_json = COALESCE($5::jsonb, site_brand_kits.fonts_json),
         updated_at = NOW()
       RETURNING *`,
      [
        input.site_id,
        input.club_name ?? null,
        input.colors_json ? JSON.stringify(input.colors_json) : null,
        input.logos_json ? JSON.stringify(input.logos_json) : null,
        input.fonts_json ? JSON.stringify(input.fonts_json) : null,
      ],
    );
    return result.rows[0];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// players — roster + détourage async
// ────────────────────────────────────────────────────────────────────────────

export type CutoutStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface PlayerRow extends QueryResultRow {
  id: string;
  // NULL = joueur global (catalogue admin), UUID = joueur exclusif à ce site.
  // Cf migration add-studio-player-global-grants.sql.
  site_id: string | null;
  prenom: string;
  nom: string;
  numero: number | null;
  poste: string | null;
  photo_raw_url: string | null;
  photo_cutout_url: string | null;
  cutout_status: CutoutStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePlayerInput {
  // NULL = joueur global (réservé super_admin/operator). UUID = joueur club.
  site_id: string | null;
  prenom: string;
  nom: string;
  numero: number | null;
  poste: string | null;
  photo_raw_url: string | null;
}

export interface PlayerSiteGrantRow extends QueryResultRow {
  player_id: string;
  site_id: string;
  granted_by: string | null;
  granted_at: Date;
}

export interface PlayerSiteGrantWithSiteRow extends QueryResultRow {
  player_id: string;
  site_id: string;
  site_name: string;
  club_name: string | null;
  granted_by: string | null;
  granted_at: Date;
}

export interface UpdatePlayerInput {
  prenom?: string;
  nom?: string;
  numero?: number | null;
  poste?: string | null;
  photo_raw_url?: string | null;
  photo_cutout_url?: string | null;
}

class PlayerRepositoryImpl extends BaseRepository<PlayerRow> {
  constructor() {
    super('players');
  }

  /**
   * Joueurs strictement attachés à ce site (legacy : `players.site_id = $1`).
   * Préservé pour backward-compat — utilisé par le résolveur de bindings dans
   * `createRenderRequest`. Pour la vue UI / résolveur consolidé, préférer
   * `findVisibleForSite` qui fusionne site-locaux + globaux grantés.
   */
  async findBySite(siteId: string): Promise<PlayerRow[]> {
    return this.findVisibleForSite(siteId);
  }

  /**
   * Joueurs visibles pour un site = joueurs site-locaux (`site_id = $1`)
   * ∪ joueurs globaux (`site_id IS NULL`) qui ont un grant vers ce site
   * (`studio_player_site_grants`).
   *
   * C'est ce que l'UI club doit voir + ce que le résolveur de bindings doit
   * pouvoir adresser via `playerRefs`.
   */
  async findVisibleForSite(siteId: string): Promise<PlayerRow[]> {
    const result = await query<PlayerRow>(
      `SELECT * FROM players
       WHERE site_id = $1
          OR id IN (
            SELECT player_id FROM studio_player_site_grants WHERE site_id = $1
          )
       ORDER BY numero NULLS LAST, nom`,
      [siteId],
    );
    return result.rows;
  }

  /**
   * Joueurs globaux (catalogue admin) — `site_id IS NULL`.
   * Vue super_admin/operator pour gérer le pool partagé.
   */
  async findGlobal(): Promise<PlayerRow[]> {
    const result = await query<PlayerRow>(
      `SELECT * FROM players WHERE site_id IS NULL ORDER BY numero NULLS LAST, nom`,
    );
    return result.rows;
  }

  async create(input: CreatePlayerInput): Promise<PlayerRow> {
    const initialStatus: CutoutStatus = input.photo_raw_url ? 'pending' : 'ready';
    const result = await query<PlayerRow>(
      `INSERT INTO players
         (site_id, prenom, nom, numero, poste, photo_raw_url, cutout_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.site_id,
        input.prenom,
        input.nom,
        input.numero,
        input.poste,
        input.photo_raw_url,
        initialStatus,
      ],
    );
    return result.rows[0];
  }

  /**
   * Claim atomique pour le worker rembg (FOR UPDATE SKIP LOCKED, status pending → processing).
   */
  async claimNextPendingCutout(): Promise<PlayerRow | null> {
    const result = await query<PlayerRow>(
      `UPDATE players SET cutout_status = 'processing', updated_at = NOW()
       WHERE id = (
         SELECT id FROM players
         WHERE cutout_status = 'pending'
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
    );
    return result.rows[0] ?? null;
  }

  async markCutoutReady(id: string, cutoutUrl: string): Promise<void> {
    await query(
      `UPDATE players
       SET photo_cutout_url = $1, cutout_status = 'ready', updated_at = NOW()
       WHERE id = $2`,
      [cutoutUrl, id],
    );
  }

  async markCutoutFailed(id: string): Promise<void> {
    await query(
      `UPDATE players
       SET cutout_status = 'failed', updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  /**
   * Anti-orphan rembg : remet en 'pending' les rows 'processing' claimées par
   * un process mort depuis plus de `maxMinutes`. Pattern aligné sur
   * `renderRequestRepository.failStaleRunning()` côté worker render.
   * Retourne le nombre de rows recovered.
   */
  async failStaleProcessingCutouts(maxMinutes: number): Promise<number> {
    const result = await query<{ id: string }>(
      `UPDATE players
       SET cutout_status = 'pending', updated_at = NOW()
       WHERE cutout_status = 'processing'
         AND updated_at < NOW() - ($1 || ' minutes')::interval
       RETURNING id`,
      [String(maxMinutes)],
    );
    return result.rows.length;
  }

  /**
   * Update partiel — coalesce les champs absents avec les valeurs existantes.
   * Si `photo_raw_url` change, on remet `cutout_status = 'pending'` pour que
   * le worker rembg (S4-C) re-traite l'image. `photo_cutout_url` peut être
   * set manuellement (S4-A : tant que worker pas livré, l'opérateur peut
   * coller une URL FTP de cutout pré-fait).
   */
  async update(
    id: string,
    siteId: string,
    input: UpdatePlayerInput,
  ): Promise<PlayerRow | null> {
    // Si photo_raw_url change vers non-null → status='pending' pour re-trigger
    // le worker. Si photo_cutout_url set explicitement → status='ready'.
    const cutoutStatusOverride: CutoutStatus | null =
      input.photo_cutout_url !== undefined && input.photo_cutout_url !== null
        ? 'ready'
        : input.photo_raw_url !== undefined && input.photo_raw_url !== null
          ? 'pending'
          : null;

    const result = await query<PlayerRow>(
      `UPDATE players SET
         prenom = COALESCE($1, prenom),
         nom = COALESCE($2, nom),
         numero = CASE WHEN $3::boolean THEN $4::int ELSE numero END,
         poste = CASE WHEN $5::boolean THEN $6::text ELSE poste END,
         photo_raw_url = CASE WHEN $7::boolean THEN $8::text ELSE photo_raw_url END,
         photo_cutout_url = CASE WHEN $9::boolean THEN $10::text ELSE photo_cutout_url END,
         cutout_status = COALESCE($11, cutout_status),
         updated_at = NOW()
       WHERE id = $12 AND site_id = $13
       RETURNING *`,
      [
        input.prenom ?? null,
        input.nom ?? null,
        input.numero !== undefined,
        input.numero ?? null,
        input.poste !== undefined,
        input.poste ?? null,
        input.photo_raw_url !== undefined,
        input.photo_raw_url ?? null,
        input.photo_cutout_url !== undefined,
        input.photo_cutout_url ?? null,
        cutoutStatusOverride,
        id,
        siteId,
      ],
    );
    return result.rows[0] ?? null;
  }

  async deleteForSite(id: string, siteId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM players WHERE id = $1 AND site_id = $2`,
      [id, siteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Joueurs globaux (catalogue admin) + grants multi-sites — ADR-082 pattern
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Crée un joueur global (`site_id IS NULL`). Réservé super_admin/operator
   * côté controller — repo n'enforce pas le rôle (defense-in-depth = guard
   * routes + double check controller).
   */
  async createGlobal(
    input: Omit<CreatePlayerInput, 'site_id'>,
  ): Promise<PlayerRow> {
    const initialStatus: CutoutStatus = input.photo_raw_url ? 'pending' : 'ready';
    const result = await query<PlayerRow>(
      `INSERT INTO players
         (site_id, prenom, nom, numero, poste, photo_raw_url, cutout_status)
       VALUES (NULL, $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.prenom,
        input.nom,
        input.numero,
        input.poste,
        input.photo_raw_url,
        initialStatus,
      ],
    );
    return result.rows[0];
  }

  /**
   * Update d'un joueur global (`site_id IS NULL`). Symétrique à `update()`
   * mais sans le tenant guard `WHERE site_id = $X` — réservé super_admin /
   * operator côté controller.
   */
  async updateGlobal(
    id: string,
    input: UpdatePlayerInput,
  ): Promise<PlayerRow | null> {
    const cutoutStatusOverride: CutoutStatus | null =
      input.photo_cutout_url !== undefined && input.photo_cutout_url !== null
        ? 'ready'
        : input.photo_raw_url !== undefined && input.photo_raw_url !== null
          ? 'pending'
          : null;

    const result = await query<PlayerRow>(
      `UPDATE players SET
         prenom = COALESCE($1, prenom),
         nom = COALESCE($2, nom),
         numero = CASE WHEN $3::boolean THEN $4::int ELSE numero END,
         poste = CASE WHEN $5::boolean THEN $6::text ELSE poste END,
         photo_raw_url = CASE WHEN $7::boolean THEN $8::text ELSE photo_raw_url END,
         photo_cutout_url = CASE WHEN $9::boolean THEN $10::text ELSE photo_cutout_url END,
         cutout_status = COALESCE($11, cutout_status),
         updated_at = NOW()
       WHERE id = $12 AND site_id IS NULL
       RETURNING *`,
      [
        input.prenom ?? null,
        input.nom ?? null,
        input.numero !== undefined,
        input.numero ?? null,
        input.poste !== undefined,
        input.poste ?? null,
        input.photo_raw_url !== undefined,
        input.photo_raw_url ?? null,
        input.photo_cutout_url !== undefined,
        input.photo_cutout_url ?? null,
        cutoutStatusOverride,
        id,
      ],
    );
    return result.rows[0] ?? null;
  }

  /** Suppression d'un joueur global. Cascade DELETE sur les grants liés. */
  async deleteGlobal(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM players WHERE id = $1 AND site_id IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Octroie un joueur global à un site. Idempotent (ON CONFLICT DO NOTHING).
   * `granted_by` est l'UUID du user qui a fait l'octroi (audit trail).
   */
  async addGrant(
    playerId: string,
    siteId: string,
    grantedBy: string | null,
  ): Promise<void> {
    await query(
      `INSERT INTO studio_player_site_grants (player_id, site_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id, site_id) DO NOTHING`,
      [playerId, siteId, grantedBy],
    );
  }

  async removeGrant(playerId: string, siteId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM studio_player_site_grants
       WHERE player_id = $1 AND site_id = $2`,
      [playerId, siteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Liste des grants d'un joueur global (avec infos site pour l'UI).
   * Utilisé par la modal "Gérer les sites" du dashboard.
   */
  async listGrants(playerId: string): Promise<PlayerSiteGrantWithSiteRow[]> {
    const result = await query<PlayerSiteGrantWithSiteRow>(
      `SELECT g.player_id, g.site_id, g.granted_by, g.granted_at,
              s.site_name, s.club_name
       FROM studio_player_site_grants g
       JOIN sites s ON s.id = g.site_id
       WHERE g.player_id = $1
       ORDER BY g.granted_at ASC`,
      [playerId],
    );
    return result.rows;
  }

  /** Vérifie qu'un grant existe (utilisé pour confirmer un octroi avant d'autoriser une opération). */
  async hasGrant(playerId: string, siteId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM studio_player_site_grants
         WHERE player_id = $1 AND site_id = $2
       ) AS exists`,
      [playerId, siteId],
    );
    return result.rows[0]?.exists ?? false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// studio_assets — pool global d'assets uploadés (ADR-125, Phase 1.5)
// + studio_template_asset_bindings — liaison template_slug/asset_key → asset_id
// ────────────────────────────────────────────────────────────────────────────

export type StudioAssetKind = 'file' | 'directory';

export interface StudioAssetRow extends QueryResultRow {
  id: string;
  filename: string;
  ftp_path: string;
  mime_type: string;
  file_size: number;
  checksum_sha256: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  tags: string[];
  uploaded_by: string | null;
  uploaded_at: Date;
  /** ADR-128 — type d'asset. 'file' (défaut, legacy) | 'directory' (séquence PNG frames). */
  asset_kind: StudioAssetKind;
  /** ADR-128 — nombre de frames pour `asset_kind='directory'`. NULL pour 'file'. */
  frame_count: number | null;
  /** ADR-128 — pattern d'interpolation pour `asset_kind='directory'`, ex: 'frame_{i:03d}.png'. */
  frame_pattern: string | null;
}

export interface CreateStudioAssetInput {
  filename: string;
  ftp_path: string;
  mime_type: string;
  file_size: number;
  checksum_sha256: string;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  tags?: string[];
  uploaded_by?: string | null;
}

/**
 * ADR-128 — input pour créer un asset `directory` (séquence PNG frames).
 * `ftp_path` doit se terminer par `/` (préfixe de dossier sur FTP).
 * `file_size_total` = somme cumulée des PNGs (pour affichage UI).
 */
export interface CreateStudioAssetDirectoryInput {
  filename: string;
  ftp_path: string;
  mime_type: string;
  file_size_total: number;
  checksum_sha256: string;
  frame_count: number;
  frame_pattern: string;
  tags?: string[];
  uploaded_by?: string | null;
}

export interface UpdateStudioAssetMetadataInput {
  filename?: string;
  tags?: string[];
}

export interface StudioAssetListFilters {
  tags?: string[];
  mimePrefix?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface StudioAssetUsageRow extends QueryResultRow {
  template_slug: string;
  asset_key: string;
  bound_at: Date;
}

class StudioAssetRepositoryImpl extends BaseRepository<StudioAssetRow> {
  constructor() {
    super('studio_assets');
  }

  async findByChecksum(checksum: string): Promise<StudioAssetRow | null> {
    const result = await query<StudioAssetRow>(
      `SELECT * FROM studio_assets WHERE checksum_sha256 = $1`,
      [checksum],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Upsert content-addressable. INSERT … ON CONFLICT (checksum_sha256) DO
   * NOTHING : si le même contenu est ré-uploadé, on retourne la row existante
   * (zéro doublon, l'appelant ne peut pas le savoir et peut binder dessus).
   *
   * Crée toujours `asset_kind='file'` — pour les directories (ADR-128) utiliser
   * `createDirectory()`.
   */
  async create(input: CreateStudioAssetInput): Promise<StudioAssetRow> {
    const tagsArray = input.tags ?? [];
    const insertResult = await query<StudioAssetRow>(
      `INSERT INTO studio_assets
         (filename, ftp_path, mime_type, file_size, checksum_sha256,
          width, height, duration_ms, tags, uploaded_by, asset_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'file')
       ON CONFLICT (checksum_sha256) DO NOTHING
       RETURNING *`,
      [
        input.filename,
        input.ftp_path,
        input.mime_type,
        input.file_size,
        input.checksum_sha256,
        input.width ?? null,
        input.height ?? null,
        input.duration_ms ?? null,
        tagsArray,
        input.uploaded_by ?? null,
      ],
    );
    if (insertResult.rows[0]) {
      return insertResult.rows[0];
    }
    // Conflict on checksum → fetch existing row.
    const existing = await this.findByChecksum(input.checksum_sha256);
    if (!existing) {
      throw new Error(
        `studio_assets: ON CONFLICT swallowed but no existing row found for checksum ${input.checksum_sha256}`,
      );
    }
    return existing;
  }

  /**
   * ADR-128 — crée un asset de type `directory` (séquence PNG frames pour
   * masque alpha). `ftp_path` doit se terminer par '/' (préfixe FTP).
   *
   * Même pattern de dédup content-addressable que `create()` (`ON CONFLICT
   * (checksum_sha256) DO NOTHING`) — un re-upload du même ZIP retourne la row
   * existante sans re-pousser les frames sur FTP.
   */
  async createDirectory(
    input: CreateStudioAssetDirectoryInput,
  ): Promise<StudioAssetRow> {
    const tagsArray = input.tags ?? [];
    const insertResult = await query<StudioAssetRow>(
      `INSERT INTO studio_assets
         (filename, ftp_path, mime_type, file_size, checksum_sha256,
          tags, uploaded_by, asset_kind, frame_count, frame_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'directory', $8, $9)
       ON CONFLICT (checksum_sha256) DO NOTHING
       RETURNING *`,
      [
        input.filename,
        input.ftp_path,
        input.mime_type,
        input.file_size_total,
        input.checksum_sha256,
        tagsArray,
        input.uploaded_by ?? null,
        input.frame_count,
        input.frame_pattern,
      ],
    );
    if (insertResult.rows[0]) {
      return insertResult.rows[0];
    }
    const existing = await this.findByChecksum(input.checksum_sha256);
    if (!existing) {
      throw new Error(
        `studio_assets: ON CONFLICT swallowed but no existing row found for directory checksum ${input.checksum_sha256}`,
      );
    }
    return existing;
  }

  async findFiltered(filters: StudioAssetListFilters = {}): Promise<{
    rows: StudioAssetRow[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.tags && filters.tags.length > 0) {
      params.push(filters.tags);
      conditions.push(`tags && $${params.length}::text[]`);
    }
    if (filters.mimePrefix) {
      params.push(`${filters.mimePrefix}%`);
      conditions.push(`mime_type LIKE $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`LOWER(filename) LIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM studio_assets ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const rowsResult = await query<StudioAssetRow>(
      `SELECT * FROM studio_assets ${where}
       ORDER BY uploaded_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return { rows: rowsResult.rows, total };
  }

  async updateMetadata(
    id: string,
    input: UpdateStudioAssetMetadataInput,
  ): Promise<StudioAssetRow | null> {
    const result = await query<StudioAssetRow>(
      `UPDATE studio_assets SET
         filename = COALESCE($1, filename),
         tags = COALESCE($2::text[], tags)
       WHERE id = $3
       RETURNING *`,
      [
        input.filename ?? null,
        input.tags ?? null,
        id,
      ],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Liste les bindings qui pointent vers cet asset. Utilisé par le controller
   * DELETE pour rendre 409 + liste des templates concernés (UX claire vs
   * "ON DELETE RESTRICT failed" cryptique).
   */
  async findUsageById(id: string): Promise<StudioAssetUsageRow[]> {
    const result = await query<StudioAssetUsageRow>(
      `SELECT template_slug, asset_key, bound_at
       FROM studio_template_asset_bindings
       WHERE asset_id = $1
       ORDER BY template_slug, asset_key`,
      [id],
    );
    return result.rows;
  }

  /**
   * Suppression dure. Le controller doit avoir vérifié `findUsageById()` au
   * préalable (sinon ON DELETE RESTRICT lèvera une erreur SQL).
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM studio_assets WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export interface TemplateAssetBindingRow extends QueryResultRow {
  template_slug: string;
  asset_key: string;
  asset_id: string;
  bound_by: string | null;
  bound_at: Date;
}

export interface UpsertTemplateAssetBindingInput {
  template_slug: string;
  asset_key: string;
  asset_id: string;
  bound_by?: string | null;
}

class TemplateAssetBindingRepositoryImpl {
  async findByTemplate(slug: string): Promise<TemplateAssetBindingRow[]> {
    const result = await query<TemplateAssetBindingRow>(
      `SELECT * FROM studio_template_asset_bindings
       WHERE template_slug = $1
       ORDER BY asset_key`,
      [slug],
    );
    return result.rows;
  }

  async upsertBinding(
    input: UpsertTemplateAssetBindingInput,
  ): Promise<TemplateAssetBindingRow> {
    const result = await query<TemplateAssetBindingRow>(
      `INSERT INTO studio_template_asset_bindings
         (template_slug, asset_key, asset_id, bound_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (template_slug, asset_key) DO UPDATE SET
         asset_id = EXCLUDED.asset_id,
         bound_by = EXCLUDED.bound_by,
         bound_at = NOW()
       RETURNING *`,
      [
        input.template_slug,
        input.asset_key,
        input.asset_id,
        input.bound_by ?? null,
      ],
    );
    return result.rows[0];
  }

  async deleteBinding(
    templateSlug: string,
    assetKey: string,
  ): Promise<boolean> {
    const result = await query(
      `DELETE FROM studio_template_asset_bindings
       WHERE template_slug = $1 AND asset_key = $2`,
      [templateSlug, assetKey],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singletons exportés
// ────────────────────────────────────────────────────────────────────────────

export const templateDefinitionRepository = new TemplateDefinitionRepositoryImpl();
export const renderRequestRepository = new RenderRequestRepositoryImpl();
export const siteBrandKitRepository = new SiteBrandKitRepositoryImpl();
export const playerRepository = new PlayerRepositoryImpl();
export const studioAssetRepository = new StudioAssetRepositoryImpl();
export const templateAssetBindingRepository = new TemplateAssetBindingRepositoryImpl();
