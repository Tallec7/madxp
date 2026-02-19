/**
 * Tests for VideoProcessingService
 */

const path = require('path');

// Mock fs.promises before requiring the service
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const fs = require('fs').promises;
const VideoProcessingService = require('../services/video-processing.service');

describe('VideoProcessingService', () => {
  let service;

  beforeEach(() => {
    service = new VideoProcessingService();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // addToQueue
  // ===========================================================================

  describe('addToQueue', () => {
    it('should create a job with unique ID and pending status', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT')); // queue.json does not exist

      const jobId = await service.addToQueue({
        inputPath: '/tmp/video.mp4',
        outputPath: '/videos/clip.mp4',
      });

      expect(typeof jobId).toBe('string');
      expect(jobId).toMatch(/^\d+-[a-z0-9]+$/);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();

      // Verify the written data
      const writtenData = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writtenData.jobs).toHaveLength(1);
      expect(writtenData.jobs[0].status).toBe('pending');
      expect(writtenData.jobs[0].inputPath).toBe('/tmp/video.mp4');
    });

    it('should append to existing queue', async () => {
      fs.readFile.mockResolvedValue(
        JSON.stringify({
          jobs: [{ id: 'existing-job', status: 'processing' }],
        }),
      );

      await service.addToQueue({ inputPath: '/tmp/new.mp4' });

      const writtenData = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writtenData.jobs).toHaveLength(2);
    });
  });

  // ===========================================================================
  // getJobStatus
  // ===========================================================================

  describe('getJobStatus', () => {
    it('should return job data if status file exists', async () => {
      const jobData = { id: 'test-job', status: 'completed', progress: 100 };
      fs.readFile.mockResolvedValue(JSON.stringify(jobData));

      const result = await service.getJobStatus('test-job');
      expect(result).toEqual(jobData);
    });

    it('should return null if status file does not exist', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getJobStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getQueue
  // ===========================================================================

  describe('getQueue', () => {
    it('should return jobs array', async () => {
      const queue = { jobs: [{ id: 'j1' }, { id: 'j2' }] };
      fs.readFile.mockResolvedValue(JSON.stringify(queue));

      const result = await service.getQueue();
      expect(result).toHaveLength(2);
    });

    it('should return empty array if queue file does not exist', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getQueue();
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getProcessingConfig
  // ===========================================================================

  describe('getProcessingConfig', () => {
    it('should return processing configuration', () => {
      const config = service.getProcessingConfig();
      expect(config).toHaveProperty('compressionEnabled');
      expect(config).toHaveProperty('thumbnailsEnabled');
      expect(config).toHaveProperty('quality');
      expect(typeof config.compressionEnabled).toBe('boolean');
      expect(typeof config.thumbnailsEnabled).toBe('boolean');
    });
  });
});
