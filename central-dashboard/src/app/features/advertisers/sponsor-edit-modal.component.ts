import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sponsor } from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="visible" (click)="closeModal.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Modifier le sponsor</h2>
          <button class="close-btn" (click)="closeModal.emit()">x</button>
        </div>

        <form (submit)="onSubmit($event)" class="modal-form">
          <div class="form-group">
            <label>Nom *</label>
            <input
              type="text"
              [(ngModel)]="editForm.name"
              name="name"
              required
              placeholder="Nom du sponsor"
            />
          </div>

          <div class="form-group">
            <label>Logo URL</label>
            <input
              type="url"
              [(ngModel)]="editForm.logo_url"
              name="logo_url"
              placeholder="https://..."
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Email de contact</label>
              <input
                type="email"
                [(ngModel)]="editForm.contact_email"
                name="contact_email"
                placeholder="contact@sponsor.com"
              />
            </div>

            <div class="form-group">
              <label>Telephone</label>
              <input
                type="tel"
                [(ngModel)]="editForm.contact_phone"
                name="contact_phone"
                placeholder="+33 1 23 45 67 89"
              />
            </div>
          </div>

          <div class="form-group">
            <label>Site web</label>
            <input
              type="url"
              [(ngModel)]="editForm.website"
              name="website"
              placeholder="https://www.sponsor.com"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Debut du contrat</label>
              <input
                type="date"
                [(ngModel)]="editForm.contract_start"
                name="contract_start"
              />
            </div>

            <div class="form-group">
              <label>Fin du contrat</label>
              <input
                type="date"
                [(ngModel)]="editForm.contract_end"
                name="contract_end"
              />
            </div>
          </div>

          <div class="form-group">
            <label>Statut</label>
            <select [(ngModel)]="editForm.status" name="status">
              <option value="active">Actif</option>
              <option value="paused">En pause</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>

          <div class="form-group">
            <label>Notes</label>
            <textarea
              [(ngModel)]="editForm.notes"
              name="notes"
              rows="4"
              placeholder="Notes internes sur ce sponsor..."
            ></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="closeModal.emit()">
              Annuler
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="saving">
              {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </form>
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

    .modal-form {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.9rem;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
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

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SponsorEditModalComponent implements OnChanges {
  @Input() sponsor: Sponsor | null = null;
  @Input() visible = false;
  @Input() saving = false;
  @Output() save = new EventEmitter<Partial<Sponsor>>();
  @Output() closeModal = new EventEmitter<void>();

  editForm: Partial<Sponsor> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sponsor'] && this.sponsor) {
      this.editForm = { ...this.sponsor };
    }
    if (changes['visible'] && !this.visible) {
      this.editForm = {};
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.save.emit(this.editForm);
  }
}
