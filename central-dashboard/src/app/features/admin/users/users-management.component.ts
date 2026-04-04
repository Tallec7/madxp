import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  User,
  UserStatus,
  CreateUserData,
  UpdateUserData,
} from '../../../core/services/users.service';
import { ErrorExtractor } from '../../../core/utils/error-extractor';
import { LoggerService } from '../../../core/services/logger.service';
import { UsersManagementDataService } from './users-management-data.service';
import { UserFiltersService } from './user-filters.service';
import { UserValidationService } from './user-validation.service';
import { UsersFiltersComponent } from './users-filters.component';
import { UsersTableComponent } from './users-table.component';
import { UserFormModalComponent, UserFormSaveEvent } from './user-form-modal.component';
import { UserDeleteModalComponent } from './user-delete-modal.component';

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    UsersFiltersComponent,
    UsersTableComponent,
    UserFormModalComponent,
    UserDeleteModalComponent,
  ],
  providers: [UsersManagementDataService, UserFiltersService, UserValidationService],
  template: `
    <div class="container">
      <div class="header">
        <h1>{{ 'users.title' | translate }}</h1>
        <button class="btn btn-primary" (click)="showCreateModal = true">
          + {{ 'users.addUser' | translate }}
        </button>
      </div>

      <!-- Filters -->
      <app-users-filters
        (searchChange)="onSearchChange($event)"
        (roleChange)="onRoleChange($event)"
        (statusChange)="onStatusChange($event)"
      />

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
        <app-users-table
          [users]="users()"
          (edit)="editUser($event)"
          (toggleStatus)="toggleStatus($event.user, $event.status)"
          (delete)="confirmDelete($event)"
        />
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
      <app-user-form-modal
        [visible]="showCreateModal"
        [editingUser]="editingUser"
        [saving]="saving()"
        [agencies]="agencies()"
        [advertisers]="advertisers()"
        (save)="saveUser($event)"
        (closeModal)="cancelEdit()"
      />

      <!-- Delete Confirmation Modal -->
      <app-user-delete-modal
        [user]="deletingUser"
        [saving]="saving()"
        (confirm)="deleteUser()"
        (closeModal)="deletingUser = null"
      />
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

      @media (max-width: 768px) {
        .container {
          padding: 1rem;
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
        }
      }
    `,
  ],
})
export class UsersManagementComponent implements OnInit {
  readonly dataService = inject(UsersManagementDataService);
  readonly filtersService = inject(UserFiltersService);
  private readonly validationService = inject(UserValidationService);
  private readonly logger = inject(LoggerService);

  readonly users = this.dataService.users;
  readonly agencies = this.dataService.agencies;
  readonly advertisers = this.dataService.advertisers;
  readonly loading = this.dataService.loading;
  readonly saving = this.dataService.saving;
  readonly error = this.dataService.error;

  showCreateModal = false;
  editingUser: User | null = null;
  deletingUser: User | null = null;

  ngOnInit(): void {
    this.refreshData();
  }

  private refreshData(): void {
    this.dataService.loadUsers(this.filtersService.buildFilters());
    this.dataService.loadAgencies();
    this.dataService.loadAdvertisers();
  }

  onSearchChange(query: string): void {
    this.filtersService.searchQuery.set(query);
    this.dataService.loadUsers(this.filtersService.buildFilters());
  }

  onRoleChange(role: string): void {
    this.filtersService.filterRole.set(role as never);
    this.dataService.loadUsers(this.filtersService.buildFilters());
  }

  onStatusChange(status: string): void {
    this.filtersService.filterStatus.set(status as never);
    this.dataService.loadUsers(this.filtersService.buildFilters());
  }

  editUser(user: User): void {
    this.editingUser = user;
  }

  cancelEdit(): void {
    this.showCreateModal = false;
    this.editingUser = null;
  }

  saveUser(event: UserFormSaveEvent): void {
    const validation = event.isEdit
      ? this.validationService.validateForUpdate(event.form)
      : this.validationService.validateForCreate(event.form);

    if (!validation.valid) return;

    this.dataService.saving.set(true);

    if (event.isEdit && this.editingUser) {
      const data: UpdateUserData = {
        email: event.form.email.trim(),
        full_name: event.form.full_name.trim(),
        role: event.form.role,
        advertiser_id: event.form.advertiser_id,
        agency_id: event.form.agency_id,
      };

      this.dataService.updateUser(this.editingUser.id, data).subscribe({
        next: (response) => {
          if (response.success) {
            this.dataService.loadUsers(this.filtersService.buildFilters());
            this.cancelEdit();
          } else {
            this.dataService.error.set('Erreur lors de la mise a jour');
          }
          this.dataService.saving.set(false);
        },
        error: (err) => {
          const message = ErrorExtractor.getMessage(err);
          this.logger.error('Failed to update user', { error: message, userId: this.editingUser?.id });
          this.dataService.error.set(message);
          this.dataService.saving.set(false);
        },
      });
    } else {
      const data: CreateUserData = {
        email: event.form.email.trim(),
        password: event.form.password,
        full_name: event.form.full_name.trim(),
        role: event.form.role,
        advertiser_id: event.form.advertiser_id,
        agency_id: event.form.agency_id,
      };

      this.dataService.createUser(data).subscribe({
        next: (response) => {
          if (response.success) {
            this.dataService.loadUsers(this.filtersService.buildFilters());
            this.cancelEdit();
          } else {
            this.dataService.error.set('Erreur lors de la creation');
          }
          this.dataService.saving.set(false);
        },
        error: (err) => {
          const message = ErrorExtractor.getMessage(err);
          this.logger.error('Failed to create user', { error: message, email: data.email });
          this.dataService.error.set(message);
          this.dataService.saving.set(false);
        },
      });
    }
  }

  confirmDelete(user: User): void {
    this.deletingUser = user;
  }

  deleteUser(): void {
    if (!this.deletingUser) return;

    this.dataService.saving.set(true);

    this.dataService.deleteUser(this.deletingUser.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.dataService.loadUsers(this.filtersService.buildFilters());
          this.deletingUser = null;
        } else {
          this.dataService.error.set('Erreur lors de la suppression');
        }
        this.dataService.saving.set(false);
      },
      error: (err) => {
        const message = ErrorExtractor.getMessage(err);
        this.logger.error('Failed to delete user', { error: message, userId: this.deletingUser?.id });
        this.dataService.error.set(message);
        this.dataService.saving.set(false);
      },
    });
  }

  toggleStatus(user: User, newStatus: UserStatus): void {
    this.dataService.toggleUserStatus(user.id, newStatus).subscribe({
      next: (response) => {
        if (response.success) {
          this.dataService.loadUsers(this.filtersService.buildFilters());
        } else {
          this.dataService.error.set('Erreur lors du changement de statut');
        }
      },
      error: (err) => {
        const message = ErrorExtractor.getMessage(err);
        this.logger.error('Failed to toggle user status', { error: message, userId: user.id, newStatus });
        this.dataService.error.set(message);
      },
    });
  }
}
