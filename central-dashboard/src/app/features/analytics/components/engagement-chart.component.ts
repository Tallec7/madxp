import { Component, Input, ViewChild, ElementRef, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { EngagementMonthlyEntry } from '../../../core/services/analytics.service';

Chart.register(...registerables);

@Component({
  selector: 'app-engagement-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card chart-card fade-in">
      <h2>Engagement mensuel</h2>
      <div class="chart-container">
        <canvas #engagementChart></canvas>
      </div>
      <p class="no-data" *ngIf="!hasData">Pas de donnees d'engagement</p>
    </div>
  `,
  styles: [`
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
    }

    .card h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b; }

    .chart-card { grid-column: 1 / -1; }
    .chart-container { height: 280px; position: relative; }

    .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `]
})
export class EngagementChartComponent implements OnChanges, OnDestroy {
  @ViewChild('engagementChart') engagementChartRef!: ElementRef<HTMLCanvasElement>;

  @Input() monthlyData: EngagementMonthlyEntry[] = [];
  @Input() hasData = false;

  private chart: Chart | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['monthlyData'] && this.monthlyData?.length) {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private renderChart(): void {
    if (!this.engagementChartRef?.nativeElement) return;
    this.chart?.destroy();

    const labels = this.monthlyData.map(m => {
      const d = new Date(m.month);
      return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Lectures',
            data: this.monthlyData.map(m => parseInt(m.plays, 10)),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Sites actifs',
            data: this.monthlyData.map(m => parseInt(m.active_sites, 10)),
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0.3,
            pointRadius: 3,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { size: 13 },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Lectures', font: { size: 11 } },
            grid: { color: '#f1f5f9' },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: { display: true, text: 'Sites actifs', font: { size: 11 } },
            grid: { display: false },
          }
        }
      }
    };

    this.chart = new Chart(this.engagementChartRef.nativeElement, config);
  }
}
