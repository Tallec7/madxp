import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { CampaignDataService } from './services/campaign-data.service';
import {
  Campaign, CampaignSite, CampaignVideo,
  ResolvedSite, GroupOption, SponsorVideo, AssignedSite
} from './advertiser-detail.models';

@Component({
  selector: 'app-sponsor-campaigns-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './sponsor-campaigns-tab.component.html',
  styleUrls: ['./sponsor-campaigns-tab.component.scss']
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
  resolvedSites: ResolvedSite[] = [];
  resolvingSites = false;
  availableGroups: GroupOption[] = [];
  addingSitesToCampaign = false;
  targetCriteriaSports = '';
  targetCriteriaRegions = '';
  targetCriteriaGroupId = '';

  private campaignData = inject(CampaignDataService);
  private notification = inject(NotificationService);
  private confirmDialog = inject(ConfirmDialogService);

  ngOnInit(): void {
    this.loadCampaigns();
  }

  loadCampaigns(): void {
    this.loadingCampaigns = true;
    this.campaignData.loadCampaigns(this.sponsorId).subscribe({
      next: (campaigns) => { this.campaigns = campaigns; },
      error: () => this.notification.error('Erreur lors du chargement des campagnes'),
      complete: () => { this.loadingCampaigns = false; }
    });
  }

  // Modal management

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

  // CRUD

  saveCampaign(event: Event): void {
    event.preventDefault();
    if (!this.campaignForm.name) {
      this.notification.error('Le nom de la campagne est requis');
      return;
    }

    this.savingCampaign = true;
    const payload = { ...this.campaignForm, advertiser_id: this.sponsorId };

    if (this.isEditingCampaign) {
      this.campaignData.updateCampaign(this.campaignForm.id!, payload).subscribe({
        next: () => { this.notification.success('Campagne mise a jour'); this.loadCampaigns(); },
        error: () => this.notification.error('Erreur lors de l\'enregistrement'),
        complete: () => { this.savingCampaign = false; }
      });
    } else {
      this.campaignData.createCampaign(payload as Partial<Campaign> & { advertiser_id: string }).subscribe({
        next: (newId) => {
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

  async deleteCampaign(campaignId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Supprimer cette campagne ? Les videos ne seront plus deployees sur les sites cibles.',
      { title: 'Supprimer la campagne', confirmLabel: 'Supprimer', confirmStyle: 'danger' }
    );
    if (!ok) return;

    this.removingCampaign = campaignId;
    this.campaignData.deleteCampaign(campaignId).subscribe({
      next: () => {
        this.campaigns = this.campaigns.filter(c => c.id !== campaignId);
        this.notification.success('Campagne supprimee');
      },
      error: () => this.notification.error('Erreur lors de la suppression'),
      complete: () => { this.removingCampaign = null; }
    });
  }

  // Deploy / Undeploy

  deployCampaignAction(campaignId: string): void {
    this.deployingCampaign = campaignId;
    this.campaignData.deployCampaign(campaignId).subscribe({
      next: (count) => {
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
      complete: () => { this.deployingCampaign = null; }
    });
  }

  undeployCampaignAction(campaignId: string): void {
    this.deployingCampaign = campaignId;
    this.campaignData.undeployCampaign(campaignId).subscribe({
      next: (count) => {
        this.notification.success(`Campagne mise en pause (${count} site(s) mis a jour)`);
        this.loadCampaigns();
      },
      error: () => this.notification.error('Erreur lors de la mise en pause'),
      complete: () => { this.deployingCampaign = null; }
    });
  }

  // Campaign Videos

  loadCampaignVideos(): void {
    if (!this.campaignForm.id) return;
    this.loadingCampaignVideos = true;
    this.campaignData.loadCampaignVideos(this.campaignForm.id).subscribe({
      next: (videos) => { this.campaignVideos = videos; },
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
    this.campaignData.addCampaignVideo(this.campaignForm.id, videoId).subscribe({
      next: () => { this.loadCampaignVideos(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur ajout video'),
      complete: () => { this.addingCampaignVideo = false; }
    });
  }

  removeCampaignVideo(videoId: string): void {
    if (!this.campaignForm.id) return;
    this.campaignData.removeCampaignVideo(this.campaignForm.id, videoId).subscribe({
      next: () => { this.loadCampaignVideos(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur retrait video'),
    });
  }

  updateCampaignVideoWeight(videoId: string, event: Event): void {
    const weight = Number((event.target as HTMLInputElement).value) || 1;
    if (!this.campaignForm.id) return;
    this.campaignData.updateCampaignVideoWeight(this.campaignForm.id, videoId, weight).subscribe({
      error: () => this.notification.error('Erreur mise a jour poids'),
    });
  }

  // Campaign Sites / Targeting

  loadCampaignSites(): void {
    if (!this.campaignForm.id) return;
    this.loadingCampaignSites = true;
    this.campaignData.loadCampaignSites(this.campaignForm.id).subscribe({
      next: (sites) => { this.campaignSites = sites; },
      error: () => this.notification.error('Erreur chargement sites'),
      complete: () => { this.loadingCampaignSites = false; }
    });
  }

  loadGroups(): void {
    this.campaignData.loadGroups().subscribe({
      next: (groups) => { this.availableGroups = groups; },
    });
  }

  previewTargetSites(): void {
    const criteria = this.buildTargetCriteria();
    if (!criteria) {
      this.notification.error('Saisissez au moins un critere de ciblage');
      return;
    }
    this.resolvingSites = true;
    this.campaignData.resolveSites(criteria).subscribe({
      next: (sites) => { this.resolvedSites = sites; },
      error: () => this.notification.error('Erreur resolution sites'),
      complete: () => { this.resolvingSites = false; }
    });
  }

  applyCriteriaToSites(): void {
    if (!this.campaignForm.id || this.resolvedSites.length === 0) return;
    const criteria = this.buildTargetCriteria();
    if (!criteria) return;

    this.addingSitesToCampaign = true;
    this.campaignData.applyCriteriaAndAddSites(this.campaignForm.id, criteria).subscribe({
      next: () => {
        this.notification.success(`${this.resolvedSites.length} site(s) ajoutes`);
        this.resolvedSites = [];
        this.loadCampaignSites();
        this.loadCampaigns();
      },
      error: () => this.notification.error('Erreur ajout sites'),
      complete: () => { this.addingSitesToCampaign = false; }
    });
  }

  getUnassignedAdvertiserSites(): AssignedSite[] {
    const campaignSiteIds = new Set(this.campaignSites.map(cs => cs.site_id));
    return this.assignedSites.filter(as => !campaignSiteIds.has(as.site_id));
  }

  addSiteToCampaign(siteId: string): void {
    if (!this.campaignForm.id) return;
    this.campaignData.addSiteToCampaign(this.campaignForm.id, siteId).subscribe({
      next: () => { this.loadCampaignSites(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur ajout site'),
    });
  }

  removeCampaignSite(siteId: string): void {
    if (!this.campaignForm.id) return;
    this.campaignData.removeCampaignSite(this.campaignForm.id, siteId).subscribe({
      next: () => { this.loadCampaignSites(); this.loadCampaigns(); },
      error: () => this.notification.error('Erreur retrait site'),
    });
  }

  // Formatting helpers

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

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // Private

  private buildTargetCriteria(): Record<string, unknown> | null {
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
    return Object.keys(criteria).length > 0 ? criteria : null;
  }
}
