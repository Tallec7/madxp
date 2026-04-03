import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdvertiserMetrics, AdvertiserMonthlyEntry } from '../../../core/services/analytics.service';
import { TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-advertisers',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="metrics">
      <h2 class="section-title">Annonceurs &amp; Impressions</h2>
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ metrics.total_advertisers }}</div>
          <div class="kpi-label">Annonceurs</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ metrics.total_agencies }}</div>
          <div class="kpi-label">Agences</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ metrics.videos_diffused }}</div>
          <div class="kpi-label">Videos diffusees</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ metrics.screen_time_hours }}h</div>
          <div class="kpi-label">Screen time sponsors</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ metrics.completion_rate }}%</div>
          <div class="kpi-label">Taux completion</div>
        </div>
      </div>

      <div class="card mt-1" *ngIf="monthly.length">
        <h3>Evolution mensuelle</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th class="text-right">Impressions</th>
              <th class="text-right">Sites</th>
              <th class="text-right">Videos</th>
              <th class="text-right">Screen time (h)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of monthly">
              <td>{{ dataService.formatMonth(row.month) }}</td>
              <td class="text-right">{{ dataService.formatNumber(row.impressions) }}</td>
              <td class="text-right">{{ row.sites }}</td>
              <td class="text-right">{{ row.videos }}</td>
              <td class="text-right">{{ row.screen_time_hours }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionAdvertisersComponent {
  @Input() metrics: AdvertiserMetrics | null = null;
  @Input() monthly: AdvertiserMonthlyEntry[] = [];
  readonly dataService = inject(TractionDataService);
}
