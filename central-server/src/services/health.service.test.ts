/**
 * Tests pour le service de Health Check
 */

// Mock de la base de données
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock du socket service
jest.mock('./socket.service', () => ({
  __esModule: true,
  default: {
    getConnectionCount: jest.fn().mockReturnValue(5),
    isRedisConnected: jest.fn().mockReturnValue(false),
  },
}));

// Mock du logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import healthService from './health.service';
import socketService from './socket.service';

describe('HealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful DB query
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.checks.database).toBeDefined();
      expect(health.checks.websocket).toBeDefined();
      expect(health.checks.memory).toBeDefined();
    });

    it('should return degraded status when database is slow', async () => {
      // Mock slow DB query (simulate 1.5s delay)
      mockQuery.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 1100));
        return { rows: [{ health: 1, server_time: new Date() }] };
      });

      const health = await healthService.getHealth();

      expect(health.checks.database.status).toBe('degraded');
      expect(health.checks.database.message).toContain('Latence');
    });

    it('should return unhealthy status when database fails', async () => {
      // Mock DB failure
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await healthService.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.database.message).toContain('Connection refused');
    });

    it('should include websocket check', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.checks.websocket).toBeDefined();
      expect(health.checks.websocket.name).toBe('WebSocket');
      expect(health.checks.websocket.details?.connectedSites).toBe(5);
    });

    it('should include memory check', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.checks.memory).toBeDefined();
      expect(health.checks.memory.name).toBe('Memory');
      expect(health.checks.memory.details?.heapUsedMB).toBeDefined();
      expect(health.checks.memory.details?.rssMB).toBeDefined();
    });

    it('should include summary of checks', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.summary).toBeDefined();
      expect(health.summary.totalChecks).toBeGreaterThan(0);
      expect(health.summary.healthyChecks).toBeGreaterThanOrEqual(0);
    });

    it('should not include Redis check when not configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      (socketService.isRedisConnected as jest.Mock).mockReturnValue(false);

      const health = await healthService.getHealth();

      expect(health.checks.redis).toBeUndefined();
    });

    it('should include Redis check when configured', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      (socketService.isRedisConnected as jest.Mock).mockReturnValue(true);

      const health = await healthService.getHealth();

      expect(health.checks.redis).toBeDefined();
    });
  });

  describe('getLiveness', () => {
    it('should return ok status', () => {
      const liveness = healthService.getLiveness();

      expect(liveness.status).toBe('ok');
      expect(liveness.timestamp).toBeDefined();
    });

    it('should be synchronous', () => {
      const result = healthService.getLiveness();

      // Should not be a promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.status).toBe('ok');
    });
  });

  describe('getReadiness', () => {
    it('should return ready when all dependencies are available', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ result: 1 }] });
      (socketService.getConnectionCount as jest.Mock).mockReturnValue(5);

      const readiness = await healthService.getReadiness();

      expect(readiness.status).toBe('ready');
      expect(readiness.checks.database).toBe(true);
      expect(readiness.checks.websocket).toBe(true);
    });

    it('should return not_ready when database is unavailable', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const readiness = await healthService.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.database).toBe(false);
    });

    it('should return not_ready when websocket service fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ result: 1 }] });
      (socketService.getConnectionCount as jest.Mock).mockImplementationOnce(() => {
        throw new Error('WebSocket not initialized');
      });

      const readiness = await healthService.getReadiness();

      expect(readiness.status).toBe('not_ready');
      expect(readiness.checks.websocket).toBe(false);
    });
  });

  describe('Environment and Version', () => {
    it('should include environment in health response', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.environment).toBeDefined();
    });

    it('should include version in health response', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ health: 1, server_time: new Date() }],
      });

      const health = await healthService.getHealth();

      expect(health.version).toBeDefined();
      expect(typeof health.version).toBe('string');
    });
  });
});
