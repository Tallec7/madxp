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

import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  templateDefinitionRepository,
  renderRequestRepository,
  siteBrandKitRepository,
  type SiteBrandKitRow,
} from '../repositories';
import {
  resolveBindings,
  type ManifestBindings,
} from '../services/templates-studio.service';

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
// POST /api/templates-studio/render-requests
// Crée une demande de rendu. site_id pris du JWT. Worker (J4) picke ensuite.
// ────────────────────────────────────────────────────────────────────────────

export const createRenderRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return;
  }

  const siteId = req.user.site_id;
  if (!siteId) {
    // Seuls les clubs ont un site_id sur leur JWT. Les internal roles (admin,
    // operator) devront passer par une variante /api/sites/:siteId/render-requests
    // en V2 — pour V1 on bloque proprement plutôt que d'accepter un site_id du body.
    res.status(400).json({
      success: false,
      error: 'site_id non disponible sur ce compte (V1 = club user uniquement)',
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

    // Résolveur cascade : input + brand kit → payload résolu stocké en DB.
    // Le worker enverra ce payload tel quel au render server, pas le raw input.
    // Audit trail : la row contient exactement ce qui a été rendu.
    const brandKit = await siteBrandKitRepository.findBySite(siteId);
    const resolvedProps = resolveBindings({
      manifest: template.manifest_json as unknown as ManifestBindings,
      inputProps: props,
      brandKit,
      // playersById omitted — S4 deferred (worker rembg pas livré).
      // Les bindings player.* renverront null avec un warn structuré.
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
