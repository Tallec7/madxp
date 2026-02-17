import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import {
  AnalyticsService,
  TractionMetrics,
  TractionOverview,
  TractionUserStats,
  FleetGrowthEntry,
  EngagementTotals,
  EngagementMonthlyEntry,
  SubscriptionStatus,
  SubscriptionHistoryEntry,
  AdvertiserMetrics,
  AdvertiserMonthlyEntry,
  ContentLibrary,
  ContentGrowthEntry,
  DeploymentStats,
  ReliabilityStats,
  AlertStats,
  ProductVelocity,
  ReleaseAdoptionEntry,
  RetentionCohortEntry,
  SportDistributionEntry,
  ContentMixEntry,
} from '../../core/services/analytics.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { AnalyticsNavComponent } from './analytics-nav.component';

@Component({
  selector: 'app-analytics-traction',
  standalone: true,
  imports: [CommonModule, RouterModule, AnalyticsNavComponent],
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

        <!-- ============================================================ -->
        <!-- 1. Resume executif — 8 KPI cards -->
        <!-- ============================================================ -->
        <section class="section">
          <h2 class="section-title">Resume executif</h2>
          <div class="kpi-grid kpi-grid-4">

            <div class="kpi-card accent-blue">
              <div class="kpi-value">{{ metrics.overview?.total_sites || '0' }}</div>
              <div class="kpi-label">Boitiers deployes</div>
              <div class="kpi-sub" *ngIf="metrics.overview?.pct_online">
                {{ metrics.overview?.pct_online }}% en ligne
              </div>
            </div>

            <div class="kpi-card accent-green">
              <div class="kpi-value">{{ metrics.engagementTotals?.total_plays || '0' }}</div>
              <div class="kpi-label">Lectures video (total)</div>
              <div class="kpi-sub" *ngIf="metrics.engagementTotals?.sites_with_plays">
                {{ metrics.engagementTotals?.sites_with_plays }} sites actifs
              </div>
            </div>

            <div class="kpi-card accent-purple">
              <div class="kpi-value">{{ metrics.engagementTotals?.screen_time_hours || '0' }}h</div>
              <div class="kpi-label">Screen time total</div>
              <div class="kpi-sub" *ngIf="metrics.engagementTotals?.avg_completion">
                {{ metrics.engagementTotals?.avg_completion }}% completion moy.
              </div>
            </div>

            <div class="kpi-card accent-orange">
              <div class="kpi-value">{{ metrics.advertiserMetrics?.total_impressions || '0' }}</div>
              <div class="kpi-label">Impressions sponsors</div>
              <div class="kpi-sub" *ngIf="metrics.advertiserMetrics?.sites_reached">
                {{ metrics.advertiserMetrics?.sites_reached }} sites touches
              </div>
            </div>

            <div class="kpi-card accent-teal">
              <div class="kpi-value">{{ metrics.userStats?.total_users || '0' }}</div>
              <div class="kpi-label">Utilisateurs</div>
              <div class="kpi-sub" *ngIf="metrics.userStats?.active_30d">
                {{ metrics.userStats?.active_30d }} actifs (30j)
              </div>
            </div>

            <div class="kpi-card accent-pink">
              <div class="kpi-value">{{ metrics.advertiserMetrics?.active_advertisers || '0' }}</div>
              <div class="kpi-label">Annonceurs actifs</div>
              <div class="kpi-sub" *ngIf="metrics.advertiserMetrics?.active_agencies">
                {{ metrics.advertiserMetrics?.active_agencies }} agences
              </div>
            </div>

            <div class="kpi-card accent-indigo">
              <div class="kpi-value">{{ metrics.contentLibrary?.total_videos || '0' }}</div>
              <div class="kpi-label">Videos en bibliotheque</div>
              <div class="kpi-sub" *ngIf="metrics.contentLibrary?.storage_gb">
                {{ metrics.contentLibrary?.storage_gb }} Go
              </div>
            </div>

            <div class="kpi-card accent-red">
              <div class="kpi-value">{{ calculateAverageRetention() }}%</div>
              <div class="kpi-label">Retention moyenne</div>
              <div class="kpi-sub">{{ metrics.retentionCohorts.length || 0 }} cohortes</div>
            </div>

          </div>
        </section>

        <!-- ============================================================ -->
        <!-- 2. Croissance flotte -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.fleetGrowth?.length">
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
                <tr *ngFor="let row of getFleetGrowthWithCumulative(); let i = index">
                  <td>{{ formatMonth(row.month) }}</td>
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

        <!-- ============================================================ -->
        <!-- 3. Engagement mensuel -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.engagementMonthly?.length">
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
                <tr *ngFor="let row of metrics.engagementMonthly">
                  <td>{{ formatMonth(row.month) }}</td>
                  <td class="text-right">{{ formatNumber(row.plays) }}</td>
                  <td class="text-right">{{ row.active_sites }}</td>
                  <td class="text-right">{{ row.screen_time_hours }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============================================================ -->
        <!-- 4. Abonnements -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.subscriptionStatus">
          <h2 class="section-title">Abonnements</h2>
          <div class="kpi-grid kpi-grid-3">
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.active }}</div>
              <div class="kpi-label">Actifs</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.trial_active }}</div>
              <div class="kpi-label">Essais</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.standard_active }}</div>
              <div class="kpi-label">Standard</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.premium_active }}</div>
              <div class="kpi-label">Premium</div>
            </div>
            <div class="kpi-card-small warning" *ngIf="+metrics.subscriptionStatus.expiring_soon > 0">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.expiring_soon }}</div>
              <div class="kpi-label">Expirent bientot</div>
            </div>
            <div class="kpi-card-small danger" *ngIf="+metrics.subscriptionStatus.suspended > 0">
              <div class="kpi-value-sm">{{ metrics.subscriptionStatus.suspended }}</div>
              <div class="kpi-label">Suspendus</div>
            </div>
          </div>

          <!-- Historique abonnements -->
          <div class="card mt-1" *ngIf="metrics.subscriptionHistory?.length">
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
                <tr *ngFor="let row of metrics.subscriptionHistory">
                  <td>{{ formatMonth(row.month) }}</td>
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

        <!-- ============================================================ -->
        <!-- 5. Annonceurs & Impressions -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.advertiserMetrics">
          <h2 class="section-title">Annonceurs &amp; Impressions</h2>
          <div class="kpi-grid kpi-grid-3">
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.advertiserMetrics.total_advertisers }}</div>
              <div class="kpi-label">Annonceurs</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.advertiserMetrics.total_agencies }}</div>
              <div class="kpi-label">Agences</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.advertiserMetrics.videos_diffused }}</div>
              <div class="kpi-label">Videos diffusees</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.advertiserMetrics.screen_time_hours }}h</div>
              <div class="kpi-label">Screen time sponsors</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.advertiserMetrics.completion_rate }}%</div>
              <div class="kpi-label">Taux completion</div>
            </div>
          </div>

          <div class="card mt-1" *ngIf="metrics.advertiserMonthly?.length">
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
                <tr *ngFor="let row of metrics.advertiserMonthly">
                  <td>{{ formatMonth(row.month) }}</td>
                  <td class="text-right">{{ formatNumber(row.impressions) }}</td>
                  <td class="text-right">{{ row.sites }}</td>
                  <td class="text-right">{{ row.videos }}</td>
                  <td class="text-right">{{ row.screen_time_hours }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============================================================ -->
        <!-- 6. Deploiements -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.deploymentStats">
          <h2 class="section-title">Deploiements</h2>
          <div class="kpi-grid kpi-grid-3">
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.deploymentStats.total_deployments }}</div>
              <div class="kpi-label">Total deploiements</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.deploymentStats.success_rate }}%</div>
              <div class="kpi-label">Taux de succes</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.deploymentStats.avg_duration_min }} min</div>
              <div class="kpi-label">Duree moyenne</div>
            </div>
          </div>
        </section>

        <!-- ============================================================ -->
        <!-- 7. Fiabilite & Alertes -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.reliability || metrics.alertStats">
          <h2 class="section-title">Fiabilite</h2>
          <div class="kpi-grid kpi-grid-3">
            <ng-container *ngIf="metrics.reliability">
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.reliability.avg_uptime }}%</div>
                <div class="kpi-label">Uptime moyen</div>
              </div>
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.reliability.sites_monitored }}</div>
                <div class="kpi-label">Sites surveilles</div>
              </div>
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.reliability.avg_cpu }}%</div>
                <div class="kpi-label">CPU moyen</div>
              </div>
            </ng-container>
            <ng-container *ngIf="metrics.alertStats">
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.alertStats.total_alerts }}</div>
                <div class="kpi-label">Alertes totales</div>
              </div>
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.alertStats.resolution_rate }}%</div>
                <div class="kpi-label">Taux resolution</div>
              </div>
              <div class="kpi-card-small">
                <div class="kpi-value-sm">{{ metrics.alertStats.avg_ttr_hours }}h</div>
                <div class="kpi-label">TTR moyen</div>
              </div>
            </ng-container>
          </div>
        </section>

        <!-- ============================================================ -->
        <!-- 8. Velocite produit -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.productVelocity">
          <h2 class="section-title">Velocite produit</h2>
          <div class="kpi-grid kpi-grid-3">
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.productVelocity.total_releases }}</div>
              <div class="kpi-label">Releases publiees</div>
            </div>
            <div class="kpi-card-small">
              <div class="kpi-value-sm">{{ metrics.productVelocity.critical_releases }}</div>
              <div class="kpi-label">Releases critiques</div>
            </div>
          </div>

          <div class="card mt-1" *ngIf="metrics.releaseAdoption?.length">
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
                <tr *ngFor="let row of metrics.releaseAdoption">
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

        <!-- ============================================================ -->
        <!-- 9. Retention par cohorte -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.retentionCohorts?.length">
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
                <tr *ngFor="let row of metrics.retentionCohorts">
                  <td>{{ formatMonth(row.cohort) }}</td>
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

        <!-- ============================================================ -->
        <!-- 10. Repartition sports -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.sportDistribution?.length">
          <h2 class="section-title">Repartition par sport</h2>
          <div class="card">
            <div class="sport-grid">
              <div class="sport-item" *ngFor="let row of metrics.sportDistribution">
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

        <!-- ============================================================ -->
        <!-- 11. Mix de contenu -->
        <!-- ============================================================ -->
        <section class="section" *ngIf="metrics.contentMix?.length">
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
                <tr *ngFor="let row of metrics.contentMix">
                  <td>{{ row.category || uncategorizedLabel }}</td>
                  <td class="text-right">{{ formatNumber(row.plays) }}</td>
                  <td class="text-right">{{ row.pct }}%</td>
                  <td class="text-right">{{ row.avg_completion }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

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

    /* Sections */
    .section {
      margin-bottom: 2.5rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 1rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #e2e8f0;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      gap: 1rem;
    }

    .kpi-grid-4 {
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    }

    .kpi-grid-3 {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }

    /* KPI Cards */
    .kpi-card {
      padding: 1.5rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #e2e8f0;
    }

    .kpi-card.accent-blue { border-left-color: #3b82f6; }
    .kpi-card.accent-green { border-left-color: #10b981; }
    .kpi-card.accent-purple { border-left-color: #8b5cf6; }
    .kpi-card.accent-orange { border-left-color: #f59e0b; }
    .kpi-card.accent-teal { border-left-color: #14b8a6; }
    .kpi-card.accent-pink { border-left-color: #ec4899; }
    .kpi-card.accent-indigo { border-left-color: #6366f1; }
    .kpi-card.accent-red { border-left-color: #ef4444; }

    .kpi-value {
      font-size: 2rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }

    .kpi-label {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .kpi-sub {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }

    /* Small KPI cards */
    .kpi-card-small {
      padding: 1rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      text-align: center;
    }

    .kpi-card-small.warning {
      border: 1px solid #f59e0b;
      background: #fffbeb;
    }

    .kpi-card-small.danger {
      border: 1px solid #ef4444;
      background: #fef2f2;
    }

    .kpi-value-sm {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    /* Card */
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .card h3 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #475569;
    }

    .mt-1 { margin-top: 1rem; }

    /* Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }

    .data-table th,
    .data-table td {
      padding: 0.625rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .data-table th {
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #f8fafc;
      position: sticky;
      top: 0;
    }

    .data-table td {
      color: #0f172a;
      font-size: 0.875rem;
    }

    .data-table tbody tr:hover {
      background: #f8fafc;
    }

    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8125rem; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-green {
      background: #ecfdf5;
      color: #065f46;
    }

    .badge-orange {
      background: #fffbeb;
      color: #92400e;
    }

    .badge-red {
      background: #fef2f2;
      color: #991b1b;
    }

    /* Sport bars */
    .sport-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .sport-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .sport-info {
      display: flex;
      justify-content: space-between;
    }

    .sport-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 0.875rem;
      text-transform: capitalize;
    }

    .sport-count {
      font-size: 0.75rem;
      color: #64748b;
    }

    .sport-bar-container {
      height: 8px;
      background: #f1f5f9;
      border-radius: 4px;
      overflow: hidden;
    }

    .sport-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      border-radius: 4px;
      min-width: 4px;
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

    @media (max-width: 768px) {
      .kpi-grid-4 {
        grid-template-columns: repeat(2, 1fr);
      }

      .kpi-grid-3 {
        grid-template-columns: repeat(2, 1fr);
      }

      .page-container {
        padding: 1rem;
      }
    }
  `]
})
export class AnalyticsTractionComponent implements OnInit, OnDestroy {
  metrics: TractionMetrics | null = null;
  loading = false;
  lastUpdate: Date | null = null;
  errorMessage: string | null = null;
  readonly uncategorizedLabel = 'Uncategorized';

  private readonly analyticsService = inject(AnalyticsService);
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

  /** Formate un nombre string avec separateur de milliers */
  formatNumber(value: string): string {
    const num = parseInt(value, 10);
    if (isNaN(num)) return value;
    return num.toLocaleString('fr-FR');
  }

  /** Formate YYYY-MM en mois lisible */
  formatMonth(dateStr: string): string {
    if (!dateStr) return '';
    const [year, month] = dateStr.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(month, 10) - 1;
    if (idx < 0 || idx > 11) return dateStr;
    return `${months[idx]} ${year}`;
  }

  /** Calcule la retention moyenne toutes cohortes confondues */
  calculateAverageRetention(): string {
    if (!this.metrics?.retentionCohorts?.length) return '0';
    const total = this.metrics.retentionCohorts.reduce((acc, c) => acc + parseFloat(c.retention_pct || '0'), 0);
    return (total / this.metrics.retentionCohorts.length).toFixed(0);
  }

  /** Calcule le cumule pour la croissance flotte */
  getFleetGrowthWithCumulative(): Array<FleetGrowthEntry & { cumulative: number }> {
    let cumulative = 0;
    return (this.metrics?.fleetGrowth || []).map(row => {
      cumulative += parseInt(row.new_sites, 10) || 0;
      return { ...row, cumulative };
    });
  }
}
