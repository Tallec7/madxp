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
      `INSERT INTO metrics (site_id, cpu_usage, memory_usage, temperature, disk_usage, uptime, network_status, fan_status, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        siteId,
        message.metrics.cpu,
        message.metrics.memory,
        message.metrics.temperature,
        message.metrics.disk,
        Math.floor(message.metrics.uptime),
        message.wifiStatus ? JSON.stringify(message.wifiStatus) : null,
        message.fanStatus ? JSON.stringify(message.fanStatus) : null,
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

      // ADR-033: Log stale loop state occurrences for visibility (race condition guard)
      if (message.transitionMetrics.staleLoopStateCount && message.transitionMetrics.staleLoopStateCount > 0) {
        logger.warn('Stale loop state guard triggered', {
          siteId,
          staleLoopStateCount: message.transitionMetrics.staleLoopStateCount,
        });
      }

      // ADR-034: Log preload-reveal sync metrics for dual-display monitoring
      if (message.transitionMetrics.preloadRevealCount && message.transitionMetrics.preloadRevealCount > 0) {
        logger.info('Preload-reveal sync completed', {
          siteId,
          preloadRevealCount: message.transitionMetrics.preloadRevealCount,
        });
      }
      if (message.transitionMetrics.preloadCleanupCount && message.transitionMetrics.preloadCleanupCount > 0) {
        logger.info('Preload cleanup (master returned to loop before reveal)', {
          siteId,
          preloadCleanupCount: message.transitionMetrics.preloadCleanupCount,
        });
      }
    }

    // Broadcast HDMI status to dashboard in real-time (E-23)
    if (message.hdmiStatus) {
      const io = ctx.getIO();
      if (io) {
        io.to('dashboard').emit('hdmi_status_updated', {
          siteId,
          hdmiStatus: {
            ...message.hdmiStatus,
            hdmi0Resolution: message.kioskStatus?.primaryResolution || null,
            hdmi1Resolution: message.kioskStatus?.secondaryResolution || null,
          },
          connectedClients: message.connectedClients || [],
          dualDisplayActive: message.dualDisplayActive || false,
        });
      }
    }

    await checkAlerts(siteId, message.metrics, message.kioskStatus, message.wifiStatus, message.fanStatus, message.filesystemHealth, message.hdmiStatus, message.orphanServices);
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
  wifiStatus?: HeartbeatMessage['wifiStatus'],
  fanStatus?: HeartbeatMessage['fanStatus'],
  filesystemHealth?: HeartbeatMessage['filesystemHealth'],
  hdmiStatus?: HeartbeatMessage['hdmiStatus'],
  orphanServices?: HeartbeatMessage['orphanServices']
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

  // Display resolution fallback detection
  if (kioskStatus?.displayFallback) {
    alerts.push({
      type: 'display_fallback',
      severity: 'warning',
      message: `Résolution écran en mode dégradé: ${kioskStatus.displayFallback}`,
    });
    metricsService.recordDisplayFallback();
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

    // WiFi signal recovery: if signal is back above -70 dBm, resolve active alert
    if (wifiStatus.connectionType === 'wifi' && wifiStatus.signal !== null && wifiStatus.signal >= -70) {
      const siteResult = await query('SELECT site_name FROM sites WHERE id = $1', [siteId]);
      const siteName: string = (siteResult.rows[0]?.site_name as string) || siteId;
      alertService.wifiSignalRecovered(siteId, siteName, wifiStatus.signal).catch((_e) => {/* ignore */});
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

  // Fan failure detection (only alert if fan is installed but not running at high temp)
  if (fanStatus && fanStatus.present && metrics.temperature > 70 && fanStatus.curState === 0) {
    alerts.push({
      type: 'fan_failure',
      severity: metrics.temperature > 80 ? 'critical' : 'warning',
      message: `Ventilateur arrêté à ${metrics.temperature.toFixed(1)}°C (état: ${fanStatus.curState}/${fanStatus.maxState})`,
    });
    metricsService.recordFanFailure();
  }

  // Record fan status metrics for Prometheus
  if (fanStatus) {
    metricsService.recordFanStatus(fanStatus.present, fanStatus.curState);
  }

  // Update kiosk status metric
  if (kioskStatus) {
    metricsService.recordKioskStatus(kioskStatus.chromiumAlive ? 1 : 0, kioskStatus.restartCount);
  }

  // SD card / filesystem health alerts
  if (filesystemHealth) {
    if (filesystemHealth.isReadOnly) {
      alerts.push({
        type: 'fs_readonly',
        severity: 'critical',
        message: 'Filesystem root monté en lecture seule — SD card potentiellement corrompue',
      });
    }

    if (filesystemHealth.ext4Errors > 0) {
      alerts.push({
        type: 'fs_ext4_errors',
        severity: filesystemHealth.ext4Errors > 5 ? 'critical' : 'warning',
        message: `${filesystemHealth.ext4Errors} erreur(s) EXT4 détectée(s) dans dmesg — SD card à surveiller`,
      });
    }
  }

  // HDMI display alerts (E-23)
  if (hdmiStatus) {
    // Monitor CEC false positive corrections (Pi 5 RP1 quirk, v3.90.0)
    // When CEC reports cec_available but no devices and no DRM connection,
    // the Pi-side fix in getFullStatus() corrected tv_connected to false.
    // Log for fleet-wide monitoring of this hardware quirk.
    if (hdmiStatus.cec_available && hdmiStatus.devices_found === 0 && !hdmiStatus.hdmi0 && !hdmiStatus.hdmi1) {
      logger.info('HDMI CEC available but no devices and no display connected (Pi 5 CEC quirk)', {
        siteId,
        cecAvailable: hdmiStatus.cec_available,
        devicesFound: hdmiStatus.devices_found,
        hdmi0: hdmiStatus.hdmi0,
        hdmi1: hdmiStatus.hdmi1,
      });
    }

    if (!hdmiStatus.hdmi0 && !hdmiStatus.hdmi1) {
      alerts.push({
        type: 'no_display',
        severity: 'critical',
        message: 'Aucun écran branché (HDMI-0 et HDMI-1 déconnectés)',
      });
    }
    if (hdmiStatus.wrongPort) {
      alerts.push({
        type: 'hdmi_wrong_port',
        severity: 'warning',
        message: 'Écran branché sur la mauvaise prise HDMI (HDMI-1 au lieu de HDMI-0)',
      });
    }

    // Display type cross-validation: detect monitor-only manufacturer classified as TV
    // Catches regressions where monitorOnlyMfg filter is missing or broken (incident LEN L27i-30, v3.99.2)
    const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
    if (hdmiStatus.display_type === 'tv' && monitorOnlyMfg.test((hdmiStatus.manufacturer || '').toUpperCase())) {
      logger.warn('Display type misclassification detected: monitor manufacturer classified as TV', {
        siteId,
        manufacturer: hdmiStatus.manufacturer,
        display_type: hdmiStatus.display_type,
        model: hdmiStatus.model,
      });
      alerts.push({
        type: 'display_type_misclassification',
        severity: 'warning',
        message: `Moniteur ${hdmiStatus.manufacturer} classifié comme TV (manufacturer filter missing)`,
      });
      metricsService.recordDisplayTypeMisclassification();
    }
  }

  // Orphan systemd services — crash-looping non-legitimate neopro-* services
  if (orphanServices && orphanServices.length > 0) {
    for (const orphan of orphanServices) {
      logger.warn('Orphan systemd service detected on Pi', {
        siteId,
        service: orphan.name,
        status: orphan.status,
        restarts: orphan.restarts,
      });
      alerts.push({
        type: 'orphan_systemd_service',
        severity: 'warning',
        message: `Service orphelin ${orphan.name} en crash-loop (${orphan.restarts} restarts)`,
      });
      metricsService.recordOrphanServiceDetected(orphan.name);
    }
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
      const siteResult = await query('SELECT site_name FROM sites WHERE id = $1', [siteId]);
      const siteName: string = (siteResult.rows[0]?.site_name as string) || siteId;

      if (alert.type === 'high_temperature') {
        alertService.highTemperature(siteId, siteName, metrics.temperature).catch((_e) => {/* ignore */});
      } else if (alert.type === 'high_disk_usage') {
        alertService.lowDiskSpace(siteId, siteName, metrics.disk).catch((_e) => {/* ignore */});
      } else if (alert.type === 'kiosk_crash') {
        alertService.kioskCrash(siteId, siteName, kioskStatus?.reason || 'GPU crash', kioskStatus?.restartCount || 0).catch((_e) => {/* ignore */});
      } else if (alert.type === 'low_wifi_signal') {
        alertService.lowWifiSignal(siteId, siteName, wifiStatus?.signal || 0).catch((_e) => {/* ignore */});
      } else if (alert.type === 'wlan1_missing') {
        alertService.wlan1Missing(siteId, siteName).catch((_e) => {/* ignore */});
      } else if (alert.type === 'usb_power_issue') {
        alertService.usbPowerIssue(siteId, siteName, wifiStatus?.throttled || '').catch((_e) => {/* ignore */});
      } else if (alert.type === 'fan_failure') {
        alertService.fanFailure(siteId, siteName, metrics.temperature, fanStatus?.curState ?? 0, fanStatus?.maxState ?? 0).catch((_e) => {/* ignore */});
      } else if (alert.type === 'display_fallback') {
        alertService.displayFallback(siteId, siteName, kioskStatus?.displayFallback || '').catch((_e) => {/* ignore */});
      }

      logger.warn('Alert created', { siteId, ...alert });
    }
  }
}
