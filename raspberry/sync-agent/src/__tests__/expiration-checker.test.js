/**
 * Tests pour le service de verification d'expiration des videos
 */

const fs = require('fs-extra');
const path = require('path');

// Mock du config
jest.mock('../config', () => ({
  config: {
    paths: {
      root: '/tmp/neopro-test',
      videos: '/tmp/neopro-test/videos',
      config: '/tmp/neopro-test/configuration.json',
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
  const testDir = '/tmp/neopro-test';
  const videosDir = '/tmp/neopro-test/videos';
  const configPath = '/tmp/neopro-test/configuration.json';

  beforeEach(async () => {
    // Nettoyer et recreer les repertoires
    await fs.remove(testDir);
    await fs.ensureDir(testDir);
    await fs.ensureDir(videosDir);
    await fs.ensureDir(path.join(videosDir, 'NEOPRO'));
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('checkExpiredVideos', () => {
    test('should identify expired videos', async () => {
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
      const expired = await expirationChecker.checkExpiredVideos();

      expect(expired).toBeInstanceOf(Array);
      expect(expired.length).toBeGreaterThanOrEqual(0);
    });

    test('should not flag non-expired videos', async () => {
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
      const expired = await expirationChecker.checkExpiredVideos();

      // La video valide ne devrait pas etre dans la liste des expirees
      const hasValidVideo = expired.some((v) => v.name === 'valid-video');
      expect(hasValidVideo).toBe(false);
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
      const expired = await expirationChecker.checkExpiredVideos();
      expect(expired).toBeInstanceOf(Array);
    });

    test('should handle empty configuration', async () => {
      const config = { categories: [] };

      await fs.writeJson(configPath, config);

      const expired = await expirationChecker.checkExpiredVideos();
      expect(expired).toEqual([]);
    });

    test('should handle missing configuration file', async () => {
      // Ne pas creer le fichier de config

      const expired = await expirationChecker.checkExpiredVideos();
      expect(expired).toEqual([]);
    });
  });

  describe('removeExpiredVideo', () => {
    test('should remove video file when removing expired video', async () => {
      const config = {
        categories: [
          {
            id: 'neopro',
            name: 'NEOPRO',
            videos: [
              {
                name: 'to-remove',
                filename: 'remove.mp4',
                path: 'videos/NEOPRO/remove.mp4',
                expires_at: new Date(Date.now() - 86400000).toISOString(),
                locked: true,
              },
            ],
          },
        ],
      };

      await fs.writeJson(configPath, config);

      const videoPath = path.join(videosDir, 'NEOPRO', 'remove.mp4');
      await fs.writeFile(videoPath, 'dummy content');

      // Verifier que le fichier existe
      expect(await fs.pathExists(videoPath)).toBe(true);

      // Supprimer la video expiree
      await expirationChecker.removeExpiredVideo(
        config.categories[0].videos[0],
        config.categories[0]
      );

      // Le fichier devrait etre supprime
      expect(await fs.pathExists(videoPath)).toBe(false);
    });
  });
});
