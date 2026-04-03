import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EngagementMonthlyEntry } from '../../../core/services/analytics.service';
import { TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-engagement',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="rows.length">
      <h2 class="section-title">Engagement mensuel</h2>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th class="text-right">Lectures</th>
              <th class="text-right">Sites actifs</th>
              <th class="text-right">Screen time (h)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of rows">
              <td>{{ dataService.formatMonth(row.month) }}</td>
              <td class="text-right">{{ dataService.formatNumber(row.plays) }}</td>
              <td class="text-right">{{ row.active_sites }}</td>
              <td class="text-right">{{ row.screen_time_hours }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionEngagementComponent {
  @Input() rows: EngagementMonthlyEntry[] = [];
  readonly dataService = inject(TractionDataService);
}
