/**
 * CLOUD-01 — GET /api/sites/:id/connected-receivers
 * Tests: tri desc par lastSeenAt, siteId inconnu → [], auth requise.
 */
import request from 'supertest';
import { generateToken } from '../middleware/auth';
import socketService from '../services/socket.service';

// Valid UUID v4 to pass validateParams(paramSchemas.id)
const SITE_ID = '550e8400-e29b-41d4-a716-446655440099';

const adminToken = generateToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' });

let app: import('express').Express;
let httpServer: import('http').Server;

describe('GET /api/sites/:id/connected-receivers', () => {
  beforeAll(async () => {
    process.env.PORT = '3098';
    const mod = await import('../server');
    app = mod.app;
    httpServer = mod.httpServer;
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  afterEach(() => {
    // Reset receivers for the test site to avoid test pollution
    socketService.__setReceiversForTest(SITE_ID, []);
  });

  it('returns receivers sorted by lastSeenAt desc', async () => {
    socketService.__setReceiversForTest(SITE_ID, [
      { mac: 'aa:01', kind: 'firestick', lastSeenAt: 100 },
      { mac: 'aa:02', kind: 'firestick', lastSeenAt: 300 },
      { mac: 'aa:03', kind: 'firestick', lastSeenAt: 200 },
    ]);

    const res = await request(app)
      .get(`/api/sites/${SITE_ID}/connected-receivers`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.receivers).toBeDefined();
    expect(res.body.receivers.map((r: { mac: string }) => r.mac)).toEqual(['aa:02', 'aa:03', 'aa:01']);
  });

  it('returns empty array for unknown siteId', async () => {
    const unknownSiteId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get(`/api/sites/${unknownSiteId}/connected-receivers`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.receivers).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get(`/api/sites/${SITE_ID}/connected-receivers`);

    expect(res.status).toBe(401);
  });
});
