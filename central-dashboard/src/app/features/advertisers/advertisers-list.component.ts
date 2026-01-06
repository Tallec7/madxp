import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';

interface Advertiser {
  id: string;
  name: string;
  logo_url?: string;
  contact_email?: string;
  contact_name?: string;
  contact_phone?: string;
  status: 'active' | 'inactive' | 'paused';
  created_at: string;
}

@Component({
  selector: 'app-advertisers-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="advertisers-list-container">
      <div class="header">
        <h1>Annonceurs</h1>
        <button class="btn btn-primary" (click)="openCreateModal()" *ngIf="canManage">
          <span class="icon">+</span> Nouvel Annonceur
        </button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <input
          type="text"
          placeholder="Rechercher un annonceur..."
          [(ngModel)]="searchTerm"
          (input)="filterAdvertisers()"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (change)="filterAdvertisers()" class="status-filter">
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="paused">En pause</option>
        </select>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement des annonceurs...</p>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && filteredAdvertisers.length === 0" class="empty-state">
        <div class="icon">📊</div>
        <h2>Aucun annonceur trouve</h2>
        <p *ngIf="searchTerm || statusFilter">Essayez de modifier vos filtres</p>
        <p *ngIf="!searchTerm && !statusFilter && canManage">
          Creez votre premier annonceur pour commencer a suivre les analytics.
        </p>
        <button class="btn btn-primary" (click)="openCreateModal()" *ngIf="!searchTerm && !statusFilter && canManage">
          Creer un Annonceur
        </button>
      </div>

      <!-- Advertisers Grid -->
      <div *ngIf="!loading && filteredAdvertisers.length > 0" class="advertisers-grid">
        <div *ngFor="let advertiser of filteredAdvertisers" class="advertiser-card" [routerLink]="['/advertisers', advertiser.id]">
          <div class="advertiser-header">
            <div class="advertiser-logo" *ngIf="advertiser.logo_url">
              <img [src]="advertiser.logo_url" [alt]="advertiser.name" />
            </div>
            <div class="advertiser-logo placeholder" *ngIf="!advertiser.logo_url">
              <span>{{ getInitials(advertiser.name) }}</span>
            </div>
            <div class="advertiser-info">
              <h3>{{ advertiser.name }}</h3>
              <span class="status-badge" [class]="advertiser.status">
                {{ getStatusLabel(advertiser.status) }}
              </span>
            </div>
          </div>

          <div class="advertiser-details">
            <div class="detail" *ngIf="advertiser.contact_name">
              <span class="icon">👤</span>
              <span>{{ advertiser.contact_name }}</span>
            </div>
            <div class="detail" *ngIf="advertiser.contact_email">
              <span class="icon">✉️</span>
              <span>{{ advertiser.contact_email }}</span>
            </div>
            <div class="detail" *ngIf="advertiser.contact_phone">
              <span class="icon">📞</span>
              <span>{{ advertiser.contact_phone }}</span>
            </div>
          </div>

          <div class="advertiser-actions">
            <button class="btn btn-sm btn-outline" (click)="viewAnalytics($event, advertiser.id)">
              📊 Analytics
            </button>
            <button class="btn btn-sm btn-outline" (click)="editAdvertiser($event, advertiser)" *ngIf="canManage">
              ✏️ Modifier
            </button>
          </div>
        </div>
      </div>

      <!-- Create/Edit Modal -->
      <div class="modal" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ isEditing ? 'Modifier' : 'Nouvel' }} Annonceur</h2>
            <button class="close-btn" (click)="closeModal()">x</button>
          </div>

          <form (submit)="saveAdvertiser($event)" class="modal-body">
            <div class="form-group">
              <label for="name">Nom de l'annonceur *</label>
              <input
                id="name"
                type="text"
                [(ngModel)]="formData.name"
                name="name"
                required
                placeholder="Ex: Decathlon Cesson"
              />
            </div>

            <div class="form-group">
              <label for="logo_url">URL du logo</label>
              <input
                id="logo_url"
                type="url"
                [(ngModel)]="formData.logo_url"
                name="logo_url"
                placeholder="https://..."
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="contact_name">Contact</label>
                <input
                  id="contact_name"
                  type="text"
                  [(ngModel)]="formData.contact_name"
                  name="contact_name"
                  placeholder="Nom du contact"
                />
              </div>
              <div class="form-group">
                <label for="contact_email">Email</label>
                <input
                  id="contact_email"
                  type="email"
                  [(ngModel)]="formData.contact_email"
                  name="contact_email"
                  placeholder="contact@annonceur.com"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="contact_phone">Telephone</label>
              <input
                id="contact_phone"
                type="tel"
                [(ngModel)]="formData.contact_phone"
                name="contact_phone"
                placeholder="+33 6 12 34 56 78"
              />
            </div>

            <div class="form-group">
              <label for="status">Statut</label>
              <select id="status" [(ngModel)]="formData.status" name="status">
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="paused">En pause</option>
              </select>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">
                Annuler
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .advertisers-list-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .header h1 {
      font-size: 2rem;
      font-weight: 600;
      margin: 0;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .search-input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
    }

    .status-filter {
      padding: 0.75rem 1rem;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      min-width: 200px;
    }

    .loading {
      text-align: center;
      padding: 4rem;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 4rem;
      background: #f8f9fa;
      border-radius: 12px;
    }

    .empty-state .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    .advertisers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .advertiser-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s;
    }

    .advertiser-card:hover {
      border-color: #3498db;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }

    .advertiser-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
    }

    .advertiser-logo {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .advertiser-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .advertiser-logo.placeholder {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 1.5rem;
    }

    .advertiser-info {
      flex: 1;
    }

    .advertiser-info h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .status-badge.active {
      background: #d4edda;
      color: #155724;
    }

    .status-badge.inactive {
      background: #f8d7da;
      color: #721c24;
    }

    .status-badge.paused {
      background: #fff3cd;
      color: #856404;
    }

    .advertiser-details {
      margin-bottom: 1rem;
    }

    .detail {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      font-size: 0.9rem;
      color: #666;
    }

    .advertiser-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary {
      background: #3498db;
      color: white;
    }

    .btn-primary:hover {
      background: #2980b9;
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
    }

    .btn-outline {
      background: transparent;
      border: 1px solid #ddd;
      color: #333;
    }

    .btn-outline:hover {
      background: #f8f9fa;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      flex: 1;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Modal Styles */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #eee;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 2rem;
      cursor: pointer;
      color: #999;
      line-height: 1;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #333;
    }

    .form-group input,
    .form-group select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }
  `]
})
export class AdvertisersListComponent implements OnInit {
  advertisers: Advertiser[] = [];
  filteredAdvertisers: Advertiser[] = [];
  loading = false;
  showModal = false;
  isEditing = false;
  saving = false;
  searchTerm = '';
  statusFilter = '';
  canManage = false;

  formData: Partial<Advertiser> = {
    name: '',
    logo_url: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    status: 'active'
  };

  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private authService = inject(AuthService);
  private logger = inject(LoggerService);

  ngOnInit() {
    this.checkPermissions();
    this.loadAdvertisers();
  }

  checkPermissions() {
    // Only superadmin, admin and operator roles can manage advertisers
    this.canManage = this.authService.hasRole('super_admin', 'superadmin', 'admin', 'operator');
  }

  loadAdvertisers() {
    this.loading = true;
    // Use new endpoint, with backward compatibility to old endpoint
    this.api.get<{ success: boolean; data: { advertisers?: Advertiser[]; sponsors?: Advertiser[] } }>('/analytics/advertisers')
      .subscribe({
        next: (response) => {
          this.advertisers = response.data.advertisers || response.data.sponsors || [];
          this.filteredAdvertisers = this.advertisers;
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.logger.error('Failed to load advertisers', { error: message });
          this.notification.error(`Erreur lors du chargement des annonceurs: ${message}`);
          this.loading = false;
        },
        complete: () => {
          this.loading = false;
        }
      });
  }

  filterAdvertisers() {
    this.filteredAdvertisers = this.advertisers.filter(advertiser => {
      const matchesSearch = !this.searchTerm ||
        advertiser.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        advertiser.contact_name?.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesStatus = !this.statusFilter || advertiser.status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Actif',
      inactive: 'Inactif',
      paused: 'En pause'
    };
    return labels[status] || status;
  }

  openCreateModal() {
    this.isEditing = false;
    this.formData = {
      name: '',
      logo_url: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      status: 'active'
    };
    this.showModal = true;
  }

  editAdvertiser(event: Event, advertiser: Advertiser) {
    event.stopPropagation();
    this.isEditing = true;
    this.formData = { ...advertiser };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveAdvertiser(event: Event) {
    event.preventDefault();
    this.saving = true;

    const endpoint = this.isEditing && this.formData.id
      ? `/analytics/advertisers/${this.formData.id}`
      : '/analytics/advertisers';

    const request$ = this.isEditing && this.formData.id
      ? this.api.put<{ success: boolean; data: Advertiser }>(endpoint, this.formData)
      : this.api.post<{ success: boolean; data: Advertiser }>(endpoint, this.formData);

    request$.subscribe({
      next: () => {
        this.notification.success(
          this.isEditing ? 'Annonceur modifie avec succes' : 'Annonceur cree avec succes'
        );
        this.closeModal();
        this.loadAdvertisers();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to save advertiser', { error: message, advertiserId: this.formData.id, isEditing: this.isEditing });
        this.notification.error(`Erreur lors de l'enregistrement: ${message}`);
        this.saving = false;
      },
      complete: () => {
        this.saving = false;
      }
    });
  }

  viewAnalytics(event: Event, advertiserId: string) {
    event.stopPropagation();
    // Navigate to analytics view
    window.location.href = `/advertisers/${advertiserId}`;
  }
}
