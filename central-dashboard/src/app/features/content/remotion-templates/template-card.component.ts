import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RemotionTemplate } from './remotion-templates.types';

/**
 * Carte d'un template dans la grille de sélection.
 * Affiche thumbnail, nom, description, badges et (admin) le bouton publier/dépublier.
 */
@Component({
  selector: 'app-template-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="template-card"
      [class.selected]="selected"
      [attr.role]="'button'"
      [attr.tabindex]="0"
      [attr.aria-pressed]="selected"
      (click)="onSelect()"
      (keydown.enter)="onSelect()"
      (keydown.space)="$event.preventDefault(); onSelect()"
    >
      <div class="tpl-thumb" *ngIf="template.thumbnail_url; else placeholder">
        <img [src]="template.thumbnail_url" [alt]="template.name" />
      </div>
      <ng-template #placeholder>
        <div class="tpl-thumb tpl-thumb-placeholder" aria-hidden="true">
          <span>🎬</span>
        </div>
      </ng-template>

      <div class="tpl-info">
        <div class="tpl-name">{{ template.name }}</div>
        <div class="tpl-desc">{{ template.description }}</div>
        <div class="tpl-badges">
          <span class="badge badge-published" *ngIf="template.published">Publié</span>
          <span class="badge badge-draft" *ngIf="!template.published && isAdmin">Brouillon</span>
          <span class="badge badge-club" *ngIf="template.site_id" title="Template perso (club)">Club</span>
        </div>
      </div>

      <div class="tpl-admin-actions" *ngIf="isAdmin">
        <button
          type="button"
          class="btn-publish"
          [class.active]="template.published"
          [attr.aria-label]="template.published ? 'Dépublier ' + template.name : 'Publier ' + template.name"
          (click)="onTogglePublish($event)"
        >
          {{ template.published ? '✓ Publié' : 'Publier' }}
        </button>
        <button
          type="button"
          class="btn-duplicate"
          [attr.aria-label]="'Dupliquer ' + template.name"
          [disabled]="duplicating"
          (click)="onDuplicate($event)"
          data-testid="card-duplicate-btn"
        >
          {{ duplicating ? 'Duplication…' : '⎘ Dupliquer' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .template-card {
      border: 2px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
      background: var(--card-bg);
      outline: none;
    }
    .template-card:hover, .template-card:focus-visible {
      border-color: var(--primary-color);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 15%, transparent);
    }
    .template-card.selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 20%, transparent);
    }
    .tpl-thumb {
      height: 140px;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .tpl-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .tpl-thumb-placeholder span { font-size: 40px; }
    .tpl-info { padding: 12px; }
    .tpl-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .tpl-desc { font-size: 12px; color: #666; margin-bottom: 8px; }
    .tpl-badges { display: flex; gap: 6px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .badge-published { background: #d1fae5; color: #065f46; }
    .badge-draft { background: #fef3c7; color: #92400e; }
    .badge-club { background: #ede9fe; color: #5b21b6; }
    .tpl-admin-actions { padding: 8px 12px; border-top: 1px solid #f3f4f6; }
    .btn-publish {
      font-size: 12px;
      padding: 4px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .btn-publish.active { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
    .btn-duplicate {
      font-size: 12px;
      padding: 4px 12px;
      margin-left: 6px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .btn-duplicate:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-duplicate:hover:not(:disabled) { background: #f3f4f6; }
  `],
})
export class TemplateCardComponent {
  @Input({ required: true }) template!: RemotionTemplate;
  @Input() selected = false;
  @Input() isAdmin = false;
  @Input() duplicating = false;

  @Output() cardSelect = new EventEmitter<RemotionTemplate>();
  @Output() publishToggle = new EventEmitter<RemotionTemplate>();
  @Output() duplicateRequested = new EventEmitter<RemotionTemplate>();

  onSelect(): void {
    this.cardSelect.emit(this.template);
  }

  onTogglePublish(event: Event): void {
    event.stopPropagation();
    this.publishToggle.emit(this.template);
  }

  onDuplicate(event: Event): void {
    event.stopPropagation();
    this.duplicateRequested.emit(this.template);
  }
}
