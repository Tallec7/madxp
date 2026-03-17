import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

interface AvailableVideo {
  id: string;
  title: string;
  filename: string;
  duration: number;
  file_size?: number;
}

interface AssignedSite {
  site_id: string;
  site_name: string;
  club_name?: string;
  city?: string;
  is_active: boolean;
  contract_start?: string;
  contract_end?: string;
  assigned_at: string;
}

interface AvailableSite {
  id: string;
  name: string;
  club_name?: string;
  city?: string;
}

interface Sponsor {
  id: string;
  name: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  status: 'active' | 'inactive' | 'paused';
  contract_start?: string;
  contract_end?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface SponsorVideo {
  video_id: string;
  video_title: string;
  video_duration: number;
  priority: number;
  associated_at: string;
  total_impressions?: number;
  total_screen_time?: number;
}

interface Campaign {
  id: string;
  name: string;
  campaign_type?: string;
  target_impressions?: number;
  budget_cents?: number;
  target_cpm_cents?: number;
  status: string;
  start_date?: string;
  end_date?: string;
  videos_count?: number;
  sites_count?: number;
  total_impressions?: number;
  progress_percent?: number;
  created_at: string;
  updated_at: string;
}

interface CampaignSite {
  site_id: string;
  site_name: string;
  club_name: string;
  deployment_status: string;
  deployed_at?: string;
}

@Component({
  selector: 'app-sponsor-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  template: `
    <div class="sponsor-detail-container">
      <!-- Header -->
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          ← Retour aux sponsors
        </button>

        <div class="header-content" *ngIf="sponsor">
          <div class="sponsor-header">
            <img
              *ngIf="sponsor.logo_url"
              [src]="sponsor.logo_url"
              [alt]="sponsor.name"
              class="sponsor-logo-large"
              (error)="onLogoError($event)"
            />
            <div class="sponsor-info">
              <h1>{{ sponsor.name }}</h1>
              <span class="status-badge" [class]="'status-' + sponsor.status">
                {{ getStatusLabel(sponsor.status) }}
              </span>
            </div>
          </div>

          <div class="header-actions">
            <button class="btn btn-secondary" (click)="editSponsor()">
              ✏️ Éditer
            </button>
            <button class="btn btn-danger" (click)="confirmDelete()">
              🗑️ Supprimer
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="tabs-nav">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'info'"
          (click)="activeTab = 'info'"
        >
          📋 Informations
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'videos'"
          (click)="activeTab = 'videos'"
        >
          🎬 Vidéos ({{ sponsorVideos.length }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'analytics'"
          (click)="activeTab = 'analytics'"
        >
          📊 Analytics
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'sites'"
          (click)="switchToSitesTab()"
        >
          🏟️ Sites ({{ assignedSites.length }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'campaigns'"
          (click)="switchToCampaignsTab()"
        >
          📢 Campagnes ({{ campaigns.length }})
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-message">
        <p>❌ {{ error }}</p>
        <button class="btn btn-primary" (click)="loadSponsorData()">Réessayer</button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content" *ngIf="!loading && !error && sponsor">

        <!-- Info Tab -->
        <div *ngIf="activeTab === 'info'" class="info-tab">
          <div class="info-grid">
            <div class="info-card">
              <h3>📞 Contact</h3>
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
              <h3>📅 Contrat</h3>
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
              <h3>📝 Notes</h3>
              <p class="notes">{{ sponsor.notes || 'Aucune note' }}</p>
            </div>

            <div class="info-card">
              <h3>🕐 Métadonnées</h3>
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

        <!-- Videos Tab -->
        <div *ngIf="activeTab === 'videos'" class="videos-tab">
          <div class="videos-header">
            <h2>Vidéos associées ({{ sponsorVideos.length }})</h2>
            <button class="btn btn-primary" (click)="openAddVideosModal()">
              ➕ Ajouter des vidéos
            </button>
          </div>

          <div *ngIf="sponsorVideos.length === 0" class="empty-state">
            <p>Aucune vidéo associée à ce sponsor</p>
            <button class="btn btn-primary" (click)="openAddVideosModal()">
              Ajouter des vidéos
            </button>
          </div>

          <div *ngIf="sponsorVideos.length > 0" class="videos-list">
            <div *ngFor="let video of sponsorVideos" class="video-item">
              <div class="video-info">
                <h4>{{ video.video_title }}</h4>
                <div class="video-meta">
                  <span>⏱️ {{ formatDuration(video.video_duration) }}</span>
                  <span>📊 {{ video.total_impressions || 0 }} impressions</span>
                  <span>🕐 {{ formatDuration(video.total_screen_time || 0) }} temps écran</span>
                  <span>🔢 Priorité: {{ video.priority }}</span>
                </div>
                <div class="video-date">
                  Associée le {{ formatDate(video.associated_at) }}
                </div>
              </div>
              <div class="video-actions">
                <button
                  class="btn btn-sm btn-danger"
                  (click)="removeVideo(video.video_id)"
                  [disabled]="removingVideo === video.video_id"
                >
                  {{ removingVideo === video.video_id ? 'Suppression...' : '🗑️ Retirer' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Analytics Tab -->
        <div *ngIf="activeTab === 'analytics'" class="analytics-tab">
          <div class="analytics-redirect">
            <h2>📊 Analytics Détaillées</h2>
            <p>Accédez au dashboard analytics complet pour ce sponsor</p>
            <button
              class="btn btn-primary btn-large"
              (click)="navigateToAnalytics()"
            >
              Voir le Dashboard Analytics →
            </button>

            <div class="quick-stats" *ngIf="quickStats">
              <h3>Aperçu Rapide</h3>
              <div class="stats-grid">
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.total_impressions?.toLocaleString() || 0 }}</span>
                  <span class="stat-label">Impressions totales</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ formatDuration(quickStats.total_screen_time || 0) }}</span>
                  <span class="stat-label">Temps écran total</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.completion_rate?.toFixed(1) || 0 }}%</span>
                  <span class="stat-label">Taux de complétion</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.unique_sites || 0 }}</span>
                  <span class="stat-label">Sites actifs</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sites Tab -->
        <div *ngIf="activeTab === 'sites'" class="sites-tab">
          <div class="sites-header">
            <h2>Sites assignés ({{ assignedSites.length }})</h2>
            <button class="btn btn-primary" (click)="openAddSitesModal()">
              ➕ Assigner à des clubs
            </button>
          </div>

          <div *ngIf="loadingSites" class="loading">
            <div class="spinner"></div>
            <p>Chargement des sites...</p>
          </div>

          <div *ngIf="!loadingSites && assignedSites.length === 0" class="empty-state">
            <p>🏟️ Aucun club assigné à ce sponsor</p>
            <p class="empty-hint">Assignez ce sponsor à des clubs pour déployer ses vidéos automatiquement</p>
            <button class="btn btn-primary" (click)="openAddSitesModal()">
              Assigner à des clubs
            </button>
          </div>

          <div *ngIf="!loadingSites && assignedSites.length > 0" class="sites-list">
            <div class="deploy-badge">
              📡 Déployé sur {{ assignedSites.length }} club{{ assignedSites.length > 1 ? 's' : '' }}
            </div>

            <div *ngFor="let site of assignedSites" class="site-item">
              <div class="site-info">
                <h4>{{ site.site_name }}</h4>
                <div class="site-meta">
                  <span *ngIf="site.club_name">🏟️ {{ site.club_name }}</span>
                  <span *ngIf="site.city">📍 {{ site.city }}</span>
                  <span *ngIf="site.contract_start">📅 {{ formatDate(site.contract_start) }} → {{ formatDate(site.contract_end) || '∞' }}</span>
                </div>
                <div class="site-date">
                  Assigné le {{ formatDate(site.assigned_at) }}
                </div>
              </div>
              <div class="site-actions">
                <span class="site-status-badge" [class.active]="site.is_active" [class.inactive]="!site.is_active">
                  {{ site.is_active ? 'Actif' : 'Inactif' }}
                </span>
                <button
                  class="btn btn-sm btn-danger"
                  (click)="removeSiteAssignment(site.site_id)"
                  [disabled]="removingSite === site.site_id"
                >
                  {{ removingSite === site.site_id ? 'Retrait...' : '✕ Retirer' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Campaigns Tab -->
        <div *ngIf="activeTab === 'campaigns'" class="campaigns-tab">
          <div class="campaigns-header">
            <h2>Campagnes ({{ campaigns.length }})</h2>
            <button class="btn btn-primary" (click)="openCampaignModal()">
              + Nouvelle campagne
            </button>
          </div>

          <div *ngIf="loadingCampaigns" class="loading">
            <div class="spinner"></div>
            <p>Chargement des campagnes...</p>
          </div>

          <div *ngIf="!loadingCampaigns && campaigns.length === 0" class="empty-state">
            <p>Aucune campagne pour cet annonceur</p>
            <p class="empty-hint">Creez une campagne pour deployer des videos sur les clubs cibles</p>
            <button class="btn btn-primary" (click)="openCampaignModal()">
              Creer une campagne
            </button>
          </div>

          <div *ngIf="!loadingCampaigns && campaigns.length > 0" class="campaigns-list">
            <div *ngFor="let campaign of campaigns" class="campaign-card">
              <div class="campaign-card-header">
                <div class="campaign-title-row">
                  <h4>{{ campaign.name }}</h4>
                  <span class="campaign-status" [class]="'cs-' + campaign.status">
                    {{ getCampaignStatusLabel(campaign.status) }}
                  </span>
                </div>
                <div class="campaign-meta">
                  <span *ngIf="campaign.start_date">{{ formatDate(campaign.start_date) }} → {{ formatDate(campaign.end_date) || '...' }}</span>
                  <span *ngIf="campaign.campaign_type && campaign.campaign_type !== 'standard'">{{ campaign.campaign_type }}</span>
                </div>
              </div>

              <div class="campaign-stats-row">
                <div class="campaign-stat">
                  <span class="cs-value">{{ campaign.videos_count || 0 }}</span>
                  <span class="cs-label">Videos</span>
                </div>
                <div class="campaign-stat">
                  <span class="cs-value">{{ campaign.sites_count || 0 }}</span>
                  <span class="cs-label">Sites</span>
                </div>
                <div class="campaign-stat">
                  <span class="cs-value">{{ (campaign.total_impressions || 0).toLocaleString() }}</span>
                  <span class="cs-label">Impressions</span>
                </div>
                <div class="campaign-stat" *ngIf="campaign.target_impressions">
                  <span class="cs-value">{{ campaign.progress_percent || 0 }}%</span>
                  <span class="cs-label">Progression</span>
                </div>
                <div class="campaign-stat" *ngIf="campaign.budget_cents">
                  <span class="cs-value">{{ (campaign.budget_cents / 100).toFixed(0) }} EUR</span>
                  <span class="cs-label">Budget</span>
                </div>
              </div>

              <div class="campaign-actions-row">
                <button
                  *ngIf="campaign.status !== 'active'"
                  class="btn btn-sm btn-primary"
                  (click)="deployCampaignAction(campaign.id)"
                  [disabled]="deployingCampaign === campaign.id"
                >
                  {{ deployingCampaign === campaign.id ? 'Deploiement...' : 'Deployer' }}
                </button>
                <button
                  *ngIf="campaign.status === 'active'"
                  class="btn btn-sm btn-warning"
                  (click)="undeployCampaignAction(campaign.id)"
                  [disabled]="deployingCampaign === campaign.id"
                >
                  {{ deployingCampaign === campaign.id ? 'Arret...' : 'Mettre en pause' }}
                </button>
                <button
                  class="btn btn-sm btn-secondary"
                  (click)="editCampaign(campaign)"
                >
                  Editer
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  (click)="deleteCampaign(campaign.id)"
                  [disabled]="removingCampaign === campaign.id"
                >
                  {{ removingCampaign === campaign.id ? '...' : 'Supprimer' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Campaign Create/Edit Modal -->
      <div class="modal-overlay" *ngIf="showCampaignModal" (click)="closeCampaignModal()">
        <div class="modal modal-lg" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ isEditingCampaign ? 'Modifier' : 'Nouvelle' }} campagne</h2>
            <button class="close-btn" (click)="closeCampaignModal()">x</button>
          </div>

          <form (submit)="saveCampaign($event)" class="modal-form">
            <div class="modal-body">
              <div class="form-group">
                <label>Nom *</label>
                <input
                  type="text"
                  [(ngModel)]="campaignForm.name"
                  name="campaignName"
                  required
                  placeholder="Promotion ete 2026"
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Type</label>
                  <select [(ngModel)]="campaignForm.campaign_type" name="campaignType">
                    <option value="standard">Standard</option>
                    <option value="exclusive">Exclusive</option>
                    <option value="seasonal">Saisonniere</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Impressions cibles</label>
                  <input
                    type="number"
                    [(ngModel)]="campaignForm.target_impressions"
                    name="targetImpressions"
                    placeholder="10000"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Budget (EUR)</label>
                  <input
                    type="number"
                    [(ngModel)]="campaignForm.budget_cents"
                    name="budgetCents"
                    placeholder="500"
                  />
                </div>
                <div class="form-group">
                  <label>CPM cible (centimes)</label>
                  <input
                    type="number"
                    [(ngModel)]="campaignForm.target_cpm_cents"
                    name="targetCpm"
                    placeholder="500"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Date debut</label>
                  <input
                    type="date"
                    [(ngModel)]="campaignForm.start_date"
                    name="startDate"
                  />
                </div>
                <div class="form-group">
                  <label>Date fin</label>
                  <input
                    type="date"
                    [(ngModel)]="campaignForm.end_date"
                    name="endDate"
                  />
                </div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeCampaignModal()">
                Annuler
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="savingCampaign">
                {{ savingCampaign ? 'Enregistrement...' : 'Enregistrer' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Edit Modal -->
      <div class="modal-overlay" *ngIf="showEditModal" (click)="closeEditModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>✏️ Modifier le sponsor</h2>
            <button class="close-btn" (click)="closeEditModal()">✕</button>
          </div>

          <form (submit)="saveEdit($event)" class="modal-form">
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
                <label>Téléphone</label>
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
                <label>Début du contrat</label>
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
              <button type="button" class="btn btn-secondary" (click)="closeEditModal()">
                Annuler
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div class="modal-overlay" *ngIf="showDeleteModal" (click)="closeDeleteModal()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>⚠️ Confirmer la suppression</h2>
            <button class="close-btn" (click)="closeDeleteModal()">✕</button>
          </div>

          <div class="modal-body">
            <p>Êtes-vous sûr de vouloir supprimer le sponsor <strong>{{ sponsor?.name }}</strong> ?</p>
            <p class="warning">Cette action est irréversible et supprimera également toutes les associations avec les vidéos.</p>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeDeleteModal()">
              Annuler
            </button>
            <button class="btn btn-danger" (click)="deleteSponsor()" [disabled]="deleting">
              {{ deleting ? ('common.deleting' | translate) : ('common.deletePermanently' | translate) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Add Videos Modal -->
      <div class="modal-overlay" *ngIf="showAddVideosModal" (click)="closeAddVideosModal()">
        <div class="modal modal-lg" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>➕ Ajouter des vidéos</h2>
            <button class="close-btn" (click)="closeAddVideosModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Search -->
            <div class="search-box">
              <input
                type="text"
                [(ngModel)]="videoSearchTerm"
                (input)="filterAvailableVideos()"
                [placeholder]="'content.searchVideo' | translate"
              />
            </div>

            <!-- Loading -->
            <div *ngIf="loadingVideos" class="loading-small">
              <div class="spinner-small"></div>
              <span>Chargement des vidéos...</span>
            </div>

            <!-- Available Videos List -->
            <div *ngIf="!loadingVideos" class="available-videos-list">
              <div
                *ngFor="let video of filteredAvailableVideos"
                class="available-video-item"
                [class.selected]="isVideoSelected(video.id)"
                (click)="toggleVideoSelection(video.id)"
              >
                <div class="checkbox">
                  <input
                    type="checkbox"
                    [checked]="isVideoSelected(video.id)"
                    (change)="toggleVideoSelection(video.id)"
                    (click)="$event.stopPropagation()"
                  />
                </div>
                <div class="video-details">
                  <h4>{{ video.title }}</h4>
                  <div class="video-meta-small">
                    <span>{{ video.filename }}</span>
                    <span>⏱️ {{ formatVideoDuration(video.duration) }}</span>
                    <span *ngIf="video.file_size">📦 {{ formatFileSize(video.file_size) }}</span>
                  </div>
                </div>
              </div>

              <div *ngIf="filteredAvailableVideos.length === 0" class="empty-state-small">
                <p *ngIf="videoSearchTerm">Aucune vidéo trouvée pour "{{ videoSearchTerm }}"</p>
                <p *ngIf="!videoSearchTerm">Aucune vidéo disponible à ajouter</p>
              </div>
            </div>

            <!-- Selected Count -->
            <div class="selection-info" *ngIf="selectedVideoIds.length > 0">
              {{ selectedVideoIds.length }} vidéo(s) sélectionnée(s)
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeAddVideosModal()">
              Annuler
            </button>
            <button
              class="btn btn-primary"
              (click)="addSelectedVideos()"
              [disabled]="selectedVideoIds.length === 0 || addingVideos"
            >
              {{ addingVideos ? 'Ajout...' : 'Ajouter (' + selectedVideoIds.length + ')' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Add Sites Modal -->
      <div class="modal-overlay" *ngIf="showAddSitesModal" (click)="closeAddSitesModal()">
        <div class="modal modal-lg" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>🏟️ Assigner à des clubs</h2>
            <button class="close-btn" (click)="closeAddSitesModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Search -->
            <div class="search-box">
              <input
                type="text"
                [(ngModel)]="siteSearchTerm"
                (input)="filterAvailableSites()"
                [placeholder]="'common.searchClub' | translate"
              />
            </div>

            <!-- Loading -->
            <div *ngIf="loadingAvailableSites" class="loading-small">
              <div class="spinner-small"></div>
              <span>{{ 'common.loadingClubs' | translate }}</span>
            </div>

            <!-- Available Sites List -->
            <div *ngIf="!loadingAvailableSites" class="available-videos-list">
              <div
                *ngFor="let site of filteredAvailableSites"
                class="available-video-item"
                [class.selected]="isSiteSelected(site.id)"
                (click)="toggleSiteSelection(site.id)"
              >
                <div class="checkbox">
                  <input
                    type="checkbox"
                    [checked]="isSiteSelected(site.id)"
                    (change)="toggleSiteSelection(site.id)"
                    (click)="$event.stopPropagation()"
                  />
                </div>
                <div class="video-details">
                  <h4>{{ site.name }}</h4>
                  <div class="video-meta-small">
                    <span *ngIf="site.club_name">🏟️ {{ site.club_name }}</span>
                    <span *ngIf="site.city">📍 {{ site.city }}</span>
                  </div>
                </div>
              </div>

              <div *ngIf="filteredAvailableSites.length === 0" class="empty-state-small">
                <p *ngIf="siteSearchTerm">Aucun club trouvé pour "{{ siteSearchTerm }}"</p>
                <p *ngIf="!siteSearchTerm">Tous les clubs sont déjà assignés</p>
              </div>
            </div>

            <!-- Selected Count -->
            <div class="selection-info" *ngIf="selectedSiteIds.length > 0">
              {{ selectedSiteIds.length }} club(s) sélectionné(s)
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeAddSitesModal()">
              Annuler
            </button>
            <button
              class="btn btn-primary"
              (click)="assignSelectedSites()"
              [disabled]="selectedSiteIds.length === 0 || assigningSites"
            >
              {{ assigningSites ? 'Assignation...' : 'Assigner (' + selectedSiteIds.length + ')' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sponsor-detail-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.95rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
      transition: color 0.2s;
    }

    .back-btn:hover {
      color: #111827;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2rem;
    }

    .sponsor-header {
      display: flex;
      gap: 1.5rem;
      align-items: center;
      flex: 1;
    }

    .sponsor-logo-large {
      width: 100px;
      height: 100px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 0.5rem;
      background: white;
    }

    .sponsor-info h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
      color: #111827;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Tabs */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 2rem;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 1rem 1.5rem;
      cursor: pointer;
      font-size: 0.95rem;
      color: #6b7280;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      margin-bottom: -2px;
    }

    .tab-btn:hover {
      color: #111827;
      background: #f9fafb;
    }

    .tab-btn.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      font-weight: 500;
    }

    /* Tab Content */
    .tab-content {
      min-height: 400px;
    }

    /* Info Tab */
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

    /* Videos Tab */
    .videos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .videos-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .videos-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .video-item {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: box-shadow 0.2s;
    }

    .video-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .video-info {
      flex: 1;
    }

    .video-info h4 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .video-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .video-date {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    /* Analytics Tab */
    .analytics-redirect {
      text-align: center;
      padding: 3rem 2rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .analytics-redirect h2 {
      margin: 0 0 1rem 0;
      font-size: 1.75rem;
    }

    .analytics-redirect p {
      color: #6b7280;
      margin-bottom: 2rem;
    }

    .btn-large {
      padding: 1rem 2rem;
      font-size: 1.1rem;
    }

    .quick-stats {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #e5e7eb;
    }

    .quick-stats h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      text-align: center;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 600;
      color: #2563eb;
    }

    .stat-label {
      color: #6b7280;
      font-size: 0.9rem;
    }

    /* Status badges */
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

    /* Buttons */
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

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Loading & Error */
    .loading, .error-message, .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }

    .spinner {
      border: 3px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #ef4444;
    }

    /* Modal */
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

    .modal-lg {
      max-width: 700px;
    }

    /* Add Videos Modal Styles */
    .search-box {
      margin-bottom: 1rem;
    }

    .search-box input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .loading-small {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: #6b7280;
    }

    .spinner-small {
      border: 2px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      animation: spin 1s linear infinite;
    }

    .available-videos-list {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .available-video-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .available-video-item:last-child {
      border-bottom: none;
    }

    .available-video-item:hover {
      background: #f9fafb;
    }

    .available-video-item.selected {
      background: #eff6ff;
    }

    .checkbox {
      display: flex;
      align-items: center;
    }

    .checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .video-details {
      flex: 1;
    }

    .video-details h4 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      color: #111827;
    }

    .video-meta-small {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: #6b7280;
    }

    .empty-state-small {
      padding: 2rem;
      text-align: center;
      color: #9ca3af;
    }

    .selection-info {
      padding: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e40af;
      font-weight: 500;
      text-align: center;
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

    /* Sites Tab */
    .sites-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .sites-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .deploy-badge {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.75rem 1.25rem;
      color: #1e40af;
      font-weight: 500;
      margin-bottom: 1.5rem;
      font-size: 0.95rem;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .site-item {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: box-shadow 0.2s;
    }

    .site-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .site-info {
      flex: 1;
    }

    .site-info h4 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .site-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .site-date {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    .site-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .site-status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .site-status-badge.active {
      background: #d1fae5;
      color: #065f46;
    }

    .site-status-badge.inactive {
      background: #f3f4f6;
      color: #6b7280;
    }

    .empty-hint {
      font-size: 0.9rem;
      color: #9ca3af;
      margin-top: -0.5rem;
      margin-bottom: 1.5rem;
    }

    /* Campaigns Tab */
    .campaigns-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .campaigns-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .campaigns-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .campaign-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.25rem;
      transition: box-shadow 0.2s;
    }

    .campaign-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .campaign-card-header {
      margin-bottom: 1rem;
    }

    .campaign-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
    }

    .campaign-title-row h4 {
      margin: 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .campaign-status {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .cs-draft { background: #f3f4f6; color: #6b7280; }
    .cs-active { background: #dcfce7; color: #166534; }
    .cs-paused { background: #fef3c7; color: #92400e; }
    .cs-completed { background: #d1fae5; color: #065f46; }
    .cs-failed { background: #fee2e2; color: #991b1b; }

    .campaign-meta {
      font-size: 0.85rem;
      color: #6b7280;
      display: flex;
      gap: 1rem;
    }

    .campaign-stats-row {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: #f9fafb;
      border-radius: 6px;
    }

    .campaign-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .cs-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #111827;
    }

    .cs-label {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .campaign-actions-row {
      display: flex;
      gap: 0.5rem;
    }

    .btn-warning {
      background: #f59e0b;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: background 0.2s;
    }

    .btn-warning:hover {
      background: #d97706;
    }

    @media (max-width: 768px) {
      .sponsor-detail-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
      }

      .info-grid {
        grid-template-columns: 1fr;
      }

      .form-row {
        grid-template-columns: 1fr;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class SponsorDetailComponent implements OnInit {
  sponsorId: string = '';
  sponsor: Sponsor | null = null;
  sponsorVideos: SponsorVideo[] = [];
  quickStats: any = null;

  activeTab: 'info' | 'videos' | 'analytics' | 'sites' | 'campaigns' = 'info';
  loading = false;
  error = '';

  showEditModal = false;
  showDeleteModal = false;
  showAddVideosModal = false;
  showAddSitesModal = false;
  saving = false;
  deleting = false;
  removingVideo: string | null = null;

  // Add Videos Modal
  availableVideos: AvailableVideo[] = [];
  filteredAvailableVideos: AvailableVideo[] = [];
  selectedVideoIds: string[] = [];
  videoSearchTerm = '';
  loadingVideos = false;
  addingVideos = false;

  // Sites Tab
  assignedSites: AssignedSite[] = [];
  loadingSites = false;
  removingSite: string | null = null;

  // Add Sites Modal
  availableSites: AvailableSite[] = [];
  filteredAvailableSites: AvailableSite[] = [];
  selectedSiteIds: string[] = [];
  siteSearchTerm = '';
  loadingAvailableSites = false;
  assigningSites = false;

  // Campaigns Tab
  campaigns: Campaign[] = [];
  loadingCampaigns = false;
  deployingCampaign: string | null = null;
  removingCampaign: string | null = null;
  showCampaignModal = false;
  isEditingCampaign = false;
  savingCampaign = false;
  campaignForm: Partial<Campaign> = {};

  editForm: Partial<Sponsor> = {};

  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadSponsorData();
  }

  loadSponsorData() {
    this.loading = true;
    this.error = '';

    // Load sponsor details
    this.api.get<{ success: boolean; data: { advertiser: Sponsor } }>(`/analytics/advertisers/${this.sponsorId}`)
      .subscribe({
        next: (response) => {
          this.sponsor = response.data.advertiser;

          // Load associated videos
          this.api.get<{ success: boolean; data: { videos: SponsorVideo[] } }>(`/analytics/advertisers/${this.sponsorId}/videos`)
            .subscribe({
              next: (videoResponse) => {
                this.sponsorVideos = videoResponse.data.videos || [];
              },
              error: () => {
                // Silencieux - les vidéos ne sont pas critiques
              }
            });

          // Load quick stats (last 30 days)
          this.api.get<{ success: boolean; data: { summary: any } }>(`/analytics/advertisers/${this.sponsorId}/stats`, { days: '30' })
            .subscribe({
              next: (statsResponse) => {
                this.quickStats = statsResponse.data.summary;
              },
              error: () => {
                // Silencieux - les stats ne sont pas critiques
              },
              complete: () => {
                this.loading = false;
              }
            });
        },
        error: () => {
          this.error = 'Sponsor non trouvé';
          this.notification.error('Erreur lors du chargement des données');
          this.loading = false;
        }
      });
  }

  goBack() {
    this.router.navigate(['/advertisers']);
  }

  navigateToAnalytics() {
    this.router.navigate(['/advertisers', this.sponsorId, 'analytics']);
  }

  // Edit Functions
  editSponsor() {
    this.editForm = { ...this.sponsor! };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editForm = {};
  }

  saveEdit(event: Event) {
    event.preventDefault();
    this.saving = true;

    this.api.put<{ success: boolean; data: { advertiser: Sponsor } }>(`/analytics/advertisers/${this.sponsorId}`, this.editForm)
      .subscribe({
        next: (response) => {
          this.sponsor = response.data.advertiser;
          this.notification.success('Sponsor modifié avec succès');
          this.closeEditModal();
        },
        error: () => {
          this.notification.error('Erreur lors de la sauvegarde');
          this.saving = false;
        },
        complete: () => {
          this.saving = false;
        }
      });
  }

  // Delete Functions
  confirmDelete() {
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
  }

  deleteSponsor() {
    this.deleting = true;

    this.api.delete<{ success: boolean }>(`/analytics/advertisers/${this.sponsorId}`)
      .subscribe({
        next: () => {
          this.notification.success('Sponsor supprimé avec succès');
          this.router.navigate(['/advertisers']);
        },
        error: () => {
          this.notification.error('Erreur lors de la suppression');
        },
        complete: () => {
          this.deleting = false;
        }
      });
  }

  // Video Management - Add Videos Modal
  openAddVideosModal() {
    this.showAddVideosModal = true;
    this.selectedVideoIds = [];
    this.videoSearchTerm = '';
    this.loadAvailableVideos();
  }

  closeAddVideosModal() {
    this.showAddVideosModal = false;
    this.selectedVideoIds = [];
    this.videoSearchTerm = '';
    this.availableVideos = [];
    this.filteredAvailableVideos = [];
  }

  loadAvailableVideos() {
    this.loadingVideos = true;

    this.api.get<{ data: AvailableVideo[]; pagination: any }>('/videos')
      .subscribe({
        next: (response) => {
          const allVideos = response.data || [];
          // Filter out already associated videos
          const associatedIds = new Set(this.sponsorVideos.map(v => v.video_id));
          this.availableVideos = allVideos.filter(v => !associatedIds.has(v.id));
          this.filterAvailableVideos();
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des vidéos');
        },
        complete: () => {
          this.loadingVideos = false;
        }
      });
  }

  filterAvailableVideos() {
    const term = this.videoSearchTerm.toLowerCase();
    this.filteredAvailableVideos = this.availableVideos.filter(video =>
      (video.title || '').toLowerCase().includes(term) ||
      (video.filename || '').toLowerCase().includes(term)
    );
  }

  isVideoSelected(videoId: string): boolean {
    return this.selectedVideoIds.includes(videoId);
  }

  toggleVideoSelection(videoId: string) {
    const index = this.selectedVideoIds.indexOf(videoId);
    if (index === -1) {
      this.selectedVideoIds.push(videoId);
    } else {
      this.selectedVideoIds.splice(index, 1);
    }
  }

  addSelectedVideos() {
    if (this.selectedVideoIds.length === 0) return;

    this.addingVideos = true;

    this.api.post<{ success: boolean }>(`/analytics/advertisers/${this.sponsorId}/videos`, {
      video_ids: this.selectedVideoIds
    }).subscribe({
      next: () => {
        this.notification.success(`${this.selectedVideoIds.length} vidéo(s) ajoutée(s) avec succès`);
        this.closeAddVideosModal();
        // Reload sponsor videos
        this.api.get<{ success: boolean; data: { videos: SponsorVideo[] } }>(`/analytics/advertisers/${this.sponsorId}/videos`)
          .subscribe({
            next: (response) => {
              this.sponsorVideos = response.data.videos || [];
            }
          });
      },
      error: () => {
        this.notification.error('Erreur lors de l\'ajout des vidéos');
      },
      complete: () => {
        this.addingVideos = false;
      }
    });
  }

  // Sites Management
  switchToSitesTab(): void {
    this.activeTab = 'sites';
    if (this.assignedSites.length === 0 && !this.loadingSites) {
      this.loadAssignedSites();
    }
  }

  loadAssignedSites(): void {
    this.loadingSites = true;

    this.api.get<{ success: boolean; data: { sites: AssignedSite[] } }>(`/advertisers/${this.sponsorId}/sites`, { include_inactive: 'true' })
      .subscribe({
        next: (response) => {
          this.assignedSites = response.data?.sites || [];
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des sites');
        },
        complete: () => {
          this.loadingSites = false;
        }
      });
  }

  openAddSitesModal(): void {
    this.showAddSitesModal = true;
    this.selectedSiteIds = [];
    this.siteSearchTerm = '';
    this.loadAvailableSites();
  }

  closeAddSitesModal(): void {
    this.showAddSitesModal = false;
    this.selectedSiteIds = [];
    this.siteSearchTerm = '';
    this.availableSites = [];
    this.filteredAvailableSites = [];
  }

  loadAvailableSites(): void {
    this.loadingAvailableSites = true;

    this.api.get<{ data: AvailableSite[]; pagination?: unknown }>('/sites')
      .subscribe({
        next: (response) => {
          const allSites = response.data || [];
          // Filter out already assigned sites
          const assignedIds = new Set(this.assignedSites.map(s => s.site_id));
          this.availableSites = allSites.filter(s => !assignedIds.has(s.id));
          this.filterAvailableSites();
        },
        error: () => {
          this.notification.error('Erreur lors du chargement des clubs');
        },
        complete: () => {
          this.loadingAvailableSites = false;
        }
      });
  }

  filterAvailableSites(): void {
    const term = this.siteSearchTerm.toLowerCase();
    this.filteredAvailableSites = this.availableSites.filter(site =>
      (site.name || '').toLowerCase().includes(term) ||
      (site.club_name || '').toLowerCase().includes(term) ||
      (site.city || '').toLowerCase().includes(term)
    );
  }

  isSiteSelected(siteId: string): boolean {
    return this.selectedSiteIds.includes(siteId);
  }

  toggleSiteSelection(siteId: string): void {
    const index = this.selectedSiteIds.indexOf(siteId);
    if (index === -1) {
      this.selectedSiteIds.push(siteId);
    } else {
      this.selectedSiteIds.splice(index, 1);
    }
  }

  assignSelectedSites(): void {
    if (this.selectedSiteIds.length === 0) return;

    this.assigningSites = true;

    this.api.post<{ success: boolean }>(`/advertisers/${this.sponsorId}/sites`, {
      site_ids: this.selectedSiteIds
    }).subscribe({
      next: () => {
        this.notification.success(`Sponsor assigné à ${this.selectedSiteIds.length} club(s)`);
        this.closeAddSitesModal();
        this.loadAssignedSites();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'assignation');
      },
      complete: () => {
        this.assigningSites = false;
      }
    });
  }

  async removeSiteAssignment(siteId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Retirer ce club du sponsor ? Les vidéos associées ne seront plus diffusées dans ce club.',
      { title: 'Retirer l\'assignation', confirmLabel: 'Retirer', confirmStyle: 'danger' }
    );
    if (!ok) return;

    this.removingSite = siteId;

    this.api.delete<{ success: boolean }>(`/advertisers/${this.sponsorId}/sites/${siteId}`)
      .subscribe({
        next: () => {
          this.assignedSites = this.assignedSites.filter(s => s.site_id !== siteId);
          this.notification.success('Club retiré avec succès');
        },
        error: () => {
          this.notification.error('Erreur lors du retrait');
        },
        complete: () => {
          this.removingSite = null;
        }
      });
  }

  // ========================================================================
  // Campaign Management (ADR-035 Phase 3c)
  // ========================================================================

  switchToCampaignsTab(): void {
    this.activeTab = 'campaigns';
    if (this.campaigns.length === 0 && !this.loadingCampaigns) {
      this.loadCampaigns();
    }
  }

  loadCampaigns(): void {
    this.loadingCampaigns = true;

    this.api.get<{ success: boolean; data: { campaigns: Campaign[] } }>(
      '/campaigns', { advertiser_id: this.sponsorId }
    ).subscribe({
      next: (response) => {
        this.campaigns = response.data?.campaigns || [];
      },
      error: () => {
        this.notification.error('Erreur lors du chargement des campagnes');
      },
      complete: () => {
        this.loadingCampaigns = false;
      }
    });
  }

  openCampaignModal(): void {
    this.isEditingCampaign = false;
    this.campaignForm = { campaign_type: 'standard' };
    this.showCampaignModal = true;
  }

  editCampaign(campaign: Campaign): void {
    this.isEditingCampaign = true;
    this.campaignForm = { ...campaign };
    this.showCampaignModal = true;
  }

  closeCampaignModal(): void {
    this.showCampaignModal = false;
    this.campaignForm = {};
  }

  saveCampaign(event: Event): void {
    event.preventDefault();
    if (!this.campaignForm.name) {
      this.notification.error('Le nom de la campagne est requis');
      return;
    }

    this.savingCampaign = true;

    const payload = {
      ...this.campaignForm,
      advertiser_id: this.sponsorId,
    };

    const request$ = this.isEditingCampaign
      ? this.api.put<{ success: boolean }>(`/campaigns/${this.campaignForm.id}`, payload)
      : this.api.post<{ success: boolean }>('/campaigns', payload);

    request$.subscribe({
      next: () => {
        this.notification.success(
          this.isEditingCampaign ? 'Campagne mise a jour' : 'Campagne creee'
        );
        this.closeCampaignModal();
        this.loadCampaigns();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'enregistrement');
      },
      complete: () => {
        this.savingCampaign = false;
      }
    });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Supprimer cette campagne ? Les videos ne seront plus deployees sur les sites cibles.',
      { title: 'Supprimer la campagne', confirmLabel: 'Supprimer', confirmStyle: 'danger' }
    );
    if (!ok) return;

    this.removingCampaign = campaignId;

    this.api.delete<{ success: boolean }>(`/campaigns/${campaignId}`).subscribe({
      next: () => {
        this.campaigns = this.campaigns.filter(c => c.id !== campaignId);
        this.notification.success('Campagne supprimee');
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
      },
      complete: () => {
        this.removingCampaign = null;
      }
    });
  }

  deployCampaignAction(campaignId: string): void {
    this.deployingCampaign = campaignId;

    this.api.post<{ success: boolean; data: { sitesTriggered: number } }>(
      `/campaigns/${campaignId}/deploy`, {}
    ).subscribe({
      next: (response) => {
        const count = response.data?.sitesTriggered || 0;
        this.notification.success(`Campagne deployee sur ${count} site(s)`);
        this.loadCampaigns();
      },
      error: () => {
        this.notification.error('Erreur lors du deploiement');
      },
      complete: () => {
        this.deployingCampaign = null;
      }
    });
  }

  undeployCampaignAction(campaignId: string): void {
    this.deployingCampaign = campaignId;

    this.api.post<{ success: boolean; data: { sitesTriggered: number } }>(
      `/campaigns/${campaignId}/undeploy`, {}
    ).subscribe({
      next: (response) => {
        const count = response.data?.sitesTriggered || 0;
        this.notification.success(`Campagne mise en pause (${count} site(s) mis a jour)`);
        this.loadCampaigns();
      },
      error: () => {
        this.notification.error('Erreur lors de la mise en pause');
      },
      complete: () => {
        this.deployingCampaign = null;
      }
    });
  }

  getCampaignStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      active: 'Active',
      paused: 'En pause',
      completed: 'Terminee',
      failed: 'Echouee',
    };
    return labels[status] || status;
  }

  formatVideoDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatFileSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }

  async removeVideo(videoId: string) {
    const ok = await this.confirmDialog.confirm('Retirer cette vidéo du sponsor ?');
    if (!ok) return;

    this.removingVideo = videoId;

    this.api.delete<{ success: boolean }>(`/analytics/advertisers/${this.sponsorId}/videos/${videoId}`)
      .subscribe({
        next: () => {
          this.sponsorVideos = this.sponsorVideos.filter(v => v.video_id !== videoId);
          this.notification.success('Vidéo retirée avec succès');
        },
        error: () => {
          this.notification.error('Erreur lors de la suppression');
        },
        complete: () => {
          this.removingVideo = null;
        }
      });
  }

  // Utility Functions
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

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  onLogoError(event: any) {
    event.target.src = '/assets/placeholder-logo.png';
  }
}
