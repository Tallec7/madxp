import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { User } from '../../../core/services/users.service';
import { UserForm } from './user-validation.service';

export interface UserFormSaveEvent {
  form: UserForm;
  isEdit: boolean;
}

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    @if (visible || editingUser) {
      <div class="modal-overlay" (click)="closeModal.emit()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingUser ? ('users.editUser' | translate) : ('users.addUser' | translate) }}</h3>
          </div>
          <form (ngSubmit)="onSave()" class="modal-body">
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
                <option value="advertiser">Annonceur</option>
                <option value="agency">Agence</option>
              </select>
            </div>
            @if (userForm.role === 'advertiser') {
              <div class="form-group">
                <label>Annonceur associe</label>
                <select [(ngModel)]="userForm.advertiser_id" name="advertiser_id">
                  <option [ngValue]="null">Selectionnez un annonceur</option>
                  @for (advertiser of advertisers; track advertiser.id) {
                    <option [ngValue]="advertiser.id">{{ advertiser.name }}</option>
                  }
                </select>
              </div>
            }
            @if (userForm.role === 'agency') {
              <div class="form-group">
                <label>Agence associee</label>
                <select [(ngModel)]="userForm.agency_id" name="agency_id">
                  <option [ngValue]="null">Selectionnez une agence</option>
                  @for (agency of agencies; track agency.id) {
                    <option [ngValue]="agency.id">{{ agency.name }}</option>
                  }
                </select>
              </div>
            }
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeModal.emit()">
                {{ 'common.cancel' | translate }}
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                {{ saving ? ('common.loading' | translate) : ('common.save' | translate) }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [
    `
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
    `,
  ],
})
export class UserFormModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editingUser: User | null = null;
  @Input() saving = false;
  @Input() agencies: { id: string; name: string }[] = [];
  @Input() advertisers: { id: string; name: string }[] = [];

  @Output() save = new EventEmitter<UserFormSaveEvent>();
  @Output() closeModal = new EventEmitter<void>();

  userForm: UserForm = {
    email: '',
    password: '',
    full_name: '',
    role: 'viewer',
    advertiser_id: null,
    agency_id: null,
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editingUser'] && this.editingUser) {
      this.userForm = {
        email: this.editingUser.email,
        password: '',
        full_name: this.editingUser.full_name || '',
        role: this.editingUser.role,
        advertiser_id: this.editingUser.advertiser_id,
        agency_id: this.editingUser.agency_id,
      };
    } else if (changes['visible'] && this.visible && !this.editingUser) {
      this.userForm = {
        email: '',
        password: '',
        full_name: '',
        role: 'viewer',
        advertiser_id: null,
        agency_id: null,
      };
    }
  }

  onSave(): void {
    this.save.emit({
      form: { ...this.userForm },
      isEdit: !!this.editingUser,
    });
  }
}
