import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';

const generateApiKey = (): string => {
  return randomBytes(32).toString('hex');
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

    // Check for existing sites with same name and generate unique name if needed
    let uniqueSiteName = site_name;
    const existingResult = await query(
      `SELECT site_name FROM sites WHERE site_name = $1 OR site_name ~ $2`,
      [site_name, `^${site_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`]
    );

    if (existingResult.rows.length > 0) {
      // Find the highest suffix number
      let maxSuffix = 0;
      for (const row of existingResult.rows) {
        if (row.site_name === site_name) {
          maxSuffix = Math.max(maxSuffix, 1);
        } else {
          const match = row.site_name.match(/-(\d+)$/);
          if (match) {
            maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10) + 1);
          }
        }
      }
      if (maxSuffix > 0) {
        uniqueSiteName = `${site_name}-${maxSuffix}`;
      }
    }

    const id = uuidv4();
    const api_key = generateApiKey();

    const result = await query(
      `INSERT INTO sites (id, site_name, club_name, location, sports, hardware_model, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_name, club_name, location, sports, hardware_model, status, created_at`,
      [
        id,
        uniqueSiteName,
        club_name,
        location ? JSON.stringify(location) : null,
        sports ? JSON.stringify(sports) : null,
        hardware_model || 'Raspberry Pi 4',
        api_key,
      ]
    );

    logger.info('Site created', { siteId: id, siteName: uniqueSiteName, createdBy: req.user?.email });

    // Return the plain API key only once at creation time
    res.status(201).json({ ...result.rows[0], api_key });
  } catch (error) {
    logger.error('Create site error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({ error: 'Erreur lors de la création du site', details: errorMessage });
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
      'UPDATE sites SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, site_name, club_name, status, updated_at',
      [newApiKey, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    logger.info('API key regenerated', { siteId: id, regeneratedBy: req.user?.email });

    // Return the new plain API key only once
    res.json({ ...result.rows[0], api_key: newApiKey });
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

export const sendCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { command, data } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Commande requise' });
    }

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name, status FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const site = siteResult.rows[0];

    // Importer le service socket
    const socketService = (await import('../services/socket.service')).default;

    // Vérifier que le site est connecté
    if (!socketService.isConnected(id)) {
      return res.status(503).json({
        error: 'Site non connecté',
        status: site.status
      });
    }

    // Créer un enregistrement de commande
    const commandId = uuidv4();
    await query(
      `INSERT INTO remote_commands (id, site_id, command_type, command_data, status, executed_by)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [commandId, id, command, data ? JSON.stringify(data) : null, req.user?.id]
    );

    // Envoyer la commande via socket
    const sent = socketService.sendCommand(id, {
      id: commandId,
      type: command,
      data: data || {},
    });

    if (!sent) {
      await query(
        `UPDATE remote_commands SET status = 'failed', error_message = 'Échec envoi' WHERE id = $1`,
        [commandId]
      );
      return res.status(503).json({ error: 'Échec de l\'envoi de la commande' });
    }

    // Mettre à jour le statut
    await query(
      `UPDATE remote_commands SET status = 'executing', executed_at = NOW() WHERE id = $1`,
      [commandId]
    );

    logger.info('Command sent to site', {
      siteId: id,
      siteName: site.site_name,
      command,
      commandId,
      sentBy: req.user?.email
    });

    res.json({
      success: true,
      commandId,
      message: 'Commande envoyée',
    });
  } catch (error) {
    logger.error('Send command error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la commande' });
  }
};

export const getCommandStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id, commandId } = req.params;

    const result = await query(
      `SELECT * FROM remote_commands WHERE id = $1 AND site_id = $2`,
      [commandId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get command status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut' });
  }
};
