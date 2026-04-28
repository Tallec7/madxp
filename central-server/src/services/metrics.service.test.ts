/**
 * Tests pour le service de métriques Prometheus
 */

import { Request, Response, NextFunction } from 'express';

// Mock du logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import metricsService from './metrics.service';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.resetMetrics();
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const metrics = await metricsService.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
      // Vérifier que les métriques par défaut sont présentes
      expect(metrics).toContain('process_cpu');
      expect(metrics).toContain('nodejs_heap');
    });

    it('should include custom NEOPRO metrics', async () => {
      // Enregistrer quelques métriques
      metricsService.recordConnectedSites(5);
      metricsService.recordDeployment('completed', 'site');
      metricsService.recordVideoUpload('success', 1024 * 1024);

      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain('neopro_connected_sites_total');
      expect(metrics).toContain('neopro_deployments_total');
      expect(metrics).toContain('neopro_video_uploads_total');
    });
  });

  describe('getContentType', () => {
    it('should return correct content type for Prometheus', () => {
      const contentType = metricsService.getContentType();

      expect(contentType).toContain('text/plain');
    });
  });

  describe('recordConnectedSites', () => {
    it('should update connected sites gauge', async () => {
      metricsService.recordConnectedSites(10);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_connected_sites_total 10');
    });

    it('should update to new value', async () => {
      metricsService.recordConnectedSites(10);
      metricsService.recordConnectedSites(5);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_connected_sites_total 5');
    });
  });

  describe('recordDeployment', () => {
    it('should increment deployment counter with labels', async () => {
      metricsService.recordDeployment('completed', 'site');
      metricsService.recordDeployment('completed', 'site');
      metricsService.recordDeployment('failed', 'group');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_deployments_total');
      expect(metrics).toContain('status="completed"');
      expect(metrics).toContain('target_type="site"');
    });
  });

  describe('recordDeploymentDuration', () => {
    it('should record deployment duration histogram', async () => {
      metricsService.recordDeploymentDuration('site', 30.5);
      metricsService.recordDeploymentDuration('group', 120.0);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_deployment_duration_seconds');
    });
  });

  describe('recordVideoUpload', () => {
    it('should increment upload counter and record size', async () => {
      metricsService.recordVideoUpload('success', 5 * 1024 * 1024);
      metricsService.recordVideoUpload('success', 10 * 1024 * 1024);
      metricsService.recordVideoUpload('failure');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_video_uploads_total');
      expect(metrics).toContain('neopro_video_upload_bytes');
    });
  });

  describe('recordAlert', () => {
    it('should increment alert counter with severity and type', async () => {
      metricsService.recordAlert('warning', 'cpu_high');
      metricsService.recordAlert('critical', 'site_offline');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_alerts_total');
      expect(metrics).toContain('severity="warning"');
      expect(metrics).toContain('severity="critical"');
    });
  });

  describe('recordActiveAlerts', () => {
    it('should set active alerts gauge', async () => {
      metricsService.recordActiveAlerts('warning', 3);
      metricsService.recordActiveAlerts('critical', 1);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_active_alerts');
    });
  });

  describe('recordCommand', () => {
    it('should increment command counter', async () => {
      metricsService.recordCommand('reboot', 'success');
      metricsService.recordCommand('reboot', 'failure');
      metricsService.recordCommand('update_config', 'success');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_commands_total');
    });
  });

  describe('recordCommandLatency', () => {
    it('should record command latency histogram', async () => {
      metricsService.recordCommandLatency('reboot', 2.5);
      metricsService.recordCommandLatency('get_logs', 0.8);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_command_latency_seconds');
    });
  });

  describe('recordAuthAttempt', () => {
    it('should track auth attempts with MFA status', async () => {
      metricsService.recordAuthAttempt('success', true);
      metricsService.recordAuthAttempt('success', false);
      metricsService.recordAuthAttempt('failure', false);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_auth_attempts_total');
      expect(metrics).toContain('mfa_used="true"');
      expect(metrics).toContain('mfa_used="false"');
    });
  });

  describe('recordPiAgentAuth', () => {
    it('should track Pi agent auth attempts with reason', async () => {
      metricsService.recordPiAgentAuth('success');
      metricsService.recordPiAgentAuth('failure', 'Clé API invalide');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_pi_agent_auth_total');
    });
  });

  describe('recordWebsocketMessage', () => {
    it('should track websocket messages', async () => {
      metricsService.recordWebsocketMessage('inbound', 'heartbeat');
      metricsService.recordWebsocketMessage('outbound', 'command');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_websocket_messages_total');
    });
  });

  describe('recordSocketDisconnect', () => {
    it('should track socket disconnections by reason and client type', async () => {
      metricsService.recordSocketDisconnect('transport close', 'agent');
      metricsService.recordSocketDisconnect('ping timeout', 'agent');
      metricsService.recordSocketDisconnect('transport close', 'dashboard');
      metricsService.recordSocketDisconnect('zombie_timeout', 'agent');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_websocket_disconnects_total');
      expect(metrics).toContain('reason="transport close"');
      expect(metrics).toContain('client_type="agent"');
      expect(metrics).toContain('client_type="dashboard"');
    });

    it('should track zombie disconnect reasons separately', async () => {
      metricsService.recordSocketDisconnect('zombie_timeout', 'agent');
      metricsService.recordSocketDisconnect('zombie_cleanup', 'agent');

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('reason="zombie_timeout"');
      expect(metrics).toContain('reason="zombie_cleanup"');
    });
  });

  describe('recordCanaryDeployment', () => {
    it('should track active canary deployments', async () => {
      metricsService.recordCanaryDeployment('canary', 2);
      metricsService.recordCanaryDeployment('gradual', 1);

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_canary_deployments_active');
    });
  });

  describe('recordCanaryRollback', () => {
    it('should increment rollback counter', async () => {
      metricsService.recordCanaryRollback();
      metricsService.recordCanaryRollback();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_canary_rollbacks_total');
    });
  });

  describe('httpMetricsMiddleware', () => {
    it('should return a middleware function', () => {
      const middleware = metricsService.httpMetricsMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should track HTTP request metrics', async () => {
      const middleware = metricsService.httpMetricsMiddleware();

      const req = {
        method: 'GET',
        path: '/api/sites',
        route: { path: '/sites' },
      } as Request;

      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            callback();
          }
        }),
      } as unknown as Response;

      const next = jest.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('http_requests_total');
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', async () => {
      // Add some metrics
      metricsService.recordConnectedSites(100);
      metricsService.recordDeployment('completed', 'site');

      // Reset
      metricsService.resetMetrics();

      // Get metrics after reset
      const metrics = await metricsService.getMetrics();

      // Counters should be reset
      expect(metrics).not.toContain('neopro_deployments_total{status="completed"');
    });
  });

  // SPEC-V2-TVMON-01 / ADR-101 — couvre les 2 fonctions ajoutées par PR #695
  // (`recordTvPreview` + `resetTvPreviewLastSeen`) pour ramener le ratio
  // global functions au-dessus du seuil Jest (41%).
  describe('recordTvPreview / resetTvPreviewLastSeen (SPEC-V2-TVMON-01)', () => {
    const siteId = 'site-tv-preview-test';

    beforeEach(() => {
      metricsService.resetMetrics();
      metricsService.resetTvPreviewLastSeen();
    });

    it('ne crash pas sur siteId vide ou snapshot null', () => {
      expect(() => metricsService.recordTvPreview('', null as never)).not.toThrow();
      expect(() => metricsService.recordTvPreview(siteId, null as never)).not.toThrow();
    });

    it('premier snapshot : gauges set immédiatement, pas de delta sur le counter frames', async () => {
      metricsService.recordTvPreview(siteId, {
        framesTotal: 100,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_tv_preview_subscribers{site_id="site-tv-preview-test"} 1');
      expect(metrics).toContain('neopro_tv_preview_current_fps{site_id="site-tv-preview-test"} 10');
    });

    it('2e snapshot : incrémente delta frames + throttle counters', async () => {
      metricsService.recordTvPreview(siteId, {
        framesTotal: 100,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      metricsService.recordTvPreview(siteId, {
        framesTotal: 250,
        throttleTotal: { cpu: 2, temp: 1 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      const metrics = await metricsService.getMetrics();
      expect(metrics).toMatch(/neopro_tv_preview_frames_total\{site_id="site-tv-preview-test"\} 150/);
      expect(metrics).toMatch(/neopro_tv_preview_throttle_total\{site_id="site-tv-preview-test",reason="cpu"\} 2/);
      expect(metrics).toMatch(/neopro_tv_preview_throttle_total\{site_id="site-tv-preview-test",reason="temp"\} 1/);
    });

    it("reset Pi (counter qui régresse) n'incrémente pas négatif", async () => {
      metricsService.recordTvPreview(siteId, {
        framesTotal: 1000,
        throttleTotal: { cpu: 5, temp: 3 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      metricsService.recordTvPreview(siteId, {
        framesTotal: 50,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      const metrics = await metricsService.getMetrics();
      expect(metrics).not.toMatch(/neopro_tv_preview_frames_total\{[^}]*\} -/);
    });

    it('suspended=true force currentFps gauge à 0', async () => {
      metricsService.recordTvPreview(siteId, {
        framesTotal: 0,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 0,
        currentFps: 10,
        suspended: true,
      });
      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('neopro_tv_preview_current_fps{site_id="site-tv-preview-test"} 0');
    });

    it('resetTvPreviewLastSeen vide la map → next snapshot redevient baseline', async () => {
      metricsService.recordTvPreview(siteId, {
        framesTotal: 100,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      metricsService.resetTvPreviewLastSeen();
      metricsService.recordTvPreview(siteId, {
        framesTotal: 500,
        throttleTotal: { cpu: 0, temp: 0 },
        subscribers: 1,
        currentFps: 10,
        suspended: false,
      });
      const metrics = await metricsService.getMetrics();
      // Aucun delta émis sur ce 2e snapshot (équivalent à baseline post-reset)
      expect(metrics).not.toMatch(/neopro_tv_preview_frames_total\{site_id="site-tv-preview-test"\} 400/);
      expect(metrics).not.toMatch(/neopro_tv_preview_frames_total\{site_id="site-tv-preview-test"\} 500/);
    });
  });
});
