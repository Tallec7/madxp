/**
 * ADR-107 — Template Backgrounds Repository
 *
 * Catalogue des fonds couleur WebM alpha (uploads super_admin) + grants user_id
 * pour visibilité restreinte. Pattern aligné avec ADR-082 (Video Club Grants).
 *
 * Phase 1 : skeleton + listForUser (lecture filtrée par grants).
 * Phase 2 : create / grant / revoke / archive (déplacé en PR séparée).
 */

import type { QueryResultRow } from 'pg';
import { query } from '../config/database';
import logger from '../config/logger';

export interface TemplateBackground extends QueryResultRow {
  id: string;
  name: string;
  hex_color: string;
  webm_url: string;
  duration_ms: number | null;
  is_public: boolean;
  uploaded_by: string;
  created_at: Date;
  archived_at: Date | null;
}

export interface CreateBackgroundInput {
  name: string;
  hex_color: string;
  webm_url: string;
  duration_ms?: number | null;
  is_public?: boolean;
  uploaded_by: string;
}

class TemplateBackgroundsRepository {
  /**
   * Liste des backgrounds visibles par un user.
   * - Backgrounds publics (is_public = true) : tous les users
   * - Backgrounds restreints (is_public = false) : seulement ceux avec un grant
   * - Soft-deleted (archived_at IS NOT NULL) : exclus
   *
   * Cf. ADR-107 §2.2.
   */
  async listForUser(userId: string): Promise<TemplateBackground[]> {
    const result = await query<TemplateBackground>(
      `SELECT b.*
       FROM template_backgrounds b
       WHERE b.archived_at IS NULL
         AND (
           b.is_public = true
           OR EXISTS (
             SELECT 1 FROM template_backgrounds_grants g
             WHERE g.background_id = b.id AND g.user_id = $1
           )
         )
       ORDER BY b.name`,
      [userId]
    );
    return result.rows;
  }

  async findById(id: string): Promise<TemplateBackground | null> {
    const result = await query<TemplateBackground>(
      `SELECT * FROM template_backgrounds WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(input: CreateBackgroundInput): Promise<TemplateBackground> {
    const result = await query<TemplateBackground>(
      `INSERT INTO template_backgrounds
         (name, hex_color, webm_url, duration_ms, is_public, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.name,
        input.hex_color,
        input.webm_url,
        input.duration_ms ?? null,
        input.is_public ?? true,
        input.uploaded_by,
      ]
    );
    logger.info('Template background created', {
      id: result.rows[0].id,
      name: input.name,
      is_public: input.is_public ?? true,
    });
    return result.rows[0];
  }

  /**
   * Bulk grant : ajoute un grant pour chaque user_id passé.
   * Idempotent : ON CONFLICT DO NOTHING (un grant existant n'est pas dupliqué).
   */
  async grantBulk(
    backgroundId: string,
    userIds: string[],
    grantedBy: string
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const values = userIds
      .map((_, i) => `($1, $${i + 2}, $${userIds.length + 2})`)
      .join(', ');
    const result = await query(
      `INSERT INTO template_backgrounds_grants (background_id, user_id, granted_by)
       VALUES ${values}
       ON CONFLICT (background_id, user_id) DO NOTHING`,
      [backgroundId, ...userIds, grantedBy]
    );
    logger.info('Template background grants added', {
      backgroundId,
      userIdsCount: userIds.length,
      affected: result.rowCount ?? 0,
    });
    return result.rowCount ?? 0;
  }

  async revoke(backgroundId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM template_backgrounds_grants
       WHERE background_id = $1 AND user_id = $2`,
      [backgroundId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async archive(id: string): Promise<TemplateBackground | null> {
    const result = await query<TemplateBackground>(
      `UPDATE template_backgrounds
       SET archived_at = NOW()
       WHERE id = $1 AND archived_at IS NULL
       RETURNING *`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Liste tous les backgrounds (admin) y compris archivés. */
  async listAll(): Promise<TemplateBackground[]> {
    const result = await query<TemplateBackground>(
      `SELECT * FROM template_backgrounds ORDER BY archived_at NULLS FIRST, name`
    );
    return result.rows;
  }

  /**
   * Patch partiel name + is_public + archived (toggle archived_at).
   * Retourne null si introuvable.
   */
  async update(
    id: string,
    patch: { name?: string; is_public?: boolean; archived?: boolean }
  ): Promise<TemplateBackground | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (patch.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(patch.name);
    }
    if (patch.is_public !== undefined) {
      sets.push(`is_public = $${idx++}`);
      values.push(patch.is_public);
    }
    if (patch.archived !== undefined) {
      sets.push(`archived_at = $${idx++}`);
      values.push(patch.archived ? new Date() : null);
    }
    if (sets.length === 0) return this.findById(id);

    values.push(id);
    const result = await query<TemplateBackground>(
      `UPDATE template_backgrounds SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ?? null;
  }

  /** Liste les user_ids qui ont un grant sur un background. */
  async listGrants(
    backgroundId: string
  ): Promise<{ user_id: string; granted_by: string; granted_at: Date }[]> {
    const result = await query<{
      user_id: string;
      granted_by: string;
      granted_at: Date;
    }>(
      `SELECT user_id, granted_by, granted_at
       FROM template_backgrounds_grants
       WHERE background_id = $1
       ORDER BY granted_at DESC`,
      [backgroundId]
    );
    return result.rows;
  }
}

export const templateBackgroundsRepository = new TemplateBackgroundsRepository();
