/**
 * Service d'audit log pour tracer toutes les actions administratives
 */

import { Request } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';
import { AuthRequest } from '../types';

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'SITE_CREATED'
  | 'SITE_UPDATED'
  | 'SITE_DELETED'
  | 'API_KEY_REGENERATED'
  | 'VIDEO_UPLOADED'
  | 'VIDEO_DELETED'
  | 'VIDEO_DEPLOYED'
  | 'CONFIG_PUSHED'
  | 'COMMAND_SENT'
  | 'GROUP_CREATED'
  | 'GROUP_UPDATED'
  | 'GROUP_DELETED'
  | 'SETTINGS_UPDATED';

interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditService {
  private tableName = 'audit_logs';
  private tableChecked = false;

  /**
   * Enregistre une action dans les logs d'audit
   */
  async log(entry: AuditLogEntry, req?: Request | AuthRequest): Promise<void> {
    try {
      // Extraire les infos de la requête si disponible
      const ipAddress = req
        ? (req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
           req.socket?.remoteAddress ||
           'unknown')
        : entry.ipAddress || 'system';

      const userAgent = req
        ? req.headers['user-agent'] || 'unknown'
        : entry.userAgent || 'system';

      const userId = entry.userId || (req as AuthRequest)?.user?.id || null;

      // S'assurer que la table existe
      await this.ensureTable();

      await query(
        `INSERT INTO ${this.tableName}
         (action, user_id, target_type, target_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.action,
          userId,
          entry.targetType || null,
          entry.targetId || null,
          entry.details ? JSON.stringify(entry.details) : null,
          ipAddress,
          userAgent,
        ]
      );

      logger.info('Audit log recorded', {
        action: entry.action,
        userId,
        targetType: entry.targetType,
        targetId: entry.targetId,
      });
    } catch (error) {
      // Ne pas faire échouer l'opération si l'audit échoue
      logger.error('Failed to record audit log:', error);
    }
  }

  /**
   * Vérifie et crée la table si nécessaire
   */
  private async ensureTable(): Promise<void> {
    if (this.tableChecked) return;

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          action VARCHAR(100) NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          target_type VARCHAR(50),
          target_id VARCHAR(100),
          details JSONB,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Créer les index s'ils n'existent pas
      await query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON ${this.tableName}(action)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON ${this.tableName}(user_id)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON ${this.tableName}(created_at)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON ${this.tableName}(target_type, target_id)
      `);

      this.tableChecked = true;
    } catch (error) {
      logger.error('Failed to create audit_logs table:', error);
    }
  }

  /**
   * Récupère les logs d'audit avec pagination
   */
  async getLogs(options: {
    page?: number;
    limit?: number;
    action?: AuditAction;
    userId?: string;
    targetType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
    const {
      page = 1,
      limit = 50,
      action,
      userId,
      targetType,
      startDate,
      endDate,
    } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (targetType) {
      conditions.push(`target_type = $${paramIndex}`);
      params.push(targetType);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    try {
      await this.ensureTable();

      const [logsResult, countResult] = await Promise.all([
        query(
          `SELECT al.*, u.email as user_email
           FROM ${this.tableName} al
           LEFT JOIN users u ON al.user_id = u.id
           ${whereClause}
           ORDER BY al.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        ),
        query(
          `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
          params
        ),
      ]);

      const total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);

      return {
        logs: logsResult.rows,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      return { logs: [], total: 0, page, totalPages: 0 };
    }
  }

  /**
   * Helpers pour actions courantes
   */
  async logUserLogin(userId: string, req: Request): Promise<void> {
    await this.log({ action: 'USER_LOGIN', userId }, req);
  }

  async logSiteCreated(siteId: string, siteName: string, req: AuthRequest): Promise<void> {
    await this.log({
      action: 'SITE_CREATED',
      targetType: 'site',
      targetId: siteId,
      details: { siteName },
    }, req);
  }

  async logSiteDeleted(siteId: string, siteName: string, req: AuthRequest): Promise<void> {
    await this.log({
      action: 'SITE_DELETED',
      targetType: 'site',
      targetId: siteId,
      details: { siteName },
    }, req);
  }

  async logVideoUploaded(videoId: string, filename: string, req: AuthRequest): Promise<void> {
    await this.log({
      action: 'VIDEO_UPLOADED',
      targetType: 'video',
      targetId: videoId,
      details: { filename },
    }, req);
  }

  async logVideoDeployed(
    videoId: string,
    targetType: 'site' | 'group',
    targetId: string,
    req: AuthRequest
  ): Promise<void> {
    await this.log({
      action: 'VIDEO_DEPLOYED',
      targetType: 'video',
      targetId: videoId,
      details: { deployTarget: targetType, deployTargetId: targetId },
    }, req);
  }

  async logCommandSent(
    siteId: string,
    commandType: string,
    commandId: string,
    req: AuthRequest
  ): Promise<void> {
    await this.log({
      action: 'COMMAND_SENT',
      targetType: 'site',
      targetId: siteId,
      details: { commandType, commandId },
    }, req);
  }

  async logApiKeyRegenerated(siteId: string, req: AuthRequest): Promise<void> {
    await this.log({
      action: 'API_KEY_REGENERATED',
      targetType: 'site',
      targetId: siteId,
    }, req);
  }
}

export const auditService = new AuditService();
export default auditService;
