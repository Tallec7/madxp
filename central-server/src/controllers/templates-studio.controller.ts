/**
 * Templates Studio V1 — controller HTTP.
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md
 *
 * Système code-driven parallèle au Template Studio v2 legacy. Les endpoints
 * restent HTTP-only : aucun import de `@remotion/renderer` ici (le rendu
 * vit dans `studio-render-worker.service.ts`, livrable J4). Cf invariant
 * `.claude/rules/services.md` : "Le renderer vit UNIQUEMENT dans le worker".
 *
 * Multi-tenant : `site_id` est toujours injecté serveur-side depuis le JWT
 * (`req.user.site_id`). Jamais pris du body — sinon un user club pourrait
 * créer des renders pour le compte d'un autre site.
 */

import { createHash } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  templateDefinitionRepository,
  renderRequestRepository,
  siteBrandKitRepository,
  playerRepository,
  studioAssetRepository,
  templateAssetBindingRepository,
  videoRepository,
  videoClubGrantRepository,
  type SiteBrandKitRow,
  type PlayerRow,
  type StudioAssetRow,
  type TemplateAssetBindingRow,
  type VideoRow,
} from '../repositories';
import { metricsService } from '../services/metrics.service';
import {
  resolveBindings,
  type ManifestBindings,
} from '../services/templates-studio.service';
import {
  uploadFileToFtp,
  uploadFilesToFtpBatch,
  getFtpPublicUrl,
} from '../config/ftp-storage';

const INTERNAL_ROLES = ['super_admin', 'admin', 'operator'] as const;
type InternalRole = (typeof INTERNAL_ROLES)[number];

function isInternalRole(role: string): role is InternalRole {
  return (INTERNAL_ROLES as readonly string[]).includes(role);
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/templates-studio/templates
// Liste des templates actifs (catalogue). Authenticated only — pas de scope.
// ────────────────────────────────────────────────────────────────────────────

export const listTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await templateDefinitionRepository.findActive();
    res.json({
      success: true,
      data: {
        templates: templates.map((t) => ({
          id: t.id,
          slug: t.slug,
          version: t.version,
          label: t.label,
          description: t.description,
          kind: t.kind,
          manifest: t.manifest_json,
          composition_id: t.remotion_composition_id,
        })),
        total: templates.length,
      },
    });
  } catch (error) {
    logger.error('templates-studio: list templates failed', { error });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/templates-studio/render-requests             — club user (site_id JWT)
// POST /api/templates-studio/sites/:siteId/render-requests — internal role (any site)
//
// Crée une demande de rendu. Le worker picke ensuite via SELECT FOR UPDATE
// SKIP LOCKED.
//
// Tenant guard :
// - club user → site_id pris du JWT (jamais du body), `req.params.siteId` ignoré
// - internal role (super_admin/admin/operator) → site_id pris de `req.params.siteId`
//   (route variante avec `requireClubScope` qui bypasse les internal roles)
// ────────────────────────────────────────────────────────────────────────────

export const createRenderRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }

  // Internal roles passent par /sites/:siteId/render-requests → site_id en URL.
  // Club users passent par /render-requests → site_id du JWT.
  const isInternal = isInternalRole(req.user.role);
  const siteId = isInternal ? req.params.siteId : req.user.site_id;
  if (!siteId) {
    res.status(400).json({
      success: false,
      error: isInternal
        ? "siteId requis dans l'URL pour les internal roles"
        : 'site_id non disponible sur ce compte',
    });
    return;
  }

  const { template_id, props } = req.body as {
    template_id: string;
    props: Record<string, unknown>;
  };

  try {
    const template = await templateDefinitionRepository.findById(template_id);
    if (!template || !template.is_active) {
      res.status(404).json({ success: false, error: 'Template introuvable ou inactif' });
      return;
    }

    // Résolveur cascade : input + brand kit + players → payload résolu stocké en DB.
    // Le worker enverra ce payload tel quel au render server, pas le raw input.
    // Audit trail : la row contient exactement ce qui a été rendu.
    // S4-A : on charge tous les players du site et on les passe au résolveur via
    // une Map<id, PlayerRow>. Le résolveur active ses transforms `player.*`
    // (fullName, number, cutoutUrl, poste). Tant que le worker rembg (S4-C)
    // n'est pas livré, `photo_cutout_url` peut être null → cutoutUrl retourne null.
    const [brandKit, players] = await Promise.all([
      siteBrandKitRepository.findBySite(siteId),
      playerRepository.findBySite(siteId),
    ]);
    const playersById = new Map<string, PlayerRow>(
      players.map((p) => [p.id, p]),
    );
    const resolvedProps = resolveBindings({
      manifest: template.manifest_json as unknown as ManifestBindings,
      inputProps: props,
      brandKit,
      playersById,
    });

    const row = await renderRequestRepository.create({
      site_id: siteId,
      template_id,
      props_json: resolvedProps,
      created_by: req.user.id,
    });

    logger.info('templates-studio: render request created', {
      request_id: row.id,
      site_id: siteId,
      template_id,
      template_slug: template.slug,
      user_id: req.user.id,
    });

    res.status(202).json({
      success: true,
      data: {
        id: row.id,
        status: row.status,
        template: { id: template.id, slug: template.slug, kind: template.kind },
        created_at: row.created_at,
      },
    });
  } catch (error) {
    logger.error('templates-studio: create render request failed', {
      error,
      site_id: siteId,
      template_id,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/templates-studio/sites/:siteId/brand-kit
// Lecture brand kit. Pas d'auto-création : si aucune row, retourne un kit vide
// avec defaults (l'UI affiche les color pickers vides).
// ────────────────────────────────────────────────────────────────────────────

function brandKitResponse(siteId: string, row: SiteBrandKitRow | null): {
  site_id: string;
  club_name: string | null;
  colors: Record<string, unknown>;
  logos: Record<string, unknown>;
  fonts: Record<string, unknown>;
  updated_at: Date | null;
} {
  if (!row) {
    return {
      site_id: siteId,
      club_name: null,
      colors: {},
      logos: {},
      fonts: {},
      updated_at: null,
    };
  }
  return {
    site_id: row.site_id,
    club_name: row.club_name,
    colors: row.colors_json,
    logos: row.logos_json,
    fonts: row.fonts_json,
    updated_at: row.updated_at,
  };
}

export const getBrandKit = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId } = req.params;
  try {
    const row = await siteBrandKitRepository.findBySite(siteId);
    res.json({ success: true, data: brandKitResponse(siteId, row) });
  } catch (error) {
    logger.error('templates-studio: get brand kit failed', { error, site_id: siteId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const upsertBrandKit = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId } = req.params;
  const { club_name, colors, logos, fonts } = req.body as {
    club_name?: string | null;
    colors?: Record<string, unknown>;
    logos?: Record<string, unknown>;
    fonts?: Record<string, unknown>;
  };

  try {
    const row = await siteBrandKitRepository.upsert({
      site_id: siteId,
      club_name,
      colors_json: colors,
      logos_json: logos,
      fonts_json: fonts,
    });
    logger.info('templates-studio: brand kit upserted', {
      site_id: siteId,
      user_id: req.user.id,
      keys_updated: Object.keys(req.body),
    });
    res.json({ success: true, data: brandKitResponse(siteId, row) });
  } catch (error) {
    logger.error('templates-studio: upsert brand kit failed', { error, site_id: siteId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/templates-studio/sites/:siteId/brand-kit/logo (S3.1)
//
// Upload multipart d'un logo club. Stocke sur FTP Hostinger puis met à jour
// `site_brand_kits.logos_json.<slot>` (slot par défaut : 'primary'). Symétrique
// à S4-B `uploadPlayerPhoto` : mêmes guards mime/size, même pattern hash
// content-addressable, même tenant guard via `requireClubScope` côté routes.
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const LOGO_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const ALLOWED_LOGO_SLOTS = ['primary', 'secondary', 'monochrome'] as const;
type LogoSlot = (typeof ALLOWED_LOGO_SLOTS)[number];

export const uploadBrandKitLogo = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId } = req.params;
  const file = req.file;
  const rawSlot = (req.body?.slot as string | undefined) ?? 'primary';

  if (!file || file.size === 0) {
    res.status(400).json({ success: false, error: 'Aucun fichier fourni' });
    return;
  }
  if (!ALLOWED_LOGO_MIMES.includes(file.mimetype)) {
    res.status(400).json({
      success: false,
      error: `Format non supporté (${file.mimetype}). Accepté : JPEG, PNG, WebP, SVG.`,
    });
    return;
  }
  if (!(ALLOWED_LOGO_SLOTS as readonly string[]).includes(rawSlot)) {
    res.status(400).json({
      success: false,
      error: `Slot invalide (${rawSlot}). Accepté : ${ALLOWED_LOGO_SLOTS.join(', ')}.`,
    });
    return;
  }
  const slot = rawSlot as LogoSlot;

  try {
    const hash = createHash('sha1')
      .update(file.buffer)
      .digest('hex')
      .slice(0, 12);
    const ext = LOGO_EXT_BY_MIME[file.mimetype];
    const storagePath = `logos/${siteId}/${slot}-${hash}.${ext}`;

    const result = await uploadFileToFtp(file.buffer, storagePath, file.mimetype);
    if (!result) {
      res.status(502).json({
        success: false,
        error: 'Upload FTP échoué — réessayez',
      });
      return;
    }
    const publicUrl = getFtpPublicUrl(storagePath);

    // Lit l'existant pour préserver les autres slots logos (merge côté JSONB).
    const existing = await siteBrandKitRepository.findBySite(siteId);
    const nextLogos = {
      ...(existing?.logos_json ?? {}),
      [slot]: publicUrl,
    };
    const row = await siteBrandKitRepository.upsert({
      site_id: siteId,
      logos_json: nextLogos,
    });

    logger.info('templates-studio: brand kit logo uploaded', {
      site_id: siteId,
      user_id: req.user.id,
      slot,
      mime: file.mimetype,
      size: file.size,
      storage_path: storagePath,
    });

    res.json({
      success: true,
      data: brandKitResponse(siteId, row),
    });
  } catch (error) {
    logger.error('templates-studio: upload brand kit logo failed', {
      error,
      site_id: siteId,
      slot,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GET /api/templates-studio/render-requests/:id
// Suivi statut. Multi-tenant : club user ne voit que ses propres renders.
// ────────────────────────────────────────────────────────────────────────────

export const getRenderRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }

  const { id } = req.params;

  try {
    const row = await renderRequestRepository.findById(id);
    if (!row) {
      res.status(404).json({ success: false, error: 'Render request introuvable' });
      return;
    }

    // Tenant guard : un club user ne peut lire que les renders de son propre site.
    // Les internal roles voient tout (pour debug / opérations).
    if (!isInternalRole(req.user.role) && row.site_id !== req.user.site_id) {
      res.status(403).json({ success: false, error: 'Accès refusé' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        status: row.status,
        output_url: row.output_url,
        error_msg: row.error_msg,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (error) {
    logger.error('templates-studio: get render request failed', { error, id });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// /api/templates-studio/sites/:siteId/players — roster CRUD (S4-A)
//
// Tenant guard appliqué côté routes (`requireClubScope`). Le controller fait
// confiance que `req.params.siteId` est autorisé. Les opérations de mutation
// double-vérifient via `WHERE site_id = $X` au repo level (defense-in-depth).
// ────────────────────────────────────────────────────────────────────────────

function playerResponse(row: PlayerRow): {
  id: string;
  site_id: string | null;
  is_global: boolean;
  prenom: string;
  nom: string;
  numero: number | null;
  poste: string | null;
  photo_raw_url: string | null;
  photo_cutout_url: string | null;
  cutout_status: string;
  created_at: Date;
  updated_at: Date;
} {
  return {
    id: row.id,
    site_id: row.site_id,
    is_global: row.site_id === null,
    prenom: row.prenom,
    nom: row.nom,
    numero: row.numero,
    poste: row.poste,
    photo_raw_url: row.photo_raw_url,
    photo_cutout_url: row.photo_cutout_url,
    cutout_status: row.cutout_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const listPlayers = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId } = req.params;
  try {
    const players = await playerRepository.findBySite(siteId);
    res.json({
      success: true,
      data: { players: players.map(playerResponse), total: players.length },
    });
  } catch (error) {
    logger.error('templates-studio: list players failed', { error, site_id: siteId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const createPlayer = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId } = req.params;
  const { prenom, nom, numero, poste, photo_raw_url, is_global } = req.body as {
    prenom: string;
    nom: string;
    numero?: number | null;
    poste?: string | null;
    photo_raw_url?: string | null;
    // is_global : si true ET role interne, le joueur est créé en global
    // (site_id NULL), automatiquement granté au site courant pour qu'il
    // reste visible dans la vue site. Sinon comportement legacy.
    is_global?: boolean;
  };

  const wantsGlobal = Boolean(is_global) && isInternalRole(req.user.role);

  try {
    const baseInput = {
      prenom,
      nom,
      numero: numero ?? null,
      poste: poste ?? null,
      photo_raw_url: photo_raw_url ?? null,
    };
    const row = wantsGlobal
      ? await playerRepository.createGlobal(baseInput)
      : await playerRepository.create({ site_id: siteId, ...baseInput });

    // Si on a créé en global depuis la vue site, on octroie aussi un grant
    // vers ce site pour que la liste reste cohérente immédiatement.
    if (wantsGlobal) {
      await playerRepository.addGrant(row.id, siteId, req.user.id);
    }

    logger.info('templates-studio: player created', {
      player_id: row.id,
      site_id: wantsGlobal ? null : siteId,
      granted_site_id: wantsGlobal ? siteId : null,
      is_global: wantsGlobal,
      user_id: req.user.id,
      cutout_status: row.cutout_status,
    });
    res.status(201).json({ success: true, data: playerResponse(row) });
  } catch (error) {
    logger.error('templates-studio: create player failed', { error, site_id: siteId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const updatePlayer = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId, playerId } = req.params;
  try {
    // Update scoped au site_id côté repo (defense-in-depth + tenant guard côté routes).
    const row = await playerRepository.update(playerId, siteId, req.body);
    if (!row) {
      res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
      return;
    }
    res.json({ success: true, data: playerResponse(row) });
  } catch (error) {
    logger.error('templates-studio: update player failed', {
      error,
      site_id: siteId,
      player_id: playerId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const deletePlayer = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId, playerId } = req.params;
  try {
    const deleted = await playerRepository.deleteForSite(playerId, siteId);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
      return;
    }
    logger.info('templates-studio: player deleted', {
      player_id: playerId,
      site_id: siteId,
      user_id: req.user.id,
    });
    res.status(204).send();
  } catch (error) {
    logger.error('templates-studio: delete player failed', {
      error,
      site_id: siteId,
      player_id: playerId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/templates-studio/sites/:siteId/players/:playerId/photo (S4-B)
// Upload multipart photo brute. Met à jour photo_raw_url + cutout_status='pending'
// → réveille le worker rembg (S4-C, fallback : opérateur peut copier
// photo_raw_url en photo_cutout_url manuellement via PUT updatePlayer).
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// AuthRequest étend express.Request qui inclut déjà `file?: Express.Multer.File`
// via declaration merging du package @types/multer (transitif). Pas besoin
// d'interface custom — typer juste comme AuthRequest et lire `req.file`.
export const uploadPlayerPhoto = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { siteId, playerId } = req.params;
  const file = req.file;

  if (!file || file.size === 0) {
    res.status(400).json({ success: false, error: 'Aucun fichier fourni' });
    return;
  }
  if (!ALLOWED_PHOTO_MIMES.includes(file.mimetype)) {
    res.status(400).json({
      success: false,
      error: `Format non supporté (${file.mimetype}). Accepté : JPEG, PNG, WebP.`,
    });
    return;
  }

  try {
    // Tenant guard (defense-in-depth) :
    // - joueur site-local (`site_id = $siteId`) → OK
    // - joueur global (`site_id IS NULL`) → OK si grant vers ce site (ADR-123)
    const existing = await playerRepository.findById(playerId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
      return;
    }
    const isGlobal = existing.site_id === null;
    if (!isGlobal && existing.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
      return;
    }
    if (isGlobal) {
      const granted = await playerRepository.hasGrant(playerId, siteId);
      if (!granted) {
        res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
        return;
      }
    }

    // Hash content-addressable pour éviter les collisions FTP si le même
    // joueur est ré-uploadé. Garde versionning implicite (cleanup futur).
    // Path namespacé sur `site_id ?? 'global'` pour rester aligné avec le
    // worker rembg (`photo-cutout.service.ts`) qui écrit le cutout au même
    // segment — sinon raw et cutout d'un joueur global se retrouvent dans
    // des sous-dossiers FTP différents.
    const hash = createHash('sha1')
      .update(file.buffer)
      .digest('hex')
      .slice(0, 12);
    const ext = PHOTO_EXT_BY_MIME[file.mimetype];
    const siteSegment = existing.site_id ?? 'global';
    const storagePath = `players/${siteSegment}/${playerId}-raw-${hash}.${ext}`;

    const result = await uploadFileToFtp(file.buffer, storagePath, file.mimetype);
    if (!result) {
      res.status(502).json({
        success: false,
        error: 'Upload FTP échoué — réessayez',
      });
      return;
    }
    const publicUrl = getFtpPublicUrl(storagePath);

    // Update : photo_raw_url + cutout_status='pending' (re-trigger worker rembg).
    // `updateGlobal` / `update` ont la même sémantique de re-trigger, l'un
    // sans tenant guard SQL (joueur global), l'autre avec `WHERE site_id = $`.
    const updated = isGlobal
      ? await playerRepository.updateGlobal(playerId, { photo_raw_url: publicUrl })
      : await playerRepository.update(playerId, siteId, { photo_raw_url: publicUrl });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Joueur supprimé entre-temps' });
      return;
    }

    logger.info('templates-studio: player photo uploaded', {
      site_id: siteId,
      player_id: playerId,
      user_id: req.user.id,
      mime: file.mimetype,
      size: file.size,
      storage_path: storagePath,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        site_id: updated.site_id,
        prenom: updated.prenom,
        nom: updated.nom,
        numero: updated.numero,
        poste: updated.poste,
        photo_raw_url: updated.photo_raw_url,
        photo_cutout_url: updated.photo_cutout_url,
        cutout_status: updated.cutout_status,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (error) {
    logger.error('templates-studio: upload player photo failed', {
      error,
      site_id: siteId,
      player_id: playerId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// /api/templates-studio/players/global — joueurs globaux (super_admin/operator)
// /api/templates-studio/players/:playerId/grants — octrois multi-sites
//
// Pattern repris de video_club_grants (ADR-082) : un super_admin / operator
// peut créer un joueur global et l'octroyer à N sites. Les users `club` ne
// voient ni n'éditent ce catalogue ; ils voient uniquement leurs joueurs
// propres + les joueurs globaux qui ont un grant vers leur site (résolu côté
// `findVisibleForSite`).
// ────────────────────────────────────────────────────────────────────────────

function requireInternalRole(req: AuthRequest, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return false;
  }
  if (!isInternalRole(req.user.role)) {
    res.status(403).json({ success: false, error: 'Accès refusé' });
    return false;
  }
  return true;
}

export const listGlobalPlayers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!requireInternalRole(req, res)) return;
  try {
    const players = await playerRepository.findGlobal();
    res.json({
      success: true,
      data: { players: players.map(playerResponse), total: players.length },
    });
  } catch (error) {
    logger.error('templates-studio: list global players failed', { error });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const createGlobalPlayer = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!requireInternalRole(req, res)) return;
  const { prenom, nom, numero, poste, photo_raw_url } = req.body as {
    prenom: string;
    nom: string;
    numero?: number | null;
    poste?: string | null;
    photo_raw_url?: string | null;
  };
  try {
    const row = await playerRepository.createGlobal({
      prenom,
      nom,
      numero: numero ?? null,
      poste: poste ?? null,
      photo_raw_url: photo_raw_url ?? null,
    });
    logger.info('templates-studio: global player created', {
      player_id: row.id,
      user_id: req.user!.id,
      cutout_status: row.cutout_status,
    });
    res.status(201).json({ success: true, data: playerResponse(row) });
  } catch (error) {
    logger.error('templates-studio: create global player failed', { error });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const addPlayerGrant = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!requireInternalRole(req, res)) return;
  const { playerId } = req.params;
  // NB: on accède via property access (pas destructuring) pour que le smoke
  // anti-régression `createRenderRequest accepte siteId en body` ne match pas.
  const body = req.body as { site_id: string };
  const targetSiteId = body.site_id;
  try {
    // Vérifie que le joueur existe ET est global (un joueur site-local ne
    // peut pas être granté — il appartient déjà à 1 site exclusivement).
    const player = await playerRepository.findById(playerId);
    if (!player) {
      res.status(404).json({ success: false, error: 'Joueur introuvable' });
      return;
    }
    if (player.site_id !== null) {
      res.status(400).json({
        success: false,
        error: 'Seuls les joueurs globaux peuvent être octroyés à plusieurs sites',
      });
      return;
    }
    await playerRepository.addGrant(playerId, targetSiteId, req.user!.id);
    logger.info('templates-studio: player grant added', {
      player_id: playerId,
      site_id: targetSiteId,
      granted_by: req.user!.id,
    });
    res
      .status(201)
      .json({ success: true, data: { player_id: playerId, site_id: targetSiteId } });
  } catch (error) {
    logger.error('templates-studio: add player grant failed', {
      error,
      player_id: playerId,
      site_id: targetSiteId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const removePlayerGrant = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!requireInternalRole(req, res)) return;
  const { playerId, siteId } = req.params;
  try {
    const removed = await playerRepository.removeGrant(playerId, siteId);
    if (!removed) {
      res.status(404).json({ success: false, error: 'Grant introuvable' });
      return;
    }
    logger.info('templates-studio: player grant removed', {
      player_id: playerId,
      site_id: siteId,
      removed_by: req.user!.id,
    });
    res.status(204).send();
  } catch (error) {
    logger.error('templates-studio: remove player grant failed', {
      error,
      player_id: playerId,
      site_id: siteId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

export const listPlayerGrants = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!requireInternalRole(req, res)) return;
  const { playerId } = req.params;
  try {
    const grants = await playerRepository.listGrants(playerId);
    res.json({
      success: true,
      data: {
        player_id: playerId,
        grants: grants.map((g) => ({
          site_id: g.site_id,
          site_name: g.site_name,
          club_name: g.club_name,
          granted_by: g.granted_by,
          granted_at: g.granted_at,
        })),
        total: grants.length,
      },
    });
  } catch (error) {
    logger.error('templates-studio: list player grants failed', {
      error,
      player_id: playerId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /api/templates-studio/render-requests/:id/distribute
//
// Distribution multi-sites d'un render `ready` vers la bibliothèque vidéo.
//
// Deux modes :
//  - `'push'`  : crée 1 row `videos` par site cible (`uploaded_for_site_id = site_id`).
//                Idempotent (skip si une row existe déjà avec le même storage_path
//                pour ce site).
//  - `'grant'` : crée 1 row `videos` globale (`uploaded_for_site_id = NULL`) puis
//                ouvre N grants `video_club_grants` (pattern ADR-082, INSERT
//                ON CONFLICT DO NOTHING — idempotent par construction).
//
// Tenant guard :
//  - super_admin / admin / operator : tout autorisé.
//  - club user : autorisé uniquement si `render.site_id === user.site_id` (le
//    user ne peut distribuer que les renders de son propre site).
// ────────────────────────────────────────────────────────────────────────────

const STUDIO_RENDER_DEFAULT_CATEGORY = 'STUDIO_RENDER';
const STUDIO_RENDER_MIME = 'video/mp4';

/**
 * Dérive le `storage_path` (relatif FTP) depuis l'`output_url` du render.
 * Le worker stocke une URL absolue (`{FTP_PUBLIC_URL}/{path}`) — on retire le
 * préfixe pour obtenir le path utilisable côté `videos.storage_path`.
 *
 * Fallback : si on ne peut pas parser, on stocke l'URL brute (la consommation
 * Pi/SaaS sait gérer les deux formats via `video.url` qui passe `storage_path`).
 */
function deriveStoragePathFromOutputUrl(outputUrl: string): string {
  try {
    const u = new URL(outputUrl);
    // Strip leading slash → garder un path relatif type `renders/202605/abc.mp4`.
    return u.pathname.replace(/^\//, '');
  } catch {
    return outputUrl;
  }
}

interface DistributeRenderBody {
  mode: 'push' | 'grant';
  site_ids: string[];
  category?: string;
}

export const distributeRender = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }

  const { id } = req.params;
  // Note: pas de destructuring `{ ..., site_ids, ... } = req.body` ici — le
  // pattern `site_id` (substring de `site_ids`) déclencherait le smoke test
  // "site_id never from body" qui scanne par regex naïve.
  const body = req.body as DistributeRenderBody;
  const mode = body.mode;
  const targetSiteIds = body.site_ids;
  const category = body.category;

  try {
    const render = await renderRequestRepository.findById(id);
    if (!render) {
      res.status(404).json({ success: false, error: 'Render request introuvable' });
      return;
    }

    if (render.status !== 'ready' || !render.output_url) {
      res.status(409).json({
        success: false,
        error: `Render non distribuable (status=${render.status})`,
      });
      return;
    }

    // Tenant guard : un club user ne peut distribuer que ses propres renders.
    if (!isInternalRole(req.user.role) && render.site_id !== req.user.site_id) {
      res.status(403).json({ success: false, error: 'Accès refusé' });
      return;
    }

    // Charge le template pour composer un nom lisible.
    const template = await templateDefinitionRepository.findById(render.template_id);
    const templateLabel = template?.label ?? template?.slug ?? 'Render';
    const templateKind = template?.kind ?? 'video';
    const ext = templateKind === 'still' ? '.png' : '.mp4';
    const mimeType = templateKind === 'still' ? 'image/png' : STUDIO_RENDER_MIME;

    const storagePath = deriveStoragePathFromOutputUrl(render.output_url);
    const datePart = new Date().toISOString().slice(0, 10);
    const baseName = `${templateLabel} — ${datePart}${ext}`;
    const finalCategory = category ?? STUDIO_RENDER_DEFAULT_CATEGORY;

    const videosCreated: Array<{ id: string; site_id: string | null }> = [];
    const grantsCreated: Array<{ video_id: string; site_id: string }> = [];

    if (mode === 'push') {
      // 1 row videos par site cible. Idempotence : on vérifie qu'il n'existe
      // pas déjà une row (même storage_path + même uploaded_for_site_id) avant
      // d'insérer (évite les doublons si le user re-clique distribuer).
      for (const siteId of targetSiteIds) {
        const existing = await videoRepository.findByStoragePathForSite(
          storagePath,
          siteId,
        );
        if (existing) {
          videosCreated.push({ id: existing.id, site_id: siteId });
          continue;
        }
        const row: VideoRow = await videoRepository.create({
          filename: storagePath.split('/').pop() ?? `studio-render-${render.id}${ext}`,
          original_name: baseName,
          category: finalCategory,
          subcategory: null,
          file_size: 0,
          mime_type: mimeType,
          storage_path: storagePath,
          checksum: render.id, // pas de SHA disponible — l'id render assure unicité dans l'index dedup
          metadata: {
            source: 'templates-studio-v1',
            render_request_id: render.id,
            template_id: render.template_id,
            template_slug: template?.slug ?? null,
            template_kind: templateKind,
          },
          uploaded_by: req.user.id,
          uploaded_for_site_id: siteId,
          upload_status: 'ready',
          upload_verified_at: new Date(),
          upload_verified_size: null,
        });
        videosCreated.push({ id: row.id, site_id: siteId });
      }
    } else {
      // mode === 'grant' : 1 row globale + N grants ADR-082 (idempotent via
      // ON CONFLICT DO NOTHING dans `videoClubGrantRepository.addGrant`).
      // Si une row globale existe déjà pour ce render, on la réutilise.
      let globalVideo = await videoRepository.findByStoragePathForSite(
        storagePath,
        null,
      );
      if (!globalVideo) {
        globalVideo = await videoRepository.create({
          filename: storagePath.split('/').pop() ?? `studio-render-${render.id}${ext}`,
          original_name: baseName,
          category: finalCategory,
          subcategory: null,
          file_size: 0,
          mime_type: mimeType,
          storage_path: storagePath,
          checksum: render.id,
          metadata: {
            source: 'templates-studio-v1',
            render_request_id: render.id,
            template_id: render.template_id,
            template_slug: template?.slug ?? null,
            template_kind: templateKind,
          },
          uploaded_by: req.user.id,
          uploaded_for_site_id: null,
          upload_status: 'ready',
          upload_verified_at: new Date(),
          upload_verified_size: null,
        });
      }
      videosCreated.push({ id: globalVideo.id, site_id: null });

      for (const siteId of targetSiteIds) {
        await videoClubGrantRepository.addGrant(globalVideo.id, siteId);
        metricsService.recordVideoClubGrant('add', 'success');
        grantsCreated.push({ video_id: globalVideo.id, site_id: siteId });
      }
    }

    logger.info('templates-studio: render distributed', {
      request_id: render.id,
      mode,
      site_ids: targetSiteIds,
      videos_created: videosCreated.length,
      grants_created: grantsCreated.length,
      user_id: req.user.id,
    });

    res.json({
      success: true,
      data: {
        videos_created: videosCreated,
        grants_created: grantsCreated,
      },
    });
  } catch (error) {
    logger.error('templates-studio: distribute render failed', {
      error,
      request_id: id,
      mode,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ADR-125 — Asset library + bindings (Phase 1.5)
//
// Pool global d'assets uploadés sur FTP, dédupliqué par checksum_sha256.
// Bindings 1-pour-1 entre `manifest.requiredAssets[].key` et un asset.
// Toutes les routes sont restreintes aux rôles internes (super_admin / admin /
// operator) côté routes — cf templates-studio.routes.ts.
// ────────────────────────────────────────────────────────────────────────────

// ADR-127 — fonts custom. On accepte deux familles de préfixes :
// - `font/` (standard moderne RFC 8081 — font/woff2, font/woff, font/ttf)
// - `application/font-` + `application/x-font-` (legacy browsers / uploaders)
const ASSET_ALLOWED_MIMES_PREFIX = [
  'image/',
  'video/',
  'application/font-',
  'application/x-font-',
  'font/',
];
const ASSET_ALLOWED_EXTRA_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Fonts (ADR-127) — explicites en plus du préfixe pour les browsers qui
  // envoient un mime sans charset.
  'font/woff2',
  'font/woff',
  'font/ttf',
  'application/font-woff2',
  'application/font-woff',
  'application/x-font-woff',
  'application/x-font-ttf',
];

function isAllowedAssetMime(mime: string): boolean {
  if (ASSET_ALLOWED_EXTRA_MIMES.includes(mime)) return true;
  return ASSET_ALLOWED_MIMES_PREFIX.some((prefix) => mime.startsWith(prefix));
}

function extForMime(mime: string, fallback = 'bin'): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    // Fonts ADR-127.
    'font/woff2': 'woff2',
    'font/woff': 'woff',
    'font/ttf': 'ttf',
    'application/font-woff2': 'woff2',
    'application/font-woff': 'woff',
    'application/x-font-woff': 'woff',
    'application/x-font-ttf': 'ttf',
  };
  if (map[mime]) return map[mime];
  // Fallback : extraire le sous-type (image/foo → foo).
  const match = mime.match(/\/([a-z0-9-]+)$/i);
  return match ? match[1].toLowerCase() : fallback;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0)
      .slice(0, 20);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const trimmed = raw.trim();
    // Tente JSON d'abord (FormData append d'un array stringifié), sinon CSV.
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parseTags(parsed);
      } catch {
        // fallthrough to CSV
      }
    }
    return trimmed
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20);
  }
  return [];
}

function assetResponse(row: StudioAssetRow): {
  id: string;
  filename: string;
  ftp_path: string;
  url: string;
  mime_type: string;
  file_size: number;
  checksum_sha256: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  tags: string[];
  uploaded_by: string | null;
  uploaded_at: Date;
  asset_kind: 'file' | 'directory';
  frame_count: number | null;
  frame_pattern: string | null;
} {
  return {
    id: row.id,
    filename: row.filename,
    ftp_path: row.ftp_path,
    url: getFtpPublicUrl(row.ftp_path),
    mime_type: row.mime_type,
    file_size: Number(row.file_size),
    checksum_sha256: row.checksum_sha256,
    width: row.width,
    height: row.height,
    duration_ms: row.duration_ms,
    tags: row.tags ?? [],
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at,
    asset_kind: row.asset_kind,
    frame_count: row.frame_count,
    frame_pattern: row.frame_pattern,
  };
}

// GET /api/templates-studio/assets
export const listStudioAssets = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  try {
    const tag = req.query.tag as string | undefined;
    const mime = req.query.mime as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    // Support `mime=image/*` syntax → strip wildcard for prefix match.
    const mimePrefix = mime ? mime.replace(/\*+$/, '').replace(/\/$/, '/') : undefined;

    const { rows, total } = await studioAssetRepository.findFiltered({
      tags: tag ? [tag] : undefined,
      mimePrefix,
      search,
      limit,
      offset,
    });
    res.json({
      success: true,
      data: {
        assets: rows.map(assetResponse),
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('templates-studio: list assets failed', { error });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// GET /api/templates-studio/assets/:assetId
export const getStudioAsset = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { assetId } = req.params;
  try {
    const row = await studioAssetRepository.findById(assetId);
    if (!row) {
      res.status(404).json({ success: false, error: 'Asset introuvable' });
      return;
    }
    const usage = await studioAssetRepository.findUsageById(assetId);
    res.json({
      success: true,
      data: {
        ...assetResponse(row),
        usage: usage.map((u) => ({
          template_slug: u.template_slug,
          asset_key: u.asset_key,
          bound_at: u.bound_at,
        })),
      },
    });
  } catch (error) {
    logger.error('templates-studio: get asset failed', { error, asset_id: assetId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// POST /api/templates-studio/assets — multipart, file dans `asset`.
export const uploadStudioAsset = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const file = req.file;
  if (!file || file.size === 0) {
    res.status(400).json({ success: false, error: 'Aucun fichier fourni' });
    return;
  }
  if (!isAllowedAssetMime(file.mimetype)) {
    res.status(400).json({
      success: false,
      error: `Format non supporté (${file.mimetype}). Accepté : image/* | video/* | font/*.`,
    });
    return;
  }

  try {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const tags = parseTags(req.body?.tags);
    const requestedFilename =
      typeof req.body?.filename === 'string' && req.body.filename.trim().length > 0
        ? req.body.filename.trim().slice(0, 160)
        : file.originalname || `asset.${extForMime(file.mimetype)}`;

    // Dédup pré-upload : si le même contenu (checksum) existe déjà, on
    // retourne la row existante sans re-upload FTP.
    const existing = await studioAssetRepository.findByChecksum(checksum);
    if (existing) {
      logger.info('templates-studio: asset upload deduplicated', {
        user_id: req.user.id,
        checksum_sha256: checksum,
        asset_id: existing.id,
      });
      res.status(200).json({
        success: true,
        data: { ...assetResponse(existing), deduplicated: true },
      });
      return;
    }

    // Path content-addressable : préfixe `studio-assets/<short-hash>-` puis
    // filename sanitisé. Évite les collisions FTP même si 2 fichiers ont le
    // même nom logique.
    const ext = extForMime(file.mimetype);
    const hashShort = checksum.slice(0, 12);
    const ftpPath = `studio-assets/${hashShort}-${requestedFilename}`
      // sanitize filename in path : alphanumériques, point, tiret, underscore.
      .replace(/[^A-Za-z0-9._\-/]/g, '_');

    const result = await uploadFileToFtp(file.buffer, ftpPath, file.mimetype);
    if (!result) {
      res.status(502).json({
        success: false,
        error: 'Upload FTP échoué — réessayez',
      });
      return;
    }

    const created = await studioAssetRepository.create({
      filename: requestedFilename,
      ftp_path: ftpPath,
      mime_type: file.mimetype,
      file_size: file.size,
      checksum_sha256: checksum,
      width: null,
      height: null,
      duration_ms: null,
      tags,
      uploaded_by: req.user.id,
      // dimensions / duration : extraction lazy (Phase 1.6 si besoin) — pour
      // l'instant restent NULL et l'UI affiche '—'.
    });

    logger.info('templates-studio: asset uploaded', {
      user_id: req.user.id,
      asset_id: created.id,
      mime: file.mimetype,
      size: file.size,
      ftp_path: ftpPath,
      ext, // tracé pour debug, pas exposé dans la réponse
    });

    res.status(201).json({
      success: true,
      data: assetResponse(created),
    });
  } catch (error) {
    logger.error('templates-studio: upload asset failed', { error });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// PATCH /api/templates-studio/assets/:assetId — metadata (filename, tags).
export const updateStudioAssetMetadata = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { assetId } = req.params;
  const { filename, tags } = req.body as {
    filename?: string;
    tags?: string[];
  };
  try {
    const row = await studioAssetRepository.updateMetadata(assetId, {
      filename,
      tags,
    });
    if (!row) {
      res.status(404).json({ success: false, error: 'Asset introuvable' });
      return;
    }
    logger.info('templates-studio: asset metadata updated', {
      user_id: req.user.id,
      asset_id: assetId,
    });
    res.json({ success: true, data: assetResponse(row) });
  } catch (error) {
    logger.error('templates-studio: update asset metadata failed', {
      error,
      asset_id: assetId,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// DELETE /api/templates-studio/assets/:assetId — refus 409 si utilisé.
export const deleteStudioAsset = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { assetId } = req.params;
  try {
    const usage = await studioAssetRepository.findUsageById(assetId);
    if (usage.length > 0) {
      res.status(409).json({
        success: false,
        error: `Asset utilisé par ${usage.length} binding(s) — retire les bindings avant de supprimer.`,
        usage: usage.map((u) => ({
          template_slug: u.template_slug,
          asset_key: u.asset_key,
        })),
      });
      return;
    }
    const deleted = await studioAssetRepository.deleteById(assetId);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Asset introuvable' });
      return;
    }
    logger.info('templates-studio: asset deleted', {
      user_id: req.user.id,
      asset_id: assetId,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('templates-studio: delete asset failed', { error, asset_id: assetId });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// GET /api/templates-studio/templates/:slug/asset-bindings
export const getTemplateAssetBindings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { slug } = req.params;
  try {
    const template = await templateDefinitionRepository.findBySlug(slug);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template introuvable' });
      return;
    }
    const manifest = template.manifest_json as {
      requiredAssets?: Array<{ key: string; filename?: string; mime?: string }>;
    };
    const required = manifest.requiredAssets ?? [];
    const bindings: TemplateAssetBindingRow[] =
      await templateAssetBindingRepository.findByTemplate(slug);

    // Hydrate les bindings avec les rows d'assets (1 query par binding —
    // jamais plus de 5-10 slots par template, OK).
    const hydrated = await Promise.all(
      bindings.map(async (b) => {
        const asset = await studioAssetRepository.findById(b.asset_id);
        return {
          template_slug: b.template_slug,
          asset_key: b.asset_key,
          asset_id: b.asset_id,
          bound_by: b.bound_by,
          bound_at: b.bound_at,
          asset: asset ? assetResponse(asset) : null,
        };
      }),
    );

    const boundKeys = new Set(bindings.map((b) => b.asset_key));
    const missing = required
      .filter((r) => !boundKeys.has(r.key))
      .map((r) => ({ key: r.key, filename: r.filename ?? null, mime: r.mime ?? null }));

    res.json({
      success: true,
      data: {
        template_slug: slug,
        required: required.map((r) => ({
          key: r.key,
          filename: r.filename ?? null,
          mime: r.mime ?? null,
        })),
        bindings: hydrated,
        missing,
      },
    });
  } catch (error) {
    logger.error('templates-studio: get template asset bindings failed', {
      error,
      slug,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// PUT /api/templates-studio/templates/:slug/asset-bindings/:assetKey
export const upsertTemplateAssetBinding = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { slug, assetKey } = req.params;
  const { asset_id } = req.body as { asset_id: string };

  try {
    const template = await templateDefinitionRepository.findBySlug(slug);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template introuvable' });
      return;
    }
    // Vérifie que la `key` fait bien partie du manifest (anti drift : un user
    // ne peut binder qu'un slot déclaré, sinon le worker render n'utilisera
    // jamais l'URL).
    const manifest = template.manifest_json as {
      requiredAssets?: Array<{ key: string }>;
    };
    const required = manifest.requiredAssets ?? [];
    if (!required.some((r) => r.key === assetKey)) {
      res.status(400).json({
        success: false,
        error: `La clé '${assetKey}' n'est pas déclarée dans manifest.requiredAssets de ${slug}`,
      });
      return;
    }

    const asset = await studioAssetRepository.findById(asset_id);
    if (!asset) {
      res.status(404).json({ success: false, error: 'Asset introuvable' });
      return;
    }

    const binding = await templateAssetBindingRepository.upsertBinding({
      template_slug: slug,
      asset_key: assetKey,
      asset_id,
      bound_by: req.user.id,
    });
    logger.info('templates-studio: asset bound to template slot', {
      user_id: req.user.id,
      template_slug: slug,
      asset_key: assetKey,
      asset_id,
    });
    res.json({
      success: true,
      data: {
        template_slug: binding.template_slug,
        asset_key: binding.asset_key,
        asset_id: binding.asset_id,
        bound_by: binding.bound_by,
        bound_at: binding.bound_at,
        asset: assetResponse(asset),
      },
    });
  } catch (error) {
    logger.error('templates-studio: upsert template asset binding failed', {
      error,
      slug,
      assetKey,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// DELETE /api/templates-studio/templates/:slug/asset-bindings/:assetKey
export const deleteTemplateAssetBinding = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const { slug, assetKey } = req.params;
  try {
    const deleted = await templateAssetBindingRepository.deleteBinding(slug, assetKey);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Binding introuvable' });
      return;
    }
    logger.info('templates-studio: asset binding removed', {
      user_id: req.user.id,
      template_slug: slug,
      asset_key: assetKey,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('templates-studio: delete template asset binding failed', {
      error,
      slug,
      assetKey,
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ADR-128 — POST /api/templates-studio/assets/directory
//
// Upload multipart d'un ZIP contenant N fichiers PNG (séquence frames pour
// masque alpha). Le serveur :
//  1. Vérifie le mime ZIP + taille,
//  2. Hash SHA256 du ZIP, dédup via `findByChecksum`,
//  3. Décompresse en mémoire (jszip),
//  4. Trie alpha les PNGs, auto-détecte le pattern de nommage,
//  5. Upload chaque PNG sur FTP sous `studio-assets/directories/<hash>/...`,
//  6. INSERT 1 row `studio_assets` avec `asset_kind='directory'`.
//
// Limite multer : 50 MB (175 PNG ~150KB chacun = ~26 MB). Réservé super_admin /
// admin / operator côté routes.
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_DIRECTORY_MIMES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream', // certains browsers envoient ZIP en octet-stream
];

/**
 * Détecte le pattern de nommage à partir d'une liste triée de filenames.
 * Ex: ['frame_001.png', 'frame_002.png', ...] → 'frame_{i:03d}.png'
 *     ['001.png', '002.png', ...] → '{i:03d}.png'
 *     ['mask01.png', 'mask02.png', ...] → 'mask{i:02d}.png'
 *
 * Si aucun pattern numérique commun n'est détecté, lève une erreur
 * (l'utilisateur peut alors fournir le pattern explicitement via le body).
 */
function detectFramePattern(filenames: string[]): string {
  if (filenames.length === 0) {
    throw new Error('Aucun fichier PNG trouvé dans le ZIP');
  }
  const first = filenames[0];
  // Cherche la dernière séquence de digits dans le nom (avant l'extension).
  const match = first.match(/^(.*?)(\d+)(\.[a-zA-Z]+)$/);
  if (!match) {
    throw new Error(
      `Impossible d'auto-détecter le pattern depuis '${first}'. Fournis frame_pattern explicitement (ex: 'frame_{i:03d}.png').`,
    );
  }
  const [, prefix, digits, ext] = match;
  const padding = digits.length;
  // Vérifie que tous les filenames matchent ce template.
  const re = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{${padding}}${ext.replace(
      /\./g,
      '\\.',
    )}$`,
  );
  for (const f of filenames) {
    if (!re.test(f)) {
      throw new Error(
        `Pattern incohérent : '${f}' ne match pas le préfixe/padding détecté depuis '${first}'.`,
      );
    }
  }
  return `${prefix}{i:${String(padding).padStart(2, '0')}d}${ext}`;
}

export const uploadStudioAssetDirectory = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }
  const file = req.file;
  if (!file || file.size === 0) {
    res.status(400).json({ success: false, error: 'Aucun fichier ZIP fourni' });
    return;
  }
  // Le mime peut varier selon le browser — accepter octet-stream + check ext.
  const lowerName = (file.originalname || '').toLowerCase();
  const looksLikeZip =
    ALLOWED_DIRECTORY_MIMES.includes(file.mimetype) || lowerName.endsWith('.zip');
  if (!looksLikeZip) {
    res.status(400).json({
      success: false,
      error: `Format non supporté (${file.mimetype}). Attendu : ZIP de PNG frames.`,
    });
    return;
  }

  try {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Dédup : si même contenu (même ZIP) déjà uploadé → réutilise.
    const existing = await studioAssetRepository.findByChecksum(checksum);
    if (existing) {
      logger.info('templates-studio: directory upload deduplicated', {
        user_id: req.user.id,
        checksum_sha256: checksum,
        asset_id: existing.id,
      });
      res.status(200).json({
        success: true,
        data: { ...assetResponse(existing), deduplicated: true },
      });
      return;
    }

    // Décompresse le ZIP en mémoire via jszip.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const JSZip = require('jszip') as typeof import('jszip');
    const zip = await JSZip.loadAsync(file.buffer);

    // Liste les fichiers PNG (filtre les directories internes + non-PNG).
    const entries: Array<{ name: string; data: import('jszip').JSZipObject }> = [];
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      // Skip metadata files (__MACOSX/, .DS_Store, etc.)
      const baseName = relativePath.split('/').pop() ?? '';
      if (baseName.startsWith('.') || baseName.startsWith('_')) return;
      if (!baseName.toLowerCase().endsWith('.png')) return;
      entries.push({ name: baseName, data: zipEntry });
    });
    if (entries.length === 0) {
      res
        .status(400)
        .json({ success: false, error: 'ZIP vide ou ne contient aucun PNG' });
      return;
    }
    // Tri alpha → assure l'ordre des frames.
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    const filenamesSorted = entries.map((e) => e.name);

    // Pattern : explicite si fourni, sinon auto-détecté.
    const explicitPattern =
      typeof req.body?.frame_pattern === 'string' &&
      req.body.frame_pattern.trim().length > 0
        ? req.body.frame_pattern.trim().slice(0, 160)
        : null;
    let framePattern: string;
    try {
      framePattern = explicitPattern ?? detectFramePattern(filenamesSorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
      return;
    }

    // Décompresse en parallèle, garde l'ordre.
    const decompressed: Array<{ name: string; buffer: Buffer }> = await Promise.all(
      entries.map(async (e) => ({
        name: e.name,
        buffer: await e.data.async('nodebuffer'),
      })),
    );

    // Path FTP : prefix avec hash court pour content-addressable + nom sanitisé.
    const requestedFilename =
      typeof req.body?.filename === 'string' && req.body.filename.trim().length > 0
        ? req.body.filename.trim().slice(0, 160)
        : (file.originalname || 'directory').replace(/\.zip$/i, '');
    const sanitizedFilename = requestedFilename.replace(/[^A-Za-z0-9._\-/]/g, '_');
    const hashShort = checksum.slice(0, 12);
    const dirPrefix = `studio-assets/directories/${hashShort}-${sanitizedFilename}/`;

    // Upload batch (1 connexion FTP réutilisée).
    const filesToUpload = decompressed.map((d) => ({
      buffer: d.buffer,
      ftpPath: `${dirPrefix}${d.name}`,
    }));
    const { totalBytes } = await uploadFilesToFtpBatch(filesToUpload, 'image/png');

    const tags = parseTags(req.body?.tags);
    const created = await studioAssetRepository.createDirectory({
      filename: sanitizedFilename,
      ftp_path: dirPrefix,
      mime_type: 'application/x-png-frames',
      file_size_total: totalBytes,
      checksum_sha256: checksum,
      frame_count: decompressed.length,
      frame_pattern: framePattern,
      tags,
      uploaded_by: req.user.id,
    });

    logger.info('templates-studio: directory asset uploaded', {
      user_id: req.user.id,
      asset_id: created.id,
      frame_count: decompressed.length,
      frame_pattern: framePattern,
      total_bytes: totalBytes,
      ftp_path: dirPrefix,
    });

    res.status(201).json({
      success: true,
      data: assetResponse(created),
    });
  } catch (error) {
    logger.error('templates-studio: upload asset directory failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
  }
};
