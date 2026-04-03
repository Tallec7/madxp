import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubscriptionStatus, SubscriptionHistoryEntry } from '../../../core/services/analytics.service';
import { TractionDataService } from '../traction-data.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-subscriptions',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="status">
      <h2 class="section-title">Abonnements</h2>
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ status.active }}</div>
          <div class="kpi-label">Actifs</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ status.trial_active }}</div>
          <div class="kpi-label">Essais</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ status.standard_active }}</div>
          <div class="kpi-label">Standard</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ status.premium_active }}</div>
          <div class="kpi-label">Premium</div>
        </div>
        <div class="kpi-card-small warning" *ngIf="+status.expiring_soon > 0">
          <div class="kpi-value-sm">{{ status.expiring_soon }}</div>
          <div class="kpi-label">Expirent bientot</div>
        </div>
        <div class="kpi-card-small danger" *ngIf="+status.suspended > 0">
          <div class="kpi-value-sm">{{ status.suspended }}</div>
          <div class="kpi-label">Suspendus</div>
        </div>
      </div>

      <div class="card mt-1" *ngIf="history.length">
        <h3>Historique mensuel</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th class="text-right">Activations</th>
              <th class="text-right">Renouvellements</th>
              <th class="text-right">Changements</th>
              <th class="text-right">Suspensions</th>
              <th class="text-right">Reactivations</th>
              <th class="text-right">Expirations</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of history">
              <td>{{ dataService.formatMonth(row.month) }}</td>
              <td class="text-right">{{ row.activations }}</td>
              <td class="text-right">{{ row.renewals }}</td>
              <td class="text-right">{{ row.plan_changes }}</td>
              <td class="text-right">{{ row.suspensions }}</td>
              <td class="text-right">{{ row.reactivations }}</td>
              <td class="text-right">{{ row.expirations }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class TractionSubscriptionsComponent {
  @Input() status: SubscriptionStatus | null = null;
  @Input() history: SubscriptionHistoryEntry[] = [];
  readonly dataService = inject(TractionDataService);
}
