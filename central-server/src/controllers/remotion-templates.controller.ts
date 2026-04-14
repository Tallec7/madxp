import { Response } from 'express';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { query } from '../config/database';
import { uploadVideoFromDisk } from '../services/storage.service';
import { videoRepository, siteRepository, siteVideoRepository } from '../repositories';
import { buildShardedVideoPath } from '../services/storage.service';

// Chemin vers templates-remotion (sibling du central-server dans le repo)
// Sur Railway : REMOTION_DIR env var doit pointer vers le dossier déployé
const REMOTION_DIR = process.env.REMOTION_DIR
  || path.resolve(__dirname, '../../../../templates-remotion');

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
    const whereClause = isAdmin ? '' : 'WHERE published = true';
    const result = await query(
      `SELECT id, name, composition_id, description, props_schema, default_props,
              thumbnail_url, published, created_at
       FROM neopro_templates
       ${whereClause}
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
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
    const result = await query(
      'SELECT * FROM neopro_templates WHERE id = $1',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(result.rows[0]);
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
    const result = await query(
      `INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, composition_id, description || null,
       JSON.stringify(props_schema || []),
       JSON.stringify(default_props || {}),
       req.user?.id || null]
    );
    res.status(201).json(result.rows[0]);
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
    const result = await query(
      `UPDATE neopro_templates SET published = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [Boolean(published), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('publishTemplate error', { error, id: req.params.id });
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
    const tplResult = await query(
      'SELECT * FROM neopro_templates WHERE id = $1 AND published = true',
      [id]
    );
    if (!tplResult.rows.length) {
      return res.status(404).json({ error: 'Template non trouvé ou non publié' });
    }
    const template = tplResult.rows[0] as { composition_id: string; name: string; };

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

    // Lancer le render Remotion
    const propsJson = JSON.stringify(props);
    await runRemotion(template.composition_id, outputPath, propsJson);

    // Vérifier que le fichier existe et a du contenu
    const stat = fs.statSync(outputPath);
    if (stat.size === 0) throw new Error('Remotion render produced empty file');

    logger.info('Remotion render complete', { outputPath, size: stat.size });

    // Générer un nom de fichier unique
    const safeTitle = (title || template.name).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = buildShardedVideoPath(
      require('crypto').randomUUID(),
      '.mp4'
    ).replace('videos/', `videos/templates/${safeTitle}_${Date.now()}.mp4`).split('/').pop()!;
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
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
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

// ── Remotion runner ───────────────────────────────────────────────────────────

function runRemotion(compositionId: string, outputPath: string, propsJson: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'remotion', 'render',
      compositionId,
      outputPath,
      `--props=${propsJson}`,
      '--log=verbose',
    ];

    logger.info('Spawning Remotion', { args: args.join(' '), cwd: REMOTION_DIR });

    const proc = spawn('npx', args, {
      cwd: REMOTION_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.stdout.on('data', (d: Buffer) => {
      logger.debug('remotion stdout', { line: d.toString().trim() });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        logger.error('Remotion process failed', { code, stderr: stderr.slice(-1000) });
        reject(new Error(`Remotion exited with code ${code}: ${stderr.slice(-300)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Remotion: ${err.message}`));
    });
  });
}
