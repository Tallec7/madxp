import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface SponsorMetrics {
  active_advertisers?: string;
  videos_diffused?: string;
  sites_reached?: string;
  completion_rate?: string;
}

@Component({
  selector: 'app-sponsor-summary-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="card fade-in" *ngIf="metrics">
      <h2>Sponsors</h2>
      <div class="sponsor-stats">
        <div class="sponsor-stat">
          <div class="sponsor-stat-value">{{ metrics.active_advertisers || '0' }}</div>
          <div class="sponsor-stat-label">Annonceurs actifs</div>
        </div>
        <div class="sponsor-stat">
          <div class="sponsor-stat-value">{{ metrics.videos_diffused || '0' }}</div>
          <div class="sponsor-stat-label">Videos diffusees</div>
        </div>
        <div class="sponsor-stat">
          <div class="sponsor-stat-value">{{ metrics.sites_reached || '0' }}</div>
          <div class="sponsor-stat-label">Clubs touches</div>
        </div>
        <div class="sponsor-stat">
          <div class="sponsor-stat-value">{{ metrics.completion_rate || '0' }}%</div>
          <div class="sponsor-stat-label">Completion</div>
        </div>
      </div>
      <a routerLink="/advertisers" class="see-more">Voir les annonceurs &rarr;</a>
    </div>
  `,
  styles: [`
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }

    .card h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }

    .sponsor-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 12px; }
    .sponsor-stat { text-align: center; padding: 12px; background: #f8fafc; border-radius: 8px; }
    .sponsor-stat-value { font-size: 22px; font-weight: 700; color: #0f172a; }
    .sponsor-stat-label { font-size: 11px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; }

    .see-more { display: block; text-align: center; font-size: 13px; color: #2563eb; text-decoration: none; font-weight: 500; padding-top: 8px; }
    .see-more:hover { text-decoration: underline; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    @media (max-width: 768px) {
      .sponsor-stats { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class SponsorSummaryCardComponent {
  @Input() metrics: SponsorMetrics | null = null;
}
