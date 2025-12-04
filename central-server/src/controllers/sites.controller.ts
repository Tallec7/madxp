import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';

const generateApiKey = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const getSites = async (req: AuthRequest, res: Response) => {
  try {
    const { status, sport, region, search } = req.query;

    let sqlQuery = 'SELECT * FROM sites WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sqlQuery += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (sport) {
      sqlQuery += ` AND sports @> $${paramIndex}::jsonb`;
      params.push(JSON.stringify([sport]));
      paramIndex++;
    }

    if (region) {
      sqlQuery += ` AND location->>'region' = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (search) {
      sqlQuery += ` AND (site_name ILIKE $${paramIndex} OR club_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sqlQuery += ' ORDER BY created_at DESC';

    const result = await query(sqlQuery, params);

    res.json({
      total: result.rows.length,
      sites: result.rows,
    });
  } catch (error) {
    logger.error('Get sites error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sites' });
  }
};

export const getSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM sites WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du site' });
  }
};

export const createSite = async (req: AuthRequest, res: Response) => {
  try {
    const { site_name, club_name, location, sports, hardware_model } = req.body;

    const id = uuidv4();
    const api_key = generateApiKey();

    const result = await query(
      `INSERT INTO sites (id, site_name, club_name, location, sports, hardware_model, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        site_name,
        club_name,
        location ? JSON.stringify(location) : null,
        sports ? JSON.stringify(sports) : null,
        hardware_model || 'Raspberry Pi 4',
        api_key,
      ]
    );

    logger.info('Site created', { siteId: id, siteName: site_name, createdBy: req.user?.email });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create site error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du site' });
  }
};

export const updateSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { site_name, club_name, location, sports, status } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (site_name !== undefined) {
      updates.push(`site_name = $${paramIndex}`);
      params.push(site_name);
      paramIndex++;
    }

    if (club_name !== undefined) {
      updates.push(`club_name = $${paramIndex}`);
      params.push(club_name);
      paramIndex++;
    }

    if (location !== undefined) {
      updates.push(`location = $${paramIndex}`);
      params.push(JSON.stringify(location));
      paramIndex++;
    }

    if (sports !== undefined) {
      updates.push(`sports = $${paramIndex}`);
      params.push(JSON.stringify(sports));
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    params.push(id);
    const sqlQuery = `UPDATE sites SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(sqlQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('Site updated', { siteId: id, updatedBy: req.user?.email });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update site error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du site' });
  }
};

export const deleteSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM sites WHERE id = $1 RETURNING site_name', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('Site deleted', { siteId: id, siteName: result.rows[0].site_name, deletedBy: req.user?.email });

    res.json({ message: 'Site supprimé avec succès' });
  } catch (error) {
    logger.error('Delete site error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du site' });
  }
};

export const regenerateApiKey = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const newApiKey = generateApiKey();

    const result = await query(
      'UPDATE sites SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [newApiKey, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('API key regenerated', { siteId: id, regeneratedBy: req.user?.email });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Regenerate API key error:', error);
    res.status(500).json({ error: 'Erreur lors de la régénération de la clé API' });
  }
};

export const getSiteMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;

    const result = await query(
      `SELECT * FROM metrics
       WHERE site_id = $1
       AND recorded_at > NOW() - INTERVAL '${parseInt(hours as string)} hours'
       ORDER BY recorded_at DESC`,
      [id]
    );

    res.json({
      site_id: id,
      period_hours: hours,
      metrics: result.rows,
    });
  } catch (error) {
    logger.error('Get site metrics error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques' });
  }
};

export const getSiteStats = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_sites,
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance,
        COUNT(*) FILTER (WHERE status = 'error') as error
      FROM sites
    `);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site stats error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};
