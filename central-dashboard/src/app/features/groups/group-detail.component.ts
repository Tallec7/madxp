import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GroupsService } from '../../core/services/groups.service';
import { SitesService } from '../../core/services/sites.service';
import { Group, Site } from '../../core/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container" *ngIf="group else loading">
      <div class="page-header">
        <div class="header-content">
          <a routerLink="/groups" class="back-link">← Groupes</a>
          <div class="title-row">
            <span class="group-icon">{{ getTypeIcon(group.type) }}</span>
            <h1>{{ group.name }}</h1>
            <span class="badge" [class]="'badge-' + getTypeBadge(group.type)">
              {{ getTypeLabel(group.type) }}
            </span>
          </div>
          <p class="group-description" *ngIf="group.description">{{ group.description }}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="showEditModal = true">✏️ Éditer</button>
          <button class="btn btn-danger" (click)="deleteGroup()">🗑️ Supprimer</button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon">🖥️</div>
          <div class="stat-content">
            <div class="stat-value">{{ group.sites?.length || 0 }}</div>
            <div class="stat-label">Sites dans ce groupe</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-value">{{ getOnlineSitesCount() }}</div>
            <div class="stat-label">Sites en ligne</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⚪</div>
          <div class="stat-content">
            <div class="stat-value">{{ getOfflineSitesCount() }}</div>
            <div class="stat-label">Sites hors ligne</div>
          </div>
        </div>
        <div class="stat-card" *ngIf="group.metadata">
          <div class="stat-icon">ℹ️</div>
          <div class="stat-content">
            <div class="stat-value">{{ getMetadataDisplay() }}</div>
            <div class="stat-label">Métadonnées</div>
          </div>
        </div>
      </div>

      <div class="content-grid">
        <!-- Sites list -->
        <div class="card sites-card">
          <div class="card-header">
            <h2>Sites du groupe</h2>
            <button class="btn btn-sm btn-primary" (click)="showAddSitesModal = true">
              + Ajouter des sites
            </button>
          </div>
          <div class="sites-list" *ngIf="group.sites && group.sites.length > 0 else noSites">
            <div *ngFor="let site of group.sites" class="site-item">
              <span class="site-status" [class]="'status-' + site.status">●</span>
              <div class="site-info">
                <div class="site-name">{{ site.club_name }}</div>
                <div class="site-meta">
                  <span>{{ site.location?.city }}, {{ site.location?.region }}</span>
                  <span class="separator">•</span>
                  <span>v{{ site.software_version }}</span>
                </div>
              </div>
              <div class="site-actions">
                <button
                  class="btn-icon"
                  [routerLink]="['/sites', site.id]"
                  title="Voir les détails"
                >
                  👁️
                </button>
                <button
                  class="btn-icon btn-danger"
                  (click)="removeSite(site.id)"
                  title="Retirer du groupe"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          <ng-template #noSites>
            <div class="empty-state-small">
              <p>Aucun site dans ce groupe</p>
              <button class="btn btn-sm btn-primary" (click)="showAddSitesModal = true">
                Ajouter des sites
              </button>
            </div>
          </ng-template>
        </div>

        <!-- Group actions -->
        <div class="card actions-card">
          <h2>Actions de groupe</h2>
          <div class="actions-list">
            <button class="action-btn" (click)="showDeployContentModal = true">
              <span class="action-icon">📹</span>
              <div class="action-content">
                <div class="action-title">Déployer du contenu</div>
                <div class="action-desc">Envoyer des vidéos à tous les sites</div>
              </div>
            </button>
            <button class="action-btn" (click)="showDeployUpdateModal = true">
              <span class="action-icon">🔄</span>
              <div class="action-content">
                <div class="action-title">Mettre à jour</div>
                <div class="action-desc">Déployer une mise à jour logicielle</div>
              </div>
            </button>
            <button class="action-btn" (click)="restartAllServices()">
              <span class="action-icon">⚡</span>
              <div class="action-content">
                <div class="action-title">Redémarrer les services</div>
                <div class="action-desc">Redémarrer l'app sur tous les sites</div>
              </div>
            </button>
            <button class="action-btn" (click)="rebootAllSites()">
              <span class="action-icon">🔌</span>
              <div class="action-content">
                <div class="action-title">Redémarrer les systèmes</div>
                <div class="action-desc">Redémarrer tous les Raspberry Pi</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Metadata card -->
      <div class="card metadata-card" *ngIf="group.metadata && Object.keys(group.metadata).length > 0">
        <h2>Métadonnées du groupe</h2>
        <div class="metadata-grid">
          <div class="metadata-item" *ngFor="let key of getMetadataKeys()">
            <div class="metadata-key">{{ formatMetadataKey(key) }}</div>
            <div class="metadata-value">{{ group.metadata![key] }}</div>
          </div>
        </div>
      </div>

      <!-- Modal: Edit Group -->
      <div class="modal" *ngIf="showEditModal" (click)="showEditModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Modifier le groupe</h2>
            <button class="modal-close" (click)="showEditModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nom du groupe *</label>
              <input type="text" [(ngModel)]="editForm.name">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea [(ngModel)]="editForm.description" rows="3"></textarea>
            </div>
            <div class="form-group" *ngIf="group.type === 'sport'">
              <label>Sport</label>
              <input type="text" [(ngModel)]="editForm.metadata.sport">
            </div>
            <div class="form-group" *ngIf="group.type === 'geography'">
              <label>Région</label>
              <input type="text" [(ngModel)]="editForm.metadata.region">
            </div>
            <div class="form-group" *ngIf="group.type === 'version'">
              <label>Version cible</label>
              <input type="text" [(ngModel)]="editForm.metadata.target_version">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showEditModal = false">Annuler</button>
            <button class="btn btn-primary" (click)="updateGroup()">Mettre à jour</button>
          </div>
        </div>
      </div>

      <!-- Modal: Add Sites -->
      <div class="modal" *ngIf="showAddSitesModal" (click)="showAddSitesModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Ajouter des sites au groupe</h2>
            <button class="modal-close" (click)="showAddSitesModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="sites-selector">
              <div class="site-checkbox" *ngFor="let site of availableSitesForAdding()">
                <input
                  type="checkbox"
                  [id]="'add-site-' + site.id"
                  [checked]="isSelectedForAdding(site.id)"
                  (change)="toggleSiteForAdding(site.id)"
                />
                <label [for]="'add-site-' + site.id">
                  <span class="site-status" [class]="'status-' + site.status">●</span>
                  {{ site.club_name }} - {{ site.site_name }}
                  <span class="site-location">{{ site.location?.city }}</span>
                </label>
              </div>
              <div *ngIf="availableSitesForAdding().length === 0" class="empty-sites">
                Tous les sites sont déjà dans ce groupe
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showAddSitesModal = false">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="addSitesToGroup()"
              [disabled]="sitesToAdd.length === 0"
            >
              Ajouter ({{ sitesToAdd.length }})
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Deploy Content -->
      <div class="modal" *ngIf="showDeployContentModal" (click)="showDeployContentModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Déployer du contenu</h2>
            <button class="modal-close" (click)="showDeployContentModal = false">×</button>
          </div>
          <div class="modal-body">
            <p>Cette fonctionnalité déploiera du contenu vers tous les {{ group.sites?.length || 0 }} sites de ce groupe.</p>
            <p class="info-message">
              Pour configurer le contenu à déployer, rendez-vous dans la section
              <a routerLink="/content">Gestion du contenu</a>.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDeployContentModal = false">Fermer</button>
            <button class="btn btn-primary" routerLink="/content">
              Aller à la gestion du contenu
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Deploy Update -->
      <div class="modal" *ngIf="showDeployUpdateModal" (click)="showDeployUpdateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Déployer une mise à jour</h2>
            <button class="modal-close" (click)="showDeployUpdateModal = false">×</button>
          </div>
          <div class="modal-body">
            <p>Cette fonctionnalité déploiera une mise à jour logicielle vers tous les {{ group.sites?.length || 0 }} sites de ce groupe.</p>
            <p class="info-message">
              Pour configurer les mises à jour, rendez-vous dans la section
              <a routerLink="/updates">Gestion des mises à jour</a>.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDeployUpdateModal = false">Fermer</button>
            <button class="btn btn-primary" routerLink="/updates">
              Aller à la gestion des mises à jour
            </button>
          </div>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Chargement du groupe...</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      color: #2563eb;
      text-decoration: none;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: #1d4ed8;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      gap: 2rem;
    }

    .header-content {
      flex: 1;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .group-icon {
      font-size: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 2rem;
      color: #0f172a;
    }

    .group-description {
      color: #64748b;
      margin: 0.5rem 0 0 0;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
      flex-shrink: 0;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .stat-icon {
      font-size: 2rem;
      opacity: 0.8;
    }

    .stat-content {
      flex: 1;
    }

    .stat-value {
      font-size: 1.875rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h2 {
      font-size: 1.25rem;
      margin: 0 0 1.5rem 0;
      color: #0f172a;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .card-header h2 {
      margin: 0;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .site-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: #f8fafc;
      transition: all 0.2s;
    }

    .site-item:hover {
      background: #f1f5f9;
    }

    .site-status {
      font-size: 0.75rem;
    }

    .status-online { color: #10b981; }
    .status-offline { color: #94a3b8; }
    .status-error { color: #ef4444; }
    .status-maintenance { color: #f59e0b; }

    .site-info {
      flex: 1;
      min-width: 0;
    }

    .site-name {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .site-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
    }

    .separator {
      color: #cbd5e1;
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
      background: #e2e8f0;
    }

    .btn-icon.btn-danger:hover {
      background: #fee2e2;
      color: #ef4444;
    }

    .empty-state-small {
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
    }

    .empty-state-small p {
      margin-bottom: 1rem;
    }

    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      transform: translateX(4px);
    }

    .action-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .action-content {
      flex: 1;
    }

    .action-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .action-desc {
      font-size: 0.875rem;
      color: #64748b;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1.5rem;
    }

    .metadata-item {
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .metadata-key {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.5rem;
    }

    .metadata-value {
      font-size: 1rem;
      font-weight: 600;
      color: #0f172a;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      color: #64748b;
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
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
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: inherit;
    }

    .form-group input:focus,
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
      max-height: 400px;
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

    .info-message {
      padding: 1rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      color: #1e40af;
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    .info-message a {
      color: #2563eb;
      text-decoration: underline;
      font-weight: 500;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
      }

      .header-actions {
        width: 100%;
      }

      .stats-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class GroupDetailComponent implements OnInit, OnDestroy {
  group: Group | null = null;
  allSites: Site[] = [];
  showEditModal = false;
  showAddSitesModal = false;
  showDeployContentModal = false;
  showDeployUpdateModal = false;
  sitesToAdd: string[] = [];

  editForm = {
    name: '',
    description: '',
    metadata: {} as Record<string, any>
  };

  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private groupsService: GroupsService,
    private sitesService: SitesService
  ) {}

  ngOnInit(): void {
    const groupId = this.route.snapshot.paramMap.get('id');
    if (groupId) {
      this.loadGroup(groupId);
      this.loadAllSites();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadGroup(id: string): void {
    this.groupsService.loadGroup(id).subscribe({
      next: (group) => {
        this.group = group;
        this.initEditForm();
      },
      error: (error) => {
        alert('Erreur lors du chargement du groupe: ' + (error.error?.error || error.message));
      }
    });
  }

  loadAllSites(): void {
    this.sitesService.loadSites().subscribe({
      next: (response) => {
        this.allSites = response.sites;
      }
    });
  }

  initEditForm(): void {
    if (!this.group) return;
    this.editForm = {
      name: this.group.name,
      description: this.group.description || '',
      metadata: { ...this.group.metadata } || {}
    };
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

  getOnlineSitesCount(): number {
    return this.group?.sites?.filter(s => s.status === 'online').length || 0;
  }

  getOfflineSitesCount(): number {
    return this.group?.sites?.filter(s => s.status === 'offline').length || 0;
  }

  getMetadataDisplay(): string {
    if (!this.group?.metadata) return '-';
    const values = Object.values(this.group.metadata);
    return values.length > 0 ? values.join(', ') : '-';
  }

  getMetadataKeys(): string[] {
    return this.group?.metadata ? Object.keys(this.group.metadata) : [];
  }

  formatMetadataKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  availableSitesForAdding(): Site[] {
    if (!this.group) return [];
    const currentSiteIds = new Set(this.group.sites?.map(s => s.id) || []);
    return this.allSites.filter(s => !currentSiteIds.has(s.id));
  }

  isSelectedForAdding(siteId: string): boolean {
    return this.sitesToAdd.includes(siteId);
  }

  toggleSiteForAdding(siteId: string): void {
    const index = this.sitesToAdd.indexOf(siteId);
    if (index === -1) {
      this.sitesToAdd.push(siteId);
    } else {
      this.sitesToAdd.splice(index, 1);
    }
  }

  addSitesToGroup(): void {
    if (!this.group || this.sitesToAdd.length === 0) return;

    const currentSiteIds = this.group.sites?.map(s => s.id) || [];
    const updatedSiteIds = [...currentSiteIds, ...this.sitesToAdd];

    this.groupsService.updateGroup(this.group.id, { site_ids: updatedSiteIds }).subscribe({
      next: () => {
        this.showAddSitesModal = false;
        this.sitesToAdd = [];
        this.loadGroup(this.group!.id);
      },
      error: (error) => {
        alert('Erreur lors de l\'ajout des sites: ' + (error.error?.error || error.message));
      }
    });
  }

  removeSite(siteId: string): void {
    if (!this.group) return;

    if (confirm('Retirer ce site du groupe ?')) {
      const updatedSiteIds = this.group.sites?.map(s => s.id).filter(id => id !== siteId) || [];

      this.groupsService.updateGroup(this.group.id, { site_ids: updatedSiteIds }).subscribe({
        next: () => {
          this.loadGroup(this.group!.id);
        },
        error: (error) => {
          alert('Erreur lors du retrait du site: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  updateGroup(): void {
    if (!this.group) return;

    const data = {
      name: this.editForm.name,
      description: this.editForm.description || undefined,
      metadata: Object.keys(this.editForm.metadata).length > 0 ? this.editForm.metadata : undefined
    };

    this.groupsService.updateGroup(this.group.id, data).subscribe({
      next: () => {
        this.showEditModal = false;
        this.loadGroup(this.group!.id);
      },
      error: (error) => {
        alert('Erreur lors de la mise à jour: ' + (error.error?.error || error.message));
      }
    });
  }

  deleteGroup(): void {
    if (!this.group) return;

    if (confirm(`Êtes-vous sûr de vouloir supprimer le groupe "${this.group.name}" ?`)) {
      this.groupsService.deleteGroup(this.group.id).subscribe({
        next: () => {
          window.history.back();
        },
        error: (error) => {
          alert('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  restartAllServices(): void {
    if (!this.group || !this.group.sites) return;

    const count = this.group.sites.length;
    if (confirm(`Redémarrer le service NEOPRO sur ${count} site(s) ?`)) {
      alert('Fonctionnalité en cours de développement');
      // TODO: Implement via API
    }
  }

  rebootAllSites(): void {
    if (!this.group || !this.group.sites) return;

    const count = this.group.sites.length;
    if (confirm(`⚠️ ATTENTION: Redémarrer ${count} Raspberry Pi ?\n\nCette action redémarrera physiquement tous les appareils.`)) {
      alert('Fonctionnalité en cours de développement');
      // TODO: Implement via API
    }
  }
}
