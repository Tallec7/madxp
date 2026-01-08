import { randomUUID } from 'crypto';
import Joi from 'joi';
import EventEmitter from 'events';
import logger from '../config/logger';
import { AdminActionRequest, AdminActionType, AdminJob, LocalClient, LocalClientInput } from '../types/admin';
import { AdminState, AdminStateStore } from './admin-state.store';

const ALLOWED_ACTIONS: AdminActionType[] = [
  'build:central',
  'build:raspberry',
  'deploy:raspberry',
  'tests:full',
  'sync:clients',
  'maintenance:restart',
];

const DEFAULT_CLIENTS: LocalClient[] = [
  {
    id: 'cli-seed-001',
    name: 'Demo Club',
    code: 'demo-club',
    contactEmail: 'demo@neopro.io',
    timezone: 'Europe/Paris',
    siteCount: 3,
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    lastSyncAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

const clientSchema = Joi.object<LocalClientInput>({
  name: Joi.string().min(3).max(120).required(),
  code: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(2)
    .max(50)
    .required(),
  contactEmail: Joi.string().email().allow('', null),
  timezone: Joi.string().max(80).default('Europe/Paris'),
  siteCount: Joi.number().integer().min(0).default(0),
});

const actionSchema = Joi.object<AdminActionRequest>({
  action: Joi.string()
    .valid(...ALLOWED_ACTIONS)
    .required(),
  parameters: Joi.object().pattern(/^[a-zA-Z0-9:_-]+$/, Joi.string().max(120)).optional(),
  note: Joi.string().max(500).allow('', null),
});

// Configuration for job cleanup
const MAX_JOBS_IN_MEMORY = 100;
const JOB_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const JOB_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class AdminOpsService {
  private readonly store: AdminStateStore;
  private readonly events = new EventEmitter();
  private state: AdminState;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(store = new AdminStateStore()) {
    this.store = store;
    this.state = this.store.load({ jobs: [], clients: [...DEFAULT_CLIENTS] });
    this.startJobCleanup();
  }

  /**
   * Starts periodic cleanup of old jobs to prevent memory leaks
   */
  private startJobCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldJobs();
    }, JOB_CLEANUP_INTERVAL_MS);

    // Run initial cleanup
    this.cleanupOldJobs();
  }

  /**
   * Removes jobs older than JOB_MAX_AGE_MS or exceeding MAX_JOBS_IN_MEMORY
   */
  private cleanupOldJobs(): void {
    const now = Date.now();
    const initialCount = this.state.jobs.length;

    // Filter out old jobs (keep only jobs < 1 hour old)
    let filteredJobs = this.state.jobs.filter((job) => {
      const jobAge = now - new Date(job.createdAt).getTime();
      return jobAge < JOB_MAX_AGE_MS;
    });

    // Also enforce max jobs limit (keep most recent)
    if (filteredJobs.length > MAX_JOBS_IN_MEMORY) {
      filteredJobs = filteredJobs.slice(0, MAX_JOBS_IN_MEMORY);
    }

    const removedCount = initialCount - filteredJobs.length;

    if (removedCount > 0) {
      this.state = { ...this.state, jobs: filteredJobs };
      this.persist();
      logger.info('Cleaned up old admin jobs', {
        removedCount,
        remainingCount: filteredJobs.length,
      });
    }
  }

  /**
   * Stops the cleanup interval (for tests and shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  listJobs(): AdminJob[] {
    return this.state.jobs;
  }

  listClients(): LocalClient[] {
    return this.state.clients;
  }

  triggerAction(request: AdminActionRequest, requestedBy: string): AdminJob {
    const { error, value } = actionSchema.validate(request);
    if (error) {
      throw new Error(`Invalid action payload: ${error.message}`);
    }

    const now = new Date();
    const job: AdminJob = {
      id: `job-${randomUUID()}`,
      action: value.action as AdminActionType,
      status: 'queued',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      requestedBy,
      parameters: value.parameters,
      summary: value.note ?? undefined,
      logs: [`${now.toISOString()} • Demande reçue pour ${value.action}`],
    };

    this.state = { ...this.state, jobs: [job, ...this.state.jobs] };
    this.persist();
    this.events.emit('job', job);
    this.simulateProgress(job.id);
    return job;
  }

  createClient(input: LocalClientInput): LocalClient {
    const { error, value } = clientSchema.validate(input);
    if (error) {
      throw new Error(`Invalid client payload: ${error.message}`);
    }

    const now = new Date();
    const client: LocalClient = {
      ...value,
      id: `client-${randomUUID()}`,
      createdAt: now.toISOString(),
      lastSyncAt: now.toISOString(),
      status: 'active',
    };

    this.state = { ...this.state, clients: [client, ...this.state.clients] };
    this.persist();
    return client;
  }

  syncClient(clientId: string): LocalClient {
    const existing = this.state.clients.find((client) => client.id === clientId);
    if (!existing) {
      throw new Error('Client not found');
    }

    const updated: LocalClient = {
      ...existing,
      lastSyncAt: new Date().toISOString(),
      status: 'active',
    };

    this.state = {
      ...this.state,
      clients: this.state.clients.map((client) => (client.id === clientId ? updated : client)),
    };
    this.persist();
    return updated;
  }

  private simulateProgress(jobId: string): void {
    const runningLog = `${new Date().toISOString()} • Exécution en cours`;
    setTimeout(() => {
      this.updateJob(jobId, {
        status: 'running',
        logs: [...(this.findJob(jobId)?.logs ?? []), runningLog],
      });
    }, 200);

    const completionLog = `${new Date().toISOString()} • Terminé avec succès (stub)`;
    setTimeout(() => {
      this.updateJob(jobId, {
        status: 'succeeded',
        logs: [...(this.findJob(jobId)?.logs ?? []), completionLog],
      });
    }, 700);
  }

  private updateJob(jobId: string, patch: Partial<AdminJob>): void {
    const updatedAt = patch.updatedAt ?? new Date().toISOString();
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...patch,
              logs: patch.logs ?? job.logs,
              updatedAt,
            }
          : job
      ),
    };
    const updatedJob = this.findJob(jobId);
    if (updatedJob) {
      this.events.emit('job', updatedJob);
    }
    this.persist();
    logger.debug('Job updated', { jobId, status: patch.status });
  }

  private findJob(jobId: string): AdminJob | undefined {
    return this.state.jobs.find((job) => job.id === jobId);
  }

  /**
   * Utility reserved for test suites to reset the in-memory state
   */
  resetForTests(): void {
    this.state = { jobs: [], clients: [...DEFAULT_CLIENTS] };
    this.store.reset(this.state);
  }

  subscribeToJobs(listener: (job: AdminJob) => void): () => void {
    this.events.on('job', listener);
    return () => this.events.off('job', listener);
  }

  private persist(): void {
    this.store.persist(this.state);
  }
}

export const adminOpsService = new AdminOpsService();
export { ALLOWED_ACTIONS };
