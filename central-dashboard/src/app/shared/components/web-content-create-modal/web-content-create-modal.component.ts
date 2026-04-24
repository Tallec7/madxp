import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { NotificationService } from '../../../core/services/notification.service';

export type WebContentType = 'web_page' | 'livestream';

export interface WebContentSiteOption {
  id: string;
  name: string;
}

export interface WebContentCreatedPayload {
  id: string;
  contentType: WebContentType;
  uploadedForSiteId: string | null;
}

interface CreateWebContentRequest {
  contentType: WebContentType;
  name: string;
  url: string;
  durationSeconds: number | null;
  category: string | null;
  uploadedForSiteId: string | null;
}

@Component({
  selector: 'app-web-content-create-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <ng-container *ngIf="!embedded; else embeddedBody">
      <div class="modal-backdrop" (click)="onBackdropClick()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ title }}</h2>
            <button class="btn-close" (click)="close()" [disabled]="isSubmitting" aria-label="Fermer">
              ×
            </button>
          </div>
          <ng-container *ngTemplateOutlet="bodyTpl"></ng-container>
          <ng-container *ngTemplateOutlet="footerTpl"></ng-container>
        </div>
      </div>
    </ng-container>

    <ng-template #embeddedBody>
      <ng-container *ngTemplateOutlet="bodyTpl"></ng-container>
      <ng-container *ngTemplateOutlet="footerTpl"></ng-container>
    </ng-template>

    <ng-template #bodyTpl>
        <div class="modal-body">
          <p class="scope-hint" *ngIf="lockedSiteName">
            Sera créé pour <strong>{{ lockedSiteName }}</strong> uniquement.
          </p>

          <div class="form-group" *ngIf="availableSites && availableSites.length > 0">
            <label>Site cible (optionnel)</label>
            <select class="form-control" [(ngModel)]="selectedSiteId">
              <option [ngValue]="null">— Tous les sites (global) —</option>
              <option *ngFor="let s of availableSites" [ngValue]="s.id">{{ s.name }}</option>
            </select>
            <small class="text-muted">
              Laisser vide = visible pour toute la flotte. Sinon, le contenu sera réservé au site choisi.
            </small>
          </div>

          <div class="form-group">
            <label>Nom *</label>
            <input
              type="text"
              class="form-control"
              [(ngModel)]="form.name"
              maxlength="255"
              placeholder="Ex: Classement ligue / Live France-Brésil"
            />
          </div>

          <div class="form-group">
            <label>
              URL * ({{ contentType === 'livestream' ? 'HLS / M3U8 / MP4' : 'https://...' }})
            </label>
            <input
              type="url"
              class="form-control"
              [(ngModel)]="form.url"
              placeholder="https://..."
            />
          </div>

          <div class="form-group" *ngIf="contentType === 'livestream'">
            <label>Durée par passage (secondes) *</label>
            <input
              type="number"
              class="form-control"
              [(ngModel)]="form.durationSeconds"
              min="5"
              max="3600"
              step="5"
            />
            <small class="text-muted">
              Durée pendant laquelle le livestream sera affiché dans la boucle.
            </small>
          </div>

          <div class="form-group" *ngIf="contentType === 'web_page'">
            <label>Durée par passage (secondes, optionnel)</label>
            <input
              type="number"
              class="form-control"
              [(ngModel)]="form.durationSeconds"
              min="5"
              max="3600"
              step="5"
              placeholder="Ex: 30"
            />
          </div>

          <div class="form-group">
            <label>Catégorie (optionnel)</label>
            <input
              type="text"
              class="form-control"
              [(ngModel)]="form.category"
              maxlength="100"
            />
          </div>
        </div>
    </ng-template>

    <ng-template #footerTpl>
        <div class="modal-footer">
          <button class="btn btn-secondary" *ngIf="!embedded" (click)="close()" [disabled]="isSubmitting">
            Annuler
          </button>
          <button
            class="btn btn-primary"
            (click)="submit()"
            [disabled]="isSubmitting || !canSubmit()"
          >
            {{ isSubmitting ? 'Création...' : '✅ Créer' }}
          </button>
        </div>
    </ng-template>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 2rem;
    }
    .modal-content {
      background: white; border-radius: 12px; max-width: 560px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0;
    }
    .modal-header h2 { margin: 0; font-size: 1.15rem; }
    .btn-close {
      background: none; border: none; font-size: 1.75rem; line-height: 1;
      color: #94a3b8; cursor: pointer; padding: 0; width: 32px; height: 32px;
    }
    .btn-close:hover:not([disabled]) { color: #475569; }
    .modal-body { padding: 1.5rem; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 0.75rem;
      padding: 1.25rem 1.5rem; border-top: 1px solid #e2e8f0;
    }
    .scope-hint {
      background: #f1f5f9; border-left: 3px solid #3b82f6;
      padding: 0.625rem 0.875rem; border-radius: 4px; margin: 0 0 1rem;
      font-size: 0.875rem; color: #475569;
    }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block; margin-bottom: 0.375rem; font-weight: 500;
      font-size: 0.875rem; color: #334155;
    }
    .form-control {
      width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1;
      border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;
    }
    .form-control:focus { outline: none; border-color: #3b82f6; }
    .text-muted { color: #64748b; font-size: 0.8125rem; }
    .btn {
      padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem;
      font-weight: 500; cursor: pointer; transition: all 0.15s; border: none;
    }
    .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary { background: white; color: #475569; border: 1px solid #e2e8f0; }
    .btn-secondary:hover:not([disabled]) { background: #f8fafc; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not([disabled]) { background: #2563eb; }
  `],
})
export class WebContentCreateModalComponent {
  /** Type of content: 'web_page' (iframe) or 'livestream' (HLS/MP4). */
  @Input({ required: true }) contentType!: WebContentType;

  /**
   * When set, the content is forced to be created for this site only (per-site usage).
   * Mutually exclusive with `availableSites`.
   */
  @Input() lockedSiteId: string | null = null;
  @Input() lockedSiteName: string | null = null;

  /**
   * When set, displays a site selector — admin usage. The modal lets the user
   * pick a site (or leave empty for global). Ignored if `lockedSiteId` is set.
   */
  @Input() availableSites: WebContentSiteOption[] | null = null;

  /**
   * When true, skip the outer backdrop/header — render form + footer inline.
   * The parent is responsible for providing the wrapper (e.g. tabbed modal).
   */
  @Input() embedded = false;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<WebContentCreatedPayload>();

  private readonly api = inject(ApiService);
  private readonly notificationService = inject(NotificationService);

  form: { name: string; url: string; durationSeconds: number | null; category: string } = {
    name: '',
    url: '',
    durationSeconds: null,
    category: '',
  };

  selectedSiteId: string | null = null;
  isSubmitting = false;

  get title(): string {
    return this.contentType === 'livestream' ? '📡 Ajouter un livestream' : '🌐 Ajouter une page web';
  }

  canSubmit(): boolean {
    if (!this.form.name.trim() || !/^https?:\/\//i.test(this.form.url.trim())) return false;
    if (this.contentType === 'livestream'
      && (!this.form.durationSeconds || this.form.durationSeconds <= 0)) return false;
    return true;
  }

  onBackdropClick(): void {
    if (!this.isSubmitting) this.close();
  }

  close(): void {
    if (this.isSubmitting) return;
    this.closed.emit();
  }

  submit(): void {
    if (!this.canSubmit() || this.isSubmitting) return;
    const uploadedForSiteId = this.lockedSiteId ?? this.selectedSiteId ?? null;
    const payload: CreateWebContentRequest = {
      contentType: this.contentType,
      name: this.form.name.trim(),
      url: this.form.url.trim(),
      durationSeconds: this.form.durationSeconds ?? null,
      category: this.form.category.trim() || null,
      uploadedForSiteId,
    };
    this.isSubmitting = true;
    this.api.post<{ id: string }>('/videos/web-content', payload).subscribe({
      next: (row) => {
        this.isSubmitting = false;
        this.notificationService.success(
          uploadedForSiteId
            ? `Contenu créé pour ${this.lockedSiteName ?? 'ce site'}`
            : 'Contenu créé (visible pour toute la flotte)'
        );
        this.created.emit({
          id: row.id,
          contentType: this.contentType,
          uploadedForSiteId,
        });
      },
      error: (err: unknown) => {
        this.isSubmitting = false;
        const message = err instanceof Error ? err.message : 'Erreur lors de la création';
        this.notificationService.error(message);
      },
    });
  }
}
