import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { uploadVideoFromDisk, uploadAsset, getAssetUrl } from '../services/storage.service';
import {
  videoRepository,
  siteRepository,
  siteVideoRepository,
  remotionTemplatesRepository,
} from '../repositories';

// Chemin vers templates-remotion (sibling du central-server dans le repo)
// Sur Railway : REMOTION_DIR env var doit pointer vers le dossier déployé
const REMOTION_DIR = process.env.REMOTION_DIR
  || path.resolve(__dirname, '../../../../templates-remotion');

// Point d'entrée Remotion (index.ts / index.js selon l'environnement)
const REMOTION_ENTRY = path.join(REMOTION_DIR, 'src', 'index.ts');

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
 * Lance le render Remotion côté serveur et injecte le MP4 dans la bibliothèque du site.
 *
 * Body: { props: object, site_id: string, title?: string }
 *
 * Deployment note (ADR-052):
 *   - En local : REMOTION_DIR pointe vers ../../templates-remotion
 *   - Sur Railway : ajouter REMOTION_DIR=/app/templates-remotion dans les env vars
 *     ET copier le dossier dans le Dockerfile (COPY templates-remotion/ /app/templates-remotion/)
 */
export const renderTemplate = async (req: AuthRequest, res: Response) => {
  const outputPath = path.join(os.tmpdir(), `remotion-render-${Date.now()}.mp4`);

  try {
    const { id } = req.params;
    const { props = {}, site_id, title } = req.body;

    // Récupérer le template
    const template = await remotionTemplatesRepository.findPublishedById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template non trouvé ou non publié' });
    }

    // Valider le site_id
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) return res.status(400).json({ error: 'Site non trouvé' });
    }

    // Vérifier que REMOTION_DIR existe
    if (!fs.existsSync(REMOTION_DIR)) {
      logger.error('REMOTION_DIR not found', { REMOTION_DIR });
      return res.status(500).json({
        error: 'Moteur Remotion non disponible sur ce serveur',
        hint: 'Vérifiez REMOTION_DIR env var et le déploiement Dockerfile (ADR-052)',
      });
    }

    logger.info('Starting Remotion render', {
      templateId: id,
      compositionId: template.composition_id,
      siteId: site_id,
      remotionDir: REMOTION_DIR,
    });

    // Lancer le render Remotion via Node.js API (in-process, pas de subprocess)
    await runRemotion(template.composition_id, outputPath, props);

    // Vérifier que le fichier existe et a du contenu
    const stat = fs.statSync(outputPath);
    if (stat.size === 0) throw new Error('Remotion render produced empty file');

    logger.info('Remotion render complete', { outputPath, size: stat.size });

    // Générer un nom de fichier unique
    const safeTitle = (title || template.name).replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `videos/templates/${safeTitle}_${Date.now()}.mp4`;

    // Upload vers FTP
    const uploadResult = await uploadVideoFromDisk(outputPath, stat.size, storagePath, 'video/mp4');
    if (!uploadResult) {
      throw new Error('FTP upload failed');
    }

    // Créer l'entrée vidéo en base
    const video = await videoRepository.create({
      filename: storagePath.split('/').pop()!,
      original_name: `${title || template.name}.mp4`,
      category: 'templates',
      subcategory: template.name,
      file_size: stat.size,
      mime_type: 'video/mp4',
      storage_path: uploadResult.path,
      checksum: '',
      metadata: { title: title || template.name, remotion_template_id: id, props },
      uploaded_by: req.user?.id ?? null,
      uploaded_for_site_id: site_id ?? null,
      upload_status: uploadResult.verified ? 'ready' : 'failed',
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: null,
    });

    // Lier au site
    if (site_id) {
      await siteVideoRepository.link(site_id, video.id, req.user?.id);
    }

    res.json({
      video_id: video.id,
      url: uploadResult.url,
      title: title || template.name,
      file_size: stat.size,
    });

  } catch (error) {
    logger.error('renderTemplate error', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      error: 'Erreur lors du render',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cleanupFile(outputPath);
  }
};

// ── Remotion runner (Node.js API — in-process, no subprocess) ────────────────

async function runRemotion(
  compositionId: string,
  outputPath: string,
  inputProps: Record<string, unknown>,
): Promise<void> {
  // Dynamic imports to avoid loading heavy Remotion modules at startup
  const { bundle } = await import('@remotion/bundler') as typeof import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer') as typeof import('@remotion/renderer');

  logger.info('Bundling Remotion entry', { entry: REMOTION_ENTRY });

  const bundled = await bundle({
    entryPoint: REMOTION_ENTRY,
    // Serve static assets (webm, fonts, images) from templates-remotion/public/
    // Required for staticFile() references to resolve correctly in headless Chromium
    publicDir: path.join(REMOTION_DIR, 'public'),
    // Silence webpack progress output
    onProgress: (p) => {
      if (p % 25 === 0) logger.debug('Remotion bundle progress', { percent: p });
    },
  });

  logger.info('Selecting composition', { compositionId });

  const chromiumOptions = {
    // Remotion v4 already adds --no-sandbox on Linux automatically.
    // swangle = software WebGL renderer — required for WebM video decoding in
    // headless containers without GPU (Railway node:20-slim).
    // 'angle' relies on EGL/GPU which may silently block video readyState.
    gl: 'swangle' as const,
    headless: true,
  };

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps,
    chromiumOptions,
    timeoutInMilliseconds: 90000,
  });

  logger.info('Rendering composition', { compositionId, durationInFrames: composition.durationInFrames });

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions,
    // 90s timeout — headless containers can be slow to decode WebM via swangle
    timeoutInMilliseconds: 90000,
    // yuv420p: required for Pi hardware H.264 decode — other formats (yuv422p, yuv444p)
    // fall back to software decode on Pi and cause choppy playback.
    pixelFormat: 'yuv420p',
    // concurrency: 1 forces sequential frame rendering.
    // Default (= CPU cores) spawns N Chromium instances each decoding 3-5 WebM files
    // via swangle simultaneously → CPU/memory thrashing → uneven frame durations →
    // VFR-like output that stutters on playback.
    concurrency: 1,
    // crf 18 = high quality, consistent bitrate. Without crf, Remotion uses a default
    // that can produce large bitrate spikes causing buffering during playback.
    crf: 18,
    onProgress: ({ renderedFrames, progress }) => {
      logger.debug('Remotion render progress', { renderedFrames, progress: Math.round(progress * 100) });
    },
  });

  logger.info('Remotion render complete', { outputPath });
}
