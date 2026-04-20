import request from 'supertest';
import { generateToken } from '../middleware/auth';
import type { UserRole } from '../types';

/**
 * ADR-075 Sprint 4 — Permission tests pour les routes Template Studio.
 * Garantit que seul `super_admin` peut lire/muter la composition V2 d'un
 * template. `admin`, `operator`, `club`, `viewer` doivent tous recevoir 403.
 * Sans JWT → 401.
 *
 * Les tests utilisent des tokens générés (JWT_SECRET injecté dans setup.ts)
 * et la DB mockée — on observe uniquement le verdict auth/role, pas la
 * logique métier des controllers.
 */

// Valid UUID v4 to pass `paramSchemas.id` before hitting the role guard.
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const VARIANT_ID  = '550e8400-e29b-41d4-a716-446655440001';

const routes = [
  // reads
  { method: 'get' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/studio` },
  { method: 'get' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/variants` },
  { method: 'get' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/layers` },
  { method: 'get' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/text-fields` },
  { method: 'get' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/image-slots` },
  // writes
  { method: 'post' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/variants`, body: {
    name: 'V1',
    backgroundVideoUrl: 'https://example.com/a.mp4',
    sortOrder: 0,
  } },
  { method: 'patch' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/variants/${VARIANT_ID}`, body: {
    name: 'V1b',
  } },
  { method: 'delete' as const, path: `/api/remotion-templates/${TEMPLATE_ID}/variants/${VARIANT_ID}` },
];

let app: import('express').Express;
let httpServer: import('http').Server;

describe('Template Studio V2 — super_admin-only permissions (ADR-075)', () => {
  beforeAll(async () => {
    process.env.PORT = '3097';
    const mod = await import('../server');
    app = mod.app;
    httpServer = mod.httpServer;
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  describe('no token → 401', () => {
    for (const r of routes) {
      it(`${r.method.toUpperCase()} ${r.path}`, async () => {
        const req = request(app)[r.method](r.path);
        const res = 'body' in r && r.body ? await req.send(r.body) : await req;
        expect(res.status).toBe(401);
      });
    }
  });

  describe.each<[UserRole, string]>([
    ['admin',    'admin@example.com'],
    ['operator', 'operator@example.com'],
    ['club',     'club@example.com'],
    ['viewer',   'viewer@example.com'],
  ])('role=%s → 403', (role, email) => {
    const token = generateToken({ id: `user-${role}`, email, role });
    const header = { Authorization: `Bearer ${token}` };

    for (const r of routes) {
      it(`${r.method.toUpperCase()} ${r.path}`, async () => {
        const req = request(app)[r.method](r.path).set(header);
        const res = 'body' in r && r.body ? await req.send(r.body) : await req;
        expect(res.status).toBe(403);
      });
    }
  });

  describe('role=super_admin → NOT 401/403 (auth passes, controller/DB takes over)', () => {
    const token = generateToken({
      id: 'user-sa',
      email: 'sa@example.com',
      role: 'super_admin',
    });
    const header = { Authorization: `Bearer ${token}` };

    for (const r of routes) {
      it(`${r.method.toUpperCase()} ${r.path}`, async () => {
        const req = request(app)[r.method](r.path).set(header);
        const res = 'body' in r && r.body ? await req.send(r.body) : await req;
        // We only care that the role guard did not reject us.
        // Downstream (400 validation, 404 not found, 500 DB mock) is acceptable.
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    }
  });
});
