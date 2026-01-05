/**
 * Tests pour le service de queue offline
 *
 * Le OfflineQueueService gere les commandes en attente quand le Pi est deconnecte.
 * Les commandes sont persistees dans un fichier JSON et synchronisees a la reconnexion.
 */

const fs = require('fs-extra');
const path = require('path');

// Mock du config avant l'import - utiliser un repertoire unique
jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/tmp/neopro-test-queue',
      data: '/tmp/neopro-test-queue/data',
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

const offlineQueue = require('../services/offline-queue');

describe('OfflineQueue', () => {
  const testDataDir = '/tmp/neopro-test-queue/data';
  const queueFile = path.join(testDataDir, 'offline-queue.json');
  const deadLetterFile = path.join(testDataDir, 'dead-letter-queue.json');

  beforeEach(async () => {
    // Nettoyer et recreer le repertoire de test
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);

    // Reset l'etat
    offlineQueue.isProcessing = false;
    offlineQueue.socket = null;
  });

  afterEach(async () => {
    await fs.remove(testDataDir);
  });

  describe('enqueue', () => {
    test('should add command to queue with correct structure', async () => {
      const result = await offlineQueue.enqueue('test_command', { foo: 'bar' });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.type).toBe('test_command');
      expect(result.data).toEqual({ foo: 'bar' });
      expect(result.retries).toBe(0);
      expect(result.timestamp).toBeDefined();
      expect(result.priority).toBe('normal');
    });

    test('should persist queue to file', async () => {
      await offlineQueue.enqueue('test', {});

      const exists = await fs.pathExists(queueFile);
      expect(exists).toBe(true);

      const content = await fs.readJson(queueFile);
      expect(content.length).toBe(1);
    });

    test('should handle multiple commands', async () => {
      await offlineQueue.enqueue('cmd1', {});
      await offlineQueue.enqueue('cmd2', {});
      await offlineQueue.enqueue('cmd3', {});

      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(3);
    });

    test('should sort by priority (high first)', async () => {
      await offlineQueue.enqueue('low', {}, { priority: 'low' });
      await offlineQueue.enqueue('high', {}, { priority: 'high' });
      await offlineQueue.enqueue('normal', {}, { priority: 'normal' });

      const queue = await offlineQueue.loadQueue();
      expect(queue[0].type).toBe('high');
      expect(queue[1].type).toBe('normal');
      expect(queue[2].type).toBe('low');
    });
  });

  describe('dequeue', () => {
    test('should remove command by ID', async () => {
      const cmd1 = await offlineQueue.enqueue('first', {});
      await offlineQueue.enqueue('second', {});

      await offlineQueue.dequeue(cmd1.id);

      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe('second');
    });

    test('should handle dequeue of non-existent ID gracefully', async () => {
      await offlineQueue.enqueue('test', {});

      // Ne devrait pas lever d'erreur
      await offlineQueue.dequeue('non-existent-id');

      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(1);
    });
  });

  describe('loadQueue and saveQueue', () => {
    test('should return empty array when no queue file exists', async () => {
      const queue = await offlineQueue.loadQueue();
      expect(queue).toEqual([]);
    });

    test('should load existing queue from file', async () => {
      const testQueue = [{ id: '1', type: 'test', data: {}, retries: 0 }];
      await fs.writeJson(queueFile, testQueue);

      const queue = await offlineQueue.loadQueue();
      expect(queue).toEqual(testQueue);
    });
  });

  describe('getStats', () => {
    test('should return correct queue statistics', async () => {
      await offlineQueue.enqueue('video_sync', {}, { priority: 'high' });
      await offlineQueue.enqueue('config_sync', {}, { priority: 'normal' });
      await offlineQueue.enqueue('video_sync', {}, { priority: 'low' });

      const stats = await offlineQueue.getStats();

      expect(stats.queueSize).toBe(3);
      expect(stats.byType.video_sync).toBe(2);
      expect(stats.byType.config_sync).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.normal).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });

    test('should return empty stats for empty queue', async () => {
      const stats = await offlineQueue.getStats();

      expect(stats.queueSize).toBe(0);
      expect(stats.deadLetterSize).toBe(0);
    });
  });

  describe('clearQueue', () => {
    test('should empty the queue', async () => {
      await offlineQueue.enqueue('test1', {});
      await offlineQueue.enqueue('test2', {});

      await offlineQueue.clearQueue();

      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(0);
    });
  });

  describe('moveToDeadLetter', () => {
    test('should move command to dead letter queue', async () => {
      const cmd = await offlineQueue.enqueue('test', {});
      cmd.retries = 3;

      await offlineQueue.moveToDeadLetter(cmd);

      // Queue principale devrait etre vide
      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(0);

      // Dead letter devrait avoir l'item
      const deadLetter = await fs.readJson(deadLetterFile);
      expect(deadLetter.length).toBe(1);
      expect(deadLetter[0].type).toBe('test');
      expect(deadLetter[0].reason).toBe('max_retries_exceeded');
      expect(deadLetter[0].movedAt).toBeDefined();
    });
  });

  describe('getDeadLetterQueue', () => {
    test('should return dead letter queue', async () => {
      const cmd = await offlineQueue.enqueue('failed', {});
      await offlineQueue.moveToDeadLetter(cmd);

      const deadLetter = await offlineQueue.getDeadLetterQueue();
      expect(deadLetter.length).toBe(1);
    });

    test('should return empty array when no dead letter file', async () => {
      const deadLetter = await offlineQueue.getDeadLetterQueue();
      expect(deadLetter).toEqual([]);
    });
  });

  describe('retryDeadLetter', () => {
    test('should move command back to main queue', async () => {
      const cmd = await offlineQueue.enqueue('retry_me', { value: 42 });
      await offlineQueue.moveToDeadLetter(cmd);

      const result = await offlineQueue.retryDeadLetter(cmd.id);

      expect(result.type).toBe('retry_me');
      expect(result.retries).toBe(0);
      expect(result.lastError).toBeNull();

      const queue = await offlineQueue.loadQueue();
      expect(queue.length).toBe(1);

      const deadLetter = await offlineQueue.getDeadLetterQueue();
      expect(deadLetter.length).toBe(0);
    });

    test('should throw error for non-existent command', async () => {
      await expect(offlineQueue.retryDeadLetter('non-existent'))
        .rejects.toThrow('Command not found in dead letter queue');
    });
  });

  describe('processOnReconnect', () => {
    test('should skip if already processing', async () => {
      offlineQueue.isProcessing = true;

      const result = await offlineQueue.processOnReconnect();

      expect(result.skipped).toBe(true);
    });

    test('should return early for empty queue', async () => {
      const result = await offlineQueue.processOnReconnect();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('initialize', () => {
    test('should set socket reference', () => {
      const mockSocket = { connected: true };
      offlineQueue.initialize(mockSocket);

      expect(offlineQueue.socket).toBe(mockSocket);
    });
  });
});
