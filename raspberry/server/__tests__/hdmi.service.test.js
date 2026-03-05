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
    DPMS levels: Standby Suspend Off
  Detailed Timing Descriptors:
    DTD 1:  3840x2160   30.000000 Hz  16:9
    DTD 2:  1920x1080   60.000000 Hz  16:9

Block 1, CEC Extension:
  Audio:
    Linear PCM:
      Max channels: 2
  Color depth: 8 bits
  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 300 MHz
    DC_Y444
  HDR Static Metadata Data Block:
    SMPTE ST2084
  Colorimetry Data Block:
    BT2020RGB
    BT2020YCC
`;

      const result = service._parseEdidDecodeOutput(output);

      expect(result.screen_size).toBe('120x68cm');
      expect(result.year_of_manufacture).toBe(2018);
      expect(result.input_type).toBe('digital');
      expect(result.color_depth).toBe('8bpc');
      expect(result.audio_supported).toBe(true);
      expect(result.supported_resolutions).toContain('3840x2160');
      expect(result.supported_resolutions).toContain('1920x1080');
      // Nouveaux champs
      expect(result.native_resolution).toBe('3840x2160');
      expect(result.max_refresh_rate).toBe(60);
      expect(result.hdmi_version).toBe('2.0');
      expect(result.hdr_supported).toBe(true);
      expect(result.color_spaces).toContain('YCbCr_444');
      expect(result.color_spaces).toContain('BT2020_RGB');
      expect(result.color_spaces).toContain('BT2020_YCC');
      expect(result.standby_supported).toBe(true);
      expect(result.diagonal_inches).toBe(54);
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
      expect(result.native_resolution).toBe('2560x1440');
      expect(result.max_refresh_rate).toBe(60);
      expect(result.diagonal_inches).toBe(27);
      expect(result.hdr_supported).toBe(false);
      expect(result.hdmi_version).toBeNull();
    });

    it('should return defaults for empty output', () => {
      const result = service._parseEdidDecodeOutput('');

      expect(result.screen_size).toBeNull();
      expect(result.year_of_manufacture).toBeNull();
      expect(result.input_type).toBeNull();
      expect(result.color_depth).toBeNull();
      expect(result.supported_resolutions).toEqual([]);
      expect(result.audio_supported).toBe(false);
      expect(result.native_resolution).toBeNull();
      expect(result.max_refresh_rate).toBeNull();
      expect(result.hdmi_version).toBeNull();
      expect(result.hdr_supported).toBe(false);
      expect(result.color_spaces).toEqual([]);
      expect(result.standby_supported).toBe(false);
      expect(result.display_product_type).toBeNull();
      expect(result.diagonal_inches).toBeNull();
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

    it('should detect HDMI 2.1 from high TMDS clock', () => {
      const output = `  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 600 MHz
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.hdmi_version).toBe('2.1');
    });

    it('should detect HDMI 1.4 from low TMDS clock', () => {
      const output = `  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 165 MHz
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.hdmi_version).toBe('1.4');
    });

    it('should detect Display Product Type', () => {
      const output = `  Display Product Type: Projector
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.display_product_type).toBe('projector');
    });

    it('should detect HLG HDR', () => {
      const output = `  HDR Static Metadata Data Block:
    Hybrid Log-Gamma
`;

      const result = service._parseEdidDecodeOutput(output);
      expect(result.hdr_supported).toBe(true);
    });
  });

  describe('_inferDisplayCategory', () => {
    it('should detect tv_oled from model name', () => {
      const result = service._inferDisplayCategory('LG OLED55C1', 'tv', {
        audio_supported: true,
        diagonal_inches: 55,
      }, null);
      expect(result).toBe('tv_oled');
    });

    it('should detect tv_qled from model name', () => {
      const result = service._inferDisplayCategory('SAMSUNG QLED', 'tv', {
        audio_supported: true,
        diagonal_inches: 65,
      }, null);
      expect(result).toBe('tv_qled');
    });

    it('should detect tv_led from model name', () => {
      const result = service._inferDisplayCategory('LED TV', 'tv', {
        audio_supported: true,
        diagonal_inches: 43,
      }, null);
      expect(result).toBe('tv_led');
    });

    it('should prefer OLED over LED when model contains OLED', () => {
      const result = service._inferDisplayCategory('OLED65', 'tv', {
        audio_supported: true,
        diagonal_inches: 65,
      }, null);
      expect(result).toBe('tv_oled');
    });

    it('should detect monitor from small screen without audio', () => {
      const result = service._inferDisplayCategory('DELL P2419H', 'monitor', {
        audio_supported: false,
        diagonal_inches: 24,
      }, null);
      expect(result).toBe('monitor');
    });

    it('should detect projector from display_product_type', () => {
      const result = service._inferDisplayCategory('EPSON', 'unknown', {
        display_product_type: 'projector',
      }, null);
      expect(result).toBe('projector');
    });

    it('should infer tv from large screen with audio even without model keyword', () => {
      const result = service._inferDisplayCategory('SAMSUNG', 'unknown', {
        audio_supported: true,
        diagonal_inches: 55,
      }, null);
      expect(result).toBe('tv');
    });

    it('should infer tv from display_type alone', () => {
      const result = service._inferDisplayCategory('SAMSUNG', 'tv', null, null);
      expect(result).toBe('tv');
    });

    it('should return unknown when no signals available', () => {
      const result = service._inferDisplayCategory(null, 'unknown', null, null);
      expect(result).toBe('unknown');
    });

    it('should detect tv_plasma from model name', () => {
      const result = service._inferDisplayCategory('PLASMA TV', 'tv', {
        audio_supported: true,
        diagonal_inches: 50,
      }, null);
      expect(result).toBe('tv_plasma');
    });

    it('should detect tv_qned from model name', () => {
      const result = service._inferDisplayCategory('LG QNED81', 'tv', {
        audio_supported: true,
        diagonal_inches: 55,
      }, null);
      expect(result).toBe('tv_qned');
    });

    // Monitor manufacturer detection — known PC-only manufacturers
    // should always return 'monitor' regardless of other signals
    it('should classify Lenovo as monitor even with CEA audio (LEN)', () => {
      const result = service._inferDisplayCategory('LEN L27i-30', 'tv', {
        audio_supported: true,
        diagonal_inches: 27,
      }, 'LEN');
      expect(result).toBe('monitor');
    });

    it('should classify Dell as monitor even with large diagonal (DEL)', () => {
      const result = service._inferDisplayCategory('DELL U3423WE', 'tv', {
        audio_supported: true,
        diagonal_inches: 34,
      }, 'DEL');
      expect(result).toBe('monitor');
    });

    it('should classify ASUS as monitor (ACI)', () => {
      const result = service._inferDisplayCategory('ASUS VG27AQ', 'unknown', {
        audio_supported: true,
        diagonal_inches: 27,
      }, 'ACI');
      expect(result).toBe('monitor');
    });

    it('should classify HP as monitor (HWP)', () => {
      const result = service._inferDisplayCategory('HP Z27', 'unknown', {
        audio_supported: false,
        diagonal_inches: 27,
      }, 'HWP');
      expect(result).toBe('monitor');
    });

    it('should classify BenQ as monitor (BNQ)', () => {
      const result = service._inferDisplayCategory('BenQ PD2700U', 'unknown', {
        audio_supported: true,
        diagonal_inches: 27,
      }, 'BNQ');
      expect(result).toBe('monitor');
    });

    it('should NOT classify LG as monitor (LG makes TVs too)', () => {
      const result = service._inferDisplayCategory('LG 55UN73', 'tv', {
        audio_supported: true,
        diagonal_inches: 55,
      }, 'GSM');
      expect(result).toBe('tv');
    });

    it('should NOT classify Samsung as monitor (Samsung makes TVs too)', () => {
      const result = service._inferDisplayCategory('SAMSUNG QE65Q60R', 'tv', {
        audio_supported: true,
        diagonal_inches: 65,
      }, 'SAM');
      expect(result).toBe('tv');
    });

    it('should handle null manufacturer gracefully', () => {
      const result = service._inferDisplayCategory('GENERIC DISPLAY', 'tv', {
        audio_supported: true,
        diagonal_inches: 43,
      }, null);
      expect(result).toBe('tv');
    });
  });

  describe('getFullStatus - Pi 5 CEC false positive', () => {
    it('should override CEC tv_connected when no EDID and no CEC devices', async () => {
      // CEC reports tv_connected=true with unknown power (Pi 5 quirk)
      // but EDID/DRM says no display and devices_found=0
      mockExecAsync([
        { stdout: '/usr/bin/cec-client' },
        { stdout: 'power status: something_unexpected' },
      ]);
      // Mock getDisplayInfo to return no display
      service.getDisplayInfo = jest.fn().mockResolvedValue({
        connected: false,
        manufacturer: null,
        model: null,
        resolution: null,
        display_type: 'unknown',
        display_category: null,
        edid_detailed: null,
      });

      const full = await service.getFullStatus();

      // CEC false positive should be corrected
      expect(full.tv_connected).toBe(false);
      expect(full.tv_power).toBeNull();
      expect(full.displayInfo.connected).toBe(false);
    });

    it('should keep CEC tv_connected when display is physically connected', async () => {
      mockExecAsync([
        { stdout: '/usr/bin/cec-client' },
        { stdout: 'power status: on\ndevice #0: TV' },
      ]);
      service.getDisplayInfo = jest.fn().mockResolvedValue({
        connected: true,
        manufacturer: 'SAM',
        model: 'SAMSUNG TV',
        resolution: '1920x1080',
        display_type: 'unknown',
        display_category: null,
        edid_detailed: null,
      });

      const full = await service.getFullStatus();

      expect(full.tv_connected).toBe(true);
      expect(full.tv_power).toBe('on');
      expect(full.displayInfo.connected).toBe(true);
    });

    it('should keep CEC tv_connected when devices are found even without EDID', async () => {
      mockExecAsync([
        { stdout: '/usr/bin/cec-client' },
        { stdout: 'power status: standby\ndevice #0: TV' },
      ]);
      service.getDisplayInfo = jest.fn().mockResolvedValue({
        connected: false,
        manufacturer: null,
        model: null,
        resolution: null,
        display_type: 'unknown',
        display_category: null,
        edid_detailed: null,
      });

      const full = await service.getFullStatus();

      // CEC found a real device, so tv_connected should stay true
      expect(full.tv_connected).toBe(true);
      expect(full.tv_power).toBe('standby');
      expect(full.devices_found).toBe(1);
    });
  });
});
