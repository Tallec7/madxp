/**
 * Tests for hotspot-sync.js — ADR-074.
 *
 * Covers the pure helpers (parseHostapdConf, shellEscape, cache roundtrip,
 * applyIfDiff) without touching fs/exec/http at the boundary.
 */

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('hotspot-sync (ADR-074)', () => {
  let tmpRoot;
  let originalRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hotspot-sync-'));
    originalRoot = process.env.NEOPRO_ROOT;
    process.env.NEOPRO_ROOT = tmpRoot;
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (originalRoot === undefined) delete process.env.NEOPRO_ROOT;
    else process.env.NEOPRO_ROOT = originalRoot;
  });

  describe('parseHostapdConf', () => {
    it('extracts ssid and wpa_passphrase from standard hostapd.conf', () => {
      const { _internal } = require('../services/hotspot-sync');
      const contents = [
        'interface=wlan0',
        'driver=nl80211',
        'ssid=NLF-Hotspot',
        'hw_mode=g',
        'channel=6',
        'wpa=2',
        'wpa_passphrase=NantesLoireFeminin26!',
        'wpa_key_mgmt=WPA-PSK',
      ].join('\n');
      const parsed = _internal.parseHostapdConf(contents);
      expect(parsed).toEqual({
        ssid: 'NLF-Hotspot',
        psk: 'NantesLoireFeminin26!',
      });
    });

    it('returns nulls when keys are missing', () => {
      const { _internal } = require('../services/hotspot-sync');
      expect(_internal.parseHostapdConf('interface=wlan0\n')).toEqual({
        ssid: null,
        psk: null,
      });
    });

    it('ignores commented-out lines', () => {
      const { _internal } = require('../services/hotspot-sync');
      const contents = '#ssid=OLD\nssid=NEW\n#wpa_passphrase=OLDPSK\nwpa_passphrase=NEWPSK\n';
      expect(_internal.parseHostapdConf(contents)).toEqual({
        ssid: 'NEW',
        psk: 'NEWPSK',
      });
    });
  });

  describe('readLocalHostapd', () => {
    it('returns parsed values from an existing file', () => {
      const { _internal } = require('../services/hotspot-sync');
      const confPath = path.join(tmpRoot, 'hostapd.conf');
      fs.writeFileSync(confPath, 'ssid=FOO\nwpa_passphrase=BAR12345\n');
      expect(_internal.readLocalHostapd(confPath)).toEqual({ ssid: 'FOO', psk: 'BAR12345' });
    });

    it('returns nulls when the file is absent', () => {
      const { _internal } = require('../services/hotspot-sync');
      expect(_internal.readLocalHostapd(path.join(tmpRoot, 'absent.conf'))).toEqual({
        ssid: null,
        psk: null,
      });
    });
  });

  describe('shellEscape', () => {
    it('escapes backslashes and pipes (sed delimiter)', () => {
      const { _internal } = require('../services/hotspot-sync');
      expect(_internal.shellEscape('foo|bar')).toBe('foo\\|bar');
      expect(_internal.shellEscape('back\\slash')).toBe('back\\\\slash');
      expect(_internal.shellEscape('no-special')).toBe('no-special');
    });
  });

  describe('cache roundtrip', () => {
    it('encrypts then decrypts to the same {ssid, psk}', () => {
      const { _internal } = require('../services/hotspot-sync');
      const apiKey = 'site-api-key-xyz';
      _internal.writeCache(apiKey, { ssid: 'S', psk: 'P1234567' });
      expect(_internal.readCache(apiKey)).toEqual({ ssid: 'S', psk: 'P1234567' });
    });

    it('returns null when no cache exists', () => {
      const { _internal } = require('../services/hotspot-sync');
      expect(_internal.readCache('any-key')).toBeNull();
    });

    it('returns null when cache is decrypted with a wrong key', () => {
      const { _internal } = require('../services/hotspot-sync');
      _internal.writeCache('key-a', { ssid: 'S', psk: 'P1234567' });
      expect(_internal.readCache('key-b')).toBeNull();
    });

    it('writes the cache file with mode 0600', () => {
      const { _internal } = require('../services/hotspot-sync');
      _internal.writeCache('k', { ssid: 'S', psk: 'P1234567' });
      const stat = fs.statSync(path.join(tmpRoot, '.hotspot-cache'));
       
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  describe('applyIfDiff', () => {
    it('is a noop when cloud and local match — only caches', async () => {
      jest.doMock('child_process', () => ({
        exec: jest.fn((_cmd, _opts, cb) => cb(new Error('should not run'))),
      }));
      const { _internal } = require('../services/hotspot-sync');
      const res = await _internal.applyIfDiff(
        { ssid: 'S', psk: 'P1234567' },
        { ssid: 'S', psk: 'P1234567' },
        'api-key'
      );
      expect(res).toEqual({ action: 'noop' });
      expect(_internal.readCache('api-key')).toEqual({ ssid: 'S', psk: 'P1234567' });
    });

    it('writes and restarts when psk differs', async () => {
      const execMock = jest.fn((_cmd, _opts, cb) => cb(null, '', ''));
      jest.doMock('child_process', () => ({ exec: execMock }));
      const { _internal } = require('../services/hotspot-sync');
      const res = await _internal.applyIfDiff(
        { ssid: 'S', psk: 'NEWPSK12' },
        { ssid: 'S', psk: 'OLDPSK12' },
        'api-key'
      );
      expect(res).toEqual({ action: 'updated' });
      expect(execMock).toHaveBeenCalledTimes(3);
      const commands = execMock.mock.calls.map((c) => c[0]);
      expect(commands[0]).toContain("sed -i 's|^ssid=");
      expect(commands[1]).toContain("sed -i 's|^wpa_passphrase=");
      expect(commands[2]).toContain('systemctl restart hostapd');
      expect(_internal.readCache('api-key')).toEqual({ ssid: 'S', psk: 'NEWPSK12' });
    });

    it('throws when the sed command fails', async () => {
      jest.doMock('child_process', () => ({
        exec: jest.fn((_cmd, _opts, cb) => cb(new Error('sed boom'), '', 'sed boom')),
      }));
      const { _internal } = require('../services/hotspot-sync');
      await expect(
        _internal.applyIfDiff(
          { ssid: 'A', psk: 'P1234567' },
          { ssid: 'B', psk: 'P1234567' },
          'api-key'
        )
      ).rejects.toThrow(/sed ssid failed/);
    });
  });

  describe('syncFromCloud — skip path', () => {
    it('returns skipped when credentials are missing', async () => {
      const { syncFromCloud } = require('../services/hotspot-sync');
      const res = await syncFromCloud({ centralUrl: '', siteId: '', apiKey: '' });
      expect(res.action).toBe('skipped');
    });
  });
});
