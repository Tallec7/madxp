/**
 * Tests unitaires pour le service de compression vidéo
 *
 * @module video-compression.service.test
 */

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock fs
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
};
jest.mock('fs', () => mockFs);

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

// Mock logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { EventEmitter } from 'events';

describe('VideoCompressionService', () => {
  let videoCompressionService: typeof import('./video-compression.service').videoCompressionService;

  // Helper to create mock process
  const createMockProcess = (exitCode: number = 0, emitError: boolean = false) => {
    const process = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    process.stderr = new EventEmitter();

    setTimeout(() => {
      if (emitError) {
        process.emit('error', new Error('spawn error'));
      } else {
        process.emit('close', exitCode);
      }
    }, 0);

    return process;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Default mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.unlinkSync.mockReturnValue(undefined);
    mockSpawn.mockReturnValue(createMockProcess(0));
  });

  describe('constructor', () => {
    it('should create temp directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      jest.isolateModules(() => {
        require('./video-compression.service');
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('neopro-video-compression'),
        { recursive: true }
      );
    });

    it('should not create temp directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        require('./video-compression.service');
      });

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        videoCompressionService = require('./video-compression.service').videoCompressionService;
      });
    });

    it('should return true when ffmpeg is available', async () => {
      mockSpawn.mockReturnValue(createMockProcess(0));

      const result = await videoCompressionService.isAvailable();

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    it('should return false when ffmpeg exits with non-zero code', async () => {
      mockSpawn.mockReturnValue(createMockProcess(1));

      const result = await videoCompressionService.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when ffmpeg spawn errors', async () => {
      mockSpawn.mockReturnValue(createMockProcess(0, true));

      const result = await videoCompressionService.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('shouldCompress', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        videoCompressionService = require('./video-compression.service').videoCompressionService;
      });
    });

    it('should return true for files larger than threshold (100MB default)', () => {
      const fileSizeBytes = 150 * 1024 * 1024; // 150MB
      expect(videoCompressionService.shouldCompress(fileSizeBytes)).toBe(true);
    });

    it('should return false for files smaller than threshold', () => {
      const fileSizeBytes = 50 * 1024 * 1024; // 50MB
      expect(videoCompressionService.shouldCompress(fileSizeBytes)).toBe(false);
    });

    it('should return false for files exactly at threshold', () => {
      const fileSizeBytes = 100 * 1024 * 1024; // 100MB
      expect(videoCompressionService.shouldCompress(fileSizeBytes)).toBe(false);
    });
  });

  describe('compressVideo', () => {
    // Use smaller buffers to avoid memory issues in tests
    const inputBuffer = Buffer.alloc(1024); // 1KB for testing
    const outputBuffer = Buffer.alloc(512); // 512B (compressed)

    beforeEach(() => {
      jest.isolateModules(() => {
        videoCompressionService = require('./video-compression.service').videoCompressionService;
      });
    });

    it('should return error if ffmpeg is not available', async () => {
      mockSpawn.mockReturnValue(createMockProcess(1));

      const result = await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      expect(result.buffer).toBeNull();
      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('ffmpeg not available');
    });

    it('should successfully compress a video', async () => {
      // First call checks ffmpeg availability
      // Second call runs compression
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        return createMockProcess(0);
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('output-')) return true;
        return true;
      });
      mockFs.readFileSync.mockReturnValue(outputBuffer);

      const result = await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      expect(result.result.success).toBe(true);
      expect(result.result.inputSize).toBe(inputBuffer.length);
      expect(result.result.outputSize).toBe(outputBuffer.length);
      expect(result.result.compressionRatio).toBeGreaterThan(1);
      expect(result.buffer).toEqual(outputBuffer);
    });

    it('should return original buffer if compression ratio is not significant', async () => {
      // Mock both ffmpeg check and compression
      mockSpawn.mockImplementation(() => createMockProcess(0));
      mockFs.existsSync.mockReturnValue(true);
      // Output is almost same size as input
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(inputBuffer.length * 0.95));

      const result = await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      expect(result.result.success).toBe(true);
      expect(result.buffer).toEqual(inputBuffer);
      expect(result.result.compressionRatio).toBe(1);
    });

    it('should return error if output file not created', async () => {
      // Mock both ffmpeg check and compression
      mockSpawn.mockImplementation(() => createMockProcess(0));
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('output-')) return false;
        return true;
      });

      const result = await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      expect(result.buffer).toBeNull();
      expect(result.result.success).toBe(false);
      expect(result.result.error).toBe('Output file not created');
    });

    it('should use default mp4 extension if original has no extension', async () => {
      // Mock both ffmpeg check and compression
      mockSpawn.mockImplementation(() => createMockProcess(0));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(outputBuffer);

      await videoCompressionService.compressVideo(inputBuffer, 'video_no_ext');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/input-test-uuid-1234\.mp4$/),
        inputBuffer
      );
    });

    it('should apply custom compression options', async () => {
      // Mock both ffmpeg check and compression
      mockSpawn.mockImplementation(() => createMockProcess(0));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(outputBuffer);

      await videoCompressionService.compressVideo(inputBuffer, 'test.mp4', {
        crf: 28,
        preset: 'fast',
        maxBitrate: '4M',
      });

      // Verify ffmpeg was called with custom options
      expect(mockSpawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-crf', '28', '-preset', 'fast'])
      );
    });

    it('should clean up temp files after compression', async () => {
      // Mock both ffmpeg check and compression
      mockSpawn.mockImplementation(() => createMockProcess(0));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(outputBuffer);

      await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      // Should have attempted to clean up both input and output files
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should handle compression error gracefully', async () => {
      // First call for ffmpeg check succeeds
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockProcess(0);
        }
        // Second call (compression) fails
        const process = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
        process.stderr = new EventEmitter();
        setTimeout(() => {
          process.stderr.emit('data', Buffer.from('ffmpeg error'));
          process.emit('close', 1);
        }, 0);
        return process;
      });

      const result = await videoCompressionService.compressVideo(inputBuffer, 'test.mp4');

      expect(result.buffer).toBeNull();
      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain('ffmpeg exited with code 1');
    });
  });

  describe('cleanupOldTempFiles', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        videoCompressionService = require('./video-compression.service').videoCompressionService;
      });
    });

    it('should delete files older than 1 hour', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      mockFs.readdirSync.mockReturnValue(['old-file.mp4', 'recent-file.mp4']);
      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('old-file')) {
          return { mtime: twoHoursAgo };
        }
        return { mtime: thirtyMinutesAgo };
      });

      const cleaned = await videoCompressionService.cleanupOldTempFiles();

      expect(cleaned).toBe(1);
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('old-file.mp4'));
    });

    it('should return 0 if no old files found', async () => {
      mockFs.readdirSync.mockReturnValue(['recent-file.mp4']);
      mockFs.statSync.mockReturnValue({ mtime: new Date() });

      const cleaned = await videoCompressionService.cleanupOldTempFiles();

      expect(cleaned).toBe(0);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Directory read error');
      });

      const cleaned = await videoCompressionService.cleanupOldTempFiles();

      expect(cleaned).toBe(0);
    });

    it('should handle empty temp directory', async () => {
      mockFs.readdirSync.mockReturnValue([]);

      const cleaned = await videoCompressionService.cleanupOldTempFiles();

      expect(cleaned).toBe(0);
    });
  });
});
