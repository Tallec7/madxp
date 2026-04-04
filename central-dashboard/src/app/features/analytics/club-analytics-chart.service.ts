import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

export interface DailyBreakdown {
  date: string;
  plays: number;
}

@Injectable({ providedIn: 'root' })
export class ClubAnalyticsChartService {

  renderDailyChart(canvas: HTMLCanvasElement, breakdown: DailyBreakdown[]): Chart {
    const labels = breakdown.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Lectures',
          data: breakdown.map(d => d.plays),
          backgroundColor: '#2563eb',
          borderRadius: 4,
          maxBarThickness: 32,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} lectures`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } }
        }
      }
    };

    return new Chart(canvas, config);
  }

  destroyChart(chart: Chart | null): void {
    chart?.destroy();
  }
}
