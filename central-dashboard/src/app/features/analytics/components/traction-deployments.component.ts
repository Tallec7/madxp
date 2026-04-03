import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeploymentStats, ReliabilityStats, AlertStats } from '../../../core/services/analytics.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-deployments',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <!-- Deploiements -->
    <section class="section" *ngIf="deploymentStats">
      <h2 class="section-title">Deploiements</h2>
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ deploymentStats.total_deployments }}</div>
          <div class="kpi-label">Total deploiements</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ deploymentStats.success_rate }}%</div>
          <div class="kpi-label">Taux de succes</div>
        </div>
        <div class="kpi-card-small">
          <div class="kpi-value-sm">{{ deploymentStats.avg_duration_min }} min</div>
          <div class="kpi-label">Duree moyenne</div>
        </div>
      </div>
    </section>

    <!-- Fiabilite & Alertes -->
    <section class="section" *ngIf="reliability || alertStats">
      <h2 class="section-title">Fiabilite</h2>
      <div class="kpi-grid kpi-grid-3">
        <ng-container *ngIf="reliability">
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ reliability.avg_uptime }}%</div>
            <div class="kpi-label">Uptime moyen</div>
          </div>
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ reliability.sites_monitored }}</div>
            <div class="kpi-label">Sites surveilles</div>
          </div>
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ reliability.avg_cpu }}%</div>
            <div class="kpi-label">CPU moyen</div>
          </div>
        </ng-container>
        <ng-container *ngIf="alertStats">
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ alertStats.total_alerts }}</div>
            <div class="kpi-label">Alertes totales</div>
          </div>
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ alertStats.resolution_rate }}%</div>
            <div class="kpi-label">Taux resolution</div>
          </div>
          <div class="kpi-card-small">
            <div class="kpi-value-sm">{{ alertStats.avg_ttr_hours }}h</div>
            <div class="kpi-label">TTR moyen</div>
          </div>
        </ng-container>
      </div>
    </section>
  `
})
export class TractionDeploymentsComponent {
  @Input() deploymentStats: DeploymentStats | null = null;
  @Input() reliability: ReliabilityStats | null = null;
  @Input() alertStats: AlertStats | null = null;
}
