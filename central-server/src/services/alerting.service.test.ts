/**
 * Tests unitaires pour le service d'alerting
 *
 * Ce service est CRITIQUE pour les opérations car il gère:
 * - L'évaluation des métriques contre les seuils
 * - La création et gestion des alertes
 * - L'escalade automatique
 * - Les notifications
 *
 * @module alerting.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Mock metrics service
const mockRecordAlert = jest.fn();
const mockRecordActiveAlerts = jest.fn();
jest.mock('./metrics.service', () => ({
  __esModule: true,
  default: {
    recordAlert: (severity: string, type: string) => mockRecordAlert(severity, type),
    recordActiveAlerts: (severity: string, count: number) => mockRecordActiveAlerts(severity, count),
  },
}));

// Import after mocks
import { alertingService, AlertSeverity, AlertThreshold } from './alerting.service';

describe('AlertingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (alertingService as any).tableChecked = false;
    (alertingService as any).metricHistory.clear();
    (alertingService as any).lastAlertTime.clear();
    if ((alertingService as any).checkInterval) {
      clearInterval((alertingService as any).checkInterval);
      (alertingService as any).checkInterval = null;
    }
  });

  afterEach(() => {
    alertingService.cleanup();
    jest.useRealTimers();
  });

  describe('initialize', () => {
    it('should create tables and load default thresholds', async () => {
      mockQuery
        // ensureTables - CREATE TABLE alerts
        .mockResolvedValueOnce({ rows: [] })
        // ensureTables - CREATE TABLE thresholds
        .mockResolvedValueOnce({ rows: [] })
        // ensureTables - CREATE INDEX 1
        .mockResolvedValueOnce({ rows: [] })
        // ensureTables - CREATE INDEX 2
        .mockResolvedValueOnce({ rows: [] })
        // ensureTables - CREATE INDEX 3
        .mockResolvedValueOnce({ rows: [] })
        // loadDefaultThresholds - SELECT existing
        .mockResolvedValueOnce({ rows: [] })
        // loadDefaultThresholds - INSERT for each default threshold (6 thresholds)
        .mockResolvedValue({ rows: [] });

      await alertingService.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS alerts')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS alert_thresholds')
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Alerting service initialized');
    });

    it('should skip existing thresholds when loading defaults', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        // Existing thresholds
        .mockResolvedValueOnce({
          rows: [
            { metric: 'cpu_usage' },
            { metric: 'memory_usage' },
          ],
        })
        .mockResolvedValue({ rows: [] });

      await alertingService.initialize();

      // Should not insert cpu_usage and memory_usage since they exist
      const insertCalls = mockQuery.mock.calls.filter(call =>
        call[0]?.includes('INSERT INTO alert_thresholds')
      );

      // Should insert 4 thresholds (6 default - 2 existing)
      expect(insertCalls.length).toBe(4);
    });

    it('should start periodic escalation check', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await alertingService.initialize();

      expect((alertingService as any).checkInterval).not.toBeNull();
    });
  });

  describe('evaluateMetric', () => {
    beforeEach(() => {
      mockQuery.mockReset();
      (alertingService as any).tableChecked = true;
    });

    it('should store metric in history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getThresholdsByMetric

      await alertingService.evaluateMetric('site-123', 'cpu_usage', 50);

      const history = (alertingService as any).metricHistory.get('site-123:cpu_usage');
      expect(history).toHaveLength(1);
      expect(history[0].value).toBe(50);
    });

    it('should create alert when threshold exceeded', async () => {
      // Mock DB row format (snake_case, not camelCase)
      const thresholdDbRow = {
        id: 'threshold-1',
        name: 'CPU élevé',
        metric: 'cpu_usage',
        condition: 'gt',
        warning_value: 70,
        critical_value: 90,
        duration: 0, // Immediate
        enabled: true,
        cooldown_minutes: 15,
        escalate_after_minutes: 30,
        notify_channels: '[]',
      };

      // Pre-populate history with a violation to meet duration requirement
      (alertingService as any).metricHistory.set('site-123:cpu_usage', [
        { siteId: 'site-123', metric: 'cpu_usage', value: 95, timestamp: new Date() },
      ]);

      mockQuery
        .mockResolvedValueOnce({ rows: [thresholdDbRow] }) // getThresholdsByMetric
        .mockResolvedValueOnce({ rows: [{ id: 'alert-1' }] }) // INSERT alert (ensureTables already done)
        .mockResolvedValueOnce({ rows: [] }); // updateActiveAlertsMetrics

      await alertingService.evaluateMetric('site-123', 'cpu_usage', 95);

      // With duration=0 and a value above critical, should create alert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining(['site-123', 'CPU élevé', 'critical'])
      );
      expect(mockRecordAlert).toHaveBeenCalledWith('critical', 'CPU élevé');
    });

    it('should not create alert if within cooldown period', async () => {
      const threshold: Partial<AlertThreshold> = {
        id: 'threshold-1',
        name: 'CPU élevé',
        metric: 'cpu_usage',
        condition: 'gt',
        warningValue: 70,
        criticalValue: 90,
        duration: 0,
        enabled: true,
        cooldownMinutes: 15,
        escalateAfterMinutes: 30,
        notifyChannels: [],
      };

      // Set last alert time to now
      (alertingService as any).lastAlertTime.set('site-123:threshold-1', new Date());

      mockQuery.mockResolvedValueOnce({ rows: [threshold] });

      await alertingService.evaluateMetric('site-123', 'cpu_usage', 95);

      // Should not have inserted an alert
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array)
      );
    });

    it('should skip disabled thresholds', async () => {
      const threshold: Partial<AlertThreshold> = {
        id: 'threshold-1',
        enabled: false,
      };

      mockQuery.mockResolvedValueOnce({ rows: [threshold] });

      await alertingService.evaluateMetric('site-123', 'cpu_usage', 95);

      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array)
      );
    });

    it('should wait for duration before creating alert', async () => {
      const threshold: Partial<AlertThreshold> = {
        id: 'threshold-1',
        name: 'CPU élevé',
        metric: 'cpu_usage',
        condition: 'gt',
        warningValue: 70,
        criticalValue: 90,
        duration: 300, // 5 minutes
        enabled: true,
        cooldownMinutes: 15,
        escalateAfterMinutes: 30,
        notifyChannels: [],
      };

      mockQuery.mockResolvedValue({ rows: [threshold] });

      // First reading - should start violation tracking
      await alertingService.evaluateMetric('site-123', 'cpu_usage', 95);

      // Should not create alert yet (duration not met)
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array)
      );
    });

    it('should clean old metric history', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      // Add old metric data
      const oldDate = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      (alertingService as any).metricHistory.set('site-123:cpu_usage', [
        { siteId: 'site-123', metric: 'cpu_usage', value: 50, timestamp: oldDate },
      ]);

      await alertingService.evaluateMetric('site-123', 'cpu_usage', 60);

      const history = (alertingService as any).metricHistory.get('site-123:cpu_usage');
      // Old entry should be filtered out (only keep last 10 minutes)
      expect(history.every((h: { timestamp: Date }) => h.timestamp > new Date(Date.now() - 10 * 60 * 1000))).toBe(true);
    });
  });

  describe('createAlert', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should create alert and update metrics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'alert-123' }] })
        .mockResolvedValueOnce({ rows: [{ severity: 'warning', count: '5' }] });

      const alertId = await alertingService.createAlert({
        siteId: 'site-123',
        type: 'CPU élevé',
        severity: 'warning',
        message: 'CPU at 75%',
        metadata: { value: 75 },
      });

      expect(alertId).toBe('alert-123');
      expect(mockRecordAlert).toHaveBeenCalledWith('warning', 'CPU élevé');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({ id: 'alert-123', severity: 'warning' })
      );
    });

    it('should handle alert without siteId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'alert-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      await alertingService.createAlert({
        type: 'System Alert',
        severity: 'info',
        message: 'System notification',
        metadata: {},
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]) // null siteId
      );
    });
  });

  describe('acknowledgeAlert', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should acknowledge active alert', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // updateActiveAlertsMetrics

      await alertingService.acknowledgeAlert('alert-123', 'user-456');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'acknowledged'"),
        expect.arrayContaining(['user-456', 'alert-123'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert acknowledged',
        expect.objectContaining({ alertId: 'alert-123', userId: 'user-456' })
      );
    });
  });

  describe('resolveAlert', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should resolve alert', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await alertingService.resolveAlert('alert-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'resolved'"),
        expect.arrayContaining(['alert-123'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert resolved',
        expect.objectContaining({ alertId: 'alert-123' })
      );
    });
  });

  describe('resolveAlertsBySiteAndType', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should resolve multiple alerts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'alert-1' }, { id: 'alert-2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const count = await alertingService.resolveAlertsBySiteAndType('site-123', 'CPU élevé');

      expect(count).toBe(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alerts resolved',
        expect.objectContaining({ siteId: 'site-123', type: 'CPU élevé', count: 2 })
      );
    });

    it('should return 0 if no alerts found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const count = await alertingService.resolveAlertsBySiteAndType('site-123', 'Unknown');

      expect(count).toBe(0);
    });
  });

  describe('getActiveAlerts', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should return active alerts', async () => {
      const mockAlerts = [
        { id: 'alert-1', type: 'CPU', severity: 'warning', status: 'active' },
        { id: 'alert-2', type: 'Memory', severity: 'critical', status: 'acknowledged' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockAlerts });

      const alerts = await alertingService.getActiveAlerts();

      expect(alerts).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('active', 'acknowledged', 'escalated')"),
        expect.any(Array)
      );
    });

    it('should apply siteId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.getActiveAlerts({ siteId: 'site-123' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('site_id = $1'),
        expect.arrayContaining(['site-123'])
      );
    });

    it('should apply severity filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.getActiveAlerts({ severity: 'critical' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('severity = $'),
        expect.arrayContaining(['critical'])
      );
    });

    it('should apply type filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.getActiveAlerts({ type: 'CPU élevé' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('type = $'),
        expect.arrayContaining(['CPU élevé'])
      );
    });

    it('should combine multiple filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.getActiveAlerts({
        siteId: 'site-123',
        severity: 'critical',
        type: 'CPU élevé',
      });

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('site_id = $1');
      expect(call[0]).toContain('severity = $2');
      expect(call[0]).toContain('type = $3');
      expect(call[1]).toEqual(['site-123', 'critical', 'CPU élevé']);
    });
  });

  describe('getThresholds', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should return all thresholds', async () => {
      const mockThresholds = [
        {
          id: 'threshold-1',
          name: 'CPU',
          metric: 'cpu_usage',
          condition: 'gt',
          warning_value: 70,
          critical_value: 90,
          duration: 300,
          enabled: true,
          cooldown_minutes: 15,
          escalate_after_minutes: 30,
          notify_channels: '["email"]',
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockThresholds });

      const thresholds = await alertingService.getThresholds();

      expect(thresholds).toHaveLength(1);
      expect(thresholds[0].name).toBe('CPU');
      expect(thresholds[0].notifyChannels).toEqual(['email']);
    });
  });

  describe('updateThreshold', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should update threshold fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.updateThreshold('threshold-123', {
        name: 'New Name',
        warningValue: 75,
        criticalValue: 95,
        enabled: false,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alert_thresholds SET'),
        expect.arrayContaining(['New Name', 75, 95, false, 'threshold-123'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Threshold updated',
        expect.objectContaining({ id: 'threshold-123' })
      );
    });

    it('should do nothing if no updates provided', async () => {
      await alertingService.updateThreshold('threshold-123', {});

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should update notify channels as JSON', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await alertingService.updateThreshold('threshold-123', {
        notifyChannels: ['email', 'slack'],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(['email', 'slack'])])
      );
    });
  });

  describe('Private methods', () => {
    describe('evaluateCondition', () => {
      const createThreshold = (condition: string): AlertThreshold => ({
        id: 'test',
        name: 'Test',
        metric: 'test',
        condition: condition as AlertThreshold['condition'],
        warningValue: 70,
        criticalValue: 90,
        duration: 0,
        enabled: true,
        cooldownMinutes: 15,
        escalateAfterMinutes: 30,
        notifyChannels: [],
      });

      it('should evaluate gt condition', () => {
        const threshold = createThreshold('gt');
        expect((alertingService as any).evaluateCondition(95, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(90, threshold)).toBe(false);
        expect((alertingService as any).evaluateCondition(50, threshold)).toBe(false);
      });

      it('should evaluate lt condition', () => {
        const threshold = createThreshold('lt');
        expect((alertingService as any).evaluateCondition(50, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(90, threshold)).toBe(false);
      });

      it('should evaluate eq condition', () => {
        const threshold = createThreshold('eq');
        expect((alertingService as any).evaluateCondition(90, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(89, threshold)).toBe(false);
      });

      it('should evaluate gte condition', () => {
        const threshold = createThreshold('gte');
        expect((alertingService as any).evaluateCondition(90, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(95, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(89, threshold)).toBe(false);
      });

      it('should evaluate lte condition', () => {
        const threshold = createThreshold('lte');
        expect((alertingService as any).evaluateCondition(90, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(50, threshold)).toBe(true);
        expect((alertingService as any).evaluateCondition(91, threshold)).toBe(false);
      });
    });

    describe('determineSeverity', () => {
      it('should return critical when value exceeds critical threshold', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'test',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        expect((alertingService as any).determineSeverity(95, threshold)).toBe('critical');
        expect((alertingService as any).determineSeverity(90, threshold)).toBe('critical');
      });

      it('should return warning when value is between warning and critical', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'test',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        expect((alertingService as any).determineSeverity(75, threshold)).toBe('warning');
        expect((alertingService as any).determineSeverity(89, threshold)).toBe('warning');
      });
    });

    describe('formatAlertMessage', () => {
      it('should format critical alert message', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'CPU élevé',
          metric: 'cpu_usage',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const message = (alertingService as any).formatAlertMessage(threshold, 95, 'critical');

        expect(message).toContain('CRITIQUE');
        expect(message).toContain('CPU élevé');
        expect(message).toContain('95.0');
        expect(message).toContain('90');
      });

      it('should format warning alert message', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Memory',
          metric: 'memory_usage',
          condition: 'gt',
          warningValue: 80,
          criticalValue: 95,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const message = (alertingService as any).formatAlertMessage(threshold, 85, 'warning');

        expect(message).toContain('Avertissement');
        expect(message).toContain('Memory');
        expect(message).toContain('85.0');
        expect(message).toContain('80');
      });
    });

    describe('checkThresholdViolation', () => {
      it('should return violation start date when threshold exceeded', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'cpu_usage',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const history = [
          { siteId: 'site-1', metric: 'cpu_usage', value: 50, timestamp: new Date(Date.now() - 5000) },
          { siteId: 'site-1', metric: 'cpu_usage', value: 95, timestamp: new Date(Date.now() - 3000) },
          { siteId: 'site-1', metric: 'cpu_usage', value: 95, timestamp: new Date() },
        ];

        const violationStart = (alertingService as any).checkThresholdViolation(history, threshold);

        expect(violationStart).not.toBeNull();
      });

      it('should return null when threshold not violated', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'cpu_usage',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const history = [
          { siteId: 'site-1', metric: 'cpu_usage', value: 50, timestamp: new Date() },
        ];

        const violationStart = (alertingService as any).checkThresholdViolation(history, threshold);

        expect(violationStart).toBeNull();
      });

      it('should return null for empty history', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'cpu_usage',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const violationStart = (alertingService as any).checkThresholdViolation([], threshold);

        expect(violationStart).toBeNull();
      });

      it('should reset violation when value drops below threshold', () => {
        const threshold: AlertThreshold = {
          id: 'test',
          name: 'Test',
          metric: 'cpu_usage',
          condition: 'gt',
          warningValue: 70,
          criticalValue: 90,
          duration: 0,
          enabled: true,
          cooldownMinutes: 15,
          escalateAfterMinutes: 30,
          notifyChannels: [],
        };

        const history = [
          { siteId: 'site-1', metric: 'cpu_usage', value: 95, timestamp: new Date(Date.now() - 5000) },
          { siteId: 'site-1', metric: 'cpu_usage', value: 50, timestamp: new Date(Date.now() - 3000) }, // Drops
          { siteId: 'site-1', metric: 'cpu_usage', value: 95, timestamp: new Date() },
        ];

        const violationStart = (alertingService as any).checkThresholdViolation(history, threshold);

        // Should return the timestamp of the last violation, not the first
        expect(violationStart?.getTime()).toBeGreaterThan(Date.now() - 1000);
      });
    });
  });

  describe('checkEscalations', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should escalate overdue alerts', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'alert-1', type: 'CPU', escalate_after_minutes: 30 },
            { id: 'alert-2', type: 'Memory', escalate_after_minutes: 60 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE alert-1
        .mockResolvedValueOnce({ rows: [] }); // UPDATE alert-2

      await (alertingService as any).checkEscalations();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'escalated'"),
        expect.arrayContaining(['alert-1'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'escalated'"),
        expect.arrayContaining(['alert-2'])
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert escalated',
        expect.objectContaining({ alertId: 'alert-1' })
      );
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await (alertingService as any).checkEscalations();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error checking escalations:',
        expect.any(Error)
      );
    });
  });

  describe('cleanup', () => {
    it('should call clearInterval', () => {
      const intervalId = setInterval(() => {}, 60000);
      (alertingService as any).checkInterval = intervalId;
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      alertingService.cleanup();

      // Verify clearInterval was called
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      (alertingService as any).tableChecked = true;
    });

    it('should handle database errors in createAlert', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        alertingService.createAlert({
          type: 'Test',
          severity: 'info',
          message: 'Test',
          metadata: {},
        })
      ).rejects.toThrow('Database error');
    });

    it('should handle malformed notify_channels JSON', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'threshold-1',
          name: 'Test',
          metric: 'test',
          condition: 'gt',
          warning_value: 70,
          critical_value: 90,
          duration: 0,
          enabled: true,
          cooldown_minutes: 15,
          escalate_after_minutes: 30,
          notify_channels: null, // null instead of JSON
        }],
      });

      const thresholds = await alertingService.getThresholds();

      expect(thresholds[0].notifyChannels).toEqual([]);
    });
  });
});
