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
import { alertingService } from '../services/alerting.service';
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
      `INSERT INTO metrics (site_id, cpu_usage, memory_usage, temperature, disk_usage, uptime, network_status, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        siteId,
        message.metrics.cpu,
        message.metrics.memory,
        message.metrics.temperature,
        message.metrics.disk,
        Math.floor(message.metrics.uptime),
        message.wifiStatus ? JSON.stringify(message.wifiStatus) : null,
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

    // Update recording state in memory (ephemeral)
    if (message.recordingState) {
      ctx.recordingStates.set(siteId, {
        isRecording: message.recordingState.isRecording,
        isManualOverride: message.recordingState.isManualOverride,
        updatedAt: Date.now(),
      });
    }

    // Update player state in memory (ephemeral — for cloud monitoring)
    if (message.playerState) {
      ctx.playerStates.set(siteId, message.playerState as import('./socket-context').PlayerState);

      // Broadcast player state update to dashboard
      const io = ctx.getIO();
      if (io) {
        io.to('dashboard').emit('player_state_updated', {
          siteId,
          playerState: message.playerState,
        });
      }
    }

    // Broadcast WiFi status to dashboard in real-time
    if (message.wifiStatus) {
      const io = ctx.getIO();
      if (io) {
        io.to('dashboard').emit('wifi_status_updated', {
          siteId,
          wifiStatus: message.wifiStatus,
        });
      }
    }

    // Record transition quality metrics (video double-buffer)
    if (message.transitionMetrics) {
      metricsService.recordTransitionMetrics(message.transitionMetrics);

      // Feed hourly safety timeout counter for threshold-based alerting
      if (message.transitionMetrics.safetyTimeoutCount > 0) {
        alertingService.recordVideoSafetyTimeouts(siteId, message.transitionMetrics.safetyTimeoutCount);
      }
    }

    await checkAlerts(siteId, message.metrics, message.kioskStatus, message.wifiStatus);
  } catch (error) {
    logger.error('Error handling heartbeat:', error);
  }
}

/**
 * Check metrics against alert thresholds and create alerts if needed.
 * Deduplicates alerts: only creates one per type per hour.
 */
async function checkAlerts(
  siteId: string,
  metrics: HeartbeatMessage['metrics'],
  kioskStatus?: HeartbeatMessage['kioskStatus'],
  wifiStatus?: HeartbeatMessage['wifiStatus']
): Promise<void> {
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

  // Kiosk crash detection
  if (kioskStatus && !kioskStatus.chromiumAlive) {
    alerts.push({
      type: 'kiosk_crash',
      severity: 'critical',
      message: `Kiosk Chromium crashé: ${kioskStatus.reason || 'raison inconnue'} (${kioskStatus.restartCount} restarts)`,
    });
    metricsService.recordKioskCrash();
  }

  if (kioskStatus && kioskStatus.restartCount > 3) {
    alerts.push({
      type: 'kiosk_unstable',
      severity: 'warning',
      message: `Kiosk instable: ${kioskStatus.restartCount} redémarrages récents`,
    });
  }

  // WiFi / network alerts
  if (wifiStatus) {
    // Signal faible (seulement si connexion WiFi, pas Ethernet)
    if (wifiStatus.connectionType === 'wifi' && wifiStatus.signal !== null && wifiStatus.signal < -75) {
      alerts.push({
        type: 'low_wifi_signal',
        severity: wifiStatus.signal < -85 ? 'critical' : 'warning',
        message: `Signal WiFi faible: ${wifiStatus.signal} dBm (${wifiStatus.ssid || 'inconnu'})`,
      });
    }

    // Clé USB absente (seulement si pas en Ethernet — un Pi Ethernet sans clé est normal)
    if (wifiStatus.connectionType !== 'ethernet' && wifiStatus.interface === null) {
      alerts.push({
        type: 'wlan1_missing',
        severity: 'critical',
        message: 'Clé WiFi USB non détectée (wlan1 absent)',
      });
    }

    // Sous-tension USB (toujours alerter — affecte tout le système)
    if (!wifiStatus.voltageOk) {
      alerts.push({
        type: 'usb_power_issue',
        severity: 'critical',
        message: `Sous-tension détectée (${wifiStatus.throttled}) — alimentation USB insuffisante`,
      });
    }

    // WiFi power management still enabled (driver ignoring modprobe config)
    if (wifiStatus.connectionType === 'wifi' && wifiStatus.powerManagement === 'on') {
      alerts.push({
        type: 'wifi_power_mgmt_on',
        severity: 'warning',
        message: 'WiFi power management activé sur wlan1 — risque de déconnexions',
      });
    }

    // Hotspot co-channel interference with wlan1 (internet)
    if (
      wifiStatus.connectionType === 'wifi' &&
      wifiStatus.channel != null &&
      wifiStatus.hotspotChannel != null &&
      wifiStatus.channel === wifiStatus.hotspotChannel
    ) {
      alerts.push({
        type: 'wifi_channel_conflict',
        severity: 'warning',
        message: `Auto-interférence : hotspot et wlan1 sur canal ${wifiStatus.channel}`,
      });
    }
  }

  // Update kiosk status metric
  if (kioskStatus) {
    metricsService.recordKioskStatus(kioskStatus.chromiumAlive ? 1 : 0, kioskStatus.restartCount);
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
      } else if (alert.type === 'kiosk_crash') {
        alertService.kioskCrash(siteId, clubName, kioskStatus?.reason || 'GPU crash', kioskStatus?.restartCount || 0).catch((_e) => {/* ignore */});
      } else if (alert.type === 'low_wifi_signal') {
        alertService.lowWifiSignal(siteId, clubName, wifiStatus?.signal || 0).catch((_e) => {/* ignore */});
      } else if (alert.type === 'wlan1_missing') {
        alertService.wlan1Missing(siteId, clubName).catch((_e) => {/* ignore */});
      } else if (alert.type === 'usb_power_issue') {
        alertService.usbPowerIssue(siteId, clubName, wifiStatus?.throttled || '').catch((_e) => {/* ignore */});
      }

      logger.warn('Alert created', { siteId, ...alert });
    }
  }
}
