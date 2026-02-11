/**
 * Heartbeat Handler — Processes Pi heartbeats and generates system alerts.
 *
 * Receives periodic heartbeat messages from Raspberry Pi agents,
 * stores metrics in DB, updates site status, and creates alerts
 * for critical thresholds (temperature, disk, memory).
 *
 * @see socket-context.ts for SocketContext interface
 */

import { query } from '../config/database';
import { HeartbeatMessage } from '../types';
import logger from '../config/logger';
import { alertService } from '../services/alert.service';
import { metricsService } from '../services/metrics.service';
import { SocketContext } from './socket-context';

/**
 * Handle a heartbeat message from a connected Raspberry Pi.
 *
 * Updates lastPongReceived (proves connection is alive),
 * inserts metrics into DB, updates site status/IP/version,
 * and checks for alert thresholds.
 */
export async function handleHeartbeat(
  ctx: SocketContext,
  siteId: string,
  message: HeartbeatMessage
): Promise<void> {
  try {
    // Le heartbeat prouve que la connexion est vivante
    ctx.lastPongReceived.set(siteId, Date.now());
    metricsService.recordHeartbeat();

    await query(
      `INSERT INTO metrics (site_id, cpu_usage, memory_usage, temperature, disk_usage, uptime, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        siteId,
        message.metrics.cpu,
        message.metrics.memory,
        message.metrics.temperature,
        message.metrics.disk,
        Math.floor(message.metrics.uptime),
      ]
    );

    // Update site status, local IP and version if provided
    const localIp = message.metrics.localIp || null;
    const softwareVersion =
      message.softwareVersion ||
      message.versionInfo?.version ||
      null;

    if (localIp) {
      await query(
        'UPDATE sites SET last_seen_at = NOW(), status = $1, local_ip = $3 WHERE id = $2',
        ['online', siteId, localIp]
      );
    } else {
      await query(
        'UPDATE sites SET last_seen_at = NOW(), status = $1 WHERE id = $2',
        ['online', siteId]
      );
    }

    if (softwareVersion) {
      await query(
        'UPDATE sites SET software_version = $2 WHERE id = $1',
        [siteId, softwareVersion]
      );
    }

    await checkAlerts(siteId, message.metrics);
  } catch (error) {
    logger.error('Error handling heartbeat:', error);
  }
}

/**
 * Check metrics against alert thresholds and create alerts if needed.
 * Deduplicates alerts: only creates one per type per hour.
 */
async function checkAlerts(siteId: string, metrics: HeartbeatMessage['metrics']): Promise<void> {
  const alerts: Array<{ type: string; severity: string; message: string }> = [];

  if (metrics.temperature > 75) {
    alerts.push({
      type: 'high_temperature',
      severity: metrics.temperature > 80 ? 'critical' : 'warning',
      message: `Température élevée: ${metrics.temperature.toFixed(1)}°C`,
    });
  }

  if (metrics.disk > 90) {
    alerts.push({
      type: 'high_disk_usage',
      severity: metrics.disk > 95 ? 'critical' : 'warning',
      message: `Espace disque faible: ${metrics.disk.toFixed(1)}%`,
    });
  }

  if (metrics.memory > 90) {
    alerts.push({
      type: 'high_memory_usage',
      severity: 'warning',
      message: `Utilisation mémoire élevée: ${metrics.memory.toFixed(1)}%`,
    });
  }

  for (const alert of alerts) {
    const existing = await query(
      `SELECT id FROM alerts
       WHERE site_id = $1 AND alert_type = $2 AND status = 'active'
       AND created_at > NOW() - INTERVAL '1 hour'`,
      [siteId, alert.type]
    );

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO alerts (site_id, alert_type, severity, message, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [siteId, alert.type, alert.severity, alert.message]
      );

      // Send Slack alert for critical metrics
      const siteResult = await query('SELECT club_name FROM sites WHERE id = $1', [siteId]);
      const clubName: string = (siteResult.rows[0]?.club_name as string) || siteId;

      if (alert.type === 'high_temperature') {
        alertService.highTemperature(siteId, clubName, metrics.temperature).catch((_e) => {/* ignore */});
      } else if (alert.type === 'high_disk_usage') {
        alertService.lowDiskSpace(siteId, clubName, metrics.disk).catch((_e) => {/* ignore */});
      }

      logger.warn('Alert created', { siteId, ...alert });
    }
  }
}
