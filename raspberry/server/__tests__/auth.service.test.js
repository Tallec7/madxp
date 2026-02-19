const fs = require('fs');
const AuthService = require('../services/auth.service');

jest.mock('fs');

describe('AuthService', () => {
  const CONFIG_PATH = '/tmp/test_configuration.json';
  let service;
  let mockIo;

  beforeEach(() => {
    mockIo = { emit: jest.fn() };
    service = new AuthService({ configPath: CONFIG_PATH, io: mockIo });
    jest.clearAllMocks();
  });

  // --- setup ---
  describe('setup', () => {
    it('should reject empty password', async () => {
      const result = await service.setup('');
      expect(result.status).toBe(400);
      expect(result.error).toBeDefined();
    });

    it('should reject null password', async () => {
      const result = await service.setup(null);
      expect(result.status).toBe(400);
    });

    it('should reject short password (< 4 chars)', async () => {
      const result = await service.setup('abc');
      expect(result.status).toBe(400);
      expect(result.error).toContain('4');
    });

    it('should create config file with password when no existing config', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);

      const result = await service.setup('securepass');

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.stringContaining('securepass')
      );
    });

    it('should add password to existing config', async () => {
      const existingConfig = {
        remote: { title: 'Mon Club' },
        categories: [{ name: 'cat1' }],
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync.mockReturnValue(undefined);

      const result = await service.setup('mypass');
      expect(result.success).toBe(true);

      const writtenData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writtenData.auth.password).toBe('mypass');
      expect(writtenData.auth.configuredAt).toBeDefined();
      expect(writtenData.remote.title).toBe('Mon Club');
      expect(writtenData.categories).toHaveLength(1);
    });

    it('should reject when password already set', async () => {
      const existingConfig = {
        auth: { password: 'existing' },
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));

      const result = await service.setup('newpass');
      expect(result.status).toBe(403);
      expect(result.error).toBeDefined();
    });

    it('should broadcast config reload after successful setup', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);

      await service.setup('testpass');

      expect(mockIo.emit).toHaveBeenCalledWith('action', {
        type: 'reload-config',
        data: expect.objectContaining({
          auth: expect.objectContaining({ password: 'testpass' }),
        }),
      });
    });

    it('should handle corrupt existing config gracefully', async () => {
      fs.existsSync.mockImplementation((p) => p === CONFIG_PATH);
      fs.readFileSync.mockReturnValue('not-valid-json');
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);

      const result = await service.setup('fallback');
      expect(result.success).toBe(true);
    });
  });

  // --- getStatus ---
  describe('getStatus', () => {
    it('should return requiresSetup=true when no config file', () => {
      fs.existsSync.mockReturnValue(false);
      const status = service.getStatus();
      expect(status.requiresSetup).toBe(true);
    });

    it('should return requiresSetup=true when no auth in config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ remote: {} }));

      const status = service.getStatus();
      expect(status.requiresSetup).toBe(true);
    });

    it('should return requiresSetup=false when password is set', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ auth: { password: 'test' } })
      );

      const status = service.getStatus();
      expect(status.requiresSetup).toBe(false);
    });

    it('should return requiresSetup=true on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('broken');

      const status = service.getStatus();
      expect(status.requiresSetup).toBe(true);
    });
  });
});
