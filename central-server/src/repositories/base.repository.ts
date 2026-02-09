import { QueryResultRow } from 'pg';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

/**
 * Repository de base avec operations CRUD generiques.
 * Les repositories concrets heritent de cette classe.
 */
export abstract class BaseRepository<T extends QueryResultRow> {
  constructor(
    protected readonly tableName: string
  ) {}

  async findById(id: string): Promise<T | null> {
    const result = await query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const result = await query<T>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  async count(whereClause = '', params: unknown[] = []): Promise<number> {
    const sql = whereClause
      ? `SELECT COUNT(*)::int AS count FROM ${this.tableName} WHERE ${whereClause}`
      : `SELECT COUNT(*)::int AS count FROM ${this.tableName}`;
    const result = await query(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async exists(id: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Execute une transaction avec rollback automatique en cas d'erreur.
   */
  protected async withTransaction<R>(
    fn: (client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }) => Promise<R>
  ): Promise<R> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Transaction rollback in ${this.tableName}`, { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Helper pour construire dynamiquement un UPDATE SET avec les champs non-undefined.
   */
  protected buildUpdateSet(
    data: Record<string, unknown>,
    startIndex = 1
  ): { setClauses: string[]; values: unknown[] } {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = startIndex;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    return { setClauses, values };
  }
}
