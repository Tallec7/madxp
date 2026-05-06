/**
 * ReceiversService tests.
 *
 * Tests passive WiFi receiver detection via dnsmasq.leases watch + ARP fallback.
 * Mocks fs (statSync/readFileSync) and child_process.exec (for arp -an).
 */
const child_process = require('child_process');
const util = require('util');
const fs = require('fs');

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
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => '');

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
    fs.readFileSync.mockImplementation(() => content);
  }

  function mockArp(stdout) {
    child_process.exec[util.promisify.custom].mockImplementation(() =>
      Promise.resolve({ stdout, stderr: '' })
    );
  }

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
});
