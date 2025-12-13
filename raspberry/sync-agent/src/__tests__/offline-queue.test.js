/**
 * Tests pour le service de queue offline
 */

const fs = require('fs-extra');
const path = require('path');

// Mock du config avant l'import
jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/tmp/neopro-test',
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

const offlineQueue = require('../services/offline-queue');

describe('OfflineQueue', () => {
  const testDataDir = '/tmp/neopro-test/data';

  beforeEach(async () => {
    // Nettoyer et recreer le repertoire de test
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);

    // Reset la queue
    offlineQueue.queue = [];
    offlineQueue.isProcessing = false;
  });

  afterEach(async () => {
    await fs.remove(testDataDir);
  });

  describe('enqueue', () => {
    test('should add command to queue', async () => {
      const command = {
        type: 'test_command',
        data: { foo: 'bar' },
      };

      const item = await offlineQueue.enqueue(command);

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.command).toEqual(command);
      expect(item.retries).toBe(0);
      expect(item.timestamp).toBeDefined();
    });

    test('should persist queue to file', async () => {
      await offlineQueue.enqueue({ type: 'test', data: {} });

      const queueFile = path.join(testDataDir, 'offline-queue.json');
      const exists = await fs.pathExists(queueFile);

      expect(exists).toBe(true);
    });

    test('should handle multiple commands', async () => {
      await offlineQueue.enqueue({ type: 'cmd1', data: {} });
      await offlineQueue.enqueue({ type: 'cmd2', data: {} });
      await offlineQueue.enqueue({ type: 'cmd3', data: {} });

      expect(offlineQueue.queue.length).toBe(3);
    });
  });

  describe('dequeue', () => {
    test('should return and remove first item', async () => {
      await offlineQueue.enqueue({ type: 'first', data: {} });
      await offlineQueue.enqueue({ type: 'second', data: {} });

      const item = await offlineQueue.dequeue();

      expect(item.command.type).toBe('first');
      expect(offlineQueue.queue.length).toBe(1);
    });

    test('should return null for empty queue', async () => {
      const item = await offlineQueue.dequeue();

      expect(item).toBeNull();
    });
  });

  describe('getQueueLength', () => {
    test('should return correct queue length', async () => {
      expect(offlineQueue.getQueueLength()).toBe(0);

      await offlineQueue.enqueue({ type: 'test', data: {} });

      expect(offlineQueue.getQueueLength()).toBe(1);
    });
  });

  describe('clear', () => {
    test('should empty the queue', async () => {
      await offlineQueue.enqueue({ type: 'test', data: {} });
      await offlineQueue.clear();

      expect(offlineQueue.getQueueLength()).toBe(0);
    });
  });

  describe('retry logic', () => {
    test('should increment retries on requeue', async () => {
      const item = await offlineQueue.enqueue({ type: 'test', data: {} });

      item.retries = 1;
      await offlineQueue.requeue(item);

      const requeuedItem = offlineQueue.queue[0];
      expect(requeuedItem.retries).toBe(2);
    });

    test('should move to dead letter after max retries', async () => {
      const item = await offlineQueue.enqueue({ type: 'test', data: {} });

      item.retries = 3; // MAX_RETRIES
      await offlineQueue.moveToDeadLetter(item);

      // Queue devrait etre vide
      expect(offlineQueue.getQueueLength()).toBe(0);

      // Dead letter devrait avoir l'item
      const deadLetterPath = path.join(testDataDir, 'dead-letter-queue.json');
      const deadLetter = await fs.readJson(deadLetterPath).catch(() => []);
      expect(deadLetter.length).toBe(1);
    });
  });
});
