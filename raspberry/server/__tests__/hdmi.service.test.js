/**
 * HdmiService tests.
 *
 * The service uses util.promisify(child_process.exec) which has a custom
 * promisify implementation that returns { stdout, stderr }.
 * We mock child_process.exec with a custom symbol so promisify works correctly.
 */
const child_process = require('child_process');
const util = require('util');

// Manual mock: jest.mock doesn't play well with util.promisify's custom symbol.
// Instead, we'll spy on exec and use the custom promisify symbol.

describe('HdmiService', () => {
  let HdmiService;
  let service;
  let execMock;

  beforeEach(() => {
    // Create a mock function with the promisify custom symbol
    execMock = jest.fn();

    // Replace child_process.exec
    jest.spyOn(child_process, 'exec').mockImplementation(execMock);

    // Also set the custom promisify symbol so util.promisify returns our mock
    child_process.exec[util.promisify.custom] = jest.fn();

    // Need to re-require the module to pick up the new mock
    jest.isolateModules(() => {
      HdmiService = require('../services/hdmi.service');
    });

    service = new HdmiService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockExecAsync(results) {
    let callIndex = 0;
    // The promisified exec is what the service calls
    // We need to find and mock the execAsync that was created via util.promisify
    // Since we can't easily intercept util.promisify, let's mock at the exec level
    // and rely on the callback-based promisification.
    child_process.exec[util.promisify.custom].mockImplementation(() => {
      const result = results[callIndex++] || results[results.length - 1];
      if (result.error) {
        return Promise.reject(result.error);
      }
      return Promise.resolve({ stdout: result.stdout || '', stderr: result.stderr || '' });
    });
  }

  it('should report cec_available false when cec-client not installed', async () => {
    mockExecAsync([{ error: new Error('not found') }]);

    const status = await service.getStatus();
    expect(status.cec_available).toBe(false);
    expect(status.error).toBe('cec-client not installed');
  });

  it('should detect TV power ON', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: on\ndevice #0: TV\ndevice #1: Recorder' },
    ]);

    const status = await service.getStatus();
    expect(status.cec_available).toBe(true);
    expect(status.tv_power).toBe('on');
    expect(status.tv_connected).toBe(true);
    expect(status.devices_found).toBe(2);
  });

  it('should detect TV standby', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: standby' },
    ]);

    const status = await service.getStatus();
    expect(status.tv_power).toBe('standby');
    expect(status.tv_connected).toBe(true);
  });

  it('should detect TV transitioning', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: in transition from standby to on' },
    ]);

    const status = await service.getStatus();
    expect(status.tv_power).toBe('transitioning');
    expect(status.tv_connected).toBe(true);
  });

  it('should detect unknown power status', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: something_weird' },
    ]);

    const status = await service.getStatus();
    expect(status.tv_power).toBe('unknown');
    expect(status.tv_connected).toBe(true);
  });

  it('should report TV not responding when no power status in output', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'no reply received' },
    ]);

    const status = await service.getStatus();
    expect(status.tv_power).toBeNull();
    expect(status.tv_connected).toBe(false);
    expect(status.error).toBe('TV not responding to CEC');
  });

  it('should return cached result within TTL', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: on' },
    ]);

    const status1 = await service.getStatus();
    expect(status1.tv_power).toBe('on');

    // Second call should use cache (no new exec calls)
    const callCountBefore = child_process.exec[util.promisify.custom].mock.calls.length;
    const status2 = await service.getStatus();
    expect(status2.tv_power).toBe('on');
    expect(child_process.exec[util.promisify.custom].mock.calls.length).toBe(callCountBefore);
  });

  it('should refresh after cache expires', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: on' },
      { stdout: '/usr/bin/cec-client' },
      { stdout: 'power status: standby' },
    ]);

    const status1 = await service.getStatus();
    expect(status1.tv_power).toBe('on');

    // Force cache expiry
    service._cache.lastCheck = Date.now() - 20000;

    const status2 = await service.getStatus();
    expect(status2.tv_power).toBe('standby');
  });

  it('should handle cec-client exec error on power query', async () => {
    mockExecAsync([
      { stdout: '/usr/bin/cec-client' },
      { error: new Error('exec timeout') },
    ]);

    const status = await service.getStatus();
    expect(status.cec_available).toBe(true);
    expect(status.error).toBe('exec timeout');
    expect(status.tv_connected).toBe(false);
  });
});
