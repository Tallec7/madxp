import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RetentionCohortEntry } from '../../../core/services/analytics.service';
import { TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-retention',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="cohorts.length">
      <h2 class="section-title">Retention par cohorte</h2>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cohorte</th>
              <th class="text-right">Sites</th>
              <th class="text-right">Encore actifs</th>
              <th class="text-right">Retention</th>
              <th class="text-right">Age moyen (mois)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of cohorts">
              <td>{{ dataService.formatMonth(row.cohort) }}</td>
              <td class="text-right">{{ row.total_sites }}</td>
              <td class="text-right">{{ row.still_active }}</td>
              <td class="text-right">
                <span class="badge" [class.badge-green]="+row.retention_pct >= 80"
                      [class.badge-orange]="+row.retention_pct >= 50 && +row.retention_pct < 80"
                      [class.badge-red]="+row.retention_pct < 50">
                  {{ row.retention_pct }}%
                </span>
              </td>
              <td class="text-right">{{ row.avg_age_months }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionRetentionComponent {
  @Input() cohorts: RetentionCohortEntry[] = [];
  readonly dataService = inject(TractionDataService);
}
