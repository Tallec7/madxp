import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SitesService } from '../../core/services/sites.service';
import { Site } from '../../core/models';

@Component({
  selector: 'app-sites-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Sites ({{ (sites$ | async)?.length || 0 }})</h1>
        <button class="btn btn-primary" (click)="showCreateModal = true">+ Nouveau site</button>
      </div>

      <div class="filters">
        <input
          type="text"
          placeholder="Rechercher par nom..."
          [(ngModel)]="searchTerm"
          (ngModelChange)="applyFilters()"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les statuts</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Erreur</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <select [(ngModel)]="regionFilter" (ngModelChange)="applyFilters()">
          <option value="">Toutes les régions</option>
          <option value="Bretagne">Bretagne</option>
          <option value="Pays de la Loire">Pays de la Loire</option>
          <option value="Normandie">Normandie</option>
          <option value="Île-de-France">Île-de-France</option>
        </select>
        <button class="btn btn-secondary" (click)="clearFilters()" *ngIf="hasActiveFilters()">
          Effacer les filtres
        </button>
      </div>

      <div class="sites-grid" *ngIf="(sites$ | async)?.length else emptyState">
        <div *ngFor="let site of sites$ | async" class="site-card card">
          <div class="site-header">
            <h3>{{ site.club_name }}</h3>
            <span class="badge" [class]="'badge-' + getStatusBadge(site.status)">
              {{ site.status }}
            </span>
          </div>

          <p class="site-name">{{ site.site_name }}</p>

          <div class="site-detail">
            <span class="detail-icon">📍</span>
            <span>{{ site.location?.city }}, {{ site.location?.region }}</span>
          </div>

          <div class="site-detail" *ngIf="site.sports && site.sports.length > 0">
            <span class="detail-icon">⚽</span>
            <span>{{ site.sports.join(', ') }}</span>
          </div>

          <div class="site-detail">
            <span class="detail-icon">🕒</span>
            <span>{{ formatLastSeen(site.last_seen_at) }}</span>
          </div>

          <div class="site-footer">
            <span class="site-version">v{{ site.software_version || 'N/A' }}</span>
            <div class="site-actions">
              <button
                class="btn-icon"
                [routerLink]="['/sites', site.id]"
                title="Voir les détails"
              >
                👁️
              </button>
              <button
                class="btn-icon"
                (click)="editSite(site)"
                title="Éditer"
              >
                ✏️
              </button>
              <button
                class="btn-icon btn-danger"
                (click)="deleteSite(site)"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>

      <ng-template #emptyState>
        <div class="empty-state card">
          <div class="empty-icon">🖥️</div>
          <h3>Aucun site trouvé</h3>
          <p *ngIf="hasActiveFilters()">Aucun site ne correspond à vos critères de recherche.</p>
          <p *ngIf="!hasActiveFilters()">Commencez par ajouter votre premier site.</p>
          <button class="btn btn-primary" (click)="showCreateModal = true">+ Ajouter un site</button>
        </div>
      </ng-template>

      <!-- Modal Create Site -->
      <div class="modal" *ngIf="showCreateModal" (click)="showCreateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Nouveau site</h2>
            <button class="modal-close" (click)="showCreateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du site</label>
              <input type="text" [(ngModel)]="newSite.site_name" placeholder="Ex: Site Rennes">
            </div>
            <div class="form-group">
              <label>Nom du club</label>
              <input type="text" [(ngModel)]="newSite.club_name" placeholder="Ex: Rennes FC">
            </div>
            <div class="form-group">
              <label>Ville</label>
              <input type="text" [(ngModel)]="newSite.location.city" placeholder="Ex: Rennes">
            </div>
            <div class="form-group">
              <label>Région</label>
              <input type="text" [(ngModel)]="newSite.location.region" placeholder="Ex: Bretagne">
            </div>
            <div class="form-group">
              <label>Sports (séparés par des virgules)</label>
              <input type="text" [(ngModel)]="sportsInput" placeholder="Ex: football, rugby">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCreateModal = false">Annuler</button>
            <button class="btn btn-primary" (click)="createSite()" [disabled]="!isValid()">Créer</button>
          </div>
        </div>
      </div>

      <!-- Modal Edit Site -->
      <div class="modal" *ngIf="showEditModal" (click)="closeEditModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Modifier le site</h2>
            <button class="modal-close" (click)="closeEditModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du site</label>
              <input type="text" [(ngModel)]="editSiteData.site_name" placeholder="Ex: Site Rennes">
            </div>
            <div class="form-group">
              <label>Nom du club</label>
              <input type="text" [(ngModel)]="editSiteData.club_name" placeholder="Ex: Rennes FC">
            </div>
            <div class="form-group">
              <label>Ville</label>
              <input type="text" [(ngModel)]="editSiteData.location.city" placeholder="Ex: Rennes">
            </div>
            <div class="form-group">
              <label>Région</label>
              <input type="text" [(ngModel)]="editSiteData.location.region" placeholder="Ex: Bretagne">
            </div>
            <div class="form-group">
              <label>Sports (séparés par des virgules)</label>
              <input type="text" [(ngModel)]="editSportsInput" placeholder="Ex: football, rugby">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeEditModal()">Annuler</button>
            <button class="btn btn-primary" (click)="saveEditSite()" [disabled]="!isEditValid()">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 2rem;
      color: #0f172a;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .search-input {
      flex: 1;
      min-width: 250px;
    }

    .filters input,
    .filters select {
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: white;
    }

    .filters input:focus,
    .filters select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .sites-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .site-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .site-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .site-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .site-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
      font-weight: 600;
    }

    .site-name {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
    }

    .site-detail {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #475569;
    }

    .detail-icon {
      width: 20px;
      text-align: center;
    }

    .site-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      margin-top: auto;
    }

    .site-version {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #f1f5f9;
      border-radius: 4px;
      color: #475569;
    }

    .site-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-icon {
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      font-size: 1.125rem;
      opacity: 0.7;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .btn-icon:hover {
      opacity: 1;
      background: #f1f5f9;
    }

    .btn-icon.btn-danger:hover {
      background: #fee2e2;
      color: #ef4444;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .empty-state p {
      color: #64748b;
      margin-bottom: 2rem;
    }

    /* Modal */
    .modal {
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
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f1f5f9;
      color: #64748b;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #334155;
    }

    .form-group input {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .form-group input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    @media (max-width: 768px) {
      .sites-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
      }

      .search-input {
        width: 100%;
      }
    }
  `]
})
export class SitesListComponent implements OnInit {
  sites$ = this.sitesService.sites$;
  searchTerm = '';
  statusFilter = '';
  regionFilter = '';
  showCreateModal = false;
  showEditModal = false;

  newSite = {
    site_name: '',
    club_name: '',
    location: {
      city: '',
      region: '',
      country: 'France'
    }
  };

  sportsInput = '';

  editingSite: Site | null = null;
  editSiteData = {
    site_name: '',
    club_name: '',
    location: {
      city: '',
      region: '',
      country: 'France'
    }
  };
  editSportsInput = '';

  constructor(private sitesService: SitesService) {}

  ngOnInit(): void {
    this.loadSites();
  }

  loadSites(): void {
    this.sitesService.loadSites().subscribe();
  }

  applyFilters(): void {
    const filters: any = {};
    if (this.searchTerm) filters.search = this.searchTerm;
    if (this.statusFilter) filters.status = this.statusFilter;
    if (this.regionFilter) filters.region = this.regionFilter;

    this.sitesService.loadSites(filters).subscribe();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.regionFilter = '';
    this.loadSites();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.statusFilter || this.regionFilter);
  }

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      online: 'success',
      offline: 'secondary',
      error: 'danger',
      maintenance: 'warning'
    };
    return badges[status] || 'secondary';
  }

  formatLastSeen(date: Date | null): string {
    if (!date) return 'Jamais vu';

    const now = new Date();
    const lastSeen = new Date(date);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return `Il y a ${Math.floor(diffMins / 1440)} jours`;
  }

  isValid(): boolean {
    return !!(this.newSite.site_name && this.newSite.club_name &&
              this.newSite.location.city && this.newSite.location.region);
  }

  createSite(): void {
    if (!this.isValid()) return;

    const siteData: any = {
      ...this.newSite,
      sports: this.sportsInput ? this.sportsInput.split(',').map(s => s.trim()) : []
    };

    this.sitesService.createSite(siteData).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.loadSites();
        this.resetForm();
      },
      error: (error) => {
        alert('Erreur lors de la création du site: ' + (error.error?.error || error.message));
      }
    });
  }

  resetForm(): void {
    this.newSite = {
      site_name: '',
      club_name: '',
      location: {
        city: '',
        region: '',
        country: 'France'
      }
    };
    this.sportsInput = '';
  }

  editSite(site: Site): void {
    this.editingSite = site;
    this.editSiteData = {
      site_name: site.site_name,
      club_name: site.club_name,
      location: {
        city: site.location?.city || '',
        region: site.location?.region || '',
        country: site.location?.country || 'France'
      }
    };
    this.editSportsInput = site.sports?.join(', ') || '';
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingSite = null;
  }

  isEditValid(): boolean {
    return !!(this.editSiteData.site_name && this.editSiteData.club_name &&
              this.editSiteData.location.city && this.editSiteData.location.region);
  }

  saveEditSite(): void {
    if (!this.editingSite || !this.isEditValid()) return;

    const siteData: any = {
      ...this.editSiteData,
      sports: this.editSportsInput ? this.editSportsInput.split(',').map(s => s.trim()) : []
    };

    this.sitesService.updateSite(this.editingSite.id, siteData).subscribe({
      next: () => {
        this.closeEditModal();
        this.loadSites();
      },
      error: (error) => {
        alert('Erreur lors de la modification du site: ' + (error.error?.error || error.message));
      }
    });
  }

  deleteSite(site: Site): void {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le site "${site.club_name}" ?`)) {
      this.sitesService.deleteSite(site.id).subscribe({
        next: () => {
          this.loadSites();
        },
        error: (error) => {
          alert('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }
}
