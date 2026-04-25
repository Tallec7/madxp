import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type GearAction = 'matchInfo' | 'widgets' | 'profile' | 'prefs' | 'options';

/**
 * Gear menu sheet — liste de raccourcis vers les autres sheets + reload + retour V1.
 * Utilise les styles globaux de la Remote V2 (.r2-* via ViewEncapsulation.None côté parent).
 */
@Component({
  selector: 'app-r2-gear-sheet',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <ng-container *ngIf="open">
      <div class="r2-sheet-backdrop" (click)="closed.emit()"></div>
      <div class="r2-sheet">
        <span class="r2-sheet-handle"></span>
        <div class="r2-sheet-header">
          <span>Menu</span>
          <button (click)="closed.emit()" aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="r2-sheet-body">
          <button class="r2-gear-item" (click)="action.emit('matchInfo')">
            <span class="r2-gear-icon">⏱</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Infos du match</span>
              <span class="r2-gear-sub">Équipes, date, spectateurs</span>
            </span>
            <span class="r2-gear-chev">›</span>
          </button>
          <button class="r2-gear-item" (click)="action.emit('widgets')">
            <span class="r2-gear-icon">🎛️</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Widgets</span>
              <span class="r2-gear-sub">Score, chrono, breaking</span>
            </span>
            <span class="r2-gear-chev">›</span>
          </button>
          <button class="r2-gear-item" (click)="action.emit('profile')">
            <span class="r2-gear-icon">👤</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Profil actif</span>
            </span>
            <span class="r2-gear-value">{{ currentProfile }}</span>
          </button>
          <button class="r2-gear-item" (click)="action.emit('prefs')">
            <span class="r2-gear-icon">📱</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Préférences appareil</span>
              <span class="r2-gear-sub">Haptique, contraste…</span>
            </span>
            <span class="r2-gear-chev">›</span>
          </button>
          <div class="r2-gear-sep"></div>
          <button class="r2-gear-item" (click)="action.emit('options')">
            <span class="r2-gear-icon">⚙</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Options match</span>
              <span class="r2-gear-sub">Score, chrono, template…</span>
            </span>
            <span class="r2-gear-chev">›</span>
          </button>
          <button class="r2-gear-item" (click)="reload.emit()" *ngIf="!isDemoMode">
            <span class="r2-gear-icon">↻</span>
            <span class="r2-gear-main">
              <span class="r2-gear-label">Recharger la config</span>
              <span class="r2-gear-sub">Re-fetch depuis le cloud</span>
            </span>
          </button>
          <hr />
          <button class="r2-menu-item r2-menu-item--secondary" (click)="backToV1.emit()">Retour V1</button>
        </div>
      </div>
    </ng-container>
  `,
})
export class R2GearSheetComponent {
  @Input() open = false;
  @Input() currentProfile = '';
  @Input() isDemoMode = false;

  @Output() closed = new EventEmitter<void>();
  @Output() action = new EventEmitter<GearAction>();
  @Output() reload = new EventEmitter<void>();
  @Output() backToV1 = new EventEmitter<void>();
}
