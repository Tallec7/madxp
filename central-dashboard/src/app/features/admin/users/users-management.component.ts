import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { UsersService, User, UserRole, UserStatus, CreateUserData, UpdateUserData } from '../../../core/services/users.service';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';
import { TranslationService } from '../../../core/services/translation.service';
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
    <div class="container mx-auto p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-900">{{ 'users.title' | translate }}</h1>
        <button
          (click)="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + {{ 'users.addUser' | translate }}
        </button>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex gap-4 flex-wrap">
        <div class="flex-1 min-w-48">
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="applyFilters()"
            [placeholder]="'common.search' | translate"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
        </div>
        <select
          [(ngModel)]="filterRole"
          (ngModelChange)="applyFilters()"
          class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{{ 'users.allRoles' | translate }}</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">{{ 'roles.admin' | translate }}</option>
          <option value="operator">{{ 'roles.operator' | translate }}</option>
          <option value="viewer">{{ 'roles.viewer' | translate }}</option>
          <option value="sponsor">Sponsor</option>
          <option value="agency">Agence</option>
        </select>
        <select
          [(ngModel)]="filterStatus"
          (ngModelChange)="applyFilters()"
          class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{{ 'status.all' | translate }}</option>
          <option value="active">{{ 'users.active' | translate }}</option>
          <option value="inactive">{{ 'users.inactive' | translate }}</option>
          <option value="suspended">Suspendu</option>
        </select>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }

      <!-- Error state -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {{ error() }}
        </div>
      }

      <!-- Users list -->
      @if (!loading() && users().length > 0) {
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'users.email' | translate }}
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'users.fullName' | translate }}
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'users.role' | translate }}
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'users.status' | translate }}
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  MFA
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'users.lastLogin' | translate }}
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {{ 'common.actions' | translate }}
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (user of users(); track user.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <span class="text-blue-600 font-medium">{{ getInitials(user) }}</span>
                      </div>
                      <div class="text-sm font-medium text-gray-900">{{ user.email }}</div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">{{ user.full_name || '-' }}</div>
                    @if (user.sponsor_name) {
                      <div class="text-xs text-purple-600">Sponsor: {{ user.sponsor_name }}</div>
                    }
                    @if (user.agency_name) {
                      <div class="text-xs text-green-600">Agence: {{ user.agency_name }}</div>
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span [class]="getRoleBadgeClass(user.role)">
                      {{ usersService.getRoleLabel(user.role) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span [class]="getStatusBadgeClass(user.status)">
                      {{ getStatusLabel(user.status) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    @if (user.mfa_enabled) {
                      <span class="text-green-600">Actif</span>
                    } @else {
                      <span class="text-gray-400">-</span>
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ user.last_login_at ? formatDate(user.last_login_at) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      (click)="editUser(user)"
                      class="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      {{ 'common.edit' | translate }}
                    </button>
                    @if (user.status === 'active') {
                      <button
                        (click)="toggleStatus(user, 'inactive')"
                        class="text-yellow-600 hover:text-yellow-900 mr-3"
                      >
                        Desactiver
                      </button>
                    } @else {
                      <button
                        (click)="toggleStatus(user, 'active')"
                        class="text-green-600 hover:text-green-900 mr-3"
                      >
                        Activer
                      </button>
                    }
                    <button
                      (click)="confirmDelete(user)"
                      class="text-red-600 hover:text-red-900"
                    >
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
      @if (!loading() && users().length === 0) {
        <div class="text-center py-12 bg-white rounded-lg shadow">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">{{ 'users.noUsers' | translate }}</h3>
          <p class="mt-1 text-sm text-gray-500">Commencez par creer un nouvel utilisateur.</p>
          <div class="mt-6">
            <button
              (click)="showCreateModal = true"
              class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              + {{ 'users.addUser' | translate }}
            </button>
          </div>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showCreateModal || editingUser) {
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-screen overflow-y-auto">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                {{ editingUser ? ('users.editUser' | translate) : ('users.addUser' | translate) }}
              </h3>
            </div>
            <form (ngSubmit)="saveUser()" class="px-6 py-4 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">{{ 'users.email' | translate }} *</label>
                <input
                  type="email"
                  [(ngModel)]="userForm.email"
                  name="email"
                  required
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              @if (!editingUser) {
                <div>
                  <label class="block text-sm font-medium text-gray-700">{{ 'auth.password' | translate }} *</label>
                  <input
                    type="password"
                    [(ngModel)]="userForm.password"
                    name="password"
                    required
                    minlength="8"
                    class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                  <p class="mt-1 text-xs text-gray-500">Minimum 8 caracteres</p>
                </div>
              }
              <div>
                <label class="block text-sm font-medium text-gray-700">{{ 'users.fullName' | translate }} *</label>
                <input
                  type="text"
                  [(ngModel)]="userForm.full_name"
                  name="full_name"
                  required
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">{{ 'users.role' | translate }} *</label>
                <select
                  [(ngModel)]="userForm.role"
                  name="role"
                  required
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">{{ 'roles.admin' | translate }}</option>
                  <option value="operator">{{ 'roles.operator' | translate }}</option>
                  <option value="viewer">{{ 'roles.viewer' | translate }}</option>
                  <option value="sponsor">Sponsor</option>
                  <option value="agency">Agence</option>
                </select>
              </div>
              @if (userForm.role === 'sponsor') {
                <div>
                  <label class="block text-sm font-medium text-gray-700">Sponsor associe</label>
                  <select
                    [(ngModel)]="userForm.sponsor_id"
                    name="sponsor_id"
                    class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option [value]="null">Selectionnez un sponsor</option>
                    @for (sponsor of sponsors(); track sponsor.id) {
                      <option [value]="sponsor.id">{{ sponsor.name }}</option>
                    }
                  </select>
                </div>
              }
              @if (userForm.role === 'agency') {
                <div>
                  <label class="block text-sm font-medium text-gray-700">Agence associee</label>
                  <select
                    [(ngModel)]="userForm.agency_id"
                    name="agency_id"
                    class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option [value]="null">Selectionnez une agence</option>
                    @for (agency of agencies(); track agency.id) {
                      <option [value]="agency.id">{{ agency.name }}</option>
                    }
                  </select>
                </div>
              }
              <div class="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  (click)="cancelEdit()"
                  class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {{ 'common.cancel' | translate }}
                </button>
                <button
                  type="submit"
                  [disabled]="saving()"
                  class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {{ saving() ? ('common.loading' | translate) : ('common.save' | translate) }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (deletingUser) {
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">{{ 'users.deleteConfirm' | translate }}</h3>
            <p class="text-sm text-gray-500 mb-6">
              Etes-vous sur de vouloir supprimer l'utilisateur "{{ deletingUser.email }}" ?
              Cette action est irreversible.
            </p>
            <div class="flex justify-end space-x-3">
              <button
                (click)="deletingUser = null"
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {{ 'common.cancel' | translate }}
              </button>
              <button
                (click)="deleteUser()"
                [disabled]="saving()"
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {{ saving() ? 'Suppression...' : ('common.delete' | translate) }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class UsersManagementComponent implements OnInit {
  readonly usersService = inject(UsersService);
  private readonly agencyService = inject(AgencyPortalService);
  private readonly translationService = inject(TranslationService);
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
    agency_id: null
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
      }
    });
  }

  loadAgencies(): void {
    this.agencyService.listAgencies().subscribe({
      next: (response) => {
        if (response.success) {
          this.agencies.set(response.data.agencies);
        }
      }
    });
  }

  loadSponsors(): void {
    this.api.get<{ success: boolean; data: { sponsors: Sponsor[] } }>('/analytics/sponsors').subscribe({
      next: (response) => {
        if (response.success) {
          this.sponsors.set(response.data.sponsors);
        }
      },
      error: () => {
        // Sponsors list may not be available, silently ignore
      }
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
      agency_id: user.agency_id
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
      agency_id: null
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
        agency_id: this.userForm.agency_id
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
        }
      });
    } else {
      const data: CreateUserData = {
        email: this.userForm.email.trim(),
        password: this.userForm.password,
        full_name: this.userForm.full_name.trim(),
        role: this.userForm.role,
        sponsor_id: this.userForm.sponsor_id,
        agency_id: this.userForm.agency_id
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
        }
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
      }
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
      }
    });
  }

  getInitials(user: User): string {
    if (user.full_name) {
      const parts = user.full_name.split(' ');
      return parts.map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('');
    }
    return user.email.charAt(0).toUpperCase();
  }

  getRoleBadgeClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      super_admin: 'px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full',
      admin: 'px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full',
      operator: 'px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full',
      viewer: 'px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full',
      sponsor: 'px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full',
      agency: 'px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full'
    };
    return classes[role] || 'px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full';
  }

  getStatusBadgeClass(status: UserStatus): string {
    const classes: Record<UserStatus, string> = {
      active: 'px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full',
      inactive: 'px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full',
      suspended: 'px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full'
    };
    return classes[status] || 'px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full';
  }

  getStatusLabel(status: UserStatus): string {
    const labels: Record<UserStatus, string> = {
      active: 'Actif',
      inactive: 'Inactif',
      suspended: 'Suspendu'
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
      minute: '2-digit'
    });
  }
}
