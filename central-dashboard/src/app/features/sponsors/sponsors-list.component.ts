import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface Sponsor {
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
  selector: 'app-sponsors-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="sponsors-list-container">
      <div class="header">
        <h1>Sponsors & Annonceurs</h1>
        <button class="btn btn-primary" (click)="openCreateModal()" *ngIf="canManage">
          <span class="icon">+</span> Nouveau Sponsor
        </button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <input
          type="text"
          placeholder="Rechercher un sponsor..."
          [(ngModel)]="searchTerm"
          (input)="filterSponsors()"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (change)="filterSponsors()" class="status-filter">
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="paused">En pause</option>
        </select>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement des sponsors...</p>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && filteredSponsors.length === 0" class="empty-state">
        <div class="icon">📊</div>
        <h2>Aucun sponsor trouvé</h2>
        <p *ngIf="searchTerm || statusFilter">Essayez de modifier vos filtres</p>
        <p *ngIf="!searchTerm && !statusFilter && canManage">
          Créez votre premier sponsor pour commencer à suivre les analytics.
        </p>
        <button class="btn btn-primary" (click)="openCreateModal()" *ngIf="!searchTerm && !statusFilter && canManage">
          Créer un Sponsor
        </button>
      </div>

      <!-- Sponsors Grid -->
      <div *ngIf="!loading && filteredSponsors.length > 0" class="sponsors-grid">
        <div *ngFor="let sponsor of filteredSponsors" class="sponsor-card" [routerLink]="['/sponsors', sponsor.id]">
          <div class="sponsor-header">
            <div class="sponsor-logo" *ngIf="sponsor.logo_url">
              <img [src]="sponsor.logo_url" [alt]="sponsor.name" />
            </div>
            <div class="sponsor-logo placeholder" *ngIf="!sponsor.logo_url">
              <span>{{ getInitials(sponsor.name) }}</span>
            </div>
            <div class="sponsor-info">
              <h3>{{ sponsor.name }}</h3>
              <span class="status-badge" [class]="sponsor.status">
                {{ getStatusLabel(sponsor.status) }}
              </span>
            </div>
          </div>

          <div class="sponsor-details">
            <div class="detail" *ngIf="sponsor.contact_name">
              <span class="icon">👤</span>
              <span>{{ sponsor.contact_name }}</span>
            </div>
            <div class="detail" *ngIf="sponsor.contact_email">
              <span class="icon">✉️</span>
              <span>{{ sponsor.contact_email }}</span>
            </div>
            <div class="detail" *ngIf="sponsor.contact_phone">
              <span class="icon">📞</span>
              <span>{{ sponsor.contact_phone }}</span>
            </div>
          </div>

          <div class="sponsor-actions">
            <button class="btn btn-sm btn-outline" (click)="viewAnalytics($event, sponsor.id)">
              📊 Analytics
            </button>
            <button class="btn btn-sm btn-outline" (click)="editSponsor($event, sponsor)" *ngIf="canManage">
              ✏️ Modifier
            </button>
          </div>
        </div>
      </div>

      <!-- Create/Edit Modal -->
      <div class="modal" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ isEditing ? 'Modifier' : 'Nouveau' }} Sponsor</h2>
            <button class="close-btn" (click)="closeModal()">×</button>
          </div>

          <form (submit)="saveSponsor($event)" class="modal-body">
            <div class="form-group">
              <label for="name">Nom du sponsor *</label>
              <input
                id="name"
                type="text"
                [(ngModel)]="formData.name"
                name="name"
                required
                placeholder="Ex: Décathlon Cesson"
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
                  placeholder="contact@sponsor.com"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="contact_phone">Téléphone</label>
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
    .sponsors-list-container {
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

    .sponsors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .sponsor-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s;
    }

    .sponsor-card:hover {
      border-color: #3498db;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transform: translateY(-2px);
    }

    .sponsor-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
    }

    .sponsor-logo {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .sponsor-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .sponsor-logo.placeholder {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 1.5rem;
    }

    .sponsor-info {
      flex: 1;
    }

    .sponsor-info h3 {
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

    .sponsor-details {
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

    .sponsor-actions {
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
export class SponsorsListComponent implements OnInit {
  sponsors: Sponsor[] = [];
  filteredSponsors: Sponsor[] = [];
  loading = false;
  showModal = false;
  isEditing = false;
  saving = false;
  searchTerm = '';
  statusFilter = '';
  canManage = false;

  formData: Partial<Sponsor> = {
    name: '',
    logo_url: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    status: 'active'
  };

  constructor(
    private api: ApiService,
    private notification: NotificationService
  ) {}

  ngOnInit() {
    this.checkPermissions();
    this.loadSponsors();
  }

  checkPermissions() {
    // TODO: Check user role from auth service
    this.canManage = true; // Placeholder
  }

  async loadSponsors() {
    this.loading = true;
    try {
      const response = await fetch('/api/analytics/sponsors', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Erreur lors du chargement');
      }

      const data = await response.json();
      this.sponsors = data.data.sponsors || [];
      this.filteredSponsors = this.sponsors;
    } catch (error) {
      this.notification.error('Erreur lors du chargement des sponsors');
      console.error('Error loading sponsors:', error);
    } finally {
      this.loading = false;
    }
  }

  filterSponsors() {
    this.filteredSponsors = this.sponsors.filter(sponsor => {
      const matchesSearch = !this.searchTerm ||
        sponsor.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        sponsor.contact_name?.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesStatus = !this.statusFilter || sponsor.status === this.statusFilter;

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

  editSponsor(event: Event, sponsor: Sponsor) {
    event.stopPropagation();
    this.isEditing = true;
    this.formData = { ...sponsor };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  async saveSponsor(event: Event) {
    event.preventDefault();
    this.saving = true;

    try {
      const url = this.isEditing && this.formData.id
        ? `/api/analytics/sponsors/${this.formData.id}`
        : '/api/analytics/sponsors';

      const method = this.isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(this.formData)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'enregistrement');
      }

      this.notification.success(
        this.isEditing ? 'Sponsor modifié avec succès' : 'Sponsor créé avec succès'
      );

      this.closeModal();
      await this.loadSponsors();
    } catch (error) {
      this.notification.error('Erreur lors de l\'enregistrement');
      console.error('Error saving sponsor:', error);
    } finally {
      this.saving = false;
    }
  }

  viewAnalytics(event: Event, sponsorId: string) {
    event.stopPropagation();
    // Navigate to analytics view
    window.location.href = `/sponsors/${sponsorId}`;
  }
}
