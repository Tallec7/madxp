import { Injectable } from '@angular/core';
import { SaasMetrics, SiteDashboard } from './club-dashboard-data.service';

export interface TrendResult {
  icon: string;
  label: string;
  cls: string;
}

@Injectable({ providedIn: 'root' })
export class ClubMetricsService {

  computeTrend(current: number, previous: number): TrendResult | null {
    if (!current && !previous) return null;
    if (previous === 0) {
      return current > 0 ? { icon: '↑', label: 'Nouveau', cls: 'trend-up' } : null;
    }
    const delta = ((current - previous) / previous) * 100;
    const rounded = Math.round(delta);
    if (Math.abs(rounded) < 3) return { icon: '→', label: 'stable', cls: 'trend-flat' };
    if (rounded > 0) return { icon: '↑', label: `+${rounded}%`, cls: 'trend-up' };
    return { icon: '↓', label: `${rounded}%`, cls: 'trend-down' };
  }

  getVideosTrend(metrics: SaasMetrics | null | undefined): TrendResult | null {
    if (!metrics || metrics.yesterdayVideosPlayed === undefined) return null;
    return this.computeTrend(metrics.todayVideosPlayed, metrics.yesterdayVideosPlayed);
  }

  getScreenTimeTrend(metrics: SaasMetrics | null | undefined): TrendResult | null {
    if (!metrics || metrics.yesterdayScreenTime === undefined) return null;
    return this.computeTrend(metrics.todayScreenTime, metrics.yesterdayScreenTime);
  }

  getCompletionTrend(metrics: SaasMetrics | null | undefined): TrendResult | null {
    if (!metrics || metrics.previousWeekCompletionRate === undefined) return null;
    const delta = metrics.weekCompletionRate - metrics.previousWeekCompletionRate;
    if (Math.abs(delta) < 2) return { icon: '→', label: 'stable', cls: 'trend-flat' };
    if (delta > 0) return { icon: '↑', label: `+${delta}pts`, cls: 'trend-up' };
    return { icon: '↓', label: `${delta}pts`, cls: 'trend-down' };
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds < 60) return `${seconds || 0}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${minutes.toString().padStart(2, '0')}`;
    return `${minutes}min`;
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  formatVideoName(filename: string): string {
    if (!filename) return '';
    const base = filename.split('/').pop() || filename;
    return base
      .replace(/\.[^.]+$/, '')
      .replace(/^\d+_/, '')
      .replace(/_/g, ' ');
  }

  formatSparklineDay(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  }

  hasSparklineData(metrics: SaasMetrics | null | undefined): boolean {
    const s = metrics?.dailySparkline;
    return !!s && s.length > 1;
  }

  getSparklineMax(metrics: SaasMetrics | null | undefined): number {
    const s = metrics?.dailySparkline || [];
    return Math.max(1, ...s.map((d) => d.videosPlayed));
  }

  getSparklinePoints(metrics: SaasMetrics | null | undefined, width: number, height: number): string {
    const series = metrics?.dailySparkline || [];
    if (series.length === 0) return '';
    const max = this.getSparklineMax(metrics);
    const pad = 4;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;
    const step = series.length > 1 ? usableW / (series.length - 1) : 0;
    return series
      .map((d, i) => {
        const x = pad + i * step;
        const y = pad + usableH - (d.videosPlayed / max) * usableH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  getSparklineArea(metrics: SaasMetrics | null | undefined, width: number, height: number): string {
    const pts = this.getSparklinePoints(metrics, width, height);
    if (!pts) return '';
    const series = metrics?.dailySparkline || [];
    const pad = 4;
    const lastX = pad + (series.length - 1) * ((width - pad * 2) / Math.max(1, series.length - 1));
    const bottomY = height - pad;
    return `${pad},${bottomY} ${pts} ${lastX.toFixed(1)},${bottomY}`;
  }

  showEmptyStateHint(dashboard: SiteDashboard | null, isSaas: boolean): boolean {
    const m = dashboard?.saasMetrics;
    if (!m) return false;
    if (isSaas) {
      return (m.connectedClients || 0) === 0 && (m.todayVideosPlayed || 0) === 0;
    }
    return (m.todayVideosPlayed || 0) === 0 && (m.weekVideosPlayed || 0) === 0;
  }
}
