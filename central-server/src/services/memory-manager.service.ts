/**
 * Memory Manager Service
 * Monitors memory usage and triggers cleanup when pressure is high
 */

import logger from '../config/logger';

// Configuration
const MEMORY_CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const HEAP_WARNING_THRESHOLD = 75; // Warn at 75%
const HEAP_CRITICAL_THRESHOLD = 85; // Take action at 85%
const HEAP_EMERGENCY_THRESHOLD = 92; // Emergency at 92%

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
  private warningCooldownMs = 60 * 1000; // 1 minute cooldown between warnings

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

    return {
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100 * 100) / 100,
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

    if (stats.heapUsagePercent >= HEAP_EMERGENCY_THRESHOLD) {
      // Emergency: try everything
      logger.error('MEMORY EMERGENCY: Heap usage critical', {
        ...stats,
        threshold: HEAP_EMERGENCY_THRESHOLD,
      });

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

      await this.runCleanupCallbacks();
      this.forceGarbageCollection();

    } else if (stats.heapUsagePercent >= HEAP_WARNING_THRESHOLD) {
      // Warning: just log (with cooldown)
      if (now - this.lastWarningTime > this.warningCooldownMs) {
        logger.warn('Memory pressure elevated', {
          ...stats,
          threshold: HEAP_WARNING_THRESHOLD,
        });
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

      logger.info('Forced garbage collection', {
        heapBefore: before.heapUsedMB,
        heapAfter: after.heapUsedMB,
        freedMB: Math.round((before.heapUsedMB - after.heapUsedMB) * 100) / 100,
      });
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
