/**
 * Tests unitaires pour le service de génération de thumbnails
 *
 * @module thumbnail.service.test
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
  unlinkSync: jest.fn(),
};
jest.mock('fs', () => mockFs);

// Mock logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { EventEmitter } from 'events';

describe('ThumbnailService', () => {
  let thumbnailService: typeof import('./thumbnail.service').thumbnailService;

  // Helper to create mock process with stdout/stderr
  const createMockProcess = (
    exitCode: number = 0,
    stdout: string = '',
    emitError: boolean = false
  ) => {
    const process = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    process.stdout = new EventEmitter();
    process.stderr = new EventEmitter();

    setTimeout(() => {
      if (stdout) {
        process.stdout.emit('data', Buffer.from(stdout));
      }
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
    mockFs.unlinkSync.mockReturnValue(undefined);
  });

  describe('constructor', () => {
    it('should create thumbnail directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      jest.isolateModules(() => {
        require('./thumbnail.service');
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('thumbnails'),
        { recursive: true }
      );
    });

    it('should not create thumbnail directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      jest.isolateModules(() => {
        require('./thumbnail.service');
      });

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        thumbnailService = require('./thumbnail.service').thumbnailService;
      });
    });

    it('should return true when ffmpeg is available', async () => {
      mockSpawn.mockReturnValue(createMockProcess(0));

      const result = await thumbnailService.isAvailable();

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    it('should return false when ffmpeg exits with non-zero code', async () => {
      mockSpawn.mockReturnValue(createMockProcess(1));

      const result = await thumbnailService.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when ffmpeg spawn errors', async () => {
      mockSpawn.mockReturnValue(createMockProcess(0, '', true));

      const result = await thumbnailService.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('generateThumbnail', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        thumbnailService = require('./thumbnail.service').thumbnailService;
      });
    });

    it('should return null if video file does not exist', async () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('video.mp4')) return false;
        return true;
      });

      const result = await thumbnailService.generateThumbnail('/path/to/video.mp4', 'video-123');

      expect(result).toBeNull();
    });

    it('should generate thumbnail at default 10% position', async () => {
      mockFs.existsSync.mockReturnValue(true);

      // Mock ffprobe for metadata extraction
      const ffprobeOutput = JSON.stringify({
        streams: [{ width: 1920, height: 1080, codec_name: 'h264', r_frame_rate: '30/1' }],
        format: { duration: '120.5' },
      });

      let callCount = 0;
      mockSpawn.mockImplementation((cmd: string) => {
        callCount++;
        if (cmd === 'ffprobe') {
          return createMockProcess(0, ffprobeOutput);
        }
        return createMockProcess(0);
      });

      const result = await thumbnailService.generateThumbnail('/path/to/video.mp4', 'video-123');

      expect(result).toContain('video-123.jpg');
      // Should have called ffprobe first, then ffmpeg
      expect(mockSpawn).toHaveBeenCalledWith('ffprobe', expect.any(Array));
      expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', expect.any(Array));
    });

    it('should generate thumbnail at custom position', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const ffprobeOutput = JSON.stringify({
        streams: [{ width: 1920, height: 1080 }],
        format: { duration: '100' },
      });

      mockSpawn.mockImplementation((cmd: string) => {
        if (cmd === 'ffprobe') {
          return createMockProcess(0, ffprobeOutput);
        }
        return createMockProcess(0);
      });

      await thumbnailService.generateThumbnail('/path/to/video.mp4', 'video-123', 50);

      // Verify ffmpeg was called with seek time at 50% (50 seconds for 100s video)
      expect(mockSpawn).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-ss', '50'])
      );
    });

    it('should return null on ffmpeg error', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const ffprobeOutput = JSON.stringify({
        streams: [{}],
        format: { duration: '100' },
      });

      mockSpawn.mockImplementation((cmd: string) => {
        if (cmd === 'ffprobe') {
          return createMockProcess(0, ffprobeOutput);
        }
        // ffmpeg fails
        const process = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
        };
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        setTimeout(() => {
          process.stderr.emit('data', Buffer.from('ffmpeg error'));
          process.emit('close', 1);
        }, 0);
        return process;
      });

      const result = await thumbnailService.generateThumbnail('/path/to/video.mp4', 'video-123');

      expect(result).toBeNull();
    });
  });

  describe('extractMetadata', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        thumbnailService = require('./thumbnail.service').thumbnailService;
      });
    });

    it('should return default metadata if video file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await thumbnailService.extractMetadata('/path/to/nonexistent.mp4');

      expect(result).toEqual({
        duration: 0,
        width: 0,
        height: 0,
        codec: 'unknown',
        bitrate: 0,
        fps: 0,
      });
    });

    it('should extract complete video metadata', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const ffprobeOutput = JSON.stringify({
        streams: [{
          width: 1920,
          height: 1080,
          codec_name: 'h264',
          bit_rate: '5000000',
          r_frame_rate: '30/1',
        }],
        format: { duration: '120.5' },
      });

      mockSpawn.mockReturnValue(createMockProcess(0, ffprobeOutput));

      const result = await thumbnailService.extractMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 120.5,
        width: 1920,
        height: 1080,
        codec: 'h264',
        bitrate: 5000000,
        fps: 30,
      });
    });

    it('should handle fractional frame rates', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const ffprobeOutput = JSON.stringify({
        streams: [{
          r_frame_rate: '24000/1001', // ~23.976 fps
        }],
        format: {},
      });

      mockSpawn.mockReturnValue(createMockProcess(0, ffprobeOutput));

      const result = await thumbnailService.extractMetadata('/path/to/video.mp4');

      expect(result.fps).toBeCloseTo(23.98, 1);
    });

    it('should handle missing stream data gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const ffprobeOutput = JSON.stringify({
        streams: [],
        format: { duration: '60' },
      });

      mockSpawn.mockReturnValue(createMockProcess(0, ffprobeOutput));

      const result = await thumbnailService.extractMetadata('/path/to/video.mp4');

      expect(result.duration).toBe(60);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.codec).toBe('unknown');
    });

    it('should return default metadata on ffprobe error', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const process = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      setTimeout(() => {
        process.stderr.emit('data', Buffer.from('ffprobe error'));
        process.emit('close', 1);
      }, 0);

      mockSpawn.mockReturnValue(process);

      const result = await thumbnailService.extractMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 0,
        width: 0,
        height: 0,
        codec: 'unknown',
        bitrate: 0,
        fps: 0,
      });
    });

    it('should handle invalid JSON from ffprobe', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockSpawn.mockReturnValue(createMockProcess(0, 'not valid json'));

      const result = await thumbnailService.extractMetadata('/path/to/video.mp4');

      expect(result).toEqual({
        duration: 0,
        width: 0,
        height: 0,
        codec: 'unknown',
        bitrate: 0,
        fps: 0,
      });
    });
  });

  describe('deleteThumbnail', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        thumbnailService = require('./thumbnail.service').thumbnailService;
      });
    });

    it('should delete existing thumbnail and return true', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = await thumbnailService.deleteThumbnail('video-123');

      expect(result).toBe(true);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('video-123.jpg'));
    });

    it('should return false if thumbnail does not exist', async () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('video-123.jpg')) return false;
        return true;
      });

      const result = await thumbnailService.deleteThumbnail('video-123');

      expect(result).toBe(false);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should return false on deletion error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await thumbnailService.deleteThumbnail('video-123');

      expect(result).toBe(false);
    });
  });

  describe('getThumbnailPath', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        thumbnailService = require('./thumbnail.service').thumbnailService;
      });
    });

    it('should return path if thumbnail exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = thumbnailService.getThumbnailPath('video-123');

      expect(result).toContain('video-123.jpg');
    });

    it('should return null if thumbnail does not exist', () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('video-123.jpg')) return false;
        return true;
      });

      const result = thumbnailService.getThumbnailPath('video-123');

      expect(result).toBeNull();
    });
  });
});
