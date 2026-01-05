/**
 * Tests pour le service de statut de connexion
 *
 * Ces tests verifient le bon fonctionnement du service ConnectionStatusService
 * qui gere l'etat de connexion au serveur central.
 */

// Mock du logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock de la config
jest.mock('../config', () => ({
  config: {
    central: {
      url: 'http://test-central.local',
      enabled: true,
    },
  },
}));

// On doit re-require le module apres les mocks
let connectionStatus;

describe('ConnectionStatus', () => {
  beforeEach(() => {
    // Reset le cache du module pour avoir une instance fraiche
    jest.resetModules();
    connectionStatus = require('../services/connection-status');
  });

  describe('setConnected', () => {
    test('should set isConnected to true', () => {
      connectionStatus.setConnected(true, 'socket_connected');

      const status = connectionStatus.getStatus();
      expect(status.isConnected).toBe(true);
      expect(status.lastConnectedAt).toBeDefined();
    });

    test('should set isConnected to false', () => {
      connectionStatus.setConnected(false, 'socket_disconnected');

      const status = connectionStatus.getStatus();
      expect(status.isConnected).toBe(false);
      expect(status.lastDisconnectedAt).toBeDefined();
    });

    test('should emit event on status change', () => {
      const listener = jest.fn();
      connectionStatus.on('statusChange', listener);

      connectionStatus.setConnected(true, 'test_reason');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        connected: true,
        reason: 'test_reason',
      }));

      connectionStatus.removeListener('statusChange', listener);
    });

    test('should emit connected event when connected', () => {
      const listener = jest.fn();
      connectionStatus.on('connected', listener);

      connectionStatus.setConnected(true);

      expect(listener).toHaveBeenCalled();

      connectionStatus.removeListener('connected', listener);
    });

    test('should emit disconnected event when disconnected', () => {
      // D'abord connecter
      connectionStatus.setConnected(true);

      const listener = jest.fn();
      connectionStatus.on('disconnected', listener);

      connectionStatus.setConnected(false, 'test_disconnect');

      expect(listener).toHaveBeenCalledWith({ reason: 'test_disconnect' });

      connectionStatus.removeListener('disconnected', listener);
    });

    test('should reset reconnect attempts on successful connection', () => {
      connectionStatus.recordReconnectAttempt();
      connectionStatus.recordReconnectAttempt();
      expect(connectionStatus.reconnectAttempts).toBe(2);

      connectionStatus.setConnected(true);

      expect(connectionStatus.reconnectAttempts).toBe(0);
    });

    test('should add to connection history', () => {
      connectionStatus.setConnected(true, 'first');
      connectionStatus.setConnected(false, 'second');

      const history = connectionStatus.getHistory(10);
      expect(history.length).toBe(2);
      expect(history[0].connected).toBe(false);
      expect(history[0].reason).toBe('second');
      expect(history[1].connected).toBe(true);
    });
  });

  describe('recordReconnectAttempt', () => {
    test('should increment reconnect attempts', () => {
      expect(connectionStatus.reconnectAttempts).toBe(0);

      connectionStatus.recordReconnectAttempt();
      expect(connectionStatus.reconnectAttempts).toBe(1);

      connectionStatus.recordReconnectAttempt();
      expect(connectionStatus.reconnectAttempts).toBe(2);
    });
  });

  describe('recordSync', () => {
    test('should record sync timestamp', () => {
      connectionStatus.recordSync('config');

      expect(connectionStatus.lastSyncAt).toBeDefined();
    });

    test('should emit sync event with type', () => {
      const listener = jest.fn();
      connectionStatus.on('sync', listener);

      connectionStatus.recordSync('video');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'video',
      }));

      connectionStatus.removeListener('sync', listener);
    });
  });

  describe('getStatus', () => {
    test('should return complete status object', () => {
      connectionStatus.setConnected(true);
      connectionStatus.recordSync('general');

      const status = connectionStatus.getStatus();

      expect(status).toHaveProperty('isConnected', true);
      expect(status).toHaveProperty('lastConnectedAt');
      expect(status).toHaveProperty('lastDisconnectedAt');
      expect(status).toHaveProperty('reconnectAttempts', 0);
      expect(status).toHaveProperty('lastSyncAt');
      expect(status).toHaveProperty('centralServerUrl');
      expect(status).toHaveProperty('centralServerEnabled');
    });

    test('should calculate offline duration when disconnected', () => {
      connectionStatus.setConnected(false);

      const status = connectionStatus.getStatus();
      expect(status.offlineDurationSeconds).toBeDefined();
      expect(status.offlineDurationSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDisplayStatus', () => {
    test('should return object with statusClass "online" when connected', () => {
      connectionStatus.setConnected(true);

      const display = connectionStatus.getDisplayStatus();
      expect(display.statusClass).toBe('online');
      expect(display.isConnected).toBe(true);
      expect(display.statusText).toContain('Connecte');
    });

    test('should return object with statusClass "offline" when disconnected', () => {
      connectionStatus.setConnected(false);

      const display = connectionStatus.getDisplayStatus();
      expect(display.statusClass).toBe('offline');
      expect(display.isConnected).toBe(false);
      expect(display.statusText).toContain('hors ligne');
    });

    test('should include reconnect attempts', () => {
      connectionStatus.setConnected(false);
      connectionStatus.recordReconnectAttempt();
      connectionStatus.recordReconnectAttempt();

      const display = connectionStatus.getDisplayStatus();
      expect(display.reconnectAttempts).toBe(2);
    });

    test('should include lastSyncText', () => {
      const display = connectionStatus.getDisplayStatus();
      expect(display.lastSyncText).toBe('Jamais synchronise');
    });
  });

  describe('getHistory', () => {
    test('should return limited history', () => {
      for (let i = 0; i < 5; i++) {
        connectionStatus.setConnected(i % 2 === 0);
      }

      const history = connectionStatus.getHistory(3);
      expect(history.length).toBe(3);
    });

    test('should return empty array when no history', () => {
      const history = connectionStatus.getHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    test('should return statistics object with default values', () => {
      const stats = connectionStatus.getStatistics();

      expect(stats).toHaveProperty('totalEvents', 0);
      expect(stats).toHaveProperty('connectEvents', 0);
      expect(stats).toHaveProperty('disconnectEvents', 0);
      expect(stats).toHaveProperty('averageOfflineMinutes', 0);
    });

    test('should count connect and disconnect events', () => {
      connectionStatus.setConnected(true);
      connectionStatus.setConnected(false);
      connectionStatus.setConnected(true);

      const stats = connectionStatus.getStatistics();

      expect(stats.totalEvents).toBe(3);
      expect(stats.connectEvents).toBe(2);
      expect(stats.disconnectEvents).toBe(1);
    });

    test('should track current streak when connected', () => {
      connectionStatus.setConnected(true);
      connectionStatus.setConnected(false);
      connectionStatus.setConnected(true);

      const stats = connectionStatus.getStatistics();
      expect(stats.currentStreak).toBe(2); // 2 connect events total
    });
  });
});
