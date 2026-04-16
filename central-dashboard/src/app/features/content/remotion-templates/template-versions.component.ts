import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TemplateVersion } from './remotion-templates.types';

/**
 * Dropdown admin affichant l'historique des versions d'un template (ADR-055).
 * Chaque entrée = snapshot `props_schema + default_props` à un instant donné.
 * L'action restore recharge la config et crée elle-même un snapshot de l'état
 * actuel (pre-update) → aucune perte possible.
 */
@Component({
  selector: 'app-template-versions',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="versions-panel">
      <button
        type="button"
        class="btn-toggle"
        [attr.aria-expanded]="open"
        (click)="toggle()"
      >
        🕓 Historique ({{ versions.length }})
        <span class="caret" [class.open]="open">▾</span>
      </button>

      <div class="versions-list" *ngIf="open">
        <div class="loading" *ngIf="loading">Chargement...</div>

        <div class="empty" *ngIf="!loading && versions.length === 0">
          Aucune version antérieure.
        </div>

        <ul *ngIf="!loading && versions.length > 0">
          <li *ngFor="let v of versions; trackBy: trackById" class="version-item">
            <div class="version-meta">
              <span class="version-date">{{ formatDate(v.created_at) }}</span>
              <span class="version-reason" [class.reason-initial]="v.snapshot_reason === 'initial'">
                {{ reasonLabel(v.snapshot_reason) }}
              </span>
            </div>
            <button
              type="button"
              class="btn-restore"
              [disabled]="restoringId === v.id"
              (click)="onRestore(v)"
            >
              {{ restoringId === v.id ? 'Restauration...' : 'Restaurer' }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .versions-panel { position: relative; }
    .btn-toggle {
      background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 6px 12px; font-size: 13px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .caret { transition: transform .15s; }
    .caret.open { transform: rotate(180deg); }
    .versions-list {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,.1);
      min-width: 320px; max-height: 380px; overflow-y: auto;
      z-index: 50;
    }
    .loading, .empty { padding: 16px; color: #6b7280; font-size: 13px; text-align: center; }
    ul { list-style: none; margin: 0; padding: 4px 0; }
    .version-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid #f3f4f6;
    }
    .version-item:last-child { border-bottom: none; }
    .version-meta { display: flex; flex-direction: column; gap: 2px; }
    .version-date { font-size: 13px; color: #111827; }
    .version-reason {
      font-size: 11px; color: #6b7280;
      background: #f9fafb; padding: 1px 6px; border-radius: 10px;
      align-self: flex-start;
    }
    .version-reason.reason-initial { background: #ede9fe; color: #6d28d9; }
    .btn-restore {
      font-size: 12px; padding: 4px 10px;
      border: 1px solid #d1d5db; border-radius: 6px;
      background: #fff; cursor: pointer;
    }
    .btn-restore:hover:not(:disabled) { background: #f3f4f6; }
    .btn-restore:disabled { opacity: .6; cursor: not-allowed; }
  `],
})
export class TemplateVersionsComponent {
  @Input() versions: TemplateVersion[] = [];
  @Input() loading = false;
  @Input() restoringId: string | null = null;

  @Output() toggleOpen = new EventEmitter<boolean>();
  @Output() restore = new EventEmitter<TemplateVersion>();

  open = false;

  toggle(): void {
    this.open = !this.open;
    this.toggleOpen.emit(this.open);
  }

  onRestore(v: TemplateVersion): void {
    this.restore.emit(v);
  }

  trackById(_i: number, v: TemplateVersion): string {
    return v.id;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  reasonLabel(reason: string | null): string {
    switch (reason) {
      case 'initial': return 'Création';
      case 'pre-update': return 'Avant modification';
      case 'backfill': return 'Migration';
      default: return reason ?? '—';
    }
  }
}
