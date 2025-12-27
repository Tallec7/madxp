import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  UsersService,
  User,
  UserRole,
  UserStatus,
  CreateUserData,
  UpdateUserData,
} from '../../../core/services/users.service';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';
import { ApiService } from '../../../core/services/api.service';

interface Sponsor {
  id: string;
  name: string;
  status: string;
}

interface UserForm {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  sponsor_id: string | null;
  agency_id: string | null;
}

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="container">
      <div class="header">
        <h1>{{ 'users.title' | translate }}</h1>
        <button class="btn btn-primary" (click)="showCreateModal = true">
          + {{ 'users.addUser' | translate }}
        </button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <input
          type="text"
          [(ngModel)]="searchQuery"
          (ngModelChange)="applyFilters()"
          [placeholder]="'common.search' | translate"
          class="search-input"
        />
        <select [(ngModel)]="filterRole" (ngModelChange)="applyFilters()" class="filter-select">
          <option value="">{{ 'users.allRoles' | translate }}</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">{{ 'roles.admin' | translate }}</option>
          <option value="operator">{{ 'roles.operator' | translate }}</option>
          <option value="viewer">{{ 'roles.viewer' | translate }}</option>
          <option value="sponsor">Sponsor</option>
          <option value="agency">Agence</option>
        </select>
        <select [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()" class="filter-select">
          <option value="">{{ 'status.all' | translate }}</option>
          <option value="active">{{ 'users.active' | translate }}</option>
          <option value="inactive">{{ 'users.inactive' | translate }}</option>
          <option value="suspended">Suspendu</option>
        </select>
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

      <!-- Users list -->
      @if (!loading() && users().length > 0) {
        <div class="card">
          <table class="users-table">
            <thead>
              <tr>
                <th>{{ 'users.email' | translate }}</th>
                <th>{{ 'users.fullName' | translate }}</th>
                <th>{{ 'users.role' | translate }}</th>
                <th>{{ 'users.status' | translate }}</th>
                <th>MFA</th>
                <th>{{ 'users.lastLogin' | translate }}</th>
                <th>{{ 'common.actions' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="avatar">{{ getInitials(user) }}</div>
                      <span class="email">{{ user.email }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="name-cell">
                      <span>{{ user.full_name || '-' }}</span>
                      @if (user.sponsor_name) {
                        <span class="sub-info sponsor">Sponsor: {{ user.sponsor_name }}</span>
                      }
                      @if (user.agency_name) {
                        <span class="sub-info agency">Agence: {{ user.agency_name }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span class="badge" [class]="'badge-' + user.role">
                      {{ usersService.getRoleLabel(user.role) }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [class]="'badge-status-' + user.status">
                      {{ getStatusLabel(user.status) }}
                    </span>
                  </td>
                  <td>
                    @if (user.mfa_enabled) {
                      <span class="mfa-active">Actif</span>
                    } @else {
                      <span class="mfa-inactive">-</span>
                    }
                  </td>
                  <td class="date-cell">
                    {{ user.last_login_at ? formatDate(user.last_login_at) : '-' }}
                  </td>
                  <td class="actions-cell">
                    <button class="btn-link btn-edit" (click)="editUser(user)">
                      {{ 'common.edit' | translate }}
                    </button>
                    @if (user.status === 'active') {
                      <button class="btn-link btn-warning" (click)="toggleStatus(user, 'inactive')">
                        Desactiver
                      </button>
                    } @else {
                      <button class="btn-link btn-success" (click)="toggleStatus(user, 'active')">
                        Activer
                      </button>
                    }
                    <button class="btn-link btn-danger" (click)="confirmDelete(user)">
                      {{ 'common.delete' | translate }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && users().length === 0 && !error()) {
        <div class="empty-state">
          <div class="empty-icon">👤</div>
          <h3>{{ 'users.noUsers' | translate }}</h3>
          <p>Commencez par creer un nouvel utilisateur.</p>
          <button class="btn btn-primary" (click)="showCreateModal = true">
            + {{ 'users.addUser' | translate }}
          </button>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showCreateModal || editingUser) {
        <div class="modal-overlay" (click)="cancelEdit()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ editingUser ? ('users.editUser' | translate) : ('users.addUser' | translate) }}</h3>
            </div>
            <form (ngSubmit)="saveUser()" class="modal-body">
              <div class="form-group">
                <label>{{ 'users.email' | translate }} *</label>
                <input type="email" [(ngModel)]="userForm.email" name="email" required />
              </div>
              @if (!editingUser) {
                <div class="form-group">
                  <label>{{ 'auth.password' | translate }} *</label>
                  <input
                    type="password"
                    [(ngModel)]="userForm.password"
                    name="password"
                    required
                    minlength="8"
                  />
                  <span class="hint">Minimum 8 caracteres</span>
                </div>
              }
              <div class="form-group">
                <label>{{ 'users.fullName' | translate }} *</label>
                <input type="text" [(ngModel)]="userForm.full_name" name="full_name" required />
              </div>
              <div class="form-group">
                <label>{{ 'users.role' | translate }} *</label>
                <select [(ngModel)]="userForm.role" name="role" required>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">{{ 'roles.admin' | translate }}</option>
                  <option value="operator">{{ 'roles.operator' | translate }}</option>
                  <option value="viewer">{{ 'roles.viewer' | translate }}</option>
                  <option value="sponsor">Sponsor</option>
                  <option value="agency">Agence</option>
                </select>
              </div>
              @if (userForm.role === 'sponsor') {
                <div class="form-group">
                  <label>Sponsor associe</label>
                  <select [(ngModel)]="userForm.sponsor_id" name="sponsor_id">
                    <option [ngValue]="null">Selectionnez un sponsor</option>
                    @for (sponsor of sponsors(); track sponsor.id) {
                      <option [ngValue]="sponsor.id">{{ sponsor.name }}</option>
                    }
                  </select>
                </div>
              }
              @if (userForm.role === 'agency') {
                <div class="form-group">
                  <label>Agence associee</label>
                  <select [(ngModel)]="userForm.agency_id" name="agency_id">
                    <option [ngValue]="null">Selectionnez une agence</option>
                    @for (agency of agencies(); track agency.id) {
                      <option [ngValue]="agency.id">{{ agency.name }}</option>
                    }
                  </select>
                </div>
              }
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="cancelEdit()">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? ('common.loading' | translate) : ('common.save' | translate) }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (deletingUser) {
        <div class="modal-overlay" (click)="deletingUser = null">
          <div class="modal modal-small" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ 'users.deleteConfirm' | translate }}</h3>
            </div>
            <div class="modal-body">
              <p>
                Etes-vous sur de vouloir supprimer l'utilisateur "{{ deletingUser.email }}" ? Cette
                action est irreversible.
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="deletingUser = null">
                {{ 'common.cancel' | translate }}
              </button>
              <button
                type="button"
                class="btn btn-danger"
                (click)="deleteUser()"
                [disabled]="saving()"
              >
                {{ saving() ? 'Suppression...' : ('common.delete' | translate) }}
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

      .filters {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }

      .search-input {
        flex: 1;
        min-width: 200px;
        padding: 0.625rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
      }

      .search-input:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .filter-select {
        padding: 0.625rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
        cursor: pointer;
      }

      .filter-select:focus {
        outline: none;
        border-color: #2563eb;
      }

      .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .users-table {
        width: 100%;
        border-collapse: collapse;
      }

      .users-table th {
        text-align: left;
        padding: 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }

      .users-table td {
        padding: 1rem;
        border-bottom: 1px solid #f1f5f9;
        font-size: 0.875rem;
        color: #334155;
      }

      .users-table tr:hover {
        background: #f8fafc;
      }

      .user-cell {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #dbeafe;
        color: #2563eb;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.875rem;
      }

      .email {
        font-weight: 500;
        color: #0f172a;
      }

      .name-cell {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .sub-info {
        font-size: 0.75rem;
      }

      .sub-info.sponsor {
        color: #7c3aed;
      }

      .sub-info.agency {
        color: #059669;
      }

      .badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .badge-super_admin {
        background: #fee2e2;
        color: #991b1b;
      }
      .badge-admin {
        background: #f3e8ff;
        color: #6b21a8;
      }
      .badge-operator {
        background: #dbeafe;
        color: #1e40af;
      }
      .badge-viewer {
        background: #f1f5f9;
        color: #475569;
      }
      .badge-sponsor {
        background: #fef3c7;
        color: #92400e;
      }
      .badge-agency {
        background: #dcfce7;
        color: #166534;
      }

      .badge-status-active {
        background: #dcfce7;
        color: #166534;
      }
      .badge-status-inactive {
        background: #fef3c7;
        color: #92400e;
      }
      .badge-status-suspended {
        background: #fee2e2;
        color: #991b1b;
      }

      .mfa-active {
        color: #059669;
        font-weight: 500;
      }
      .mfa-inactive {
        color: #94a3b8;
      }

      .date-cell {
        color: #64748b;
        font-size: 0.8125rem;
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

      .btn-warning {
        color: #d97706;
      }
      .btn-warning:hover {
        background: #fef3c7;
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
      .form-group select {
        width: 100%;
        padding: 0.625rem 0.875rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
        box-sizing: border-box;
      }

      .form-group input:focus,
      .form-group select:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .hint {
        display: block;
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 0.375rem;
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

        .users-table {
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
export class UsersManagementComponent implements OnInit {
  readonly usersService = inject(UsersService);
  private readonly agencyService = inject(AgencyPortalService);
  private readonly api = inject(ApiService);

  users = signal<User[]>([]);
  agencies = signal<Agency[]>([]);
  sponsors = signal<Sponsor[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  showCreateModal = false;
  editingUser: User | null = null;
  deletingUser: User | null = null;

  searchQuery = '';
  filterRole = '';
  filterStatus = '';

  userForm: UserForm = {
    email: '',
    password: '',
    full_name: '',
    role: 'viewer',
    sponsor_id: null,
    agency_id: null,
  };

  ngOnInit(): void {
    this.loadUsers();
    this.loadAgencies();
    this.loadSponsors();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);

    const filters: Record<string, string> = {};
    if (this.filterRole) filters['role'] = this.filterRole;
    if (this.filterStatus) filters['status'] = this.filterStatus;
    if (this.searchQuery) filters['search'] = this.searchQuery;

    this.usersService.list(filters).subscribe({
      next: (response) => {
        if (response.success) {
          this.users.set(response.data.users);
        } else {
          this.error.set('Erreur lors du chargement des utilisateurs');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur de connexion');
        this.loading.set(false);
      },
    });
  }

  loadAgencies(): void {
    this.agencyService.listAgencies().subscribe({
      next: (response) => {
        if (response.success) {
          this.agencies.set(response.data.agencies);
        }
      },
    });
  }

  loadSponsors(): void {
    this.api
      .get<{ success: boolean; data: { sponsors: Sponsor[] } }>('/analytics/sponsors')
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.sponsors.set(response.data.sponsors);
          }
        },
        error: () => {
          // Sponsors list may not be available, silently ignore
        },
      });
  }

  applyFilters(): void {
    this.loadUsers();
  }

  editUser(user: User): void {
    this.editingUser = user;
    this.userForm = {
      email: user.email,
      password: '',
      full_name: user.full_name || '',
      role: user.role,
      sponsor_id: user.sponsor_id,
      agency_id: user.agency_id,
    };
  }

  cancelEdit(): void {
    this.showCreateModal = false;
    this.editingUser = null;
    this.resetForm();
  }

  resetForm(): void {
    this.userForm = {
      email: '',
      password: '',
      full_name: '',
      role: 'viewer',
      sponsor_id: null,
      agency_id: null,
    };
  }

  saveUser(): void {
    if (!this.userForm.email.trim() || !this.userForm.full_name.trim()) return;
    if (!this.editingUser && !this.userForm.password) return;

    this.saving.set(true);

    if (this.editingUser) {
      const data: UpdateUserData = {
        email: this.userForm.email.trim(),
        full_name: this.userForm.full_name.trim(),
        role: this.userForm.role,
        sponsor_id: this.userForm.sponsor_id,
        agency_id: this.userForm.agency_id,
      };

      this.usersService.update(this.editingUser.id, data).subscribe({
        next: (response) => {
          if (response.success) {
            this.loadUsers();
            this.cancelEdit();
          } else {
            this.error.set('Erreur lors de la mise a jour');
          }
          this.saving.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Erreur lors de la mise a jour');
          this.saving.set(false);
        },
      });
    } else {
      const data: CreateUserData = {
        email: this.userForm.email.trim(),
        password: this.userForm.password,
        full_name: this.userForm.full_name.trim(),
        role: this.userForm.role,
        sponsor_id: this.userForm.sponsor_id,
        agency_id: this.userForm.agency_id,
      };

      this.usersService.create(data).subscribe({
        next: (response) => {
          if (response.success) {
            this.loadUsers();
            this.cancelEdit();
          } else {
            this.error.set('Erreur lors de la creation');
          }
          this.saving.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Erreur lors de la creation');
          this.saving.set(false);
        },
      });
    }
  }

  confirmDelete(user: User): void {
    this.deletingUser = user;
  }

  deleteUser(): void {
    if (!this.deletingUser) return;

    this.saving.set(true);

    this.usersService.delete(this.deletingUser.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadUsers();
          this.deletingUser = null;
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

  toggleStatus(user: User, newStatus: UserStatus): void {
    this.usersService.toggleStatus(user.id, newStatus).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadUsers();
        } else {
          this.error.set('Erreur lors du changement de statut');
        }
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur lors du changement de statut');
      },
    });
  }

  getInitials(user: User): string {
    if (user.full_name) {
      const parts = user.full_name.split(' ');
      return parts
        .map((p) => p.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    }
    return user.email.charAt(0).toUpperCase();
  }

  getStatusLabel(status: UserStatus): string {
    const labels: Record<UserStatus, string> = {
      active: 'Actif',
      inactive: 'Inactif',
      suspended: 'Suspendu',
    };
    return labels[status] || status;
  }

  formatDate(date: Date | string): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
