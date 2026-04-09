import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChartDisplayKpiService {
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  calculatePercentage(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
  }

  getRenewalScoreClass(score: number): string {
    if (score >= 0.7) return 'renewal-green';
    if (score >= 0.4) return 'renewal-yellow';
    return 'renewal-red';
  }

  getRenewalScoreIcon(score: number): string {
    if (score >= 0.7) return '🟢';
    if (score >= 0.4) return '🟡';
    return '🔴';
  }

  getRenewalScoreLabel(score: number): string {
    if (score >= 0.7) return 'Excellent';
    if (score >= 0.4) return 'Moyen';
    return 'A risque';
  }

  getRenewalBadgeClass(score: number): string {
    if (score >= 0.7) return 'badge-green';
    if (score >= 0.4) return 'badge-yellow';
    return 'badge-red';
  }
}
