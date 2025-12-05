import { Response } from 'express';
import logger from '../config/logger';
import pool from '../config/database';
import { AuthRequest } from '../types';

export const getUpdates = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, version, changelog as release_notes, package_url as file_url,
              package_size as file_size, checksum, created_at
       FROM software_updates
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching updates:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des mises à jour' });
  }
};

export const getUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, version, changelog as release_notes, package_url as file_url,
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
    logger.error('Error fetching update:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la mise à jour' });
  }
};

export const createUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { version, changelog, package_url, package_size, checksum } = req.body;

    const result = await pool.query(
      `INSERT INTO software_updates (version, changelog, package_url, package_size, checksum, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [version, changelog, package_url, package_size, checksum, req.user?.id || null]
    );

    logger.info('Update created:', { id: result.rows[0].id, version });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating update:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la mise à jour' });
  }
};

export const updateUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version, changelog, package_url, package_size, checksum } = req.body;

    const result = await pool.query(
      `UPDATE software_updates
       SET version = COALESCE($1, version),
           changelog = COALESCE($2, changelog),
           package_url = COALESCE($3, package_url),
           package_size = COALESCE($4, package_size),
           checksum = COALESCE($5, checksum)
       WHERE id = $6
       RETURNING *`,
      [version, changelog, package_url, package_size, checksum, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mise à jour non trouvée' });
    }

    logger.info('Update updated:', { id, version });
    res.json(result.rows[0]);
  } catch (error) {
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
    logger.error('Error deleting update:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la mise à jour' });
  }
};

export const getUpdateDeployments = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message as error, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                WHEN ud.target_type = 'group' THEN g.name
              END as target_name
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       LEFT JOIN groups g ON ud.target_type = 'group' AND ud.target_id = g.id
       ORDER BY ud.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching update deployments:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des déploiements de mises à jour' });
  }
};

export const getUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ud.id, ud.update_id, ud.target_type, ud.target_id, ud.status, ud.progress,
              ud.error_message as error, ud.started_at, ud.completed_at, ud.created_at,
              ud.backup_path,
              su.version as update_version,
              CASE
                WHEN ud.target_type = 'site' THEN s.site_name
                WHEN ud.target_type = 'group' THEN g.name
              END as target_name
       FROM update_deployments ud
       LEFT JOIN software_updates su ON ud.update_id = su.id
       LEFT JOIN sites s ON ud.target_type = 'site' AND ud.target_id = s.id
       LEFT JOIN groups g ON ud.target_type = 'group' AND ud.target_id = g.id
       WHERE ud.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Déploiement de mise à jour non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du déploiement de mise à jour' });
  }
};

export const createUpdateDeployment = async (req: AuthRequest, res: Response) => {
  try {
    const { update_id, target_type, target_id } = req.body;

    const result = await pool.query(
      `INSERT INTO update_deployments (update_id, target_type, target_id, status, progress, deployed_by)
       VALUES ($1, $2, $3, 'pending', 0, $4)
       RETURNING *`,
      [update_id, target_type || 'site', target_id, req.user?.id || null]
    );

    logger.info('Update deployment created:', { id: result.rows[0].id, update_id, target_type, target_id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
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
    logger.error('Error deleting update deployment:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du déploiement de mise à jour' });
  }
};
