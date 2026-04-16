/**
 * Memory Manager Service
 * Monitors memory usage and triggers cleanup when pressure is high
 */

import v8 from 'v8';
import logger from '../config/logger';

// Lazy import to avoid circular dependency with metrics.service
let metricsServiceInstance: {
  recordHeapUsage: (percent: number) => void;
  recordMemoryPressureEvent: (severity: 'warning' | 'critical' | 'emergency') => void;
  recordGcRun: (freedBytes: number) => void;
} | null = null;
const getMetricsService = () => {
  if (!metricsServiceInstance) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      metricsServiceInstance = require('./metrics.service').default;
    } catch {
      // Metrics service not available yet during startup
    }
  }
  return metricsServiceInstance;
};

// Configuration - Optimized for Railway (512MB heap via --max-old-space-size=512)
const MEMORY_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const HEAP_WARNING_THRESHOLD = 75; // Warn at 75% (~384MB of 512MB)
const HEAP_CRITICAL_THRESHOLD = 85; // Take action at 85% (~435MB)
const HEAP_EMERGENCY_THRESHOLD = 93; // Emergency at 93% (~475MB)

interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  heapUsagePercent: number;
  rssMB: number;
  externalMB: number;
}

type CleanupCallback = () => void | Promise<void>;

class MemoryManagerService {
  private checkInterval: NodeJS.Timeout | null = null;
  private cleanupCallbacks: CleanupCallback[] = [];
  private lastWarningTime = 0;
  private warningCooldownMs = 5 * 60 * 1000; // 5 minutes cooldown between warnings

  /**
   * Starts the memory monitoring
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    this.checkInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, MEMORY_CHECK_INTERVAL_MS);

    logger.info('Memory manager service started', {
      checkIntervalMs: MEMORY_CHECK_INTERVAL_MS,
      warningThreshold: HEAP_WARNING_THRESHOLD,
      criticalThreshold: HEAP_CRITICAL_THRESHOLD,
      emergencyThreshold: HEAP_EMERGENCY_THRESHOLD,
    });
  }

  /**
   * Stops the memory monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Memory manager service stopped');
    }
  }

  /**
   * Registers a cleanup callback to be called when memory pressure is high
   */
  registerCleanupCallback(callback: CleanupCallback): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Gets current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    // Utiliser heap_size_limit (max V8, fixé par --max-old-space-size) et non
    // heapTotal (allocation courante qui grandit dynamiquement près de heapUsed
    // → ratio toujours ~90% même à faible usage réel, faux positifs emergency)
    const heapLimitMB = v8.getHeapStatistics().heap_size_limit / 1024 / 1024;

    return {
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      heapUsagePercent: Math.round((heapUsedMB / heapLimitMB) * 100 * 100) / 100,
      rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
    };
  }

  /**
   * Checks memory pressure and takes action if needed
   */
  private async checkMemoryPressure(): Promise<void> {
    const stats = this.getMemoryStats();
    const now = Date.now();

    // Always record heap usage for Prometheus
    getMetricsService()?.recordHeapUsage(stats.heapUsagePercent);

    if (stats.heapUsagePercent >= HEAP_EMERGENCY_THRESHOLD) {
      // Emergency: try everything
      logger.error('MEMORY EMERGENCY: Heap usage critical', {
        ...stats,
        threshold: HEAP_EMERGENCY_THRESHOLD,
      });
      getMetricsService()?.recordMemoryPressureEvent('emergency');

      await this.runCleanupCallbacks();
      this.forceGarbageCollection();

      // Check again after cleanup
      const afterStats = this.getMemoryStats();
      logger.warn('Memory status after emergency cleanup', afterStats);

    } else if (stats.heapUsagePercent >= HEAP_CRITICAL_THRESHOLD) {
      // Critical: run cleanup callbacks
      logger.warn('Memory pressure critical, running cleanup', {
        ...stats,
        threshold: HEAP_CRITICAL_THRESHOLD,
      });
      getMetricsService()?.recordMemoryPressureEvent('critical');

      await this.runCleanupCallbacks();
      this.forceGarbageCollection();

    } else if (stats.heapUsagePercent >= HEAP_WARNING_THRESHOLD) {
      // Warning: just log (with cooldown)
      if (now - this.lastWarningTime > this.warningCooldownMs) {
        logger.warn('Memory pressure elevated', {
          ...stats,
          threshold: HEAP_WARNING_THRESHOLD,
        });
        getMetricsService()?.recordMemoryPressureEvent('warning');
        this.lastWarningTime = now;
      }
    }
  }

  /**
   * Runs all registered cleanup callbacks
   */
  private async runCleanupCallbacks(): Promise<void> {
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        logger.error('Error in memory cleanup callback:', { error });
      }
    }
  }

  /**
   * Forces garbage collection if available (requires --expose-gc flag)
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      const before = this.getMemoryStats();
      global.gc();
      const after = this.getMemoryStats();

      const freedMB = Math.round((before.heapUsedMB - after.heapUsedMB) * 100) / 100;
      const freedBytes = Math.max(0, Math.round((before.heapUsedMB - after.heapUsedMB) * 1024 * 1024));

      logger.info('Forced garbage collection', {
        heapBefore: before.heapUsedMB,
        heapAfter: after.heapUsedMB,
        freedMB,
      });

      getMetricsService()?.recordGcRun(freedBytes);
    } else {
      logger.debug('Garbage collection not available (run with --expose-gc to enable)');
    }
  }

  /**
   * Manually triggers a memory check and cleanup
   */
  async forceCheck(): Promise<MemoryStats> {
    await this.checkMemoryPressure();
    return this.getMemoryStats();
  }
}

export const memoryManagerService = new MemoryManagerService();
export default memoryManagerService;
