/**
 * SiteSubscriptionTabComponent
 *
 * Onglet de gestion de l'abonnement dans site-detail
 * Affiche le statut, permet de prolonger, suspendre, réactiver
 */
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Site, SiteSubscription, SubscriptionHistoryEntry, LicenseStatusResponse, SuspensionReason, SubscriptionPlan } from '../../../../core/models';
import { SubscriptionService } from '../../../../core/services/subscription.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { SubscriptionBadgeComponent } from '../../../../shared/components/subscription-badge/subscription-badge.component';

@Component({
  selector: 'app-site-subscription-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SubscriptionBadgeComponent],
  template: `
    <div class="subscription-tab">
      <!-- Header avec statut principal -->
      <div class="subscription-header">
        <div class="status-card">
          <div class="status-icon" [class]="'status-' + getStatusClass()">
            {{ getStatusIcon() }}
          </div>
          <div class="status-info">
            <h3>{{ getStatusTitle() }}</h3>
            <p class="status-description">{{ getStatusDescription() }}</p>
          </div>
          <app-subscription-badge
            [subscriptionEnd]="site?.subscription_end || null"
            [plan]="site?.subscription_plan || 'standard'"
            [suspended]="site?.suspended || false"
            [suspensionReason]="site?.suspension_reason || null"
            [showText]="true"
          ></app-subscription-badge>
        </div>
      </div>

      <!-- Informations d'abonnement -->
      <div class="subscription-details card">
        <h4>📋 Informations d'abonnement</h4>
        <div class="details-grid">
          <div class="detail-item">
            <label>Plan</label>
            <span class="plan-badge" [class]="'plan-' + (site?.subscription_plan || 'standard')">
              {{ getPlanLabel(site?.subscription_plan) }}
            </span>
          </div>
          <div class="detail-item">
            <label>Date de début</label>
            <span>{{ formatDate(site?.subscription_start) }}</span>
          </div>
          <div class="detail-item">
            <label>Date de fin</label>
            <span [class.text-danger]="isExpired()" [class.text-warning]="isExpiringSoon()">
              {{ formatDate(site?.subscription_end) }}
              <span *ngIf="getDaysLeft() !== null" class="days-indicator">
                ({{ getDaysLeftText() }})
              </span>
            </span>
          </div>
          <div class="detail-item" *ngIf="site?.suspended">
            <label>Suspendu depuis</label>
            <span class="text-danger">{{ formatDate(site?.suspension_date) }}</span>
          </div>
          <div class="detail-item" *ngIf="site?.suspended && site?.suspension_reason">
            <label>Motif de suspension</label>
            <span class="text-danger">{{ getSuspensionLabel(site?.suspension_reason) }}</span>
          </div>
          <div class="detail-item" *ngIf="site?.suspension_note">
            <label>Note</label>
            <span class="note-text">{{ site?.suspension_note }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="subscription-actions card">
        <h4>⚡ Actions</h4>
        <div class="actions-grid">
          <button
            class="btn btn-primary"
            (click)="showExtendModal = true"
            [disabled]="site?.suspended"
          >
            📅 Prolonger l'abonnement
          </button>

          <button
            class="btn btn-warning"
            (click)="showSuspendModal = true"
            *ngIf="!site?.suspended"
          >
            ⏸ Suspendre le site
          </button>

          <button
            class="btn btn-success"
            (click)="showReactivateModal = true"
            *ngIf="site?.suspended"
          >
            ▶️ Réactiver le site
          </button>

          <button
            class="btn btn-secondary"
            (click)="showChangePlanModal = true"
          >
            🔄 Changer de plan
          </button>

          <button
            class="btn btn-outline"
            (click)="loadLicenseStatus()"
            [disabled]="loadingLicenseStatus"
          >
            🔍 {{ loadingLicenseStatus ? 'Chargement...' : 'Voir le statut de licence' }}
          </button>
        </div>
      </div>

      <!-- Statut de licence (preview) -->
      <div class="license-status card" *ngIf="licenseStatus">
        <h4>🔐 Statut de licence (tel qu'envoyé au Pi)</h4>
        <div class="license-grid">
          <div class="license-item">
            <label>Statut</label>
            <span class="license-badge" [class]="'license-' + licenseStatus.status.toLowerCase()">
              {{ licenseStatus.status }}
            </span>
          </div>
          <div class="license-item" *ngIf="licenseStatus.reason">
            <label>Raison</label>
            <span>{{ licenseStatus.reason }}</span>
          </div>
          <div class="license-item" *ngIf="licenseStatus.days_left !== undefined">
            <label>Jours restants</label>
            <span>{{ licenseStatus.days_left }}</span>
          </div>
          <div class="license-item" *ngIf="licenseStatus.days_expired !== undefined">
            <label>Jours d'expiration</label>
            <span class="text-danger">{{ licenseStatus.days_expired }}</span>
          </div>
          <div class="license-item">
            <label>Cache valide jusqu'au</label>
            <span>{{ formatDateTime(licenseStatus.cache_valid_until) }}</span>
          </div>
          <div class="license-item" *ngIf="licenseStatus.message_tv">
            <label>Message TV</label>
            <span class="message-preview">{{ licenseStatus.message_tv }}</span>
          </div>
          <div class="license-item" *ngIf="licenseStatus.message_remote">
            <label>Message Remote</label>
            <span class="message-preview">{{ licenseStatus.message_remote }}</span>
          </div>
        </div>
      </div>

      <!-- Historique -->
      <div class="subscription-history card">
        <h4>📜 Historique des changements</h4>
        <div *ngIf="loadingHistory" class="loading">Chargement...</div>
        <div *ngIf="!loadingHistory && history.length === 0" class="empty-history">
          Aucun historique disponible
        </div>
        <table class="history-table" *ngIf="!loadingHistory && history.length > 0">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Détails</th>
              <th>Par</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let entry of history">
              <td>{{ formatDateTime(entry.created_at) }}</td>
              <td>
                <span class="action-badge" [class]="'action-' + entry.action">
                  {{ getActionLabel(entry.action) }}
                </span>
              </td>
              <td>
                <span *ngIf="entry.new_end_date">Nouvelle fin: {{ formatDate(entry.new_end_date) }}</span>
                <span *ngIf="entry.reason">Motif: {{ getSuspensionLabel(entry.reason) }}</span>
                <span *ngIf="entry.note" class="note-text">{{ entry.note }}</span>
              </td>
              <td>{{ entry.performed_by_name || 'Système' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal Prolonger -->
      <div class="modal" *ngIf="showExtendModal" (click)="showExtendModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>📅 Prolonger l'abonnement</h3>
            <button class="modal-close" (click)="showExtendModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nouvelle date de fin</label>
              <input type="date" [(ngModel)]="extendForm.newEndDate" [min]="getMinExtendDate()">
            </div>
            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea [(ngModel)]="extendForm.note" placeholder="Raison de la prolongation..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showExtendModal = false">Annuler</button>
            <button class="btn btn-primary" (click)="extendSubscription()" [disabled]="!extendForm.newEndDate || extending">
              {{ extending ? 'Prolongation...' : 'Prolonger' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Suspendre -->
      <div class="modal" *ngIf="showSuspendModal" (click)="showSuspendModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>⏸ Suspendre le site</h3>
            <button class="modal-close" (click)="showSuspendModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="warning-box">
              ⚠️ La suspension bloquera immédiatement l'accès /tv et /remote sur le Pi.
            </div>
            <div class="form-group">
              <label>Motif de suspension *</label>
              <select [(ngModel)]="suspendForm.reason">
                <option value="">Sélectionner un motif...</option>
                <option value="unpaid">Impayé</option>
                <option value="abuse">Utilisation abusive</option>
                <option value="maintenance">Maintenance</option>
                <option value="request">À la demande du client</option>
                <option value="hardware">Problème matériel</option>
              </select>
            </div>
            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea [(ngModel)]="suspendForm.note" placeholder="Détails supplémentaires..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showSuspendModal = false">Annuler</button>
            <button class="btn btn-warning" (click)="suspendSite()" [disabled]="!suspendForm.reason || suspending">
              {{ suspending ? 'Suspension...' : 'Suspendre' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Réactiver -->
      <div class="modal" *ngIf="showReactivateModal" (click)="showReactivateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>▶️ Réactiver le site</h3>
            <button class="modal-close" (click)="showReactivateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nouvelle date de fin (optionnel)</label>
              <input type="date" [(ngModel)]="reactivateForm.newEndDate" [min]="getTodayDate()">
              <small>Laissez vide pour conserver la date actuelle</small>
            </div>
            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea [(ngModel)]="reactivateForm.note" placeholder="Raison de la réactivation..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showReactivateModal = false">Annuler</button>
            <button class="btn btn-success" (click)="reactivateSite()" [disabled]="reactivating">
              {{ reactivating ? 'Réactivation...' : 'Réactiver' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Changer de plan -->
      <div class="modal" *ngIf="showChangePlanModal" (click)="showChangePlanModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>🔄 Changer de plan</h3>
            <button class="modal-close" (click)="showChangePlanModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nouveau plan *</label>
              <div class="plan-options">
                <label class="plan-option" [class.selected]="changePlanForm.plan === 'trial'">
                  <input type="radio" name="plan" value="trial" [(ngModel)]="changePlanForm.plan">
                  <span class="plan-icon">🎁</span>
                  <span class="plan-name">Essai</span>
                  <span class="plan-desc">Période d'essai gratuite</span>
                </label>
                <label class="plan-option" [class.selected]="changePlanForm.plan === 'standard'">
                  <input type="radio" name="plan" value="standard" [(ngModel)]="changePlanForm.plan">
                  <span class="plan-icon">📺</span>
                  <span class="plan-name">Standard</span>
                  <span class="plan-desc">Fonctionnalités de base</span>
                </label>
                <label class="plan-option" [class.selected]="changePlanForm.plan === 'premium'">
                  <input type="radio" name="plan" value="premium" [(ngModel)]="changePlanForm.plan">
                  <span class="plan-icon">⭐</span>
                  <span class="plan-name">Premium</span>
                  <span class="plan-desc">Toutes les fonctionnalités</span>
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>Note (optionnel)</label>
              <textarea [(ngModel)]="changePlanForm.note" placeholder="Raison du changement..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showChangePlanModal = false">Annuler</button>
            <button class="btn btn-primary" (click)="changePlan()" [disabled]="!changePlanForm.plan || changingPlan">
              {{ changingPlan ? 'Changement...' : 'Changer de plan' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .subscription-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .subscription-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 1.5rem;
      color: white;
    }

    .status-card {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-icon {
      font-size: 2.5rem;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
    }

    .status-icon.status-active { background: rgba(76, 175, 80, 0.3); }
    .status-icon.status-warning { background: rgba(255, 152, 0, 0.3); }
    .status-icon.status-danger { background: rgba(244, 67, 54, 0.3); }
    .status-icon.status-suspended { background: rgba(158, 158, 158, 0.3); }

    .status-info {
      flex: 1;
    }

    .status-info h3 {
      margin: 0;
      font-size: 1.25rem;
    }

    .status-description {
      margin: 0.25rem 0 0 0;
      opacity: 0.9;
      font-size: 0.875rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h4 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #374151;
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .detail-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .detail-item label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-item span {
      font-size: 0.9rem;
      color: #111827;
    }

    .plan-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .plan-trial { background: #e0f2fe; color: #0369a1; }
    .plan-standard { background: #f3f4f6; color: #374151; }
    .plan-premium { background: #fef3c7; color: #b45309; }

    .text-danger { color: #dc2626; }
    .text-warning { color: #d97706; }

    .days-indicator {
      font-size: 0.8rem;
      opacity: 0.8;
    }

    .note-text {
      font-style: italic;
      color: #6b7280;
    }

    .actions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.625rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }

    .btn-secondary { background: #f3f4f6; color: #374151; }
    .btn-secondary:hover:not(:disabled) { background: #e5e7eb; }

    .btn-success { background: #059669; color: white; }
    .btn-success:hover:not(:disabled) { background: #047857; }

    .btn-warning { background: #d97706; color: white; }
    .btn-warning:hover:not(:disabled) { background: #b45309; }

    .btn-outline {
      background: white;
      color: #2563eb;
      border: 1px solid #2563eb;
    }
    .btn-outline:hover:not(:disabled) { background: #eff6ff; }

    /* License status */
    .license-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .license-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .license-item label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
    }

    .license-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .license-valid { background: #d1fae5; color: #065f46; }
    .license-warning { background: #fef3c7; color: #b45309; }
    .license-grace_period { background: #fed7aa; color: #c2410c; }
    .license-connection_warning { background: #e0e7ff; color: #3730a3; }
    .license-blocked { background: #fee2e2; color: #b91c1c; }

    .message-preview {
      font-size: 0.8rem;
      padding: 0.5rem;
      background: #f9fafb;
      border-radius: 4px;
      font-style: italic;
    }

    /* History table */
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .history-table th,
    .history-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    .history-table th {
      font-weight: 600;
      color: #6b7280;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .action-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .action-activated { background: #d1fae5; color: #065f46; }
    .action-renewed { background: #dbeafe; color: #1e40af; }
    .action-suspended { background: #fee2e2; color: #b91c1c; }
    .action-reactivated { background: #d1fae5; color: #065f46; }
    .action-expired { background: #f3f4f6; color: #6b7280; }
    .action-plan_changed { background: #fef3c7; color: #b45309; }

    .loading, .empty-history {
      padding: 2rem;
      text-align: center;
      color: #6b7280;
    }

    /* Modal styles */
    .modal {
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

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.125rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #9ca3af;
      cursor: pointer;
    }

    .modal-close:hover { color: #6b7280; }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
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
      padding: 0.625rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: #6b7280;
      font-size: 0.75rem;
    }

    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }

    .warning-box {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #92400e;
    }

    .plan-options {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .plan-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .plan-option:hover {
      border-color: #d1d5db;
    }

    .plan-option.selected {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .plan-option input {
      display: none;
    }

    .plan-icon {
      font-size: 1.5rem;
    }

    .plan-name {
      font-weight: 600;
      color: #111827;
    }

    .plan-desc {
      font-size: 0.75rem;
      color: #6b7280;
      margin-left: auto;
    }

    /* === Responsive === */
    @media (max-width: 768px) {
      .subscription-tab {
        padding: 0.75rem;
      }

      .details-grid {
        grid-template-columns: 1fr;
      }

      .actions-grid {
        flex-direction: column;
      }

      .subscription-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .status-card {
        padding: 0.75rem;
      }

      .modal {
        width: 95vw;
      }

      .license-grid {
        grid-template-columns: 1fr;
      }

      .plan-option {
        padding: 0.75rem;
      }
    }
  `]
})
export class SiteSubscriptionTabComponent implements OnInit, OnChanges {
  @Input() site: Site | null = null;
  @Output() subscriptionChanged = new EventEmitter<void>();

  private readonly subscriptionService = inject(SubscriptionService);
  private readonly notificationService = inject(NotificationService);
  private readonly logger = inject(LoggerService);

  // State
  history: SubscriptionHistoryEntry[] = [];
  licenseStatus: LicenseStatusResponse | null = null;
  loadingHistory = false;
  loadingLicenseStatus = false;

  // Modals
  showExtendModal = false;
  showSuspendModal = false;
  showReactivateModal = false;
  showChangePlanModal = false;

  // Form states
  extending = false;
  suspending = false;
  reactivating = false;
  changingPlan = false;

  // Forms
  extendForm = { newEndDate: '', note: '' };
  suspendForm = { reason: '' as SuspensionReason | '', note: '' };
  reactivateForm = { newEndDate: '', note: '' };
  changePlanForm = { plan: '' as SubscriptionPlan | '', note: '' };

  ngOnInit(): void {
    if (this.site) {
      this.loadHistory();
      this.changePlanForm.plan = this.site.subscription_plan || 'standard';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['site'] && this.site) {
      this.loadHistory();
      this.changePlanForm.plan = this.site.subscription_plan || 'standard';
      this.licenseStatus = null;
    }
  }

  loadHistory(): void {
    if (!this.site) return;

    this.loadingHistory = true;
    this.subscriptionService.getSubscriptionHistory(this.site.id).subscribe({
      next: (response) => {
        this.history = response.data;
        this.loadingHistory = false;
      },
      error: (error) => {
        this.logger.warn('Failed to load subscription history', { error: ErrorExtractor.getMessage(error) });
        this.loadingHistory = false;
      }
    });
  }

  loadLicenseStatus(): void {
    if (!this.site) return;

    this.loadingLicenseStatus = true;
    this.subscriptionService.getLicenseStatus(this.site.id).subscribe({
      next: (status) => {
        this.licenseStatus = status;
        this.loadingLicenseStatus = false;
      },
      error: (error) => {
        this.logger.error('Failed to load license status', { error: ErrorExtractor.getMessage(error) });
        this.notificationService.error('Erreur lors du chargement du statut de licence');
        this.loadingLicenseStatus = false;
      }
    });
  }

  // Actions
  extendSubscription(): void {
    if (!this.site || !this.extendForm.newEndDate) return;

    this.extending = true;
    this.subscriptionService.extendSubscription(this.site.id, {
      new_end_date: this.extendForm.newEndDate,
      note: this.extendForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Abonnement prolongé avec succès');
        this.showExtendModal = false;
        this.extendForm = { newEndDate: '', note: '' };
        this.loadHistory();
        this.extending = false;
        // Trigger parent refresh
        this.subscriptionChanged.emit();
      },
      error: (error) => {
        this.notificationService.error('Erreur lors de la prolongation: ' + ErrorExtractor.getMessage(error));
        this.extending = false;
      }
    });
  }

  suspendSite(): void {
    if (!this.site || !this.suspendForm.reason) return;

    this.suspending = true;
    this.subscriptionService.suspendSite(this.site.id, {
      reason: this.suspendForm.reason as SuspensionReason,
      note: this.suspendForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Site suspendu');
        this.showSuspendModal = false;
        this.suspendForm = { reason: '', note: '' };
        this.loadHistory();
        this.suspending = false;
        this.subscriptionChanged.emit();
      },
      error: (error) => {
        this.notificationService.error('Erreur lors de la suspension: ' + ErrorExtractor.getMessage(error));
        this.suspending = false;
      }
    });
  }

  reactivateSite(): void {
    if (!this.site) return;

    this.reactivating = true;
    this.subscriptionService.reactivateSite(this.site.id, {
      new_end_date: this.reactivateForm.newEndDate || undefined,
      note: this.reactivateForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Site réactivé');
        this.showReactivateModal = false;
        this.reactivateForm = { newEndDate: '', note: '' };
        this.loadHistory();
        this.reactivating = false;
        this.subscriptionChanged.emit();
      },
      error: (error) => {
        this.notificationService.error('Erreur lors de la réactivation: ' + ErrorExtractor.getMessage(error));
        this.reactivating = false;
      }
    });
  }

  changePlan(): void {
    if (!this.site || !this.changePlanForm.plan) return;

    this.changingPlan = true;
    this.subscriptionService.changePlan(this.site.id, {
      plan: this.changePlanForm.plan as SubscriptionPlan,
      note: this.changePlanForm.note || undefined
    }).subscribe({
      next: () => {
        this.notificationService.success('Plan modifié avec succès');
        this.showChangePlanModal = false;
        this.changePlanForm.note = '';
        this.loadHistory();
        this.changingPlan = false;
        this.subscriptionChanged.emit();
      },
      error: (error) => {
        this.notificationService.error('Erreur lors du changement de plan: ' + ErrorExtractor.getMessage(error));
        this.changingPlan = false;
      }
    });
  }

  // Helpers
  getStatusClass(): string {
    if (this.site?.suspended) return 'suspended';
    if (this.isExpired()) return 'danger';
    if (this.isExpiringSoon()) return 'warning';
    return 'active';
  }

  getStatusIcon(): string {
    if (this.site?.suspended) return '⏸';
    if (this.isExpired()) return '🚫';
    if (this.isExpiringSoon()) return '⏳';
    return '✓';
  }

  getStatusTitle(): string {
    if (this.site?.suspended) return 'Site Suspendu';
    if (this.isExpired()) return 'Abonnement Expiré';
    if (this.isExpiringSoon()) return 'Expiration Proche';
    return 'Abonnement Actif';
  }

  getStatusDescription(): string {
    if (this.site?.suspended) {
      return `Suspendu: ${this.getSuspensionLabel(this.site.suspension_reason)}`;
    }
    const days = this.getDaysLeft();
    if (days !== null && days < 0) {
      return `Expiré depuis ${Math.abs(days)} jour(s)`;
    }
    if (days !== null && days <= 30) {
      return `Expire dans ${days} jour(s)`;
    }
    if (!this.site?.subscription_end) {
      return 'Abonnement sans date d\'expiration';
    }
    return `Valide jusqu'au ${this.formatDate(this.site.subscription_end)}`;
  }

  isExpired(): boolean {
    if (!this.site?.subscription_end) return false;
    return new Date(this.site.subscription_end) < new Date();
  }

  isExpiringSoon(): boolean {
    if (!this.site?.subscription_end) return false;
    const endDate = new Date(this.site.subscription_end);
    const now = new Date();
    const diffDays = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }

  getDaysLeft(): number | null {
    if (!this.site?.subscription_end) return null;
    const endDate = new Date(this.site.subscription_end);
    const now = new Date();
    return Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  getDaysLeftText(): string {
    const days = this.getDaysLeft();
    if (days === null) return '';
    if (days < 0) return `expiré depuis ${Math.abs(days)} j`;
    if (days === 0) return 'expire aujourd\'hui';
    if (days === 1) return 'expire demain';
    return `${days} jours restants`;
  }

  getPlanLabel(plan?: string | null): string {
    const labels: Record<string, string> = {
      trial: 'Essai',
      standard: 'Standard',
      premium: 'Premium'
    };
    return labels[plan || 'standard'] || 'Standard';
  }

  getSuspensionLabel(reason?: string | null): string {
    if (!reason) return 'Non spécifié';
    const labels: Record<string, string> = {
      unpaid: 'Impayé',
      expired: 'Abonnement expiré',
      abuse: 'Utilisation abusive',
      maintenance: 'Maintenance',
      request: 'À la demande du client',
      hardware: 'Problème matériel',
      trial_ended: 'Fin de période d\'essai',
      connection: 'Connexion requise'
    };
    return labels[reason] || reason;
  }

  getActionLabel(action: string): string {
    const labels: Record<string, string> = {
      activated: 'Activé',
      renewed: 'Renouvelé',
      suspended: 'Suspendu',
      reactivated: 'Réactivé',
      expired: 'Expiré',
      plan_changed: 'Plan modifié'
    };
    return labels[action] || action;
  }

  formatDate(date?: string | null): string {
    if (!date) return 'Non défini';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatDateTime(date?: string): string {
    if (!date) return 'Non défini';
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getMinExtendDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
