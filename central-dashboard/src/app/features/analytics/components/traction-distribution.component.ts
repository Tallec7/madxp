import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SportDistributionEntry, ContentMixEntry } from '../../../core/services/analytics.service';
import { TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-distribution',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <!-- Repartition sports -->
    <section class="section" *ngIf="sports.length">
      <h2 class="section-title">Repartition par sport</h2>
      <div class="card">
        <div class="sport-grid">
          <div class="sport-item" *ngFor="let row of sports">
            <div class="sport-bar-container">
              <div class="sport-bar" [style.width.%]="row.pct"></div>
            </div>
            <div class="sport-info">
              <span class="sport-name">{{ row.sport }}</span>
              <span class="sport-count">{{ row.site_count }} sites ({{ row.pct }}%)</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Mix de contenu -->
    <section class="section" *ngIf="contentMix.length">
      <h2 class="section-title">Mix de contenu</h2>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Categorie</th>
              <th class="text-right">Lectures</th>
              <th class="text-right">Part</th>
              <th class="text-right">Completion moy.</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of contentMix">
              <td>{{ row.category || uncategorizedLabel }}</td>
              <td class="text-right">{{ dataService.formatNumber(row.plays) }}</td>
              <td class="text-right">{{ row.pct }}%</td>
              <td class="text-right">{{ row.avg_completion }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionDistributionComponent {
  @Input() sports: SportDistributionEntry[] = [];
  @Input() contentMix: ContentMixEntry[] = [];
  readonly uncategorizedLabel = 'Uncategorized';
  readonly dataService = inject(TractionDataService);
}
