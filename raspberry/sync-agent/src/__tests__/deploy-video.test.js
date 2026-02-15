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

// Mock local-socket service
const mockSocketEmit = jest.fn(() => true);
jest.mock('../services/local-socket', () => ({
  emit: mockSocketEmit,
  request: jest.fn(() => Promise.resolve(null)),
  isConnected: jest.fn(() => true),
  connect: jest.fn(),
  disconnect: jest.fn(),
}));

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
const localSocket = require('../services/local-socket');

// Checksum de test valide (correspond au contenu 'test video content')
const crypto = require('crypto');
const TEST_CONTENT = 'test video content';
const TEST_CHECKSUM = crypto.createHash('sha256').update(TEST_CONTENT).digest('hex');

describe('Deploy Video Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketEmit.mockClear();

    // Setup default mocks
    fs.ensureDir.mockResolvedValue(undefined);
    fs.pathExists.mockResolvedValue(false);
    fs.writeFile.mockResolvedValue(undefined);
    fs.readFile.mockResolvedValue(JSON.stringify({ categories: [] }));
    fs.stat.mockResolvedValue({ size: 1024000 });
    fs.remove.mockResolvedValue(undefined);
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
          callback(Buffer.from(TEST_CONTENT));
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
      filename: 'Test Video.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces_neopro',
      subcategory: null,
      locked: true,
      checksum: TEST_CHECKSUM,
    };

    it('should successfully deploy a video', async () => {
      // Mock successful download with headers
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'end') setTimeout(callback, 5);
          return mockStream;
        }),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
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
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);

      const result = await deployVideo.execute(baseVideoData, jest.fn());

      expect(result.success).toBe(true);
      expect(result.path).toContain('Test Video.mp4');
      expect(fs.ensureDir).toHaveBeenCalled();
    });

    // Helper pour creer un mock de download reussi
    function setupSuccessfulDownloadMock() {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(TEST_CONTENT));
          }
          return mockStream;
        }),
      };
      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);
      return { mockStream, mockWriter };
    }

    it('should create target directory if not exists', async () => {
      setupSuccessfulDownloadMock();

      await deployVideo.execute(baseVideoData, jest.fn());

      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('annonces_neopro')
      );
    });

    it('should handle subcategory in path', async () => {
      setupSuccessfulDownloadMock();

      const videoData = {
        ...baseVideoData,
        subcategory: 'promotions',
      };

      await deployVideo.execute(videoData, jest.fn());

      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('promotions')
      );
    });

    it('should call progress callback during download', async () => {
      const progressCallback = jest.fn();

      // Mock axios avec simulation de progression
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            // Simulate data chunks that trigger progress
            callback(Buffer.alloc(512000)); // 50%
            callback(Buffer.alloc(512000)); // 100%
          }
          return mockStream;
        }),
      };
      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.execute(baseVideoData, progressCallback);

      // Le callback progress doit etre appele
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should throw error on download failure', async () => {
      axios.mockRejectedValue(new Error('Network error'));

      await expect(
        deployVideo.execute(baseVideoData, jest.fn())
      ).rejects.toThrow('Échec du téléchargement vidéo: Network error');
    });

    it('should update configuration after successful download', async () => {
      setupSuccessfulDownloadMock();

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
      setupSuccessfulDownloadMock();

      await deployVideo.execute(baseVideoData, jest.fn());

      // Verify local-socket emit was called for local notification
      expect(localSocket.emit).toHaveBeenCalledWith('config_updated');
    });
  });

  describe('updateConfiguration', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.supabase.co/videos/test.mp4',
      filename: 'Test Video.mp4',
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
            path: 'videos/annonces_neopro/Test Video.mp4',
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
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event) => mockStream),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
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
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event) => mockStream),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);

      await deployVideo.downloadFile(
        'https://example.com/video.mp4',
        '/tmp/target.mp4',
        jest.fn()
      );

      // Le fichier est cree avec .tmp puis renomme
      expect(fs.createWriteStream).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/target.mp4'),
        expect.any(Object)
      );
    });

    it('should handle write stream error', async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event) => mockStream),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });

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
    it('should emit config_updated via local-socket', async () => {
      await deployVideo.notifyLocalApp();

      expect(localSocket.emit).toHaveBeenCalledWith('config_updated');
      expect(logger.info).toHaveBeenCalledWith('Local app notified of configuration change');
    });
  });

  describe('Edge Cases', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.supabase.co/videos/test.mp4',
      filename: '4057ba2e-3b75-4db3-bd03-98caf48eb70d.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces_neopro',
      subcategory: null,
      locked: true,
      checksum: TEST_CHECKSUM,
    };

    // Helper pour configurer un mock de download reussi
    function setupDownloadMock() {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from(TEST_CONTENT));
          return mockStream;
        }),
      };
      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);
    }

    it('should handle very long filenames', async () => {
      setupDownloadMock();

      const longFilename = 'a'.repeat(200) + '.mp4';
      const videoData = {
        ...baseVideoData,
        filename: longFilename,
        originalName: longFilename,
      };

      const result = await deployVideo.execute(videoData, jest.fn());
      expect(result.success).toBe(true);
    });

    it('should handle special characters in filename', async () => {
      setupDownloadMock();

      const videoData = {
        ...baseVideoData,
        filename: 'video speciale (2024).mp4',
        originalName: 'Video Speciale (2024).mp4',
      };

      const result = await deployVideo.execute(videoData, jest.fn());
      expect(result.success).toBe(true);
    });

    it('should generate a unique filename when the target already exists', async () => {
      setupDownloadMock();

      const existingPath = path.join(
        '/home/pi/neopro/videos',
        baseVideoData.category,
        baseVideoData.originalName
      );

      let callCount = 0;
      fs.pathExists.mockImplementation((p) => {
        if (p.includes('configuration.json')) return Promise.resolve(true);
        // First call for the exact path returns true (file exists)
        // Second call for (1) version returns false
        if (p.includes('Test Video.mp4') && !p.includes('(1)')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      });

      const result = await deployVideo.execute(baseVideoData, jest.fn());
      expect(result.path).toContain('(1)');
    });

    it('should handle empty category name gracefully', async () => {
      setupDownloadMock();

      const videoData = {
        ...baseVideoData,
        category: '',
      };

      // Should still work (empty string becomes empty folder)
      const result = await deployVideo.execute(videoData, jest.fn());
      expect(result.success).toBe(true);
    });

    it('should handle null progress callback', async () => {
      setupDownloadMock();

      // Should not throw with null callback
      const result = await deployVideo.execute(baseVideoData, null);
      expect(result.success).toBe(true);
    });
  });

  describe('Checksum Verification', () => {
    const baseVideoData = {
      videoUrl: 'https://storage.example.com/videos/test.mp4',
      filename: '4057ba2e-3b75-4db3-bd03-98caf48eb70d.mp4',
      originalName: 'Test Video.mp4',
      category: 'annonces',
      subcategory: null,
      duration: 120,
      checksum: TEST_CHECKSUM,
    };

    it('should verify checksum when provided', async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from(TEST_CONTENT));
          return mockStream;
        }),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);

      const result = await deployVideo.execute(baseVideoData, jest.fn());
      expect(result.success).toBe(true);
      expect(result.checksum).toBe(TEST_CHECKSUM);
    });

    it('should fail on checksum mismatch', async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event) => mockStream),
      };
      axios.mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': '1024000' },
      });

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockWriter;
        }),
      };
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.rename.mockResolvedValue(undefined);
      mockStream.pipe.mockReturnValue(mockWriter);

      // Mock checksum calculation to return different value
      const mockReadStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from('different content that produces different hash'));
          }
          if (event === 'end') {
            handler();
          }
          return mockReadStream;
        }),
      };
      fs.createReadStream.mockReturnValue(mockReadStream);

      await expect(
        deployVideo.execute(baseVideoData, jest.fn())
      ).rejects.toThrow('Checksum incorrect');

      expect(fs.remove).toHaveBeenCalled();
    });

    it('should reject deployment when no checksum provided', async () => {
      const videoDataWithoutChecksum = {
        videoUrl: 'https://storage.example.com/videos/test.mp4',
        filename: 'test.mp4',
        originalName: 'Test Video.mp4',
        category: 'annonces',
      };

      await expect(
        deployVideo.execute(videoDataWithoutChecksum, jest.fn())
      ).rejects.toThrow('Checksum is required for video deployment');
    });

    it('should export calculateFileChecksum function', () => {
      const { calculateFileChecksum } = require('../commands/deploy-video');
      expect(typeof calculateFileChecksum).toBe('function');
    });
  });
});
