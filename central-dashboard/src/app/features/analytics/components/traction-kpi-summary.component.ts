import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TractionMetrics } from '../../../core/services/analytics.service';
import { TRACTION_SHARED_STYLES } from './traction-shared.styles';

@Component({
  selector: 'app-traction-kpi-summary',
  standalone: true,
  imports: [CommonModule],
  styles: [TRACTION_SHARED_STYLES],
  template: `
    <section class="section" *ngIf="metrics">
      <h2 class="section-title">Resume executif</h2>
      <div class="kpi-grid kpi-grid-4">

        <div class="kpi-card accent-blue">
          <div class="kpi-value">{{ metrics.overview?.total_sites || '0' }}</div>
          <div class="kpi-label">Boitiers deployes</div>
          <div class="kpi-sub" *ngIf="metrics.overview?.pct_online">
            {{ metrics.overview?.pct_online }}% en ligne
          </div>
        </div>

        <div class="kpi-card accent-green">
          <div class="kpi-value">{{ metrics.engagementTotals?.total_plays || '0' }}</div>
          <div class="kpi-label">Lectures video (total)</div>
          <div class="kpi-sub" *ngIf="metrics.engagementTotals?.sites_with_plays">
            {{ metrics.engagementTotals?.sites_with_plays }} sites actifs
          </div>
        </div>

        <div class="kpi-card accent-purple">
          <div class="kpi-value">{{ metrics.engagementTotals?.screen_time_hours || '0' }}h</div>
          <div class="kpi-label">Screen time total</div>
          <div class="kpi-sub" *ngIf="metrics.engagementTotals?.avg_completion">
            {{ metrics.engagementTotals?.avg_completion }}% completion moy.
          </div>
        </div>

        <div class="kpi-card accent-orange">
          <div class="kpi-value">{{ metrics.advertiserMetrics?.total_impressions || '0' }}</div>
          <div class="kpi-label">Impressions sponsors</div>
          <div class="kpi-sub" *ngIf="metrics.advertiserMetrics?.sites_reached">
            {{ metrics.advertiserMetrics?.sites_reached }} sites touches
          </div>
        </div>

        <div class="kpi-card accent-teal">
          <div class="kpi-value">{{ metrics.userStats?.total_users || '0' }}</div>
          <div class="kpi-label">Utilisateurs</div>
          <div class="kpi-sub" *ngIf="metrics.userStats?.active_30d">
            {{ metrics.userStats?.active_30d }} actifs (30j)
          </div>
        </div>

        <div class="kpi-card accent-pink">
          <div class="kpi-value">{{ metrics.advertiserMetrics?.active_advertisers || '0' }}</div>
          <div class="kpi-label">Annonceurs actifs</div>
          <div class="kpi-sub" *ngIf="metrics.advertiserMetrics?.active_agencies">
            {{ metrics.advertiserMetrics?.active_agencies }} agences
          </div>
        </div>

        <div class="kpi-card accent-indigo">
          <div class="kpi-value">{{ metrics.contentLibrary?.total_videos || '0' }}</div>
          <div class="kpi-label">Videos en bibliotheque</div>
          <div class="kpi-sub" *ngIf="metrics.contentLibrary?.storage_gb">
            {{ metrics.contentLibrary?.storage_gb }} Go
          </div>
        </div>

        <div class="kpi-card accent-red">
          <div class="kpi-value">{{ averageRetention }}%</div>
          <div class="kpi-label">Retention moyenne</div>
          <div class="kpi-sub">{{ metrics.retentionCohorts.length || 0 }} cohortes</div>
        </div>

      </div>
    </section>
  `
})
export class TractionKpiSummaryComponent {
  @Input() metrics!: TractionMetrics;
  @Input() averageRetention = '0';
}
