/**
 * Database Circuit Breaker
 *
 * Prevents death-spiral when Supabase/PgBouncer is temporarily unavailable.
 * Background services check `isAvailable()` before hitting the DB.
 * When the circuit is open, non-critical queries are skipped, letting the pool
 * recover and prioritizing user-facing requests (login, API calls).
 *
 * States:
 *   CLOSED  → DB is healthy, all queries pass through
 *   OPEN    → DB is failing, background queries are rejected
 *   HALF_OPEN → Cooldown elapsed, one probe query is allowed to test recovery
 */

import logger from '../config/logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** How long (ms) the circuit stays open before allowing a probe */
  cooldownMs: number;
  /** How long (ms) a single success run must last before fully closing */
  halfOpenProbeTimeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 30_000,        // 30 seconds
  halfOpenProbeTimeoutMs: 5_000,
};

class DbCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureAt = 0;
  private lastStateChangeAt = Date.now();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if background services should attempt DB queries.
   * User-facing requests should NOT use this guard — they should always try
   * and let the pool's connectionTimeout handle failures naturally.
   */
  isAvailable(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN': {
        const elapsed = Date.now() - this.lastFailureAt;
        if (elapsed >= this.config.cooldownMs) {
          this.transitionTo('HALF_OPEN');
          return true; // Allow one probe
        }
        return false;
      }

      case 'HALF_OPEN':
        // Only one probe at a time — subsequent calls are rejected until probe succeeds
        return false;

      default:
        return true;
    }
  }

  /**
   * Record a successful DB operation. Closes the circuit if in HALF_OPEN state.
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
      logger.info('DB circuit breaker CLOSED — database recovered', {
        previousFailures: this.consecutiveFailures,
      });
    }
    this.consecutiveFailures = 0;
  }

  /**
   * Record a failed DB operation. Opens the circuit after threshold is reached.
   */
  recordFailure(error?: Error): void {
    this.consecutiveFailures++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Probe failed — go back to OPEN
      this.transitionTo('OPEN');
      logger.warn('DB circuit breaker OPEN — probe query failed', {
        consecutiveFailures: this.consecutiveFailures,
        error: error?.message,
      });
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold && this.state === 'CLOSED') {
      this.transitionTo('OPEN');
      logger.warn('DB circuit breaker OPEN — background services paused', {
        consecutiveFailures: this.consecutiveFailures,
        cooldownMs: this.config.cooldownMs,
        error: error?.message,
      });
    }
  }

  /**
   * Wrap an async DB operation with circuit breaker logic.
   * Returns undefined if the circuit is open (caller should handle gracefully).
   */
  async guard<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (!this.isAvailable()) {
      return undefined;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Like guard() but swallows the error and returns undefined.
   * Ideal for background services that should just skip on failure.
   */
  async guardSilent<T>(label: string, operation: () => Promise<T>): Promise<T | undefined> {
    if (!this.isAvailable()) {
      logger.debug(`DB circuit breaker: skipping ${label} (circuit OPEN)`);
      return undefined;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : undefined);
      logger.warn(`DB circuit breaker: ${label} failed`, {
        error: error instanceof Error ? error.message : String(error),
        state: this.state,
        consecutiveFailures: this.consecutiveFailures,
      });
      return undefined;
    }
  }

  /** Current state for monitoring / health endpoints */
  getStatus(): { state: CircuitState; consecutiveFailures: number; lastFailureAt: number; lastStateChangeAt: number } {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAt: this.lastFailureAt,
      lastStateChangeAt: this.lastStateChangeAt,
    };
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeAt = Date.now();
    logger.debug('DB circuit breaker state transition', { from: oldState, to: newState });

    // Emit Prometheus metric (lazy import to avoid circular dep at startup)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const metricsService = require('./metrics.service').default;
      metricsService?.recordDbCircuitBreakerState?.(newState);
    } catch {
      // Metrics not available yet during startup
    }
  }
}

/** Singleton instance for the application */
export const dbCircuitBreaker = new DbCircuitBreaker();
export default dbCircuitBreaker;
