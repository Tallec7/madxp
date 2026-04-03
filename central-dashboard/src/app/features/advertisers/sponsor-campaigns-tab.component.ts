import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import {
  Campaign, CampaignSite, CampaignVideo,
  ResolvedSite, GroupOption, SponsorVideo, AssignedSite
} from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-campaigns-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="campaigns-tab">
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
              <span *ngIf="campaign.start_date">{{ formatDate(campaign.start_date) }} -> {{ formatDate(campaign.end_date) || '...' }}</span>
              <span *ngIf="campaign.campaign_type && campaign.campaign_type !== 'standard'">{{ campaign.campaign_type }}</span>
            </div>
          </div>

          <div class="campaign-stats-row">
            <div class="campaign-stat">
              <span class="csv-value">{{ campaign.videos_count || 0 }}</span>
              <span class="csv-label">Videos</span>
            </div>
            <div class="campaign-stat">
              <span class="csv-value">{{ campaign.sites_count || 0 }}</span>
              <span class="csv-label">Sites</span>
            </div>
            <div class="campaign-stat">
              <span class="csv-value">{{ (campaign.total_impressions || 0).toLocaleString() }}</span>
              <span class="csv-label">Impressions</span>
            </div>
            <div class="campaign-stat" *ngIf="campaign.target_impressions">
              <span class="csv-value">{{ campaign.progress_percent || 0 }}%</span>
              <span class="csv-label">Progression</span>
            </div>
            <div class="campaign-stat" *ngIf="campaign.budget_cents">
              <span class="csv-value">{{ (campaign.budget_cents / 100).toFixed(0) }} EUR</span>
              <span class="csv-label">Budget</span>
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

    <!-- Campaign Create/Edit Modal -->
    <div class="modal-overlay" *ngIf="showCampaignModal" (click)="closeCampaignModal()">
      <div class="modal modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ isEditingCampaign ? 'Modifier' : 'Nouvelle' }} campagne</h2>
          <button class="close-btn" (click)="closeCampaignModal()">x</button>
        </div>

        <!-- Modal Tabs -->
        <div class="modal-tabs">
          <button class="modal-tab" [class.active]="campaignModalTab === 'info'" (click)="campaignModalTab = 'info'">
            Informations
          </button>
          <button class="modal-tab" [class.active]="campaignModalTab === 'videos'" (click)="switchCampaignTab('videos')" [disabled]="!campaignForm.id">
            Videos ({{ campaignVideos.length }})
          </button>
          <button class="modal-tab" [class.active]="campaignModalTab === 'targeting'" (click)="switchCampaignTab('targeting')" [disabled]="!campaignForm.id">
            Ciblage ({{ campaignSites.length }} sites)
          </button>
        </div>

        <!-- Info Tab -->
        <form *ngIf="campaignModalTab === 'info'" (submit)="saveCampaign($event)" class="modal-form">
          <div class="modal-body">
            <div class="form-group">
              <label>Nom *</label>
              <input type="text" [(ngModel)]="campaignForm.name" name="campaignName" required placeholder="Promotion ete 2026" />
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
                <input type="number" [(ngModel)]="campaignForm.target_impressions" name="targetImpressions" placeholder="10000" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Budget (EUR)</label>
                <input type="number" [(ngModel)]="campaignForm.budget_cents" name="budgetCents" placeholder="500" />
              </div>
              <div class="form-group">
                <label>CPM cible (centimes)</label>
                <input type="number" [(ngModel)]="campaignForm.target_cpm_cents" name="targetCpm" placeholder="500" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Date debut</label>
                <input type="date" [(ngModel)]="campaignForm.start_date" name="startDate" />
              </div>
              <div class="form-group">
                <label>Date fin</label>
                <input type="date" [(ngModel)]="campaignForm.end_date" name="endDate" />
              </div>
            </div>
            <p *ngIf="!campaignForm.id" class="hint-text">Enregistrez pour acceder aux onglets Videos et Ciblage.</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="closeCampaignModal()">Annuler</button>
            <button type="submit" class="btn btn-primary" [disabled]="savingCampaign">
              {{ savingCampaign ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </form>

        <!-- Videos Tab -->
        <div *ngIf="campaignModalTab === 'videos'" class="modal-body">
          <p class="section-desc">Selectionnez les videos de l'annonceur a inclure dans cette campagne.</p>

          <div *ngIf="loadingCampaignVideos" class="loading-text">Chargement...</div>

          <!-- Already added videos -->
          <div *ngIf="campaignVideos.length > 0" class="campaign-video-list">
            <div *ngFor="let cv of campaignVideos" class="campaign-video-row">
              <div class="cv-info">
                <span class="cv-name">{{ cv.original_name || cv.filename }}</span>
                <span class="cv-duration" *ngIf="cv.duration">{{ formatDuration(cv.duration) }}</span>
              </div>
              <div class="cv-actions">
                <label class="cv-weight-label">Poids:
                  <input type="number" min="1" max="10" [value]="cv.weight" class="cv-weight-input"
                    (change)="updateCampaignVideoWeight(cv.video_id, $event)" />
                </label>
                <button class="btn btn-sm btn-danger" (click)="removeCampaignVideo(cv.video_id)">Retirer</button>
              </div>
            </div>
          </div>

          <!-- Available videos to add -->
          <h4 class="subsection-title">Ajouter des videos</h4>
          <div *ngIf="getAvailableAdvertiserVideos().length === 0 && !loadingCampaignVideos" class="empty-hint">
            Toutes les videos sont deja dans la campagne.
          </div>
          <div *ngFor="let v of getAvailableAdvertiserVideos()" class="campaign-video-row available-video">
            <div class="cv-info">
              <span class="cv-name">{{ v.original_name || v.filename || v.video_title || v.video_id }}</span>
              <span class="cv-duration" *ngIf="v.duration || v.video_duration">{{ formatDuration(v.duration || v.video_duration || 0) }}</span>
            </div>
            <button class="btn btn-sm btn-primary" (click)="addCampaignVideo(v.video_id)" [disabled]="addingCampaignVideo">
              + Ajouter
            </button>
          </div>
        </div>

        <!-- Targeting Tab -->
        <div *ngIf="campaignModalTab === 'targeting'" class="modal-body">
          <p class="section-desc">Definissez les criteres de ciblage pour selectionner automatiquement les clubs.</p>

          <!-- Current sites -->
          <div *ngIf="campaignSites.length > 0" class="campaign-sites-section">
            <h4>Sites cibles ({{ campaignSites.length }})</h4>
            <div class="campaign-sites-list">
              <div *ngFor="let s of campaignSites" class="campaign-site-row">
                <div class="cs-info">
                  <span class="cs-name">{{ s.club_name || s.site_name }}</span>
                  <span class="cs-status" [class]="'ds-' + s.deployment_status">{{ s.deployment_status }}</span>
                </div>
                <button class="btn btn-sm btn-danger" (click)="removeCampaignSite(s.site_id)">Retirer</button>
              </div>
            </div>
          </div>

          <!-- Quick add from advertiser's assigned sites -->
          <div *ngIf="assignedSites.length > 0" class="quick-add-section">
            <h4 class="subsection-title">Ajouter depuis les sites de l'annonceur</h4>
            <div class="quick-add-sites">
              <div *ngFor="let advSite of getUnassignedAdvertiserSites()" class="campaign-site-row">
                <div class="cs-info">
                  <span class="cs-name">{{ advSite.club_name || advSite.site_name }}</span>
                </div>
                <button class="btn btn-sm btn-primary" (click)="addSiteToCampaign(advSite.site_id)">+ Ajouter</button>
              </div>
              <div *ngIf="getUnassignedAdvertiserSites().length === 0" class="empty-hint">
                Tous les sites de l'annonceur sont deja dans la campagne.
              </div>
            </div>
          </div>

          <!-- Targeting criteria -->
          <h4 class="subsection-title">Ou ciblage par criteres</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Sports</label>
              <input type="text" [(ngModel)]="targetCriteriaSports" name="targetSports" placeholder="Football, Basketball" />
              <span class="form-hint">Separes par des virgules</span>
            </div>
            <div class="form-group">
              <label>Regions</label>
              <input type="text" [(ngModel)]="targetCriteriaRegions" name="targetRegions" placeholder="Bretagne, Ile-de-France" />
              <span class="form-hint">Separes par des virgules</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Groupes</label>
              <select [(ngModel)]="targetCriteriaGroupId" name="targetGroup">
                <option value="">-- Aucun --</option>
                <option *ngFor="let g of availableGroups" [value]="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div class="form-group targeting-actions">
              <button class="btn btn-secondary" (click)="previewTargetSites()" [disabled]="resolvingSites">
                {{ resolvingSites ? 'Recherche...' : 'Previsualiser' }}
              </button>
            </div>
          </div>

          <!-- Preview results -->
          <div *ngIf="resolvedSites.length > 0" class="resolved-sites-section">
            <h4>{{ resolvedSites.length }} site(s) correspondent</h4>
            <div class="resolved-sites-list">
              <div *ngFor="let rs of resolvedSites" class="resolved-site-row">
                <span>{{ rs.club_name || rs.site_name }}</span>
                <span class="rs-status" [class]="'st-' + rs.status">{{ rs.status }}</span>
              </div>
            </div>
            <button class="btn btn-primary" (click)="applyCriteriaToSites()" [disabled]="addingSitesToCampaign">
              {{ addingSitesToCampaign ? 'Ajout...' : resolvedSites.length + ' site(s) -> ajouter' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
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

    .csv-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #111827;
    }

    .csv-label {
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

    /* Loading & empty */
    .loading, .empty-state {
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

    .empty-hint {
      font-size: 0.9rem;
      color: #9ca3af;
      margin-top: -0.5rem;
      margin-bottom: 1.5rem;
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

    .modal-xl {
      max-width: 850px;
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

    .modal-tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid #e5e7eb;
      padding: 0 1.5rem;
    }

    .modal-tab {
      padding: 0.6rem 1.2rem;
      border: none;
      background: none;
      cursor: pointer;
      color: #6b7280;
      font-size: 0.9rem;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
    }

    .modal-tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      font-weight: 600;
    }

    .modal-tab:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-form {
      padding: 1.5rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    .hint-text { color: #9ca3af; font-size: 0.85rem; margin-top: 0.5rem; }
    .section-desc { color: #6b7280; font-size: 0.9rem; margin-bottom: 1rem; }
    .subsection-title { font-size: 0.95rem; margin: 1.2rem 0 0.5rem; color: #374151; }
    .loading-text { color: #6b7280; padding: 1rem 0; }

    /* Form */
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

    .form-hint { font-size: 0.75rem; color: #9ca3af; }

    /* Campaign Videos */
    .campaign-video-list { margin-bottom: 1rem; }
    .campaign-video-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 0.4rem;
    }
    .campaign-video-row.available-video { background: #f9fafb; border-style: dashed; }
    .cv-info { display: flex; gap: 0.75rem; align-items: center; }
    .cv-name { font-weight: 500; font-size: 0.9rem; }
    .cv-duration { color: #9ca3af; font-size: 0.8rem; }
    .cv-actions { display: flex; gap: 0.5rem; align-items: center; }
    .cv-weight-label { font-size: 0.8rem; color: #6b7280; display: flex; gap: 0.3rem; align-items: center; }
    .cv-weight-input { width: 50px; padding: 0.2rem 0.3rem; border: 1px solid #d1d5db; border-radius: 4px; text-align: center; }

    /* Campaign Sites */
    .campaign-sites-section { margin-bottom: 1.2rem; }
    .campaign-sites-list { max-height: 200px; overflow-y: auto; }
    .campaign-site-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4rem 0.5rem;
      border-bottom: 1px solid #f3f4f6;
    }
    .cs-info { display: flex; gap: 0.5rem; align-items: center; }
    .cs-name { font-size: 0.9rem; }
    .cs-status, .rs-status { font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 4px; }
    .ds-deployed { background: #d1fae5; color: #065f46; }
    .ds-pending { background: #fef3c7; color: #92400e; }
    .ds-failed { background: #fee2e2; color: #991b1b; }
    .st-online { color: #059669; }
    .st-offline { color: #dc2626; }

    .quick-add-section { margin-bottom: 1.2rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .quick-add-sites { max-height: 180px; overflow-y: auto; }
    .targeting-actions { display: flex; align-items: flex-end; }
    .resolved-sites-section { margin-top: 1rem; padding: 0.75rem; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
    .resolved-sites-list { max-height: 200px; overflow-y: auto; margin-bottom: 0.75rem; }
    .resolved-site-row {
      display: flex;
      justify-content: space-between;
      padding: 0.3rem 0.5rem;
      font-size: 0.9rem;
      border-bottom: 1px solid #d1fae5;
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

    @media (max-width: 768px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SponsorCampaignsTabComponent implements OnInit {
  @Input() sponsorId = '';
  @Input() sponsorVideos: SponsorVideo[] = [];
  @Input() assignedSites: AssignedSite[] = [];

  // Campaigns
  campaigns: Campaign[] = [];
  loadingCampaigns = false;
  deployingCampaign: string | null = null;
  removingCampaign: string | null = null;

  // Campaign modal
  showCampaignModal = false;
  isEditingCampaign = false;
  savingCampaign = false;
  campaignForm: Partial<Campaign> = {};
  campaignModalTab: 'info' | 'videos' | 'targeting' = 'info';

  // Campaign Videos
  campaignVideos: CampaignVideo[] = [];
  loadingCampaignVideos = false;
  addingCampaignVideo = false;

  // Campaign Targeting
  campaignSites: CampaignSite[] = [];
  loadingCampaignSites = false;
  targetCriteria: { sports: string[]; regions: string[]; group_ids: string[] } = { sports: [], regions: [], group_ids: [] };
  resolvedSites: ResolvedSite[] = [];
  resolvingSites = false;
  availableGroups: GroupOption[] = [];
  addingSitesToCampaign = false;
  targetCriteriaSports = '';
  targetCriteriaRegions = '';
  targetCriteriaGroupId = '';

  private api = inject(ApiService);
  private notification = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);

  ngOnInit(): void {
    this.loadCampaigns();
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
    this.campaignModalTab = 'info';
    this.campaignVideos = [];
    this.campaignSites = [];
    this.resolvedSites = [];
    this.showCampaignModal = true;
  }

  editCampaign(campaign: Campaign): void {
    this.isEditingCampaign = true;
    this.campaignForm = { ...campaign };
    this.campaignModalTab = 'info';
    this.campaignVideos = [];
    this.campaignSites = [];
    this.resolvedSites = [];
    this.showCampaignModal = true;
  }

  closeCampaignModal(): void {
    this.showCampaignModal = false;
    this.campaignForm = {};
    this.campaignModalTab = 'info';
    this.campaignVideos = [];
    this.campaignSites = [];
    this.resolvedSites = [];
  }

  switchCampaignTab(tab: 'videos' | 'targeting'): void {
    if (!this.campaignForm.id) return;
    this.campaignModalTab = tab;
    if (tab === 'videos' && this.campaignVideos.length === 0) {
      this.loadCampaignVideos();
    }
    if (tab === 'targeting') {
      if (this.campaignSites.length === 0) this.loadCampaignSites();
      if (this.availableGroups.length === 0) this.loadGroups();
    }
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

    if (this.isEditingCampaign) {
      this.api.put<{ success: boolean }>(`/campaigns/${this.campaignForm.id}`, payload).subscribe({
        next: () => {
          this.notification.success('Campagne mise a jour');
          this.loadCampaigns();
        },
        error: () => this.notification.error('Erreur lors de l\'enregistrement'),
        complete: () => { this.savingCampaign = false; }
      });
    } else {
      this.api.post<{ success: boolean; data: { campaign: { id: string } } }>('/campaigns', payload).subscribe({
        next: (response) => {
          const newId = response.data?.campaign?.id;
          if (newId) {
            this.campaignForm.id = newId;
            this.isEditingCampaign = true;
            this.notification.success('Campagne creee — ajoutez des videos et des sites');
            this.switchCampaignTab('videos');
          } else {
            this.notification.success('Campagne creee');
            this.closeCampaignModal();
          }
          this.loadCampaigns();
        },
        error: () => this.notification.error('Erreur lors de la creation'),
        complete: () => { this.savingCampaign = false; }
      });
    }
  }

  // Campaign Videos

  loadCampaignVideos(): void {
    if (!this.campaignForm.id) return;
    this.loadingCampaignVideos = true;
    this.api.get<{ success: boolean; data: { videos: CampaignVideo[] } }>(
      `/campaigns/${this.campaignForm.id}/videos`
    ).subscribe({
      next: (r) => { this.campaignVideos = r.data?.videos || []; },
      error: () => this.notification.error('Erreur chargement videos'),
      complete: () => { this.loadingCampaignVideos = false; }
    });
  }

  getAvailableAdvertiserVideos(): SponsorVideo[] {
    const usedIds = new Set(this.campaignVideos.map(cv => cv.video_id));
    return this.sponsorVideos.filter(v => !usedIds.has(v.video_id));
  }

  addCampaignVideo(videoId: string): void {
    if (!this.campaignForm.id) return;
    this.addingCampaignVideo = true;
    this.api.post(`/campaigns/${this.campaignForm.id}/videos`, { video_id: videoId, weight: 1 }).subscribe({
      next: () => { this.loadCampaignVideos(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur ajout video'),
      complete: () => { this.addingCampaignVideo = false; }
    });
  }

  removeCampaignVideo(videoId: string): void {
    if (!this.campaignForm.id) return;
    this.api.delete(`/campaigns/${this.campaignForm.id}/videos/${videoId}`).subscribe({
      next: () => { this.loadCampaignVideos(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur retrait video'),
    });
  }

  updateCampaignVideoWeight(videoId: string, event: Event): void {
    const weight = Number((event.target as HTMLInputElement).value) || 1;
    if (!this.campaignForm.id) return;
    this.api.post(`/campaigns/${this.campaignForm.id}/videos`, { video_id: videoId, weight }).subscribe({
      error: () => this.notification.error('Erreur mise a jour poids'),
    });
  }

  // Campaign Sites / Targeting

  loadCampaignSites(): void {
    if (!this.campaignForm.id) return;
    this.loadingCampaignSites = true;
    this.api.get<{ success: boolean; data: { sites: CampaignSite[] } }>(
      `/campaigns/${this.campaignForm.id}/sites`
    ).subscribe({
      next: (r) => { this.campaignSites = r.data?.sites || []; },
      error: () => this.notification.error('Erreur chargement sites'),
      complete: () => { this.loadingCampaignSites = false; }
    });
  }

  loadGroups(): void {
    this.api.get<{ success: boolean; data: GroupOption[] }>('/groups').subscribe({
      next: (r) => { this.availableGroups = r.data || []; },
    });
  }

  previewTargetSites(): void {
    const criteria: Record<string, unknown> = {};
    if (this.targetCriteriaSports.trim()) {
      criteria['sports'] = this.targetCriteriaSports.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (this.targetCriteriaRegions.trim()) {
      criteria['regions'] = this.targetCriteriaRegions.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (this.targetCriteriaGroupId) {
      criteria['group_ids'] = [this.targetCriteriaGroupId];
    }
    if (Object.keys(criteria).length === 0) {
      this.notification.error('Saisissez au moins un critere de ciblage');
      return;
    }

    this.resolvingSites = true;
    this.api.post<{ success: boolean; data: { sites: ResolvedSite[] } }>(
      '/campaigns/resolve-sites', { target_criteria: criteria }
    ).subscribe({
      next: (r) => { this.resolvedSites = r.data?.sites || []; },
      error: () => this.notification.error('Erreur resolution sites'),
      complete: () => { this.resolvingSites = false; }
    });
  }

  applyCriteriaToSites(): void {
    if (!this.campaignForm.id || this.resolvedSites.length === 0) return;
    this.addingSitesToCampaign = true;

    const criteria: Record<string, unknown> = {};
    if (this.targetCriteriaSports.trim()) criteria['sports'] = this.targetCriteriaSports.split(',').map(s => s.trim()).filter(Boolean);
    if (this.targetCriteriaRegions.trim()) criteria['regions'] = this.targetCriteriaRegions.split(',').map(s => s.trim()).filter(Boolean);
    if (this.targetCriteriaGroupId) criteria['group_ids'] = [this.targetCriteriaGroupId];

    this.api.put(`/campaigns/${this.campaignForm.id}`, { target_criteria: criteria }).subscribe({
      next: () => {
        this.api.post(`/campaigns/${this.campaignForm.id}/sites`, { resolve: true }).subscribe({
          next: () => {
            this.notification.success(`${this.resolvedSites.length} site(s) ajoutes`);
            this.resolvedSites = [];
            this.loadCampaignSites();
            this.loadCampaigns();
          },
          error: () => this.notification.error('Erreur ajout sites'),
          complete: () => { this.addingSitesToCampaign = false; }
        });
      },
      error: () => {
        this.notification.error('Erreur sauvegarde criteres');
        this.addingSitesToCampaign = false;
      }
    });
  }

  getUnassignedAdvertiserSites(): AssignedSite[] {
    const campaignSiteIds = new Set(this.campaignSites.map(cs => cs.site_id));
    return this.assignedSites.filter(as => !campaignSiteIds.has(as.site_id));
  }

  addSiteToCampaign(siteId: string): void {
    if (!this.campaignForm.id) return;
    this.api.post(`/campaigns/${this.campaignForm.id}/sites`, { site_id: siteId }).subscribe({
      next: () => { this.loadCampaignSites(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur ajout site'),
    });
  }

  removeCampaignSite(siteId: string): void {
    if (!this.campaignForm.id) return;
    this.api.delete(`/campaigns/${this.campaignForm.id}/sites/${siteId}`).subscribe({
      next: () => { this.loadCampaignSites(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur retrait site'),
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
      error: (err) => {
        const serverMsg = err?.error?.error;
        if (serverMsg?.includes('no videos')) {
          this.notification.error('La campagne n\'a pas de vidéos — ajoutez au moins une vidéo avant de déployer');
        } else if (serverMsg?.includes('no target sites')) {
          this.notification.error('La campagne n\'a pas de sites cibles — ajoutez des sites ou configurez les critères de ciblage');
        } else if (serverMsg?.includes('not found')) {
          this.notification.error('Campagne introuvable');
        } else {
          this.notification.error('Erreur lors du deploiement');
        }
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

  formatDuration(seconds: number | null): string {
    if (!seconds || isNaN(seconds)) return '0s';
    const s = Math.round(seconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
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
}
