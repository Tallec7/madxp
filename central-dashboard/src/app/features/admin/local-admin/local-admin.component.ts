import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminOpsService } from '../../../core/services/admin-ops.service';
import { AdminActionType, AdminJob, LocalClient } from '../../../core/models/admin';

@Component({
  selector: 'app-local-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Console locale</p>
          <h1>Administration locale</h1>
          <p class="subtitle">
            Déclenchez les scripts récurrents, suivez les jobs et gérez les clients sans quitter le navigateur.
          </p>
        </div>
        <div class="header-actions">
          <div class="badge">Mode stub</div>
          <span class="hint">Les actions sont simulées en local.</span>
          <span class="hint" *ngIf="loading()">Synchronisation avec l'API...</span>
        </div>
      </header>

      <section class="grid">
        <article class="card">
          <div class="card-header">
            <div>
              <p class="eyebrow">Actions</p>
              <h2>Scripts et opérations</h2>
              <p class="subtitle">Lancez un build, des tests ou un redémarrage de services.</p>
            </div>
            <div class="pill">Validation + confirmation</div>
          </div>

          <form [formGroup]="actionForm" (ngSubmit)="submitAction()" class="form-grid">
            <label class="form-group">
              <span>Action *</span>
              <select formControlName="action">
                <option [ngValue]="null" disabled>Sélectionnez...</option>
                <option *ngFor="let option of actionOptions" [value]="option">{{ getActionLabel(option) }}</option>
              </select>
              <small class="hint">Actions whitelistees pour la console locale.</small>
            </label>

            <label class="form-group">
              <span>Branch / cible</span>
              <input formControlName="target" placeholder="ex: main ou dev-local" />
              <small class="hint">Optionnel selon l'action (build/test).</small>
            </label>

            <label class="form-group full">
              <span>Notes</span>
              <textarea formControlName="note" rows="3" placeholder="Contexte ou paramètres additionnels"></textarea>
            </label>

            <label class="form-group">
              <span>Confirmer l'exécution *</span>
              <label class="confirm-toggle">
                <input type="checkbox" formControlName="confirm" />
                <span>Je comprends que cette action peut être longue.</span>
              </label>
            </label>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary" [disabled]="!actionForm.valid">Lancer</button>
              <button type="button" class="btn btn-ghost" (click)="resetActionForm()">Réinitialiser</button>
            </div>
          </form>
        </article>

        <article class="card">
          <div class="card-header">
            <div>
              <p class="eyebrow">Clients</p>
              <h2>Création rapide</h2>
              <p class="subtitle">Créez un client local et relancez une synchronisation.</p>
            </div>
            <div class="pill">Validation formulaire</div>
          </div>

          <form [formGroup]="clientForm" (ngSubmit)="submitClient()" class="form-grid">
            <label class="form-group">
              <span>Nom *</span>
              <input formControlName="name" placeholder="Nom du client" />
            </label>

            <label class="form-group">
              <span>Code *</span>
              <input formControlName="code" placeholder="code-interne" />
              <small class="hint">Minuscule, tirets autorisés.</small>
            </label>

            <label class="form-group">
              <span>Email contact</span>
              <input formControlName="contactEmail" placeholder="ops@client.fr" />
            </label>

            <label class="form-group">
              <span>Fuseau horaire</span>
              <input formControlName="timezone" placeholder="Europe/Paris" />
            </label>

            <label class="form-group">
              <span>Sites</span>
              <input type="number" formControlName="siteCount" min="0" />
            </label>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary" [disabled]="!clientForm.valid">Créer</button>
              <button type="button" class="btn btn-ghost" (click)="clientForm.reset(defaultClientValue)">
                Effacer
              </button>
            </div>
          </form>
        </article>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Suivi</p>
            <h2>Jobs récents</h2>
            <p class="subtitle">Historique local (simulation) avec statut et logs.</p>
          </div>
          <button class="btn btn-ghost" type="button" (click)="refreshJobStatuses()" [disabled]="loading()">
            Actualiser
          </button>
        </div>

        <div class="jobs" *ngIf="jobs().length; else emptyJobs">
          <div class="job" *ngFor="let job of jobs()">
            <div class="job-main">
              <div class="job-title">{{ getActionLabel(job.action) }}</div>
              <div class="job-meta">ID {{ job.id }} · {{ job.createdAt | date: 'short' }} · {{ job.requestedBy }}</div>
              <div class="job-logs" *ngIf="job.logs?.length">
                <div *ngFor="let line of job.logs">{{ line }}</div>
              </div>
            </div>
            <span class="status" [class]="'status ' + job.status">{{ job.status }}</span>
          </div>
        </div>
        <ng-template #emptyJobs>
          <div class="empty">Aucun job pour le moment.</div>
        </ng-template>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Clients</p>
            <h2>Liste locale</h2>
            <p class="subtitle">Données servies par l'API locale avec persistance disque.</p>
          </div>
        </div>
        <div class="clients" *ngIf="clients().length; else emptyClients">
          <div class="client" *ngFor="let client of clients()">
            <div class="client-main">
              <div class="client-name">{{ client.name }}</div>
              <div class="client-meta">{{ client.code }} · {{ client.siteCount || 0 }} sites · {{ client.timezone }}</div>
              <div class="client-meta">
                Dernière sync : {{ client.lastSyncAt | date: 'short' }}
              </div>
            </div>
            <div class="client-actions">
              <span class="badge" [class.error]="client.status === 'error'">{{ client.status }}</span>
              <button class="btn btn-ghost" type="button" (click)="syncClient(client.id)">Resync</button>
            </div>
          </div>
        </div>
        <ng-template #emptyClients>
          <div class="empty">Aucun client enregistré.</div>
        </ng-template>
      </section>
    </div>
  `,
  styles: [
    `
      .page-container {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.75rem;
        color: #64748b;
        margin: 0;
      }
      h1 {
        margin: 0.2rem 0;
        font-size: 2rem;
        color: #0f172a;
      }
      h2 {
        margin: 0.2rem 0;
        font-size: 1.3rem;
        color: #0f172a;
      }
      .subtitle {
        color: #64748b;
        margin: 0.2rem 0 0;
      }
      .header-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.4rem;
      }
      .hint {
        color: #94a3b8;
        font-size: 0.85rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 1rem;
      }
      .card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1.25rem;
        box-shadow: 0 8px 30px rgba(15, 23, 42, 0.05);
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .pill {
        background: #eef2ff;
        color: #3730a3;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .badge {
        background: #0ea5e9;
        color: #fff;
        padding: 0.25rem 0.6rem;
        border-radius: 8px;
        font-size: 0.85rem;
        text-transform: capitalize;
      }
      .badge.error {
        background: #f43f5e;
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-weight: 600;
        color: #0f172a;
      }
      .form-group.full {
        grid-column: 1 / -1;
      }
      input,
      select,
      textarea {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0.65rem 0.75rem;
        font-size: 1rem;
        font-weight: 500;
        color: #0f172a;
        transition: border 0.2s, box-shadow 0.2s;
      }
      input:focus,
      select:focus,
      textarea:focus {
        outline: none;
        border-color: #2022e9;
        box-shadow: 0 0 0 3px rgba(32, 34, 233, 0.15);
      }
      .hint {
        font-weight: 400;
      }
      .confirm-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 400;
      }
      .form-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        grid-column: 1 / -1;
      }
      .btn {
        border-radius: 10px;
        padding: 0.65rem 0.95rem;
        border: 1px solid transparent;
        cursor: pointer;
        font-weight: 700;
        transition: transform 0.15s ease, box-shadow 0.2s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #2022e9, #3b82f6);
        color: white;
        box-shadow: 0 10px 20px rgba(59, 130, 246, 0.25);
      }
      .btn-ghost {
        background: #f8fafc;
        border-color: #e2e8f0;
        color: #0f172a;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .jobs,
      .clients {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .job,
      .client {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 0.9rem;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }
      .job-title,
      .client-name {
        font-weight: 700;
      }
      .job-meta,
      .client-meta {
        color: #64748b;
        font-size: 0.9rem;
      }
      .job-logs {
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 0.6rem 0.75rem;
        margin-top: 0.5rem;
        color: #0f172a;
        line-height: 1.4;
      }
      .status {
        text-transform: capitalize;
        padding: 0.3rem 0.7rem;
        border-radius: 8px;
        font-weight: 700;
      }
      .status.queued { background: #fef3c7; color: #92400e; }
      .status.running { background: #e0f2fe; color: #0369a1; }
      .status.succeeded { background: #dcfce7; color: #166534; }
      .status.failed { background: #fee2e2; color: #991b1b; }
      .empty {
        padding: 1rem;
        text-align: center;
        color: #94a3b8;
        border: 1px dashed #e2e8f0;
        border-radius: 8px;
      }
      .clients .client-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
    `
  ]
})
export class LocalAdminComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly adminOps = inject(AdminOpsService);
  private subscriptions: Subscription[] = [];
  readonly loading = signal(false);

  readonly actionOptions: AdminActionType[] = [
    'build:central',
    'build:raspberry',
    'deploy:raspberry',
    'tests:full',
    'sync:clients',
    'maintenance:restart'
  ];

  readonly defaultClientValue = {
    name: '',
    code: '',
    contactEmail: '',
    timezone: 'Europe/Paris',
    siteCount: 0
  };

  readonly actionForm = this.fb.nonNullable.group({
    action: this.fb.control<AdminActionType | null>(null, Validators.required),
    target: this.fb.control(''),
    note: this.fb.control(''),
    confirm: this.fb.control(false, Validators.requiredTrue)
  });

  readonly clientForm = this.fb.nonNullable.group({
    name: this.fb.control('', [Validators.required, Validators.minLength(3)]),
    code: this.fb.control('', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]),
    contactEmail: this.fb.control('', Validators.email),
    timezone: this.fb.control('Europe/Paris'),
    siteCount: this.fb.control(0, Validators.min(0))
  });

  readonly jobs = signal<AdminJob[]>([]);
  readonly clients = signal<LocalClient[]>([]);

  ngOnInit(): void {
    this.loading.set(true);
    this.subscriptions.push(
      this.adminOps
        .refreshState()
        .subscribe({ next: () => this.loading.set(false), error: () => this.loading.set(false) })
    );
    this.adminOps.initJobStream();
    this.subscriptions.push(
      this.adminOps.getJobs().subscribe(jobs => this.jobs.set(jobs)),
      this.adminOps.getClients().subscribe(clients => this.clients.set(clients))
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.adminOps.teardownStreams();
  }

  submitAction(): void {
    if (this.actionForm.invalid) {
      this.actionForm.markAllAsTouched();
      return;
    }

    const payload = {
      action: this.actionForm.value.action!,
      parameters: this.actionForm.value.target ? { target: this.actionForm.value.target } : undefined,
      note: this.actionForm.value.note || undefined
    };

    this.adminOps.triggerAction(payload).subscribe();
    this.resetActionForm();
  }

  submitClient(): void {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    this.adminOps.createClient(this.clientForm.getRawValue()).subscribe();
    this.clientForm.reset(this.defaultClientValue);
  }

  syncClient(clientId: string): void {
    this.adminOps.syncClient(clientId).subscribe();
  }

  refreshJobStatuses(): void {
    this.loading.set(true);
    this.adminOps
      .refreshState()
      .subscribe({ next: () => this.loading.set(false), error: () => this.loading.set(false) });
  }

  resetActionForm(): void {
    this.actionForm.reset({ action: null, target: '', note: '', confirm: false });
  }

  getActionLabel(action: AdminActionType): string {
    return this.adminOps.getActionLabel(action);
  }
}
