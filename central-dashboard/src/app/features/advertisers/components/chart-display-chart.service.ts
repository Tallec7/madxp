import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import { DailyTrend, Distribution } from '../models/analytics.models';

Chart.register(...registerables);

@Injectable({ providedIn: 'root' })
export class ChartDisplayChartService {
  renderTrendsChart(canvas: HTMLCanvasElement, data: DailyTrend[]): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx || data.length === 0) return null;

    const labels = data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Impressions',
            data: data.map(d => d.impressions),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Vues complètes',
            data: data.map(d => d.completed_views),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                return `${context.dataset.label}: ${value !== null ? value.toLocaleString() : '0'}`;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            ticks: {
              callback: (value) => value.toLocaleString()
            }
          }
        }
      }
    };

    return new Chart(ctx, config);
  }

  renderPeriodChart(canvas: HTMLCanvasElement, data: Distribution[]): Chart | null {
    return this.renderDoughnutChart(canvas, data, [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#8b5cf6'
    ]);
  }

  renderEventChart(canvas: HTMLCanvasElement, data: Distribution[]): Chart | null {
    return this.renderDoughnutChart(canvas, data, [
      '#ef4444',
      '#3b82f6',
      '#f59e0b',
      '#6b7280'
    ]);
  }

  renderPeakHoursChart(canvas: HTMLCanvasElement, heatmap: number[]): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx || heatmap.length === 0) return null;

    const maxVal = Math.max(...heatmap, 1);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: heatmap.map((_, i) => `${i}h`),
        datasets: [{
          label: 'Impressions',
          data: heatmap,
          backgroundColor: heatmap.map(v => {
            const intensity = v / maxVal;
            if (intensity >= 0.75) return '#1d4ed8';
            if (intensity >= 0.5) return '#3b82f6';
            if (intensity >= 0.25) return '#93c5fd';
            return '#dbeafe';
          }),
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${items[0].label} - ${parseInt(items[0].label) + 1}h`,
              label: (context) => `${(context.parsed.y ?? 0).toLocaleString()} impressions`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => value.toLocaleString() }
          }
        }
      }
    };

    return new Chart(ctx, config);
  }

  private renderDoughnutChart(
    canvas: HTMLCanvasElement,
    data: Distribution[],
    colors: string[]
  ): Chart | null {
    const ctx = canvas.getContext('2d');
    if (!ctx || data.length === 0) return null;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.value),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a: number, b) => a + (b as number), 0);
                const value = context.parsed as number;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    return new Chart(ctx, config);
  }
}
