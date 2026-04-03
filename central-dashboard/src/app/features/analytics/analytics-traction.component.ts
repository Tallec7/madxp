import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AnalyticsService, TractionMetrics } from '../../core/services/analytics.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { AnalyticsNavComponent } from './analytics-nav.component';
import { TractionDataService, FleetGrowthWithCumulative } from './traction-data.service';
import { TractionKpiSummaryComponent } from './components/traction-kpi-summary.component';
import { TractionFleetGrowthComponent } from './components/traction-fleet-growth.component';
import { TractionEngagementComponent } from './components/traction-engagement.component';
import { TractionSubscriptionsComponent } from './components/traction-subscriptions.component';
import { TractionAdvertisersComponent } from './components/traction-advertisers.component';
import { TractionDeploymentsComponent } from './components/traction-deployments.component';
import { TractionProductVelocityComponent } from './components/traction-product-velocity.component';
import { TractionRetentionComponent } from './components/traction-retention.component';
import { TractionDistributionComponent } from './components/traction-distribution.component';

@Component({
  selector: 'app-analytics-traction',
  standalone: true,
  imports: [
    CommonModule, RouterModule, AnalyticsNavComponent,
    TractionKpiSummaryComponent, TractionFleetGrowthComponent,
    TractionEngagementComponent, TractionSubscriptionsComponent,
    TractionAdvertisersComponent, TractionDeploymentsComponent,
    TractionProductVelocityComponent, TractionRetentionComponent,
    TractionDistributionComponent,
  ],
  template: `
    <div class="page-container">
      <app-analytics-nav></app-analytics-nav>

      <div class="page-header">
        <div class="header-left">
          <h1>Traction &amp; Croissance</h1>
        </div>
        <div class="header-info">
          <span class="last-update" *ngIf="lastUpdate">
            Mise a jour : {{ lastUpdate | date:'HH:mm:ss' }}
          </span>
        </div>
      </div>

      <!-- Loading -->
      <div class="loading-overlay" *ngIf="loading && !metrics">
        <div class="spinner"></div>
        <p>Chargement des metriques...</p>
      </div>

      <!-- Error -->
      <div class="error-banner" *ngIf="errorMessage && !metrics">
        <p>{{ errorMessage }}</p>
        <button class="btn btn-primary" (click)="loadData()">Reessayer</button>
      </div>

      <ng-container *ngIf="metrics">
        <app-traction-kpi-summary
          [metrics]="metrics"
          [averageRetention]="averageRetention"
        ></app-traction-kpi-summary>

        <app-traction-fleet-growth
          [rows]="fleetGrowthRows"
        ></app-traction-fleet-growth>

        <app-traction-engagement
          [rows]="metrics.engagementMonthly"
        ></app-traction-engagement>

        <app-traction-subscriptions
          [status]="metrics.subscriptionStatus"
          [history]="metrics.subscriptionHistory"
        ></app-traction-subscriptions>

        <app-traction-advertisers
          [metrics]="metrics.advertiserMetrics"
          [monthly]="metrics.advertiserMonthly"
        ></app-traction-advertisers>

        <app-traction-deployments
          [deploymentStats]="metrics.deploymentStats"
          [reliability]="metrics.reliability"
          [alertStats]="metrics.alertStats"
        ></app-traction-deployments>

        <app-traction-product-velocity
          [velocity]="metrics.productVelocity"
          [adoption]="metrics.releaseAdoption"
        ></app-traction-product-velocity>

        <app-traction-retention
          [cohorts]="metrics.retentionCohorts"
        ></app-traction-retention>

        <app-traction-distribution
          [sports]="metrics.sportDistribution"
          [contentMix]="metrics.contentMix"
        ></app-traction-distribution>
      </ng-container>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .last-update {
      font-size: 0.875rem;
      color: #64748b;
    }

    /* Button */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    /* Loading & Error */
    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 1rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
    }

    .error-banner p {
      color: #991b1b;
      margin: 0 0 1rem 0;
    }
  `]
})
export class AnalyticsTractionComponent implements OnInit, OnDestroy {
  metrics: TractionMetrics | null = null;
  loading = false;
  lastUpdate: Date | null = null;
  errorMessage: string | null = null;

  averageRetention = '0';
  fleetGrowthRows: FleetGrowthWithCumulative[] = [];

  private readonly analyticsService = inject(AnalyticsService);
  private readonly tractionData = inject(TractionDataService);
  private readonly logger = inject(LoggerService);
  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.loadData();

    // Auto-refresh toutes les 5 minutes
    this.refreshSubscription = interval(300000).subscribe(() => {
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = null;
    this.analyticsService.getTractionMetrics().subscribe({
      next: (data) => {
        this.metrics = data;
        this.averageRetention = this.tractionData.calculateAverageRetention(data.retentionCohorts);
        this.fleetGrowthRows = this.tractionData.computeFleetGrowthWithCumulative(data.fleetGrowth);
        this.lastUpdate = new Date();
        this.loading = false;
      },
      error: (err) => {
        const message = ErrorExtractor.getMessage(err);
        this.logger.warn('Failed to load traction metrics', { error: message });
        this.errorMessage = 'Impossible de charger les metriques de traction.';
        this.loading = false;
      }
    });
  }
}
