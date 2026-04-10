import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  SponsorPortalService,
  SponsorDashboard,
  SponsorSite,
  SponsorVideo,
  PortalCampaign,
  PortalCampaignDetail
} from '../../core/services/sponsor-portal.service';

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './sponsor-dashboard.component.html',
  styleUrl: './sponsor-dashboard.component.scss',
})
export class SponsorDashboardComponent implements OnInit {
  private readonly sponsorService = inject(SponsorPortalService);

  // Expose Math to the template
  Math = Math;

  // Dashboard data
  dashboard: SponsorDashboard | null = null;
  sites: SponsorSite[] = [];
  videos: SponsorVideo[] = [];
  maxImpressions = 1;
  loading = true;
  hasError = false;
  private errorCount = 0;

  // Tabs
  activeTab: 'dashboard' | 'campaigns' | 'campaign-detail' = 'dashboard';

  // Campaigns
  campaigns: PortalCampaign[] = [];
  campaignsLoading = false;
  selectedCampaign: PortalCampaignDetail | null = null;
  campaignStatusFilter = '';
  maxCampaignImpressions = 1;

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.loading = true;
    this.hasError = false;
    this.errorCount = 0;
    this.loadDashboard();
    this.loadSites();
    this.loadVideos();
  }

  retryAll(): void {
    this.loadAll();
  }

  private onApiError(): void {
    this.errorCount++;
    // Si les 3 API échouent, afficher l'erreur globale
    if (this.errorCount >= 3) {
      this.hasError = true;
      this.loading = false;
    }
  }

  loadDashboard(): void {
    this.sponsorService.getDashboard().subscribe({
      next: (response) => {
        this.dashboard = response.data;
        this.maxImpressions = Math.max(...(response.data.trends?.map(t => t.impressions) || [1]));
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  loadSites(): void {
    this.sponsorService.getSites().subscribe({
      next: (response) => {
        this.sites = response.data.sites;
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  loadVideos(): void {
    this.sponsorService.getVideos().subscribe({
      next: (response) => {
        this.videos = response.data.videos;
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  // ===== Tab navigation =====

  switchTab(tab: 'dashboard' | 'campaigns'): void {
    this.activeTab = tab;
    if (tab === 'campaigns' && this.campaigns.length === 0) {
      this.loadCampaigns();
    }
  }

  // ===== Campaigns =====

  loadCampaigns(): void {
    this.campaignsLoading = true;
    const status = this.campaignStatusFilter || undefined;
    this.sponsorService.getCampaigns(status).subscribe({
      next: (response) => {
        this.campaigns = response.data.campaigns;
        this.campaignsLoading = false;
      },
      error: () => {
        this.campaignsLoading = false;
      }
    });
  }

  openCampaignDetail(campaignId: string): void {
    this.activeTab = 'campaign-detail';
    this.selectedCampaign = null;
    this.sponsorService.getCampaignDetail(campaignId).subscribe({
      next: (response) => {
        this.selectedCampaign = response.data;
        this.maxCampaignImpressions = Math.max(
          ...(response.data.daily_impressions?.map(d => d.impressions) || [1])
        );
      },
      error: () => {
        this.activeTab = 'campaigns';
      }
    });
  }

  backToCampaigns(): void {
    this.activeTab = 'campaigns';
    this.selectedCampaign = null;
  }

  getCampaignStatusBadgeClass(status: string): string {
    const classMap: Record<string, string> = {
      draft: 'campaign-badge-draft',
      active: 'campaign-badge-active',
      paused: 'campaign-badge-paused',
      completed: 'campaign-badge-completed',
      failed: 'campaign-badge-failed'
    };
    return classMap[status] || 'campaign-badge-draft';
  }

  getCampaignProgressWidth(campaign: PortalCampaign): number {
    return Math.min(campaign.progress_percent ?? 0, 100);
  }

  formatCampaignDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getCampaignTrendHeight(impressions: number): number {
    return (impressions / this.maxCampaignImpressions) * 100;
  }

  // ===== Existing methods =====

  formatNumber(value: number | undefined | null): string {
    if (!value) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  getTrendHeight(impressions: number): number {
    return (impressions / this.maxImpressions) * 100;
  }

  calculateCPM(): string {
    const impressions = this.dashboard?.stats?.total_impressions_30d || 0;

    if (impressions === 0) {
      return 'N/A';
    }

    return 'Contactez-nous';
  }

  hasReachData(): boolean {
    return (this.dashboard?.stats?.total_reach_30d ?? 0) > 0;
  }
}
