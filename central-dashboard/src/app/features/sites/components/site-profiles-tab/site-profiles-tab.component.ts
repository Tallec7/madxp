import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { Site, ConfigProfile, CreateProfilePayload, UpdateProfilePayload, SiteConfiguration } from '../../../../core/models';

@Component({
  selector: 'app-site-profiles-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="profiles-tab">
      <!-- Header -->
      <div class="profiles-header">
        <div class="profiles-title">
          <span class="profiles-icon">📑</span>
          <h4>{{ 'profiles.title' | translate }}</h4>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-secondary btn-sm"
            (click)="syncAllProfiles()"
            [disabled]="syncing || profiles.length === 0 || !isConnected"
          >
            {{ syncing ? ('profiles.syncing' | translate) : ('profiles.syncAll' | translate) }}
          </button>
          <button class="btn btn-primary btn-sm" (click)="openCreateModal()">
            + {{ 'profiles.create' | translate }}
          </button>
        </div>
      </div>

      <!-- Warning Pi offline -->
      <div class="warning-banner" *ngIf="!isConnected">
        <span class="warning-icon">⚠️</span>
        <span>Pi hors-ligne — les changements seront appliques a la reconnexion</span>
      </div>

      <!-- Info multi-config -->
      <div class="info-banner" *ngIf="profiles.length > 1">
        <span class="info-icon">ℹ️</span>
        <span>{{ profiles.length }} {{ 'profiles.multiConfigActive' | translate }}</span>
      </div>

      <!-- Loading -->
      <div class="loading-inline" *ngIf="loading">
        <div class="spinner-small"></div>
        <span>{{ 'common.loading' | translate }}</span>
      </div>

      <!-- Empty state -->
      <div class="empty-state" *ngIf="!loading && profiles.length === 0">
        <span class="empty-icon">📋</span>
        <p>{{ 'profiles.empty' | translate }}</p>
      </div>

      <!-- Profiles Grid -->
      <div class="profiles-grid" *ngIf="!loading && profiles.length > 0">
        <div
          class="profile-card"
          *ngFor="let profile of profiles"
          [class.is-default]="profile.is_default"
          [class.is-active]="site?.active_profile_id === profile.id"
        >
          <div class="profile-header">
            <div class="profile-name">{{ profile.name }}</div>
            <div class="profile-badges">
              <span class="badge-active" *ngIf="site?.active_profile_id === profile.id">
                ACTIF
              </span>
              <span class="badge-default" *ngIf="profile.is_default">
                {{ 'profiles.default' | translate }}
              </span>
            </div>
          </div>
          <div class="profile-display-name" *ngIf="profile.display_name">
            {{ profile.display_name }}
          </div>
          <div class="profile-meta">
            <span class="meta-badge" *ngIf="profile.city">📍 {{ profile.city }}</span>
            <span class="meta-badge" *ngIf="profile.sport">⚽ {{ profile.sport }}</span>
          </div>
          <div class="profile-date">
            {{ profile.updated_at | date:'dd/MM/yyyy HH:mm' }}
          </div>
          <div class="profile-actions">
            <button class="btn btn-sm btn-secondary" (click)="openEditModal(profile)">
              ✏️ {{ 'common.edit' | translate }}
            </button>
            <button
              class="btn btn-sm btn-primary"
              (click)="deployProfile(profile)"
              [disabled]="deploying[profile.id] || !isConnected"
            >
              {{ deploying[profile.id] ? ('common.deploying' | translate) : ('common.deploy' | translate) }}
            </button>
            <button
              class="btn btn-sm btn-danger"
              (click)="confirmDelete(profile)"
              [disabled]="deleting[profile.id] || profiles.length <= 1"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div class="modal" *ngIf="showModal" (click)="closeModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ editingProfile ? ('profiles.editTitle' | translate) : ('profiles.createTitle' | translate) }}</h2>
          <button class="modal-close" (click)="closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ 'profiles.nameLabel' | translate }} *</label>
            <input
              type="text"
              [(ngModel)]="formName"
              class="form-input"
              placeholder="ex: match-day"
              maxlength="255"
            />
          </div>
          <div class="form-group">
            <label>{{ 'profiles.displayNameLabel' | translate }}</label>
            <input
              type="text"
              [(ngModel)]="formDisplayName"
              class="form-input"
              placeholder="ex: Configuration Match"
              maxlength="255"
            />
          </div>
          <div class="settings-grid">
            <div class="form-group">
              <label>{{ 'profiles.cityLabel' | translate }}</label>
              <input type="text" [(ngModel)]="formCity" class="form-input" maxlength="255" />
            </div>
            <div class="form-group">
              <label>{{ 'profiles.sportLabel' | translate }}</label>
              <input type="text" [(ngModel)]="formSport" class="form-input" maxlength="100" />
            </div>
          </div>
          <div class="settings-grid">
            <div class="form-group">
              <label>{{ 'profiles.sortOrderLabel' | translate }}</label>
              <input type="number" [(ngModel)]="formSortOrder" class="form-input" min="0" />
            </div>
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="formIsDefault" />
                <span>{{ 'profiles.isDefault' | translate }}</span>
              </label>
            </div>
          </div>

          <!-- Configuration source (only for create) -->
          <div class="config-source" *ngIf="!editingProfile">
            <label class="config-source-label">{{ 'profiles.configSource' | translate }}</label>
            <div class="config-source-options">
              <label class="radio-option">
                <input type="radio" [(ngModel)]="formConfigSource" value="current" name="configSource" />
                <span>{{ 'profiles.configFromCurrent' | translate }}</span>
              </label>
              <label class="radio-option" *ngIf="profiles.length > 0">
                <input type="radio" [(ngModel)]="formConfigSource" value="profile" name="configSource" />
                <span>{{ 'profiles.configFromProfile' | translate }}</span>
              </label>
              <label class="radio-option">
                <input type="radio" [(ngModel)]="formConfigSource" value="empty" name="configSource" />
                <span>{{ 'profiles.configEmpty' | translate }}</span>
              </label>
            </div>
            <select
              *ngIf="formConfigSource === 'profile'"
              [(ngModel)]="formSourceProfileId"
              class="form-input"
            >
              <option value="">{{ 'profiles.selectProfile' | translate }}</option>
              <option *ngFor="let p of profiles" [value]="p.id">{{ p.name }}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="closeModal()">
            {{ 'common.cancel' | translate }}
          </button>
          <button
            class="btn btn-primary"
            (click)="saveProfile()"
            [disabled]="saving || !formName.trim()"
          >
            {{ saving ? ('common.saving' | translate) : ('common.save' | translate) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profiles-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .profiles-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .profiles-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .profiles-title h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .profiles-icon {
      font-size: 1.25rem;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .info-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #1e40af;
    }

    .info-icon {
      font-size: 1rem;
    }

    .profiles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }

    .profile-card {
      background: white;
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      border: 2px solid transparent;
      transition: border-color 0.2s;
    }

    .profile-card.is-default {
      border-color: #2563eb;
    }

    .profile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .profile-name {
      font-weight: 600;
      font-size: 1rem;
      color: #1e293b;
    }

    .profile-badges {
      display: flex;
      gap: 0.375rem;
      align-items: center;
    }

    .badge-default {
      background: #dcfce7;
      color: #166534;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-active {
      background: #fef3c7;
      color: #92400e;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .profile-card.is-active {
      border-color: #f59e0b;
    }

    .profile-card.is-active.is-default {
      border-color: #f59e0b;
    }

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #92400e;
    }

    .warning-icon {
      font-size: 1rem;
    }

    .profile-display-name {
      font-size: 0.875rem;
      color: #64748b;
    }

    .profile-meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .meta-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      background: #f1f5f9;
      border-radius: 4px;
      color: #475569;
    }

    .profile-date {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .profile-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.25rem;
      padding-top: 0.75rem;
      border-top: 1px solid #f1f5f9;
    }

    /* Form / Modal styles */
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 600px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.125rem;
    }

    .modal-close {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      font-size: 1.5rem;
      cursor: pointer;
      color: #64748b;
    }

    .modal-body {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .form-group label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
    }

    .form-input {
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .form-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .checkbox-group {
      display: flex;
      align-items: flex-end;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .config-source {
      margin-top: 0.5rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    .config-source-label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
      margin-bottom: 0.5rem;
      display: block;
    }

    .config-source-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: #334155;
    }

    /* Button styles */
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn-danger {
      background: #fee2e2;
      color: #dc2626;
    }

    .btn-danger:hover:not(:disabled) {
      background: #fecaca;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    /* Loading / Empty states */
    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
    }

    .spinner-small {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .empty-icon {
      font-size: 2.5rem;
      display: block;
      margin-bottom: 0.5rem;
    }
  `]
})
export class SiteProfilesTabComponent implements OnInit {
  @Input() siteId!: string;
  @Input() site!: Site | null;
  @Input() isConnected = false;
  @Output() profileDeployed = new EventEmitter<void>();

  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);
  private readonly logger = inject(LoggerService);

  // State
  profiles: ConfigProfile[] = [];
  loading = false;

  // Modal state
  showModal = false;
  editingProfile: ConfigProfile | null = null;
  saving = false;

  // Form fields
  formName = '';
  formDisplayName = '';
  formCity = '';
  formSport = '';
  formSortOrder = 0;
  formIsDefault = false;
  formConfigSource: 'current' | 'profile' | 'empty' = 'current';
  formSourceProfileId = '';

  // Action states
  deploying: Record<string, boolean> = {};
  deleting: Record<string, boolean> = {};
  syncing = false;

  ngOnInit(): void {
    this.loadProfiles();
  }

  loadProfiles(): void {
    this.loading = true;
    this.sitesService.getProfiles(this.siteId).subscribe({
      next: (response) => {
        this.profiles = response.profiles;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load profiles', { siteId: this.siteId, error: message });
        this.notificationService.error(message);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  openCreateModal(): void {
    this.editingProfile = null;
    this.formName = '';
    this.formDisplayName = '';
    this.formCity = this.site?.location?.city || '';
    this.formSport = this.site?.sports?.[0] || '';
    this.formSortOrder = this.profiles.length;
    this.formIsDefault = this.profiles.length === 0;
    this.formConfigSource = 'current';
    this.formSourceProfileId = '';
    this.showModal = true;
  }

  openEditModal(profile: ConfigProfile): void {
    this.editingProfile = profile;
    this.formName = profile.name;
    this.formDisplayName = profile.display_name || '';
    this.formCity = profile.city || '';
    this.formSport = profile.sport || '';
    this.formSortOrder = profile.sort_order;
    this.formIsDefault = profile.is_default;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingProfile = null;
  }

  saveProfile(): void {
    if (!this.formName.trim()) return;
    this.saving = true;

    if (this.editingProfile) {
      const payload: UpdateProfilePayload = {
        name: this.formName.trim(),
        display_name: this.formDisplayName.trim() || null,
        city: this.formCity.trim() || null,
        sport: this.formSport.trim() || null,
        sort_order: this.formSortOrder,
        is_default: this.formIsDefault,
      };
      this.sitesService.updateProfile(this.siteId, this.editingProfile.id, payload).subscribe({
        next: () => {
          this.saving = false;
          this.closeModal();
          this.notificationService.success('Profil mis a jour');
          this.loadProfiles();
        },
        error: (error) => {
          this.saving = false;
          this.notificationService.error(ErrorExtractor.getMessage(error));
        },
      });
    } else {
      const configuration = this.resolveConfiguration();
      const payload: CreateProfilePayload = {
        name: this.formName.trim(),
        display_name: this.formDisplayName.trim() || null,
        city: this.formCity.trim() || null,
        sport: this.formSport.trim() || null,
        sort_order: this.formSortOrder,
        is_default: this.formIsDefault,
        configuration,
      };
      this.sitesService.createProfile(this.siteId, payload).subscribe({
        next: () => {
          this.saving = false;
          this.closeModal();
          this.notificationService.success('Profil cree');
          this.loadProfiles();
        },
        error: (error) => {
          this.saving = false;
          this.notificationService.error(ErrorExtractor.getMessage(error));
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  deployProfile(profile: ConfigProfile): void {
    if (!confirm(`Deployer le profil "${profile.name}" sur le Pi ?`)) return;

    this.deploying[profile.id] = true;
    this.sitesService.deployProfile(this.siteId, profile.id).subscribe({
      next: (response) => {
        this.deploying[profile.id] = false;
        this.notificationService.success(
          `Profil "${profile.name}" deploye (v${response.version_id.substring(0, 8)})`
        );
        this.profileDeployed.emit();
      },
      error: (error) => {
        this.deploying[profile.id] = false;
        this.notificationService.error(ErrorExtractor.getMessage(error));
      },
    });
  }

  confirmDelete(profile: ConfigProfile): void {
    if (this.profiles.length <= 1) {
      this.notificationService.warning('Impossible de supprimer le dernier profil');
      return;
    }
    if (!confirm(`Supprimer le profil "${profile.name}" ?`)) return;

    this.deleting[profile.id] = true;
    this.sitesService.deleteProfile(this.siteId, profile.id).subscribe({
      next: () => {
        this.deleting[profile.id] = false;
        this.notificationService.success('Profil supprime');
        this.loadProfiles();
      },
      error: (error) => {
        this.deleting[profile.id] = false;
        this.notificationService.error(ErrorExtractor.getMessage(error));
      },
    });
  }

  syncAllProfiles(): void {
    this.syncing = true;
    this.sitesService.syncProfiles(this.siteId).subscribe({
      next: (response) => {
        this.syncing = false;
        this.notificationService.success(
          `${response.profile_count} profil(s) synchronise(s) vers le Pi`
        );
      },
      error: (error) => {
        this.syncing = false;
        this.notificationService.error(ErrorExtractor.getMessage(error));
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveConfiguration(): SiteConfiguration {
    switch (this.formConfigSource) {
      case 'current':
        return (this.site?.neoProContent as SiteConfiguration) || {} as SiteConfiguration;
      case 'profile': {
        const source = this.profiles.find((p) => p.id === this.formSourceProfileId);
        return source?.configuration || {} as SiteConfiguration;
      }
      case 'empty':
      default:
        return {} as SiteConfiguration;
    }
  }
}
