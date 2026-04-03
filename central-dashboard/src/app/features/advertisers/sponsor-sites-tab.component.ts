import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { AssignedSite, AvailableSite } from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-sites-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="sites-tab">
      <div class="sites-header">
        <h2>Sites assignés ({{ assignedSites.length }})</h2>
        <button class="btn btn-primary" (click)="openAddSitesModal()">
          + Assigner à des clubs
        </button>
      </div>

      <div *ngIf="loadingSites" class="loading">
        <div class="spinner"></div>
        <p>Chargement des sites...</p>
      </div>

      <div *ngIf="!loadingSites && assignedSites.length === 0" class="empty-state">
        <p>Aucun club assigné à ce sponsor</p>
        <p class="empty-hint">Assignez ce sponsor à des clubs pour déployer ses vidéos automatiquement</p>
        <button class="btn btn-primary" (click)="openAddSitesModal()">
          Assigner à des clubs
        </button>
      </div>

      <div *ngIf="!loadingSites && assignedSites.length > 0" class="sites-list">
        <div class="deploy-badge">
          Déployé sur {{ assignedSites.length }} club{{ assignedSites.length > 1 ? 's' : '' }}
        </div>

        <div *ngFor="let site of assignedSites" class="site-item">
          <div class="site-info">
            <h4>{{ site.site_name }}</h4>
            <div class="site-meta">
              <span *ngIf="site.club_name">{{ site.club_name }}</span>
              <span *ngIf="site.city">{{ site.city }}</span>
              <span *ngIf="site.contract_start">{{ formatDate(site.contract_start) }} -> {{ formatDate(site.contract_end) || 'indefini' }}</span>
            </div>
            <div class="site-date">
              Assigné le {{ formatDate(site.assigned_at) }}
            </div>
          </div>
          <div class="site-actions">
            <span class="site-status-badge" [class.active]="site.is_active" [class.inactive]="!site.is_active">
              {{ site.is_active ? 'Actif' : 'Inactif' }}
            </span>
            <button
              class="btn btn-sm btn-danger"
              (click)="removeSiteAssignment(site.site_id)"
              [disabled]="removingSite === site.site_id"
            >
              {{ removingSite === site.site_id ? 'Retrait...' : 'Retirer' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Sites Modal -->
    <div class="modal-overlay" *ngIf="showAddSitesModal" (click)="closeAddSitesModal()">
      <div class="modal modal-lg" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Assigner à des clubs</h2>
          <button class="close-btn" (click)="closeAddSitesModal()">x</button>
        </div>

        <div class="modal-body">
          <!-- Search -->
          <div class="search-box">
            <input
              type="text"
              [(ngModel)]="siteSearchTerm"
              (input)="filterAvailableSites()"
              [placeholder]="'common.searchClub' | translate"
            />
          </div>

          <!-- Loading -->
          <div *ngIf="loadingAvailableSites" class="loading-small">
            <div class="spinner-small"></div>
            <span>{{ 'common.loadingClubs' | translate }}</span>
          </div>

          <!-- Available Sites List -->
          <div *ngIf="!loadingAvailableSites" class="available-videos-list">
            <div
              *ngFor="let site of filteredAvailableSites"
              class="available-video-item"
              [class.selected]="isSiteSelected(site.id)"
              (click)="toggleSiteSelection(site.id)"
            >
              <div class="checkbox">
                <input
                  type="checkbox"
                  [checked]="isSiteSelected(site.id)"
                  (change)="toggleSiteSelection(site.id)"
                  (click)="$event.stopPropagation()"
                />
              </div>
              <div class="video-details">
                <h4>{{ site.name }}</h4>
                <div class="video-meta-small">
                  <span *ngIf="site.club_name">{{ site.club_name }}</span>
                  <span *ngIf="site.city">{{ site.city }}</span>
                </div>
              </div>
            </div>

            <div *ngIf="filteredAvailableSites.length === 0" class="empty-state-small">
              <p *ngIf="siteSearchTerm">Aucun club trouvé pour "{{ siteSearchTerm }}"</p>
              <p *ngIf="!siteSearchTerm">Tous les clubs sont déjà assignés</p>
            </div>
          </div>

          <!-- Selected Count -->
          <div class="selection-info" *ngIf="selectedSiteIds.length > 0">
            {{ selectedSiteIds.length }} club(s) sélectionné(s)
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="closeAddSitesModal()">
            Annuler
          </button>
          <button
            class="btn btn-primary"
            (click)="assignSelectedSites()"
            [disabled]="selectedSiteIds.length === 0 || assigningSites"
          >
            {{ assigningSites ? 'Assignation...' : 'Assigner (' + selectedSiteIds.length + ')' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Sites Tab */
    .sites-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .sites-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .deploy-badge {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.75rem 1.25rem;
      color: #1e40af;
      font-weight: 500;
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .site-item {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: box-shadow 0.2s;
    }

    .site-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .site-info {
      flex: 1;
    }

    .site-info h4 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .site-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .site-date {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    .site-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .site-status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .site-status-badge.active {
      background: #d1fae5;
      color: #065f46;
    }

    .site-status-badge.inactive {
      background: #f3f4f6;
      color: #6b7280;
    }

    .empty-hint {
      font-size: 0.9rem;
      color: #9ca3af;
      margin-top: -0.5rem;
      margin-bottom: 1.5rem;
    }

    /* Loading */
    .loading, .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }

    .spinner {
      border: 3px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-lg {
      max-width: 700px;
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: #f3f4f6;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    /* Search */
    .search-box {
      margin-bottom: 1rem;
    }

    .search-box input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .loading-small {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: #6b7280;
    }

    .spinner-small {
      border: 2px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      animation: spin 1s linear infinite;
    }

    .available-videos-list {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .available-video-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .available-video-item:last-child {
      border-bottom: none;
    }

    .available-video-item:hover {
      background: #f9fafb;
    }

    .available-video-item.selected {
      background: #eff6ff;
    }

    .checkbox {
      display: flex;
      align-items: center;
    }

    .checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .video-details {
      flex: 1;
    }

    .video-details h4 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      color: #111827;
    }

    .video-meta-small {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: #6b7280;
    }

    .empty-state-small {
      padding: 2rem;
      text-align: center;
      color: #9ca3af;
    }

    .selection-info {
      padding: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e40af;
      font-weight: 500;
      text-align: center;
    }

    /* Buttons */
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
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

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class SponsorSitesTabComponent implements OnInit {
  @Input() sponsorId = '';
  @Output() sitesLoaded = new EventEmitter<AssignedSite[]>();

  assignedSites: AssignedSite[] = [];
  loadingSites = false;
  removingSite: string | null = null;

  // Add Sites Modal
  showAddSitesModal = false;
  availableSites: AvailableSite[] = [];
  filteredAvailableSites: AvailableSite[] = [];
  selectedSiteIds: string[] = [];
  siteSearchTerm = '';
  loadingAvailableSites = false;
  assigningSites = false;

  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);

  ngOnInit(): void {
    this.loadAssignedSites();
  }

  loadAssignedSites(): void {
    this.loadingSites = true;

    this.api.get<{ success: boolean; data: { sites: AssignedSite[] } }>(`/advertisers/${this.sponsorId}/sites`, { include_inactive: 'true' })
      .subscribe({
        next: (response) => {
          this.assignedSites = response.data?.sites || [];
          this.sitesLoaded.emit(this.assignedSites);
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des sites');
        },
        complete: () => {
          this.loadingSites = false;
        }
      });
  }

  openAddSitesModal(): void {
    this.showAddSitesModal = true;
    this.selectedSiteIds = [];
    this.siteSearchTerm = '';
    this.loadAvailableSites();
  }

  closeAddSitesModal(): void {
    this.showAddSitesModal = false;
    this.selectedSiteIds = [];
    this.siteSearchTerm = '';
    this.availableSites = [];
    this.filteredAvailableSites = [];
  }

  loadAvailableSites(): void {
    this.loadingAvailableSites = true;

    this.api.get<{ data: AvailableSite[]; pagination?: unknown }>('/sites')
      .subscribe({
        next: (response) => {
          const allSites = response.data || [];
          const assignedIds = new Set(this.assignedSites.map(s => s.site_id));
          this.availableSites = allSites.filter(s => !assignedIds.has(s.id));
          this.filterAvailableSites();
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des clubs');
        },
        complete: () => {
          this.loadingAvailableSites = false;
        }
      });
  }

  filterAvailableSites(): void {
    const term = this.siteSearchTerm.toLowerCase();
    this.filteredAvailableSites = this.availableSites.filter(site =>
      (site.name || '').toLowerCase().includes(term) ||
      (site.club_name || '').toLowerCase().includes(term) ||
      (site.city || '').toLowerCase().includes(term)
    );
  }

  isSiteSelected(siteId: string): boolean {
    return this.selectedSiteIds.includes(siteId);
  }

  toggleSiteSelection(siteId: string): void {
    const index = this.selectedSiteIds.indexOf(siteId);
    if (index === -1) {
      this.selectedSiteIds.push(siteId);
    } else {
      this.selectedSiteIds.splice(index, 1);
    }
  }

  assignSelectedSites(): void {
    if (this.selectedSiteIds.length === 0) return;

    this.assigningSites = true;

    this.api.post<{ success: boolean }>(`/advertisers/${this.sponsorId}/sites`, {
      site_ids: this.selectedSiteIds
    }).subscribe({
      next: () => {
        this.notification.success(`Sponsor assigné à ${this.selectedSiteIds.length} club(s)`);
        this.closeAddSitesModal();
        this.loadAssignedSites();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'assignation');
      },
      complete: () => {
        this.assigningSites = false;
      }
    });
  }

  async removeSiteAssignment(siteId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Retirer ce club du sponsor ? Les vidéos associées ne seront plus diffusées dans ce club.',
      { title: 'Retirer l\'assignation', confirmLabel: 'Retirer', confirmStyle: 'danger' }
    );
    if (!ok) return;

    this.removingSite = siteId;

    this.api.delete<{ success: boolean }>(`/advertisers/${this.sponsorId}/sites/${siteId}`)
      .subscribe({
        next: () => {
          this.assignedSites = this.assignedSites.filter(s => s.site_id !== siteId);
          this.sitesLoaded.emit(this.assignedSites);
          this.notification.success('Club retiré avec succès');
        },
        error: () => {
          this.notification.error('Erreur lors du retrait');
        },
        complete: () => {
          this.removingSite = null;
        }
      });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
