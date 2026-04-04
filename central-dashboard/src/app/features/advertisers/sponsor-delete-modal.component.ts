import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-sponsor-delete-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-overlay" *ngIf="visible" (click)="closeModal.emit()">
      <div class="modal modal-sm" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Confirmer la suppression</h2>
          <button class="close-btn" (click)="closeModal.emit()">x</button>
        </div>

        <div class="modal-body">
          <p>Etes-vous sur de vouloir supprimer le sponsor <strong>{{ sponsorName }}</strong> ?</p>
          <p class="warning">Cette action est irreversible et supprimera egalement toutes les associations avec les videos.</p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="closeModal.emit()">
            Annuler
          </button>
          <button class="btn btn-danger" (click)="confirm.emit()" [disabled]="deleting">
            {{ deleting ? ('common.deleting' | translate) : ('common.deletePermanently' | translate) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
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
    }

    .modal {
      background: white;
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-sm {
      max-width: 450px;
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: #f3f4f6;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-body .warning {
      color: #dc2626;
      font-size: 0.9rem;
      margin-top: 1rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding: 0 1.5rem 1.5rem;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class SponsorDeleteModalComponent {
  @Input() sponsorName = '';
  @Input() visible = false;
  @Input() deleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();
}
