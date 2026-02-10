import { Response } from 'express';
import crypto from 'crypto';
import * as ftp from 'basic-ftp';
import logger from '../config/logger';
import pool from '../config/database';
import { AuthRequest } from '../types';
import { uploadUpdate } from '../services/storage.service';
import { isFtpUpdateConfigured } from '../config/ftp-storage';
import { updateDeploymentService } from '../services/update-deployment.service';
import { uploadVerificationService, UploadStatus } from '../services/upload-verification.service';

type DatabaseError = Error & { code?: string; message?: string };

const isTableMissingError = (error: unknown, tableName: string): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const dbError = error as DatabaseError;
  return dbError.code === '42P01' && (!dbError.message || dbError.message.includes(tableName));
};

const updatesFeatureUnavailable = (tableName: string) => ({
  error: 'Module de mises à jour indisponible',
  message: `La table ${tableName} n'existe pas encore. Exécutez le script SQL (central-server/src/scripts/init-db.sql) pour l'initialiser.`,
});

export const getUpdates = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, version, description, is_critical,
              changelog as release_notes, package_url as file_url,
              package_size as file_size, checksum, created_at
       FROM software_updates
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    if (isTableMissingError(error, 'software_updates')) {
      logger.warn('software_updates table missing, returning empty updates list');
      return res.json([]);
    }
    logger.error('Error fetching updates:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des mises à jour' });
  }
};

export const getUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, version, description, is_critical,
              changelog as release_notes, package_url as file_url,
              package_size as file_size, checksum, created_at
       FROM software_updates
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mise à jour non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'software_updates')) {
      logger.warn('software_updates table missing while fetching single update');
      return res.status(503).json(updatesFeatureUnavailable('software_updates'));
    }
    logger.error('Error fetching update:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la mise à jour' });
  }
};

export const createUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { version, release_notes, description, is_critical } = req.body;

    if (!version || !req.file) {
      return res.status(400).json({ error: 'Version et package requis' });
    }

    const file = req.file;
    const filename = `update-${version}-${Date.now()}-${file.originalname}`;
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Upload via storage service (FTP)
    logger.info('Uploading update package via storage service', { filename });
    const uploadResult = await uploadUpdate(file.buffer, filename, file.mimetype);

    if (!uploadResult) {
      return res.status(500).json({
        error: "Impossible d'uploader le package. Vérifiez la configuration FTP (FTP_UPDATE_*)."
      });
    }

    const uploadVerified = uploadResult.verified;

    // Déterminer le statut d'upload
    const uploadStatus: UploadStatus = uploadVerified ? 'ready' : 'failed';

    logger.info('Update package uploaded:', {
      filename,
      url: uploadResult.url,
      verified: uploadVerified,
      uploadStatus,
    });

    const result = await pool.query(
      `INSERT INTO software_updates (version, description, is_critical, changelog, package_url, package_size, checksum, uploaded_by, upload_status, upload_verified_at, upload_verified_size)
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, version, description, is_critical, changelog as release_notes, package_url as file_url, package_size as file_size, checksum, upload_status, created_at`,
      [
        version,
        description,
        typeof is_critical === 'string' ? is_critical === 'true' : Boolean(is_critical),
        release_notes,
        uploadResult.url,
        file.size,
        checksum,
        req.user?.id || null,
        uploadStatus,
        uploadVerified ? new Date() : null,
        uploadResult.actualSize || null,
      ]
    );

    if (!uploadVerified) {
      logger.warn('Update uploaded but verification failed:', {
        id: result.rows[0].id,
        version,
        expectedSize: file.size,
        actualSize: uploadResult.actualSize,
      });
    }

    logger.info('Update created:', { id: result.rows[0].id, version, uploadStatus });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'software_updates')) {
      logger.warn('software_updates table missing while creating update');
      return res.status(503).json(updatesFeatureUnavailable('software_updates'));
    }

    // Check for unique constraint violation on version
    const dbError = error as DatabaseError;
    if (dbError.code === '23505') {
      logger.warn('Duplicate version attempted:', { version: req.body.version });
      return res.status(409).json({ error: `La version "${req.body.version}" existe déjà` });
    }

    logger.error('Error creating update:', error);
    const errorMessage = dbError.message || 'Erreur inconnue';
    res.status(500).json({ error: `Erreur lors de la création de la mise à jour: ${errorMessage}` });
  }
};

export const updateUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version, changelog, description, is_critical, package_url, package_size, checksum } = req.body;

    const result = await pool.query(
      `UPDATE software_updates
       SET version = COALESCE($1, version),
           description = COALESCE($2, description),
           is_critical = COALESCE($3, is_critical),
           changelog = COALESCE($4, changelog),
           package_url = COALESCE($5, package_url),
           package_size = COALESCE($6, package_size),
           checksum = COALESCE($7, checksum)
       WHERE id = $8
       RETURNING *`,
      [version, description, is_critical, changelog, package_url, package_size, checksum, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mise à jour non trouvée' });
    }

    logger.info('Update updated:', { id, version });
    res.json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'software_updates')) {
      logger.warn('software_updates table missing while updating update');
      return res.status(503).json(updatesFeatureUnavailable('software_updates'));
    }
    logger.error('Error updating update:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
};

export const deleteUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM software_updates WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mise à jour non trouvée' });
    }

    logger.info('Update deleted:', { id });
    res.json({ message: 'Mise à jour supprimée avec succès' });
  } catch (error) {
    if (isTableMissingError(error, 'software_updates')) {
      logger.warn('software_updates table missing while deleting update');
      return res.status(503).json(updatesFeatureUnavailable('software_updates'));
    }
    logger.error('Error deleting update:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la mise à jour' });
  }
};

export const getUpdateDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       ORDER BY ud.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    if (isTableMissingError(error, 'update_deployments')) {
      logger.warn('update_deployments table missing, returning empty deployment list');
      return res.json([]);
    }
    logger.error('Error fetching update deployments:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des déploiements de mises à jour' });
  }
};

export const getUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                ELSE 'Groupe'
              END as target_name
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       WHERE ud.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement de mise à jour non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'update_deployments')) {
      logger.warn('update_deployments table missing while fetching single deployment');
      return res.status(503).json(updatesFeatureUnavailable('update_deployments'));
    }
    logger.error('Error fetching update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du déploiement de mise à jour' });
  }
};

export const createUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { update_id, target_type, target_id } = req.body;

    // === GATE: Vérifier que la mise à jour est prête pour le déploiement ===
    const updateReadiness = await uploadVerificationService.isUpdateReadyForDeployment(update_id);

    if (!updateReadiness.ready) {
      const errorMessage = uploadVerificationService.getDeploymentBlockedMessage(updateReadiness.status);
      logger.warn('Update deployment blocked: update not ready', {
        update_id,
        upload_status: updateReadiness.status,
        error: updateReadiness.error,
      });

      return res.status(409).json({
        error: 'Update not ready for deployment',
        upload_status: updateReadiness.status,
        message: errorMessage,
        details: updateReadiness.error,
        retry_after_seconds: updateReadiness.status === 'uploading' ? 30 : 10,
      });
    }

    const result = await pool.query(
      `INSERT INTO update_deployments (update_id, target_type, target_id, status, progress, deployed_by)
       VALUES ($1, $2, $3, 'pending', 0, $4)
       RETURNING *`,
      [update_id, target_type || 'site', target_id, req.user?.id || null]
    );

    const deploymentId = result.rows[0].id as string;
    logger.info('Update deployment created:', { id: deploymentId, update_id, target_type, target_id });

    // Démarrer le déploiement automatiquement (async, ne bloque pas la réponse)
    updateDeploymentService.startDeployment(deploymentId).catch((error) => {
      logger.error('Error starting update deployment:', { deploymentId, error });
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'update_deployments')) {
      logger.warn('update_deployments table missing while creating deployment');
      return res.status(503).json(updatesFeatureUnavailable('update_deployments'));
    }
    logger.error('Error creating update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la création du déploiement de mise à jour' });
  }
};

export const updateUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, progress, error_message, backup_path } = req.body;

    const result = await pool.query(
      `UPDATE update_deployments
       SET status = COALESCE($1, status),
           progress = COALESCE($2, progress),
           error_message = COALESCE($3, error_message),
           backup_path = COALESCE($4, backup_path),
           started_at = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
           completed_at = CASE WHEN $1 IN ('completed', 'failed', 'rolled_back') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $5
       RETURNING *`,
      [status, progress, error_message, backup_path, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement de mise à jour non trouvé' });
    }

    logger.info('Update deployment updated:', { id, status, progress });
    res.json(result.rows[0]);
  } catch (error) {
    if (isTableMissingError(error, 'update_deployments')) {
      logger.warn('update_deployments table missing while updating deployment');
      return res.status(503).json(updatesFeatureUnavailable('update_deployments'));
    }
    logger.error('Error updating update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du déploiement de mise à jour' });
  }
};

export const deleteUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM update_deployments WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement de mise à jour non trouvé' });
    }

    logger.info('Update deployment deleted:', { id });
    res.json({ message: 'Déploiement de mise à jour supprimé avec succès' });
  } catch (error) {
    if (isTableMissingError(error, 'update_deployments')) {
      logger.warn('update_deployments table missing while deleting deployment');
      return res.status(503).json(updatesFeatureUnavailable('update_deployments'));
    }
    logger.error('Error deleting update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du déploiement de mise à jour' });
  }
};

/**
 * Endpoint de diagnostic pour vérifier l'URL d'un package de mise à jour
 * Vérifie si le fichier est accessible (FTP)
 */
export const checkUpdatePackageUrl = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, version, package_url, package_size, checksum
       FROM software_updates
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mise à jour non trouvée' });
    }

    const update = result.rows[0];
    const packageUrl = update.package_url as string | null;

    if (!packageUrl) {
      return res.json({
        status: 'no_url',
        update: { id: update.id, version: update.version },
        message: 'Aucune URL de package définie pour cette mise à jour',
      });
    }

    // Déterminer le type de stockage
    let storageType = 'unknown';
    if (packageUrl.includes('supabase')) {
      storageType = 'supabase';
    } else if (packageUrl.includes(process.env.FTP_UPDATE_PUBLIC_URL || 'neopro-update')) {
      storageType = 'ftp';
    } else if (packageUrl.startsWith('http')) {
      storageType = 'external';
    }

    // Tester l'accessibilité de l'URL
    let isAccessible = false;
    let accessError: string | null = null;

    try {
      const response = await fetch(packageUrl, { method: 'HEAD' });
      isAccessible = response.ok;
      if (!isAccessible) {
        accessError = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      accessError = error instanceof Error ? error.message : 'Erreur de connexion';
    }

    logger.info('Package URL check:', {
      updateId: id,
      version: update.version,
      packageUrl,
      storageType,
      isAccessible,
      accessError,
    });

    res.json({
      status: isAccessible ? 'accessible' : 'inaccessible',
      update: {
        id: update.id,
        version: update.version,
        packageUrl,
        packageSize: update.package_size,
        checksum: update.checksum,
      },
      storageType,
      isAccessible,
      accessError,
      message: isAccessible
        ? `Le fichier est accessible (${storageType})`
        : `Le fichier n'est pas accessible: ${accessError}`,
    });
  } catch (error) {
    logger.error('Error checking update package URL:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification de l\'URL du package' });
  }
};

/**
 * Endpoint de diagnostic FTP pour les mises à jour
 * Teste la connexion et liste les fichiers présents
 */
export const testFtpUpdateConnection = async (_req: AuthRequest, res: Response) => {
  const ftpUpdateConfig = {
    host: process.env.FTP_UPDATE_HOST || '',
    port: parseInt(process.env.FTP_UPDATE_PORT || '21', 10),
    user: process.env.FTP_UPDATE_USER || '',
    password: process.env.FTP_UPDATE_PASSWORD || '',
    secure: process.env.FTP_UPDATE_SECURE === 'true',
    publicUrl: process.env.FTP_UPDATE_PUBLIC_URL || '',
  };

  // Vérifier la configuration
  const configStatus = {
    host: !!ftpUpdateConfig.host,
    user: !!ftpUpdateConfig.user,
    password: !!ftpUpdateConfig.password,
    publicUrl: !!ftpUpdateConfig.publicUrl,
    isConfigured: isFtpUpdateConfigured(),
  };

  if (!configStatus.isConfigured) {
    return res.json({
      status: 'not_configured',
      configStatus,
      message: 'FTP Update non configuré. Variables manquantes: ' +
        Object.entries(configStatus)
          .filter(([key, value]) => key !== 'isConfigured' && !value)
          .map(([key]) => `FTP_UPDATE_${key.toUpperCase()}`)
          .join(', '),
    });
  }

  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    logger.info('Testing FTP Update connection:', {
      host: ftpUpdateConfig.host,
      port: ftpUpdateConfig.port,
      user: ftpUpdateConfig.user,
    });

    await client.access({
      host: ftpUpdateConfig.host,
      port: ftpUpdateConfig.port,
      user: ftpUpdateConfig.user,
      password: ftpUpdateConfig.password,
      secure: ftpUpdateConfig.secure,
    });

    // Lister les fichiers
    const files = await client.list();
    const pwd = await client.pwd();

    logger.info('FTP Update connection successful:', {
      currentDirectory: pwd,
      filesCount: files.length,
    });

    res.json({
      status: 'connected',
      configStatus,
      connection: {
        host: ftpUpdateConfig.host,
        port: ftpUpdateConfig.port,
        user: ftpUpdateConfig.user,
        publicUrl: ftpUpdateConfig.publicUrl,
        currentDirectory: pwd,
      },
      files: files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        modifiedAt: f.modifiedAt,
      })),
      message: `Connexion FTP réussie. ${files.length} fichier(s) trouvé(s) dans ${pwd}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    logger.error('FTP Update connection test failed:', error);

    res.json({
      status: 'error',
      configStatus,
      error: errorMessage,
      message: `Échec de la connexion FTP: ${errorMessage}`,
    });
  } finally {
    client.close();
  }
};
