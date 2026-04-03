import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ProductVelocity, ReleaseAdoptionEntry } from '../../../core/services/analytics.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-product-velocity',
  standalone: true,
  imports: [CommonModule, DatePipe],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="velocity">
      <h2 class="section-title">Velocite produit</h2>
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ velocity.total_releases }}</div>
          <div class="kpi-label">Releases publiees</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ velocity.critical_releases }}</div>
          <div class="kpi-label">Releases critiques</div>
        </div>
      </div>

      <div class="card mt-1" *ngIf="adoption.length">
        <h3>Adoption des releases</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Date</th>
              <th class="text-right">Deployes OK</th>
              <th class="text-right">Echoues</th>
              <th class="text-right">Adoption</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of adoption">
              <td class="font-mono">{{ row.version }}</td>
              <td>{{ row.release_date | date:'dd/MM/yyyy' }}</td>
              <td class="text-right">{{ row.deployed_ok }}</td>
              <td class="text-right">{{ row.deploy_failed }}</td>
              <td class="text-right">
                <span class="badge" [class.badge-green]="+row.adoption_pct >= 80"
                      [class.badge-orange]="+row.adoption_pct >= 50 && +row.adoption_pct < 80"
                      [class.badge-red]="+row.adoption_pct < 50">
                  {{ row.adoption_pct }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionProductVelocityComponent {
  @Input() velocity: ProductVelocity | null = null;
  @Input() adoption: ReleaseAdoptionEntry[] = [];
}
