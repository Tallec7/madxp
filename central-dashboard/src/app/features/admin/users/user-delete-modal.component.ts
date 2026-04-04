import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { User } from '../../../core/services/users.service';

@Component({
  selector: 'app-user-delete-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    @if (user) {
      <div class="modal-overlay" (click)="closeModal.emit()">
        <div class="modal modal-small" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ 'users.deleteConfirm' | translate }}</h3>
          </div>
          <div class="modal-body">
            <p>
              Etes-vous sur de vouloir supprimer l'utilisateur "{{ user.email }}" ? Cette action est
              irreversible.
            </p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeModal.emit()">
              {{ 'common.cancel' | translate }}
            </button>
            <button
              type="button"
              class="btn btn-danger"
              (click)="confirm.emit()"
              [disabled]="saving"
            >
              {{ saving ? 'Suppression...' : ('common.delete' | translate) }}
            </button>
          </div>
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
        padding: 0 1.5rem 1.5rem;
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

      .btn-secondary {
        background: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      .btn-secondary:hover {
        background: #e2e8f0;
      }

      .btn-danger {
        background: #dc2626;
        color: white;
      }
      .btn-danger:hover {
        background: #b91c1c;
      }
      .btn-danger:disabled {
        background: #fca5a5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class UserDeleteModalComponent {
  @Input() user: User | null = null;
  @Input() saving = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();
}
