import { Injectable } from '@angular/core';
import { FleetGrowthEntry } from '../../core/services/analytics.service';

export interface FleetGrowthWithCumulative extends FleetGrowthEntry {
  cumulative: number;
}

@Injectable({ providedIn: 'root' })
export class TractionDataService {

  /** Calcule la retention moyenne toutes cohortes confondues */
  calculateAverageRetention(cohorts: Array<{ retention_pct: string }> | undefined): string {
    if (!cohorts?.length) return '0';
    const total = cohorts.reduce((acc, c) => acc + parseFloat(c.retention_pct || '0'), 0);
    return (total / cohorts.length).toFixed(0);
  }

  /** Calcule le cumule pour la croissance flotte */
  computeFleetGrowthWithCumulative(entries: FleetGrowthEntry[] | undefined): FleetGrowthWithCumulative[] {
    let cumulative = 0;
    return (entries || []).map(row => {
      cumulative += parseInt(row.new_sites, 10) || 0;
      return { ...row, cumulative };
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
}
