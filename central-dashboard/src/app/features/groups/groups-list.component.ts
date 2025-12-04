import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { GroupsService } from '../../core/services/groups.service';
import { SitesService } from '../../core/services/sites.service';
import { Group, Site } from '../../core/models';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Groupes ({{ (groups$ | async)?.length || 0 }})</h1>
        <button class="btn btn-primary" (click)="showCreateModal = true">+ Nouveau groupe</button>
      </div>

      <div class="filters">
        <input
          type="text"
          placeholder="Rechercher par nom..."
          [(ngModel)]="searchTerm"
          (ngModelChange)="applyFilters()"
          class="search-input"
        />
        <select [(ngModel)]="typeFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les types</option>
          <option value="sport">Sport</option>
          <option value="geography">Géographie</option>
          <option value="version">Version</option>
          <option value="custom">Personnalisé</option>
        </select>
        <button class="btn btn-secondary" (click)="clearFilters()" *ngIf="hasActiveFilters()">
          Effacer les filtres
        </button>
      </div>

      <div class="groups-grid" *ngIf="(groups$ | async)?.length else emptyState">
        <div *ngFor="let group of groups$ | async" class="group-card card">
          <div class="group-header">
            <div class="group-title">
              <span class="group-icon">{{ getTypeIcon(group.type) }}</span>
              <h3>{{ group.name }}</h3>
            </div>
            <span class="badge" [class]="'badge-' + getTypeBadge(group.type)">
              {{ getTypeLabel(group.type) }}
            </span>
          </div>

          <p class="group-description" *ngIf="group.description">{{ group.description }}</p>

          <div class="group-stats">
            <div class="stat-item">
              <span class="stat-icon">🖥️</span>
              <span class="stat-value">{{ group.site_count || 0 }}</span>
              <span class="stat-label">Sites</span>
            </div>
            <div class="stat-item" *ngIf="group.metadata?.region">
              <span class="stat-icon">📍</span>
              <span class="stat-value">{{ group.metadata.region }}</span>
              <span class="stat-label">Région</span>
            </div>
            <div class="stat-item" *ngIf="group.metadata?.sport">
              <span class="stat-icon">⚽</span>
              <span class="stat-value">{{ group.metadata.sport }}</span>
              <span class="stat-label">Sport</span>
            </div>
          </div>

          <div class="group-footer">
            <span class="group-date">{{ formatDate(group.created_at) }}</span>
            <div class="group-actions">
              <button
                class="btn-icon"
                [routerLink]="['/groups', group.id]"
                title="Voir les détails"
              >
                👁️
              </button>
              <button
                class="btn-icon"
                (click)="editGroup(group)"
                title="Éditer"
              >
                ✏️
              </button>
              <button
                class="btn-icon btn-danger"
                (click)="deleteGroup(group)"
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
          <div class="empty-icon">👥</div>
          <h3>Aucun groupe trouvé</h3>
          <p *ngIf="hasActiveFilters()">Aucun groupe ne correspond à vos critères de recherche.</p>
          <p *ngIf="!hasActiveFilters()">Commencez par créer votre premier groupe pour organiser vos sites.</p>
          <button class="btn btn-primary" (click)="showCreateModal = true">+ Créer un groupe</button>
        </div>
      </ng-template>

      <!-- Modal Create/Edit Group -->
      <div class="modal" *ngIf="showCreateModal || showEditModal" (click)="closeModals()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ showEditModal ? 'Modifier le groupe' : 'Nouveau groupe' }}</h2>
            <button class="modal-close" (click)="closeModals()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du groupe *</label>
              <input type="text" [(ngModel)]="groupForm.name" placeholder="Ex: Clubs de football">
            </div>
            <div class="form-group">
              <label>Type *</label>
              <select [(ngModel)]="groupForm.type">
                <option value="sport">Sport</option>
                <option value="geography">Géographie</option>
                <option value="version">Version</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea
                [(ngModel)]="groupForm.description"
                placeholder="Description du groupe..."
                rows="3"
              ></textarea>
            </div>

            <!-- Metadata fields based on type -->
            <div class="form-group" *ngIf="groupForm.type === 'sport'">
              <label>Sport</label>
              <input type="text" [(ngModel)]="groupForm.metadata.sport" placeholder="Ex: Football">
            </div>
            <div class="form-group" *ngIf="groupForm.type === 'geography'">
              <label>Région</label>
              <input type="text" [(ngModel)]="groupForm.metadata.region" placeholder="Ex: Bretagne">
            </div>
            <div class="form-group" *ngIf="groupForm.type === 'version'">
              <label>Version cible</label>
              <input type="text" [(ngModel)]="groupForm.metadata.target_version" placeholder="Ex: 2.1.0">
            </div>

            <!-- Site selection -->
            <div class="form-group">
              <label>Sites ({{ selectedSiteIds.length }} sélectionnés)</label>
              <div class="sites-selector">
                <div class="site-checkbox" *ngFor="let site of availableSites">
                  <input
                    type="checkbox"
                    [id]="'site-' + site.id"
                    [checked]="isSiteSelected(site.id)"
                    (change)="toggleSite(site.id)"
                  />
                  <label [for]="'site-' + site.id">
                    <span class="site-status" [class]="'status-' + site.status">●</span>
                    {{ site.club_name }} - {{ site.site_name }}
                    <span class="site-location">{{ site.location?.city }}</span>
                  </label>
                </div>
                <div *ngIf="availableSites.length === 0" class="empty-sites">
                  Aucun site disponible. Créez d'abord des sites.
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModals()">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="showEditModal ? updateGroup() : createGroup()"
              [disabled]="!isFormValid()"
            >
              {{ showEditModal ? 'Mettre à jour' : 'Créer' }}
            </button>
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

    .groups-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .group-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .group-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .group-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1;
      min-width: 0;
    }

    .group-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .group-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .group-description {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .group-stats {
      display: flex;
      gap: 1.5rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      flex-wrap: wrap;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      min-width: 80px;
    }

    .stat-icon {
      font-size: 1.25rem;
    }

    .stat-value {
      font-size: 1.125rem;
      font-weight: 600;
      color: #0f172a;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #64748b;
    }

    .group-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      margin-top: auto;
    }

    .group-date {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .group-actions {
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
      max-width: 600px;
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

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .sites-selector {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.5rem;
    }

    .site-checkbox {
      display: flex;
      align-items: center;
      padding: 0.5rem;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .site-checkbox:hover {
      background: #f8fafc;
    }

    .site-checkbox input[type="checkbox"] {
      width: auto;
      margin-right: 0.75rem;
      cursor: pointer;
    }

    .site-checkbox label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      margin: 0;
      font-weight: 400;
      flex: 1;
    }

    .site-status {
      font-size: 0.75rem;
    }

    .status-online { color: #10b981; }
    .status-offline { color: #94a3b8; }
    .status-error { color: #ef4444; }
    .status-maintenance { color: #f59e0b; }

    .site-location {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-left: auto;
    }

    .empty-sites {
      text-align: center;
      padding: 2rem;
      color: #94a3b8;
      font-size: 0.875rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    @media (max-width: 768px) {
      .groups-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
      }

      .search-input {
        width: 100%;
      }

      .group-stats {
        gap: 1rem;
      }

      .stat-item {
        min-width: 60px;
      }
    }
  `]
})
export class GroupsListComponent implements OnInit {
  groups$ = this.groupsService.groups$;
  availableSites: Site[] = [];
  searchTerm = '';
  typeFilter = '';
  showCreateModal = false;
  showEditModal = false;
  editingGroupId: string | null = null;

  groupForm = {
    name: '',
    type: 'sport' as 'sport' | 'geography' | 'version' | 'custom',
    description: '',
    metadata: {} as Record<string, any>
  };

  selectedSiteIds: string[] = [];

  constructor(
    private groupsService: GroupsService,
    private sitesService: SitesService
  ) {}

  ngOnInit(): void {
    this.loadGroups();
    this.loadAvailableSites();
  }

  loadGroups(): void {
    this.groupsService.loadGroups().subscribe();
  }

  loadAvailableSites(): void {
    this.sitesService.loadSites().subscribe(response => {
      this.availableSites = response.sites;
    });
  }

  applyFilters(): void {
    const filters: any = {};
    if (this.searchTerm) filters.search = this.searchTerm;
    if (this.typeFilter) filters.type = this.typeFilter;

    this.groupsService.loadGroups(filters).subscribe();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.typeFilter = '';
    this.loadGroups();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.typeFilter);
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      sport: '⚽',
      geography: '📍',
      version: '🔄',
      custom: '⚙️'
    };
    return icons[type] || '👥';
  }

  getTypeBadge(type: string): string {
    const badges: Record<string, string> = {
      sport: 'primary',
      geography: 'success',
      version: 'warning',
      custom: 'secondary'
    };
    return badges[type] || 'secondary';
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      sport: 'Sport',
      geography: 'Géographie',
      version: 'Version',
      custom: 'Personnalisé'
    };
    return labels[type] || type;
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  isSiteSelected(siteId: string): boolean {
    return this.selectedSiteIds.includes(siteId);
  }

  toggleSite(siteId: string): void {
    const index = this.selectedSiteIds.indexOf(siteId);
    if (index === -1) {
      this.selectedSiteIds.push(siteId);
    } else {
      this.selectedSiteIds.splice(index, 1);
    }
  }

  isFormValid(): boolean {
    return !!(this.groupForm.name && this.groupForm.type);
  }

  createGroup(): void {
    if (!this.isFormValid()) return;

    const groupData = {
      name: this.groupForm.name,
      type: this.groupForm.type,
      description: this.groupForm.description || undefined,
      metadata: Object.keys(this.groupForm.metadata).length > 0 ? this.groupForm.metadata : undefined,
      site_ids: this.selectedSiteIds.length > 0 ? this.selectedSiteIds : undefined
    };

    this.groupsService.createGroup(groupData).subscribe({
      next: () => {
        this.closeModals();
        this.loadGroups();
        this.resetForm();
      },
      error: (error) => {
        alert('Erreur lors de la création du groupe: ' + (error.error?.error || error.message));
      }
    });
  }

  editGroup(group: Group): void {
    this.editingGroupId = group.id;
    this.groupForm = {
      name: group.name,
      type: group.type,
      description: group.description || '',
      metadata: { ...group.metadata } || {}
    };

    // Load current sites for this group
    this.groupsService.loadGroup(group.id).subscribe({
      next: (groupDetail) => {
        this.selectedSiteIds = groupDetail.sites?.map(s => s.id) || [];
        this.showEditModal = true;
      },
      error: (error) => {
        alert('Erreur lors du chargement du groupe: ' + (error.error?.error || error.message));
      }
    });
  }

  updateGroup(): void {
    if (!this.isFormValid() || !this.editingGroupId) return;

    const groupData = {
      name: this.groupForm.name,
      type: this.groupForm.type,
      description: this.groupForm.description || undefined,
      metadata: Object.keys(this.groupForm.metadata).length > 0 ? this.groupForm.metadata : undefined,
      site_ids: this.selectedSiteIds
    };

    this.groupsService.updateGroup(this.editingGroupId, groupData).subscribe({
      next: () => {
        this.closeModals();
        this.loadGroups();
        this.resetForm();
      },
      error: (error) => {
        alert('Erreur lors de la mise à jour du groupe: ' + (error.error?.error || error.message));
      }
    });
  }

  deleteGroup(group: Group): void {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le groupe "${group.name}" ?`)) {
      this.groupsService.deleteGroup(group.id).subscribe({
        next: () => {
          this.loadGroups();
        },
        error: (error) => {
          alert('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  closeModals(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.editingGroupId = null;
  }

  resetForm(): void {
    this.groupForm = {
      name: '',
      type: 'sport',
      description: '',
      metadata: {}
    };
    this.selectedSiteIds = [];
  }
}
