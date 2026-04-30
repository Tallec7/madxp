/**
 * ADR-106 — Version manager super_admin.
 *
 * Affiche les versions snapshots d'un template + actions :
 *   - Publish (passer draft → published, lock du master)
 *   - Fork (clone draft v+1 d'une version published)
 *   - Set default version (rollback ou promote)
 *
 * Côté UI : 3 boutons d'action + liste tableau des versions avec
 * badge "default" sur la version courante de neopro_templates.version.
 */

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TemplateVersioningDataService,
  type TemplateVersionSnapshot,
} from './template-versioning-data.service';

@Component({
  selector: 'app-template-version-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="version-manager">
      <header class="header">
        <div>
          <h3>Versions (ADR-106)</h3>
          <p class="muted" *ngIf="currentVersion">
            Version courante : <strong>{{ currentVersion }}</strong>
            ·
            Statut : <span class="status-badge" [class]="'status-' + (status ?? 'draft')">{{ status }}</span>
          </p>
        </div>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="busy() || status === 'published'"
            (click)="onPublish()"
            [title]="status === 'published' ? 'Déjà publié — fork pour modifier' : 'Snapshot + lock du master'"
          >
            {{ busy() && action() === 'publish' ? '…' : '🔒 Publish' }}
          </button>
          <button
            type="button"
            class="btn"
            [disabled]="busy() || status !== 'published'"
            (click)="toggleForkInput()"
            [title]="status !== 'published' ? 'Le template doit être publié pour être forké' : 'Cloner en draft v+1'"
          >
            🪓 Fork
          </button>
        </div>
      </header>

      <div class="fork-input" *ngIf="forkInputOpen()">
        <input
          type="text"
          [(ngModel)]="forkVersion"
          placeholder="ex: 1.1"
          pattern="^\\d+\\.\\d+$"
          aria-label="Nouvelle version (semver MAJOR.MINOR)"
          [class.invalid]="forkVersion && !isValidSemver(forkVersion)"
        />
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="busy() || !isValidSemver(forkVersion)"
          (click)="onFork()"
        >
          {{ busy() && action() === 'fork' ? '…' : 'Forker' }}
        </button>
        <button type="button" class="btn-ghost" (click)="forkInputOpen.set(false)">×</button>
      </div>

      <div class="error" *ngIf="error()" role="alert">{{ error() }}</div>

      <table class="versions-table" *ngIf="versions().length > 0; else emptyTpl">
        <thead>
          <tr>
            <th>Version</th>
            <th>Publiée le</th>
            <th>Layers / Slots</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let v of versions(); trackBy: trackById">
            <td>
              <strong>{{ v.version }}</strong>
              <span class="badge default" *ngIf="v.version === currentVersion">default</span>
            </td>
            <td>{{ formatDate(v.published_at) }}</td>
            <td class="counts">
              {{ v.layers_snapshot?.length || 0 }}L
              · {{ v.text_fields_snapshot?.length || 0 }}T
              · {{ v.image_slots_snapshot?.length || 0 }}I
            </td>
            <td>
              <button
                type="button"
                class="btn-link"
                [disabled]="busy() || v.version === currentVersion"
                (click)="onSetDefault(v.version)"
              >
                {{ v.version === currentVersion ? '— en cours —' : 'Définir par défaut' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <ng-template #emptyTpl>
        <p class="empty" *ngIf="!loading()">Aucune version publiée.</p>
        <p class="empty" *ngIf="loading()">Chargement…</p>
      </ng-template>
    </section>
  `,
  styles: [`
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .version-manager { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
    .muted { color: #6b7280; font-size: 13px; margin: 0; }
    .status-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-published { background: #d1fae5; color: #065f46; }
    .status-archived { background: #e5e7eb; color: #374151; }
    .actions { display: flex; gap: 8px; }
    .btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; font-size: 13px; cursor: pointer; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .btn-primary:disabled { background: #9ca3af; border-color: #9ca3af; }
    .btn-ghost { background: transparent; border: none; font-size: 18px; cursor: pointer; color: #6b7280; padding: 0 4px; }
    .btn-link { background: transparent; border: none; color: #1d4ed8; cursor: pointer; font-size: 12px; padding: 0; text-decoration: underline; }
    .btn-link:disabled { color: #9ca3af; text-decoration: none; cursor: default; }
    .fork-input { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .fork-input input { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 120px; }
    .fork-input input.invalid { border-color: #dc2626; }
    .error { background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
    .versions-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .versions-table th, .versions-table td { padding: 8px 4px; text-align: left; border-bottom: 1px solid #f3f4f6; }
    .versions-table th { font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; }
    .badge { display: inline-block; margin-left: 6px; padding: 1px 6px; background: #dbeafe; color: #1d4ed8; font-size: 10px; border-radius: 4px; font-weight: 600; }
    .badge.default { background: #d1fae5; color: #065f46; }
    .counts { color: #6b7280; font-family: 'SF Mono', monospace; font-size: 12px; }
    .empty { color: #9ca3af; font-size: 13px; padding: 16px; text-align: center; }
  `],
})
export class TemplateVersionManagerComponent implements OnInit {
  @Input() templateId!: string;
  @Input() currentVersion?: string;
  @Input() status?: 'draft' | 'published' | 'archived';
  @Output() versionChanged = new EventEmitter<{ action: 'publish' | 'fork' | 'set-default'; version: string; templateId: string }>();

  private data = inject(TemplateVersioningDataService);

  versions = signal<TemplateVersionSnapshot[]>([]);
  loading = signal(false);
  busy = signal(false);
  action = signal<'publish' | 'fork' | 'set-default' | null>(null);
  error = signal<string | null>(null);
  forkInputOpen = signal(false);
  forkVersion = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (!this.templateId) return;
    this.loading.set(true);
    this.error.set(null);
    this.data.listVersions(this.templateId).subscribe({
      next: (rows) => {
        this.versions.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.formatError(err));
        this.loading.set(false);
      },
    });
  }

  onPublish(): void {
    if (this.busy() || !this.templateId) return;
    this.busy.set(true);
    this.action.set('publish');
    this.error.set(null);
    this.data.publishVersion(this.templateId).subscribe({
      next: (snap) => {
        this.busy.set(false);
        this.action.set(null);
        this.versionChanged.emit({ action: 'publish', version: snap.version, templateId: this.templateId });
        this.refresh();
      },
      error: (err) => this.handleErr(err),
    });
  }

  toggleForkInput(): void {
    this.forkInputOpen.update((v) => !v);
    this.forkVersion = '';
    this.error.set(null);
  }

  onFork(): void {
    if (this.busy() || !this.isValidSemver(this.forkVersion)) return;
    this.busy.set(true);
    this.action.set('fork');
    this.error.set(null);
    this.data.forkVersion(this.templateId, this.forkVersion).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.action.set(null);
        this.forkInputOpen.set(false);
        this.versionChanged.emit({ action: 'fork', version: result.version, templateId: result.id });
      },
      error: (err) => this.handleErr(err),
    });
  }

  onSetDefault(version: string): void {
    if (this.busy() || version === this.currentVersion) return;
    this.busy.set(true);
    this.action.set('set-default');
    this.error.set(null);
    this.data.setDefaultVersion(this.templateId, version).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.action.set(null);
        this.versionChanged.emit({ action: 'set-default', version: result.version, templateId: this.templateId });
      },
      error: (err) => this.handleErr(err),
    });
  }

  isValidSemver(v: string): boolean {
    return /^\d+\.\d+$/.test(v);
  }

  trackById = (_: number, v: TemplateVersionSnapshot) => v.id;

  formatDate(s: string): string {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  private handleErr(err: unknown): void {
    this.error.set(this.formatError(err));
    this.busy.set(false);
    this.action.set(null);
  }

  private formatError(err: unknown): string {
    const e = err as { error?: { error?: string; message?: string }; status?: number; statusText?: string };
    if (e?.error?.error) return `${e.error.error}${e.error.message ? ` — ${e.error.message}` : ''}`;
    if (e?.statusText) return `${e.status ?? '?'} ${e.statusText}`;
    return 'Erreur inconnue';
  }
}
