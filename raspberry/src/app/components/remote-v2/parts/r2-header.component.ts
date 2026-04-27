import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Header de la Remote V2 : logo NeoPro + pill club cliquable + boutons SVG search/settings.
 * Présentationnel pur — toute la logique reste dans `RemoteV2Component`.
 */
@Component({
  selector: 'app-r2-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <header class="r2-header">
      <img src="neopro-logo.png" class="r2-header-logo" alt="NeoPro" />
      <div class="r2-header-sep"></div>
      <button class="r2-club-pill" (click)="profileClick.emit()">
        <span class="r2-club-badge">{{ initials }}</span>
        <span>{{ clubName }}</span>
      </button>
      <span class="r2-header-spacer"></span>
      <!-- Compteur erreurs vidéo session (chantier vidéos manquantes) —
           toujours visible : neutre à 0, rouge >0. Confirme que la sonde
           player-state est branchée même quand aucun plantage n'a eu lieu. -->
      <span
        class="r2-video-errors-chip"
        [class.has-errors]="errorsCount > 0"
        [attr.title]="errorsCount > 0
          ? errorsCount + ' erreur(s) de lecture vidéo détectée(s) cette session'
          : 'Aucune erreur de lecture vidéo cette session'"
        data-testid="remote-v2-video-errors-chip"
      >
        <span class="r2-vec-icon">{{ errorsCount > 0 ? '⚠' : '✓' }}</span>
        <span class="r2-vec-count">{{ errorsCount }}</span>
      </span>
      <div class="r2-header-actions">
        <button class="r2-icon-btn" aria-label="Recherche" (click)="searchClick.emit()">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
        </button>
        <button class="r2-icon-btn" aria-label="Menu" (click)="gearClick.emit()">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>
  `,
})
export class R2HeaderComponent {
  @Input() initials = '–';
  @Input() clubName = 'Club';
  @Input() errorsCount = 0;
  @Output() profileClick = new EventEmitter<void>();
  @Output() searchClick = new EventEmitter<void>();
  @Output() gearClick = new EventEmitter<void>();
}
