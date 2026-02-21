/**
 * Service de métriques Prometheus
 * Expose des métriques pour le monitoring avec Prometheus/Grafana
 */

import {
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

const filenameEncodingCorrections = new Counter({
  name: 'neopro_filename_encoding_corrections_total',
  help: 'Total number of filename encoding corrections (multer latin1 to UTF-8)',
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

const dbSizeBytesGauge = new Gauge({
  name: 'neopro_db_size_bytes',
  help: 'Total database size in bytes (pg_database_size)',
  registers: [register],
});

const dbTableSizeBytesGauge = new Gauge({
  name: 'neopro_db_table_size_bytes',
  help: 'Total relation size per table in bytes (top tables only)',
  labelNames: ['table'],
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

const websocketDisconnectsTotal = new Counter({
  name: 'neopro_websocket_disconnects_total',
  help: 'Total WebSocket disconnections by reason and client type',
  labelNames: ['reason', 'client_type'],
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

// ============= Métriques FTP/Storage =============

const ftpOperationsTotal = new Counter({
  name: 'neopro_ftp_operations_total',
  help: 'Total FTP operations (upload, delete, verify)',
  labelNames: ['operation', 'status', 'storage_type'],
  registers: [register],
});

const ftpOperationDuration = new Histogram({
  name: 'neopro_ftp_operation_duration_seconds',
  help: 'Duration of FTP operations in seconds',
  labelNames: ['operation', 'storage_type'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

const ftpRetriesTotal = new Counter({
  name: 'neopro_ftp_retries_total',
  help: 'Total FTP retry attempts',
  labelNames: ['operation', 'storage_type'],
  registers: [register],
});

const ftpUploadBytesTotal = new Counter({
  name: 'neopro_ftp_upload_bytes_total',
  help: 'Total bytes uploaded to FTP',
  labelNames: ['storage_type'],
  registers: [register],
});

// ============= Métriques Sync Agent (côté central) =============

const syncOperationsTotal = new Counter({
  name: 'neopro_sync_operations_total',
  help: 'Total sync operations received from Pi agents',
  labelNames: ['type', 'status'],
  registers: [register],
});

const configDriftTotal = new Counter({
  name: 'neopro_config_drift_total',
  help: 'Total config drift detections (Pi config hash mismatch)',
  registers: [register],
});

const configSyncPendingGauge = new Gauge({
  name: 'neopro_config_sync_pending',
  help: 'Number of sites with pending config deployments',
  registers: [register],
});

// ============= Métriques Rate Limiting =============

const rateLimitHitsTotal = new Counter({
  name: 'neopro_rate_limit_hits_total',
  help: 'Total rate limit violations (429 responses)',
  labelNames: ['limiter', 'key_type'],
  registers: [register],
});

const rateLimitNearExhaustionTotal = new Counter({
  name: 'neopro_rate_limit_near_exhaustion_total',
  help: 'Total requests where rate limit was >80% consumed',
  labelNames: ['limiter'],
  registers: [register],
});

// ============= Métriques Memory Manager =============

const memoryHeapUsageGauge = new Gauge({
  name: 'neopro_memory_heap_usage_percent',
  help: 'Current heap usage as percentage (0-100)',
  registers: [register],
});

const memoryPressureEventsTotal = new Counter({
  name: 'neopro_memory_pressure_events_total',
  help: 'Total memory pressure events by severity',
  labelNames: ['severity'],
  registers: [register],
});

const memoryGcRunsTotal = new Counter({
  name: 'neopro_memory_gc_runs_total',
  help: 'Total forced garbage collection runs',
  registers: [register],
});

const memoryGcFreedBytes = new Counter({
  name: 'neopro_memory_gc_freed_bytes',
  help: 'Total bytes freed by forced garbage collection',
  registers: [register],
});

// ============= Métriques Predictive Alerts =============

const predictiveChecksTotal = new Counter({
  name: 'neopro_predictive_checks_total',
  help: 'Total predictive alert check runs',
  labelNames: ['status'],
  registers: [register],
});

const predictiveAlertsGeneratedTotal = new Counter({
  name: 'neopro_predictive_alerts_generated_total',
  help: 'Total predictive alerts generated',
  registers: [register],
});

const predictiveCheckDuration = new Histogram({
  name: 'neopro_predictive_check_duration_seconds',
  help: 'Duration of predictive alert checks in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

const predictiveSitesCheckedGauge = new Gauge({
  name: 'neopro_predictive_sites_checked',
  help: 'Number of sites checked in last predictive run',
  registers: [register],
});

// ============= Métriques Subscriptions/Billing =============

const subscriptionStatusGauge = new Gauge({
  name: 'neopro_subscription_status',
  help: 'Number of sites by subscription status',
  labelNames: ['status'],
  registers: [register],
});

const subscriptionPlanGauge = new Gauge({
  name: 'neopro_subscription_plan',
  help: 'Number of sites by subscription plan',
  labelNames: ['plan'],
  registers: [register],
});

// ============= Métriques Réseau Pi =============

const siteNetworkTypeGauge = new Gauge({
  name: 'neopro_site_network_type',
  help: 'Network connection type per site (1=active for that type)',
  labelNames: ['connection_type'],
  registers: [register],
});

const siteStabilityScoreGauge = new Gauge({
  name: 'neopro_site_stability_score',
  help: 'Average network stability score across connected sites (0-100)',
  registers: [register],
});

const networkAlertsTotal = new Counter({
  name: 'neopro_network_alerts_total',
  help: 'Total network alerts from Pi watchdog',
  labelNames: ['type', 'severity'],
  registers: [register],
});

const networkRollbacksTotal = new Counter({
  name: 'neopro_network_rollbacks_total',
  help: 'Total network config rollbacks on Pi',
  labelNames: ['operation'],
  registers: [register],
});

const networkRecoveryAttemptsTotal = new Counter({
  name: 'neopro_network_recovery_attempts_total',
  help: 'Total auto-recovery attempts by Pi watchdog',
  registers: [register],
});

const heartbeatsTotal = new Counter({
  name: 'neopro_heartbeats_total',
  help: 'Total heartbeats received from Pi sites',
  registers: [register],
});

// ============= Métriques Video Transition =============

const videoTransitionEarlySwitchTotal = new Counter({
  name: 'neopro_video_transition_early_switch_total',
  help: 'Total early switch transitions (happy path, no black hole)',
  registers: [register],
});

const videoTransitionSafetyTimeoutTotal = new Counter({
  name: 'neopro_video_transition_safety_timeout_total',
  help: 'Total safety timeout triggers (potential black hole)',
  registers: [register],
});

const videoTransitionCleanupSkippedTotal = new Counter({
  name: 'neopro_video_transition_cleanup_skipped_total',
  help: 'Total cleanup skips on short videos (<5s)',
  registers: [register],
});

const videoTransitionErrorTotal = new Counter({
  name: 'neopro_video_transition_error_total',
  help: 'Total video player errors during transitions',
  registers: [register],
});

const videoTransitionsTotal = new Counter({
  name: 'neopro_video_transitions_total',
  help: 'Total video transitions attempted',
  registers: [register],
});

// ============= Métriques License Push =============

const licenseStatusPushesTotal = new Counter({
  name: 'neopro_license_status_pushes_total',
  help: 'Total license status pushes to Pi sites',
  labelNames: ['status'],
  registers: [register],
});

// ============= Métriques Deploy Progress =============

const deployProgressEventsTotal = new Counter({
  name: 'neopro_deploy_progress_events_total',
  help: 'Total deploy progress events received from Pi',
  labelNames: ['type', 'status'],
  registers: [register],
});

// ============= Métriques OTA Errors =============

const otaErrorsTotal = new Counter({
  name: 'neopro_ota_errors_total',
  help: 'Total OTA deployment errors by error type',
  labelNames: ['error_type'],
  registers: [register],
});

// ============= Métriques WiFi Configuration =============

const wifiConfigTotal = new Counter({
  name: 'neopro_wifi_config_total',
  help: 'Total WiFi client configuration operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// ============= Métriques Pi Agent Auth =============

const piAgentAuthTotal = new Counter({
  name: 'neopro_pi_agent_auth_total',
  help: 'Total Pi agent authentication attempts via WebSocket',
  labelNames: ['status', 'reason'],
  registers: [register],
});

// ============= Métriques Fan Pi =============

const fanPresentGauge = new Gauge({
  name: 'neopro_fan_present',
  help: 'Whether a fan cooling device is detected on Pi (1=yes, 0=no)',
  registers: [register],
});

const fanStateGauge = new Gauge({
  name: 'neopro_fan_state',
  help: 'Current fan cooling state (0=off, max depends on model)',
  registers: [register],
});

const fanFailuresTotal = new Counter({
  name: 'neopro_fan_failures_total',
  help: 'Total fan failure alerts (fan off at high temperature)',
  registers: [register],
});

// ============= Métriques Kiosk =============

const kioskStatusGauge = new Gauge({
  name: 'neopro_kiosk_status',
  help: 'Kiosk Chromium status (1=running, 0=crashed)',
  registers: [register],
});

const kioskRestartCountGauge = new Gauge({
  name: 'neopro_kiosk_restart_count',
  help: 'Number of recent kiosk Chromium restarts',
  registers: [register],
});

const kioskCrashesTotal = new Counter({
  name: 'neopro_kiosk_crashes_total',
  help: 'Total kiosk Chromium crashes detected',
  registers: [register],
});

// ============= Métriques Report Generation =============

const sponsorSyncTotal = new Counter({
  name: 'neopro_sponsor_sync_total',
  help: 'Total sponsor sync operations included in config deployments',
  labelNames: ['status'],
  registers: [register],
});

const sponsorSyncCount = new Histogram({
  name: 'neopro_sponsor_sync_count',
  help: 'Number of sponsors synced per deployment',
  buckets: [0, 1, 2, 5, 10, 20, 50],
  registers: [register],
});

const impressionResolutionTotal = new Counter({
  name: 'neopro_impression_resolution_total',
  help: 'Impression sponsor resolution attempts by method',
  labelNames: ['method'],  // 'site_sponsor_id' | 'video_id' | 'filename' | 'unresolved'
  registers: [register],
});

const sponsorResolutionFailuresTotal = new Counter({
  name: 'neopro_sponsor_resolution_failures_total',
  help: 'Failed sponsor resolution attempts (sync or impressions)',
  labelNames: ['operation'],  // 'resolve_local' | 'resolve_impression' | 'sync_videos'
  registers: [register],
});

const reportGenerationsTotal = new Counter({
  name: 'neopro_report_generations_total',
  help: 'Total PDF report generation attempts',
  labelNames: ['report_type', 'status'],
  registers: [register],
});

const reportGenerationDuration = new Histogram({
  name: 'neopro_report_generation_duration_seconds',
  help: 'Duration of PDF report generation in seconds',
  labelNames: ['report_type'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// ============= Métriques FK Fallback (video_plays) =============

const videoPlaysFkFallbackTotal = new Counter({
  name: 'neopro_video_plays_fk_fallback_total',
  help: 'Video plays where a FK reference was nullified because the target row was missing',
  labelNames: ['column'],  // 'sponsor_id' | 'video_id' | 'session_id'
  registers: [register],
});

// ============= Métriques Sponsor Health (F-AUD-07) =============

const sponsorHealthCheckTotal = new Counter({
  name: 'neopro_sponsor_health_check_total',
  help: 'Total sponsor health check runs (manual or automated)',
  labelNames: ['trigger'],  // 'manual' | 'automated'
  registers: [register],
});

const sponsorHealthEntriesGauge = new Gauge({
  name: 'neopro_sponsor_health_entries',
  help: 'Current sponsor health matrix entries by status',
  labelNames: ['status'],  // 'healthy' | 'warning' | 'critical'
  registers: [register],
});

const sponsorHealthAlertsCreatedTotal = new Counter({
  name: 'neopro_sponsor_health_alerts_created_total',
  help: 'Total proactive sponsor alerts created from health checks',
  registers: [register],
});

const sponsorHealthCheckDuration = new Histogram({
  name: 'neopro_sponsor_health_check_duration_seconds',
  help: 'Duration of sponsor health check in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
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

  recordSponsorSync(status: string, count: number): void {
    sponsorSyncTotal.inc({ status });
    sponsorSyncCount.observe(count);
  }

  recordImpressionResolution(method: 'site_sponsor_id' | 'video_id' | 'filename' | 'unresolved'): void {
    impressionResolutionTotal.inc({ method });
  }

  recordSponsorResolutionFailure(operation: 'resolve_local' | 'resolve_impression' | 'sync_videos'): void {
    sponsorResolutionFailuresTotal.inc({ operation });
  }

  recordVideoPlaysFkFallback(column: 'sponsor_id' | 'video_id' | 'session_id', count: number): void {
    videoPlaysFkFallbackTotal.inc({ column }, count);
  }

  recordVideoUpload(status: string, sizeBytes?: number): void {
    videoUploadsTotal.inc({ status });
    if (sizeBytes) {
      videoUploadSize.observe(sizeBytes);
    }
  }

  recordFilenameEncodingCorrection(): void {
    filenameEncodingCorrections.inc();
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

  recordDbSize(totalBytes: number): void {
    dbSizeBytesGauge.set(totalBytes);
  }

  recordDbTableSize(table: string, totalBytes: number): void {
    dbTableSizeBytesGauge.set({ table }, totalBytes);
  }

  recordWebsocketConnection(type: string, count: number): void {
    websocketConnectionsGauge.set({ type }, count);
  }

  recordWebsocketMessage(direction: 'inbound' | 'outbound', type: string): void {
    websocketMessagesTotal.inc({ direction, type });
  }

  recordSocketDisconnect(reason: string, clientType: 'agent' | 'dashboard' | 'unknown'): void {
    websocketDisconnectsTotal.inc({ reason, client_type: clientType });
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

  // ============= Méthodes FTP/Storage =============

  recordFtpOperation(operation: string, status: string, storageType: string, durationSeconds?: number): void {
    ftpOperationsTotal.inc({ operation, status, storage_type: storageType });
    if (durationSeconds !== undefined) {
      ftpOperationDuration.observe({ operation, storage_type: storageType }, durationSeconds);
    }
  }

  recordFtpRetry(operation: string, storageType: string): void {
    ftpRetriesTotal.inc({ operation, storage_type: storageType });
  }

  recordFtpUploadBytes(storageType: string, bytes: number): void {
    ftpUploadBytesTotal.inc({ storage_type: storageType }, bytes);
  }

  // ============= Méthodes Sync Agent =============

  recordSyncOperation(type: string, status: string): void {
    syncOperationsTotal.inc({ type, status });
  }

  recordConfigDrift(): void {
    configDriftTotal.inc();
  }

  recordConfigSyncPending(count: number): void {
    configSyncPendingGauge.set(count);
  }

  // ============= Méthodes Rate Limiting =============

  recordRateLimitHit(limiter: string, keyType: string): void {
    rateLimitHitsTotal.inc({ limiter, key_type: keyType });
  }

  recordRateLimitNearExhaustion(limiter: string): void {
    rateLimitNearExhaustionTotal.inc({ limiter });
  }

  // ============= Méthodes Memory Manager =============

  recordHeapUsage(percent: number): void {
    memoryHeapUsageGauge.set(percent);
  }

  recordMemoryPressureEvent(severity: 'warning' | 'critical' | 'emergency'): void {
    memoryPressureEventsTotal.inc({ severity });
  }

  recordGcRun(freedBytes: number): void {
    memoryGcRunsTotal.inc();
    if (freedBytes > 0) {
      memoryGcFreedBytes.inc(freedBytes);
    }
  }

  // ============= Méthodes Predictive Alerts =============

  recordPredictiveCheck(status: 'success' | 'failed', sitesChecked: number, alertsGenerated: number, durationSeconds: number): void {
    predictiveChecksTotal.inc({ status });
    predictiveSitesCheckedGauge.set(sitesChecked);
    if (alertsGenerated > 0) {
      predictiveAlertsGeneratedTotal.inc(alertsGenerated);
    }
    predictiveCheckDuration.observe(durationSeconds);
  }

  // ============= Méthodes Subscriptions/Billing =============

  recordSubscriptionStats(stats: {
    active: number;
    expiring_soon: number;
    grace_period: number;
    blocked: number;
    suspended: number;
  }): void {
    subscriptionStatusGauge.set({ status: 'active' }, stats.active);
    subscriptionStatusGauge.set({ status: 'expiring_soon' }, stats.expiring_soon);
    subscriptionStatusGauge.set({ status: 'grace_period' }, stats.grace_period);
    subscriptionStatusGauge.set({ status: 'blocked' }, stats.blocked);
    subscriptionStatusGauge.set({ status: 'suspended' }, stats.suspended);
  }

  recordSubscriptionPlans(plans: {
    trial: number;
    standard: number;
    premium: number;
  }): void {
    subscriptionPlanGauge.set({ plan: 'trial' }, plans.trial);
    subscriptionPlanGauge.set({ plan: 'standard' }, plans.standard);
    subscriptionPlanGauge.set({ plan: 'premium' }, plans.premium);
  }

  // ============= Méthodes réseau Pi =============

  recordSiteNetworkTypes(typeCounts: Record<string, number>): void {
    // Reset all to 0, then set actuals
    siteNetworkTypeGauge.reset();
    for (const [connectionType, count] of Object.entries(typeCounts)) {
      siteNetworkTypeGauge.set({ connection_type: connectionType }, count);
    }
  }

  recordSiteStabilityScore(avgScore: number): void {
    siteStabilityScoreGauge.set(avgScore);
  }

  recordNetworkAlert(type: string, severity: string): void {
    networkAlertsTotal.inc({ type, severity });
  }

  recordNetworkRollback(operation: string): void {
    networkRollbacksTotal.inc({ operation });
  }

  recordNetworkRecoveryAttempts(count: number): void {
    for (let i = 0; i < count; i++) {
      networkRecoveryAttemptsTotal.inc();
    }
  }

  recordHeartbeat(): void {
    heartbeatsTotal.inc();
  }

  recordKioskStatus(alive: number, restartCount: number): void {
    kioskStatusGauge.set(alive);
    kioskRestartCountGauge.set(restartCount);
  }

  recordKioskCrash(): void {
    kioskCrashesTotal.inc();
  }

  // ============= Méthodes Fan Pi =============

  recordFanStatus(present: boolean, curState: number | null): void {
    fanPresentGauge.set(present ? 1 : 0);
    if (curState !== null) {
      fanStateGauge.set(curState);
    }
  }

  recordFanFailure(): void {
    fanFailuresTotal.inc();
  }

  // ============= Méthodes License Push =============

  recordLicenseStatusPush(status: 'success' | 'failed'): void {
    licenseStatusPushesTotal.inc({ status });
  }

  // ============= Méthodes Deploy Progress =============

  recordDeployProgressEvent(type: 'content' | 'update', status: string): void {
    deployProgressEventsTotal.inc({ type, status });
  }

  // ============= Méthodes OTA Errors =============

  recordOtaError(errorType: string): void {
    otaErrorsTotal.inc({ error_type: errorType });
  }

  // ============= Méthodes Pi Agent Auth =============

  recordPiAgentAuth(status: 'success' | 'failure', reason?: string): void {
    piAgentAuthTotal.inc({ status, reason: reason || 'none' });
  }

  // ============= Méthodes WiFi Configuration =============

  recordWifiConfig(operation: 'scan' | 'connect', status: 'success' | 'failed'): void {
    wifiConfigTotal.inc({ operation, status });
  }

  // ============= Méthodes Video Transition =============

  recordTransitionMetrics(metrics: { earlySwitchCount?: number; safetyTimeoutCount?: number; cleanupSkippedCount?: number; videoErrorCount?: number; totalTransitions?: number } | null | undefined): void {
    if (!metrics) return;
    if (metrics.earlySwitchCount) videoTransitionEarlySwitchTotal.inc(metrics.earlySwitchCount);
    if (metrics.safetyTimeoutCount) videoTransitionSafetyTimeoutTotal.inc(metrics.safetyTimeoutCount);
    if (metrics.cleanupSkippedCount) videoTransitionCleanupSkippedTotal.inc(metrics.cleanupSkippedCount);
    if (metrics.videoErrorCount) videoTransitionErrorTotal.inc(metrics.videoErrorCount);
    if (metrics.totalTransitions) videoTransitionsTotal.inc(metrics.totalTransitions);
  }

  // ============= Méthodes Report Generation =============

  recordReportGeneration(reportType: 'club' | 'advertiser' | 'site_sponsor', status: 'success' | 'failed', durationSeconds?: number): void {
    reportGenerationsTotal.inc({ report_type: reportType, status });
    if (durationSeconds !== undefined) {
      reportGenerationDuration.observe({ report_type: reportType }, durationSeconds);
    }
  }

  // ============= Méthodes Sponsor Health (F-AUD-07) =============

  recordSponsorHealthCheck(trigger: 'manual' | 'automated', healthy: number, warning: number, critical: number, alertsCreated: number, durationSeconds: number): void {
    sponsorHealthCheckTotal.inc({ trigger });
    sponsorHealthEntriesGauge.set({ status: 'healthy' }, healthy);
    sponsorHealthEntriesGauge.set({ status: 'warning' }, warning);
    sponsorHealthEntriesGauge.set({ status: 'critical' }, critical);
    if (alertsCreated > 0) {
      sponsorHealthAlertsCreatedTotal.inc(alertsCreated);
    }
    sponsorHealthCheckDuration.observe(durationSeconds);
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
