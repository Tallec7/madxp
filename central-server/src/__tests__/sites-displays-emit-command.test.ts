/**
 * CLOUD-02 / CLOUD-03 — PATCH /api/sites/:id/displays
 * Vérifie que commandQueueService.sendOrQueue est appelé avec
 * 'receiver_assignment_updated' après chaque PATCH displays réussi.
 *
 * Pattern best-effort : une erreur de queue ne bloque pas la réponse HTTP 200.
 */
import request from 'supertest';
import { generateToken } from '../middleware/auth';

// --- Mocks ---
jest.mock('../services/command-queue.service', () => ({
  commandQueueService: { sendOrQueue: jest.fn() },
}));

jest.mock('../repositories', () => {
  const FAKE_SITE = { id: '550e8400-e29b-41d4-a716-446655440099', name: 'Club Test', status: 'online' };
  return {
    siteRepository: {
      findBasicInfo: jest.fn().mockResolvedValue(FAKE_SITE),
      updateDisplays: jest.fn().mockResolvedValue(undefined),
      getDisplays: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(FAKE_SITE),
    },
    configProfileRepository: {
      findBySiteId: jest.fn().mockResolvedValue([]),
    },
  };
});

// Dynamic imports resolved after mocks
let app: import('express').Express;
let httpServer: import('http').Server;
let commandQueueService: { sendOrQueue: jest.Mock };

// UUID v4 valide pour passer validateParams(paramSchemas.id)
const SITE_ID = '550e8400-e29b-41d4-a716-446655440099';
const adminToken = generateToken({ id: 'user-1', email: 'admin@test.com', role: 'admin' });

describe('PATCH /api/sites/:id/displays — receiver_assignment_updated emit (CLOUD-02)', () => {
  beforeAll(async () => {
    const mod = await import('../server');
    app = mod.app;
    httpServer = mod.httpServer;
    const cqMod = await import('../services/command-queue.service');
    commandQueueService = cqMod.commandQueueService as unknown as { sendOrQueue: jest.Mock };
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  beforeEach(() => {
    (commandQueueService.sendOrQueue as jest.Mock).mockReset();
    (commandQueueService.sendOrQueue as jest.Mock).mockResolvedValue(undefined);
  });

  it('queues receiver_assignment_updated with full displays array on success', async () => {
    const displays = [
      { index: 0, name: 'TV 1', type: 'tv', receiver: { kind: 'pi_native' } },
      { index: 1, name: 'Bar', type: 'tv', receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:ff' } },
    ];

    const res = await request(app)
      .patch(`/api/sites/${SITE_ID}/displays`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displays });

    expect(res.status).toBe(200);
    expect(commandQueueService.sendOrQueue).toHaveBeenCalledTimes(1);
    expect(commandQueueService.sendOrQueue).toHaveBeenCalledWith(
      SITE_ID,
      'receiver_assignment_updated',
      expect.objectContaining({ displays: expect.any(Array) }),
    );
  });

  it('queues command even when payload has no receiver (pattern update_config)', async () => {
    const displays = [{ index: 0, name: 'TV principale', type: 'tv', receiver: { kind: 'pi_native' } }];

    const res = await request(app)
      .patch(`/api/sites/${SITE_ID}/displays`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displays });

    expect(res.status).toBe(200);
    expect(commandQueueService.sendOrQueue).toHaveBeenCalledWith(
      SITE_ID,
      'receiver_assignment_updated',
      expect.any(Object),
    );
  });

  it('returns 200 even if sendOrQueue throws (best-effort queue)', async () => {
    (commandQueueService.sendOrQueue as jest.Mock).mockRejectedValueOnce(
      new Error('queue down'),
    );

    const res = await request(app)
      .patch(`/api/sites/${SITE_ID}/displays`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displays: [{ index: 0, name: 'TV principale', type: 'tv' }] });

    expect(res.status).toBe(200);
  });
});
