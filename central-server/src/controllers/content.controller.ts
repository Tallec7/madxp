import { Response } from 'express';
import logger from '../config/logger';
import pool from '../config/database';
import { AuthRequest } from '../types';
import deploymentService from '../services/deployment.service';

export const getVideos = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, original_name, category, subcategory,
              file_size, duration, storage_path as url,
              thumbnail_url, metadata, created_at, updated_at
       FROM videos
       ORDER BY created_at DESC`
    );

    // Ajouter le titre depuis les metadata ou utiliser original_name
    const videos = result.rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename
    }));

    res.json(videos);
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

export const createVideo = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { title, category, subcategory } = req.body;

    // Utiliser le titre fourni ou le nom original du fichier
    const videoTitle = title || file.originalname;
    const filename = file.filename;
    const original_name = file.originalname;
    const file_size = file.size;
    const storage_path = `/uploads/videos/${file.filename}`;
    const mime_type = file.mimetype;

    const result = await pool.query(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, filename as name, original_name, category, subcategory, file_size as size, duration, storage_path as url, thumbnail_url, metadata, created_at, updated_at`,
      [filename, original_name, category || null, subcategory || null, file_size, mime_type, storage_path, { title: videoTitle }, req.user?.id || null]
    );

    // Ajouter le titre à la réponse pour l'affichage client
    const video = result.rows[0];
    video.title = videoTitle;

    logger.info('Video created:', { id: video.id, filename, title: videoTitle });
    res.status(201).json(video);
  } catch (error) {
    logger.error('Error creating video:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la vidéo' });
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

    const result = await pool.query(
      `DELETE FROM videos WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vidéo non trouvée' });
    }

    logger.info('Video deleted:', { id });
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
