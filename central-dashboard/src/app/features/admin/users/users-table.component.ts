import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { User, UserRole, UserStatus } from '../../../core/services/users.service';

@Component({
  selector: 'app-users-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
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
          @for (user of users; track user.id) {
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
                  @if (user.advertiser_name) {
                    <span class="sub-info advertiser">Annonceur: {{ user.advertiser_name }}</span>
                  }
                  @if (user.agency_name) {
                    <span class="sub-info agency">Agence: {{ user.agency_name }}</span>
                  }
                </div>
              </td>
              <td>
                <span class="badge" [class]="'badge-' + user.role">
                  {{ getRoleLabel(user.role) }}
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
                <button class="btn-link btn-edit" (click)="edit.emit(user)">
                  {{ 'common.edit' | translate }}
                </button>
                @if (user.status === 'active') {
                  <button
                    class="btn-link btn-warning"
                    (click)="toggleStatus.emit({ user: user, status: 'inactive' })"
                  >
                    Desactiver
                  </button>
                } @else {
                  <button
                    class="btn-link btn-success"
                    (click)="toggleStatus.emit({ user: user, status: 'active' })"
                  >
                    Activer
                  </button>
                }
                <button class="btn-link btn-danger" (click)="delete.emit(user)">
                  {{ 'common.delete' | translate }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
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

      .sub-info.advertiser {
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
      .badge-advertiser {
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

      @media (max-width: 768px) {
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
export class UsersTableComponent {
  @Input() users: User[] = [];

  @Output() edit = new EventEmitter<User>();
  @Output() toggleStatus = new EventEmitter<{ user: User; status: UserStatus }>();
  @Output() delete = new EventEmitter<User>();

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

  getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrateur',
      operator: 'Operateur',
      viewer: 'Observateur',
      advertiser: 'Annonceur',
      sponsor: 'Sponsor',
      agency: 'Agence',
    };
    return labels[role] || role;
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
