/**
 * Service de métriques Prometheus
 * Expose des métriques pour le monitoring avec Prometheus/Grafana
 */

import client, {
  Registry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  collectDefaultMetrics,
} from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

// Créer un registre personnalisé
const register = new Registry();

// Ajouter les métriques par défaut (CPU, mémoire, etc.)
collectDefaultMetrics({ register });

// ============= Métriques HTTP =============

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsInProgress = new Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently in progress',
  labelNames: ['method'],
  registers: [register],
});

// ============= Métriques Business =============

const connectedSitesGauge = new Gauge({
  name: 'neopro_connected_sites_total',
  help: 'Number of currently connected sites',
  registers: [register],
});

const deploymentsTotal = new Counter({
  name: 'neopro_deployments_total',
  help: 'Total number of content deployments',
  labelNames: ['status', 'target_type'],
  registers: [register],
});

const deploymentDuration = new Histogram({
  name: 'neopro_deployment_duration_seconds',
  help: 'Duration of content deployments in seconds',
  labelNames: ['target_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

const videoUploadsTotal = new Counter({
  name: 'neopro_video_uploads_total',
  help: 'Total number of video uploads',
  labelNames: ['status'],
  registers: [register],
});

const videoUploadSize = new Summary({
  name: 'neopro_video_upload_bytes',
  help: 'Size of uploaded videos in bytes',
  percentiles: [0.5, 0.9, 0.99],
  registers: [register],
});

const alertsTotal = new Counter({
  name: 'neopro_alerts_total',
  help: 'Total number of alerts generated',
  labelNames: ['severity', 'type'],
  registers: [register],
});

const activeAlertsGauge = new Gauge({
  name: 'neopro_active_alerts',
  help: 'Number of currently active alerts',
  labelNames: ['severity'],
  registers: [register],
});

const commandsTotal = new Counter({
  name: 'neopro_commands_total',
  help: 'Total number of remote commands sent',
  labelNames: ['type', 'status'],
  registers: [register],
});

const commandLatency = new Histogram({
  name: 'neopro_command_latency_seconds',
  help: 'Latency of remote commands in seconds',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// ============= Métriques Database =============

const dbQueryDuration = new Histogram({
  name: 'neopro_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

const dbConnectionsGauge = new Gauge({
  name: 'neopro_db_connections',
  help: 'Number of database connections',
  labelNames: ['state'],
  registers: [register],
});

// ============= Métriques WebSocket =============

const websocketConnectionsGauge = new Gauge({
  name: 'neopro_websocket_connections',
  help: 'Number of WebSocket connections',
  labelNames: ['type'],
  registers: [register],
});

const websocketMessagesTotal = new Counter({
  name: 'neopro_websocket_messages_total',
  help: 'Total WebSocket messages',
  labelNames: ['direction', 'type'],
  registers: [register],
});

// ============= Métriques Authentication =============

const authAttemptsTotal = new Counter({
  name: 'neopro_auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['status', 'mfa_used'],
  registers: [register],
});

const mfaSetupTotal = new Counter({
  name: 'neopro_mfa_setup_total',
  help: 'Total MFA setup attempts',
  labelNames: ['status'],
  registers: [register],
});

// ============= Métriques Canary Deployment =============

const canaryDeploymentsGauge = new Gauge({
  name: 'neopro_canary_deployments_active',
  help: 'Number of active canary deployments',
  labelNames: ['phase'],
  registers: [register],
});

const canaryRollbacksTotal = new Counter({
  name: 'neopro_canary_rollbacks_total',
  help: 'Total number of canary deployment rollbacks',
  registers: [register],
});

// ============= Service Class =============

class MetricsService {
  /**
   * Middleware Express pour collecter les métriques HTTP
   */
  httpMetricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const method = req.method;

      // Incrémenter les requêtes en cours
      httpRequestsInProgress.inc({ method });

      // Capturer la fin de la requête
      res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;
        const path = this.normalizePath(req.route?.path || req.path);
        const statusCode = res.statusCode.toString();

        // Enregistrer les métriques
        httpRequestsTotal.inc({ method, path, status_code: statusCode });
        httpRequestDuration.observe({ method, path, status_code: statusCode }, duration);
        httpRequestsInProgress.dec({ method });
      });

      next();
    };
  }

  /**
   * Normalise le path pour éviter les cardinalités élevées
   * Remplace les UUIDs et IDs par des placeholders
   */
  private normalizePath(path: string): string {
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id')
      .replace(/^\/api/, '');
  }

  /**
   * Retourne les métriques au format Prometheus
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Retourne le content-type pour Prometheus
   */
  getContentType(): string {
    return register.contentType;
  }

  // ============= Méthodes pour enregistrer les métriques =============

  recordConnectedSites(count: number): void {
    connectedSitesGauge.set(count);
  }

  recordDeployment(status: string, targetType: string): void {
    deploymentsTotal.inc({ status, target_type: targetType });
  }

  recordDeploymentDuration(targetType: string, durationSeconds: number): void {
    deploymentDuration.observe({ target_type: targetType }, durationSeconds);
  }

  recordVideoUpload(status: string, sizeBytes?: number): void {
    videoUploadsTotal.inc({ status });
    if (sizeBytes) {
      videoUploadSize.observe(sizeBytes);
    }
  }

  recordAlert(severity: string, type: string): void {
    alertsTotal.inc({ severity, type });
  }

  recordActiveAlerts(severity: string, count: number): void {
    activeAlertsGauge.set({ severity }, count);
  }

  recordCommand(type: string, status: string): void {
    commandsTotal.inc({ type, status });
  }

  recordCommandLatency(type: string, durationSeconds: number): void {
    commandLatency.observe({ type }, durationSeconds);
  }

  recordDbQuery(operation: string, durationSeconds: number): void {
    dbQueryDuration.observe({ operation }, durationSeconds);
  }

  recordDbConnections(active: number, idle: number): void {
    dbConnectionsGauge.set({ state: 'active' }, active);
    dbConnectionsGauge.set({ state: 'idle' }, idle);
  }

  recordWebsocketConnection(type: string, count: number): void {
    websocketConnectionsGauge.set({ type }, count);
  }

  recordWebsocketMessage(direction: 'inbound' | 'outbound', type: string): void {
    websocketMessagesTotal.inc({ direction, type });
  }

  recordAuthAttempt(status: 'success' | 'failure', mfaUsed: boolean): void {
    authAttemptsTotal.inc({ status, mfa_used: mfaUsed.toString() });
  }

  recordMfaSetup(status: 'success' | 'failure'): void {
    mfaSetupTotal.inc({ status });
  }

  recordCanaryDeployment(phase: string, count: number): void {
    canaryDeploymentsGauge.set({ phase }, count);
  }

  recordCanaryRollback(): void {
    canaryRollbacksTotal.inc();
  }

  /**
   * Réinitialise toutes les métriques (utile pour les tests)
   */
  resetMetrics(): void {
    register.resetMetrics();
    logger.info('Metrics reset');
  }
}

export const metricsService = new MetricsService();
export default metricsService;
