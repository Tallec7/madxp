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
  type SiteBrandKitRow,
  type PlayerRow,
} from '../repositories';
import {
  resolveBindings,
  type ManifestBindings,
} from '../services/templates-studio.service';
import { uploadFileToFtp, getFtpPublicUrl } from '../config/ftp-storage';

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
  site_id: string;
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
  const { prenom, nom, numero, poste, photo_raw_url } = req.body as {
    prenom: string;
    nom: string;
    numero?: number | null;
    poste?: string | null;
    photo_raw_url?: string | null;
  };

  try {
    const row = await playerRepository.create({
      site_id: siteId,
      prenom,
      nom,
      numero: numero ?? null,
      poste: poste ?? null,
      photo_raw_url: photo_raw_url ?? null,
    });
    logger.info('templates-studio: player created', {
      player_id: row.id,
      site_id: siteId,
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
    // Verify player belongs to site (defense-in-depth tenant guard).
    const existing = await playerRepository.findById(playerId);
    if (!existing || existing.site_id !== siteId) {
      res.status(404).json({ success: false, error: 'Joueur introuvable pour ce site' });
      return;
    }

    // Hash content-addressable pour éviter les collisions FTP si le même
    // joueur est ré-uploadé. Garde versionning implicite (cleanup futur).
    const hash = createHash('sha1')
      .update(file.buffer)
      .digest('hex')
      .slice(0, 12);
    const ext = PHOTO_EXT_BY_MIME[file.mimetype];
    const storagePath = `players/${siteId}/${playerId}-raw-${hash}.${ext}`;

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
    const updated = await playerRepository.update(playerId, siteId, {
      photo_raw_url: publicUrl,
    });
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
