const fs = require('fs');
const axios = require('axios');
const BufferService = require('../services/buffer.service');

jest.mock('fs');
jest.mock('axios');

describe('BufferService', () => {
  const defaultOpts = {
    filePath: '/tmp/test_buffer.json',
    label: 'TestBuffer',
    centralUrl: 'https://central.example.com',
    centralEndpoint: '/api/test/data',
    payloadKey: 'items',
    siteId: 'site-123',
    isCloudEnv: false,
  };

  let service;

  beforeEach(() => {
    service = new BufferService(defaultOpts);
    jest.clearAllMocks();
    // Default: file doesn't exist
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
  });

  // --- Local storage ---
  describe('add (local storage)', () => {
    it('should write items to buffer file', async () => {
      const events = [{ id: 1 }, { id: 2 }];
      const result = await service.add(events);

      expect(result.success).toBe(true);
      expect(result.received).toBe(2);
      expect(result.total).toBe(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        defaultOpts.filePath,
        expect.any(String)
      );
    });

    it('should append to existing buffer', async () => {
      fs.existsSync.mockImplementation((p) => p === defaultOpts.filePath);
      fs.readFileSync.mockReturnValue(JSON.stringify([{ id: 0 }]));

      const result = await service.add([{ id: 1 }]);
      expect(result.total).toBe(2);
    });

    it('should create directory if missing', async () => {
      await service.add([{ id: 1 }]);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should apply transform function', async () => {
      // Cloud env → will try to forward first
      const cloudService = new BufferService({ ...defaultOpts, isCloudEnv: true });
      axios.post.mockResolvedValue({ data: { recorded: 1 } });

      const transform = (items) => items.map((i) => ({ ...i, extra: true }));
      const result = await cloudService.add([{ id: 1 }], transform);
      expect(result.forwarded).toBe(true);

      const postedBody = axios.post.mock.calls[0][1];
      expect(postedBody.items[0].extra).toBe(true);
    });
  });

  // --- Cloud forwarding ---
  describe('add (cloud forwarding)', () => {
    let cloudService;

    beforeEach(() => {
      cloudService = new BufferService({ ...defaultOpts, isCloudEnv: true });
    });

    it('should forward to central server when cloud env', async () => {
      axios.post.mockResolvedValue({ data: { recorded: 2 } });

      const result = await cloudService.add([{ id: 1 }, { id: 2 }]);

      expect(result.forwarded).toBe(true);
      expect(result.recorded).toBe(2);
      expect(result.received).toBe(2);
      expect(axios.post).toHaveBeenCalledWith(
        'https://central.example.com/api/test/data',
        expect.any(Object),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('should add site_id at top level for analytics (payloadKey=plays)', async () => {
      const analyticsService = new BufferService({
        ...defaultOpts,
        isCloudEnv: true,
        payloadKey: 'plays',
      });
      axios.post.mockResolvedValue({ data: { recorded: 1 } });

      await analyticsService.add([{ id: 1 }]);

      const postedBody = axios.post.mock.calls[0][1];
      expect(postedBody.site_id).toBe('site-123');
      expect(postedBody.plays).toBeDefined();
    });

    it('should NOT add site_id at top level for non-analytics payloads', async () => {
      axios.post.mockResolvedValue({ data: { recorded: 1 } });

      await cloudService.add([{ id: 1 }]);

      const postedBody = axios.post.mock.calls[0][1];
      expect(postedBody.site_id).toBeUndefined();
    });

    it('should fall back to local storage when forwarding fails', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      const result = await cloudService.add([{ id: 1 }]);

      expect(result.forwarded).toBeUndefined();
      expect(result.total).toBe(1);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should not forward when siteId is missing', async () => {
      const noSiteService = new BufferService({
        ...defaultOpts,
        isCloudEnv: true,
        siteId: undefined,
      });

      const result = await noSiteService.add([{ id: 1 }]);
      expect(result.total).toBe(1);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  // --- Stats ---
  describe('getStats', () => {
    it('should return zeros when no buffer file', () => {
      fs.existsSync.mockReturnValue(false);

      const stats = service.getStats('played_at');
      expect(stats).toEqual({ count: 0, oldest: null, newest: null });
    });

    it('should return stats from buffer', () => {
      const buffer = [
        { played_at: '2024-01-01' },
        { played_at: '2024-01-02' },
        { played_at: '2024-01-03' },
      ];
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(buffer));

      const stats = service.getStats('played_at');
      expect(stats.count).toBe(3);
      expect(stats.oldest).toBe('2024-01-01');
      expect(stats.newest).toBe('2024-01-03');
    });

    it('should handle corrupt buffer file gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not-json');

      const stats = service.getStats('played_at');
      expect(stats).toEqual({ count: 0, oldest: null, newest: null });
    });
  });
});
