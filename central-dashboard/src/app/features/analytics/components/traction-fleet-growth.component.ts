import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FleetGrowthWithCumulative, TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-fleet-growth',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="rows.length">
      <h2 class="section-title">Croissance de la flotte</h2>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th class="text-right">Nouveaux sites</th>
              <th class="text-right">Cumule</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of rows">
              <td>{{ dataService.formatMonth(row.month) }}</td>
              <td class="text-right">
                <span class="badge badge-green" *ngIf="+row.new_sites > 0">+{{ row.new_sites }}</span>
                <span *ngIf="+row.new_sites === 0">0</span>
              </td>
              <td class="text-right font-bold">{{ row.cumulative }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionFleetGrowthComponent {
  @Input() rows: FleetGrowthWithCumulative[] = [];
  readonly dataService = inject(TractionDataService);
}
