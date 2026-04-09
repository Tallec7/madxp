import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SiteSponsorDailyTrend } from '../../../../core/models';

Chart.register(...registerables);

@Injectable({ providedIn: 'root' })
export class SiteSponsorsChartService {
  private trendsChart: Chart | null = null;

  renderTrendsChart(canvas: HTMLCanvasElement, trends: SiteSponsorDailyTrend[]): void {
    this.destroyChart();
    if (!trends.length) return;

    const labels = trends.map(t => {
      const d = new Date(t.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const data = trends.map(t => Number(t.impressions));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Passages',
          data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    };

    this.trendsChart = new Chart(ctx, config);
  }

  destroyChart(): void {
    if (this.trendsChart) {
      this.trendsChart.destroy();
      this.trendsChart = null;
    }
  }
}
