const path = require('path');

describe('config defaults', () => {
  const tempConfigPath = path.join(__dirname, '__fixtures__', 'nonexistent.conf');

  beforeEach(() => {
    process.env.CONFIG_FILE = tempConfigPath;
    delete process.env.ALLOWED_COMMANDS;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.CONFIG_FILE;
    delete process.env.ALLOWED_COMMANDS;
    jest.resetModules();
  });

  it('includes hotspot commands in allowed commands by default', () => {
    jest.isolateModules(() => {
      const { config } = require('../config');

      expect(config.security.allowedCommands).toEqual(
        expect.arrayContaining(['update_hotspot', 'get_hotspot_config'])
      );
    });
  });
});
