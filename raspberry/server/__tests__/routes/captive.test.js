/**
 * Tests for /api/captive/whoami route (Phase 6 Plan 02 — CAPTIVE-02/03/04).
 *
 * Validates the IP→MAC→displayIndex resolution path (priority order):
 *  1. Cloud-assigned (configuration.json displays[].receiver.mac)
 *  2. Locally cached (.receivers-cache.json via receiver.displayIndex)
 *  3. Auto-assign to first free slot (zero manual intervention)
 *  - 404 mac_not_found for non-firestick devices or unknown IPs
 *  - X-Real-IP forwarded header takes precedence over req.socket.remoteAddress
 */

jest.mock('fs');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const createCaptiveRouter = require('../../routes/captive');

const SAMPLE_CONFIG = {
  siteId: 'test-site',
  displays: [
    { index: 0, name: 'Salle principale', receiver: { kind: 'pi_native', mac: null } },
    {
      index: 1,
      name: 'Buvette',
      receiver: { kind: 'firestick', mac: '0c:43:f9:36:04:77', last_seen_at: '2026-05-06T10:00:00Z' },
    },
  ],
};

function buildApp(receiversService, configPath = '/tmp/test-config.json') {
  const app = express();
  app.use('/api/captive', createCaptiveRouter({ receiversService, configPath }));
  return app;
}

function makeReceiversService(overrides = {}) {
  return {
    resolveMacByIp: jest.fn(() => null),
    getReceivers: jest.fn(() => []),
    assignDisplay: jest.fn(),
    ...overrides,
  };
}

describe('GET /api/captive/whoami', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 404 mac_not_found when receiversService cannot resolve IP', async () => {
    const receiversService = makeReceiversService({ resolveMacByIp: jest.fn(() => null) });
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('mac_not_found');
    expect(receiversService.resolveMacByIp).toHaveBeenCalledTimes(1);
  });

  test('returns 404 for browser (non-firestick) device — passthrough to /remote', async () => {
    const receiversService = makeReceiversService({
      resolveMacByIp: jest.fn(() => 'aa:bb:cc:dd:ee:ff'),
      getReceivers: jest.fn(() => [{ mac: 'aa:bb:cc:dd:ee:ff', kind: 'browser' }]),
    });
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('mac_not_found');
  });

  test('returns 404 when MAC is known but kind is not firestick (unknown device)', async () => {
    const receiversService = makeReceiversService({
      resolveMacByIp: jest.fn(() => 'aa:bb:cc:dd:ee:ff'),
      getReceivers: jest.fn(() => []),
    });
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('mac_not_found');
  });

  test('uses X-Real-IP header over socket.remoteAddress', async () => {
    const receiversService = makeReceiversService();
    const app = buildApp(receiversService);

    await request(app).get('/api/captive/whoami').set('X-Real-IP', '192.168.4.42');

    expect(receiversService.resolveMacByIp).toHaveBeenCalledWith('192.168.4.42');
  });

  describe('Priorité 1 — assignation cloud (configuration.json)', () => {
    test('returns displayIndex + displayName when MAC is assigned in config', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => '0c:43:f9:36:04:77'),
        getReceivers: jest.fn(() => [{ mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: null }]),
      });
      fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.mac).toBe('0c:43:f9:36:04:77');
      expect(res.body.displayIndex).toBe(1);
      expect(res.body.displayName).toBe('Buvette');
      expect(receiversService.assignDisplay).not.toHaveBeenCalled();
    });

    test('case-insensitive MAC match between resolved value and config entry', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => '0C:43:F9:36:04:77'),
        getReceivers: jest.fn(() => [{ mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: null }]),
      });
      fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.displayIndex).toBe(1);
    });
  });

  describe('Priorité 2 — assignation locale en cache', () => {
    test('returns cached displayIndex when MAC not in config but already in cache', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => 'fc:65:de:aa:bb:cc'),
        getReceivers: jest.fn(() => [{ mac: 'fc:65:de:aa:bb:cc', kind: 'firestick', displayIndex: 0 }]),
      });
      fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.displayIndex).toBe(0);
      expect(receiversService.assignDisplay).not.toHaveBeenCalled();
    });
  });

  describe('Priorité 3 — auto-assign (zéro intervention humaine)', () => {
    test('auto-assigns to display 0 when no config and no cache (premier connect)', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => 'fc:65:de:11:22:33'),
        getReceivers: jest.fn(() => [{ mac: 'fc:65:de:11:22:33', kind: 'firestick', displayIndex: null }]),
      });
      fs.readFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.displayIndex).toBe(0);
      expect(receiversService.assignDisplay).toHaveBeenCalledWith('fc:65:de:11:22:33', 0);
    });

    test('auto-assigns to first free slot when display 0 is taken by another Fire Stick', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => 'fc:65:de:aa:bb:cc'),
        getReceivers: jest.fn(() => [
          { mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: 0 },
          { mac: 'fc:65:de:aa:bb:cc', kind: 'firestick', displayIndex: null },
        ]),
      });
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          displays: [
            { index: 0, name: 'Salle', receiver: { kind: 'pi_native', mac: null } },
            { index: 1, name: 'Buvette', receiver: { kind: 'pi_native', mac: null } },
          ],
        })
      );
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.displayIndex).toBe(1);
      expect(receiversService.assignDisplay).toHaveBeenCalledWith('fc:65:de:aa:bb:cc', 1);
    });

    test('auto-assigns to display 0 as fallback when all slots are taken', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => 'fc:65:de:aa:bb:cc'),
        getReceivers: jest.fn(() => [
          { mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: 0 },
          { mac: '0c:43:f9:99:88:77', kind: 'firestick', displayIndex: 1 },
          { mac: 'fc:65:de:aa:bb:cc', kind: 'firestick', displayIndex: null },
        ]),
      });
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          displays: [
            { index: 0, name: 'Salle', receiver: { kind: 'pi_native', mac: null } },
            { index: 1, name: 'Buvette', receiver: { kind: 'pi_native', mac: null } },
          ],
        })
      );
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.status).toBe(200);
      expect(res.body.displayIndex).toBe(0);
      expect(receiversService.assignDisplay).toHaveBeenCalledWith('fc:65:de:aa:bb:cc', 0);
    });

    test('cloud config takes priority over local cache', async () => {
      const receiversService = makeReceiversService({
        resolveMacByIp: jest.fn(() => '0c:43:f9:36:04:77'),
        // cache says index 0, cloud says index 1
        getReceivers: jest.fn(() => [{ mac: '0c:43:f9:36:04:77', kind: 'firestick', displayIndex: 0 }]),
      });
      fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
      const app = buildApp(receiversService);

      const res = await request(app).get('/api/captive/whoami');

      expect(res.body.displayIndex).toBe(1); // cloud wins
      expect(res.body.displayName).toBe('Buvette');
      expect(receiversService.assignDisplay).not.toHaveBeenCalled();
    });
  });
});

describe('createCaptiveRouter()', () => {
  test('throws when receiversService is missing or lacks required methods', () => {
    expect(() => createCaptiveRouter({ configPath: '/tmp/x' })).toThrow(/receiversService/);
    expect(() => createCaptiveRouter({ receiversService: {}, configPath: '/tmp/x' })).toThrow(/receiversService/);
    expect(() =>
      createCaptiveRouter({ receiversService: { resolveMacByIp: () => null }, configPath: '/tmp/x' })
    ).toThrow(/receiversService/);
  });

  test('throws when configPath is missing', () => {
    expect(() =>
      createCaptiveRouter({
        receiversService: { resolveMacByIp: () => null, getReceivers: () => [], assignDisplay: () => {} },
      })
    ).toThrow(/configPath/);
  });
});
