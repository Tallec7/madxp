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

    // Store alert in database
    await query(
      `INSERT INTO alerts (site_id, alert_type, severity, message, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        siteId,
        `network_${type}`,
        severity,
        `Network issue: ${(issues as string[])?.join(', ') || 'unknown'}`,
        JSON.stringify({ issues, recoveryAttempts, watchdogTimestamp: timestamp }),
        new Date(),
      ]
    );

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
