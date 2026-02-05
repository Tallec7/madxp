/**
 * Site Benchmark Component
 *
 * Affiche le benchmark anonymisé pour un site donné
 */

import { Component, Input, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface BenchmarkStat {
  metric: string;
  yourValue: number;
  percentile: number;
  average: number;
  median: number;
  min: number;
  max: number;
  sampleSize: number;
}

interface BenchmarkResult {
  siteId: string;
  period: string;
  segments: {
    sport?: string;
    region?: string;
    sizeCategory?: string;
  };
  metrics: BenchmarkStat[];
  generatedAt: string;
}

@Component({
  selector: 'app-site-benchmark',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="benchmark-container">
      <div class="benchmark-header">
        <h4>🏆 Benchmark anonymisé</h4>
        <button class="btn btn-sm btn-secondary" (click)="loadBenchmark()" [disabled]="loading">
          {{ loading ? '...' : '↻ Actualiser' }}
        </button>
      </div>

      <div *ngIf="loading" class="benchmark-loading">
        Calcul du benchmark en cours...
      </div>

      <div *ngIf="error" class="benchmark-error">
        {{ error }}
      </div>

      <div *ngIf="!loading && !error && benchmark" class="benchmark-content">
        <div class="benchmark-info">
          <span *ngIf="benchmark.segments.sport">📍 Sport: {{ benchmark.segments.sport }}</span>
          <span *ngIf="benchmark.segments.region">📍 Région: {{ benchmark.segments.region }}</span>
          <span class="sample-size">📊 Comparé à {{ getTotalSampleSize() }} clubs similaires</span>
        </div>

        <div class="metrics-grid">
          <div *ngFor="let stat of benchmark.metrics" class="metric-card">
            <div class="metric-header">
              <span class="metric-name">{{ getMetricLabel(stat.metric) }}</span>
              <span class="metric-percentile" [class]="getPercentileClass(stat.percentile)">
                Top {{ 100 - stat.percentile }}%
              </span>
            </div>

            <div class="metric-value">
              {{ formatValue(stat.yourValue, stat.metric) }}
            </div>

            <div class="metric-comparison">
              <div class="comparison-bar">
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="stat.percentile"></div>
                  <div class="bar-marker" [style.left.%]="stat.percentile">▼</div>
                </div>
                <div class="bar-labels">
                  <span>Min: {{ formatValue(stat.min, stat.metric) }}</span>
                  <span>Moy: {{ formatValue(stat.average, stat.metric) }}</span>
                  <span>Max: {{ formatValue(stat.max, stat.metric) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="benchmark.metrics.length === 0" class="no-data">
          Pas assez de données pour générer un benchmark.
          <br>
          <small>Au moins 3 clubs similaires sont nécessaires.</small>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .benchmark-container {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1.25rem;
      margin-top: 1rem;
    }

    .benchmark-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .benchmark-header h4 {
      margin: 0;
      font-size: 1rem;
      color: #0f172a;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
    }

    .benchmark-loading, .benchmark-error {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .benchmark-error {
      color: #ef4444;
    }

    .benchmark-info {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .sample-size {
      margin-left: auto;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .metric-card {
      background: white;
      border-radius: 8px;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .metric-name {
      font-size: 0.875rem;
      color: #64748b;
    }

    .metric-percentile {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-weight: 600;
    }

    .metric-percentile.excellent {
      background: #dcfce7;
      color: #166534;
    }

    .metric-percentile.good {
      background: #fef3c7;
      color: #92400e;
    }

    .metric-percentile.average {
      background: #f1f5f9;
      color: #475569;
    }

    .metric-percentile.below {
      background: #fee2e2;
      color: #991b1b;
    }

    .metric-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.75rem;
    }

    .metric-comparison {
      margin-top: 0.5rem;
    }

    .comparison-bar {
      position: relative;
    }

    .bar-track {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      position: relative;
      margin-bottom: 0.5rem;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #ef4444, #f59e0b, #10b981);
      border-radius: 4px;
    }

    .bar-marker {
      position: absolute;
      top: -12px;
      transform: translateX(-50%);
      font-size: 0.75rem;
      color: #2563eb;
    }

    .bar-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .no-data small {
      color: #94a3b8;
    }
  `]
})
export class SiteBenchmarkComponent implements OnInit, OnChanges {
  @Input() siteId!: string;

  private readonly http = inject(HttpClient);

  benchmark: BenchmarkResult | null = null;
  loading = false;
  error: string | null = null;

  ngOnInit(): void {
    this.loadBenchmark();
  }

  ngOnChanges(): void {
    if (this.siteId) {
      this.loadBenchmark();
    }
  }

  loadBenchmark(): void {
    if (!this.siteId) return;

    this.loading = true;
    this.error = null;

    this.http.get<{ success: boolean; data: BenchmarkResult }>(
      `${environment.apiUrl}/benchmark/sites/${this.siteId}`
    ).subscribe({
      next: (response) => {
        this.benchmark = response.data;
        this.loading = false;
      },
      error: (_err) => {
        this.error = 'Impossible de charger le benchmark';
        this.loading = false;
      }
    });
  }

  getTotalSampleSize(): number {
    if (!this.benchmark?.metrics.length) return 0;
    return this.benchmark.metrics[0].sampleSize;
  }

  getMetricLabel(metric: string): string {
    const labels: Record<string, string> = {
      'sessions_per_month': 'Sessions / mois',
      'videos_per_session': 'Vidéos / session',
      'avg_session_duration': 'Durée moy. session',
      'uptime_percent': 'Disponibilité',
      'total_videos': 'Total vidéos jouées',
    };
    return labels[metric] || metric;
  }

  formatValue(value: number, metric: string): string {
    if (metric === 'avg_session_duration') {
      const hours = Math.floor(value / 60);
      const mins = Math.round(value % 60);
      return hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins}min`;
    }
    if (metric === 'uptime_percent') {
      return `${Math.round(value)}%`;
    }
    if (metric === 'videos_per_session') {
      return value.toFixed(1);
    }
    return Math.round(value).toString();
  }

  getPercentileClass(percentile: number): string {
    if (percentile >= 75) return 'excellent';
    if (percentile >= 50) return 'good';
    if (percentile >= 25) return 'average';
    return 'below';
  }
}
