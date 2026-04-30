/**
 * ADR-107 — Backgrounds manager super_admin.
 *
 * Liste les fonds couleur du catalogue avec :
 *   - Upload nouveau background (WebM + name + hex_color + visibility)
 *   - Toggle public/restreint
 *   - Archive (soft delete)
 *   - Bulk grant (par UUID user_id, séparés par virgule ou newline)
 *   - Liste + revoke des grants existants
 */

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TemplateVersioningDataService,
  type TemplateBackground,
  type BackgroundGrant,
} from './template-versioning-data.service';

@Component({
  selector: 'app-template-backgrounds-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-manager">
      <header>
        <h3>Backgrounds (ADR-107)</h3>
        <button type="button" class="btn btn-primary" (click)="toggleUpload()">
          {{ uploadOpen() ? '× Annuler' : '+ Upload background' }}
        </button>
      </header>

      <!-- Upload form -->
      <div class="upload-form" *ngIf="uploadOpen()">
        <div class="row">
          <input type="file" accept="video/webm,video/mp4" (change)="onFileSelect($event)" />
          <span class="muted-inline" *ngIf="uploadFile()">{{ uploadFile()!.name }} ({{ formatSize(uploadFile()!.size) }})</span>
        </div>
        <div class="row">
          <input type="text" [(ngModel)]="uploadName" placeholder="Nom (ex: BLEU, LANESTER)" maxlength="80" />
          <input type="color" [(ngModel)]="uploadHex" />
          <label class="checkbox">
            <input type="checkbox" [(ngModel)]="uploadPublic" />
            Public (visible par tous)
          </label>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="busy() || !canSubmitUpload()"
          (click)="onUpload()"
        >
          {{ busy() && action() === 'upload' ? 'Upload…' : 'Uploader' }}
        </button>
      </div>

      <div class="error" *ngIf="error()" role="alert">{{ error() }}</div>

      <!-- Backgrounds list -->
      <table class="bg-table" *ngIf="backgrounds().length > 0; else emptyTpl">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Couleur</th>
            <th>Visibilité</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let bg of backgrounds(); trackBy: trackById" [class.archived]="!!bg.archived_at">
            <td><strong>{{ bg.name }}</strong></td>
            <td>
              <span class="swatch" [style.background]="bg.hex_color"></span>
              <code class="hex">{{ bg.hex_color }}</code>
            </td>
            <td>
              <button
                type="button"
                class="btn-toggle"
                [class.public]="bg.is_public"
                (click)="onTogglePublic(bg)"
                [disabled]="busy()"
              >
                {{ bg.is_public ? '🌐 Public' : '🔒 Restreint' }}
              </button>
            </td>
            <td>
              <span class="status-badge" *ngIf="!bg.archived_at">Actif</span>
              <span class="status-badge archived" *ngIf="bg.archived_at">Archivé</span>
            </td>
            <td>
              <button type="button" class="btn-link" (click)="toggleGrants(bg)" *ngIf="!bg.is_public">
                {{ activeGrantsBgId() === bg.id ? 'Masquer grants' : 'Grants' }}
              </button>
              <button type="button" class="btn-link" (click)="onArchive(bg)" *ngIf="!bg.archived_at" [disabled]="busy()">
                Archiver
              </button>
            </td>
          </tr>

          <!-- Inline grants editor -->
          <tr *ngIf="activeGrantsBgId() && getActiveBg() as activeBg">
            <td colspan="5" class="grants-editor">
              <h4>Grants pour <code>{{ activeBg.name }}</code></h4>
              <div class="grants-add">
                <textarea
                  [(ngModel)]="bulkUserIds"
                  placeholder="Coller des UUIDs user (1 par ligne ou séparés par virgule)"
                  rows="3"
                ></textarea>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="busy() || !parsedUserIds().length"
                  (click)="onGrantBulk(activeBg.id)"
                >
                  Ajouter {{ parsedUserIds().length || '' }} grant(s)
                </button>
              </div>
              <div class="grants-list" *ngIf="grants().length > 0; else noGrant">
                <div class="grant-row" *ngFor="let g of grants(); trackBy: trackByUserId">
                  <code>{{ g.user_id }}</code>
                  <span class="muted-inline">par {{ g.granted_by }}</span>
                  <button
                    type="button"
                    class="btn-link danger"
                    (click)="onRevoke(activeBg.id, g.user_id)"
                    [disabled]="busy()"
                  >Revoke</button>
                </div>
              </div>
              <ng-template #noGrant>
                <p class="empty">Aucun grant — ce background restreint n'est visible par personne.</p>
              </ng-template>
            </td>
          </tr>
        </tbody>
      </table>

      <ng-template #emptyTpl>
        <p class="empty" *ngIf="!loading()">Aucun background pour le moment.</p>
        <p class="empty" *ngIf="loading()">Chargement…</p>
      </ng-template>
    </section>
  `,
  styles: [`
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .bg-manager { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    h3 { margin: 0; font-size: 16px; font-weight: 600; }
    h4 { margin: 0 0 8px; font-size: 13px; }
    .muted-inline { color: #6b7280; font-size: 12px; }

    .upload-form { background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
    .upload-form .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .upload-form input[type=text] { flex: 1; min-width: 180px; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
    .upload-form input[type=color] { width: 40px; height: 32px; padding: 0; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; }
    .upload-form .checkbox { font-size: 13px; display: flex; gap: 4px; align-items: center; }

    .error { background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }

    .btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; font-size: 13px; cursor: pointer; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .btn-link { background: transparent; border: none; color: #1d4ed8; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0 4px; }
    .btn-link.danger { color: #dc2626; }
    .btn-toggle { padding: 4px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; font-size: 11px; cursor: pointer; }
    .btn-toggle.public { background: #d1fae5; color: #065f46; border-color: #10b981; }

    .bg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .bg-table th, .bg-table td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    .bg-table th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .bg-table tr.archived { opacity: 0.5; }
    .swatch { display: inline-block; width: 16px; height: 16px; border-radius: 3px; vertical-align: middle; margin-right: 6px; border: 1px solid #d1d5db; }
    .hex { font-family: 'SF Mono', monospace; font-size: 11px; }
    .status-badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; background: #d1fae5; color: #065f46; font-weight: 600; text-transform: uppercase; }
    .status-badge.archived { background: #e5e7eb; color: #374151; }

    .grants-editor { background: #f9fafb; padding: 12px; }
    .grants-add { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 12px; }
    .grants-add textarea { flex: 1; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-family: 'SF Mono', monospace; }
    .grant-row { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
    .grant-row code { font-family: 'SF Mono', monospace; font-size: 11px; }
    .empty { color: #9ca3af; font-size: 13px; text-align: center; padding: 12px; }
  `],
})
export class TemplateBackgroundsManagerComponent implements OnInit {
  private data = inject(TemplateVersioningDataService);

  backgrounds = signal<TemplateBackground[]>([]);
  loading = signal(false);
  busy = signal(false);
  action = signal<'upload' | 'patch' | 'archive' | 'grant' | 'revoke' | null>(null);
  error = signal<string | null>(null);
  uploadOpen = signal(false);
  activeGrantsBgId = signal<string | null>(null);
  grants = signal<BackgroundGrant[]>([]);

  uploadFile = signal<File | null>(null);
  uploadName = '';
  uploadHex = '#1A4FCC';
  uploadPublic = true;
  bulkUserIds = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.data.listBackgrounds().subscribe({
      next: (rows) => {
        this.backgrounds.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.formatError(err));
        this.loading.set(false);
      },
    });
  }

  toggleUpload(): void {
    this.uploadOpen.update((v) => !v);
    this.error.set(null);
  }

  onFileSelect(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    this.uploadFile.set(f ?? null);
  }

  canSubmitUpload(): boolean {
    return !!this.uploadFile() && !!this.uploadName.trim() && /^#[0-9A-Fa-f]{6}$/.test(this.uploadHex);
  }

  onUpload(): void {
    const f = this.uploadFile();
    if (!f || this.busy()) return;
    this.busy.set(true);
    this.action.set('upload');
    this.error.set(null);
    this.data
      .createBackground(f, {
        name: this.uploadName.trim(),
        hex_color: this.uploadHex.toUpperCase(),
        is_public: this.uploadPublic,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.action.set(null);
          this.uploadOpen.set(false);
          this.uploadFile.set(null);
          this.uploadName = '';
          this.refresh();
        },
        error: (err) => this.handleErr(err),
      });
  }

  onTogglePublic(bg: TemplateBackground): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.action.set('patch');
    this.data.updateBackground(bg.id, { is_public: !bg.is_public }).subscribe({
      next: () => {
        this.busy.set(false);
        this.action.set(null);
        this.refresh();
      },
      error: (err) => this.handleErr(err),
    });
  }

  onArchive(bg: TemplateBackground): void {
    if (this.busy() || !confirm(`Archiver le background "${bg.name}" ?`)) return;
    this.busy.set(true);
    this.action.set('archive');
    this.data.updateBackground(bg.id, { archived: true }).subscribe({
      next: () => {
        this.busy.set(false);
        this.action.set(null);
        this.refresh();
      },
      error: (err) => this.handleErr(err),
    });
  }

  toggleGrants(bg: TemplateBackground): void {
    if (this.activeGrantsBgId() === bg.id) {
      this.activeGrantsBgId.set(null);
      this.grants.set([]);
      return;
    }
    this.activeGrantsBgId.set(bg.id);
    this.bulkUserIds = '';
    this.data.listBackgroundGrants(bg.id).subscribe({
      next: (rows) => this.grants.set(rows),
      error: (err) => this.handleErr(err),
    });
  }

  parsedUserIds(): string[] {
    return this.bulkUserIds
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));
  }

  onGrantBulk(bgId: string): void {
    const userIds = this.parsedUserIds();
    if (!userIds.length || this.busy()) return;
    this.busy.set(true);
    this.action.set('grant');
    this.data.grantBackground(bgId, userIds).subscribe({
      next: () => {
        this.busy.set(false);
        this.action.set(null);
        this.bulkUserIds = '';
        this.data.listBackgroundGrants(bgId).subscribe({
          next: (rows) => this.grants.set(rows),
        });
      },
      error: (err) => this.handleErr(err),
    });
  }

  onRevoke(bgId: string, userId: string): void {
    if (this.busy() || !confirm('Revoke ce grant ?')) return;
    this.busy.set(true);
    this.action.set('revoke');
    this.data.revokeBackgroundGrant(bgId, userId).subscribe({
      next: () => {
        this.busy.set(false);
        this.action.set(null);
        this.grants.update((rows) => rows.filter((r) => r.user_id !== userId));
      },
      error: (err) => this.handleErr(err),
    });
  }

  getActiveBg(): TemplateBackground | undefined {
    const id = this.activeGrantsBgId();
    return id ? this.backgrounds().find((b) => b.id === id) : undefined;
  }

  trackById = (_: number, bg: TemplateBackground) => bg.id;
  trackByUserId = (_: number, g: BackgroundGrant) => g.user_id;

  formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private handleErr(err: unknown): void {
    this.error.set(this.formatError(err));
    this.busy.set(false);
    this.action.set(null);
  }

  private formatError(err: unknown): string {
    const e = err as { error?: { error?: string; message?: string }; status?: number };
    if (e?.error?.error) return `${e.error.error}${e.error.message ? ` — ${e.error.message}` : ''}`;
    return e?.status ? `HTTP ${e.status}` : 'Erreur inconnue';
  }
}
