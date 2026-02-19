/**
 * Tests pour le service de verification d'expiration des videos
 *
 * L'ExpirationChecker supprime automatiquement les videos avec une date expires_at
 * depassee et met a jour la configuration en consequence.
 */

const fs = require('fs-extra');
const path = require('path');

// Mock du service local-socket
jest.mock('../services/local-socket', () => ({
  emit: jest.fn(() => true),
  request: jest.fn(() => Promise.resolve(null)),
  isConnected: jest.fn(() => true),
  connect: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock du config - utiliser un repertoire unique pour ce test
jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/tmp/neopro-test-expiration',
      videos: '/tmp/neopro-test-expiration/videos',
      config: '/tmp/neopro-test-expiration/configuration.json',
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

const expirationChecker = require('../tasks/expiration-checker');

describe('ExpirationChecker', () => {
  const testDir = '/tmp/neopro-test-expiration';
  const videosDir = '/tmp/neopro-test-expiration/videos';
  const configPath = '/tmp/neopro-test-expiration/configuration.json';

  beforeEach(async () => {
    // Nettoyer et recreer les repertoires
    await fs.remove(testDir);
    await fs.ensureDir(testDir);
    await fs.ensureDir(videosDir);
    await fs.ensureDir(path.join(videosDir, 'NEOPRO'));
  });

  afterEach(async () => {
    await fs.remove(testDir);
    // Arreter le checker si demarre
    expirationChecker.stop();
  });

  describe('checkExpiredVideos', () => {
    test('should identify and remove expired videos', async () => {
      // Creer une configuration avec une video expiree
      const expiredDate = new Date(Date.now() - 86400000).toISOString(); // Hier
      const config = {
        categories: [
          {
            id: 'neopro',
            name: 'NEOPRO',
            videos: [
              {
                name: 'expired-video',
                filename: 'expired.mp4',
                path: 'videos/NEOPRO/expired.mp4',
                expires_at: expiredDate,
                locked: true,
              },
            ],
          },
        ],
      };

      await fs.writeJson(configPath, config);

      // Creer le fichier video
      const videoPath = path.join(videosDir, 'NEOPRO', 'expired.mp4');
      await fs.writeFile(videoPath, 'dummy video content');

      // Verifier les expirations
      const result = await expirationChecker.checkExpiredVideos();

      // L'API retourne un objet avec checked et removed
      expect(result).toHaveProperty('checked');
      expect(result).toHaveProperty('removed');
      expect(result.removed).toBe(1);

      // Le fichier devrait etre supprime
      expect(await fs.pathExists(videoPath)).toBe(false);
    });

    test('should not remove non-expired videos', async () => {
      // Creer une configuration avec une video non expiree
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // Dans 30 jours
      const config = {
        categories: [
          {
            id: 'neopro',
            name: 'NEOPRO',
            videos: [
              {
                name: 'valid-video',
                filename: 'valid.mp4',
                path: 'videos/NEOPRO/valid.mp4',
                expires_at: futureDate,
                locked: true,
              },
            ],
          },
        ],
      };

      await fs.writeJson(configPath, config);

      // Creer le fichier video
      const videoPath = path.join(videosDir, 'NEOPRO', 'valid.mp4');
      await fs.writeFile(videoPath, 'dummy video content');

      // Verifier les expirations
      const result = await expirationChecker.checkExpiredVideos();

      expect(result.removed).toBe(0);
      expect(result.checked).toBe(1);

      // Le fichier devrait toujours exister
      expect(await fs.pathExists(videoPath)).toBe(true);
    });

    test('should handle videos without expiration date', async () => {
      const config = {
        categories: [
          {
            id: 'club',
            name: 'Club',
            videos: [
              {
                name: 'permanent-video',
                filename: 'permanent.mp4',
                path: 'videos/Club/permanent.mp4',
                // Pas de expires_at = permanent
              },
            ],
          },
        ],
      };

      await fs.writeJson(configPath, config);

      // Ne devrait pas lever d'erreur
      const result = await expirationChecker.checkExpiredVideos();
      expect(result.checked).toBe(1);
      expect(result.removed).toBe(0);
    });

    test('should handle empty configuration', async () => {
      const config = { categories: [] };

      await fs.writeJson(configPath, config);

      const result = await expirationChecker.checkExpiredVideos();
      expect(result).toEqual({ checked: 0, removed: 0 });
    });

    test('should handle missing configuration file', async () => {
      // Ne pas creer le fichier de config

      const result = await expirationChecker.checkExpiredVideos();
      expect(result).toEqual({ checked: 0, removed: 0 });
    });

    test('should handle subcategories', async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString();
      const config = {
        categories: [
          {
            id: 'neopro',
            name: 'NEOPRO',
            videos: [],
            subCategories: [
              {
                name: 'promo',
                videos: [
                  {
                    name: 'sub-expired',
                    path: 'videos/NEOPRO/promo/expired.mp4',
                    expires_at: expiredDate,
                  },
                ],
              },
            ],
          },
        ],
      };

      await fs.writeJson(configPath, config);
      await fs.ensureDir(path.join(videosDir, 'NEOPRO', 'promo'));
      await fs.writeFile(path.join(videosDir, 'NEOPRO', 'promo', 'expired.mp4'), 'content');

      const result = await expirationChecker.checkExpiredVideos();
      expect(result.removed).toBe(1);
    });
  });

  describe('start and stop', () => {
    test('should start periodic checking', () => {
      expirationChecker.start();
      expect(expirationChecker.intervalHandle).not.toBeNull();
      expirationChecker.stop();
    });

    test('should stop periodic checking', () => {
      expirationChecker.start();
      expirationChecker.stop();
      expect(expirationChecker.intervalHandle).toBeNull();
    });
  });

  describe('forceCheck', () => {
    test('should trigger immediate check', async () => {
      const config = { categories: [] };
      await fs.writeJson(configPath, config);

      const result = await expirationChecker.forceCheck();
      expect(result).toEqual({ checked: 0, removed: 0 });
    });
  });
});
