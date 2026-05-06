/**
 * Tests for /api/captive/whoami route (Phase 6 Plan 02 — CAPTIVE-02/03/04).
 *
 * Validates the IP→MAC→displayIndex resolution path:
 *  - 404 mac_not_found when receiversService cannot resolve the client IP
 *  - 200 with displayIndex/displayName when the MAC matches a configured display
 *  - 200 with displayIndex=null when MAC is known but unassigned
 *  - X-Real-IP forwarded header takes precedence over req.socket.remoteAddress
 *  - Resilient to unreadable configuration.json (200 + displayIndex=null)
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

describe('GET /api/captive/whoami', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 404 mac_not_found when receiversService cannot resolve IP', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => null) };
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('mac_not_found');
    expect(receiversService.resolveMacByIp).toHaveBeenCalledTimes(1);
  });

  test('returns displayIndex + displayName when MAC is assigned to a display', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => '0c:43:f9:36:04:77') };
    fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(200);
    expect(res.body.mac).toBe('0c:43:f9:36:04:77');
    expect(res.body.displayIndex).toBe(1);
    expect(res.body.displayName).toBe('Buvette');
  });

  test('returns displayIndex=null when MAC is known but not assigned to any display', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => 'aa:bb:cc:dd:ee:ff') };
    fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(200);
    expect(res.body.mac).toBe('aa:bb:cc:dd:ee:ff');
    expect(res.body.displayIndex).toBeNull();
    expect(res.body.displayName).toBeNull();
  });

  test('uses X-Real-IP header over socket.remoteAddress', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => null) };
    const app = buildApp(receiversService);

    await request(app).get('/api/captive/whoami').set('X-Real-IP', '192.168.4.42');

    expect(receiversService.resolveMacByIp).toHaveBeenCalledWith('192.168.4.42');
  });

  test('returns mac with displayIndex=null when configPath is unreadable', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => '0c:43:f9:36:04:77') };
    fs.readFileSync.mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory');
      err.code = 'ENOENT';
      throw err;
    });
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(200);
    expect(res.body.mac).toBe('0c:43:f9:36:04:77');
    expect(res.body.displayIndex).toBeNull();
    expect(res.body.displayName).toBeNull();
  });

  test('case-insensitive MAC match between resolved value and config entry', async () => {
    const receiversService = { resolveMacByIp: jest.fn(() => '0C:43:F9:36:04:77') };
    fs.readFileSync.mockReturnValue(JSON.stringify(SAMPLE_CONFIG));
    const app = buildApp(receiversService);

    const res = await request(app).get('/api/captive/whoami');

    expect(res.status).toBe(200);
    expect(res.body.displayIndex).toBe(1);
  });
});

describe('createCaptiveRouter()', () => {
  test('throws when receiversService is missing or lacks resolveMacByIp', () => {
    expect(() => createCaptiveRouter({ configPath: '/tmp/x' })).toThrow(/receiversService/);
    expect(() => createCaptiveRouter({ receiversService: {}, configPath: '/tmp/x' })).toThrow(/receiversService/);
  });

  test('throws when configPath is missing', () => {
    expect(() => createCaptiveRouter({ receiversService: { resolveMacByIp: () => null } })).toThrow(/configPath/);
  });
});
