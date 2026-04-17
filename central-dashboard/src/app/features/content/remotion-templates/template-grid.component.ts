import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TemplateCardComponent } from './template-card.component';
import type { RemotionTemplate } from './remotion-templates.types';

/**
 * Grille responsive de TemplateCard.
 * Gère les états loading / empty / list — pas de logique métier ici.
 */
@Component({
  selector: 'app-template-grid',
  standalone: true,
  imports: [CommonModule, TemplateCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="loading-state" *ngIf="loading">Chargement des templates...</div>

    <div class="templates-grid" *ngIf="!loading && templates.length > 0">
      <app-template-card
        *ngFor="let tpl of templates; trackBy: trackById"
        [template]="tpl"
        [selected]="selectedId === tpl.id"
        [isAdmin]="isAdmin"
        (cardSelect)="cardSelect.emit($event)"
        (publishToggle)="publishToggle.emit($event)"
      ></app-template-card>
    </div>

    <div class="empty-state" *ngIf="!loading && templates.length === 0">
      Aucun template disponible
    </div>
  `,
  styles: [`
    :host { display: block; }
    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .loading-state, .empty-state {
      color: #6b7280;
      padding: 48px 0;
      text-align: center;
    }
  `],
})
export class TemplateGridComponent {
  @Input() templates: RemotionTemplate[] = [];
  @Input() selectedId: string | null = null;
  @Input() isAdmin = false;
  @Input() loading = false;

  @Output() cardSelect = new EventEmitter<RemotionTemplate>();
  @Output() publishToggle = new EventEmitter<RemotionTemplate>();

  trackById(_index: number, tpl: RemotionTemplate): string {
    return tpl.id;
  }
}
