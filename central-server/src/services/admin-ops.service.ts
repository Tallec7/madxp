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

class AdminOpsService {
  private readonly store: AdminStateStore;
  private readonly events = new EventEmitter();
  private state: AdminState;

  constructor(store = new AdminStateStore()) {
    this.store = store;
    this.state = this.store.load({ jobs: [], clients: [...DEFAULT_CLIENTS] });
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
