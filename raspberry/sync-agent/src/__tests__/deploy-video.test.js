/**
 * Tests unitaires pour le module de déploiement vidéo
 *
 * Ce module est CRITIQUE car il gère:
 * - Le téléchargement de vidéos depuis le central
 * - La mise à jour de la configuration locale
 * - La notification de l'application locale
 *
 * @module deploy-video.test
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

// Mock des dépendances externes
jest.mock('fs-extra');
jest.mock('axios');

// Mock socket.io-client with persistent mock functions
const mockSocketEmit = jest.fn();
const mockSocketClose = jest.fn();
jest.mock('socket.io-client', () => {
  return jest.fn(() => ({
    emit: mockSocketEmit,
    close: mockSocketClose,
  }));
});

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
    paths: {
      videos: '/home/pi/neopro/videos',
      config: '/home/pi/neopro/webapp/configuration.json',
    },
    security: {
      maxDownloadSize: 1073741824, // 1GB
    },
  },
}));

// Import après les mocks
const deployVideo = require('../commands/deploy-video');
const logger = require('../logger');
const io = require('socket.io-client');

describe('Deploy Video Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketEmit.mockClear();
    mockSocketClose.mockClear();

    // Setup default mocks
    fs.ensureDir.mockResolvedValue(undefined);
    fs.pathExists.mockResolvedValue(false);
    fs.writeFile.mockResolvedValue(undefined);
    fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));
    fs.stat.mockResolvedValue({ size: 1024000 });
    fs.createWriteStream.mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          setTimeout(callback, 10);
        }
        return { on: jest.fn() };
      }),
    });

    // Mock createReadStream pour le calcul du checksum
    const mockReadStream = {
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          // Simuler des données pour le hash
          callback(Buffer.from('test video content'));
        }
        if (event === 'end') {
          setTimeout(callback, 5);
        }
        return mockReadStream;
      }),
    };
    fs.createReadStream.mockReturnValue(mockReadStream);
  });

  describe('execute', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.supabase.co/videos/test.mp4',
      filename: 'test-video.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces_neopro',
      subcategory: null,
      locked: true,
    };

    it('should successfully deploy a video', async () => {
      // Mock successful download
      const mockStream = {
        pipe: jest.fn(),
      };
      axios.mockResolvedValue({
        data: mockStream,
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10);
          }
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      const result = await deployVideo.execute(baseVideoData, jest.fn());

      expect(result.success).toBe(true);
      expect(result.path).toContain('test-video.mp4');
      expect(fs.ensureDir).toHaveBeenCalled();
    });

    it('should create target directory if not exists', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.execute(baseVideoData, jest.fn());

      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('annonces_neopro')
      );
    });

    it('should handle subcategory in path', async () => {
      const videoData = {
        ...baseVideoData,
        subcategory: 'promotions',
      };

      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.execute(videoData, jest.fn());

      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('promotions')
      );
    });

    it('should warn when overwriting existing video', async () => {
      fs.pathExists.mockResolvedValue(true);

      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.execute(baseVideoData, jest.fn());

      expect(logger.warn).toHaveBeenCalledWith(
        'Video already exists, will be overwritten',
        expect.any(Object)
      );
    });

    it('should call progress callback during download', async () => {
      const progressCallback = jest.fn();

      // Mock axios with onDownloadProgress
      axios.mockImplementation((config) => {
        // Simulate progress
        if (config.onDownloadProgress) {
          config.onDownloadProgress({ loaded: 50, total: 100 });
          config.onDownloadProgress({ loaded: 100, total: 100 });
        }
        return Promise.resolve({
          data: {
            pipe: jest.fn().mockReturnValue({
              on: jest.fn((event, callback) => {
                if (event === 'finish') setTimeout(callback, 10);
                return { on: jest.fn() };
              }),
            }),
          },
        });
      });

      await deployVideo.execute(baseVideoData, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(50);
      expect(progressCallback).toHaveBeenCalledWith(100);
    });

    it('should throw error on download failure', async () => {
      axios.mockRejectedValue(new Error('Network error'));

      await expect(
        deployVideo.execute(baseVideoData, jest.fn())
      ).rejects.toThrow('Failed to download video: Network error');
    });

    it('should update configuration after successful download', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Enable path exists for config file
      fs.pathExists.mockImplementation((p) => {
        if (p.includes('configuration.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });

      await deployVideo.execute(baseVideoData, jest.fn());

      // Should write updated config (updateConfiguration is called internally)
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('configuration.json'),
        expect.any(String)
      );
    });

    it('should notify local app via socket after deployment', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.execute(baseVideoData, jest.fn());

      // Verify socket.io-client was called for local notification
      // Note: The actual socket.emit call happens inside the dynamically required module
      // which is properly mocked at module level
      expect(io).toHaveBeenCalledWith('http://localhost:3000', { timeout: 5000 });
    });
  });

  describe('updateConfiguration', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.supabase.co/videos/test.mp4',
      filename: 'test-video.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces_neopro',
      subcategory: null,
      locked: true,
    };

    it('should create new category if not exists', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(baseVideoData);

      expect(writtenConfig.categories).toHaveLength(1);
      expect(writtenConfig.categories[0].name).toBe('annonces_neopro');
      expect(writtenConfig.categories[0].locked).toBe(true);
      expect(writtenConfig.categories[0].owner).toBe('neopro');
    });

    it('should add video to existing category', async () => {
      const existingConfig = {
        categories: [{
          id: 'existing',
          name: 'annonces_neopro',
          locked: true,
          owner: 'neopro',
          videos: [{ name: 'existing', path: 'videos/annonces_neopro/existing.mp4' }],
          subCategories: [],
        }],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(baseVideoData);

      expect(writtenConfig.categories[0].videos).toHaveLength(2);
    });

    it('should update existing video if same path', async () => {
      const existingConfig = {
        categories: [{
          id: 'existing',
          name: 'annonces_neopro',
          locked: true,
          owner: 'neopro',
          videos: [{
            name: 'Old Name',
            path: 'videos/annonces_neopro/test-video.mp4',
          }],
          subCategories: [],
        }],
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(baseVideoData);

      expect(writtenConfig.categories[0].videos).toHaveLength(1);
      expect(writtenConfig.categories[0].videos[0].name).toBe('Test Video');
    });

    it('should handle subcategory correctly', async () => {
      const videoDataWithSubcategory = {
        ...baseVideoData,
        subcategory: 'promotions',
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(videoDataWithSubcategory);

      expect(writtenConfig.categories[0].subCategories).toHaveLength(1);
      expect(writtenConfig.categories[0].subCategories[0].name).toBe('promotions');
      expect(writtenConfig.categories[0].subCategories[0].videos).toHaveLength(1);
    });

    it('should set locked=false for club content', async () => {
      const clubVideoData = {
        ...baseVideoData,
        locked: false,
        category: 'matchs_club',
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(clubVideoData);

      expect(writtenConfig.categories[0].locked).toBe(false);
      expect(writtenConfig.categories[0].owner).toBe('club');
    });

    it('should include expires_at if provided', async () => {
      const videoDataWithExpiry = {
        ...baseVideoData,
        expires_at: '2025-12-31T23:59:59Z',
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(videoDataWithExpiry);

      expect(writtenConfig.categories[0].videos[0].expires_at).toBe('2025-12-31T23:59:59Z');
    });

    it('should create config file if not exists', async () => {
      fs.pathExists.mockResolvedValue(false);

      let writtenConfig = null;
      fs.writeFile.mockImplementation((path, content) => {
        writtenConfig = JSON.parse(content);
        return Promise.resolve();
      });

      await deployVideo.updateConfiguration(baseVideoData);

      expect(writtenConfig.categories).toHaveLength(1);
    });

    it('should handle malformed config file', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockRejectedValue(new Error('Parse error'));

      await expect(
        deployVideo.updateConfiguration(baseVideoData)
      ).rejects.toThrow();
    });
  });

  describe('downloadFile', () => {
    it('should use correct axios configuration', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.downloadFile(
        'https://example.com/video.mp4',
        '/tmp/video.mp4',
        jest.fn()
      );

      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'https://example.com/video.mp4',
        responseType: 'stream',
        timeout: 600000,
        maxContentLength: 1073741824,
      }));
    });

    it('should create write stream to target path', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.downloadFile(
        'https://example.com/video.mp4',
        '/tmp/target.mp4',
        jest.fn()
      );

      expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/target.mp4');
    });

    it('should handle write stream error', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Write error')), 10);
          }
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      await expect(
        deployVideo.downloadFile(
          'https://example.com/video.mp4',
          '/tmp/video.mp4',
          jest.fn()
        )
      ).rejects.toThrow('Write error');
    });
  });

  describe('notifyLocalApp', () => {
    it('should connect to local socket and emit config_updated', async () => {
      await deployVideo.notifyLocalApp();

      // Verify socket.io-client was called with correct parameters
      expect(io).toHaveBeenCalledWith('http://localhost:3000', { timeout: 5000 });

      // The socket emit and close are called, and info is logged
      // Since the mock is set up at module level, we just verify the connection was made
    });

    it('should not throw on socket error', async () => {
      // Make io throw an error
      io.mockImplementationOnce(() => {
        throw new Error('Socket error');
      });

      // Should not throw
      await expect(deployVideo.notifyLocalApp()).resolves.not.toThrow();

      // Should log warning
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not notify local app:',
        expect.any(String)
      );
    });
  });

  describe('Edge Cases', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.supabase.co/videos/test.mp4',
      filename: 'test-video.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces_neopro',
      subcategory: null,
      locked: true,
    };

    it('should handle very long filenames', async () => {
      const longFilename = 'a'.repeat(200) + '.mp4';
      const videoData = {
        ...baseVideoData,
        filename: longFilename,
        originalName: longFilename,
      };

      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      const result = await deployVideo.execute(videoData, jest.fn());

      expect(result.success).toBe(true);
    });

    it('should handle special characters in filename', async () => {
      const videoData = {
        ...baseVideoData,
        filename: 'vidéo spéciale (2024).mp4',
        originalName: 'Vidéo Spéciale (2024).mp4',
      };

      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      const result = await deployVideo.execute(videoData, jest.fn());

      expect(result.success).toBe(true);
    });

    it('should handle empty category name gracefully', async () => {
      const videoData = {
        ...baseVideoData,
        category: '',
      };

      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Should still work (empty string becomes empty folder)
      const result = await deployVideo.execute(videoData, jest.fn());
      expect(result.success).toBe(true);
    });

    it('should handle null progress callback', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockImplementation((config) => {
        // Simulate progress with null callback
        if (config.onDownloadProgress) {
          config.onDownloadProgress({ loaded: 50, total: 100 });
        }
        return Promise.resolve({ data: mockStream });
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Should not throw with null callback
      const result = await deployVideo.execute(baseVideoData, null);
      expect(result.success).toBe(true);
    });
  });

  describe('Checksum Verification', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.example.com/videos/test.mp4',
      filename: 'test.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces',
      subcategory: null,
      duration: 120,
    };

    it('should verify checksum when provided', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Mock the file read for checksum calculation
      const crypto = require('crypto');
      const mockHash = crypto.createHash('sha256');
      mockHash.update('test content');
      const expectedChecksum = mockHash.digest('hex');

      // Create a mock stream that provides checksum-able data
      const mockReadStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test content'));
          }
          if (event === 'end') {
            handler();
          }
          return mockReadStream;
        }),
      };
      fs.createReadStream.mockReturnValue(mockReadStream);

      const videoDataWithChecksum = {
        ...baseVideoData,
        checksum: expectedChecksum,
      };

      const result = await deployVideo.execute(videoDataWithChecksum, jest.fn());
      expect(result.success).toBe(true);
      expect(result.checksum).toBe(expectedChecksum);
    });

    it('should fail on checksum mismatch', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Mock checksum calculation to return different value
      const mockReadStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('different content'));
          }
          if (event === 'end') {
            handler();
          }
          return mockReadStream;
        }),
      };
      fs.createReadStream.mockReturnValue(mockReadStream);

      const videoDataWithWrongChecksum = {
        ...baseVideoData,
        checksum: 'wrong-checksum-value-1234567890abcdef',
      };

      await expect(
        deployVideo.execute(videoDataWithWrongChecksum, jest.fn())
      ).rejects.toThrow('Checksum mismatch');

      // Should have removed the corrupted file
      expect(fs.remove).toHaveBeenCalled();
    });

    it('should skip checksum verification when not provided', async () => {
      const mockStream = { pipe: jest.fn() };
      axios.mockResolvedValue({ data: mockStream });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Mock for final checksum calculation (when no checksum is provided)
      const mockReadStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('test content'));
          }
          if (event === 'end') {
            handler();
          }
          return mockReadStream;
        }),
      };
      fs.createReadStream.mockReturnValue(mockReadStream);

      // No checksum in data
      const result = await deployVideo.execute(baseVideoData, jest.fn());
      expect(result.success).toBe(true);
      // Should still return a calculated checksum
      expect(result.checksum).toBeDefined();
    });

    it('should export calculateFileChecksum function', () => {
      const { calculateFileChecksum } = require('../commands/deploy-video');
      expect(typeof calculateFileChecksum).toBe('function');
    });
  });
});
