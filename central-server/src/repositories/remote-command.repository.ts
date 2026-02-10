import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface RemoteCommand extends QueryResultRow {
  id: string;
  site_id: string;
  command_type: string;
  command_data: string | null;
  status: 'pending' | 'sent' | 'executing' | 'completed' | 'failed' | 'error' | 'timeout';
  result: unknown;
  error_message: string | null;
  executed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCommandInput {
  id: string;
  siteId: string;
  commandType: string;
  commandData: string | null;
  executedBy?: string;
}

export interface CommandStatusRow extends QueryResultRow {
  status: string;
  result: unknown;
  error_message: string | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class RemoteCommandRepositoryImpl extends BaseRepository<RemoteCommand> {
  constructor() {
    super('remote_commands');
  }

  /**
   * Insere une nouvelle commande dans la table remote_commands.
   */
  async create(input: CreateCommandInput): Promise<RemoteCommand> {
    const result = await query<RemoteCommand>(
      `INSERT INTO remote_commands (id, site_id, command_type, command_data, executed_by, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [input.id, input.siteId, input.commandType, input.commandData, input.executedBy || null]
    );
    return result.rows[0];
  }

  /**
   * Met a jour le statut d'une commande (sent, completed, error, timeout).
   */
  async updateStatus(
    id: string,
    status: RemoteCommand['status'],
    errorMessage?: string
  ): Promise<void> {
    if (errorMessage !== undefined) {
      await query(
        `UPDATE remote_commands SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
        [status, errorMessage, id]
      );
    } else {
      await query(
        `UPDATE remote_commands SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id]
      );
    }
  }

  /**
   * Met a jour le statut d'une commande avec son resultat.
   */
  async updateResult(
    id: string,
    status: RemoteCommand['status'],
    result: unknown
  ): Promise<void> {
    await query(
      `UPDATE remote_commands SET status = $1, result = $2, updated_at = NOW() WHERE id = $3`,
      [status, JSON.stringify(result), id]
    );
  }

  /**
   * Recupere le statut, resultat et message d'erreur d'une commande.
   */
  async findStatusById(id: string): Promise<CommandStatusRow | null> {
    const result = await query<CommandStatusRow>(
      `SELECT status, result, error_message FROM remote_commands WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les commandes recentes pour un site, triees par date decroissante.
   */
  async findRecentBySite(siteId: string, limit = 20): Promise<RemoteCommand[]> {
    const result = await query<RemoteCommand>(
      `SELECT * FROM remote_commands
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  }
}

export const remoteCommandRepository = new RemoteCommandRepositoryImpl();
