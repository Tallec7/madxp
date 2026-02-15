/**
 * Network Resilience Handler — Records network failures and auto-rollbacks.
 *
 * Handles events from the Pi's NetworkWatchdog:
 * - network_alert: Auto-recovery failure after network issues
 * - network_rollback: Automatic config rollback after connection loss
 *
 * @see socket-context.ts for SocketContext interface
 */

import { query } from '../config/database';
import logger from '../config/logger';
import alertService from '../services/alert.service';
import { metricsService } from '../services/metrics.service';
import { SocketContext } from './socket-context';

/**
 * Handle a network_alert event from the Pi's NetworkWatchdog.
 * Stores the alert in DB and broadcasts to dashboard.
 */
export async function handleNetworkAlert(
  ctx: SocketContext,
  siteId: string,
  alert: Record<string, unknown>
): Promise<void> {
  try {
    const { type, severity, issues, recoveryAttempts, timestamp } = alert;

    logger.warn('Network alert received from site', {
      siteId,
      alertType: type,
      severity,
      issues,
      recoveryAttempts,
    });

    // Record Prometheus metrics
    metricsService.recordNetworkAlert(String(type || 'unknown'), String(severity || 'warning'));
    if (typeof recoveryAttempts === 'number' && recoveryAttempts > 0) {
      metricsService.recordNetworkRecoveryAttempts(recoveryAttempts);
    }

    // Store alert in database (deduplicated: 1 per type/site/hour)
    const alertType = `network_${type}`;
    const existing = await query(
      `SELECT id FROM alerts
       WHERE site_id = $1 AND alert_type = $2 AND status = 'active'
       AND created_at > NOW() - INTERVAL '1 hour'`,
      [siteId, alertType]
    );

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO alerts (site_id, alert_type, severity, message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          siteId,
          alertType,
          severity,
          `Network issue: ${(issues as string[])?.join(', ') || 'unknown'}`,
          JSON.stringify({ issues, recoveryAttempts, watchdogTimestamp: timestamp }),
          new Date(),
        ]
      );

      // Send Slack notification (same dedup window as DB insert)
      const siteResult = await query('SELECT club_name FROM sites WHERE id = $1', [siteId]);
      const clubName: string = (siteResult.rows[0]?.club_name as string) || siteId;
      alertService.networkFailure(
        siteId,
        clubName,
        (issues as string[]) || [],
        (recoveryAttempts as number) || 0
      ).catch((_e) => {/* ignore */});

      logger.warn('Network alert created + Slack sent', { siteId, alertType });
    }

    // Emit to dashboard for real-time display
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('network_alert', {
        siteId,
        type,
        severity,
        issues,
        recoveryAttempts,
        timestamp: new Date().toISOString(),
      });
    }

    // If critical, also log at error level
    if (severity === 'critical') {
      logger.error('CRITICAL network failure', {
        siteId,
        type,
        issues,
        recoveryAttempts,
      });
    }
  } catch (error) {
    logger.error('Error handling network_alert:', { siteId, error });
  }
}

/**
 * Handle a network_rollback event from the Pi's NetworkWatchdog.
 * Records automatic config rollback after connection loss.
 */
export async function handleNetworkRollback(
  ctx: SocketContext,
  siteId: string,
  rollback: Record<string, unknown>
): Promise<void> {
  try {
    const { operation, reason, timestamp } = rollback;

    logger.warn('Network rollback executed on site', {
      siteId,
      operation,
      reason,
      rollbackTimestamp: timestamp,
    });

    // Record Prometheus metric
    metricsService.recordNetworkRollback(String(operation || 'unknown'));

    // Store rollback event in database
    await query(
      `INSERT INTO alerts (site_id, alert_type, severity, message, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        siteId,
        'network_rollback',
        'warning',
        `Configuration rolled back after ${operation}: ${reason}`,
        JSON.stringify({ operation, reason, rollbackTimestamp: timestamp }),
        new Date(),
      ]
    );

    // Emit to dashboard
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('network_rollback', {
        siteId,
        operation,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info('Rollback event stored', { siteId, operation });
  } catch (error) {
    logger.error('Error handling network_rollback:', { siteId, error });
  }
}

/**
 * Handle a network_recovered event from the Pi's NetworkWatchdog.
 * Resolves active network alerts and sends Slack recovery notification.
 */
export async function handleNetworkRecovered(
  ctx: SocketContext,
  siteId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { type, connectionType, ip, timestamp } = payload;

    logger.info('Network recovered on site', {
      siteId,
      type,
      connectionType,
      ip,
    });

    // Resolve active network alerts for this site
    await query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW()
       WHERE site_id = $1 AND alert_type LIKE 'network_%' AND status = 'active'`,
      [siteId]
    );

    // Send Slack recovery notification (only if there was a recent failure alert)
    const recentFailure = await query(
      `SELECT id FROM alerts
       WHERE site_id = $1 AND alert_type LIKE 'network_%' AND status = 'resolved'
       AND resolved_at > NOW() - INTERVAL '1 minute'`,
      [siteId]
    );

    if (recentFailure.rows.length > 0) {
      const siteResult = await query('SELECT club_name FROM sites WHERE id = $1', [siteId]);
      const clubName: string = (siteResult.rows[0]?.club_name as string) || siteId;
      alertService.info(
        'Réseau rétabli',
        `Le site *${clubName}* a récupéré sa connexion ${connectionType || 'internet'} (${ip || 'IP inconnue'}).`,
        { siteId, siteName: clubName }
      ).catch((_e) => {/* ignore */});
    }

    // Emit to dashboard for real-time display
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('network_recovered', {
        siteId,
        type,
        connectionType,
        ip,
        timestamp: timestamp || new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error handling network_recovered:', { siteId, error });
  }
}
