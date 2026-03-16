/**
 * Tests for NetworkService - pure parser methods and business logic
 */

const NetworkService = require('../services/network.service');

describe('NetworkService', () => {
  let service;

  beforeEach(() => {
    service = new NetworkService();
  });

  // ===========================================================================
  // parseIwconfigOutput
  // ===========================================================================

  describe('parseIwconfigOutput', () => {
    it('should parse connected wlan output', () => {
      const output = [
        'wlan1     IEEE 802.11  ESSID:"MyNetwork"',
        '          Mode:Managed  Frequency:2.437 GHz  Access Point: AA:BB:CC:DD:EE:FF',
        '          Bit Rate=72.2 Mb/s   Tx-Power=31 dBm',
        '          Link Quality=70/70  Signal level=-35 dBm',
      ].join('\n');

      const result = service.parseIwconfigOutput(output);
      expect(result.ssid).toBe('MyNetwork');
      expect(result.bssid).toBe('AA:BB:CC:DD:EE:FF');
      expect(result.quality).toBe(100);
      expect(result.signal).toBe(-35);
    });

    it('should handle disconnected output', () => {
      const output = 'wlan1     IEEE 802.11  ESSID:off/any\n          Mode:Managed  Access Point: Not-Associated';

      const result = service.parseIwconfigOutput(output);
      expect(result.ssid).toBeNull();
      expect(result.bssid).toBeNull();
      expect(result.quality).toBeNull();
      expect(result.signal).toBeNull();
    });

    it('should handle empty output', () => {
      const result = service.parseIwconfigOutput('');
      expect(result.ssid).toBeNull();
      expect(result.bssid).toBeNull();
    });

    it('should calculate quality percentage correctly', () => {
      const output = 'Link Quality=35/70  Signal level=-50 dBm';
      const result = service.parseIwconfigOutput(output);
      expect(result.quality).toBe(50);
    });
  });

  // ===========================================================================
  // parseWifiScanResults
  // ===========================================================================

  describe('parseWifiScanResults', () => {
    it('should parse multiple cells', () => {
      const output = [
        'wlan1     Scan completed :',
        '          Cell 01 - Address: 11:22:33:44:55:66',
        '                    Channel:6',
        '                    ESSID:"HomeNetwork"',
        '                    Signal level=-45 dBm',
        '                    Quality=60/70',
        '                    Encryption key:on',
        '                    IE: WPA2 Version 1',
        '          Cell 02 - Address: AA:BB:CC:DD:EE:FF',
        '                    Channel:11',
        '                    ESSID:"GuestNetwork"',
        '                    Signal level=-70 dBm',
        '                    Quality=30/70',
        '                    Encryption key:off',
      ].join('\n');

      const networks = service.parseWifiScanResults(output);
      expect(networks).toHaveLength(2);

      // Should be sorted by signal (strongest first)
      expect(networks[0].ssid).toBe('HomeNetwork');
      expect(networks[0].bssid).toBe('11:22:33:44:55:66');
      expect(networks[0].channel).toBe(6);
      expect(networks[0].signal).toBe(-45);
      expect(networks[0].encrypted).toBe(true);
      expect(networks[0].security).toBe('WPA2');

      expect(networks[1].ssid).toBe('GuestNetwork');
      expect(networks[1].encrypted).toBe(false);
      expect(networks[1].security).toBe('Open');
    });

    it('should handle empty scan results', () => {
      const networks = service.parseWifiScanResults('wlan1     No scan results');
      expect(networks).toHaveLength(0);
    });

    it('should skip cells without SSID', () => {
      const output = [
        '          Cell 01 - Address: 11:22:33:44:55:66',
        '                    ESSID:""',
        '          Cell 02 - Address: AA:BB:CC:DD:EE:FF',
        '                    ESSID:"ValidNet"',
        '                    Signal level=-50 dBm',
      ].join('\n');

      const networks = service.parseWifiScanResults(output);
      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe('ValidNet');
    });

    it('should sort by signal strength (best first)', () => {
      const output = [
        '          Cell 01 - Address: 11:22:33:44:55:66',
        '                    ESSID:"Weak"',
        '                    Signal level=-80 dBm',
        '          Cell 02 - Address: AA:BB:CC:DD:EE:FF',
        '                    ESSID:"Strong"',
        '                    Signal level=-30 dBm',
      ].join('\n');

      const networks = service.parseWifiScanResults(output);
      expect(networks[0].ssid).toBe('Strong');
      expect(networks[1].ssid).toBe('Weak');
    });
  });

});
