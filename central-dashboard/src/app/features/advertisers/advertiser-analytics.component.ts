import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AnalyticsFiltersComponent, PeriodChangeEvent } from './components/analytics-filters.component';
import { ChartDisplayComponent } from './components/chart-display.component';
import { DataExportService } from './services/data-export.service';
import { ReportGeneratorService } from './services/report-generator.service';
import {
  AnalyticsSummary,
  DailyTrend,
  Distribution,
  KpisResponse,
  SitePerformance,
  VideoPerformance
} from './models/analytics.models';

interface AnalyticsStatsResponse {
  data: {
    advertiser_name: string;
    summary: AnalyticsSummary;
    by_video: VideoPerformance[];
    by_site: SitePerformance[];
    trends: DailyTrend[];
    by_period: RawDistributionItem[];
    by_event: RawDistributionItem[];
  };
}

interface RawDistributionItem {
  period?: string;
  event_type?: string;
  impressions?: number;
}

interface KpisApiResponse {
  data: KpisResponse;
}

@Component({
  selector: 'app-sponsor-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, AnalyticsFiltersComponent, ChartDisplayComponent],
  template: `
    <div class="analytics-container">
      <app-analytics-filters
        [sponsorName]="sponsorName"
        [periodLabel]="periodLabel"
        [exporting]="exporting"
        [generatingPDF]="generatingPDF"
        (periodChanged)="onPeriodChanged($event)"
        (exportCSV)="exportCSV()"
        (downloadPDF)="downloadPDF()"
        (goBack)="goBack()"
      ></app-analytics-filters>

      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement des analytics...</p>
      </div>

      <div *ngIf="error" class="error-message">
        <p>❌ {{ error }}</p>
        <button class="btn btn-primary" (click)="loadAnalytics()">Réessayer</button>
      </div>

      <div *ngIf="!loading && !error && summary" class="analytics-content">
        <app-chart-display
          [summary]="summary"
          [kpisData]="kpisData"
          [topVideos]="topVideos"
          [topSites]="topSites"
          [dailyTrends]="dailyTrends"
          [periodDistribution]="periodDistribution"
          [eventDistribution]="eventDistribution"
        ></app-chart-display>
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;
      background: #f9fafb;
      min-height: 100vh;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .loading, .error-message {
      text-align: center;
      padding: 4rem 2rem;
      color: #6b7280;
    }

    .spinner {
      border: 3px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #ef4444;
    }

    @media (max-width: 768px) {
      .analytics-container {
        padding: 1rem;
      }
    }
  `]
})
export class SponsorAnalyticsComponent implements OnInit {
  sponsorId = '';
  sponsorName = '';

  summary: AnalyticsSummary | null = null;
  kpisData: KpisResponse | null = null;
  topVideos: VideoPerformance[] = [];
  topSites: SitePerformance[] = [];
  dailyTrends: DailyTrend[] = [];
  periodDistribution: Distribution[] = [];
  eventDistribution: Distribution[] = [];

  periodLabel = '';
  loading = false;
  error = '';
  exporting = false;
  generatingPDF = false;

  private currentFrom = '';
  private currentTo = '';

  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dataExport = inject(DataExportService);
  private reportGenerator = inject(ReportGeneratorService);

  ngOnInit(): void {
    this.sponsorId = this.route.snapshot.params['id'];
    const range = this.getDefaultDateRange();
    this.currentFrom = range.from;
    this.currentTo = range.to;
    this.loadAnalytics();
  }

  onPeriodChanged(event: PeriodChangeEvent): void {
    this.currentFrom = event.from;
    this.currentTo = event.to;
    this.loadAnalytics();
  }

  loadAnalytics(): void {
    this.loading = true;
    this.error = '';
    this.updatePeriodLabel(this.currentFrom, this.currentTo);

    const params = { from: this.currentFrom, to: this.currentTo };

    this.api.get<AnalyticsStatsResponse>(`/analytics/advertisers/${this.sponsorId}/stats`, params).subscribe({
      next: (data) => {
        this.sponsorName = data.data.advertiser_name || 'Annonceur';
        this.summary = data.data.summary;
        this.topVideos = data.data.by_video?.slice(0, 10) || [];
        this.topSites = data.data.by_site?.slice(0, 20) || [];
        this.dailyTrends = data.data.trends || [];
        this.periodDistribution = this.formatDistribution(data.data.by_period);
        this.eventDistribution = this.formatDistribution(data.data.by_event);
      },
      error: () => {
        this.error = 'Erreur lors du chargement des analytics';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });

    this.loadKpis(params);
  }

  exportCSV(): void {
    this.exporting = true;
    this.dataExport.exportCSV(this.sponsorId, this.currentFrom, this.currentTo, () => {
      this.exporting = false;
    });
  }

  downloadPDF(): void {
    this.generatingPDF = true;
    this.reportGenerator.downloadPDF(this.sponsorId, this.currentFrom, this.currentTo, () => {
      this.generatingPDF = false;
    });
  }

  goBack(): void {
    this.router.navigate(['/advertisers', this.sponsorId]);
  }

  private loadKpis(params: { from: string; to: string }): void {
    this.api.get<KpisApiResponse>(`/analytics/advertisers/${this.sponsorId}/kpis`, params).subscribe({
      next: (data) => {
        this.kpisData = data.data;
      },
      error: () => {
        this.kpisData = null;
      }
    });
  }

  private getDefaultDateRange(): { from: string; to: string } {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    };
  }

  private updatePeriodLabel(from: string, to: string): void {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const fromStr = new Date(from).toLocaleDateString('fr-FR', options);
    const toStr = new Date(to).toLocaleDateString('fr-FR', options);
    this.periodLabel = `${fromStr} - ${toStr}`;
  }

  private formatDistribution(data: RawDistributionItem[]): Distribution[] {
    if (!data || data.length === 0) return [];

    const total = data.reduce((sum, item) => sum + (item.impressions || 0), 0);

    return data.map(item => ({
      label: this.formatLabel(item.period || item.event_type || 'Unknown'),
      value: item.impressions || 0,
      percentage: total > 0 ? ((item.impressions || 0) / total) * 100 : 0
    }));
  }

  private formatLabel(key: string): string {
    const labels: Record<string, string> = {
      pre_match: 'Avant-match',
      halftime: 'Mi-temps',
      post_match: 'Après-match',
      loop: 'Boucle',
      match: 'Match',
      training: 'Entraînement',
      tournament: 'Tournoi',
      other: 'Autre'
    };
    return labels[key] || key;
  }
}
