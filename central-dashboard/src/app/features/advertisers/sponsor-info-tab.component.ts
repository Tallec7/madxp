import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sponsor } from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-info-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="info-tab">
      <div class="info-grid">
        <div class="info-card">
          <h3>Contact</h3>
          <div class="info-row">
            <span class="label">Email:</span>
            <span class="value">{{ sponsor.contact_email || 'Non renseigné' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Téléphone:</span>
            <span class="value">{{ sponsor.contact_phone || 'Non renseigné' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Site web:</span>
            <a *ngIf="sponsor.website" [href]="sponsor.website" target="_blank" class="value link">
              {{ sponsor.website }}
            </a>
            <span *ngIf="!sponsor.website" class="value">Non renseigné</span>
          </div>
        </div>

        <div class="info-card">
          <h3>Contrat</h3>
          <div class="info-row">
            <span class="label">Début:</span>
            <span class="value">{{ formatDate(sponsor.contract_start) || 'Non défini' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Fin:</span>
            <span class="value">{{ formatDate(sponsor.contract_end) || 'Non défini' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Statut:</span>
            <span class="status-badge" [class]="'status-' + sponsor.status">
              {{ getStatusLabel(sponsor.status) }}
            </span>
          </div>
        </div>

        <div class="info-card full-width">
          <h3>Notes</h3>
          <p class="notes">{{ sponsor.notes || 'Aucune note' }}</p>
        </div>

        <div class="info-card">
          <h3>Métadonnées</h3>
          <div class="info-row">
            <span class="label">Créé le:</span>
            <span class="value">{{ formatDateTime(sponsor.created_at) }}</span>
          </div>
          <div class="info-row">
            <span class="label">Modifié le:</span>
            <span class="value">{{ formatDateTime(sponsor.updated_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .info-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
    }

    .info-card.full-width {
      grid-column: 1 / -1;
    }

    .info-card h3 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row .label {
      color: #6b7280;
      font-weight: 500;
    }

    .info-row .value {
      color: #111827;
    }

    .info-row .value.link {
      color: #2563eb;
      text-decoration: none;
    }

    .info-row .value.link:hover {
      text-decoration: underline;
    }

    .notes {
      color: #374151;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status-active {
      background: #d1fae5;
      color: #065f46;
    }

    .status-paused {
      background: #fef3c7;
      color: #92400e;
    }

    .status-inactive {
      background: #f3f4f6;
      color: #6b7280;
    }

    @media (max-width: 768px) {
      .info-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SponsorInfoTabComponent {
  @Input({ required: true }) sponsor!: Sponsor;

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Actif',
      paused: 'En pause',
      inactive: 'Inactif'
    };
    return labels[status] || status;
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
