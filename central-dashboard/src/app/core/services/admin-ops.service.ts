import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminActionRequest, AdminJob, AdminActionType, LocalClient, LocalClientInput } from '../models/admin';
import { NotificationService } from './notification.service';

const DEFAULT_CLIENTS: LocalClient[] = [
  {
    id: 'cli-001',
    name: 'Demo Club',
    code: 'demo-club',
    contactEmail: 'demo@neopro.io',
    timezone: 'Europe/Paris',
    siteCount: 3,
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    lastSyncAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
  }
];

@Injectable({ providedIn: 'root' })
export class AdminOpsService {
  private jobs$ = new BehaviorSubject<AdminJob[]>([]);
  private clients$ = new BehaviorSubject<LocalClient[]>(DEFAULT_CLIENTS);

  constructor(private readonly notifications: NotificationService) {}

  getJobs(): Observable<AdminJob[]> {
    return this.jobs$.asObservable();
  }

  getClients(): Observable<LocalClient[]> {
    return this.clients$.asObservable();
  }

  triggerAction(request: AdminActionRequest, requestedBy = 'local-admin'): Observable<AdminJob> {
    const now = new Date();
    const job: AdminJob = {
      id: `job-${now.getTime()}`,
      action: request.action,
      status: 'queued',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      requestedBy,
      parameters: request.parameters,
      summary: request.note,
      logs: [`${now.toLocaleTimeString()} • Demande reçue pour ${request.action}`]
    };

    this.jobs$.next([job, ...this.jobs$.value]);

    // Simuler un passage en running puis success
    timer(250)
      .pipe(
        tap(() => this.updateJob(job.id, { status: 'running', logs: [...(job.logs || []), `${new Date().toLocaleTimeString()} • Exécution en cours`] })),
        tap(() =>
          setTimeout(() => {
            this.updateJob(job.id, {
              status: 'succeeded',
              updatedAt: new Date().toISOString(),
              logs: [...(this.findJob(job.id)?.logs || []), `${new Date().toLocaleTimeString()} • Terminé avec succès`]
            });
            this.notifications.success(`Action ${request.action} terminée`);
          }, 600)
        )
      )
      .subscribe();

    return of(job);
  }

  createClient(input: LocalClientInput): Observable<LocalClient> {
    const now = new Date();
    const client: LocalClient = {
      ...input,
      id: `client-${now.getTime()}`,
      createdAt: now.toISOString(),
      status: 'active',
      lastSyncAt: now.toISOString()
    };

    this.clients$.next([client, ...this.clients$.value]);
    this.notifications.success(`Client ${client.name} créé`);
    return of(client);
  }

  syncClient(clientId: string): Observable<LocalClient | undefined> {
    const client = this.findClient(clientId);
    if (!client) {
      return of(undefined);
    }

    const updatedClient: LocalClient = {
      ...client,
      lastSyncAt: new Date().toISOString(),
      status: 'active'
    };

    this.clients$.next(
      this.clients$.value.map(existing => (existing.id === clientId ? updatedClient : existing))
    );
    this.notifications.success(`Client ${updatedClient.name} resynchronisé`);
    return of(updatedClient);
  }

  getActionLabel(action: AdminActionType): string {
    switch (action) {
      case 'build:central':
        return 'Build front central';
      case 'build:raspberry':
        return 'Build Raspberry';
      case 'deploy:raspberry':
        return 'Déploiement Raspberry';
      case 'tests:full':
        return 'Tests complets';
      case 'sync:clients':
        return 'Relance synchronisation clients';
      case 'maintenance:restart':
        return 'Redémarrage services';
      default:
        return action;
    }
  }

  private updateJob(jobId: string, patch: Partial<AdminJob>): void {
    this.jobs$.next(
      this.jobs$.value.map(job =>
        job.id === jobId
          ? {
              ...job,
              ...patch,
              logs: patch.logs || job.logs,
              updatedAt: patch.updatedAt || new Date().toISOString()
            }
          : job
      )
    );
  }

  private findJob(jobId: string): AdminJob | undefined {
    return this.jobs$.value.find(job => job.id === jobId);
  }

  private findClient(clientId: string): LocalClient | undefined {
    return this.clients$.value.find(client => client.id === clientId);
  }
}
