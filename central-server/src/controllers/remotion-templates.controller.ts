import { Request, Response } from 'express';
import * as fs from 'fs';
import https from 'https';
import http from 'http';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { uploadAsset, getAssetUrl } from '../services/storage.service';
import {
  remotionTemplatesRepository,
  remotionRenderJobRepository,
} from '../repositories';
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
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const templates = await remotionTemplatesRepository.findAll(!isAdmin);
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
    const { name, composition_id, description, props_schema, default_props } = req.body;
    const template = await remotionTemplatesRepository.create({
      name,
      composition_id,
      description: description ?? null,
      props_schema: props_schema ?? [],
      default_props: default_props ?? {},
      created_by: req.user?.id ?? null,
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
