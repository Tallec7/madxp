import { Request, Response } from 'express';
import * as fs from 'fs';
import https from 'https';
import http from 'http';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { uploadAsset, getAssetUrl } from '../services/storage.service';
import {
  remotionTemplatesRepository,
  remotionTemplateVersionsRepository,
  remotionRenderJobRepository,
  siteRepository,
} from '../repositories';
import { metricsService } from '../services/metrics.service';
import { hasFeatureOverride, resolveTierLevel, TIER_LEVEL } from '../middleware/require-site-tier';
export { prewarmRemotionBundle } from '../services/remotion-render-worker.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const cleanupFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // non-bloquant
  }
};

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/remotion-templates
 * Liste les templates publiés (clubs) ou tous (admin/operator)
 */
export const listTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const isAdmin = role === 'admin' || role === 'super_admin';
    const siteId = req.user?.site_id ?? null;

    // ADR-075 V2 — scope par site :
    //   - super_admin/admin voient tout (globaux + tous les club-scoped)
    //   - operator/club voient : globaux publiés + ceux de leur site
    let templates;
    if (isAdmin) {
      templates = await remotionTemplatesRepository.findAll(false);
    } else if (siteId) {
      templates = await remotionTemplatesRepository.findVisibleForSite(siteId, true);
    } else {
      templates = await remotionTemplatesRepository.findAll(true);
    }
    res.json(templates);
  } catch (error) {
    logger.error('listTemplates error', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/remotion-templates/:id
 */
export const getTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const template = await remotionTemplatesRepository.findById(id);
    if (!template) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(template);
  } catch (error) {
    logger.error('getTemplate error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates
 * Crée un nouveau template (admin only)
 */
export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { name, composition_id, description, props_schema, default_props, site_id } = req.body as {
      name: string;
      composition_id: string;
      description?: string | null;
      props_schema?: Record<string, unknown>[];
      default_props?: Record<string, unknown>;
      site_id?: string | null;
    };

    // ADR-075 V2 — seul super_admin peut scoper un template à un club (white-glove).
    // Les admins classiques créent uniquement des templates globaux.
    const scopedSiteId =
      req.user?.role === 'super_admin' ? site_id ?? null : null;

    const template = await remotionTemplatesRepository.create({
      name,
      composition_id,
      description: description ?? null,
      props_schema: props_schema ?? [],
      default_props: default_props ?? {},
      created_by: req.user?.id ?? null,
      site_id: scopedSiteId,
    });
    res.status(201).json(template);
  } catch (error) {
    logger.error('createTemplate error', { error });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/remotion-templates/asset-proxy?url=<encoded_ftp_url>
 * Proxy same-origin pour les assets FTP (kalonpartners.bzh).
 * Permet au @remotion/player de charger des WebM FTP sans CORS ni CSP cross-origin.
 *
 * CRITIQUE : Remotion player requiert des vidéos "seekable" — il envoie des
 * Range requests (ex: Range: bytes=0-) pour accéder à des positions précises.
 * Ce proxy transmet le header Range à l'upstream et relaie le 206 Partial Content,
 * ce qui rend la vidéo seekable côté browser.
 *
 * Sécurité : seul le domaine kalonpartners.bzh est autorisé.
 */
const ALLOWED_PROXY_HOST = 'kalonpartners.bzh';

export const proxyTemplateAsset = (req: Request, res: Response): void => {
  const rawUrl = req.query['url'] as string | undefined;
  if (!rawUrl) {
    res.status(400).json({ error: 'url requis' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(decodeURIComponent(rawUrl));
  } catch {
    res.status(400).json({ error: 'url invalide' });
    return;
  }

  // Restriction de sécurité : uniquement kalonpartners.bzh
  if (parsed.hostname !== ALLOWED_PROXY_HOST) {
    res.status(403).json({ error: 'Domaine non autorisé' });
    return;
  }

  // Transmettre les Range headers pour le support seek (Remotion player en a besoin)
  const upstreamHeaders: Record<string, string> = {};
  if (req.headers['range']) {
    upstreamHeaders['Range'] = req.headers['range'] as string;
  }

  const transport = parsed.protocol === 'https:' ? https : http;
  const upstreamReq = transport.request(
    { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers: upstreamHeaders },
    (upstreamRes) => {
      // Relayer les headers nécessaires pour le seek et le streaming vidéo
      const relay = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of relay) {
        if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h] as string);
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(upstreamRes.statusCode ?? 200);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('error', (err) => {
    logger.error('proxyTemplateAsset error', { url: rawUrl, error: err.message });
    if (!res.headersSent) res.status(502).json({ error: 'Erreur proxy' });
  });

  upstreamReq.end();
};

/**
 * PATCH /api/remotion-templates/:id/publish
 * Publie ou dépublie un template (admin only)
 */
export const publishTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { published } = req.body;
    const template = await remotionTemplatesRepository.setPublished(id, Boolean(published));
    if (!template) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(template);
  } catch (error) {
    logger.error('publishTemplate error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * PATCH /api/remotion-templates/:id/schema-version
 * Bascule un template entre v1 (legacy props_schema) et v2 (data-driven
 * variants/layers/text_fields/image_slots). super_admin uniquement.
 *
 * Flipper vers v2 exige que les shadow data v2 aient déjà été seedées — sinon
 * 409 Conflict avec détail du manque, pour éviter de casser le rendu.
 */
export const setTemplateSchemaVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { schema_version } = req.body as { schema_version: 1 | 2 };

    const current = await remotionTemplatesRepository.findSchemaVersion(id);
    if (current === null) {
      metricsService.recordTemplateStudioOperation('studio_view', 'update', 'not_found');
      return res.status(404).json({ error: 'Template non trouvé' });
    }

    if (current === schema_version) {
      const tpl = await remotionTemplatesRepository.findById(id);
      return res.json(tpl);
    }

    if (schema_version === 2) {
      const counts = await remotionTemplatesRepository.countStudioShadowData(id);
      if (counts.variants === 0 || counts.textFields === 0 || counts.imageSlots === 0) {
        metricsService.recordTemplateStudioOperation('studio_view', 'update', 'conflict');
        return res.status(409).json({
          error: 'Impossible de flipper en v2 : shadow data v2 manquantes',
          missing: {
            variants: counts.variants === 0,
            text_fields: counts.textFields === 0,
            image_slots: counts.imageSlots === 0,
          },
          counts,
        });
      }
    }

    const updated = await remotionTemplatesRepository.setSchemaVersion(id, schema_version);
    if (!updated) {
      metricsService.recordTemplateStudioOperation('studio_view', 'update', 'not_found');
      return res.status(404).json({ error: 'Template non trouvé' });
    }

    metricsService.recordTemplateStudioOperation('studio_view', 'update', 'success');
    logger.info('Template schema_version flipped', {
      templateId: id,
      from: current,
      to: schema_version,
      userId: req.user?.id,
    });
    res.json(updated);
  } catch (error) {
    logger.error('setTemplateSchemaVersion error', { error, id: req.params.id });
    metricsService.recordTemplateStudioOperation('studio_view', 'update', 'error');
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates/:id/assets
 * Upload un asset vidéo (WebM/MP4) vers le FTP et retourne son URL publique.
 * L'URL est ensuite sauvegardée dans default_props du template (ex: videoSrcA).
 * Admin uniquement.
 */
export const uploadTemplateAssetController = async (req: AuthRequest, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  const filePath = file?.path;

  try {
    const { id } = req.params;
    const { prop_key } = req.body as { prop_key?: string };

    if (!file || !filePath) {
      return res.status(400).json({ error: 'Fichier requis' });
    }
    if (!prop_key) {
      return res.status(400).json({ error: 'prop_key requis (ex: videoSrcA)' });
    }

    const template = await remotionTemplatesRepository.findById(id);
    if (!template) {
      cleanupFile(filePath);
      return res.status(404).json({ error: 'Template non trouvé' });
    }

    // Upload vers FTP — dossier remotion-assets/
    const storagePath = `remotion-assets/${Date.now()}-${file.originalname}`;
    const buffer = fs.readFileSync(filePath);
    const result = await uploadAsset(buffer, storagePath, file.mimetype);

    cleanupFile(filePath);

    if (!result) {
      return res.status(500).json({ error: 'Échec upload FTP' });
    }

    const publicUrl = getAssetUrl(storagePath);

    // Mettre à jour default_props du template avec la nouvelle URL
    const updatedDefaultProps = { ...(template.default_props as Record<string, unknown>), [prop_key]: publicUrl };
    await remotionTemplatesRepository.updateDefaultProps(id, updatedDefaultProps);

    logger.info('Template asset uploaded', { templateId: id, prop_key, url: publicUrl });
    res.json({ url: publicUrl, prop_key });
  } catch (error) {
    if (filePath) cleanupFile(filePath);
    logger.error('uploadTemplateAsset error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates/:id/user-uploads (ADR-077)
 * Upload une image utilisateur (JPEG/PNG/WebP ≤ 10Mo) vers FTP, namespaced
 * par `template-assets/user-uploads/{siteId}/{userId}/`. Accessible à tout
 * utilisateur authentifié (contrairement à `/:id/assets` super_admin-only).
 * Ne modifie PAS default_props du template : l'URL est retournée au client
 * qui la passe dans le payload render sous `imageUploads[slotKey]`.
 */
export const uploadUserImageAsset = async (req: AuthRequest, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;
  const filePath = file?.path;

  try {
    const { id } = req.params;
    const { slot_key } = req.body as { slot_key?: string };

    if (!file || !filePath) {
      return res.status(400).json({ error: 'Fichier image requis' });
    }
    if (!slot_key) {
      return res.status(400).json({ error: 'slot_key requis' });
    }

    const template = await remotionTemplatesRepository.findById(id);
    if (!template) {
      cleanupFile(filePath);
      return res.status(404).json({ error: 'Template non trouvé' });
    }

    const userId = req.user?.id ?? 'anonymous';
    const siteId = req.user?.site_id ?? 'shared';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `template-assets/user-uploads/${siteId}/${userId}/${Date.now()}-${safeName}`;

    const buffer = fs.readFileSync(filePath);
    const result = await uploadAsset(buffer, storagePath, file.mimetype);
    cleanupFile(filePath);

    if (!result) {
      return res.status(500).json({ error: 'Échec upload FTP' });
    }

    const publicUrl = getAssetUrl(storagePath);
    logger.info('template_user_image_uploaded', {
      templateId: id,
      slotKey: slot_key,
      userId,
      siteId,
      role: req.user?.role,
      mime: file.mimetype,
      size: file.size,
    });

    res.json({ url: publicUrl, slot_key });
  } catch (error) {
    if (filePath) cleanupFile(filePath);
    logger.error('uploadUserImageAsset error', {
      error: error instanceof Error ? error.message : error,
      templateId: req.params.id,
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates/:id/render
 * Enqueue an async render job (ADR-054). Returns 202 { job_id } immediately.
 * The in-process worker picks it up, and the frontend polls GET /render-jobs/:jobId.
 *
 * Body: { props: object, title?: string }
 *
 * Deployment (ADR-052):
 *   - REMOTION_DIR must point to the templates-remotion directory
 *   - Docker builder copies the folder: COPY templates-remotion/ /app/templates-remotion/
 */
export const renderTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { props = {}, title } = req.body;

    const template = await remotionTemplatesRepository.findPublishedById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template non trouvé ou non publié' });
    }

    // ADR-075 V2 — template scopé à un club (white-glove) :
    //   1) Refuser si l'utilisateur n'appartient pas au site scope (sauf admin/super_admin)
    //   2) Vérifier le feature gate `template_studio_club_scoped` (Premium ou override)
    if (template.site_id) {
      const role = req.user?.role;
      const isPrivileged = role === 'admin' || role === 'super_admin';
      if (!isPrivileged && req.user?.site_id !== template.site_id) {
        return res.status(403).json({ error: 'Template réservé à un autre club' });
      }
      const scopedSite = await siteRepository.findById(template.site_id);
      if (!scopedSite) {
        return res.status(404).json({ error: 'Site du template introuvable' });
      }
      const hasOverride = hasFeatureOverride(
        scopedSite as { feature_overrides?: Record<string, boolean> | null },
        'template_studio_club_scoped',
      );
      const plan = (scopedSite as { subscription_plan?: string | null }).subscription_plan;
      const tierOk = resolveTierLevel(plan) >= TIER_LEVEL.premium;
      if (!hasOverride && !tierOk) {
        return res.status(403).json({
          error: 'Les templates perso club sont réservés au tier Premium',
          required_tier: 'premium',
        });
      }
    }

    const job = await remotionRenderJobRepository.create({
      template_id: id,
      props: props ?? {},
      title: title || template.name,
      requested_by: req.user?.id ?? null,
      // Auto-tag for club users (scope to their site); admin/super_admin → null (global lib).
      requested_for_site_id: req.user?.role === 'club' ? req.user.site_id ?? null : null,
    });

    logger.info('Render job enqueued', {
      jobId: job.id,
      templateId: id,
      requestedBy: job.requested_by,
    });

    res.status(202).json({
      job_id: job.id,
      status: job.status,
      progress: job.progress,
    });
  } catch (error) {
    logger.error('renderTemplate enqueue error', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      error: 'Erreur lors de la mise en file du render',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * PATCH /api/remotion-templates/:id
 * Update template fields (name, description, props_schema, default_props).
 * Admin only. Changes to props_schema/default_props automatically snapshot the
 * previous state via `trg_neopro_templates_snapshot` (ADR-055).
 */
export const updateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, props_schema, default_props, site_id } = req.body as {
      name?: string;
      description?: string | null;
      props_schema?: Record<string, unknown>[];
      default_props?: Record<string, unknown>;
      site_id?: string | null;
    };

    const existing = await remotionTemplatesRepository.findById(id);
    if (!existing) return res.status(404).json({ error: 'Template non trouvé' });

    // ADR-075 V2 — site_id modifiable uniquement par super_admin (white-glove scoping).
    const siteIdPatch = req.user?.role === 'super_admin' ? site_id : undefined;

    const updated = await remotionTemplatesRepository.update(id, {
      name,
      description,
      props_schema,
      default_props,
      site_id: siteIdPatch,
    });

    logger.info('Template updated', {
      templateId: id,
      fields: {
        name: name !== undefined,
        description: description !== undefined,
        props_schema: props_schema !== undefined,
        default_props: default_props !== undefined,
        site_id: siteIdPatch !== undefined,
      },
      userId: req.user?.id,
    });

    res.json(updated);
  } catch (error) {
    logger.error('updateTemplate error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates/:id/duplicate
 * Duplicate a template (admin only). Copies composition_id, description,
 * props_schema, default_props. The new row starts unpublished.
 * Body: { name?: string }
 */
export const duplicateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body as { name?: string };

    const copy = await remotionTemplatesRepository.duplicate(id, {
      name,
      createdBy: req.user?.id ?? null,
    });

    if (!copy) return res.status(404).json({ error: 'Template non trouvé' });

    logger.info('Template duplicated', { sourceId: id, newId: copy.id, userId: req.user?.id });
    res.status(201).json(copy);
  } catch (error) {
    logger.error('duplicateTemplate error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/remotion-templates/:id/versions
 * List snapshotted versions (props_schema + default_props history) for a
 * template. Admin only. Most recent first.
 */
export const listTemplateVersions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const template = await remotionTemplatesRepository.findById(id);
    if (!template) return res.status(404).json({ error: 'Template non trouvé' });

    const versions = await remotionTemplateVersionsRepository.listByTemplate(id);
    res.json(versions);
  } catch (error) {
    logger.error('listTemplateVersions error', { error, id: req.params.id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/remotion-templates/:id/versions/:versionId/restore
 * Restore a previous version's props_schema + default_props onto the live
 * template. The restore itself is an UPDATE → triggers a new 'pre-update'
 * snapshot, so the pre-restore state is never lost (ADR-055).
 * Admin only.
 */
export const restoreTemplateVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    const template = await remotionTemplatesRepository.findById(id);
    if (!template) return res.status(404).json({ error: 'Template non trouvé' });

    const version = await remotionTemplateVersionsRepository.findById(versionId);
    if (!version || version.template_id !== id) {
      return res.status(404).json({ error: 'Version non trouvée' });
    }

    const updated = await remotionTemplatesRepository.update(id, {
      props_schema: version.props_schema,
      default_props: version.default_props,
    });

    logger.info('Template version restored', {
      templateId: id,
      versionId,
      userId: req.user?.id,
    });

    res.json(updated);
  } catch (error) {
    logger.error('restoreTemplateVersion error', {
      error,
      id: req.params.id,
      versionId: req.params['versionId'],
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/remotion-templates/render-jobs/:jobId
 * Poll render job status. Ownership guard: club users only see their own jobs;
 * admin/super_admin/operator see any job.
 */
export const getRenderJob = async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await remotionRenderJobRepository.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job non trouvé' });

    const role = req.user?.role;
    const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'operator';
    if (!isPrivileged && job.requested_by !== req.user?.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json({
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      phase: job.phase,
      video_id: job.video_id,
      video_url: job.video_url,
      file_size: job.file_size,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
    });
  } catch (error) {
    logger.error('getRenderJob error', {
      error: error instanceof Error ? error.message : error,
      jobId: req.params['jobId'],
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
