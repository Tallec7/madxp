import { QueryResultRow } from 'pg';
import { query, getClient } from '../config/database';
import { BaseRepository } from './base.repository';
import logger from '../config/logger';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface GroupRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  filters: string | null;
  site_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGroupInput {
  id: string;
  name: string;
  description: string | null;
  type: string;
  filters: string | null;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  type?: string;
  filters?: string | null;
}

export interface SiteGroupRow extends QueryResultRow {
  id: string;
  site_name: string;
  [key: string]: unknown;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class GroupRepositoryImpl extends BaseRepository<GroupRow> {
  constructor() {
    super('"groups"');
  }

  /**
   * Liste tous les groupes avec le nombre de sites.
   */
  async findAllWithSiteCount(): Promise<GroupRow[]> {
    const result = await query<GroupRow>(`
      SELECT g.*,
        (SELECT COUNT(*) FROM site_groups WHERE group_id = g.id) as site_count
      FROM "groups" g
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Recupere un groupe par ID.
   */
  async findGroupById(id: string): Promise<GroupRow | null> {
    const result = await query<GroupRow>(
      'SELECT * FROM "groups" WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les sites d'un groupe.
   */
  async findGroupSites(groupId: string): Promise<SiteGroupRow[]> {
    const result = await query<SiteGroupRow>(`
      SELECT s.* FROM sites s
      INNER JOIN site_groups sg ON s.id = sg.site_id
      WHERE sg.group_id = $1
      ORDER BY s.site_name
    `, [groupId]);
    return result.rows;
  }

  /**
   * Cree un nouveau groupe.
   */
  async create(input: CreateGroupInput): Promise<GroupRow> {
    const result = await query<GroupRow>(
      `INSERT INTO "groups" (id, name, description, type, filters)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.id, input.name, input.description, input.type, input.filters]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un groupe avec mise a jour dynamique des champs.
   */
  async update(id: string, data: UpdateGroupInput): Promise<GroupRow | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.filters !== undefined) updateData.filters = data.filters;

    const { setClauses, values } = this.buildUpdateSet(updateData);

    if (setClauses.length === 0) {
      return null;
    }

    const paramIndex = values.length + 1;
    values.push(id);

    const result = await query<GroupRow>(
      `UPDATE "groups" SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Supprime un groupe et retourne son nom.
   */
  async deleteGroup(id: string): Promise<string | null> {
    const result = await query<{ name: string }>(
      'DELETE FROM "groups" WHERE id = $1 RETURNING name',
      [id]
    );
    return result.rows[0]?.name || null;
  }

  /**
   * Ajoute des sites a un groupe (avec transaction).
   */
  async addSites(groupId: string, siteIds: string[]): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Verifier que le groupe existe
      const groupCheck = await client.query('SELECT id FROM "groups" WHERE id = $1', [groupId]);
      if (groupCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`Group ${groupId} not found`);
      }

      // Verifier et ajouter chaque site
      for (const siteId of siteIds) {
        const siteCheck = await client.query('SELECT id FROM sites WHERE id = $1', [siteId]);
        if (siteCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          throw new Error(`Site ${siteId} not found`);
        }

        await client.query(
          'INSERT INTO site_groups (site_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [siteId, groupId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rollback in addSites', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retire un site d'un groupe.
   */
  async removeSite(groupId: string, siteId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM site_groups WHERE group_id = $1 AND site_id = $2 RETURNING *',
      [groupId, siteId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const groupRepository = new GroupRepositoryImpl();
