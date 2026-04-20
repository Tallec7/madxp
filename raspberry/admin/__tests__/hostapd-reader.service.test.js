/**
 * Tests for HostapdReaderService — ADR-074.
 * Read-only parser for /etc/hostapd/hostapd.conf.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const HostapdReaderService = require('../services/hostapd-reader.service');
const { parseHostapdConf } = require('../services/hostapd-reader.service');

describe('HostapdReaderService (ADR-074)', () => {
  describe('parseHostapdConf', () => {
    it('extracts ssid, wpa_passphrase and channel', () => {
      const conf = [
        'interface=wlan0',
        'ssid=NLF-Hotspot',
        'channel=6',
        'wpa_passphrase=NantesLoireFeminin26!',
      ].join('\n');
      expect(parseHostapdConf(conf)).toEqual({
        ssid: 'NLF-Hotspot',
        psk: 'NantesLoireFeminin26!',
        channel: 6,
      });
    });

    it('returns all nulls for empty or non-string input', () => {
      expect(parseHostapdConf('')).toEqual({ ssid: null, psk: null, channel: null });
      expect(parseHostapdConf(null)).toEqual({ ssid: null, psk: null, channel: null });
    });

    it('ignores commented lines (#)', () => {
      const conf = '#ssid=OLD\nssid=NEW\n#wpa_passphrase=NOPE\nwpa_passphrase=GOOD\n';
      expect(parseHostapdConf(conf)).toEqual({ ssid: 'NEW', psk: 'GOOD', channel: null });
    });
  });

  describe('read()', () => {
    let tmpDir;
    let confPath;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostapd-reader-'));
      confPath = path.join(tmpDir, 'hostapd.conf');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads and parses an existing hostapd.conf', async () => {
      fs.writeFileSync(confPath, 'ssid=Foo\nwpa_passphrase=Bar12345\nchannel=11\n');
      const reader = new HostapdReaderService({ confPath });
      expect(await reader.read()).toEqual({ ssid: 'Foo', psk: 'Bar12345', channel: 11 });
    });

    it('returns nulls (not throw) when the file is absent', async () => {
      const reader = new HostapdReaderService({ confPath });
      expect(await reader.read()).toEqual({ ssid: null, psk: null, channel: null });
    });

    it('propagates non-ENOENT errors', async () => {
      // Create the file as a directory to trigger EISDIR on readFile.
      fs.mkdirSync(confPath);
      const reader = new HostapdReaderService({ confPath });
      await expect(reader.read()).rejects.toThrow();
    });
  });
});
