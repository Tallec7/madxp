import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PeriodChangeEvent {
  from: string;
  to: string;
}

@Component({
  selector: 'app-analytics-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="header">
      <button class="back-btn" (click)="goBack.emit()">
        ← Retour au sponsor
      </button>

      <div class="header-content">
        <div class="title-section">
          <h1>📊 Analytics - {{ sponsorName }}</h1>
          <p class="subtitle">{{ periodLabel }}</p>
        </div>

        <div class="header-actions">
          <select class="period-select" [(ngModel)]="selectedPeriod" (change)="onPeriodChange()">
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">3 mois</option>
            <option value="custom">Période personnalisée</option>
          </select>

          <button class="btn btn-secondary" (click)="exportCSV.emit()" [disabled]="exporting">
            {{ exporting ? 'Export...' : '📄 Export CSV' }}
          </button>

          <button class="btn btn-primary" (click)="downloadPDF.emit()" [disabled]="generatingPDF">
            {{ generatingPDF ? 'Génération...' : '📥 Rapport PDF' }}
          </button>
        </div>
      </div>

      <div class="custom-range" *ngIf="selectedPeriod === 'custom'">
        <div class="date-inputs">
          <div class="input-group">
            <label>Du :</label>
            <input type="date" [(ngModel)]="customFrom" (change)="emitPeriodChanged()"/>
          </div>
          <div class="input-group">
            <label>Au :</label>
            <input type="date" [(ngModel)]="customTo" (change)="emitPeriodChanged()"/>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.95rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
      transition: color 0.2s;
    }

    .back-btn:hover {
      color: #111827;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
      margin-bottom: 1rem;
    }

    .title-section h1 {
      margin: 0 0 0.25rem 0;
      font-size: 2rem;
      color: #111827;
    }

    .subtitle {
      margin: 0;
      color: #6b7280;
      font-size: 0.95rem;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .period-select {
      padding: 0.625rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
      background: white;
      cursor: pointer;
    }

    .custom-range {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
    }

    .date-inputs {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }

    .input-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .input-group label {
      font-size: 0.9rem;
      color: #6b7280;
      font-weight: 500;
    }

    .input-group input[type="date"] {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.9rem;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .header-content {
        flex-direction: column;
      }

      .header-actions {
        flex-wrap: wrap;
        width: 100%;
      }

      .period-select, .btn {
        flex: 1;
      }
    }
  `]
})
export class AnalyticsFiltersComponent {
  @Input() sponsorName = '';
  @Input() periodLabel = '';
  @Input() exporting = false;
  @Input() generatingPDF = false;

  @Output() periodChanged = new EventEmitter<PeriodChangeEvent>();
  @Output() exportCSV = new EventEmitter<void>();
  @Output() downloadPDF = new EventEmitter<void>();
  @Output() goBack = new EventEmitter<void>();

  selectedPeriod = '30';
  customFrom = '';
  customTo = '';

  onPeriodChange(): void {
    if (this.selectedPeriod !== 'custom') {
      this.emitPeriodChanged();
    }
  }

  emitPeriodChanged(): void {
    const { from, to } = this.getDateRange();
    this.periodChanged.emit({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    });
  }

  getDateRange(): { from: Date; to: Date } {
    const to = new Date();
    let from = new Date();

    if (this.selectedPeriod === 'custom') {
      if (this.customFrom && this.customTo) {
        from = new Date(this.customFrom);
        to.setTime(new Date(this.customTo).getTime());
      }
    } else {
      const days = parseInt(this.selectedPeriod);
      from.setDate(to.getDate() - days);
    }

    return { from, to };
  }
}
