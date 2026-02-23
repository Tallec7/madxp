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

  describe('_parseEdidDecodeOutput', () => {
    it('should parse a complete TV edid-decode output', () => {
      const output = `Block 0, Base EDID:
  Vendor & Product Identification:
    Manufacturer: SAM
    Made in week 51 of 2018
  Basic Display Parameters & Features:
    Digital display
    Maximum image size: 120 cm x 68 cm
  Detailed Timing Descriptors:
    DTD 1:  3840x2160   30.000000 Hz  16:9
    DTD 2:  1920x1080   60.000000 Hz  16:9

Block 1, CEC Extension:
  Audio:
    Linear PCM:
      Max channels: 2
  Color depth: 8 bits
`;

      const result = service._parseEdidDecodeOutput(output);

      expect(result.screen_size).toBe('120x68cm');
      expect(result.year_of_manufacture).toBe(2018);
      expect(result.input_type).toBe('digital');
      expect(result.color_depth).toBe('8bpc');
      expect(result.audio_supported).toBe(true);
      expect(result.supported_resolutions).toContain('3840x2160');
      expect(result.supported_resolutions).toContain('1920x1080');
    });

    it('should parse a PC monitor without audio', () => {
      const output = `Block 0, Base EDID:
  Vendor & Product Identification:
    Made in week 30 of 2022
  Basic Display Parameters & Features:
    Digital display
    Maximum image size: 60 cm x 34 cm
  Detailed Timing Descriptors:
    DTD 1:  2560x1440   59.951000 Hz  16:9
`;

      const result = service._parseEdidDecodeOutput(output);

      expect(result.screen_size).toBe('60x34cm');
      expect(result.year_of_manufacture).toBe(2022);
      expect(result.audio_supported).toBe(false);
      expect(result.supported_resolutions).toContain('2560x1440');
    });

    it('should return defaults for empty output', () => {
      const result = service._parseEdidDecodeOutput('');

      expect(result.screen_size).toBeNull();
      expect(result.year_of_manufacture).toBeNull();
      expect(result.input_type).toBeNull();
      expect(result.color_depth).toBeNull();
      expect(result.supported_resolutions).toEqual([]);
      expect(result.audio_supported).toBe(false);
    });

    it('should detect analog display', () => {
      const output = `  Basic Display Parameters & Features:
    Analog display
    Maximum image size: 47 cm x 30 cm
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.input_type).toBe('analog');
    });

    it('should detect Model year format', () => {
      const output = `  Vendor & Product Identification:
    Model year 2020
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.year_of_manufacture).toBe(2020);
    });
  });
});
