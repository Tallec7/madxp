/**
 * Service de Health Check avancé
 * Vérifie l'état de toutes les dépendances du système
 */

import pool from '../config/database';
import socketService from './socket.service';
import logger from '../config/logger';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: DependencyCheck;
    redis?: DependencyCheck;
    websocket: DependencyCheck;
    storage?: DependencyCheck;
    memory: DependencyCheck;
    disk?: DependencyCheck;
  };
  summary: {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
  };
}

export interface LivenessResult {
  status: 'ok' | 'error';
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: boolean;
    websocket: boolean;
  };
}

class HealthService {
  private readonly startTime = Date.now();

  /**
   * Health check complet avec toutes les dépendances
   */
  async getHealth(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWebSocket(),
      this.checkMemory(),
    ]);

    const [database, redis, websocket, memory] = checks;

    const allChecks = [database, websocket, memory];
    if (redis) allChecks.push(redis);

    const summary = this.summarizeChecks(allChecks);
    const overallStatus = this.determineOverallStatus(allChecks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: (Date.now() - this.startTime) / 1000,
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database,
        redis: redis || undefined,
        websocket,
        memory,
      },
      summary,
    };
  }

  /**
   * Liveness probe - vérifie que le process est vivant
   */
  getLiveness(): LivenessResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe - vérifie que l'app est prête à recevoir du trafic
   */
  async getReadiness(): Promise<ReadinessResult> {
    const [dbReady, wsReady] = await Promise.all([
      this.isDatabaseReady(),
      this.isWebSocketReady(),
    ]);

    const isReady = dbReady && wsReady;

    return {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbReady,
        websocket: wsReady,
      },
    };
  }

  /**
   * Vérifie la connexion à la base de données
   */
  private async checkDatabase(): Promise<DependencyCheck> {
    const start = Date.now();

    try {
      const result = await pool.query('SELECT 1 as health, NOW() as server_time');
      const latency = Date.now() - start;

      // Déterminer le statut basé sur la latence
      let status: HealthStatus = 'healthy';
      let message: string | undefined;

      if (latency > 1000) {
        status = 'degraded';
        message = 'Latence élevée';
      } else if (latency > 5000) {
        status = 'unhealthy';
        message = 'Latence très élevée';
      }

      return {
        name: 'PostgreSQL',
        status,
        latencyMs: latency,
        message,
        details: {
          serverTime: result.rows[0].server_time,
        },
      };
    } catch (error) {
      return {
        name: 'PostgreSQL',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Vérifie la connexion Redis (si configurée)
   */
  private async checkRedis(): Promise<DependencyCheck | null> {
    if (!socketService.isRedisConnected()) {
      return null; // Redis non configuré
    }

    const start = Date.now();

    try {
      // Vérifier via le service socket
      const isConnected = socketService.isRedisConnected();
      const latency = Date.now() - start;

      return {
        name: 'Redis',
        status: isConnected ? 'healthy' : 'unhealthy',
        latencyMs: latency,
        message: isConnected ? undefined : 'Not connected',
      };
    } catch (error) {
      return {
        name: 'Redis',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Check failed',
      };
    }
  }

  /**
   * Vérifie le service WebSocket
   */
  private async checkWebSocket(): Promise<DependencyCheck> {
    const start = Date.now();

    try {
      const connectionCount = socketService.getConnectionCount();
      const latency = Date.now() - start;

      return {
        name: 'WebSocket',
        status: 'healthy',
        latencyMs: latency,
        details: {
          connectedSites: connectionCount,
          redisAdapter: socketService.isRedisConnected(),
        },
      };
    } catch (error) {
      return {
        name: 'WebSocket',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Check failed',
      };
    }
  }

  /**
   * Vérifie l'utilisation mémoire
   */
  private async checkMemory(): Promise<DependencyCheck> {
    const start = Date.now();

    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: HealthStatus = 'healthy';
    let message: string | undefined;

    if (heapUsagePercent > 90) {
      status = 'unhealthy';
      message = 'Heap memory critical';
    } else if (heapUsagePercent > 75) {
      status = 'degraded';
      message = 'Heap memory high';
    }

    // Vérifier RSS (mémoire totale du process)
    if (rssMB > 1024) { // > 1GB
      status = status === 'healthy' ? 'degraded' : status;
      message = message || 'High RSS memory usage';
    }

    return {
      name: 'Memory',
      status,
      latencyMs: Date.now() - start,
      message,
      details: {
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(heapTotalMB * 100) / 100,
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
        rssMB: Math.round(rssMB * 100) / 100,
        externalMB: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      },
    };
  }

  /**
   * Vérifie si la DB est prête
   */
  private async isDatabaseReady(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Vérifie si WebSocket est prêt
   */
  private async isWebSocketReady(): Promise<boolean> {
    try {
      socketService.getConnectionCount();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Résume les checks
   */
  private summarizeChecks(checks: DependencyCheck[]): HealthCheckResult['summary'] {
    return {
      totalChecks: checks.length,
      healthyChecks: checks.filter(c => c.status === 'healthy').length,
      degradedChecks: checks.filter(c => c.status === 'degraded').length,
      unhealthyChecks: checks.filter(c => c.status === 'unhealthy').length,
    };
  }

  /**
   * Détermine le statut global
   */
  private determineOverallStatus(checks: DependencyCheck[]): HealthStatus {
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
    const hasDegraded = checks.some(c => c.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }
}

export const healthService = new HealthService();
export default healthService;
