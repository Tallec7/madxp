import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { generateToken } from '../middleware/auth';

let app: import('express').Express;
let httpServer: import('http').Server;
let adminOpsService: typeof import('../services/admin-ops.service').adminOpsService;
let stateFile: string;

const adminToken = generateToken({ id: 'user-1', email: 'admin@example.com', role: 'admin' });
const authHeader = { Authorization: `Bearer ${adminToken}` };

describe('Admin routes', () => {
  beforeAll(async () => {
    stateFile = path.resolve(__dirname, '../../tmp/admin-state.test.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.rmSync(stateFile, { force: true });
    process.env.ADMIN_STATE_FILE = stateFile;

    const server = await import('../server');
    app = server.app;
    httpServer = server.httpServer;
    const adminServiceModule = await import('../services/admin-ops.service');
    adminOpsService = adminServiceModule.adminOpsService;
  });

  beforeEach(() => {
    adminOpsService.resetForTests();
  });

  afterAll(done => {
    fs.rmSync(stateFile, { force: true });
    httpServer.close(done);
  });

  it('should list seeded clients and empty jobs', async () => {
    const response = await request(app).get('/api/admin/clients').set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body.clients.length).toBeGreaterThanOrEqual(1);

    const jobs = await request(app).get('/api/admin/jobs').set(authHeader);
    expect(jobs.status).toBe(200);
    expect(Array.isArray(jobs.body.jobs)).toBe(true);
  });

  it('should enqueue a job when posting an allowed action', async () => {
    const response = await request(app)
      .post('/api/admin/jobs')
      .set(authHeader)
      .send({ action: 'build:central', parameters: { target: 'dev-local' } });

    expect(response.status).toBe(201);
    expect(response.body.job.action).toBe('build:central');
    expect(response.body.job.status).toBe('queued');
  });

  it('should persist jobs to disk', async () => {
    await request(app)
      .post('/api/admin/jobs')
      .set(authHeader)
      .send({ action: 'build:central', parameters: { target: 'dev-local' } });

    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(Array.isArray(persisted.jobs)).toBe(true);
    expect(persisted.jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('should refuse an unknown action', async () => {
    const response = await request(app)
      .post('/api/admin/jobs')
      .set(authHeader)
      .send({ action: 'bad:cmd' });

    expect(response.status).toBe(400);
  });

  it('should create and sync a client', async () => {
    const createResponse = await request(app)
      .post('/api/admin/clients')
      .set(authHeader)
      .send({ name: 'Test', code: 'test-client', contactEmail: 'ops@example.com' });

    expect(createResponse.status).toBe(201);
    const clientId = createResponse.body.client.id;

    const syncResponse = await request(app)
      .post(`/api/admin/clients/${clientId}/sync`)
      .set(authHeader);

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.client.id).toBe(clientId);
  });

  it('should return 404 when syncing unknown client', async () => {
    const response = await request(app).post('/api/admin/clients/unknown/sync').set(authHeader);
    expect(response.status).toBe(404);
  });
});
