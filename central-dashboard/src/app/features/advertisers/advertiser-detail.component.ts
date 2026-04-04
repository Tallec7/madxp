import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { Sponsor, SponsorVideo, AssignedSite } from './advertiser-detail.models';
import { AdvertiserDetailDataService, SponsorQuickStats } from './advertiser-detail-data.service';
import { AdvertiserModalService } from './advertiser-modal.service';
import { AdvertiserFormService } from './advertiser-form.service';
import { SponsorInfoTabComponent } from './sponsor-info-tab.component';
import { SponsorQuickStatsComponent } from './sponsor-quick-stats.component';
import { SponsorEditModalComponent } from './sponsor-edit-modal.component';
import { SponsorDeleteModalComponent } from './sponsor-delete-modal.component';
import { SponsorVideosTabComponent } from './sponsor-videos-tab.component';
import { SponsorSitesTabComponent } from './sponsor-sites-tab.component';
import { SponsorCampaignsTabComponent } from './sponsor-campaigns-tab.component';

@Component({
  selector: 'app-sponsor-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    SponsorInfoTabComponent, SponsorQuickStatsComponent,
    SponsorEditModalComponent, SponsorDeleteModalComponent,
    SponsorVideosTabComponent, SponsorSitesTabComponent, SponsorCampaignsTabComponent
  ],
  providers: [AdvertiserModalService, AdvertiserFormService],
  template: `
    <div class="sponsor-detail-container">
      <!-- Header -->
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          ← Retour aux sponsors
        </button>

        <div class="header-content" *ngIf="sponsor">
          <div class="sponsor-header">
            <img
              *ngIf="sponsor.logo_url"
              [src]="sponsor.logo_url"
              [alt]="sponsor.name"
              class="sponsor-logo-large"
              (error)="onLogoError($event)"
            />
            <div class="sponsor-info">
              <h1>{{ sponsor.name }}</h1>
              <span class="status-badge" [class]="'status-' + sponsor.status">
                {{ getStatusLabel(sponsor.status) }}
              </span>
            </div>
          </div>

          <div class="header-actions">
            <button class="btn btn-secondary" (click)="editSponsor()">
              Editer
            </button>
            <button class="btn btn-danger" (click)="confirmDelete()">
              Supprimer
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="tabs-nav">
        <button class="tab-btn" [class.active]="activeTab === 'info'" (click)="activeTab = 'info'">
          Informations
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'videos'" (click)="activeTab = 'videos'">
          Vidéos ({{ sponsorVideos.length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'analytics'" (click)="activeTab = 'analytics'">
          Analytics
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'sites'" (click)="activeTab = 'sites'">
          Sites ({{ assignedSites.length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'campaigns'" (click)="activeTab = 'campaigns'">
          Campagnes
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-message">
        <p>{{ error }}</p>
        <button class="btn btn-primary" (click)="loadSponsorData()">Réessayer</button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content" *ngIf="!loading && !error && sponsor">
        <app-sponsor-info-tab
          *ngIf="activeTab === 'info'"
          [sponsor]="sponsor"
        ></app-sponsor-info-tab>

        <app-sponsor-videos-tab
          *ngIf="activeTab === 'videos'"
          [sponsorId]="sponsorId"
          [sponsorVideos]="sponsorVideos"
          (videosChanged)="sponsorVideos = $event"
        ></app-sponsor-videos-tab>

        <app-sponsor-quick-stats
          *ngIf="activeTab === 'analytics'"
          [quickStats]="quickStats"
          (navigateToAnalytics)="navigateToAnalytics()"
        ></app-sponsor-quick-stats>

        <app-sponsor-sites-tab
          *ngIf="activeTab === 'sites'"
          [sponsorId]="sponsorId"
          (sitesLoaded)="assignedSites = $event"
        ></app-sponsor-sites-tab>

        <app-sponsor-campaigns-tab
          *ngIf="activeTab === 'campaigns'"
          [sponsorId]="sponsorId"
          [sponsorVideos]="sponsorVideos"
          [assignedSites]="assignedSites"
        ></app-sponsor-campaigns-tab>
      </div>

      <!-- Edit Modal -->
      <app-sponsor-edit-modal
        [sponsor]="sponsor"
        [visible]="modalService.showEditModal()"
        [saving]="formService.saving()"
        (save)="saveEdit($event)"
        (closeModal)="closeEditModal()"
      ></app-sponsor-edit-modal>

      <!-- Delete Confirmation Modal -->
      <app-sponsor-delete-modal
        [sponsorName]="sponsor?.name || ''"
        [visible]="modalService.showDeleteModal()"
        [deleting]="formService.deleting()"
        (confirm)="deleteSponsor()"
        (closeModal)="closeDeleteModal()"
      ></app-sponsor-delete-modal>
    </div>
  `,
  styles: [`
    .sponsor-detail-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

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
    }

    .sponsor-header {
      display: flex;
      gap: 1.5rem;
      align-items: center;
      flex: 1;
    }

    .sponsor-logo-large {
      width: 100px;
      height: 100px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 0.5rem;
      background: white;
    }

    .sponsor-info h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
      color: #111827;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 2rem;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 1rem 1.5rem;
      cursor: pointer;
      font-size: 0.95rem;
      color: #6b7280;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      margin-bottom: -2px;
    }

    .tab-btn:hover {
      color: #111827;
      background: #f9fafb;
    }

    .tab-btn.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      font-weight: 500;
    }

    .tab-content {
      min-height: 400px;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status-active {
      background: #d1fae5;
      color: #065f46;
    }

    .status-paused {
      background: #fef3c7;
      color: #92400e;
    }

    .status-inactive {
      background: #f3f4f6;
      color: #6b7280;
    }

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

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .loading, .error-message {
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

    .error-message {
      color: #ef4444;
    }

    @media (max-width: 768px) {
      .sponsor-detail-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
      }
    }
  `]
})
export class SponsorDetailComponent implements OnInit {
  sponsorId = '';
  sponsor: Sponsor | null = null;
  sponsorVideos: SponsorVideo[] = [];
  assignedSites: AssignedSite[] = [];
  quickStats: SponsorQuickStats | null = null;

  activeTab: 'info' | 'videos' | 'analytics' | 'sites' | 'campaigns' = 'info';
  loading = false;
  error = '';

  private readonly dataService = inject(AdvertiserDetailDataService);
  readonly modalService = inject(AdvertiserModalService);
  readonly formService = inject(AdvertiserFormService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadSponsorData();
  }

  loadSponsorData() {
    this.loading = true;
    this.error = '';

    this.dataService.loadSponsorWithRelations(this.sponsorId).subscribe({
      next: (result) => {
        this.sponsor = result.sponsor;
        this.sponsorVideos = result.videos;
        this.quickStats = result.quickStats;
        this.loading = false;
      },
      error: () => {
        this.error = 'Sponsor non trouvé';
        this.notification.error('Erreur lors du chargement des données');
        this.loading = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/advertisers']);
  }

  navigateToAnalytics() {
    this.router.navigate(['/advertisers', this.sponsorId, 'analytics']);
  }

  editSponsor() {
    this.formService.initFromSponsor(this.sponsor!);
    this.modalService.openEditModal();
  }

  closeEditModal() {
    this.modalService.closeEditModal();
    this.formService.resetForm();
  }

  saveEdit(formData: Partial<Sponsor>) {
    this.formService.saving.set(true);

    this.dataService.updateSponsor(this.sponsorId, formData).subscribe({
      next: (sponsor) => {
        this.sponsor = sponsor;
        this.notification.success('Sponsor modifié avec succès');
        this.closeEditModal();
      },
      error: () => {
        this.notification.error('Erreur lors de la sauvegarde');
        this.formService.saving.set(false);
      },
      complete: () => {
        this.formService.saving.set(false);
      }
    });
  }

  confirmDelete() {
    this.modalService.openDeleteModal();
  }

  closeDeleteModal() {
    this.modalService.closeDeleteModal();
  }

  deleteSponsor() {
    this.formService.deleting.set(true);

    this.dataService.deleteSponsor(this.sponsorId).subscribe({
      next: () => {
        this.notification.success('Sponsor supprimé avec succès');
        this.router.navigate(['/advertisers']);
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
      },
      complete: () => {
        this.formService.deleting.set(false);
      }
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Actif',
      paused: 'En pause',
      inactive: 'Inactif'
    };
    return labels[status] || status;
  }

  onLogoError(event: Event) {
    (event.target as HTMLImageElement).src = '/assets/placeholder-logo.png';
  }
}
