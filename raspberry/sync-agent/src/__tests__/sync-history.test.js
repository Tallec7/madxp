/**
 * Tests pour le service d'historique de synchronisation
 */

const fs = require('fs-extra');
const path = require('path');

// Mock du config avant l'import
jest.mock('../config', () => ({
  config: {
    paths: {
      data: '/tmp/neopro-test/data',
    },
  },
}));

// Mock du logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

const syncHistory = require('../services/sync-history');

describe('SyncHistoryService', () => {
  const testDataDir = '/tmp/neopro-test/data';
  const historyPath = path.join(testDataDir, 'sync-history.json');

  beforeEach(async () => {
    // Nettoyer et recreer le repertoire de test
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);
  });

  afterEach(async () => {
    await fs.remove(testDataDir);
  });

  describe('loadHistory', () => {
    test('should return empty array when no history file exists', async () => {
      const history = await syncHistory.loadHistory();
      expect(history).toEqual([]);
    });

    test('should load existing history from file', async () => {
      const existingHistory = [
        { id: '1', type: 'connection', success: true },
        { id: '2', type: 'command', success: false },
      ];
      await fs.writeJson(historyPath, existingHistory);

      const history = await syncHistory.loadHistory();
      expect(history).toEqual(existingHistory);
    });

    test('should return empty array on corrupted file', async () => {
      await fs.writeFile(historyPath, 'invalid json{{{');

      const history = await syncHistory.loadHistory();
      expect(history).toEqual([]);
    });
  });

  describe('recordSync', () => {
    test('should add entry to history', async () => {
      const id = await syncHistory.recordSync('connection', { connected: true }, true);

      expect(id).toBe('test-uuid-1234');

      const history = await syncHistory.loadHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toMatchObject({
        id: 'test-uuid-1234',
        type: 'connection',
        success: true,
        details: { connected: true },
      });
    });

    test('should add failed entry with error', async () => {
      await syncHistory.recordSync('command', { type: 'deploy' }, false, 'Connection failed');

      const history = await syncHistory.loadHistory();
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Connection failed');
    });

    test('should maintain max entries limit', async () => {
      syncHistory.maxEntries = 5;

      for (let i = 0; i < 10; i++) {
        await syncHistory.recordSync('test', { index: i }, true);
      }

      const history = await syncHistory.loadHistory();
      expect(history.length).toBe(5);
      // Last entries should be the most recent
      expect(history[0].details.index).toBe(9);

      // Reset
      syncHistory.maxEntries = 100;
    });
  });

  describe('getHistory', () => {
    test('should return limited number of entries', async () => {
      for (let i = 0; i < 10; i++) {
        await syncHistory.recordSync('test', { index: i }, true);
      }

      const history = await syncHistory.getHistory(5);
      expect(history.length).toBe(5);
    });

    test('should return all entries if less than limit', async () => {
      await syncHistory.recordSync('test', {}, true);
      await syncHistory.recordSync('test', {}, true);

      const history = await syncHistory.getHistory(10);
      expect(history.length).toBe(2);
    });
  });

  describe('getStats', () => {
    test('should calculate statistics correctly', async () => {
      await syncHistory.recordSync('connection', {}, true);
      await syncHistory.recordSync('command', {}, true);
      await syncHistory.recordSync('command', {}, false, 'Error');
      await syncHistory.recordSync('merge', {}, true);

      const stats = await syncHistory.getStats();

      expect(stats.total).toBe(4);
      expect(stats.success).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.byType.connection).toBe(1);
      expect(stats.byType.command).toBe(2);
      expect(stats.byType.merge).toBe(1);
      expect(stats.lastSync).toBeDefined();
    });

    test('should return empty stats when no history', async () => {
      const stats = await syncHistory.getStats();

      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.lastSync).toBeNull();
    });
  });

  describe('search', () => {
    test('should filter by type', async () => {
      await syncHistory.recordSync('connection', {}, true);
      await syncHistory.recordSync('command', {}, true);
      await syncHistory.recordSync('connection', {}, true);

      const results = await syncHistory.search({ type: 'connection' });
      expect(results.length).toBe(2);
    });

    test('should filter by success', async () => {
      await syncHistory.recordSync('test', {}, true);
      await syncHistory.recordSync('test', {}, false);
      await syncHistory.recordSync('test', {}, true);

      const failures = await syncHistory.search({ success: false });
      expect(failures.length).toBe(1);
    });
  });

  describe('cleanup', () => {
    test('should reduce history to specified size', async () => {
      for (let i = 0; i < 20; i++) {
        await syncHistory.recordSync('test', { index: i }, true);
      }

      await syncHistory.cleanup(5);

      const history = await syncHistory.loadHistory();
      expect(history.length).toBe(5);
    });

    test('should not affect history if already smaller', async () => {
      await syncHistory.recordSync('test', {}, true);
      await syncHistory.recordSync('test', {}, true);

      await syncHistory.cleanup(10);

      const history = await syncHistory.loadHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('utility methods', () => {
    test('recordConnection should record connection event', async () => {
      await syncHistory.recordConnection(true, { server: 'test' });

      const history = await syncHistory.loadHistory();
      expect(history[0].type).toBe('connection');
      expect(history[0].details.connected).toBe(true);
    });

    test('recordConfigPush should record local to central sync', async () => {
      await syncHistory.recordConfigPush('abc123', 5);

      const history = await syncHistory.loadHistory();
      expect(history[0].type).toBe('local_to_central');
      expect(history[0].details.hash).toBe('abc123');
      expect(history[0].details.categoriesCount).toBe(5);
    });

    test('recordCommand should record command execution', async () => {
      await syncHistory.recordCommand('deploy_video', true, { filename: 'test.mp4' });

      const history = await syncHistory.loadHistory();
      expect(history[0].type).toBe('command');
      expect(history[0].details.commandType).toBe('deploy_video');
    });

    test('recordError should record failed operation', async () => {
      await syncHistory.recordError('sync', 'Connection timeout', { retries: 3 });

      const history = await syncHistory.loadHistory();
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Connection timeout');
    });
  });
});
