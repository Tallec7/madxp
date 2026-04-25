import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WidgetsEnabled } from './r2-widgets.component';

/**
 * Sheet "Activer les widgets" — 3 toggles iOS-style pour score / chrono / breaking.
 * Présentationnel pur. Utilise les styles globaux .r2-*.
 */
@Component({
  selector: 'app-r2-widgets-toggle-sheet',
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
          <span>Activer les widgets</span>
          <button (click)="closed.emit()" aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="r2-sheet-body">
          <p class="r2-sheet-hint">
            Chaque widget apparaît sous l'à-l'antenne et reste toujours accessible.
          </p>
          <div class="r2-widget-toggle r2-widget-toggle--score">
            <span class="r2-widget-toggle-icon">+</span>
            <span class="r2-widget-toggle-text">
              <span class="r2-widget-toggle-title">Score en direct</span>
              <span class="r2-widget-toggle-sub">+1 / −1 en bas d'écran</span>
            </span>
            <button class="r2-switch" [class.on]="enabled.score"
              (click)="toggled.emit('score')" aria-label="Score">
              <span class="r2-switch-thumb"></span>
            </button>
          </div>
          <div class="r2-widget-toggle r2-widget-toggle--chrono">
            <span class="r2-widget-toggle-icon">⏱</span>
            <span class="r2-widget-toggle-text">
              <span class="r2-widget-toggle-title">Chronomètre</span>
              <span class="r2-widget-toggle-sub">Démarre/pause du chrono</span>
            </span>
            <button class="r2-switch" [class.on]="enabled.chrono"
              (click)="toggled.emit('chrono')" aria-label="Chrono">
              <span class="r2-switch-thumb"></span>
            </button>
          </div>
          <div class="r2-widget-toggle r2-widget-toggle--breaking">
            <span class="r2-widget-toggle-icon">📣</span>
            <span class="r2-widget-toggle-text">
              <span class="r2-widget-toggle-title">Bandeau breaking</span>
              <span class="r2-widget-toggle-sub">Overlay texte live</span>
            </span>
            <button class="r2-switch" [class.on]="enabled.breaking"
              (click)="toggled.emit('breaking')" aria-label="Breaking">
              <span class="r2-switch-thumb"></span>
            </button>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class R2WidgetsToggleSheetComponent {
  @Input() open = false;
  @Input() enabled: WidgetsEnabled = { score: false, chrono: false, breaking: false };

  @Output() closed = new EventEmitter<void>();
  @Output() toggled = new EventEmitter<keyof WidgetsEnabled>();
}
