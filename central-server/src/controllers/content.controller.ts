import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import logger from '../config/logger';
import pool from '../config/database';
import { AuthRequest } from '../types';
import deploymentService from '../services/deployment.service';
import { uploadFile, deleteFile } from '../config/supabase';
import { formatPaginatedResponse } from '../middleware/pagination';

/**
 * Calcule le checksum SHA256 d'un buffer
 */
function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export const getVideos = async (req: AuthRequest, res: Response) => {
  try {
    const { category, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 20, offset: 0 };

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (original_name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Requêtes paginée et count en parallèle
    const dataQuery = `
      SELECT id, filename, original_name, category, subcategory,
             file_size, duration, storage_path as url,
             thumbnail_url, metadata, created_at, updated_at
      FROM videos
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `SELECT COUNT(*) as count FROM videos ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, pagination.limit, pagination.offset]),
      pool.query(countQuery, params),
    ]);

    // Ajouter le titre depuis les metadata ou utiliser original_name
    const videos = dataResult.rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename
    }));

    const total = parseInt((countResult.rows[0] as any)?.count || '0', 10);

    res.json(formatPaginatedResponse(videos, total, pagination));
  } catch (error) {
    logger.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des vidéos' });
  }
};

export const getVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, filename, original_name, category, subcategory,
              file_size, duration, storage_path as url,
              thumbnail_url, metadata, created_at, updated_at
       FROM videos
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    const video = result.rows[0];
    video.title = (video.metadata as { title?: string })?.title || video.original_name || video.filename;

    res.json(video);
  } catch (error) {
    logger.error('Error fetching video:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la vidéo' });
  }
};

/**
 * Récupère l'historique des déploiements pour une vidéo spécifique
 */
export const getVideoDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Fetching video deployments:', { videoId: id });

    // Vérifier que la vidéo existe
    const videoResult = await pool.query('SELECT id FROM videos WHERE id = $1', [id]);
    if (videoResult.rows.length === 0) {
      logger.warn('Video not found for deployments:', { videoId: id });
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    // Récupérer tous les déploiements pour cette vidéo
    const result = await pool.query(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at, cd.created_at, cd.started_at,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                WHEN cd.target_type = 'group' THEN g.name
              END as target_name,
              CASE
                WHEN cd.target_type = 'site' THEN s.club_name
                ELSE NULL
              END as club_name,
              u.first_name || ' ' || u.last_name as deployed_by_name
       FROM content_deployments cd
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       LEFT JOIN groups g ON cd.target_type = 'group' AND cd.target_id = g.id
       LEFT JOIN users u ON cd.deployed_by = u.id
       WHERE cd.video_id = $1
       ORDER BY cd.created_at DESC`,
      [id]
    );

    // Statistiques résumées
    const stats = {
      total: result.rows.length,
      completed: result.rows.filter(d => d.status === 'completed').length,
      failed: result.rows.filter(d => d.status === 'failed').length,
      pending: result.rows.filter(d => d.status === 'pending').length,
      in_progress: result.rows.filter(d => d.status === 'in_progress').length,
    };

    logger.info('Video deployments fetched successfully:', { videoId: id, count: result.rows.length });

    res.json({
      video_id: id,
      stats,
      deployments: result.rows
    });
  } catch (error) {
    logger.error('Error fetching video deployments:', { videoId: req.params.id, error });
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la récupération de l\'historique des déploiements',
      details: errorMessage
    });
  }
};

export const createVideo = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { title, category, subcategory } = req.body;

    // Générer un nom de fichier unique
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    const filename = `${uniqueId}${ext}`;

    // Calculer le checksum SHA256 pour vérification d'intégrité
    const checksum = calculateChecksum(file.buffer);

    // Upload vers Supabase Storage
    logger.info('Uploading video to storage:', { filename, size: file.size, mimetype: file.mimetype });
    const uploadResult = await uploadFile(file.buffer, filename, file.mimetype);

    if (!uploadResult) {
      logger.error('Failed to upload video to storage - uploadResult is null');
      return res.status(500).json({
        error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration Supabase (SUPABASE_URL et SUPABASE_SERVICE_KEY).'
      });
    }

    // Utiliser le titre fourni ou le nom original du fichier
    const videoTitle = title || file.originalname;
    const original_name = file.originalname;
    const file_size = file.size;
    const mime_type = file.mimetype;

    logger.info('Inserting video metadata into database:', { filename, title: videoTitle });
    const result = await pool.query(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, filename as name, original_name, category, subcategory, file_size as size, duration, storage_path as url, thumbnail_url, checksum, metadata, created_at, updated_at`,
      [filename, original_name, category || null, subcategory || null, file_size, mime_type, uploadResult.path, checksum, { title: videoTitle }, req.user?.id || null]
    );

    // Ajouter le titre et l'URL à la réponse pour l'affichage client
    const video = result.rows[0];
    video.title = videoTitle;
    video.url = uploadResult.url;

    logger.info('Video created successfully:', { id: video.id, filename, title: videoTitle, storagePath: uploadResult.path, checksum });
    res.status(201).json(video);
  } catch (error) {
    logger.error('Error creating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la création de la vidéo',
      details: errorMessage
    });
  }
};

export const createVideos = async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { category, subcategory } = req.body;
    const results: Array<{ id: string; name: string; title: string; size: number; success: true }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    logger.info('Starting bulk video upload:', { count: files.length, category, subcategory });

    for (const file of files) {
      try {
        // Générer un nom de fichier unique
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        const filename = `${uniqueId}${ext}`;

        // Upload vers Supabase Storage
        logger.info('Uploading video to storage (bulk):', { filename, size: file.size });
        const uploadResult = await uploadFile(file.buffer, filename, file.mimetype);

        if (!uploadResult) {
          errors.push({
            name: file.originalname,
            error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration Supabase.'
          });
          continue;
        }

        // Utiliser le nom original comme titre
        const videoTitle = file.originalname;
        const original_name = file.originalname;
        const file_size = file.size;
        const mime_type = file.mimetype;

        const result = await pool.query(
          `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, metadata, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, filename as name, original_name, file_size as size`,
          [filename, original_name, category || null, subcategory || null, file_size, mime_type, uploadResult.path, { title: videoTitle }, req.user?.id || null]
        );

        const video = result.rows[0] as { id: string; name: string; original_name: string; size: number };
        results.push({
          id: video.id,
          name: video.name,
          title: videoTitle,
          size: video.size,
          success: true
        });

        logger.info('Video created (bulk):', { id: video.id, filename, title: videoTitle });
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Erreur inconnue';
        errors.push({ name: file.originalname, error: errorMessage });
        logger.error('Error creating video in bulk:', { filename: file.originalname, error: fileError });
      }
    }

    const allSuccess = errors.length === 0;
    const message = `${results.length}/${files.length} vidéo(s) uploadée(s) avec succès`;

    logger.info('Bulk video upload completed:', { total: files.length, success: results.length, failed: errors.length });

    res.status(allSuccess ? 201 : 207).json({
      success: allSuccess,
      message,
      files: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Error in bulk video upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de l\'upload des vidéos',
      details: errorMessage
    });
  }
};

export const updateVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { filename, original_name, category, subcategory, file_size, duration, storage_path, thumbnail_url, metadata } = req.body;

    const result = await pool.query(
      `UPDATE videos
       SET filename = COALESCE($1, filename),
           original_name = COALESCE($2, original_name),
           category = COALESCE($3, category),
           subcategory = COALESCE($4, subcategory),
           file_size = COALESCE($5, file_size),
           duration = COALESCE($6, duration),
           storage_path = COALESCE($7, storage_path),
           thumbnail_url = COALESCE($8, thumbnail_url),
           metadata = COALESCE($9, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [filename, original_name, category, subcategory, file_size, duration, storage_path, thumbnail_url, metadata, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    logger.info('Video updated:', { id, filename });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating video:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la vidéo' });
  }
};

export const deleteVideo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Récupérer le chemin de stockage avant suppression
    const videoResult = await pool.query(
      `SELECT storage_path FROM videos WHERE id = $1`,
      [id]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    const storagePath = videoResult.rows[0].storage_path as string | null;

    // Supprimer de la base de données
    const result = await pool.query(
      `DELETE FROM videos WHERE id = $1 RETURNING *`,
      [id]
    );

    // Supprimer du stockage Supabase
    if (storagePath) {
      await deleteFile(storagePath);
    }

    logger.info('Video deleted:', { id, storagePath });
    res.json({ message: 'Vidéo supprimée avec succès' });
  } catch (error) {
    logger.error('Error deleting video:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la vidéo' });
  }
};

export const getDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at as deployed_at,
              cd.created_at, cd.started_at,
              v.filename, v.original_name, v.metadata,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                WHEN cd.target_type = 'group' THEN g.name
              END as target_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       LEFT JOIN groups g ON cd.target_type = 'group' AND cd.target_id = g.id
       ORDER BY cd.created_at DESC`
    );

    // Ajouter video_title depuis metadata
    const deployments = result.rows.map(d => ({
      ...d,
      video_title: (d.metadata as { title?: string })?.title || d.original_name || d.filename
    }));

    res.json(deployments);
  } catch (error) {
    logger.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des déploiements' });
  }
};

export const getDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at as deployed_at,
              cd.created_at, cd.started_at,
              v.filename as video_name,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                WHEN cd.target_type = 'group' THEN g.name
              END as target_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
       LEFT JOIN groups g ON cd.target_type = 'group' AND cd.target_id = g.id
       WHERE cd.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du déploiement' });
  }
};

export const createDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { video_id, target_type, target_id } = req.body;

    const result = await pool.query(
      `INSERT INTO content_deployments (video_id, target_type, target_id, status, progress, deployed_by)
       VALUES ($1, $2, $3, 'pending', 0, $4)
       RETURNING *`,
      [video_id, target_type || 'site', target_id, req.user?.id || null]
    );

    const deployment = result.rows[0];
    logger.info('Deployment created:', { id: deployment.id, video_id, target_type, target_id });

    // Lancer le déploiement de manière asynchrone
    deploymentService.startDeployment(deployment.id as string).catch(err => {
      logger.error('Error starting deployment:', err);
    });

    res.status(201).json(deployment);
  } catch (error) {
    logger.error('Error creating deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la création du déploiement' });
  }
};

export const updateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, progress, error_message } = req.body;

    const result = await pool.query(
      `UPDATE content_deployments
       SET status = COALESCE($1, status),
           progress = COALESCE($2, progress),
           error_message = COALESCE($3, error_message),
           started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $4
       RETURNING *`,
      [status, progress, error_message, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    logger.info('Deployment updated:', { id, status, progress });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du déploiement' });
  }
};

export const deleteDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM content_deployments WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement non trouvé' });
    }

    logger.info('Deployment deleted:', { id });
    res.json({ message: 'Déploiement supprimé avec succès' });
  } catch (error) {
    logger.error('Error deleting deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du déploiement' });
  }
};
