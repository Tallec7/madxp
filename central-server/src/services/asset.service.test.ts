/**
 * Tests for AssetService
 *
 * Tests watermark upload, deployment, and configuration validation.
 */

import { assetService } from './asset.service';
import { commandQueueService } from './command-queue.service';
import { isFtpConfigured, getFtpPublicUrl, uploadFileToFtp } from '../config/ftp-storage';
import { uploadFile, getPublicUrl } from '../config/supabase';
import logger from '../config/logger';

// Mock dependencies
jest.mock('./command-queue.service');
jest.mock('../config/ftp-storage');
jest.mock('../config/supabase');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const mockCommandQueue = commandQueueService as jest.Mocked<typeof commandQueueService>;
const mockIsFtpConfigured = isFtpConfigured as jest.MockedFunction<typeof isFtpConfigured>;
const mockGetFtpPublicUrl = getFtpPublicUrl as jest.MockedFunction<typeof getFtpPublicUrl>;
const mockUploadFileToFtp = uploadFileToFtp as jest.MockedFunction<typeof uploadFileToFtp>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockGetPublicUrl = getPublicUrl as jest.MockedFunction<typeof getPublicUrl>;

describe('AssetService', () => {
  const testBuffer = Buffer.from('test image data');
  const testFilename = 'Logo Club.png';
  const siteId = 'site-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadAsset', () => {
    it('should upload to FTP when configured', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(true);
      mockUploadFileToFtp.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://cdn.example.com/watermarks/logo_club.png' });
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/watermarks/logo_club.png');

      // Act
      const result = await assetService.uploadAsset(testBuffer, testFilename, 'watermark');

      // Assert
      expect(result.url).toBe('https://cdn.example.com/watermarks/logo_club.png');
      expect(result.storagePath).toBe('watermarks/logo_club.png');
      expect(result.checksum).toBeDefined();
      expect(mockUploadFileToFtp).toHaveBeenCalledWith(
        testBuffer,
        'watermarks/logo_club.png',
        'image/png'
      );
    });

    it('should fallback to Supabase when FTP not configured', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(false);
      mockUploadFile.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://supabase.co/storage/watermarks/logo_club.png' });
      mockGetPublicUrl.mockReturnValue('https://supabase.co/storage/watermarks/logo_club.png');

      // Act
      const result = await assetService.uploadAsset(testBuffer, testFilename, 'watermark');

      // Assert
      expect(result.url).toBe('https://supabase.co/storage/watermarks/logo_club.png');
      expect(mockUploadFile).toHaveBeenCalled();
      expect(mockUploadFileToFtp).not.toHaveBeenCalled();
    });

    it('should sanitize filename with accents and special characters', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(true);
      mockUploadFileToFtp.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://cdn.example.com/watermarks/logo_club.png' });
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/watermarks/logo_equipe.png');

      // Act
      await assetService.uploadAsset(testBuffer, 'Logo Équipe!@#.png', 'watermark');

      // Assert
      expect(mockUploadFileToFtp).toHaveBeenCalledWith(
        testBuffer,
        'watermarks/logo_equipe_.png',
        'image/png'
      );
    });

    it('should use assets folder for non-watermark types', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(true);
      mockUploadFileToFtp.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://cdn.example.com/watermarks/logo_club.png' });
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/assets/logo.png');

      // Act
      await assetService.uploadAsset(testBuffer, 'logo.png', 'logo');

      // Assert
      expect(mockUploadFileToFtp).toHaveBeenCalledWith(
        testBuffer,
        'assets/logo.png',
        'image/png'
      );
    });

    it('should calculate consistent checksum for same content', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(true);
      mockUploadFileToFtp.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://cdn.example.com/watermarks/logo_club.png' });
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/watermarks/test.png');

      // Act
      const result1 = await assetService.uploadAsset(testBuffer, 'test1.png', 'watermark');
      const result2 = await assetService.uploadAsset(testBuffer, 'test2.png', 'watermark');

      // Assert
      expect(result1.checksum).toBe(result2.checksum);
    });
  });

  describe('deployAssetToSite', () => {
    it('should queue deploy_asset command', async () => {
      // Arrange
      mockCommandQueue.sendOrQueue.mockResolvedValue({
        sent: true,
        queued: false,
        commandId: 'cmd-123',
        message: 'Command sent',
      });

      // Act
      const result = await assetService.deployAssetToSite(
        siteId,
        'https://cdn.example.com/watermarks/logo.png',
        'logo.png',
        'assets/watermarks/logo.png',
        'abc123',
        'watermark'
      );

      // Assert
      expect(result.sent).toBe(true);
      expect(result.queued).toBe(false);
      expect(result.commandId).toBe('cmd-123');
      expect(mockCommandQueue.sendOrQueue).toHaveBeenCalledWith(
        siteId,
        'deploy_asset',
        expect.objectContaining({
          assetUrl: 'https://cdn.example.com/watermarks/logo.png',
          filename: 'logo.png',
          targetPath: 'assets/watermarks/logo.png',
          checksum: 'abc123',
          assetType: 'watermark',
        }),
        expect.objectContaining({
          priority: 4,
        })
      );
    });

    it('should return queued status when site is offline', async () => {
      // Arrange
      mockCommandQueue.sendOrQueue.mockResolvedValue({
        sent: false,
        queued: true,
        commandId: 'cmd-456',
        message: 'Command queued',
      });

      // Act
      const result = await assetService.deployAssetToSite(
        siteId,
        'https://cdn.example.com/watermarks/logo.png',
        'logo.png',
        'assets/watermarks/logo.png',
        'abc123',
        'watermark'
      );

      // Assert
      expect(result.sent).toBe(false);
      expect(result.queued).toBe(true);
    });
  });

  describe('uploadAndDeployWatermark', () => {
    it('should upload then deploy watermark', async () => {
      // Arrange
      mockIsFtpConfigured.mockReturnValue(true);
      mockUploadFileToFtp.mockResolvedValue({ path: 'watermarks/logo_club.png', url: 'https://cdn.example.com/watermarks/logo_club.png' });
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/watermarks/logo.png');
      mockCommandQueue.sendOrQueue.mockResolvedValue({
        sent: true,
        queued: false,
        commandId: 'cmd-789',
        message: 'Command sent',
      });

      // Act
      const result = await assetService.uploadAndDeployWatermark(
        siteId,
        testBuffer,
        'Logo.png'
      );

      // Assert
      expect(result.uploadResult.url).toBe('https://cdn.example.com/watermarks/logo.png');
      expect(result.deployResult.sent).toBe(true);
      expect(mockUploadFileToFtp).toHaveBeenCalled();
      expect(mockCommandQueue.sendOrQueue).toHaveBeenCalledWith(
        siteId,
        'deploy_asset',
        expect.objectContaining({
          targetPath: 'assets/watermarks/logo.png',
        }),
        expect.any(Object)
      );
    });
  });

  describe('createDefaultWatermarkConfig', () => {
    it('should create fullscreen config by default', () => {
      // Act
      const config = assetService.createDefaultWatermarkConfig('assets/watermarks/logo.png');

      // Assert
      expect(config.enabled).toBe(true);
      expect(config.fullscreen).toBe(true);
      expect(config.imagePath).toBe('assets/watermarks/logo.png');
      expect(config.opacity).toBe(100);
      expect(config.animation).toBe('fade');
    });

    it('should create positioned config when fullscreen is false', () => {
      // Act
      const config = assetService.createDefaultWatermarkConfig(
        'assets/watermarks/logo.png',
        'https://cdn.example.com/logo.png',
        false
      );

      // Assert
      expect(config.fullscreen).toBe(false);
      expect(config.opacity).toBe(80);
      expect(config.position).toBe('bottom-right');
      expect(config.cloudUrl).toBe('https://cdn.example.com/logo.png');
    });

    it('should include cloudUrl when provided', () => {
      // Act
      const config = assetService.createDefaultWatermarkConfig(
        'assets/watermarks/logo.png',
        'https://cdn.example.com/logo.png'
      );

      // Assert
      expect(config.cloudUrl).toBe('https://cdn.example.com/logo.png');
    });
  });

  describe('validateWatermarkConfig', () => {
    it('should accept valid config', () => {
      // Arrange
      const config = {
        enabled: true,
        imagePath: 'assets/logo.png',
        opacity: 80,
        position: 'top-right' as const,
        animation: 'fade' as const,
      };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject opacity out of range', () => {
      // Arrange
      const config = { opacity: 150 };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('opacity doit être entre 0 et 100');
    });

    it('should reject negative dimensions', () => {
      // Arrange
      const config = { width: -10, height: -5 };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('width doit être positif');
      expect(result.errors).toContain('height doit être positif');
    });

    it('should reject invalid position', () => {
      // Arrange
      const config = { position: 'invalid-position' as any };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('position invalide');
    });

    it('should reject invalid animation', () => {
      // Arrange
      const config = { animation: 'bounce' as any };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('animation invalide');
    });

    it('should validate schedule rules time format', () => {
      // Arrange
      const config = {
        schedule: {
          enabled: true,
          rules: [
            {
              id: 'rule-1',
              startTime: '25:00', // Invalid
              endTime: '18:00',
              daysOfWeek: [1, 2, 3],
              matchPhases: ['all'] as ('all' | 'neutral' | 'before' | 'during' | 'after')[],
            },
          ],
        },
      };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('startTime invalide: 25:00');
    });

    it('should validate schedule rules days of week', () => {
      // Arrange
      const config = {
        schedule: {
          enabled: true,
          rules: [
            {
              id: 'rule-1',
              startTime: '09:00',
              endTime: '18:00',
              daysOfWeek: [1, 7, 8], // 7 and 8 are invalid
              matchPhases: ['all'] as ('all' | 'neutral' | 'before' | 'during' | 'after')[],
            },
          ],
        },
      };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('daysOfWeek doit contenir des valeurs entre 0 et 6');
    });

    it('should accept valid schedule rules', () => {
      // Arrange
      const config = {
        schedule: {
          enabled: true,
          rules: [
            {
              id: 'rule-1',
              startTime: '09:00',
              endTime: '18:00',
              daysOfWeek: [1, 2, 3, 4, 5],
              matchPhases: ['all'] as ('all' | 'neutral' | 'before' | 'during' | 'after')[],
            },
          ],
        },
      };

      // Act
      const result = assetService.validateWatermarkConfig(config);

      // Assert
      expect(result.valid).toBe(true);
    });

    it('should accept all valid positions', () => {
      // Arrange
      const positions = [
        'top-left', 'top-center', 'top-right',
        'center-left', 'center', 'center-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ];

      // Act & Assert
      for (const position of positions) {
        const result = assetService.validateWatermarkConfig({ position } as any);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept all valid animations', () => {
      // Arrange
      const animations = [
        'none', 'fade', 'slide-left', 'slide-right',
        'slide-top', 'slide-bottom', 'zoom',
      ];

      // Act & Assert
      for (const animation of animations) {
        const result = assetService.validateWatermarkConfig({ animation } as any);
        expect(result.valid).toBe(true);
      }
    });
  });
});
