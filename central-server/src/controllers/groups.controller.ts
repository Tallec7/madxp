import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';

export const getGroups = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(`
      SELECT g.*,
        (SELECT COUNT(*) FROM site_groups WHERE group_id = g.id) as site_count
      FROM groups g
      ORDER BY created_at DESC
    `);

    res.json({
      total: result.rows.length,
      groups: result.rows,
    });
  } catch (error) {
    logger.error('Get groups error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des groupes' });
  }
};

export const getGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const groupResult = await query('SELECT * FROM groups WHERE id = $1', [id]);

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    const sitesResult = await query(`
      SELECT s.* FROM sites s
      INNER JOIN site_groups sg ON s.id = sg.site_id
      WHERE sg.group_id = $1
      ORDER BY s.site_name
    `, [id]);

    res.json({
      ...groupResult.rows[0],
      sites: sitesResult.rows,
    });
  } catch (error) {
    logger.error('Get group error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du groupe' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, filters } = req.body;

    const id = uuidv4();

    const result = await query(
      `INSERT INTO groups (id, name, description, type, filters)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        name,
        description || null,
        type,
        filters ? JSON.stringify(filters) : null,
      ]
    );

    logger.info('Group created', { groupId: id, groupName: name, createdBy: req.user?.email });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create group error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du groupe' });
  }
};

export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, type, filters } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (type !== undefined) {
      updates.push(`type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (filters !== undefined) {
      updates.push(`filters = $${paramIndex}`);
      params.push(JSON.stringify(filters));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    params.push(id);
    const sqlQuery = `UPDATE groups SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await query(sqlQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    logger.info('Group updated', { groupId: id, updatedBy: req.user?.email });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update group error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du groupe' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM groups WHERE id = $1 RETURNING name', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    logger.info('Group deleted', { groupId: id, groupName: result.rows[0].name, deletedBy: req.user?.email });

    res.json({ message: 'Groupe supprimé avec succès' });
  } catch (error) {
    logger.error('Delete group error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du groupe' });
  }
};

export const addSitesToGroup = async (req: AuthRequest, res: Response) => {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { site_ids } = req.body;

    await client.query('BEGIN');

    const groupCheck = await client.query('SELECT id FROM groups WHERE id = $1', [id]);
    if (groupCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    for (const siteId of site_ids) {
      const siteCheck = await client.query('SELECT id FROM sites WHERE id = $1', [siteId]);
      if (siteCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Site ${siteId} non trouvé` });
      }

      await client.query(
        'INSERT INTO site_groups (site_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [siteId, id]
      );
    }

    await client.query('COMMIT');

    logger.info('Sites added to group', { groupId: id, siteCount: site_ids.length, addedBy: req.user?.email });

    res.json({
      message: `${site_ids.length} site(s) ajouté(s) au groupe avec succès`,
      added_count: site_ids.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Add sites to group error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout des sites au groupe' });
  } finally {
    client.release();
  }
};

export const removeSiteFromGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id, siteId } = req.params;

    const result = await query(
      'DELETE FROM site_groups WHERE group_id = $1 AND site_id = $2 RETURNING *',
      [id, siteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Association non trouvée' });
    }

    logger.info('Site removed from group', { groupId: id, siteId, removedBy: req.user?.email });

    res.json({ message: 'Site retiré du groupe avec succès' });
  } catch (error) {
    logger.error('Remove site from group error:', error);
    res.status(500).json({ error: 'Erreur lors du retrait du site du groupe' });
  }
};

export const getGroupSites = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT s.* FROM sites s
      INNER JOIN site_groups sg ON s.id = sg.site_id
      WHERE sg.group_id = $1
      ORDER BY s.site_name
    `, [id]);

    res.json({
      group_id: id,
      total: result.rows.length,
      sites: result.rows,
    });
  } catch (error) {
    logger.error('Get group sites error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sites du groupe' });
  }
};
