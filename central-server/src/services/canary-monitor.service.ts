/**
 * Canary Monitor Service — Post-OTA health watch
 *
 * After an OTA deployment completes successfully, monitors the deployed
 * Pi(s) for a configurable window (default: 5 minutes) to detect
 * regressions that the post-OTA validation on the Pi may have missed.
 *
 * Checks:
 * - Site still online (heartbeat/pong freshness)
 * - Software version matches deployed target
 * - No crash-loops (site going offline/online rapidly)
 *
 * On failure: creates a canary alert (severity: critical) and broadcasts
 * to the dashboard. Does NOT auto-rollback (manual decision).
 */

import { query } from '../config/database';
import logger from '../config/logger';
import { alertRepository } from '../repositories/alert.repository';

const CANARY_WINDOW_MS = parseInt(process.env.CANARY_WINDOW_MS || '300000', 10); // 5 minutes
const CANARY_CHECK_INTERVAL_MS = parseInt(process.env.CANARY_CHECK_INTERVAL_MS || '30000', 10); // 30 seconds
const CANARY_ALERT_TYPE = 'canary_post_ota';

interface CanaryWatch {
  deploymentId: string;
  siteId: string;
  targetVersion: string;
  startedAt: number;
  expiresAt: number;
  lastCheckAt: number;
  offlineCount: number;
  resolved: boolean;
}

class CanaryMonitorService {
  private activeWatches: Map<string, CanaryWatch> = new Map();
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Start monitoring a site after successful OTA deployment.
   * Called from deploy-progress.handler when update completes.
   */
  startWatch(deploymentId: string, siteId: string, targetVersion: string): void {
    const key = `${deploymentId}:${siteId}`;

    // Don't duplicate watches
    if (this.activeWatches.has(key)) {
      logger.info('Canary watch already active, skipping', { deploymentId, siteId });
      return;
    }

    const now = Date.now();
    const watch: CanaryWatch = {
      deploymentId,
      siteId,
      targetVersion,
      startedAt: now,
      expiresAt: now + CANARY_WINDOW_MS,
      lastCheckAt: 0,
      offlineCount: 0,
      resolved: false,
    };

    this.activeWatches.set(key, watch);

    logger.info('Canary watch started', {
      deploymentId,
      siteId,
      targetVersion,
      windowMs: CANARY_WINDOW_MS,
    });

    // Ensure the periodic checker is running
    this.ensureCheckerRunning();
  }

  /**
   * Periodic check — called by alerting.service or internal timer.
   * Evaluates all active canary watches.
   */
  async runChecks(): Promise<void> {
    if (this.activeWatches.size === 0) return;

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, watch] of this.activeWatches.entries()) {
      if (watch.resolved) {
        expiredKeys.push(key);
        continue;
      }

      // Expired: canary window completed without issues
      if (now > watch.expiresAt) {
        await this.resolveWatch(key, watch, 'passed');
        expiredKeys.push(key);
        continue;
      }

      // Run health check
      await this.checkSiteHealth(key, watch);
      watch.lastCheckAt = now;
    }

    // Clean up expired watches
    for (const key of expiredKeys) {
      this.activeWatches.delete(key);
    }

    // Stop the checker if no more watches
    if (this.activeWatches.size === 0) {
      this.stopChecker();
    }
  }

  /**
   * Get active canary watches (for dashboard display).
   */
  getActiveWatches(): CanaryWatch[] {
    return Array.from(this.activeWatches.values()).filter(w => !w.resolved);
  }

  /**
   * Force-expire all watches for a deployment (e.g. manual rollback).
   */
  cancelWatch(deploymentId: string): void {
    for (const [key, watch] of this.activeWatches.entries()) {
      if (watch.deploymentId === deploymentId) {
        watch.resolved = true;
        logger.info('Canary watch cancelled', { deploymentId, siteId: watch.siteId });
      }
    }
  }

  // ─────────────────────── Internal ───────────────────────

  private async checkSiteHealth(key: string, watch: CanaryWatch): Promise<void> {
    try {
      // 1. Check if site is still online (last_seen_at within threshold)
      const siteResult = await query<{
        status: string;
        last_seen_at: Date | null;
        software_version: string | null;
      }>(
        `SELECT status, last_seen_at, software_version
         FROM sites WHERE id = $1`,
        [watch.siteId]
      );

      if (siteResult.rows.length === 0) {
        logger.warn('Canary: site not found', { siteId: watch.siteId });
        return;
      }

      const site = siteResult.rows[0];
      const lastSeenMs = site.last_seen_at
        ? Date.now() - new Date(site.last_seen_at).getTime()
        : Infinity;

      // 2. Check offline status
      if (site.status === 'offline' || lastSeenMs > 90000) {
        watch.offlineCount++;

        // Allow 1 offline check (reboot grace period after OTA)
        // Alert on 2+ consecutive offline checks
        if (watch.offlineCount >= 2) {
          await this.createCanaryAlert(watch, 'site_offline', {
            message: `Site went offline ${watch.offlineCount} checks after OTA (last seen ${Math.round(lastSeenMs / 1000)}s ago)`,
            lastSeenMs,
          });
        } else {
          logger.info('Canary: site offline (grace period)', {
            siteId: watch.siteId,
            offlineCount: watch.offlineCount,
            lastSeenMs,
          });
        }
        return;
      }

      // Site is online — reset offline counter
      watch.offlineCount = 0;

      // 3. Check version matches target
      if (site.software_version && watch.targetVersion) {
        const versionMatch = site.software_version === watch.targetVersion;
        if (!versionMatch) {
          // Version mismatch could mean rollback happened on the Pi
          await this.createCanaryAlert(watch, 'version_mismatch', {
            message: `Version mismatch after OTA: expected ${watch.targetVersion}, got ${site.software_version}`,
            expectedVersion: watch.targetVersion,
            actualVersion: site.software_version,
          });
        }
      }

      // 4. Check for recent crash-loops (service restarts in the last 5 min)
      // Uses the heartbeat data — if site went offline→online multiple times
      const recentDisconnects = await query<{ disconnect_count: string }>(
        `SELECT COUNT(*) as disconnect_count
         FROM site_connection_events
         WHERE site_id = $1
           AND event_type = 'disconnect'
           AND created_at > NOW() - INTERVAL '5 minutes'`,
        [watch.siteId]
      ).catch(() => ({ rows: [{ disconnect_count: '0' }] }));

      const disconnectCount = parseInt(recentDisconnects.rows[0]?.disconnect_count || '0', 10);
      if (disconnectCount >= 3) {
        await this.createCanaryAlert(watch, 'crash_loop', {
          message: `Possible crash-loop: ${disconnectCount} disconnects in 5 minutes after OTA`,
          disconnectCount,
        });
      }
    } catch (error) {
      // Don't crash the periodic loop — log and continue
      logger.error('Canary health check error', {
        siteId: watch.siteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async createCanaryAlert(
    watch: CanaryWatch,
    reason: string,
    details: { message: string; [key: string]: unknown }
  ): Promise<void> {
    try {
      // Deduplication: don't create if same alert already active
      const exists = await alertRepository.existsActive(watch.siteId, CANARY_ALERT_TYPE);
      if (exists) {
        logger.info('Canary alert already active, skipping', {
          siteId: watch.siteId,
          reason,
        });
        return;
      }

      await alertRepository.create({
        site_id: watch.siteId,
        alert_type: CANARY_ALERT_TYPE,
        severity: 'critical',
        message: details.message,
        metadata: {
          deploymentId: watch.deploymentId,
          targetVersion: watch.targetVersion,
          reason,
          canaryStartedAt: new Date(watch.startedAt).toISOString(),
          ...details,
        },
      });

      logger.warn('Canary alert created', {
        siteId: watch.siteId,
        deploymentId: watch.deploymentId,
        reason,
        message: details.message,
      });

      // Mark watch as resolved (alert created = done monitoring)
      watch.resolved = true;
    } catch (error) {
      logger.error('Failed to create canary alert', {
        siteId: watch.siteId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveWatch(key: string, watch: CanaryWatch, result: 'passed' | 'failed'): Promise<void> {
    watch.resolved = true;

    if (result === 'passed') {
      // Resolve any active canary alerts for this site (false positive)
      await alertRepository.resolveAllByType(watch.siteId, CANARY_ALERT_TYPE).catch(() => 0);

      logger.info('Canary watch passed', {
        deploymentId: watch.deploymentId,
        siteId: watch.siteId,
        targetVersion: watch.targetVersion,
        durationMs: Date.now() - watch.startedAt,
      });
    }
  }

  private ensureCheckerRunning(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(async () => {
      try {
        await this.runChecks();
      } catch (error) {
        logger.error('Canary monitor periodic check error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, CANARY_CHECK_INTERVAL_MS);

    logger.info('Canary monitor checker started', { intervalMs: CANARY_CHECK_INTERVAL_MS });
  }

  private stopChecker(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      logger.info('Canary monitor checker stopped (no active watches)');
    }
  }
}

export const canaryMonitorService = new CanaryMonitorService();
export default canaryMonitorService;
