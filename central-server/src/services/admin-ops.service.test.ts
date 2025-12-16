/**
 * Tests unitaires pour le service d'opérations admin
 *
 * @module admin-ops.service.test
 */

// Mock logger
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock AdminStateStore
const mockStore = {
  load: jest.fn(),
  persist: jest.fn(),
  reset: jest.fn(),
};

jest.mock('./admin-state.store', () => ({
  AdminStateStore: jest.fn().mockImplementation(() => mockStore),
}));

import { adminOpsService, ALLOWED_ACTIONS } from './admin-ops.service';

describe('AdminOpsService', () => {
  const initialState = {
    jobs: [],
    clients: [
      {
        id: 'cli-seed-001',
        name: 'Demo Club',
        code: 'demo-club',
        contactEmail: 'demo@neopro.io',
        timezone: 'Europe/Paris',
        siteCount: 3,
        status: 'active',
        createdAt: expect.any(String),
        lastSyncAt: expect.any(String),
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock store
    mockStore.load.mockImplementation((defaultState) => ({ ...defaultState }));
    mockStore.persist.mockReturnValue(undefined);
    mockStore.reset.mockReturnValue(undefined);

    // Reset service state
    adminOpsService.resetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('ALLOWED_ACTIONS', () => {
    it('should contain all expected action types', () => {
      expect(ALLOWED_ACTIONS).toContain('build:central');
      expect(ALLOWED_ACTIONS).toContain('build:raspberry');
      expect(ALLOWED_ACTIONS).toContain('deploy:raspberry');
      expect(ALLOWED_ACTIONS).toContain('tests:full');
      expect(ALLOWED_ACTIONS).toContain('sync:clients');
      expect(ALLOWED_ACTIONS).toContain('maintenance:restart');
    });

    it('should have exactly 6 allowed actions', () => {
      expect(ALLOWED_ACTIONS).toHaveLength(6);
    });
  });

  describe('listJobs', () => {
    it('should return empty array when no jobs exist', () => {
      const jobs = adminOpsService.listJobs();
      expect(jobs).toEqual([]);
    });

    it('should return all jobs', () => {
      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');
      adminOpsService.triggerAction({ action: 'tests:full' }, 'admin@test.com');

      const jobs = adminOpsService.listJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('listClients', () => {
    it('should return default clients on initialization', () => {
      const clients = adminOpsService.listClients();

      expect(clients).toHaveLength(1);
      expect(clients[0].name).toBe('Demo Club');
      expect(clients[0].code).toBe('demo-club');
    });

    it('should return newly created clients', () => {
      adminOpsService.createClient({
        name: 'New Client',
        code: 'new-client',
        contactEmail: 'contact@new.com',
      });

      const clients = adminOpsService.listClients();
      expect(clients).toHaveLength(2);
      expect(clients[0].name).toBe('New Client');
    });
  });

  describe('triggerAction', () => {
    it('should create a job with correct initial status', () => {
      const job = adminOpsService.triggerAction(
        { action: 'build:central' },
        'admin@test.com'
      );

      expect(job.id).toMatch(/^job-/);
      expect(job.action).toBe('build:central');
      expect(job.status).toBe('queued');
      expect(job.requestedBy).toBe('admin@test.com');
      expect(job.createdAt).toBeDefined();
      expect(job.updatedAt).toBeDefined();
      expect(job.logs).toHaveLength(1);
      expect(job.logs![0]).toContain('Demande reçue');
    });

    it('should accept parameters', () => {
      const job = adminOpsService.triggerAction(
        {
          action: 'deploy:raspberry',
          parameters: { target: 'dev-local', version: '1.0.0' },
        },
        'admin@test.com'
      );

      expect(job.parameters).toEqual({ target: 'dev-local', version: '1.0.0' });
    });

    it('should accept note as summary', () => {
      const job = adminOpsService.triggerAction(
        {
          action: 'tests:full',
          note: 'Running before release',
        },
        'admin@test.com'
      );

      expect(job.summary).toBe('Running before release');
    });

    it('should throw error for invalid action', () => {
      expect(() => {
        adminOpsService.triggerAction(
          { action: 'invalid:action' as never },
          'admin@test.com'
        );
      }).toThrow('Invalid action payload');
    });

    it('should persist after creating job', () => {
      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');

      expect(mockStore.persist).toHaveBeenCalled();
    });

    it('should prepend new job to jobs list', () => {
      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');
      adminOpsService.triggerAction({ action: 'tests:full' }, 'admin@test.com');

      const jobs = adminOpsService.listJobs();
      expect(jobs[0].action).toBe('tests:full');
      expect(jobs[1].action).toBe('build:central');
    });

    it('should simulate job progress to running', () => {
      const job = adminOpsService.triggerAction(
        { action: 'build:central' },
        'admin@test.com'
      );

      jest.advanceTimersByTime(200);

      const jobs = adminOpsService.listJobs();
      const updatedJob = jobs.find((j) => j.id === job.id);
      expect(updatedJob?.status).toBe('running');
      expect(updatedJob?.logs).toContainEqual(expect.stringContaining('Exécution en cours'));
    });

    it('should simulate job progress to succeeded', () => {
      const job = adminOpsService.triggerAction(
        { action: 'build:central' },
        'admin@test.com'
      );

      jest.advanceTimersByTime(700);

      const jobs = adminOpsService.listJobs();
      const updatedJob = jobs.find((j) => j.id === job.id);
      expect(updatedJob?.status).toBe('succeeded');
      expect(updatedJob?.logs).toContainEqual(expect.stringContaining('Terminé avec succès'));
    });
  });

  describe('createClient', () => {
    it('should create a client with valid input', () => {
      const client = adminOpsService.createClient({
        name: 'Test Club',
        code: 'test-club',
        contactEmail: 'test@club.com',
        timezone: 'Europe/London',
        siteCount: 5,
      });

      expect(client.id).toMatch(/^client-/);
      expect(client.name).toBe('Test Club');
      expect(client.code).toBe('test-club');
      expect(client.contactEmail).toBe('test@club.com');
      expect(client.timezone).toBe('Europe/London');
      expect(client.siteCount).toBe(5);
      expect(client.status).toBe('active');
      expect(client.createdAt).toBeDefined();
      expect(client.lastSyncAt).toBeDefined();
    });

    it('should use default values for optional fields', () => {
      const client = adminOpsService.createClient({
        name: 'Minimal Client',
        code: 'minimal-client',
      });

      expect(client.timezone).toBe('Europe/Paris');
      expect(client.siteCount).toBe(0);
    });

    it('should throw error for name too short', () => {
      expect(() => {
        adminOpsService.createClient({
          name: 'AB',
          code: 'valid-code',
        });
      }).toThrow('Invalid client payload');
    });

    it('should throw error for invalid code format', () => {
      expect(() => {
        adminOpsService.createClient({
          name: 'Valid Name',
          code: 'Invalid Code!',
        });
      }).toThrow('Invalid client payload');
    });

    it('should throw error for invalid email', () => {
      expect(() => {
        adminOpsService.createClient({
          name: 'Valid Name',
          code: 'valid-code',
          contactEmail: 'not-an-email',
        });
      }).toThrow('Invalid client payload');
    });

    it('should allow empty email', () => {
      const client = adminOpsService.createClient({
        name: 'No Email Client',
        code: 'no-email',
        contactEmail: '',
      });

      expect(client.contactEmail).toBe('');
    });

    it('should persist after creating client', () => {
      adminOpsService.createClient({
        name: 'Test Client',
        code: 'test-client',
      });

      expect(mockStore.persist).toHaveBeenCalled();
    });

    it('should prepend new client to clients list', () => {
      adminOpsService.createClient({
        name: 'New Client',
        code: 'new-client',
      });

      const clients = adminOpsService.listClients();
      expect(clients[0].name).toBe('New Client');
    });
  });

  describe('syncClient', () => {
    it('should update lastSyncAt for existing client', () => {
      const clients = adminOpsService.listClients();
      const originalSyncAt = clients[0].lastSyncAt;

      // Advance time a bit
      jest.advanceTimersByTime(1000);

      const syncedClient = adminOpsService.syncClient(clients[0].id);

      expect(syncedClient.lastSyncAt).not.toBe(originalSyncAt);
      expect(syncedClient.status).toBe('active');
    });

    it('should throw error for non-existent client', () => {
      expect(() => {
        adminOpsService.syncClient('non-existent-id');
      }).toThrow('Client not found');
    });

    it('should persist after syncing client', () => {
      const clients = adminOpsService.listClients();
      mockStore.persist.mockClear();

      adminOpsService.syncClient(clients[0].id);

      expect(mockStore.persist).toHaveBeenCalled();
    });

    it('should sync newly created client', () => {
      const newClient = adminOpsService.createClient({
        name: 'New Club',
        code: 'new-club',
      });

      jest.advanceTimersByTime(1000);

      const syncedClient = adminOpsService.syncClient(newClient.id);

      expect(syncedClient.id).toBe(newClient.id);
      expect(syncedClient.lastSyncAt).not.toBe(newClient.lastSyncAt);
    });
  });

  describe('subscribeToJobs', () => {
    it('should receive job events when subscribed', () => {
      const listener = jest.fn();
      adminOpsService.subscribeToJobs(listener);

      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'build:central',
          status: 'queued',
        })
      );
    });

    it('should receive status update events', () => {
      const listener = jest.fn();
      adminOpsService.subscribeToJobs(listener);

      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');

      // Initial job creation
      expect(listener).toHaveBeenCalledTimes(1);

      // Advance to running status
      jest.advanceTimersByTime(200);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'running' })
      );

      // Advance to succeeded status
      jest.advanceTimersByTime(500);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'succeeded' })
      );
    });

    it('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = adminOpsService.subscribeToJobs(listener);

      unsubscribe();

      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      adminOpsService.subscribeToJobs(listener1);
      adminOpsService.subscribeToJobs(listener2);

      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('resetForTests', () => {
    it('should reset jobs to empty array', () => {
      adminOpsService.triggerAction({ action: 'build:central' }, 'admin@test.com');
      expect(adminOpsService.listJobs()).toHaveLength(1);

      adminOpsService.resetForTests();

      expect(adminOpsService.listJobs()).toHaveLength(0);
    });

    it('should reset clients to default', () => {
      adminOpsService.createClient({
        name: 'Test Client',
        code: 'test-client',
      });
      expect(adminOpsService.listClients()).toHaveLength(2);

      adminOpsService.resetForTests();

      expect(adminOpsService.listClients()).toHaveLength(1);
      expect(adminOpsService.listClients()[0].name).toBe('Demo Club');
    });

    it('should call store reset', () => {
      adminOpsService.resetForTests();

      expect(mockStore.reset).toHaveBeenCalled();
    });
  });
});
