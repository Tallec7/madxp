import {
  Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { Site, SiteSponsor, SiteSponsorStatsResponse, GeneratedReport, SiteSponsorBenchmarkResponse, CloudVideo, SiteConfiguration } from '../../../../core/models';
import { SiteSponsorsTabDataService } from './site-sponsors-tab.data.service';
import { SiteSponsorsChartService } from './site-sponsors-tab.chart.service';

@Component({
  selector: 'app-site-sponsors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-sponsors-tab.component.html',
  styleUrl: './site-sponsors-tab.component.scss',
})
export class SiteSponsorsTabComponent implements OnInit, OnDestroy {
  @Input() siteId = '';
  @Input() site: Site | null = null;

  @ViewChild('trendsChart') trendsChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly dataService = inject(SiteSponsorsTabDataService);
  private readonly chartService = inject(SiteSponsorsChartService);
  private readonly notification = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly cdr = inject(ChangeDetectorRef);

  // List
  sponsors: SiteSponsor[] = [];
  loading = true;
  error = '';

  // Detail expand
  expandedSponsorId: string | null = null;
  detailLoading = false;
  detailStats: SiteSponsorStatsResponse | null = null;
  reports: GeneratedReport[] = [];
  reportsLoading = false;

  // Modal
  showModal = false;
  isEditing = false;
  editingSponsorId = '';
  saving = false;
  formData: {
    name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    status: string;
  } = { name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'active' };

  // Wizard (create flow)
  wizardStep = 1;
  wizardVideos: CloudVideo[] = [];
  wizardFilteredVideos: CloudVideo[] = [];
  wizardVideosLoading = false;
  wizardVideoSearch = '';
  wizardSelectedVideo = '';
  wizardAddToLoop = true;

  // Benchmark (P6.2)
  benchmarkData: SiteSponsorBenchmarkResponse | null = null;
  benchmarkLoading = false;
  benchmarkHasCpi = false;

  // Report generation
  generatingReportId: string | null = null;

  // Video association
  availableVideos: CloudVideo[] = [];
  availableVideosLoading = false;
  selectedVideoFilename = '';
  addingVideo = false;
  removingVideoFilename: string | null = null;

  // Access link (P5)
  expandedSponsor: SiteSponsor | null = null;
  creatingAccessLink = false;
  accessLinkUrl: string | null = null;
  accessLinkCopied = false;

  // Loop presence detection (video-not-in-loop warning)
  private videosInLoops: Set<string> = new Set();
  configLoaded = false;

  // Cached site content to avoid multiple identical API calls
  private cachedConfiguration: SiteConfiguration | null = null;

  ngOnInit(): void {
    this.loadSponsors();
    this.loadSiteContentOnce();
  }

  ngOnDestroy(): void {
    this.chartService.destroyChart();
  }

  loadSponsors(): void {
    this.loading = true;
    this.error = '';
    this.dataService.listSponsors(this.siteId, true).subscribe({
      next: (res) => {
        // ADR-035 Phase 1: filtrer les sponsors neopro (visibles uniquement côté admin annonceurs)
        this.sponsors = (res?.sponsors ?? []).filter(s => s.source !== 'neopro');
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Impossible de charger les sponsors';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Detail expand
  // =========================================================================

  toggleDetail(sponsor: SiteSponsor): void {
    if (this.expandedSponsorId === sponsor.id) {
      this.expandedSponsorId = null;
      this.expandedSponsor = null;
      this.detailStats = null;
      this.reports = [];
      this.benchmarkData = null;
      this.benchmarkHasCpi = false;
      this.accessLinkUrl = null;
      this.accessLinkCopied = false;
      this.availableVideos = [];
      this.selectedVideoFilename = '';
      this.chartService.destroyChart();
      this.cdr.markForCheck();
      return;
    }

    this.expandedSponsorId = sponsor.id;
    this.expandedSponsor = sponsor;
    this.detailLoading = true;
    this.detailStats = null;
    this.reports = [];
    this.benchmarkData = null;
    this.benchmarkHasCpi = false;
    this.accessLinkUrl = null;
    this.accessLinkCopied = false;
    this.selectedVideoFilename = '';
    this.cdr.markForCheck();

    // Load stats + reports + benchmark in parallel
    this.dataService.getSponsorStats(this.siteId, sponsor.id).subscribe({
      next: (stats) => {
        this.detailStats = stats;
        this.detailLoading = false;
        this.cdr.markForCheck();
        // Render chart after next tick
        setTimeout(() => this.renderTrendsChart(), 50);
        // Load available videos after stats (to filter already-associated ones)
        this.loadAvailableVideos();
      },
      error: () => {
        this.detailLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.reportsLoading = true;
    this.dataService.getSponsorReports(sponsor.id).subscribe({
      next: (reports) => {
        this.reports = reports;
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.benchmarkLoading = true;
    this.dataService.getBenchmark(this.siteId).subscribe({
      next: (benchmark) => {
        this.benchmarkData = benchmark;
        this.benchmarkHasCpi = benchmark?.sponsors?.some(s => s.cpi !== null) ?? false;
        this.benchmarkLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.benchmarkLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Chart
  // =========================================================================

  private renderTrendsChart(): void {
    if (!this.trendsChartRef || !this.detailStats?.daily_trends?.length) return;
    this.chartService.renderTrendsChart(
      this.trendsChartRef.nativeElement,
      this.detailStats.daily_trends,
    );
    this.cdr.markForCheck();
  }

  // =========================================================================
  // Modal CRUD
  // =========================================================================

  openCreateModal(): void {
    this.isEditing = false;
    this.editingSponsorId = '';
    this.formData = { name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'active' };
    this.wizardStep = 1;
    this.wizardSelectedVideo = '';
    this.wizardVideoSearch = '';
    this.wizardAddToLoop = true;
    this.wizardVideos = [];
    this.wizardFilteredVideos = [];
    this.showModal = true;
    this.cdr.markForCheck();
  }

  openEditModal(sponsor: SiteSponsor): void {
    this.isEditing = true;
    this.editingSponsorId = sponsor.id;
    this.formData = {
      name: sponsor.name,
      contact_name: sponsor.contact_name || '',
      contact_email: sponsor.contact_email || '',
      contact_phone: sponsor.contact_phone || '',
      status: sponsor.status,
    };
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.cdr.markForCheck();
  }

  saveSponsor(event: Event): void {
    event.preventDefault();
    if (!this.formData.name.trim()) return;

    this.saving = true;
    const payload: Partial<SiteSponsor> = {
      name: this.formData.name.trim(),
      contact_name: this.formData.contact_name.trim() || null,
      contact_email: this.formData.contact_email.trim() || null,
      contact_phone: this.formData.contact_phone.trim() || null,
      status: this.formData.status as SiteSponsor['status'],
    };

    const obs = this.isEditing
      ? this.dataService.updateSponsor(this.siteId, this.editingSponsorId, payload)
      : this.dataService.createSponsor(this.siteId, payload);

    obs.subscribe({
      next: () => {
        this.notification.success(this.isEditing ? 'Sponsor mis à jour' : 'Sponsor créé');
        this.saving = false;
        this.showModal = false;
        this.loadSponsors();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'enregistrement');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Wizard (3-step create flow)
  // =========================================================================

  wizardNext(): void {
    if (this.wizardStep === 1) {
      if (!this.formData.name.trim()) return;
      this.wizardStep = 2;
      // Load available videos for step 2
      if (this.wizardVideos.length === 0) {
        this.loadWizardVideos();
      }
    } else if (this.wizardStep === 2) {
      this.wizardStep = 3;
    }
    this.cdr.markForCheck();
  }

  wizardBack(): void {
    if (this.wizardStep > 1) {
      this.wizardStep--;
      this.cdr.markForCheck();
    }
  }

  loadWizardVideos(): void {
    // Use cached config (deployed videos only) instead of all cloud videos
    this.wizardVideos = this.dataService.extractDeployedVideos(this.cachedConfiguration);
    this.filterWizardVideos();
    this.cdr.markForCheck();
  }

  filterWizardVideos(): void {
    const term = this.wizardVideoSearch.toLowerCase();
    this.wizardFilteredVideos = this.wizardVideos.filter(v =>
      v.filename.toLowerCase().includes(term) ||
      (v.title || '').toLowerCase().includes(term)
    );
  }

  wizardCreate(): void {
    if (!this.formData.name.trim()) return;

    this.saving = true;
    this.cdr.markForCheck();

    const payload: Partial<SiteSponsor> = {
      name: this.formData.name.trim(),
      contact_name: this.formData.contact_name.trim() || null,
      contact_email: this.formData.contact_email.trim() || null,
      contact_phone: this.formData.contact_phone.trim() || null,
      status: 'active' as SiteSponsor['status'],
    };

    this.dataService.createSponsor(this.siteId, payload).subscribe({
      next: (created) => {
        // If video selected, associate it
        if (this.wizardSelectedVideo && created?.id) {
          this.dataService.addVideo(this.siteId, created.id, this.wizardSelectedVideo).subscribe({
            next: () => {
              this.saving = false;
              this.wizardStep = 4; // success screen
              this.loadSponsors();
              this.cdr.markForCheck();
            },
            error: () => {
              // Sponsor created but video association failed
              this.notification.warning('Sponsor créé mais erreur lors de l\'association de la vidéo');
              this.saving = false;
              this.wizardStep = 4;
              this.loadSponsors();
              this.cdr.markForCheck();
            },
          });
        } else {
          this.saving = false;
          this.wizardStep = 4; // success screen
          this.loadSponsors();
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.notification.error('Erreur lors de la création du sponsor');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  async confirmDelete(sponsor: SiteSponsor): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      `Supprimer le sponsor "${sponsor.name}" ? Cette action est irréversible.`,
      { title: 'Suppression', confirmLabel: 'Supprimer' },
    );
    if (!ok) return;

    this.dataService.deleteSponsor(this.siteId, sponsor.id).subscribe({
      next: () => {
        this.notification.success('Sponsor supprimé');
        if (this.expandedSponsorId === sponsor.id) {
          this.expandedSponsorId = null;
          this.chartService.destroyChart();
        }
        this.loadSponsors();
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
      },
    });
  }

  // =========================================================================
  // Report generation
  // =========================================================================

  generateReport(sponsor: SiteSponsor): void {
    this.generatingReportId = sponsor.id;
    this.cdr.markForCheck();

    // Generate report for last month
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, 1); // 1st of prev month

    this.dataService.generateReport(
      this.siteId,
      sponsor.id,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
    ).subscribe({
      next: (result) => {
        const emailNote = sponsor.contact_email ? ` Un email a été envoyé à ${sponsor.contact_email}.` : '';
        this.notification.success(`Rapport généré avec succès.${emailNote}`);
        this.generatingReportId = null;
        // Refresh reports if this sponsor is expanded
        if (this.expandedSponsorId === sponsor.id) {
          this.loadReports(sponsor.id);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de la génération du rapport');
        this.generatingReportId = null;
        this.cdr.markForCheck();
      },
    });
  }

  private loadReports(sponsorId: string): void {
    this.reportsLoading = true;
    this.dataService.getSponsorReports(sponsorId).subscribe({
      next: (reports) => {
        this.reports = reports;
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Access Link (P5)
  // =========================================================================

  createAccessLink(sponsor: SiteSponsor): void {
    this.creatingAccessLink = true;
    this.accessLinkUrl = null;
    this.accessLinkCopied = false;
    this.cdr.markForCheck();

    this.dataService.createAccessLink(this.siteId, sponsor.id).subscribe({
      next: (result: { accessUrl: string; expiresAt: string; emailSent: boolean; sentTo: string | null }) => {
        this.creatingAccessLink = false;
        this.accessLinkUrl = result.accessUrl;
        if (result.emailSent && result.sentTo) {
          this.notification.success(`Lien envoyé à ${result.sentTo}`);
        } else {
          this.notification.success('Lien d\'accès généré — copiez-le ci-dessous');
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.creatingAccessLink = false;
        this.notification.error('Erreur lors de la création du lien d\'accès');
        this.cdr.markForCheck();
      },
    });
  }

  copyAccessLink(): void {
    if (!this.accessLinkUrl) return;
    navigator.clipboard.writeText(this.accessLinkUrl).then(() => {
      this.accessLinkCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.accessLinkCopied = false;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  // =========================================================================
  // Video association
  // =========================================================================

  private loadAvailableVideos(): void {
    // Use cached config (deployed videos only) instead of all cloud videos
    const associatedFilenames = new Set(
      (this.detailStats?.videos ?? []).map(v => v.video_filename)
    );
    this.availableVideos = this.dataService.extractDeployedVideos(this.cachedConfiguration)
      .filter(v => !associatedFilenames.has(v.filename));
    this.availableVideosLoading = false;
    this.cdr.markForCheck();
  }

  addVideo(): void {
    if (!this.selectedVideoFilename || !this.expandedSponsorId) return;

    this.addingVideo = true;
    this.cdr.markForCheck();

    this.dataService.addVideo(
      this.siteId, this.expandedSponsorId, this.selectedVideoFilename
    ).subscribe({
      next: () => {
        this.notification.success('Vidéo associée au sponsor');
        this.addingVideo = false;
        this.selectedVideoFilename = '';
        // Refresh stats (includes videos) + available videos
        this.refreshSponsorDetail();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'association de la vidéo');
        this.addingVideo = false;
        this.cdr.markForCheck();
      },
    });
  }

  async removeVideo(filename: string): Promise<void> {
    if (!this.expandedSponsorId) return;
    const ok = await this.confirmDialog.confirm(`Retirer la vidéo "${filename}" de ce sponsor ?`);
    if (!ok) return;

    this.removingVideoFilename = filename;
    this.cdr.markForCheck();

    this.dataService.removeVideo(
      this.siteId, this.expandedSponsorId, filename
    ).subscribe({
      next: () => {
        this.notification.success('Vidéo retirée du sponsor');
        this.removingVideoFilename = null;
        // Refresh stats (includes videos) + available videos
        this.refreshSponsorDetail();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
        this.removingVideoFilename = null;
        this.cdr.markForCheck();
      },
    });
  }

  private refreshSponsorDetail(): void {
    if (!this.expandedSponsorId) return;
    const sponsorId = this.expandedSponsorId;

    this.dataService.getSponsorStats(this.siteId, sponsorId).subscribe({
      next: (stats) => {
        this.detailStats = stats;
        this.cdr.markForCheck();
        // Refresh available videos with updated association list
        this.loadAvailableVideos();
        // Also refresh the sponsor list (video_count in table)
        this.loadSponsors();
      },
    });
  }

  // =========================================================================
  // Loop presence detection (video-not-in-loop warning)
  // =========================================================================

  /**
   * Single API call that loads the site config and caches it for reuse by
   * loadWizardVideos(), loadAvailableVideos(), and loop detection.
   */
  private loadSiteContentOnce(): void {
    this.dataService.loadSiteContent(this.siteId).subscribe({
      next: (content) => {
        this.cachedConfiguration = content.configuration ?? null;
        this.videosInLoops = this.dataService.buildVideosInLoopsSet(this.cachedConfiguration);
        this.configLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cachedConfiguration = null;
        this.configLoaded = false;
      },
    });
  }

  private isFilenameInLoop(filename: string): boolean {
    return this.dataService.isFilenameInLoop(filename, this.videosInLoops);
  }

  /**
   * Returns true if the sponsor has videos that are NOT found in any loop or category.
   */
  hasVideosNotInLoop(sponsor: SiteSponsor): boolean {
    if (!this.configLoaded) return false;
    const filenames = sponsor.video_filenames ?? [];
    if (filenames.length === 0) return false;
    return filenames.some(f => !this.isFilenameInLoop(f));
  }

  /**
   * Returns true if a specific video filename is NOT in any loop or category.
   */
  isVideoNotInLoop(filename: string): boolean {
    if (!this.configLoaded) return false;
    return !this.isFilenameInLoop(filename);
  }

  /**
   * Returns the count of sponsor videos missing from loops/categories.
   */
  getVideosNotInLoopCount(sponsor: SiteSponsor): number {
    if (!this.configLoaded) return 0;
    const filenames = sponsor.video_filenames ?? [];
    return filenames.filter(f => !this.isFilenameInLoop(f)).length;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  // =========================================================================
  // Config complete/incomplete indicator (F-AUD-24)
  // =========================================================================

  isConfigComplete(sponsor: SiteSponsor): boolean {
    return (sponsor.video_count ?? 0) >= 1;
  }

  getConfigTooltip(sponsor: SiteSponsor): string {
    if (this.isConfigComplete(sponsor)) {
      return 'Ce sponsor est correctement configuré et diffusé';
    }
    if ((sponsor.video_count ?? 0) === 0) {
      return 'Aucune vidéo associée — ce sponsor ne sera pas diffusé';
    }
    return 'Configuration incomplète';
  }

  getConfigCta(sponsor: SiteSponsor): string {
    if ((sponsor.video_count ?? 0) === 0) {
      return '+ Ajouter une vidéo';
    }
    return 'Configurer';
  }

  formatScreenTime(seconds: number): string {
    if (!seconds) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  }

  // =========================================================================
  // Sync status badge (F-AUD-23)
  // =========================================================================

  get syncStatusClass(): string {
    if (!this.site) return 'sync-unknown';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) {
      return 'sync-pending';
    }

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'sync-unknown';

    const ageMs = Date.now() - new Date(lastSync).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours < 24) return 'sync-ok';
    if (ageHours < 72) return 'sync-unknown';
    return 'sync-stale';
  }

  get syncStatusIcon(): string {
    if (!this.site) return '⚪';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) return '🟡';

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return '⚪';

    const ageHours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) return '🟢';
    if (ageHours < 72) return '⚪';
    return '🔴';
  }

  get syncStatusLabel(): string {
    if (!this.site) return 'Sync inconnue';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) return 'Sync en cours…';

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'Jamais synchronisé';

    return `Sync ${this.formatRelativeTime(lastSync)}`;
  }

  get syncTooltip(): string {
    if (!this.site) return 'État de synchronisation inconnu';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) {
      return 'Un déploiement de configuration est en cours vers le Pi';
    }

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'Le Pi n\'a jamais synchronisé sa configuration';

    const ageHours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    const formatted = new Date(lastSync).toLocaleString('fr-FR');

    if (ageHours < 24) {
      return `Configuration synchronisée avec le Pi le ${formatted}`;
    }
    if (ageHours < 72) {
      return `Dernière sync le ${formatted} — le Pi ne s'est pas reconnecté récemment`;
    }
    return `Sync obsolète (${formatted}) — vérifier la connexion du Pi`;
  }

  private formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'à l\'instant';
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  }
}
