import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subscription, filter, take } from 'rxjs';
import { SitesService, PendingDeployment } from '../../../../core/services/sites.service';
import { SiteCommandService } from '../../../../core/services/site-command.service';
import { SiteSponsorService } from '../../../../core/services/site-sponsor.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { SocketService } from '../../../../core/services/socket.service';
import { DraftService, ConfigDraft, OrchestratedDeploymentProgress } from '../../../../core/services/draft.service';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureGateService } from '../../../../core/services/feature-gate.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import {
  SiteConfiguration,
  LocalVideo,
  CloudVideo,
  LocalStorage,
  SiteSponsor,
  ConfigProfile,
  ContentOwner
} from '../../../../core/models';
import { VideoDeployState, VideoItem, AddToTarget } from '../video-library/video-library.component';
import { UploadedVideo } from '../../../../shared/components/video-upload-zone/video-upload-zone.component';
import { RemotePreviewComponent } from '../../../../shared/components/remote-preview/remote-preview.component';
import { TranslateModule } from '@ngx-translate/core';

import { UnifiedVideoOption, VideoOptionGroupEntry, OrphanedVideoDetail } from './content-tab.models';
import { VideoManagerComponent } from './video-manager/video-manager.component';
import { VideoVariantPanelComponent } from '../../../content/video-variant-panel.component';
import { ConfigEditorComponent } from './config-editor/config-editor.component';
import { DeploymentStatusComponent } from './deployment-status/deployment-status.component';
import { ConfigDraftComponent } from './config-draft/config-draft.component';

@Component({
  selector: 'app-site-content-tab',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslateModule,
    RemotePreviewComponent,
    VideoManagerComponent,
    ConfigEditorComponent,
    DeploymentStatusComponent,
    ConfigDraftComponent,
    VideoVariantPanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-content-tab.component.html',
  styleUrls: ['./site-content-tab.component.scss']
})
export class SiteContentTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input() siteId!: string;
  @Input() siteName = '';
  @Input() siteType = '';
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;
  @Input() isConnected = false;
  @Output() configDeployed = new EventEmitter<void>();

  config: SiteConfiguration = this.getEmptyConfig();
  localVideos: LocalVideo[] = [];
  cloudVideos: CloudVideo[] = [];
  localStorage: LocalStorage | null = null;
  isDirty = false;
  loading = false;

  private originalConfig = '';

  // Refresh from Pi
  refreshingFromPi = false;
  lastSyncTime: Date | null = null;
  private refreshCommandId: string | null = null;
  private refreshPollSubscription: Subscription | null = null;

  // Video deploy tracking
  videoDeployStates: Map<string, VideoDeployState> = new Map();
  private videoDeploySubscriptions: Map<string, Subscription> = new Map();
  private videoDeployTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Unified video options
  unifiedVideoOptions: UnifiedVideoOption[] = [];
  videoOptionGroups: VideoOptionGroupEntry[] = [];
  cloudVideoPaths: Set<string> = new Set();
  allKnownVideoPaths: Set<string> = new Set();
  videoDurations: Map<string, number> = new Map();
  configVideoRoles: Map<string, Set<string>> = new Map();

  // Secondary display
  secondaryVariantVideoIds: Set<string> = new Set();
  secondaryDisplayEnabled = false;
  configVariantTarget: { cloudId: string; displayName: string } | null = null;

  // Orphaned videos
  orphanedVideoCount = 0;
  repairableOrphanCount = 0;
  orphanedVideoDetails: OrphanedVideoDetail[] = [];
  private filenameToPathsMap: Map<string, string[]> = new Map();

  // Deployed paths
  private deployedPathsMap: Map<string, { deployedPath: string; deployedFilename: string }> = new Map();

  // Site sponsors
  siteSponsors: SiteSponsor[] = [];

  // Profiles
  contentProfiles: ConfigProfile[] = [];
  selectedProfileId = '';

  // Draft
  draft: ConfigDraft | null = null;

  // Orchestrated deployment
  orchestratedDeployment: OrchestratedDeploymentProgress | null = null;

  // Pending deployments
  pendingDeployments: PendingDeployment[] = [];
  loadingPendingDeployments = false;

  // Time categories cache
  cachedTimeCategories: { id: string; name: string; icon: string; description: string }[] = [];

  // Config targets for "Add to" dropdown in video library
  configTargets: AddToTarget[] = [];

  // Remote preview
  showRemotePreview = false;

  get pendingDeploymentVideoIds(): Set<string> {
    const ids = new Set<string>();
    for (const [videoId, state] of this.videoDeployStates.entries()) {
      if (state.status === 'deploying') ids.add(videoId);
    }
    return ids;
  }

  get validationErrors(): string[] {
    const errors: string[] = [];
    this.config.sponsors?.forEach((s, i) => {
      if (!s.path) errors.push(`Boucle par défaut: vidéo ${i + 1} sans fichier`);
    });
    this.config.categories?.forEach(cat => {
      cat.videos?.forEach((v, i) => {
        if (!v.path) errors.push(`Catégorie "${cat.name || 'Sans nom'}": vidéo ${i + 1} sans fichier`);
      });
      cat.subCategories?.forEach(sub => {
        sub.videos?.forEach((v, i) => {
          if (!v.path) errors.push(`Sous-catégorie "${sub.name || 'Sans nom'}": vidéo ${i + 1} sans fichier`);
        });
      });
    });
    this.config.timeCategories?.forEach(tc => {
      tc.loopVideos?.forEach((v: { path?: string }, i: number) => {
        if (!v.path) errors.push(`Phase "${tc.name}": vidéo ${i + 1} sans fichier`);
      });
    });
    return errors;
  }

  get validationWarnings(): string[] {
    if (!this.config) return [];
    const warnings: string[] = [];
    if (this.config.sponsors?.length > 0 && !this.hasPhaseLoops()) {
      warnings.push(`${this.config.sponsors.length} vidéo(s) dans la boucle par défaut sans tracking analytics`);
    }
    for (const tc of this.config.timeCategories || []) {
      for (const catId of tc.categoryIds || []) {
        const cat = this.config.categories?.find(c => c.id === catId);
        if (cat && (!cat.videos || cat.videos.length === 0) && (!cat.subCategories || cat.subCategories.length === 0)) {
          warnings.push(`Catégorie "${cat.name}" assignée à ${tc.name} mais vide`);
        }
      }
    }
    const unmapped = this.getUnmappedAnalyticsCount();
    if (unmapped > 0) warnings.push(`${unmapped} catégorie(s) non mappée(s) en analytics`);
    return warnings;
  }

  constructor(
    private sitesService: SitesService,
    private commandService: SiteCommandService,
    private sponsorService: SiteSponsorService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private socketService: SocketService,
    private draftService: DraftService,
    private authService: AuthService,
    private gate: FeatureGateService,
    private cdr: ChangeDetectorRef
  ) {}

  get isClub(): boolean {
    return this.authService.getCurrentUser()?.role === 'club';
  }

  get isSuperAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'super_admin';
  }

  get canUseMultiProfiles(): boolean {
    return this.gate.canAccess('multi_profiles', {
      subscription_plan: this.subscriptionPlan,
      feature_overrides: this.featureOverrides,
    });
  }

  ngOnInit(): void {
    this.loadContent();
    this.loadDraft();
    this.loadSiteSponsors();
    this.loadProfiles();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadContent();
      this.loadDraft();
      this.loadSiteSponsors();
      this.loadProfiles();
    }
  }

  ngOnDestroy(): void {
    this.refreshPollSubscription?.unsubscribe();
    for (const videoId of this.videoDeploySubscriptions.keys()) {
      this.cleanupVideoDeployTracking(videoId);
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  loadContent(): void {
    if (!this.siteId) return;
    this.loading = true;
    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response) => {
        this.loading = false;
        this.localVideos = response.localVideos || [];
        this.cloudVideos = response.cloudVideos || [];
        this.localStorage = response.localStorage || null;
        this.secondaryVariantVideoIds = new Set(response.secondaryVariantVideoIds || []);
        // Use feature gate instead of deprecated DB column (sites.secondary_display_enabled)
        this.secondaryDisplayEnabled = this.gate.canAccess('secondary_display', {
          subscription_plan: this.subscriptionPlan,
          feature_overrides: this.featureOverrides,
        });

        this.deployedPathsMap = new Map();
        for (const dp of response.deployedPaths || []) {
          this.deployedPathsMap.set(dp.videoId, { deployedPath: dp.deployedPath, deployedFilename: dp.deployedFilename });
        }

        if (!this.selectedProfileId) {
          if (response.configuration) {
            this.config = this.normalizeConfig(response.configuration);
          } else {
            this.config = this.getEmptyConfig();
          }
          this.originalConfig = JSON.stringify(this.config);
          this.isDirty = false;
          this.rebuildTimeCategoriesCache();
          this.buildConfigTargets();
        }

        this.rebuildVideoCache();
        this.refreshPendingDeployments();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load content', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  refreshFromPi(): void {
    if (!this.isConnected || this.refreshingFromPi) return;

    this.refreshingFromPi = true;
    this.cdr.markForCheck();

    const timeoutId = setTimeout(() => {
      if (this.refreshingFromPi) {
        this.refreshPollSubscription?.unsubscribe();
        this.refreshingFromPi = false;
        this.notificationService.warning('Le Pi ne répond pas. Essayez à nouveau.');
        this.cdr.markForCheck();
      }
    }, 30000);

    this.commandService.getConfiguration(this.siteId).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.refreshCommandId = response.commandId;
          this.pollRefreshResult(timeoutId);
        } else {
          clearTimeout(timeoutId);
          this.refreshingFromPi = false;
          this.notificationService.warning('Impossible d\'envoyer la commande au Pi.');
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        clearTimeout(timeoutId);
        this.refreshingFromPi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  private pollRefreshResult(timeoutId: ReturnType<typeof setTimeout>): void {
    if (!this.refreshCommandId) return;
    let pollCount = 0;
    const POLL_MAX = 30;

    this.refreshPollSubscription = interval(1000).subscribe(() => {
      pollCount++;
      if (pollCount > POLL_MAX) {
        clearTimeout(timeoutId);
        this.refreshPollSubscription?.unsubscribe();
        this.refreshingFromPi = false;
        this.notificationService.warning('Timeout: le Pi ne répond pas.');
        this.cdr.markForCheck();
        return;
      }

      this.commandService.getCommandStatus(this.siteId, this.refreshCommandId!).subscribe({
        next: (status) => {
          if (status.status === 'completed') {
            clearTimeout(timeoutId);
            this.refreshPollSubscription?.unsubscribe();
            this.refreshingFromPi = false;
            if (status.result?.configuration) {
              this.config = this.normalizeConfig(status.result.configuration);
              this.originalConfig = JSON.stringify(this.config);
              this.isDirty = false;
              this.lastSyncTime = new Date();
              this.rebuildVideoCache();
              this.rebuildTimeCategoriesCache();
              this.buildConfigTargets();
              this.notificationService.success('Configuration synchronisée depuis le Pi');
            } else {
              this.notificationService.info('Aucune configuration sur le Pi.');
            }
            this.cdr.markForCheck();
          } else if (status.status === 'failed') {
            clearTimeout(timeoutId);
            this.refreshPollSubscription?.unsubscribe();
            this.refreshingFromPi = false;
            this.notificationService.error(`Erreur: ${status.error_message || 'Commande échouée'}`);
            this.cdr.markForCheck();
          }
        },
        error: () => { /* Ignore polling errors */ }
      });
    });
  }

  private loadSiteSponsors(): void {
    if (!this.siteId) return;
    this.sponsorService.listSiteSponsors(this.siteId).subscribe({
      next: (response) => {
        this.siteSponsors = (response.sponsors || []).filter(s => s.status === 'active');
        this.cdr.markForCheck();
      },
      error: () => { this.siteSponsors = []; this.cdr.markForCheck(); }
    });
  }

  private loadProfiles(): void {
    if (!this.siteId) return;
    this.sitesService.getProfiles(this.siteId).subscribe({
      next: (response) => {
        this.contentProfiles = response.profiles || [];
        if (this.contentProfiles.length > 0) {
          const defaultProfile = this.contentProfiles.find(p => p.is_default) || this.contentProfiles[0];
          this.selectedProfileId = defaultProfile.id;
          this.applyProfileConfig(defaultProfile.configuration);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.contentProfiles = [];
        this.selectedProfileId = '';
        this.cdr.markForCheck();
      }
    });
  }

  private loadDraft(): void {
    if (!this.siteId) return;
    this.draftService.getDraft(this.siteId).subscribe({
      next: (draft) => {
        this.draft = draft;
        this.cdr.markForCheck();
      },
      error: () => { this.draft = null; this.cdr.markForCheck(); }
    });
  }

  // ============================================================================
  // Config State Management
  // ============================================================================

  markDirty(): void {
    this.isDirty = JSON.stringify(this.config) !== this.originalConfig;
    this.rebuildConfigVideoRoles();
  }

  resetConfig(): void {
    this.config = JSON.parse(this.originalConfig);
    this.isDirty = false;
  }

  onProfileSelected(profileId: string): void {
    this.selectedProfileId = profileId;
    const profile = this.contentProfiles.find(p => p.id === profileId);
    if (profile) this.applyProfileConfig(profile.configuration);
  }

  private applyProfileConfig(configuration: SiteConfiguration): void {
    this.config = this.normalizeConfig(configuration);
    this.originalConfig = JSON.stringify(this.config);
    this.isDirty = false;
    this.rebuildVideoCache();
    this.rebuildTimeCategoriesCache();
    this.buildConfigTargets();
    this.cdr.markForCheck();
  }

  // ============================================================================
  // Event Handlers from Children
  // ============================================================================

  onVideoUploaded(video: UploadedVideo): void {
    this.notificationService.success(`Vidéo "${video.filename}" uploadée`);
    this.loadContent();
  }

  onAllVideosUploaded(videos: UploadedVideo[]): void {
    if (videos.length > 1) {
      this.notificationService.success(`${videos.length} vidéos uploadées pour ce site`);
    }
    this.loadContent();
  }

  onDeployed(): void {
    this.originalConfig = JSON.stringify(this.config);
    this.isDirty = false;
    this.configDeployed.emit();
    this.cdr.markForCheck();
  }

  onDeployStarted(): void {
    this.cdr.markForCheck();
  }

  onDraftSaved(savedDraft: ConfigDraft): void {
    this.draft = savedDraft;
    this.cdr.markForCheck();
  }

  onDraftDeleted(): void {
    this.draft = null;
    this.cdr.markForCheck();
  }

  onVersionRestored(restored: SiteConfiguration): void {
    this.config = restored;
    this.markDirty();
  }

  onPendingDeploymentCancelled(deployment: PendingDeployment): void {
    this.pendingDeployments = this.pendingDeployments.filter(d => d.id !== deployment.id);
    this.cdr.markForCheck();
  }

  onProfileConfigSynced(profileId: string): void {
    const idx = this.contentProfiles.findIndex(p => p.id === profileId);
    if (idx !== -1) {
      this.contentProfiles[idx] = { ...this.contentProfiles[idx], configuration: JSON.parse(JSON.stringify(this.config)) };
    }
  }

  // ============================================================================
  // Video Deploy Tracking
  // ============================================================================

  /** ADR-050 Phase 2: Add a video to any config target from the library dropdown */
  onAddVideoToTarget(event: { video: VideoItem; target: AddToTarget }): void {
    if (!this.config) return;
    const { video, target } = event;

    if (target.type === 'loop') {
      // Default loop = sponsors[]
      if (!this.config.sponsors) this.config.sponsors = [];
      const alreadyInLoop = this.config.sponsors.some(
        (s: { path?: string }) => s.path === video.path
      );
      if (alreadyInLoop) {
        this.notificationService.info('Cette vidéo est déjà dans la boucle');
        return;
      }
      this.config.sponsors.push({
        path: video.path,
        name: video.displayName,
        weight: 1,
      } as never);
    } else if (target.type === 'match') {
      // Match phase = timeCategories[].loopVideos[]
      const phase = (this.config.timeCategories || []).find(tc => tc.id === target.id);
      if (!phase) return;
      if (!phase.loopVideos) phase.loopVideos = [];
      const alreadyInPhase = phase.loopVideos.some(
        (v: { path?: string }) => v.path === video.path
      );
      if (alreadyInPhase) {
        this.notificationService.info(`Cette vidéo est déjà dans "${target.label}"`);
        return;
      }
      phase.loopVideos.push({
        path: video.path,
        name: video.displayName,
        weight: 1,
      } as never);
    } else if (target.type === 'category') {
      // Action category = categories[].videos[]
      const cat = (this.config.categories || []).find(c => c.id === target.id);
      if (!cat) return;
      if (!cat.videos) cat.videos = [];
      const alreadyInCat = cat.videos.some(
        (v: { path?: string }) => v.path === video.path
      );
      if (alreadyInCat) {
        this.notificationService.info(`Cette vidéo est déjà dans "${target.label}"`);
        return;
      }
      cat.videos.push({
        path: video.path,
        name: video.displayName,
      } as never);
    }

    this.markDirty();
    this.notificationService.success(`"${video.displayName}" ajoutée à "${target.label}"`);
    this.rebuildConfigVideoRoles();
  }

  /** Build the list of available targets for the "Add to" dropdown */
  private buildConfigTargets(): void {
    if (!this.config) {
      this.configTargets = [];
      return;
    }
    const targets: AddToTarget[] = [];

    // Default loop (sponsors[])
    targets.push({ type: 'loop', id: 'default', label: 'Boucle par défaut', icon: '🔄' });

    // Match phases (timeCategories[])
    for (const tc of this.config.timeCategories || []) {
      const icons: Record<string, string> = { 'before': '🏁', 'during': '▶️', 'after': '🏆' };
      targets.push({
        type: 'match',
        id: tc.id,
        label: tc.name || tc.id,
        icon: tc.icon || icons[tc.id] || '📁',
      });
    }

    // Action categories
    for (const cat of this.config.categories || []) {
      targets.push({
        type: 'category',
        id: cat.id,
        label: cat.name || cat.id,
        icon: '🎬',
      });
    }

    this.configTargets = targets;
  }

  onVideoDeploy(video: VideoItem): void {
    if (this.siteType === 'saas') {
      this.notificationService.warning('Les sites SaaS n\'utilisent pas de déploiement vidéo');
      return;
    }

    if (!video.id) {
      this.notificationService.error('Impossible de déployer cette vidéo');
      return;
    }

    if (!video.checksum) {
      this.notificationService.error('Vidéo incomplète (upload échoué). Supprimez-la et re-uploadez.');
      return;
    }

    const currentState = this.videoDeployStates.get(video.id);
    if (currentState?.status === 'deploying') {
      this.notificationService.warning('Déploiement déjà en cours pour cette vidéo');
      return;
    }

    if (confirm(`Déployer "${video.filename}" vers ce site ?`)) {
      const videoId = video.id;
      this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0 });
      this.cdr.markForCheck();

      this.commandService.sendCommand(this.siteId, 'deploy_video', {
        videoId: video.id,
        filename: video.filename,
        url: video.path,
        checksum: video.checksum,
        category: video.category || 'default',
        originalName: video.displayName,
      }).subscribe({
        next: (response) => {
          if (response.queued) {
            this.notificationService.info(`Déploiement de "${video.filename}" en file d'attente (site hors ligne)`);
            this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0, commandId: response.commandId });
          } else if (response.commandId) {
            this.notificationService.info(`Déploiement de "${video.filename}" lancé...`);
            this.videoDeployStates.set(videoId, { status: 'deploying', progress: 0, commandId: response.commandId });
            this.waitForVideoDeployResult(videoId, video.filename, response.commandId);
          }
          this.cdr.markForCheck();
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
          this.videoDeployStates.set(videoId, { status: 'error', error: message });
          this.cdr.markForCheck();
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'error') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 10000);
        }
      });
    }
  }

  private waitForVideoDeployResult(videoId: string, filename: string, commandId: string): void {
    this.cleanupVideoDeployTracking(videoId);
    const VIDEO_DEPLOY_TIMEOUT = 10 * 60 * 1000;

    const timeoutId = setTimeout(() => {
      const currentState = this.videoDeployStates.get(videoId);
      if (currentState?.status === 'deploying') {
        this.videoDeployStates.set(videoId, { status: 'timeout', error: 'Timeout: le Pi n\'a pas répondu dans les temps' });
        this.notificationService.warning(`Timeout: le Pi n'a pas confirmé le déploiement de "${filename}"`);
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
        setTimeout(() => {
          if (this.videoDeployStates.get(videoId)?.status === 'timeout') {
            this.videoDeployStates.delete(videoId);
            this.cdr.markForCheck();
          }
        }, 15000);
      }
    }, VIDEO_DEPLOY_TIMEOUT);
    this.videoDeployTimeouts.set(videoId, timeoutId);

    const completedSub = this.socketService.on<{ siteId: string; commandId: string; commandType: string; status: string; result?: unknown; error?: string }>('command_completed')
      .pipe(filter(event => event.commandId === commandId), take(1))
      .subscribe(event => {
        if (event.status === 'success') {
          this.videoDeployStates.set(videoId, { status: 'success', commandId });
          this.notificationService.success(`"${filename}" déployé avec succès sur le Pi !`);
          this.loadContent();
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'success') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 5000);
        } else {
          const errorMsg = event.error || 'Erreur inconnue';
          this.videoDeployStates.set(videoId, { status: 'error', error: errorMsg, commandId });
          this.notificationService.error(`Erreur de déploiement pour "${filename}": ${errorMsg}`);
          setTimeout(() => {
            if (this.videoDeployStates.get(videoId)?.status === 'error') {
              this.videoDeployStates.delete(videoId);
              this.cdr.markForCheck();
            }
          }, 10000);
        }
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
      });
    this.videoDeploySubscriptions.set(videoId, completedSub);

    const progressSub = this.socketService.on<{ siteId: string; commandId: string; progress: number }>('deploy_progress')
      .pipe(filter(event => event.commandId === commandId))
      .subscribe(event => {
        const currentState = this.videoDeployStates.get(videoId);
        if (currentState?.status === 'deploying') {
          this.videoDeployStates.set(videoId, { ...currentState, progress: event.progress });
          this.cdr.markForCheck();
        }
      });
    completedSub.add(progressSub);

    const timeoutSub = this.socketService.on<{ siteId: string; commandId: string; type: string }>('command_timeout')
      .pipe(filter(event => event.commandId === commandId), take(1))
      .subscribe(() => {
        this.videoDeployStates.set(videoId, { status: 'timeout', error: 'Le serveur a signalé un timeout pour cette commande' });
        this.notificationService.warning(`Timeout serveur pour le déploiement de "${filename}"`);
        this.cdr.markForCheck();
        this.cleanupVideoDeployTracking(videoId);
        setTimeout(() => {
          if (this.videoDeployStates.get(videoId)?.status === 'timeout') {
            this.videoDeployStates.delete(videoId);
            this.cdr.markForCheck();
          }
        }, 15000);
      });
    completedSub.add(timeoutSub);
  }

  private cleanupVideoDeployTracking(videoId: string): void {
    const sub = this.videoDeploySubscriptions.get(videoId);
    if (sub) { sub.unsubscribe(); this.videoDeploySubscriptions.delete(videoId); }
    const timeout = this.videoDeployTimeouts.get(videoId);
    if (timeout) { clearTimeout(timeout); this.videoDeployTimeouts.delete(videoId); }
  }

  // ============================================================================
  // Pending Deployments
  // ============================================================================

  refreshPendingDeployments(): void {
    if (!this.siteId) return;
    this.loadingPendingDeployments = true;
    this.cdr.markForCheck();

    this.sitesService.getPendingDeployments(this.siteId).subscribe({
      next: (deployments) => {
        this.pendingDeployments = deployments;
        this.loadingPendingDeployments = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingPendingDeployments = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ============================================================================
  // Video Cache & Orphan Detection
  // ============================================================================

  private rebuildVideoCache(): void {
    this.rebuildUnifiedVideoOptions();
    this.rebuildConfigVideoRoles();
  }

  private rebuildUnifiedVideoOptions(): void {
    const optionsMap = new Map<string, UnifiedVideoOption>();
    const filenameToKeys = new Map<string, string[]>();

    for (const local of this.localVideos) {
      const key = local.path;
      const fnKey = local.filename.toLowerCase();
      optionsMap.set(key, {
        path: local.path, filename: local.filename, displayName: local.filename,
        category: local.category, isOnPi: true, isForThisSite: false, isCloud: false, source: 'local'
      });
      if (!filenameToKeys.has(fnKey)) filenameToKeys.set(fnKey, []);
      filenameToKeys.get(fnKey)!.push(key);
    }

    for (const cloud of this.cloudVideos) {
      const fnKey = cloud.filename.toLowerCase();
      const localKeys = filenameToKeys.get(fnKey) || [];

      if (localKeys.length > 0) {
        for (const key of localKeys) {
          const existing = optionsMap.get(key)!;
          existing.isCloud = true;
          existing.isForThisSite = cloud.uploadedForSiteId === this.siteId;
          existing.cloudId = cloud.id;
          existing.source = 'both';
          existing.displayName = cloud.title || cloud.originalName || cloud.filename;
          existing.hasSecondaryVariant = this.secondaryVariantVideoIds.has(cloud.id);
        }
      } else {
        const deployed = this.deployedPathsMap.get(cloud.id);
        const localPath = deployed?.deployedPath ?? `videos/${cloud.category || 'default'}/${cloud.filename}`;
        if (!optionsMap.has(localPath)) {
          optionsMap.set(localPath, {
            path: localPath, filename: cloud.filename,
            displayName: cloud.title || cloud.originalName || cloud.filename,
            category: cloud.category, isOnPi: false,
            isForThisSite: cloud.uploadedForSiteId === this.siteId,
            isCloud: true, source: 'cloud', cloudId: cloud.id,
            hasSecondaryVariant: this.secondaryVariantVideoIds.has(cloud.id),
          });
        }
      }
    }

    for (const [, keys] of filenameToKeys) {
      if (keys.length > 1) {
        for (const key of keys) {
          const opt = optionsMap.get(key);
          if (opt) {
            const cat = opt.category || 'sans catégorie';
            opt.displayName = `${opt.displayName} (${cat})`;
          }
        }
      }
    }

    this.unifiedVideoOptions = Array.from(optionsMap.values())
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { numeric: true }));

    const groupedVideoOptions = new Map<string, UnifiedVideoOption[]>();
    groupedVideoOptions.set('forThisSite', []);
    groupedVideoOptions.set('onPi', []);
    groupedVideoOptions.set('cloud', []);

    for (const opt of this.unifiedVideoOptions) {
      if (opt.isForThisSite && !opt.isOnPi) groupedVideoOptions.get('forThisSite')!.push(opt);
      else if (opt.isOnPi) groupedVideoOptions.get('onPi')!.push(opt);
      else groupedVideoOptions.get('cloud')!.push(opt);
    }

    const groups: VideoOptionGroupEntry[] = [];
    const forThisSite = groupedVideoOptions.get('forThisSite') || [];
    const onPi = groupedVideoOptions.get('onPi') || [];
    const cloud = groupedVideoOptions.get('cloud') || [];
    const isSaas = this.siteType === 'saas';
    if (forThisSite.length > 0) groups.push({ key: 'forThisSite', label: 'Pour ce site', icon: '⭐', videos: forThisSite });
    if (onPi.length > 0) groups.push({ key: 'onPi', label: isSaas ? 'Disponibles' : 'Sur le Pi', icon: '✅', videos: onPi });
    if (cloud.length > 0) groups.push({ key: 'cloud', label: isSaas ? 'Bibliothèque cloud' : 'Cloud (à déployer)', icon: '☁️', videos: cloud });
    this.videoOptionGroups = groups;

    this.cloudVideoPaths = new Set(this.unifiedVideoOptions.filter(v => !v.isOnPi).map(v => v.path));

    this.allKnownVideoPaths = new Set(this.unifiedVideoOptions.map(v => v.path));
    for (const local of this.localVideos) this.allKnownVideoPaths.add(local.path);

    this.filenameToPathsMap = new Map();
    for (const local of this.localVideos) {
      const key = local.filename.toLowerCase();
      const existing = this.filenameToPathsMap.get(key) || [];
      if (!existing.includes(local.path)) existing.push(local.path);
      this.filenameToPathsMap.set(key, existing);
    }

    this.videoDurations = new Map<string, number>();
    for (const local of this.localVideos) {
      if (local.duration && local.duration > 0) this.videoDurations.set(local.path, local.duration);
    }
    for (const cloud of this.cloudVideos) {
      if (cloud.duration && cloud.duration > 0) {
        const path = `cloud/${cloud.filename}`;
        if (!this.videoDurations.has(path)) this.videoDurations.set(path, cloud.duration);
      }
    }

    this.detectOrphanedVideoPaths();
  }

  private rebuildConfigVideoRoles(): void {
    const roles = new Map<string, Set<string>>();

    // Build filename → cloud URL map so we can cross-reference local config paths with cloud URLs
    // This fixes the mismatch where configs contain local paths but the library uses cloud URLs
    const filenameToCloudUrl = new Map<string, string>();
    for (const cloud of this.cloudVideos) {
      filenameToCloudUrl.set(cloud.filename.toLowerCase(), cloud.url);
    }

    const addRole = (path: string, role: string): void => {
      if (!roles.has(path)) roles.set(path, new Set());
      roles.get(path)!.add(role);
      // Also register under the cloud URL if the config path is a local path
      const filename = path.split('/').pop()?.toLowerCase();
      if (filename) {
        const cloudUrl = filenameToCloudUrl.get(filename);
        if (cloudUrl && cloudUrl !== path) {
          if (!roles.has(cloudUrl)) roles.set(cloudUrl, new Set());
          roles.get(cloudUrl)!.add(role);
        }
      }
    };

    if (this.config.sponsors) {
      for (const sponsor of this.config.sponsors) { if (sponsor.path) addRole(sponsor.path, 'boucle'); }
    }
    if (this.config.categories) {
      for (const cat of this.config.categories) {
        if (cat.videos) for (const video of cat.videos) { if (video.path) addRole(video.path, 'action'); }
        if (cat.subCategories) {
          for (const subcat of cat.subCategories) {
            if (subcat.videos) for (const video of subcat.videos) { if (video.path) addRole(video.path, 'action'); }
          }
        }
      }
    }
    if (this.config.timeCategories) {
      for (const tc of this.config.timeCategories) {
        if (tc.loopVideos) for (const video of tc.loopVideos) { if (video.path) addRole(video.path, 'match'); }
      }
    }
    this.configVideoRoles = roles;
  }

  private detectOrphanedVideoPaths(): void {
    if (!this.config || this.allKnownVideoPaths.size === 0) {
      this.orphanedVideoCount = 0;
      this.repairableOrphanCount = 0;
      this.orphanedVideoDetails = [];
      return;
    }

    const details: OrphanedVideoDetail[] = [];

    for (const sponsor of this.config.sponsors || []) {
      if (sponsor.path && !this.allKnownVideoPaths.has(sponsor.path)) {
        const suggested = this.tryRepairOrphanedPath(sponsor.path);
        details.push({ path: sponsor.path, location: 'Boucle par défaut', repairable: !!suggested, suggestedPath: suggested });
      }
    }

    for (const cat of this.config.categories || []) {
      for (const video of cat.videos || []) {
        if (video.path && !this.allKnownVideoPaths.has(video.path)) {
          const suggested = this.tryRepairOrphanedPath(video.path);
          details.push({ path: video.path, location: cat.name, repairable: !!suggested, suggestedPath: suggested });
        }
      }
      for (const subcat of cat.subCategories || []) {
        for (const video of subcat.videos || []) {
          if (video.path && !this.allKnownVideoPaths.has(video.path)) {
            const suggested = this.tryRepairOrphanedPath(video.path);
            details.push({ path: video.path, location: `${cat.name} > ${subcat.name}`, repairable: !!suggested, suggestedPath: suggested });
          }
        }
      }
    }

    for (const tc of this.config.timeCategories || []) {
      for (const video of tc.loopVideos || []) {
        if (video.path && !this.allKnownVideoPaths.has(video.path)) {
          const suggested = this.tryRepairOrphanedPath(video.path);
          details.push({ path: video.path, location: `Boucle "${tc.name}"`, repairable: !!suggested, suggestedPath: suggested });
        }
      }
    }

    this.orphanedVideoCount = details.length;
    this.repairableOrphanCount = details.filter(d => d.repairable).length;
    this.orphanedVideoDetails = details;
  }

  private tryRepairOrphanedPath(orphanedPath: string): string | null {
    const parts = orphanedPath.split('/');
    const filename = parts[parts.length - 1].toLowerCase();
    const candidates = this.filenameToPathsMap.get(filename);
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const orphanedSegments = parts.slice(0, -1).map(s => s.toLowerCase());
    let bestCandidate = candidates[0];
    let bestScore = -1;

    for (const candidate of candidates) {
      const candidateSegments = candidate.split('/').slice(0, -1).map(s => s.toLowerCase());
      let score = 0;
      let oi = orphanedSegments.length - 1;
      let ci = candidateSegments.length - 1;
      while (oi >= 0 && ci >= 0) {
        if (orphanedSegments[oi] === candidateSegments[ci]) score++;
        oi--;
        ci--;
      }
      if (score > bestScore) { bestScore = score; bestCandidate = candidate; }
    }
    return bestCandidate;
  }

  repairAllOrphanedPaths(): void {
    let repaired = 0;
    const isOrphaned = (path: string) => path && this.allKnownVideoPaths.size > 0 && !this.allKnownVideoPaths.has(path);

    for (const sponsor of this.config.sponsors || []) {
      if (isOrphaned(sponsor.path)) {
        const suggested = this.tryRepairOrphanedPath(sponsor.path);
        if (suggested) { sponsor.path = suggested; repaired++; }
      }
    }
    for (const cat of this.config.categories || []) {
      for (const video of cat.videos || []) {
        if (isOrphaned(video.path)) {
          const suggested = this.tryRepairOrphanedPath(video.path);
          if (suggested) { video.path = suggested; repaired++; }
        }
      }
      for (const subcat of cat.subCategories || []) {
        for (const video of subcat.videos || []) {
          if (isOrphaned(video.path)) {
            const suggested = this.tryRepairOrphanedPath(video.path);
            if (suggested) { video.path = suggested; repaired++; }
          }
        }
      }
    }
    for (const tc of this.config.timeCategories || []) {
      for (const video of tc.loopVideos || []) {
        if (isOrphaned(video.path)) {
          const suggested = this.tryRepairOrphanedPath(video.path);
          if (suggested) { video.path = suggested; repaired++; }
        }
      }
    }

    if (repaired > 0) {
      this.markDirty();
      this.detectOrphanedVideoPaths();
    }
  }

  // ============================================================================
  // Secondary Variant (from config-editor)
  // ============================================================================

  onOpenVariantFromConfig(event: { cloudId: string; displayName: string }): void {
    this.configVariantTarget = event;
    this.cdr.markForCheck();
  }

  closeConfigVariantModal(): void {
    this.configVariantTarget = null;
    this.loadContent();
    this.cdr.markForCheck();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private hasPhaseLoops(): boolean {
    if (!this.config) return false;
    return (this.config.timeCategories || []).some(tc => tc.loopVideos && tc.loopVideos.length > 0);
  }

  private getUnmappedAnalyticsCount(): number {
    if (!this.config?.categories) return 0;
    let unmapped = 0;
    for (const cat of this.config.categories) {
      if (cat.subCategories?.length) {
        for (const sub of cat.subCategories) {
          if (!this.config.categoryMappings?.[sub.id]) unmapped++;
        }
      } else {
        if (!this.config.categoryMappings?.[cat.id]) unmapped++;
      }
    }
    return unmapped;
  }

  private readonly defaultTimeCategories = [
    { id: 'before', name: 'Avant-match', icon: '🏁', description: 'Échauffement & présentation' },
    { id: 'during', name: 'Match', icon: '▶️', description: 'Live & animations' },
    { id: 'after', name: 'Après-match', icon: '🏆', description: 'Résultats & remerciements' }
  ];

  private rebuildTimeCategoriesCache(): void {
    if (this.config.timeCategories && this.config.timeCategories.length > 0) {
      const icons: Record<string, string> = { 'before': '🏁', 'during': '▶️', 'after': '🏆' };
      this.cachedTimeCategories = this.config.timeCategories.map(tc => ({
        id: tc.id,
        name: tc.name,
        icon: tc.icon || icons[tc.id] || '📁',
        description: tc.description || ''
      }));
    } else {
      this.cachedTimeCategories = this.defaultTimeCategories;
    }
  }

  private normalizeConfig(config: Record<string, unknown>): SiteConfiguration {
    const c = config as Record<string, unknown>;
    return {
      version: (c['version'] as string) || '1.0',
      auth: (c['auth'] as SiteConfiguration['auth']) || { clubName: '', password: '', sessionDuration: 86400000 },
      remote: (c['remote'] as SiteConfiguration['remote']) || { title: '' },
      sync: (c['sync'] as SiteConfiguration['sync']) || { enabled: false, serverUrl: '', siteName: '', clubName: '' },
      sponsors: ((c['sponsors'] as Record<string, unknown>[]) || []).map((s: Record<string, unknown>) => ({
        name: (s['name'] as string) || '',
        path: (s['path'] as string) || '',
        type: (s['type'] as string) || 'video/mp4',
        owner: ((s['owner'] as string) || 'club') as ContentOwner,
        locked: (s['locked'] as boolean) || false
      })),
      categories: ((c['categories'] as Record<string, unknown>[]) || []).map((cat: Record<string, unknown>) => ({
        id: (cat['id'] as string) || this.generateId(),
        name: (cat['name'] as string) || '',
        owner: ((cat['owner'] as string) || 'club') as ContentOwner,
        locked: (cat['locked'] as boolean) || false,
        videos: ((cat['videos'] as Record<string, unknown>[]) || []).map((v: Record<string, unknown>) => ({
          name: (v['name'] as string) || '',
          path: (v['path'] as string) || '',
          type: (v['type'] as string) || 'video/mp4',
          owner: ((v['owner'] as string) || 'club') as ContentOwner,
          locked: (v['locked'] as boolean) || false
        })),
        subCategories: ((cat['subCategories'] as Record<string, unknown>[]) || []).map((sc: Record<string, unknown>) => ({
          id: (sc['id'] as string) || this.generateId(),
          name: (sc['name'] as string) || '',
          owner: ((sc['owner'] as string) || 'club') as ContentOwner,
          locked: (sc['locked'] as boolean) || false,
          videos: ((sc['videos'] as Record<string, unknown>[]) || []).map((v: Record<string, unknown>) => ({
            name: (v['name'] as string) || '',
            path: (v['path'] as string) || '',
            type: (v['type'] as string) || 'video/mp4',
            owner: ((v['owner'] as string) || 'club') as ContentOwner,
            locked: (v['locked'] as boolean) || false
          }))
        }))
      })),
      timeCategories: (c['timeCategories'] as SiteConfiguration['timeCategories']) || [],
      categoryMappings: (c['categoryMappings'] as Record<string, string>) || {},
      settings: (c['settings'] as Record<string, unknown>) || {},
      liveScoreEnabled: (c['liveScoreEnabled'] as boolean) || false,
      scoreOverlay: (c['scoreOverlay'] as SiteConfiguration['scoreOverlay']) || null
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private getEmptyConfig(): SiteConfiguration {
    return {
      version: '1.0',
      auth: { clubName: '', password: '', sessionDuration: 86400000 },
      remote: { title: '' },
      sync: { enabled: false, serverUrl: '', siteName: '', clubName: '' },
      sponsors: [],
      categories: [],
      timeCategories: [],
      categoryMappings: {},
      settings: {},
      liveScoreEnabled: false,
      scoreOverlay: null
    };
  }
}
