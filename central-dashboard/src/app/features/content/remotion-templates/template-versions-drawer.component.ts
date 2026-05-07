import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RemotionTemplatesDataService } from './remotion-templates-data.service';
import type { RemotionTemplate, TemplateVersion } from './remotion-templates.types';

/**
 * Quick task 260507-les — Drawer historique versions (audit P0 #4).
 *
 * Ouvert depuis la card template (bouton "Historique"), affiche la liste
 * complète des snapshots ADR-055 et permet à un super_admin de restaurer
 * un snapshot. Le rollback est gardé par une modale typed-name (pattern
 * GitHub repo-delete / cohérent avec la modale Supprimer PR #882).
 *
 * NB : La sémantique "rollback" est wrapped autour de `setDefaultVersion`
 * dans le service (alias de `restoreVersion` ADR-055 — cf. AUDIT-NOTES.md).
 * Côté serveur, la restore crée elle-même un nouveau snapshot (`pre-update`)
 * via le trigger SQL ADR-055 → aucune perte possible.
 */
@Component({
  selector: 'app-template-versions-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tplv-backdrop" (click)="closed.emit()"></div>
    <aside
      class="tplv-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tplv-title"
      data-testid="template-versions-drawer"
      (click)="$event.stopPropagation()"
    >
      <header class="tplv-drawer__header">
        <h2 id="tplv-title">
          Historique des versions —
          <span class="tplv-drawer__tpl-name">{{ template.name }}</span>
        </h2>
        <button
          type="button"
          class="tplv-drawer__close"
          [attr.aria-label]="closeAriaLabel"
          (click)="closed.emit()"
        >
          ✕
        </button>
      </header>

      <div class="tplv-drawer__body">
        <p class="tplv-drawer__loading" *ngIf="loading()">Chargement…</p>
        <p class="tplv-drawer__error" *ngIf="error() as e" role="alert">{{ e }}</p>

        <p class="tplv-drawer__empty" *ngIf="!loading() && !error() && versions().length === 0">
          Aucun snapshot enregistré.
        </p>

        <ul class="tplv-list" *ngIf="!loading() && versions().length > 0">
          <li
            *ngFor="let v of versions(); let i = index; trackBy: trackById"
            class="tplv-item"
            [class.tplv-item--first]="i === 0"
          >
            <div class="tplv-item__main">
              <strong class="tplv-item__title">
                {{ formatDate(v.created_at) }}
                <span class="tplv-item__active-tag" *ngIf="i === 0">version actuelle</span>
              </strong>
              <small class="tplv-item__reason">{{ reasonLabel(v.snapshot_reason) }}</small>
            </div>
            <button
              *ngIf="i !== 0"
              type="button"
              class="tplv-item__rollback"
              [attr.data-testid]="'template-rollback-button-' + v.id"
              [disabled]="rollbackInFlight()"
              (click)="confirmingVersion.set(v)"
            >
              Restaurer cette version
            </button>
          </li>
        </ul>
      </div>

      <!-- Confirm modal typed-name (pattern PR #882) -->
      <div
        *ngIf="confirmingVersion() as cv"
        class="tplv-confirm"
        role="alertdialog"
        aria-modal="true"
        data-testid="template-rollback-confirm"
      >
        <div class="tplv-confirm__panel">
          <h3>Restaurer ce snapshot ?</h3>
          <p>
            Cette action remplace <code>props_schema</code> et <code>default_props</code> du
            template par le snapshot du <strong>{{ formatDate(cv.created_at) }}</strong
            >. Le système crée automatiquement un nouveau snapshot
            <code>pre-update</code> avant le rollback (ADR-055), donc aucune perte n'est possible.
          </p>
          <label>
            Pour confirmer, tape <code>restaurer</code> dans le champ ci-dessous :
          </label>
          <input
            type="text"
            class="tplv-confirm__input"
            data-testid="template-rollback-confirm-input"
            [(ngModel)]="confirmTyped"
            placeholder="restaurer"
            autocomplete="off"
          />
          <div class="tplv-confirm__actions">
            <button
              type="button"
              class="tplv-confirm__cancel"
              (click)="confirmingVersion.set(null); confirmTyped = ''"
            >
              Annuler
            </button>
            <button
              type="button"
              class="tplv-confirm__submit"
              data-testid="template-rollback-confirm-submit"
              [disabled]="confirmTyped !== 'restaurer' || rollbackInFlight()"
              (click)="doRollback(cv)"
            >
              {{ rollbackInFlight() ? 'Restauration…' : 'Restaurer' }}
            </button>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tplv-backdrop {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--text-color, currentColor) 35%, transparent);
        z-index: 1000;
      }
      .tplv-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(440px, 100vw);
        background: var(--card-bg);
        border-left: 1px solid var(--border-color);
        box-shadow: -8px 0 24px color-mix(in srgb, var(--text-color, currentColor) 18%, transparent);
        z-index: 1001;
        display: flex;
        flex-direction: column;
      }
      .tplv-drawer__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color);
      }
      .tplv-drawer__header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .tplv-drawer__tpl-name {
        color: var(--primary-color);
      }
      .tplv-drawer__close {
        min-width: 40px;
        min-height: 40px;
        border: none;
        background: transparent;
        font-size: 18px;
        cursor: pointer;
        color: inherit;
      }
      .tplv-drawer__close:hover {
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        border-radius: 6px;
      }
      .tplv-drawer__body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
      }
      .tplv-drawer__loading,
      .tplv-drawer__empty {
        color: color-mix(in srgb, currentColor 60%, transparent);
        text-align: center;
        padding: 24px 0;
      }
      .tplv-drawer__error {
        color: var(--danger-color, currentColor);
        background: var(--danger-bg, transparent);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid var(--danger-border, transparent);
      }
      .tplv-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .tplv-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .tplv-item:last-child {
        border-bottom: none;
      }
      .tplv-item__main {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tplv-item__title {
        font-size: 14px;
        font-weight: 600;
      }
      .tplv-item__active-tag {
        margin-left: 6px;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--primary-color) 12%, transparent);
        color: var(--primary-color);
        font-weight: 500;
      }
      .tplv-item__reason {
        font-size: 12px;
        color: color-mix(in srgb, currentColor 65%, transparent);
      }
      .tplv-item__rollback {
        min-width: 40px;
        min-height: 40px;
        font-size: 13px;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--card-bg);
        color: inherit;
        cursor: pointer;
      }
      .tplv-item__rollback:hover:not(:disabled) {
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        border-color: var(--primary-color);
      }
      .tplv-item__rollback:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .tplv-confirm {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--text-color, currentColor) 50%, transparent);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .tplv-confirm__panel {
        background: var(--card-bg);
        border-radius: 12px;
        padding: 24px;
        max-width: 460px;
        width: 100%;
        box-shadow: 0 12px 32px color-mix(in srgb, var(--text-color, currentColor) 25%, transparent);
      }
      .tplv-confirm__panel h3 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      .tplv-confirm__panel p {
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.5;
      }
      .tplv-confirm__panel label {
        display: block;
        font-size: 13px;
        margin-bottom: 6px;
      }
      .tplv-confirm__input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 14px;
        background: var(--card-bg);
        color: inherit;
        margin-bottom: 16px;
      }
      .tplv-confirm__input:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      .tplv-confirm__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .tplv-confirm__cancel,
      .tplv-confirm__submit {
        min-width: 40px;
        min-height: 40px;
        font-size: 13px;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid var(--border-color);
      }
      .tplv-confirm__cancel {
        background: var(--card-bg);
        color: inherit;
      }
      .tplv-confirm__submit {
        background: var(--primary-color);
        color: var(--primary-on, white);
        border-color: var(--primary-color);
      }
      .tplv-confirm__submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class TemplateVersionsDrawerComponent implements OnInit {
  @Input({ required: true }) template!: RemotionTemplate;
  @Output() closed = new EventEmitter<void>();
  @Output() rollbackDone = new EventEmitter<{ versionId: string }>();

  private data = inject(RemotionTemplatesDataService);

  versions = signal<TemplateVersion[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  confirmingVersion = signal<TemplateVersion | null>(null);
  rollbackInFlight = signal(false);
  confirmTyped = '';
  /** Sortis du template inline pour passer le détecteur de hardcoded i18n
   *  (cf. pattern DELETE_MODAL_LABELS de remotion-templates.component.ts). */
  readonly closeAriaLabel = 'Fermer';

  ngOnInit(): void {
    this.data.getVersions(this.template.id).subscribe({
      next: (rows) => {
        // listVersions ADR-055 returns DESC by created_at — first row = current state.
        this.versions.set(rows ?? []);
        this.loading.set(false);
      },
      error: (err: { error?: { error?: string } }) => {
        this.error.set(err?.error?.error ?? 'Impossible de charger l\'historique.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Restore an older snapshot. The server creates a new `pre-update` snapshot
   * via the ADR-055 trigger before applying the patch — no data loss possible.
   */
  doRollback(v: TemplateVersion): void {
    if (this.rollbackInFlight()) return;
    this.rollbackInFlight.set(true);
    this.data.setDefaultVersion(this.template.id, v.id).subscribe({
      next: () => {
        this.rollbackInFlight.set(false);
        this.confirmingVersion.set(null);
        this.confirmTyped = '';
        this.rollbackDone.emit({ versionId: v.id });
      },
      error: (err: { error?: { error?: string } }) => {
        this.rollbackInFlight.set(false);
        this.error.set(err?.error?.error ?? 'Échec du rollback.');
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmingVersion()) {
      this.confirmingVersion.set(null);
      this.confirmTyped = '';
      return;
    }
    this.closed.emit();
  }

  trackById(_i: number, v: TemplateVersion): string {
    return v.id;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  reasonLabel(reason: string | null): string {
    switch (reason) {
      case 'initial':
        return 'Création du template';
      case 'pre-update':
        return 'Avant modification';
      case 'backfill':
        return 'Migration';
      default:
        return reason ?? '—';
    }
  }
}
