import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ClubSaasActionsComponent } from './club-saas-actions.component';
import { ClubHelpModalComponent } from './club-help-modal.component';
import { ClubDashboardDataService, SiteDashboard } from './club-dashboard-data.service';
import { ClubMetricsService } from './club-metrics.service';
import { ClubRealtimeService } from './club-realtime.service';
import { RemoteAuthSectionComponent } from '../sites/components/site-settings-tab/remote-auth-section/remote-auth-section.component';

@Component({
  selector: 'app-club-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    ClubSaasActionsComponent,
    ClubHelpModalComponent,
    RemoteAuthSectionComponent,
  ],
  templateUrl: './club-dashboard.component.html',
  styleUrls: ['./club-dashboard.component.scss'],
})
export class ClubDashboardComponent implements OnInit, OnDestroy {
  private readonly dataService = inject(ClubDashboardDataService);
  private readonly metrics = inject(ClubMetricsService);
  private readonly realtime = inject(ClubRealtimeService);

  siteDashboard: SiteDashboard | null = null;
  loading = true;
  error = '';
  showHelp = false;

  get isSaas(): boolean {
    return this.siteDashboard?.site?.site_type === 'saas';
  }

  readonly sparklineWidth = 600;
  readonly sparklineHeight = 100;

  private pollingSubscription?: Subscription;

  ngOnInit(): void {
    this.loading = true;
    this.dataService.fetchDashboard().subscribe({
      next: (data) => {
        this.siteDashboard = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'Erreur de chargement';
        this.loading = false;
      }
    });
    this.pollingSubscription = this.realtime.startPolling().subscribe({
      next: (data) => { this.siteDashboard = data; },
    });
  }

  ngOnDestroy(): void {
    this.pollingSubscription?.unsubscribe();
  }

  getLastSeen(): string | null | undefined {
    return this.siteDashboard?.connection?.lastSeen ?? this.siteDashboard?.connection?.lastSeenAt;
  }

  showEmptyStateHint(): boolean {
    return this.metrics.showEmptyStateHint(this.siteDashboard, this.isSaas);
  }

  getVideosTrend() {
    return this.metrics.getVideosTrend(this.siteDashboard?.saasMetrics);
  }

  getScreenTimeTrend() {
    return this.metrics.getScreenTimeTrend(this.siteDashboard?.saasMetrics);
  }

  getCompletionTrend() {
    return this.metrics.getCompletionTrend(this.siteDashboard?.saasMetrics);
  }

  hasSparklineData(): boolean {
    return this.metrics.hasSparklineData(this.siteDashboard?.saasMetrics);
  }

  getSparklinePoints(): string {
    return this.metrics.getSparklinePoints(this.siteDashboard?.saasMetrics, this.sparklineWidth, this.sparklineHeight);
  }

  getSparklineArea(): string {
    return this.metrics.getSparklineArea(this.siteDashboard?.saasMetrics, this.sparklineWidth, this.sparklineHeight);
  }

  formatSparklineDay(isoDate: string): string {
    return this.metrics.formatSparklineDay(isoDate);
  }

  formatVideoName(filename: string): string {
    return this.metrics.formatVideoName(filename);
  }

  formatDuration(seconds: number): string {
    return this.metrics.formatDuration(seconds);
  }

  formatBytes(bytes: number): string {
    return this.metrics.formatBytes(bytes);
  }
}
