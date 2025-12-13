/**
 * Tests pour le service de statut de connexion
 */

// Mock du logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const connectionStatus = require('../services/connection-status');

describe('ConnectionStatus', () => {
  beforeEach(() => {
    // Reset l'etat
    connectionStatus.connected = false;
    connectionStatus.lastConnectedAt = null;
    connectionStatus.lastDisconnectedAt = null;
    connectionStatus.reconnectAttempts = 0;
    connectionStatus.lastSyncAt = null;
    connectionStatus.lastSyncSuccess = null;
    connectionStatus.reason = null;
  });

  describe('setConnected', () => {
    test('should set connected to true', () => {
      connectionStatus.setConnected(true, 'socket_connected');

      const status = connectionStatus.getStatus();
      expect(status.connected).toBe(true);
      expect(status.lastConnectedAt).toBeDefined();
    });

    test('should set connected to false with reason', () => {
      connectionStatus.setConnected(false, 'socket_disconnected');

      const status = connectionStatus.getStatus();
      expect(status.connected).toBe(false);
      expect(status.lastDisconnectedAt).toBeDefined();
      expect(status.reason).toBe('socket_disconnected');
    });

    test('should emit event on status change', () => {
      const listener = jest.fn();
      connectionStatus.on('statusChange', listener);

      connectionStatus.setConnected(true);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        connected: true,
      }));

      connectionStatus.removeListener('statusChange', listener);
    });

    test('should reset reconnect attempts on successful connection', () => {
      connectionStatus.reconnectAttempts = 5;
      connectionStatus.setConnected(true);

      expect(connectionStatus.reconnectAttempts).toBe(0);
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
    test('should record successful sync', () => {
      connectionStatus.recordSync(true);

      expect(connectionStatus.lastSyncAt).toBeDefined();
      expect(connectionStatus.lastSyncSuccess).toBe(true);
    });

    test('should record failed sync', () => {
      connectionStatus.recordSync(false);

      expect(connectionStatus.lastSyncAt).toBeDefined();
      expect(connectionStatus.lastSyncSuccess).toBe(false);
    });
  });

  describe('getStatus', () => {
    test('should return complete status object', () => {
      connectionStatus.setConnected(true);
      connectionStatus.recordSync(true);

      const status = connectionStatus.getStatus();

      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('lastConnectedAt');
      expect(status).toHaveProperty('lastDisconnectedAt');
      expect(status).toHaveProperty('reconnectAttempts');
      expect(status).toHaveProperty('lastSyncAt');
      expect(status).toHaveProperty('lastSyncSuccess');
    });
  });

  describe('getDisplayStatus', () => {
    test('should return "online" when connected', () => {
      connectionStatus.setConnected(true);

      expect(connectionStatus.getDisplayStatus()).toBe('online');
    });

    test('should return "offline" when disconnected', () => {
      connectionStatus.setConnected(false);

      expect(connectionStatus.getDisplayStatus()).toBe('offline');
    });

    test('should return "connecting" when reconnecting', () => {
      connectionStatus.setConnected(false);
      connectionStatus.reconnectAttempts = 2;

      expect(connectionStatus.getDisplayStatus()).toBe('connecting');
    });
  });

  describe('getStatistics', () => {
    test('should return statistics object', () => {
      connectionStatus.setConnected(true);
      connectionStatus.recordSync(true);

      const stats = connectionStatus.getStatistics();

      expect(stats).toHaveProperty('totalReconnects');
      expect(stats).toHaveProperty('currentSessionDuration');
      expect(stats).toHaveProperty('lastSyncDuration');
    });
  });
});
