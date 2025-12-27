import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';

interface AgencyForm {
  name: string;
  description: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

@Component({
  selector: 'app-agencies-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <div class="header">
        <h1>Gestion des Agences</h1>
        <button class="btn btn-primary" (click)="showCreateModal = true">
          + Nouvelle Agence
        </button>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <div class="loading">
          <div class="spinner"></div>
        </div>
      }

      <!-- Error state -->
      @if (error()) {
        <div class="error-message">
          {{ error() }}
        </div>
      }

      <!-- Agencies list -->
      @if (!loading() && agencies().length > 0) {
        <div class="card">
          <table class="agencies-table">
            <thead>
              <tr>
                <th>Agence</th>
                <th>Contact</th>
                <th>Sites</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (agency of agencies(); track agency.id) {
                <tr>
                  <td>
                    <div class="agency-cell">
                      @if (agency.logo_url) {
                        <img [src]="agency.logo_url" class="agency-logo" alt="" />
                      } @else {
                        <div class="avatar">{{ agency.name.charAt(0) }}</div>
                      }
                      <div class="agency-info">
                        <span class="agency-name">{{ agency.name }}</span>
                        @if (agency.description) {
                          <span class="agency-desc">{{ agency.description }}</span>
                        }
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="contact-cell">
                      <span class="contact-name">{{ agency.contact_name || '-' }}</span>
                      <span class="contact-email">{{ agency.contact_email || '-' }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-info"> {{ agency.site_count || 0 }} sites </span>
                  </td>
                  <td>
                    <span class="badge" [class]="'badge-status-' + agency.status">
                      {{ agency.status === 'active' ? 'Actif' : 'Inactif' }}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button class="btn-link btn-edit" (click)="editAgency(agency)">Modifier</button>
                    <button class="btn-link btn-success" (click)="manageSites(agency)">Sites</button>
                    <button class="btn-link btn-danger" (click)="confirmDelete(agency)">
                      Supprimer
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && agencies().length === 0 && !error()) {
        <div class="empty-state">
          <div class="empty-icon">🏢</div>
          <h3>Aucune agence</h3>
          <p>Commencez par creer une nouvelle agence.</p>
          <button class="btn btn-primary" (click)="showCreateModal = true">
            + Nouvelle Agence
          </button>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showCreateModal || editingAgency) {
        <div class="modal-overlay" (click)="cancelEdit()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ editingAgency ? "Modifier l'agence" : 'Nouvelle agence' }}</h3>
            </div>
            <form (ngSubmit)="saveAgency()" class="modal-body">
              <div class="form-group">
                <label>Nom *</label>
                <input type="text" [(ngModel)]="agencyForm.name" name="name" required />
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea
                  [(ngModel)]="agencyForm.description"
                  name="description"
                  rows="2"
                ></textarea>
              </div>
              <div class="form-group">
                <label>Nom du contact</label>
                <input type="text" [(ngModel)]="agencyForm.contact_name" name="contact_name" />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input type="email" [(ngModel)]="agencyForm.contact_email" name="contact_email" />
              </div>
              <div class="form-group">
                <label>Telephone</label>
                <input type="tel" [(ngModel)]="agencyForm.contact_phone" name="contact_phone" />
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="cancelEdit()">
                  Annuler
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Enregistrement...' : 'Enregistrer' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (deletingAgency) {
        <div class="modal-overlay" (click)="deletingAgency = null">
          <div class="modal modal-small" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Confirmer la suppression</h3>
            </div>
            <div class="modal-body">
              <p>
                Etes-vous sur de vouloir supprimer l'agence "{{ deletingAgency.name }}" ? Cette
                action est irreversible.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="deletingAgency = null">
                Annuler
              </button>
              <button
                type="button"
                class="btn btn-danger"
                (click)="deleteAgency()"
                [disabled]="saving()"
              >
                {{ saving() ? 'Suppression...' : 'Supprimer' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .container {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
      }

      .header h1 {
        font-size: 1.75rem;
        font-weight: 700;
        color: #0f172a;
        margin: 0;
      }

      .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .agencies-table {
        width: 100%;
        border-collapse: collapse;
      }

      .agencies-table th {
        text-align: left;
        padding: 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }

      .agencies-table td {
        padding: 1rem;
        border-bottom: 1px solid #f1f5f9;
        font-size: 0.875rem;
        color: #334155;
      }

      .agencies-table tr:hover {
        background: #f8fafc;
      }

      .agency-cell {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .agency-logo {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }

      .avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #f3e8ff;
        color: #7c3aed;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1rem;
      }

      .agency-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .agency-name {
        font-weight: 500;
        color: #0f172a;
      }

      .agency-desc {
        font-size: 0.8125rem;
        color: #64748b;
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .contact-cell {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .contact-name {
        color: #0f172a;
      }

      .contact-email {
        font-size: 0.8125rem;
        color: #64748b;
      }

      .badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .badge-info {
        background: #dbeafe;
        color: #1e40af;
      }

      .badge-status-active {
        background: #dcfce7;
        color: #166534;
      }

      .badge-status-inactive {
        background: #f1f5f9;
        color: #475569;
      }

      .actions-cell {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .btn-link {
        background: none;
        border: none;
        padding: 0.25rem 0.5rem;
        font-size: 0.8125rem;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.2s;
      }

      .btn-edit {
        color: #2563eb;
      }
      .btn-edit:hover {
        background: #dbeafe;
      }

      .btn-success {
        color: #059669;
      }
      .btn-success:hover {
        background: #dcfce7;
      }

      .btn-danger {
        color: #dc2626;
      }
      .btn-danger:hover {
        background: #fee2e2;
      }

      .btn {
        padding: 0.625rem 1.25rem;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #2563eb;
        color: white;
      }
      .btn-primary:hover {
        background: #1d4ed8;
      }
      .btn-primary:disabled {
        background: #93c5fd;
        cursor: not-allowed;
      }

      .btn-secondary {
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      .btn-secondary:hover {
        background: #e2e8f0;
      }

      .btn.btn-danger {
        background: #dc2626;
        color: white;
        padding: 0.625rem 1.25rem;
      }
      .btn.btn-danger:hover {
        background: #b91c1c;
      }

      .loading {
        display: flex;
        justify-content: center;
        padding: 3rem;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e2e8f0;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .error-message {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
      }

      .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .empty-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
      }

      .empty-state h3 {
        font-size: 1.125rem;
        font-weight: 600;
        color: #0f172a;
        margin: 0 0 0.5rem 0;
      }

      .empty-state p {
        color: #64748b;
        margin: 0 0 1.5rem 0;
      }

      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
      }

      .modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
      }

      .modal-small {
        max-width: 400px;
      }

      .modal-header {
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid #e2e8f0;
      }

      .modal-header h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: #0f172a;
      }

      .modal-body {
        padding: 1.5rem;
      }

      .modal-body p {
        color: #64748b;
        line-height: 1.5;
        margin: 0;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding-top: 1.5rem;
      }

      .form-group {
        margin-bottom: 1.25rem;
      }

      .form-group label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        margin-bottom: 0.5rem;
      }

      .form-group input,
      .form-group select,
      .form-group textarea {
        width: 100%;
        padding: 0.625rem 0.875rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
        box-sizing: border-box;
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
        min-height: 60px;
      }

      @media (max-width: 768px) {
        .container {
          padding: 1rem;
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
        }

        .agencies-table {
          display: block;
          overflow-x: auto;
        }

        .actions-cell {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class AgenciesManagementComponent implements OnInit {
  private readonly agencyService = inject(AgencyPortalService);

  agencies = signal<Agency[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  showCreateModal = false;
  editingAgency: Agency | null = null;
  deletingAgency: Agency | null = null;

  agencyForm: AgencyForm = {
    name: '',
    description: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  };

  ngOnInit(): void {
    this.loadAgencies();
  }

  loadAgencies(): void {
    this.loading.set(true);
    this.error.set(null);

    this.agencyService.listAgencies().subscribe({
      next: (response) => {
        if (response.success) {
          this.agencies.set(response.data.agencies);
        } else {
          this.error.set('Erreur lors du chargement des agences');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur de connexion');
        this.loading.set(false);
      },
    });
  }

  editAgency(agency: Agency): void {
    this.editingAgency = agency;
    this.agencyForm = {
      name: agency.name,
      description: agency.description || '',
      contact_name: agency.contact_name || '',
      contact_email: agency.contact_email || '',
      contact_phone: agency.contact_phone || '',
    };
  }

  cancelEdit(): void {
    this.showCreateModal = false;
    this.editingAgency = null;
    this.resetForm();
  }

  resetForm(): void {
    this.agencyForm = {
      name: '',
      description: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
    };
  }

  saveAgency(): void {
    if (!this.agencyForm.name.trim()) return;

    this.saving.set(true);

    const data = {
      name: this.agencyForm.name.trim(),
      description: this.agencyForm.description.trim() || undefined,
      contact_name: this.agencyForm.contact_name.trim() || undefined,
      contact_email: this.agencyForm.contact_email.trim() || undefined,
      contact_phone: this.agencyForm.contact_phone.trim() || undefined,
    };

    const request = this.editingAgency
      ? this.agencyService.updateAgency(this.editingAgency.id, data)
      : this.agencyService.createAgency(data);

    request.subscribe({
      next: (response) => {
        if (response.success) {
          this.loadAgencies();
          this.cancelEdit();
        } else {
          this.error.set("Erreur lors de l'enregistrement");
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || "Erreur lors de l'enregistrement");
        this.saving.set(false);
      },
    });
  }

  confirmDelete(agency: Agency): void {
    this.deletingAgency = agency;
  }

  deleteAgency(): void {
    if (!this.deletingAgency) return;

    this.saving.set(true);

    this.agencyService.deleteAgency(this.deletingAgency.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadAgencies();
          this.deletingAgency = null;
        } else {
          this.error.set('Erreur lors de la suppression');
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur lors de la suppression');
        this.saving.set(false);
      },
    });
  }

  manageSites(_agency: Agency): void {
    // TODO: Implement site management modal
    alert('Fonctionnalite en cours de developpement');
  }
}
