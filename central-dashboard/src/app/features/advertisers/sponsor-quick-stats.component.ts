import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SponsorQuickStats } from './advertiser-detail-data.service';

@Component({
  selector: 'app-sponsor-quick-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="analytics-tab">
      <div class="analytics-redirect">
        <h2>Analytics Detaillees</h2>
        <p>Accedez au dashboard analytics complet pour ce sponsor</p>
        <button
          class="btn btn-primary btn-large"
          (click)="navigateToAnalytics.emit()"
        >
          Voir le Dashboard Analytics →
        </button>

        <div class="quick-stats" *ngIf="quickStats">
          <h3>Apercu Rapide</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ quickStats.total_impressions.toLocaleString() || 0 }}</span>
              <span class="stat-label">Impressions totales</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ formatDuration(quickStats.total_screen_time || 0) }}</span>
              <span class="stat-label">Temps ecran total</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ quickStats.completion_rate.toFixed(1) || 0 }}%</span>
              <span class="stat-label">Taux de completion</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ quickStats.unique_sites || 0 }}</span>
              <span class="stat-label">Sites actifs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .analytics-redirect {
      text-align: center;
      padding: 3rem 2rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .analytics-redirect h2 {
      margin: 0 0 1rem 0;
      font-size: 1.75rem;
    }

    .analytics-redirect p {
      color: #6b7280;
      margin-bottom: 2rem;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-large {
      padding: 1rem 2rem;
      font-size: 1.1rem;
    }

    .quick-stats {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #e5e7eb;
    }

    .quick-stats h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      text-align: center;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 600;
      color: #2563eb;
    }

    .stat-label {
      color: #6b7280;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class SponsorQuickStatsComponent {
  @Input() quickStats: SponsorQuickStats | null = null;
  @Output() navigateToAnalytics = new EventEmitter<void>();

  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0s';
    const s = Math.round(seconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}
