/**
 * Advertiser Health Component (F-AUD-07)
 *
 * Displays a health matrix of Advertisers x Clubs with color-coded status.
 * Allows operators to see at a glance which advertiser/club pairs are in danger.
 */

import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SponsorAlertService, SponsorHealthEntry, SponsorHealthMatrix, SponsorHealthStatus } from '../../core/services/sponsor-alert.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';

@Component({
  selector: 'app-advertiser-health',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  template: `
    <div class="health-container">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <h1>Sante Annonceurs</h1>
          <p class="subtitle">Matrice de sante des impressions par annonceur et club</p>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-secondary"
            (click)="triggerCheck()"
            *ngIf="isAdmin"
            [disabled]="checkRunning"
          >
            {{ checkRunning ? 'Verification...' : 'Verifier alertes' }}
          </button>
          <button class="btn btn-outline" (click)="refresh()">
            Rafraichir
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-cards" *ngIf="matrix">
        <div class="summary-card">
          <div class="card-value">{{ matrix.summary.total }}</div>
          <div class="card-label">Paires total</div>
        </div>
        <div class="summary-card healthy">
          <div class="card-value">{{ matrix.summary.healthy }}</div>
          <div class="card-label">En bonne sante</div>
        </div>
        <div class="summary-card warning">
          <div class="card-value">{{ matrix.summary.warning }}</div>
          <div class="card-label">Attention</div>
        </div>
        <div class="summary-card critical">
          <div class="card-value">{{ matrix.summary.critical }}</div>
          <div class="card-label">Critique</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters">
        <input
          type="text"
          [placeholder]="'sponsors.searchAdvertiserOrClub' | translate"
          [(ngModel)]="searchTerm"
          (input)="applyFilters()"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (change)="applyFilters()" class="status-filter">
          <option value="">Tous les statuts</option>
          <option value="healthy">En bonne sante</option>
          <option value="warning">Attention</option>
          <option value="critical">Critique</option>
        </select>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement de la matrice de sante...</p>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && filteredEntries.length === 0 && matrix" class="empty-state">
        <div class="icon-large">&#9989;</div>
        <h2>Aucune paire trouvee</h2>
        <p *ngIf="searchTerm || statusFilter">Modifiez vos filtres pour voir plus de resultats.</p>
        <p *ngIf="!searchTerm && !statusFilter">Aucune association annonceur/club n'est configuree.</p>
      </div>

      <!-- Health Matrix Table -->
      <div *ngIf="!loading && filteredEntries.length > 0" class="matrix-table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="col-status">Statut</th>
              <th class="col-advertiser" (click)="sortBy('advertiserName')">
                Annonceur
                <span class="sort-arrow" *ngIf="sortField === 'advertiserName'">
                  {{ sortDirection === 'asc' ? '&#9650;' : '&#9660;' }}
                </span>
              </th>
              <th class="col-club" (click)="sortBy('clubName')">
                Club
                <span class="sort-arrow" *ngIf="sortField === 'clubName'">
                  {{ sortDirection === 'asc' ? '&#9650;' : '&#9660;' }}
                </span>
              </th>
              <th class="col-impressions" (click)="sortBy('impressionsLast7d')">
                7 derniers jours
                <span class="sort-arrow" *ngIf="sortField === 'impressionsLast7d'">
                  {{ sortDirection === 'asc' ? '&#9650;' : '&#9660;' }}
                </span>
              </th>
              <th class="col-impressions" (click)="sortBy('impressionsLast30d')">
                30 derniers jours
                <span class="sort-arrow" *ngIf="sortField === 'impressionsLast30d'">
                  {{ sortDirection === 'asc' ? '&#9650;' : '&#9660;' }}
                </span>
              </th>
              <th class="col-avg">Moy. / jour (7j)</th>
              <th class="col-last">Derniere impression</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let entry of filteredEntries; trackBy: trackEntry"
              class="matrix-row"
              [class.row-healthy]="entry.status === 'healthy'"
              [class.row-warning]="entry.status === 'warning'"
              [class.row-critical]="entry.status === 'critical'"
              (click)="navigateToAdvertiser(entry.advertiserId)"
            >
              <td class="col-status">
                <span class="status-badge" [class]="'badge-' + entry.status">
                  {{ getStatusLabel(entry.status) }}
                </span>
              </td>
              <td class="col-advertiser">{{ entry.advertiserName }}</td>
              <td class="col-club">{{ entry.clubName }}</td>
              <td class="col-impressions">{{ entry.impressionsLast7d }}</td>
              <td class="col-impressions">{{ entry.impressionsLast30d }}</td>
              <td class="col-avg">{{ entry.avgDailyImpressions7d }}</td>
              <td class="col-last">
                <span *ngIf="entry.lastImpressionAt">
                  {{ formatDate(entry.lastImpressionAt) }}
                  <span class="days-ago" *ngIf="entry.daysSinceLastImpression !== null">
                    (il y a {{ entry.daysSinceLastImpression }}j)
                  </span>
                </span>
                <span *ngIf="!entry.lastImpressionAt" class="no-data">Jamais</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Last refresh -->
      <div class="footer" *ngIf="matrix">
        <span class="refresh-info">
          Derniere mise a jour : {{ matrix.generatedAt | date:'dd/MM/yyyy HH:mm:ss' }}
        </span>
        <span class="auto-refresh-info">
          Rafraichissement automatique toutes les 60 secondes
        </span>
      </div>
    </div>
  `,
  styles: [`
    .health-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
    }

    .subtitle {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0.25rem 0 0;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Summary Cards */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      background: white;
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #94a3b8;
    }

    .summary-card.healthy { border-left-color: #22c55e; }
    .summary-card.warning { border-left-color: #f59e0b; }
    .summary-card.critical { border-left-color: #ef4444; }

    .card-value {
      font-size: 2rem;
      font-weight: 700;
      color: #1e293b;
    }

    .card-label {
      font-size: 0.8125rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    /* Filters */
    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .search-input {
      flex: 1;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: #2022E9;
    }

    .status-filter {
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: white;
      min-width: 180px;
    }

    /* Loading */
    .loading {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #2022E9;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 3rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .icon-large {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .empty-state h2 {
      font-size: 1.25rem;
      color: #1e293b;
      margin-bottom: 0.5rem;
    }

    .empty-state p {
      color: #64748b;
      font-size: 0.875rem;
    }

    /* Matrix Table */
    .matrix-table-wrapper {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      overflow-x: auto;
    }

    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .matrix-table thead th {
      background: #f8fafc;
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }

    .matrix-table thead th:hover {
      background: #f1f5f9;
    }

    .sort-arrow {
      font-size: 0.625rem;
      margin-left: 0.25rem;
    }

    .matrix-row {
      cursor: pointer;
      transition: background-color 0.15s;
    }

    .matrix-row:hover {
      background: #f8fafc;
    }

    .matrix-row td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .row-critical {
      background: #fef2f2;
    }

    .row-critical:hover {
      background: #fee2e2 !important;
    }

    .row-warning {
      background: #fffbeb;
    }

    .row-warning:hover {
      background: #fef3c7 !important;
    }

    /* Status Badge */
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-healthy {
      background: #dcfce7;
      color: #166534;
    }

    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-critical {
      background: #fee2e2;
      color: #991b1b;
    }

    /* Column widths */
    .col-status { width: 100px; }
    .col-advertiser { min-width: 150px; }
    .col-club { min-width: 150px; }
    .col-impressions { width: 120px; text-align: right; }
    .col-avg { width: 120px; text-align: right; }
    .col-last { width: 180px; }

    .matrix-table td.col-impressions,
    .matrix-table td.col-avg {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .days-ago {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .no-data {
      color: #ef4444;
      font-style: italic;
    }

    /* Footer */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding: 0.75rem 0;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn-outline {
      background: transparent;
      border: 1px solid #e2e8f0;
      color: #475569;
    }

    .btn-outline:hover {
      background: #f8fafc;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .summary-cards {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .health-container {
        padding: 1rem;
      }

      .header {
        flex-direction: column;
        gap: 1rem;
      }

      .summary-cards {
        grid-template-columns: 1fr 1fr;
      }

      .filters {
        flex-direction: column;
      }
    }
  `]
})
export class AdvertiserHealthComponent implements OnInit, OnDestroy {
  private readonly sponsorAlertService = inject(SponsorAlertService);
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly loggerService = inject(LoggerService);
  private readonly router = inject(Router);

  matrix: SponsorHealthMatrix | null = null;
  filteredEntries: SponsorHealthEntry[] = [];
  loading = true;
  checkRunning = false;
  isAdmin = false;

  // Filters
  searchTerm = '';
  statusFilter: SponsorHealthStatus | '' = '';

  // Sorting
  sortField: keyof SponsorHealthEntry = 'status';
  sortDirection: 'asc' | 'desc' = 'asc';

  private pollingSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.isAdmin = this.authService.hasRole('admin', 'super_admin');
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Start auto-refresh polling (every 60s).
   */
  private startPolling(): void {
    this.loading = true;
    this.pollingSubscription = this.sponsorAlertService.getHealthMatrixPolling(60_000)
      .subscribe({
        next: (matrix) => {
          this.matrix = matrix;
          this.loading = false;
          this.applyFilters();
        },
        error: (error) => {
          this.loading = false;
          this.loggerService.error('Failed to fetch sponsor health matrix', ErrorExtractor.extract(error));
          this.notificationService.error('Erreur lors du chargement de la matrice de sante');
        },
      });
  }

  private stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
  }

  /**
   * Manual refresh.
   */
  refresh(): void {
    this.stopPolling();
    this.startPolling();
  }

  /**
   * Admin: trigger an alert check.
   */
  triggerCheck(): void {
    this.checkRunning = true;
    this.sponsorAlertService.triggerCheck().subscribe({
      next: (result) => {
        this.checkRunning = false;
        if (result.created > 0) {
          this.notificationService.warning(
            `${result.created} nouvelle(s) alerte(s) creee(s) sur ${result.total} paires.`
          );
        } else {
          this.notificationService.success(
            `Verification terminee : aucune nouvelle alerte (${result.total} paires verifiees).`
          );
        }
        this.refresh();
      },
      error: (error) => {
        this.checkRunning = false;
        this.loggerService.error('Failed to trigger sponsor alert check', ErrorExtractor.extract(error));
        this.notificationService.error('Erreur lors de la verification des alertes');
      },
    });
  }

  /**
   * Apply text search and status filter to entries.
   */
  applyFilters(): void {
    if (!this.matrix) {
      this.filteredEntries = [];
      return;
    }

    let entries = [...this.matrix.entries];

    // Status filter
    if (this.statusFilter) {
      entries = entries.filter(e => e.status === this.statusFilter);
    }

    // Text search
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      entries = entries.filter(e =>
        e.advertiserName.toLowerCase().includes(term) ||
        e.clubName.toLowerCase().includes(term) ||
        e.siteName.toLowerCase().includes(term)
      );
    }

    // Sort
    entries.sort((a, b) => {
      const valA = a[this.sortField];
      const valB = b[this.sortField];

      // Status has custom ordering: critical > warning > healthy
      if (this.sortField === 'status') {
        const statusOrder: Record<SponsorHealthStatus, number> = { critical: 0, warning: 1, healthy: 2 };
        const diff = statusOrder[a.status] - statusOrder[b.status];
        return this.sortDirection === 'asc' ? diff : -diff;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        return this.sortDirection === 'asc' ? cmp : -cmp;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return this.sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });

    this.filteredEntries = entries;
  }

  /**
   * Toggle sort field/direction.
   */
  sortBy(field: keyof SponsorHealthEntry): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  /**
   * Navigate to advertiser analytics when clicking a row.
   */
  navigateToAdvertiser(advertiserId: string): void {
    this.router.navigate(['/advertisers', advertiserId, 'analytics']);
  }

  /**
   * Format a date string for display.
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Get a human-readable status label.
   */
  getStatusLabel(status: SponsorHealthStatus): string {
    const labels: Record<SponsorHealthStatus, string> = {
      healthy: 'OK',
      warning: 'Attention',
      critical: 'Critique',
    };
    return labels[status];
  }

  /**
   * TrackBy function for the table rows.
   */
  trackEntry(index: number, entry: SponsorHealthEntry): string {
    return `${entry.advertiserId}:${entry.siteId}`;
  }
}
