/**
 * CommandQueue Service
 *
 * Gère la file d'attente des commandes pour les sites offline.
 * Les commandes sont stockées en base et envoyées à la reconnexion du site.
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import logger from '../config/logger';
import socketService from './socket.service';

export interface PendingCommand {
  id: string;
  site_id: string;
  command_type: string;
  command_data: Record<string, unknown>;
  priority: number;
  created_by: string | null;
  created_at: Date;
  expires_at: Date | null;
  attempts: number;
  last_attempt_at: Date | null;
  max_attempts: number;
  description: string | null;
}

export interface QueueCommandOptions {
  priority?: number; // 1=urgent, 5=normal (default), 10=basse priorité
  expiresIn?: number; // Durée en ms avant expiration (null = pas d'expiration)
  description?: string;
  maxAttempts?: number;
  createdBy?: string;
}

// Commandes qui ont du sens en mode offline (config, vidéos...)
const QUEUEABLE_COMMANDS = [
  'update_config',
  'deploy_video',
  'delete_video',
  'update_software',
];

// Commandes qui nécessitent une connexion temps réel
const REALTIME_ONLY_COMMANDS = [
  'get_logs',
  'get_system_info',
  'get_config',
  'network_diagnostics',
  'get_hotspot_config',
];

class CommandQueueService {
  /**
   * Ajoute une commande à la file d'attente pour un site offline
   */
  async queueCommand(
    siteId: string,
    commandType: string,
    commandData: Record<string, unknown>,
    options: QueueCommandOptions = {}
  ): Promise<{ queued: boolean; commandId: string; message: string }> {
    const {
      priority = 5,
      expiresIn,
      description,
      maxAttempts = 3,
      createdBy,
    } = options;

    // Vérifier si ce type de commande peut être mis en queue
    if (REALTIME_ONLY_COMMANDS.includes(commandType)) {
      return {
        queued: false,
        commandId: '',
        message: `La commande "${commandType}" nécessite une connexion temps réel et ne peut pas être mise en file d'attente.`,
      };
    }

    const commandId = uuidv4();
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn) : null;

    try {
      await query(
        `INSERT INTO pending_commands
         (id, site_id, command_type, command_data, priority, created_by, expires_at, max_attempts, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          commandId,
          siteId,
          commandType,
          JSON.stringify(commandData),
          priority,
          createdBy || null,
          expiresAt,
          maxAttempts,
          description || `${commandType} en attente`,
        ]
      );

      logger.info('Command queued for offline site', {
        commandId,
        siteId,
        commandType,
        priority,
        expiresAt,
      });

      return {
        queued: true,
        commandId,
        message: 'Commande mise en file d\'attente. Elle sera exécutée à la prochaine connexion du site.',
      };
    } catch (error) {
      logger.error('Failed to queue command:', error);
      throw error;
    }
  }

  /**
   * Tente d'envoyer une commande : si le site est connecté, envoie immédiatement,
   * sinon met en file d'attente.
   */
  async sendOrQueue(
    siteId: string,
    commandType: string,
    commandData: Record<string, unknown>,
    options: QueueCommandOptions & { userId?: string } = {}
  ): Promise<{
    sent: boolean;
    queued: boolean;
    commandId: string;
    message: string;
  }> {
    const isConnected = socketService.isConnected(siteId);

    if (isConnected) {
      // Le site est connecté, envoyer immédiatement
      const commandId = uuidv4();

      // Créer l'entrée dans remote_commands
      await query(
        `INSERT INTO remote_commands (id, site_id, command_type, command_data, status, executed_by)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [commandId, siteId, commandType, JSON.stringify(commandData), options.userId || null]
      );

      const sent = socketService.sendCommand(siteId, {
        id: commandId,
        type: commandType,
        data: commandData,
      });

      if (sent) {
        await query(
          `UPDATE remote_commands SET status = 'executing', executed_at = NOW() WHERE id = $1`,
          [commandId]
        );

        return {
          sent: true,
          queued: false,
          commandId,
          message: 'Commande envoyée au site.',
        };
      }
    }

    // Site non connecté ou envoi échoué, mettre en queue si possible
    if (REALTIME_ONLY_COMMANDS.includes(commandType)) {
      return {
        sent: false,
        queued: false,
        commandId: '',
        message: `Le site n'est pas connecté. La commande "${commandType}" ne peut pas être mise en file d'attente.`,
      };
    }

    const result = await this.queueCommand(siteId, commandType, commandData, {
      ...options,
      createdBy: options.userId,
    });

    return {
      sent: false,
      queued: result.queued,
      commandId: result.commandId,
      message: result.message,
    };
  }

  /**
   * Récupère les commandes en attente pour un site
   */
  async getPendingCommands(siteId: string): Promise<PendingCommand[]> {
    const result = await query(
      `SELECT * FROM pending_commands
       WHERE site_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
         AND attempts < max_attempts
       ORDER BY priority ASC, created_at ASC`,
      [siteId]
    );
    return result.rows as unknown as PendingCommand[];
  }

  /**
   * Traite les commandes en attente pour un site qui vient de se reconnecter
   */
  async processPendingCommands(siteId: string): Promise<{
    processed: number;
    failed: number;
    remaining: number;
  }> {
    let processed = 0;
    let failed = 0;

    const commands = await this.getPendingCommands(siteId);

    if (commands.length === 0) {
      return { processed: 0, failed: 0, remaining: 0 };
    }

    logger.info('Processing pending commands for reconnected site', {
      siteId,
      count: commands.length,
    });

    for (const cmd of commands) {
      try {
        // Vérifier que le site est toujours connecté
        if (!socketService.isConnected(siteId)) {
          logger.warn('Site disconnected during pending commands processing', { siteId });
          break;
        }

        // Incrémenter le compteur de tentatives
        await query(
          `UPDATE pending_commands SET attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
          [cmd.id]
        );

        // Créer l'entrée dans remote_commands
        const remoteCommandId = uuidv4();
        await query(
          `INSERT INTO remote_commands (id, site_id, command_type, command_data, status, executed_by, pending_command_id)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
          [remoteCommandId, siteId, cmd.command_type, JSON.stringify(cmd.command_data), cmd.created_by, cmd.id]
        );

        // Envoyer la commande
        const sent = socketService.sendCommand(siteId, {
          id: remoteCommandId,
          type: cmd.command_type,
          data: cmd.command_data,
        });

        if (sent) {
          await query(
            `UPDATE remote_commands SET status = 'executing', executed_at = NOW() WHERE id = $1`,
            [remoteCommandId]
          );

          // Supprimer de la queue
          await query(`DELETE FROM pending_commands WHERE id = $1`, [cmd.id]);

          processed++;
          logger.info('Pending command sent', {
            pendingCommandId: cmd.id,
            remoteCommandId,
            commandType: cmd.command_type,
          });
        } else {
          failed++;
          logger.warn('Failed to send pending command', {
            pendingCommandId: cmd.id,
            commandType: cmd.command_type,
          });
        }

        // Petit délai entre les commandes pour ne pas surcharger
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        failed++;
        logger.error('Error processing pending command:', { commandId: cmd.id, error });
      }
    }

    // Compter les commandes restantes
    const remainingResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM pending_commands
       WHERE site_id = $1 AND (expires_at IS NULL OR expires_at > NOW()) AND attempts < max_attempts`,
      [siteId]
    );
    const remaining = parseInt(remainingResult.rows[0]?.count || '0', 10);

    logger.info('Pending commands processing completed', {
      siteId,
      processed,
      failed,
      remaining,
    });

    return { processed, failed, remaining };
  }

  /**
   * Supprime une commande de la queue
   */
  async cancelPendingCommand(commandId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM pending_commands WHERE id = $1`,
      [commandId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Supprime toutes les commandes en attente pour un site
   */
  async clearPendingCommands(siteId: string): Promise<number> {
    const result = await query(
      `DELETE FROM pending_commands WHERE site_id = $1`,
      [siteId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Nettoie les commandes expirées
   */
  async cleanupExpiredCommands(): Promise<number> {
    const result = await query(
      `DELETE FROM pending_commands WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );
    const deleted = result.rowCount ?? 0;

    if (deleted > 0) {
      logger.info('Cleaned up expired pending commands', { count: deleted });
    }

    return deleted;
  }

  /**
   * Récupère le résumé de la queue pour tous les sites
   */
  async getQueueSummary(): Promise<Array<{
    site_id: string;
    club_name: string;
    site_status: string;
    pending_count: number;
    highest_priority: number;
    oldest_command: Date | null;
    newest_command: Date | null;
    command_types: string[];
  }>> {
    const result = await query(
      `SELECT * FROM pending_commands_summary WHERE pending_count > 0 ORDER BY pending_count DESC`
    );
    return result.rows as any[];
  }

  /**
   * Vérifie si une commande peut être mise en queue (vs temps réel uniquement)
   */
  isQueueable(commandType: string): boolean {
    return !REALTIME_ONLY_COMMANDS.includes(commandType);
  }
}

export const commandQueueService = new CommandQueueService();
export default commandQueueService;
