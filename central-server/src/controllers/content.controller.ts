import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import logger from '../config/logger';
import pool from '../config/database';
import { AuthRequest } from '../types';
import deploymentService from '../services/deployment.service';
import { uploadFile, uploadFileFromDisk, deleteFile, getPublicUrl } from '../config/supabase';
import { uploadFileToFtp, uploadFileToFtpFromDiskWithVerification, deleteFileFromFtp, isFtpConfigured, getFtpPublicUrl, uploadFileToFtpWithVerification } from '../config/ftp-storage';
import { formatPaginatedResponse } from '../middleware/pagination';
import { uploadVerificationService, UploadStatus } from '../services/upload-verification.service';
import { imageToVideoService } from '../services/image-to-video.service';
import { cleanupTempFile } from '../middleware/upload';

/**
 * Génère l'URL publique accessible pour une vidéo en fonction de son backend de stockage
 * @param storagePath - Le chemin stocké en DB (filename.mp4 pour FTP, uploads/filename.mp4 pour Supabase)
 * @returns L'URL complète accessible depuis un navigateur
 */
function getVideoDownloadUrl(storagePath: string): string {
  // Si le path est juste un filename (pas de /) → c'est un fichier FTP
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
  }

  // Sinon c'est un chemin Supabase (ex: uploads/filename.mp4)
  return getPublicUrl(storagePath);
}

/**
 * Upload une vidéo vers le stockage (FTP Hostinger en priorité, sinon Supabase)
 * Avec vérification post-upload pour éviter les race conditions.
 * Supporte les deux modes : buffer (legacy, images) et disk path (streaming, vidéos).
 */
async function uploadVideoToStorage(
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string; verified: boolean; actualSize: number | null } | null> {
  // Utiliser FTP Hostinger si configuré - avec vérification
  if (isFtpConfigured()) {
    logger.info('Using FTP storage (Hostinger) with verification');
    const result = await uploadFileToFtpWithVerification(fileBuffer, filename, contentType);
    if (result) {
      return {
        path: result.path,
        url: result.url,
        verified: result.verified,
        actualSize: result.actualSize,
      };
    }
    return null;
  }

  // Fallback vers Supabase (vérification HTTP après upload)
  logger.info('Using Supabase storage (FTP not configured)');
  const result = await uploadFile(fileBuffer, filename, contentType);
  if (result) {
    return {
      path: result.path,
      url: result.url,
      verified: true,
      actualSize: fileBuffer.length,
    };
  }
  return null;
}

/**
 * Upload une vidéo vers le stockage en streaming depuis le disque.
 * Le fichier n'est jamais chargé entièrement en mémoire.
 */
async function uploadVideoToStorageFromDisk(
  filePath: string,
  fileSize: number,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string; verified: boolean; actualSize: number | null } | null> {
  // Utiliser FTP Hostinger si configuré - streaming avec vérification
  if (isFtpConfigured()) {
    logger.info('Using FTP storage (Hostinger) with streaming + verification');
    const result = await uploadFileToFtpFromDiskWithVerification(filePath, fileSize, filename, contentType);
    if (result) {
      return {
        path: result.path,
        url: result.url,
        verified: result.verified,
        actualSize: result.actualSize,
      };
    }
    return null;
  }

  // Fallback vers Supabase (lecture du fichier juste avant l'upload)
  logger.info('Using Supabase storage from disk (FTP not configured)');
  const result = await uploadFileFromDisk(filePath, filename, contentType);
  if (result) {
    return {
      path: result.path,
      url: result.url,
      verified: true,
      actualSize: fileSize,
    };
  }
  return null;
}

/**
 * Supprime une vidéo du stockage
 */
async function deleteVideoFromStorage(storagePath: string): Promise<boolean> {
  // Si le path est juste un filename (FTP) vs un chemin complet (Supabase)
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return deleteFileFromFtp(storagePath);
  }

  return deleteFile(storagePath);
}

/**
 * Calcule le checksum SHA256 d'un buffer
 */
function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calcule le checksum SHA256 d'un fichier en streaming (sans le charger en mémoire)
 */
function calculateChecksumFromFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Sanitize un nom de fichier pour le stockage
 * - Remplace les espaces par des underscores
 * - Supprime les caractères spéciaux dangereux
 * - Conserve uniquement lettres, chiffres, tirets, underscores et points
 */
function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  // Sanitize: remplacer espaces par _, supprimer caractères spéciaux
  const sanitized = name
    .replace(/\s+/g, '_')           // Espaces → underscores
    .replace(/[àáâãäå]/gi, 'a')     // Accents a
    .replace(/[èéêë]/gi, 'e')       // Accents e
    .replace(/[ìíîï]/gi, 'i')       // Accents i
    .replace(/[òóôõö]/gi, 'o')      // Accents o
    .replace(/[ùúûü]/gi, 'u')       // Accents u
    .replace(/[ç]/gi, 'c')          // Cédille
    .replace(/[ñ]/gi, 'n')          // Tilde
    .replace(/[^a-zA-Z0-9_-]/g, '') // Supprimer tout caractère non autorisé
    .substring(0, 100);              // Limiter la longueur

  return sanitized + ext.toLowerCase();
}

/**
 * Génère un nom de fichier unique basé sur le nom original
 * Si le fichier existe déjà, ajoute un suffixe numérique (ex: video_1.mp4, video_2.mp4)
 */
async function generateUniqueFilename(originalName: string): Promise<string> {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized);
  const baseName = path.basename(sanitized, ext);

  // Vérifier si le nom existe déjà en base
  let filename = sanitized;
  let counter = 0;

  while (true) {
    const existing = await pool.query(
      'SELECT id FROM videos WHERE filename = $1',
      [filename]
    );

    if (existing.rows.length === 0) {
      // Nom disponible
      return filename;
    }

    // Nom pris, incrémenter le compteur
    counter++;
    filename = `${baseName}_${counter}${ext}`;

    // Sécurité: éviter boucle infinie
    if (counter > 1000) {
      // Fallback vers UUID si trop de collisions
      logger.warn('Too many filename collisions, falling back to UUID', { originalName });
      return `${baseName}_${uuidv4().substring(0, 8)}${ext}`;
    }
  }
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

    // Ajouter le titre et transformer l'URL en URL publique accessible
    const videos = dataResult.rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
      url: video.url ? getVideoDownloadUrl(video.url as string) : null
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
    video.url = video.url ? getVideoDownloadUrl(video.url as string) : null;

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
    // Note: On évite la jointure sur "groups" car la table peut ne pas exister en production
    const result = await pool.query(
      `SELECT cd.id, cd.video_id, cd.target_type, cd.target_id, cd.status, cd.progress,
              cd.error_message as error, cd.completed_at, cd.created_at, cd.started_at,
              CASE
                WHEN cd.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name,
              CASE
                WHEN cd.target_type = 'site' THEN s.club_name
                ELSE NULL
              END as club_name,
              COALESCE(u.full_name, 'Système') as deployed_by_name
       FROM content_deployments cd
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
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
  const file = req.file;
  // Disk storage : le fichier est sur disque, pas en mémoire
  const tempFilePath = file?.path;

  try {
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { title, category, subcategory, site_id } = req.body;

    // Valider site_id si fourni (upload contextuel)
    if (site_id) {
      const siteResult = await pool.query('SELECT id FROM sites WHERE id = $1', [site_id]);
      if (siteResult.rows.length === 0) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Générer un nom de fichier unique basé sur le nom original
    const filename = await generateUniqueFilename(file.originalname);

    // Calculer le checksum SHA256 en streaming depuis le disque (pas de chargement en mémoire)
    const checksum = tempFilePath
      ? await calculateChecksumFromFile(tempFilePath)
      : calculateChecksum(file.buffer);

    // Upload vers le stockage en streaming depuis le disque
    logger.info('Uploading video to storage with verification:', { filename, size: file.size, mimetype: file.mimetype, siteId: site_id });

    const uploadResult = tempFilePath
      ? await uploadVideoToStorageFromDisk(tempFilePath, file.size, filename, file.mimetype)
      : await uploadVideoToStorage(file.buffer, filename, file.mimetype);

    if (!uploadResult) {
      logger.error('Failed to upload video to storage - uploadResult is null');
      return res.status(500).json({
        error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration FTP ou Supabase.'
      });
    }

    // Déterminer le statut d'upload basé sur la vérification
    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';

    // Utiliser le titre fourni ou le nom original du fichier
    const videoTitle = title || file.originalname;
    const original_name = file.originalname;
    const file_size = file.size;
    const mime_type = file.mimetype;

    logger.info('Inserting video metadata into database:', { filename, title: videoTitle, siteId: site_id, uploadStatus, verified: uploadResult.verified });
    const result = await pool.query(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by, uploaded_for_site_id, upload_status, upload_verified_at, upload_verified_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, filename as name, original_name, category, subcategory, file_size as size, duration, storage_path as url, thumbnail_url, checksum, metadata, uploaded_for_site_id, upload_status, created_at, updated_at`,
      [
        filename, original_name, category || null, subcategory || null,
        file_size, mime_type, uploadResult.path, checksum, { title: videoTitle },
        req.user?.id || null, site_id || null,
        uploadStatus,
        uploadResult.verified ? new Date() : null,
        uploadResult.actualSize
      ]
    );

    // Ajouter le titre et l'URL à la réponse pour l'affichage client
    const video = result.rows[0];
    video.title = videoTitle;
    video.url = uploadResult.url;

    // Logger avec info de vérification
    if (!uploadResult.verified) {
      logger.warn('Video uploaded but verification failed:', {
        id: video.id,
        filename,
        expectedSize: file_size,
        actualSize: uploadResult.actualSize,
      });
    }

    logger.info('Video created successfully:', {
      id: video.id,
      filename,
      title: videoTitle,
      storagePath: uploadResult.path,
      checksum,
      siteId: site_id,
      uploadStatus,
      verified: uploadResult.verified,
    });
    res.status(201).json(video);
  } catch (error) {
    logger.error('Error creating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la création de la vidéo',
      details: errorMessage
    });
  } finally {
    // Nettoyer le fichier temporaire dans tous les cas
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
};

export const createVideos = async (req: AuthRequest, res: Response) => {
  const files = req.files as Express.Multer.File[];

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier vidéo fourni' });
    }

    const { category, subcategory, site_id } = req.body;

    // Valider site_id si fourni (upload contextuel)
    if (site_id) {
      const siteResult = await pool.query('SELECT id FROM sites WHERE id = $1', [site_id]);
      if (siteResult.rows.length === 0) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    const results: Array<{ id: string; name: string; title: string; size: number; success: true }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    logger.info('Starting bulk video upload:', { count: files.length, category, subcategory, siteId: site_id });

    for (const file of files) {
      const tempFilePath = file.path;

      try {
        // Générer un nom de fichier unique basé sur le nom original
        const filename = await generateUniqueFilename(file.originalname);

        // Upload vers le stockage en streaming depuis le disque
        logger.info('Uploading video to storage (bulk):', { filename, size: file.size });

        const uploadResult = tempFilePath
          ? await uploadVideoToStorageFromDisk(tempFilePath, file.size, filename, file.mimetype)
          : await uploadVideoToStorage(file.buffer, filename, file.mimetype);

        if (!uploadResult) {
          errors.push({
            name: file.originalname,
            error: 'Erreur lors de l\'upload vers le stockage. Vérifiez la configuration FTP ou Supabase.'
          });
          continue;
        }

        // Utiliser le nom original comme titre
        const videoTitle = file.originalname;
        const original_name = file.originalname;
        const file_size = file.size;
        const mime_type = file.mimetype;

        // Calculer le checksum SHA256 en streaming depuis le disque
        const checksum = tempFilePath
          ? await calculateChecksumFromFile(tempFilePath)
          : calculateChecksum(file.buffer);

        const result = await pool.query(
          `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, storage_path, checksum, metadata, uploaded_by, uploaded_for_site_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, filename as name, original_name, file_size as size, checksum`,
          [filename, original_name, category || null, subcategory || null, file_size, mime_type, uploadResult.path, checksum, { title: videoTitle }, req.user?.id || null, site_id || null]
        );

        const video = result.rows[0] as { id: string; name: string; original_name: string; size: number };
        results.push({
          id: video.id,
          name: video.name,
          title: videoTitle,
          size: video.size,
          success: true
        });

        logger.info('Video created (bulk):', { id: video.id, filename, title: videoTitle, siteId: site_id });
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Erreur inconnue';
        errors.push({ name: file.originalname, error: errorMessage });
        logger.error('Error creating video in bulk:', { filename: file.originalname, error: fileError });
      } finally {
        // Nettoyer chaque fichier temporaire après traitement
        if (tempFilePath) {
          cleanupTempFile(tempFilePath);
        }
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

    // Supprimer du stockage (FTP ou Supabase)
    if (storagePath) {
      await deleteVideoFromStorage(storagePath);
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
                ELSE 'Groupe'
              END as target_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
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
                ELSE 'Groupe'
              END as target_name
       FROM content_deployments cd
       LEFT JOIN videos v ON cd.video_id = v.id
       LEFT JOIN sites s ON cd.target_type = 'site' AND cd.target_id = s.id
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
    const { video_id, target_type, target_id, scheduled_at } = req.body;

    // === GATE: Vérifier que la vidéo est prête pour le déploiement ===
    const videoReadiness = await uploadVerificationService.isVideoReadyForDeployment(video_id);

    if (!videoReadiness.ready) {
      const errorMessage = uploadVerificationService.getDeploymentBlockedMessage(videoReadiness.status);
      logger.warn('Deployment blocked: video not ready', {
        video_id,
        upload_status: videoReadiness.status,
        error: videoReadiness.error,
      });

      return res.status(409).json({
        error: 'Video not ready for deployment',
        upload_status: videoReadiness.status,
        message: errorMessage,
        details: videoReadiness.error,
        retry_after_seconds: videoReadiness.status === 'uploading' ? 30 : 10,
      });
    }

    // Si scheduled_at est fourni, le deploiement sera planifie
    const isScheduled = !!scheduled_at;
    const status = isScheduled ? 'scheduled' : 'pending';
    const scheduledDate = isScheduled ? new Date(scheduled_at) : null;

    // Valider la date de planification
    if (isScheduled && scheduledDate) {
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'Date de planification invalide' });
      }
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'La date de planification doit etre dans le futur' });
      }
    }

    const result = await pool.query(
      `INSERT INTO content_deployments (video_id, target_type, target_id, status, progress, deployed_by, scheduled_at, scheduled_by)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
       RETURNING *`,
      [
        video_id,
        target_type || 'site',
        target_id,
        status,
        req.user?.id || null,
        scheduledDate,
        isScheduled ? req.user?.id : null
      ]
    );

    const deployment = result.rows[0];

    if (isScheduled) {
      logger.info('Scheduled deployment created:', {
        id: deployment.id,
        video_id,
        target_type,
        target_id,
        scheduled_at: scheduledDate
      });
    } else {
      logger.info('Deployment created:', { id: deployment.id, video_id, target_type, target_id });

      // Lancer le deploiement de maniere asynchrone (seulement si non planifie)
      deploymentService.startDeployment(deployment.id as string).catch(err => {
        logger.error('Error starting deployment:', err);
      });
    }

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

/**
 * GET /api/content/videos/for-site/:siteId
 * Récupère les vidéos avec priorisation pour un site spécifique.
 * Les vidéos uploadées pour ce site apparaissent en premier.
 */
export const getVideosForSite = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { category, search } = req.query;
    const pagination = req.pagination || { page: 1, limit: 50, offset: 0 };

    // Vérifier que le site existe
    const siteResult = await pool.query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    let whereClause = 'WHERE 1=1';
    const params: any[] = [siteId];  // $1 = siteId pour le tri
    let paramIndex = 2;

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

    // Query avec tri par uploaded_for_site_id (vidéos du site en premier)
    const dataQuery = `
      SELECT id, filename, original_name, category, subcategory,
             file_size, duration, storage_path as url,
             thumbnail_url, metadata, uploaded_for_site_id,
             created_at, updated_at,
             CASE WHEN uploaded_for_site_id = $1 THEN 1 ELSE 0 END as is_for_site
      FROM videos
      ${whereClause}
      ORDER BY is_for_site DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `SELECT COUNT(*) as count FROM videos ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, pagination.limit, pagination.offset]),
      pool.query(countQuery, params.slice(1)),  // Sans siteId pour le count
    ]);

    // Ajouter le titre et transformer l'URL en URL publique accessible
    const videos = dataResult.rows.map(video => ({
      ...video,
      title: (video.metadata as { title?: string })?.title || video.original_name || video.filename,
      url: video.url ? getVideoDownloadUrl(video.url as string) : null,
      isForCurrentSite: video.is_for_site === 1,
    }));

    const total = parseInt((countResult.rows[0] as any)?.count || '0', 10);

    res.json(formatPaginatedResponse(videos, total, pagination));
  } catch (error) {
    logger.error('Error fetching videos for site:', { siteId: req.params.siteId, error });
    res.status(500).json({ error: 'Erreur lors de la récupération des vidéos' });
  }
};

/**
 * POST /api/image-to-video
 * Convertit une image en vidéo MP4 avec une durée spécifiée
 */
export const convertImageToVideo = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Aucune image fournie' });
    }

    // Récupérer les paramètres
    const duration = parseInt(req.body.duration as string, 10) || 10;
    const { site_id } = req.body;
    const blurBackground = req.body.blurBackground === 'true' || req.body.blurBackground === true;

    // Valider la durée (entre 1 et 60 secondes)
    if (duration < 1 || duration > 60) {
      return res.status(400).json({ error: 'La durée doit être entre 1 et 60 secondes' });
    }

    // Valider site_id si fourni
    if (site_id) {
      const siteResult = await pool.query('SELECT id FROM sites WHERE id = $1', [site_id]);
      if (siteResult.rows.length === 0) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Vérifier si ffmpeg est disponible
    const ffmpegAvailable = await imageToVideoService.isAvailable();
    if (!ffmpegAvailable) {
      logger.error('ffmpeg is not available on this system');
      return res.status(503).json({
        error: 'Le service de conversion n\'est pas disponible. ffmpeg n\'est pas installé sur le serveur.'
      });
    }

    logger.info('Starting image to video conversion', {
      originalFilename: file.originalname,
      duration,
      imageSize: file.size,
      siteId: site_id,
      blurBackground,
    });

    // Convertir l'image en vidéo
    const result = await imageToVideoService.convert(file.buffer, file.originalname, {
      duration,
      blurBackground,
    });

    // Générer un nom de fichier unique
    const filename = await generateUniqueFilename(result.filename);

    // Calculer le checksum
    const checksum = calculateChecksum(result.buffer);

    // Upload vers le stockage
    const uploadResult = await uploadVideoToStorage(result.buffer, filename, result.mimetype);

    if (!uploadResult) {
      logger.error('Failed to upload converted video to storage');
      return res.status(500).json({
        error: 'Erreur lors de l\'upload de la vidéo convertie'
      });
    }

    // Déterminer le statut d'upload
    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';

    // Utiliser le nom original de l'image comme titre
    const imageBaseName = path.basename(file.originalname, path.extname(file.originalname));
    const videoTitle = imageBaseName;

    // Insérer en base de données
    const dbResult = await pool.query(
      `INSERT INTO videos (filename, original_name, category, subcategory, file_size, mime_type, duration, storage_path, checksum, metadata, uploaded_by, uploaded_for_site_id, upload_status, upload_verified_at, upload_verified_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, filename as name, original_name, category, subcategory, file_size as size, duration, storage_path as url, thumbnail_url, checksum, metadata, uploaded_for_site_id, upload_status, created_at, updated_at`,
      [
        filename,
        result.filename,  // original_name = nom généré depuis l'image
        null,  // category
        null,  // subcategory
        result.size,
        result.mimetype,
        duration,  // durée de la vidéo
        uploadResult.path,
        checksum,
        { title: videoTitle, convertedFromImage: true, originalImage: file.originalname },
        req.user?.id || null,
        site_id || null,
        uploadStatus,
        uploadResult.verified ? new Date() : null,
        uploadResult.actualSize
      ]
    );

    const video = dbResult.rows[0];
    video.title = videoTitle;
    video.url = uploadResult.url;

    logger.info('Image converted to video successfully', {
      id: video.id,
      filename,
      title: videoTitle,
      originalImage: file.originalname,
      duration,
      videoSize: result.size,
      siteId: site_id,
    });

    res.status(201).json({
      success: true,
      message: `Image convertie en vidéo de ${duration} secondes`,
      video,
    });
  } catch (error) {
    logger.error('Error converting image to video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors de la conversion de l\'image en vidéo',
      details: errorMessage
    });
  }
};
