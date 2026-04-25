import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { teamShort } from '../remote-v2-helpers';

export interface WidgetsEnabled {
  score: boolean;
  chrono: boolean;
  breaking: boolean;
}

export interface ScoreSnapshot {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export type WidgetSheet = 'widget-score' | 'widget-chrono' | 'widget-breaking';

/**
 * 3 widgets compacts (score / chrono / breaking) sous le hero.
 * Présentationnel pur — délègue toutes les actions au parent via @Output.
 */
@Component({
  selector: 'app-r2-widgets',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <section class="r2-widgets" *ngIf="enabled.score || enabled.chrono || enabled.breaking">
      <!-- Score -->
      <div *ngIf="enabled.score" class="r2-widget r2-widget-score" (click)="openSheet.emit('widget-score')">
        <div class="r2-widget-label">Score</div>
        <div class="r2-score-row" (click)="$event.stopPropagation()">
          <span class="r2-team-badge" [class.has-logo]="homeLogo"
            [style.background]="homeLogo ? '#fff' : homeColor">
            <img *ngIf="homeLogo as l" [src]="l" alt=""/>
            <span *ngIf="!homeLogo">{{ short(score.homeTeam) }}</span>
          </span>
          <span class="r2-score-display">
            <span class="r2-score-val">{{ score.homeScore }}</span>
            <span class="r2-score-sep">–</span>
            <span class="r2-score-val">{{ score.awayScore }}</span>
          </span>
          <span class="r2-team-badge" [class.has-logo]="awayLogo"
            [style.background]="awayLogo ? '#fff' : awayColor">
            <img *ngIf="awayLogo as l" [src]="l" alt=""/>
            <span *ngIf="!awayLogo">{{ short(score.awayTeam) }}</span>
          </span>
        </div>
        <div class="r2-score-quick" (click)="$event.stopPropagation()">
          <button class="r2-score-quick-btn" [style.background]="homeColor" (click)="incHome.emit()">
            + {{ short(score.homeTeam) }}
          </button>
          <button class="r2-score-quick-btn" [style.background]="awayColor" (click)="incAway.emit()">
            + {{ short(score.awayTeam) }}
          </button>
        </div>
      </div>

      <!-- Chrono -->
      <div *ngIf="enabled.chrono" class="r2-widget r2-widget-chrono" (click)="openSheet.emit('widget-chrono')">
        <div class="r2-widget-label">Chrono</div>
        <span class="r2-chrono-display">{{ chronoDisplay }}</span>
        <button class="r2-chrono-toggle" (click)="$event.stopPropagation(); toggleTimer.emit()">
          <svg *ngIf="timerRunning" width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
          <svg *ngIf="!timerRunning" width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3v18l16-9z"/>
          </svg>
          {{ timerRunning ? 'Pause' : 'Go' }}
        </button>
      </div>

      <!-- Breaking -->
      <div *ngIf="enabled.breaking" class="r2-widget r2-widget-breaking" [class.live]="breakingLive">
        <span class="r2-breaking-bar" *ngIf="breakingLive"></span>
        <div class="r2-widget-label r2-widget-label--breaking">
          Info<ng-container *ngIf="breakingLive"> · LIVE</ng-container>
        </div>
        <button class="r2-breaking-text" (click)="openSheet.emit('widget-breaking')">
          {{ breakingText || 'Tapez pour saisir un message' }}
        </button>
        <button class="r2-breaking-btn" [class.live]="breakingLive" (click)="toggleBreaking.emit()">
          {{ breakingLive ? 'Retirer' : 'Diffuser' }}
        </button>
      </div>
    </section>
  `,
})
export class R2WidgetsComponent {
  @Input() enabled: WidgetsEnabled = { score: false, chrono: false, breaking: false };
  @Input() score: ScoreSnapshot = { homeTeam: '', awayTeam: '', homeScore: 0, awayScore: 0 };
  @Input() homeColor = '#000';
  @Input() awayColor = '#000';
  @Input() homeLogo?: string;
  @Input() awayLogo?: string;
  @Input() chronoDisplay = '00:00';
  @Input() timerRunning = false;
  @Input() breakingText = '';
  @Input() breakingLive = false;

  @Output() openSheet = new EventEmitter<WidgetSheet>();
  @Output() incHome = new EventEmitter<void>();
  @Output() incAway = new EventEmitter<void>();
  @Output() toggleTimer = new EventEmitter<void>();
  @Output() toggleBreaking = new EventEmitter<void>();

  short = teamShort;
}
