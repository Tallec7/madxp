import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-fleet-health-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <div class="card card-compact fade-in">
      <div class="card-header-row clickable" (click)="healthExpanded = !healthExpanded">
        <h2>Sante flotte</h2>
        <span class="expand-icon">{{ healthExpanded ? '\u2212' : '+' }}</span>
      </div>
      <div class="health-summary">
        <div class="health-pill" [class.ok]="connectionStats.online > 0">
          <span class="pill-value">{{ connectionStats.online }}</span>
          <span class="pill-label">en ligne</span>
        </div>
        <div class="health-pill" [class.warn]="connectionStats.warning > 0">
          <span class="pill-value">{{ connectionStats.warning }}</span>
          <span class="pill-label">instables</span>
        </div>
        <div class="health-pill" [class.danger]="connectionStats.offline > 0">
          <span class="pill-value">{{ connectionStats.offline }}</span>
          <span class="pill-label">hors ligne</span>
        </div>
      </div>
      <div class="health-detail" *ngIf="healthExpanded">
        <div class="metric-row-compact">
          <span class="metric-name">CPU</span>
          <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgCpu < 50" [class.warning]="avgCpu >= 50 && avgCpu < 80" [class.danger]="avgCpu >= 80" [style.width.%]="avgCpu"></div></div>
          <span class="metric-val">{{ avgCpu | number:'1.0-0' }}%</span>
        </div>
        <div class="metric-row-compact">
          <span class="metric-name">RAM</span>
          <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgMemory < 60" [class.warning]="avgMemory >= 60 && avgMemory < 85" [class.danger]="avgMemory >= 85" [style.width.%]="avgMemory"></div></div>
          <span class="metric-val">{{ avgMemory | number:'1.0-0' }}%</span>
        </div>
        <div class="metric-row-compact">
          <span class="metric-name">Temp</span>
          <div class="metric-bar-bg"><div class="metric-bar-fill" [class.good]="avgTemperature < 60" [class.warning]="avgTemperature >= 60 && avgTemperature < 75" [class.danger]="avgTemperature >= 75" [style.width.%]="clampTemperature"></div></div>
          <span class="metric-val">{{ avgTemperature | number:'1.0-0' }}\u00B0C</span>
        </div>
      </div>
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

    .card-compact { padding: 16px 20px; }

    .card-header-row { display: flex; justify-content: space-between; align-items: center; }
    .card-header-row.clickable { cursor: pointer; }
    .expand-icon { font-size: 18px; color: #94a3b8; font-weight: 600; width: 24px; text-align: center; }

    .health-summary { display: flex; gap: 12px; margin-top: 12px; }
    .health-pill {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px; background: #f1f5f9; font-size: 13px;
    }
    .health-pill.ok { background: #ecfdf5; }
    .health-pill.ok .pill-value { color: #059669; }
    .health-pill.warn { background: #fffbeb; }
    .health-pill.warn .pill-value { color: #d97706; }
    .health-pill.danger { background: #fef2f2; }
    .health-pill.danger .pill-value { color: #dc2626; }
    .pill-value { font-weight: 700; }
    .pill-label { color: #64748b; }

    .health-detail { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }

    .metric-row-compact { display: flex; align-items: center; gap: 10px; }
    .metric-name { width: 40px; font-size: 12px; color: #64748b; font-weight: 500; }
    .metric-bar-bg { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .metric-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .metric-bar-fill.good { background: #10b981; }
    .metric-bar-fill.warning { background: #f59e0b; }
    .metric-bar-fill.danger { background: #ef4444; }
    .metric-val { width: 40px; text-align: right; font-size: 12px; font-weight: 600; color: #475569; }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    @media (max-width: 768px) {
      .health-summary { flex-wrap: wrap; }
    }
  `]
})
export class FleetHealthCardComponent {
  @Input() connectionStats: { online: number; warning: number; offline: number } = { online: 0, warning: 0, offline: 0 };
  @Input() avgCpu = 0;
  @Input() avgMemory = 0;
  @Input() avgTemperature = 0;

  healthExpanded = false;

  get clampTemperature(): number {
    return Math.min(this.avgTemperature, 100);
  }
}
