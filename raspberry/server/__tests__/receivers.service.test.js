/**
 * ReceiversService tests.
 *
 * Tests passive WiFi receiver detection via dnsmasq.leases watch + ARP fallback.
 * Mocks fs (statSync/readFileSync) and child_process.exec (for arp -an).
 *
 * Plan 05-detect-02 extends with cache resilience (loadCache / saveCache /
 * assignDisplay / unassignDisplay + reboot scenario).
 */
const child_process = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join('/home/pi/neopro', '.receivers-cache.json');
const CACHE_TMP_PATH = CACHE_PATH + '.tmp';

describe('ReceiversService', () => {
  let ReceiversService;
  let service;
  let io;

  beforeEach(() => {
    // Mock io
    io = { emit: jest.fn() };

    // Mock exec for arp -an
    jest.spyOn(child_process, 'exec').mockImplementation(jest.fn());
    child_process.exec[util.promisify.custom] = jest.fn(() =>
      Promise.resolve({ stdout: '', stderr: '' })
    );

    // Reset fs mocks
    jest.spyOn(fs, 'statSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      // Default: ENOENT for cache reads (so existing tests stay green)
      if (typeof p === 'string' && p.endsWith('.receivers-cache.json')) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return '';
    });
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    jest.spyOn(fs, 'renameSync').mockImplementation(() => undefined);

    jest.isolateModules(() => {
      ReceiversService = require('../services/receivers.service');
    });
    service = new ReceiversService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (service && typeof service.stop === 'function') {
      service.stop();
    }
  });

  function mockLeases(content, mtimeMs = Date.now()) {
    fs.statSync.mockImplementation(() => ({ mtimeMs }));
    fs.readFileSync.mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('.receivers-cache.json')) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    });
  }

  function mockArp(stdout) {
    child_process.exec[util.promisify.custom].mockImplementation(() =>
      Promise.resolve({ stdout, stderr: '' })
    );
  }

  function mockCacheContent(jsonString) {
    fs.readFileSync.mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('.receivers-cache.json')) {
        return jsonString;
      }
      return '';
    });
  }

  // ─────────────── Plan 01 (existing) ───────────────

  it('returns [] before any scan', () => {
    expect(service.getReceivers()).toEqual([]);
  });

  it('parses Fire Stick lease (Amazon OUI 0c:43:f9) as kind=firestick', () => {
    mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick-bedroom *\n');
    service._scanLeases();
    const receivers = service.getReceivers();
    expect(receivers).toHaveLength(1);
    expect(receivers[0].mac).toBe('0c:43:f9:36:04:77');
    expect(receivers[0].kind).toBe('firestick');
    expect(typeof receivers[0].lastSeenAt).toBe('string');
    expect(() => new Date(receivers[0].lastSeenAt).toISOString()).not.toThrow();
  });

  it('parses unknown OUI MAC as kind=browser', () => {
    mockLeases('1714400000 aa:bb:cc:11:22:33 192.168.4.50 staff-phone *\n');
    service._scanLeases();
    const receivers = service.getReceivers();
    expect(receivers).toHaveLength(1);
    expect(receivers[0].kind).toBe('browser');
  });

  it('emits connected-receivers-changed when a new MAC appears', () => {
    service.start(io);
    io.emit.mockClear();
    mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
    service._scanLeases();
    expect(io.emit).toHaveBeenCalledWith(
      'connected-receivers-changed',
      expect.objectContaining({ receivers: expect.any(Array) })
    );
    const payload = io.emit.mock.calls.find(c => c[0] === 'connected-receivers-changed')[1];
    expect(payload.receivers).toHaveLength(1);
    expect(payload.receivers[0].mac).toBe('0c:43:f9:36:04:77');
  });

  it('removes a MAC and emits change when it disappears from leases', () => {
    service.start(io);
    // First scan: MAC present
    mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
    service._scanLeases();
    io.emit.mockClear();
    // Second scan: MAC gone, mtime changed
    mockLeases('', 2000);
    service._scanLeases();
    expect(io.emit).toHaveBeenCalledWith(
      'connected-receivers-changed',
      expect.objectContaining({ receivers: [] })
    );
    expect(service.getReceivers()).toHaveLength(0);
  });

  it('does not crash when dnsmasq.leases is missing (ENOENT)', () => {
    fs.statSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(() => service._scanLeases()).not.toThrow();
    expect(service.getReceivers()).toEqual([]);
  });

  it('_scanArp adds a wlan0 MAC absent from leases', async () => {
    service.start(io);
    io.emit.mockClear();
    mockArp(
      '? (192.168.4.42) at 0c:43:f9:36:04:77 [ether] on wlan0\n' +
      '? (192.168.4.50) at b8:27:eb:01:02:03 [ether] on wlan0\n'
    );
    await service._scanArp();
    const macs = service.getReceivers().map(r => r.mac);
    expect(macs).toContain('0c:43:f9:36:04:77');
    expect(macs).toContain('b8:27:eb:01:02:03');
  });

  it('does not re-emit when state has not changed (identical mtime)', () => {
    service.start(io);
    mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 5000);
    service._scanLeases();
    io.emit.mockClear();
    // Same mtime → must skip entirely
    service._scanLeases();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('does not re-emit when mtime changes but MAC set is identical', () => {
    service.start(io);
    mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
    service._scanLeases();
    io.emit.mockClear();
    // mtime changes but same MACs
    mockLeases('1714499999 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 2000);
    service._scanLeases();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('start(io) schedules intervals and stop() clears them', () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    service.start(io);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    service.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();
    jest.useRealTimers();
  });

  // ─────────────── Plan 02 (cache resilience) ───────────────

  describe('loadCache()', () => {
    it('does not throw when cache file is missing (ENOENT)', () => {
      fs.readFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });
      expect(() => service.loadCache()).not.toThrow();
      expect(service.getReceivers()).toEqual([]);
    });

    it('does not throw when cache JSON is corrupt — state stays empty', () => {
      mockCacheContent('{not valid json');
      expect(() => service.loadCache()).not.toThrow();
      expect(service.getReceivers()).toEqual([]);
    });

    it('hydrates _state with displayIndex from a valid cache (version 1)', () => {
      mockCacheContent(JSON.stringify({
        version: 1,
        savedAt: '2026-05-06T10:00:00.000Z',
        assignments: [
          { mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: 1, lastSeenAt: '2026-05-06T09:00:00.000Z' },
        ],
      }));
      service.loadCache();
      const receivers = service.getReceivers();
      expect(receivers).toHaveLength(1);
      expect(receivers[0].mac).toBe('0c:43:f9:36:04:77');
      expect(receivers[0].kind).toBe('firestick');
      expect(receivers[0].displayIndex).toBe(1);
    });

    it('ignores cache entries when version is unknown (forward-compat)', () => {
      mockCacheContent(JSON.stringify({
        version: 999,
        assignments: [{ mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: 1 }],
      }));
      service.loadCache();
      expect(service.getReceivers()).toEqual([]);
    });
  });

  describe('assignDisplay() / unassignDisplay()', () => {
    it('assignDisplay() on existing entry sets displayIndex, calls saveCache and _emitChange', () => {
      service.start(io);
      mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
      service._scanLeases();
      io.emit.mockClear();
      fs.writeFileSync.mockClear();
      fs.renameSync.mockClear();

      service.assignDisplay('0c:43:f9:36:04:77', 1);

      const recv = service.getReceivers().find(r => r.mac === '0c:43:f9:36:04:77');
      expect(recv.displayIndex).toBe(1);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
      expect(io.emit).toHaveBeenCalledWith(
        'connected-receivers-changed',
        expect.objectContaining({ receivers: expect.any(Array) })
      );
    });

    it('assignDisplay() on unknown MAC creates entry with inferred kind + displayIndex', () => {
      service.start(io);
      io.emit.mockClear();

      service.assignDisplay('0c:43:f9:11:22:33', 2);

      const recv = service.getReceivers().find(r => r.mac === '0c:43:f9:11:22:33');
      expect(recv).toBeDefined();
      expect(recv.kind).toBe('firestick');
      expect(recv.displayIndex).toBe(2);
    });

    it('unassignDisplay() preserves entry, sets displayIndex=null, rewrites cache', () => {
      service.start(io);
      mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
      service._scanLeases();
      service.assignDisplay('0c:43:f9:36:04:77', 1);
      fs.writeFileSync.mockClear();
      fs.renameSync.mockClear();

      service.unassignDisplay('0c:43:f9:36:04:77');

      const recv = service.getReceivers().find(r => r.mac === '0c:43:f9:36:04:77');
      expect(recv).toBeDefined();
      expect(recv.displayIndex).toBeNull();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
    });
  });

  describe('saveCache()', () => {
    it('writes atomically: writeFileSync(tmp) then renameSync(tmp -> final)', () => {
      service.assignDisplay('0c:43:f9:36:04:77', 1);
      // writeFileSync should be called with the .tmp path
      const writeCalls = fs.writeFileSync.mock.calls;
      const tmpCall = writeCalls.find(c => typeof c[0] === 'string' && c[0].endsWith('.receivers-cache.json.tmp'));
      expect(tmpCall).toBeDefined();
      // renameSync should be called from .tmp to final
      const renameCalls = fs.renameSync.mock.calls;
      const renameTmp = renameCalls.find(c =>
        typeof c[0] === 'string' && c[0].endsWith('.receivers-cache.json.tmp') &&
        typeof c[1] === 'string' && c[1].endsWith('.receivers-cache.json')
      );
      expect(renameTmp).toBeDefined();

      // Order: write must precede rename across mock.invocationCallOrder
      const writeOrder = fs.writeFileSync.mock.invocationCallOrder[fs.writeFileSync.mock.invocationCallOrder.length - 1];
      const renameOrder = fs.renameSync.mock.invocationCallOrder[fs.renameSync.mock.invocationCallOrder.length - 1];
      expect(writeOrder).toBeLessThan(renameOrder);
    });
  });

  describe('reboot scenario', () => {
    it('instance B restores mapping from cache without _scanLeases', () => {
      // Instance A: assigns and writes cache
      service.assignDisplay('0c:43:f9:36:04:77', 2);
      const writeCall = fs.writeFileSync.mock.calls.find(c =>
        typeof c[0] === 'string' && c[0].endsWith('.receivers-cache.json.tmp')
      );
      expect(writeCall).toBeDefined();
      const persisted = writeCall[1];

      // Instance B: fresh instance; readFileSync returns persisted cache content
      mockCacheContent(persisted);
      // Make statSync ENOENT so we can verify _scanLeases would be a no-op
      fs.statSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const scanSpy = jest.fn();

      let InstanceB;
      jest.isolateModules(() => {
        InstanceB = require('../services/receivers.service');
      });
      const serviceB = new InstanceB();
      serviceB._scanLeases = scanSpy; // ensure not called
      serviceB.loadCache();

      const receivers = serviceB.getReceivers();
      expect(receivers).toHaveLength(1);
      expect(receivers[0].mac).toBe('0c:43:f9:36:04:77');
      expect(receivers[0].displayIndex).toBe(2);
      expect(scanSpy).not.toHaveBeenCalled();
    });
  });

  describe('_scanLeases — assigned MAC preservation', () => {
    it('preserves an assigned MAC (displayIndex !== null) when it disappears from leases', () => {
      service.start(io);
      mockLeases('1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick *\n', 1000);
      service._scanLeases();
      service.assignDisplay('0c:43:f9:36:04:77', 1);
      // MAC disappears (e.g. Fire Stick powered off)
      mockLeases('', 2000);
      service._scanLeases();

      const recv = service.getReceivers().find(r => r.mac === '0c:43:f9:36:04:77');
      expect(recv).toBeDefined();
      expect(recv.displayIndex).toBe(1);
    });

    it('removes an unassigned MAC (displayIndex == null) when it disappears from leases', () => {
      service.start(io);
      mockLeases('1714400000 aa:bb:cc:11:22:33 192.168.4.50 phone *\n', 1000);
      service._scanLeases();
      // No assignment; MAC disappears
      mockLeases('', 2000);
      service._scanLeases();

      const recv = service.getReceivers().find(r => r.mac === 'aa:bb:cc:11:22:33');
      expect(recv).toBeUndefined();
    });
  });
});
