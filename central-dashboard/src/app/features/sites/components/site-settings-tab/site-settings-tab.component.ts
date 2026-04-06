import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { WatermarkConfig, WatermarkFileInfo, OverlayPosition as WmOverlayPosition, WatermarkAnimation, WatermarkScheduleRule } from '../../../../core/services/asset.service';
import { GeneratedReport } from '../../../../core/services/reports.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { Site, OverlayTheme, ScoreOverlayPosition } from '../../../../core/models';
import { QrCodeGeneratorComponent } from '../../../../shared/components/qr-code-generator/qr-code-generator.component';
import { SiteSettingsDataService } from './site-settings-data.service';

@Component({
  selector: 'app-site-settings-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, QrCodeGeneratorComponent],
  templateUrl: './site-settings-tab.component.html',
  styleUrls: ['./site-settings-tab.component.scss']
})
export class SiteSettingsTabComponent implements OnInit, OnChanges {
  @Input() siteId!: string;
  @Input() site!: Site | null;
  @Input() isConnected: boolean = false;
  @Output() siteUpdated = new EventEmitter<Site>();

  get isSaas(): boolean {
    return this.site?.site_type === 'saas';
  }

  // Auth
  clubName: string = '';
  remotePassword: string = '';
  savingClubAuth: boolean = false;

  // Audience
  avgSpectators: number | null = null;
  savingAvgSpectators: boolean = false;

  // Branding (P5)
  logoUrl: string = '';
  colorPrimary: string = '';
  colorSecondary: string = '';
  brandingSaving: boolean = false;
  logoError: boolean = false;

  // Remote PIN
  remotePin: string = '';
  remotePinEnabled: boolean = false;
  savingRemotePin: boolean = false;
  clearingRemotePin: boolean = false;

  // Hotspot
  hotspotSsid: string = '';
  hotspotPassword: string = '';
  updatingHotspot: boolean = false;
  // Current hotspot info from Pi (read-only display)
  currentHotspotSsid: string | null = null;
  currentHotspotPassword: string | null = null;
  currentHotspotChannel: number | null = null;
  currentHotspotClients: number | null = null;
  currentHotspotActive: boolean = false;
  showCurrentPassword: boolean = false;
  fetchingHotspotConfig: boolean = false;

  // Premium
  savingLiveScore: boolean = false;
  showOverlayConfig: boolean = false;
  savingOverlay: boolean = false;
  overlayConfig: { theme: OverlayTheme; position: ScoreOverlayPosition } = {
    theme: 'broadcast',
    position: 'top-right',
  };


  // QR Code
  showQrCode: boolean = false;
  fetchingSsid: boolean = false;
  realSsid: string | null = null;

  // Watermark
  watermarkConfig: WatermarkConfig = {
    enabled: false,
    imagePath: '',
    fullscreen: true,
    position: 'bottom-right' as WmOverlayPosition,
    offsetX: 20,
    offsetY: 20,
    opacity: 100,
    width: 150,
    height: 0,
    borderRadius: 0,
    animation: 'fade' as WatermarkAnimation,
    animationDuration: 500,
    schedule: { enabled: false, rules: [] }
  };
  watermarkPreviewUrl: string | null = null;
  selectedWatermarkFile: File | null = null;
  isDraggingWatermark: boolean = false;
  uploadingWatermark: boolean = false;
  uploadProgress: number = 0;
  uploadProgressText: string = '';
  savingWatermark: boolean = false;

  // Watermark selector
  availableWatermarks: WatermarkFileInfo[] = [];
  loadingWatermarks: boolean = false;
  selectedWatermarkName: string = '';

  // Options pour les selects
  positionOptions: { value: WmOverlayPosition; label: string }[] = [];
  animationOptions: { value: WatermarkAnimation; label: string }[] = [];
  daysOfWeekOptions: { value: number; label: string; shortLabel: string }[] = [];

  // Rapports
  clubReports: GeneratedReport[] = [];
  loadingReports: boolean = false;
  generatingReport: boolean = false;

  constructor(
    private dataService: SiteSettingsDataService,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    // Initialiser les options pour les selects
    this.positionOptions = this.dataService.getPositionOptions();
    this.animationOptions = this.dataService.getAnimationOptions();
    this.daysOfWeekOptions = this.dataService.getDaysOfWeekOptions();

    if (this.site) {
      this.clubName = this.site.club_name || '';
      this.avgSpectators = this.site.avg_spectators ?? null;
      // P5: Branding
      this.logoUrl = this.site.logo_url || '';
      this.colorPrimary = this.site.color_primary || '';
      this.colorSecondary = this.site.color_secondary || '';

      // Charger les infos hotspot depuis local_config_mirror (synchronisé par le Pi)
      this.applyHotspotInfo(this.dataService.loadHotspotInfo(this.site));

      // Charger la config scoreOverlay depuis local_config_mirror (synchronisé par le Pi)
      this.overlayConfig = this.dataService.extractOverlayConfig(this.site);

      // Charger la config watermark existante depuis local_config_mirror (synchronisé par le Pi)
      const mirrorWatermark = this.dataService.extractWatermarkConfig(this.site);
      if (mirrorWatermark) {
        this.watermarkConfig = {
          ...this.watermarkConfig,
          ...mirrorWatermark
        };
      }

      // Charger la liste des watermarks disponibles
      this.loadAvailableWatermarks();

      // Charger les rapports du club
      this.loadClubReports();

      // Charger le statut du PIN télécommande cloud
      this.loadRemotePinStatus();
    }
  }

  private loadRemotePinStatus(): void {
    this.dataService.loadRemotePinStatus(this.siteId).subscribe({
      next: (response) => {
        this.remotePinEnabled = response.pinEnabled;
      },
      error: () => {
        // Silencieux - le statut PIN n'est pas critique
        this.remotePinEnabled = false;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Recharger les données quand le site est mis à jour (ex: après sync_local_state)
    if (changes['site'] && changes['site'].currentValue && !changes['site'].firstChange) {
      const site = changes['site'].currentValue as Site;

      // Réinitialiser le cache SSID pour forcer la relecture depuis les nouvelles données
      this.realSsid = null;

      // Recharger les infos hotspot
      this.applyHotspotInfo(this.dataService.loadHotspotInfo(site));

      // Recharger scoreOverlay
      this.overlayConfig = this.dataService.extractOverlayConfig(site);

      // Recharger watermark config
      const mirrorWatermark = this.dataService.extractWatermarkConfig(site);
      if (mirrorWatermark) {
        // Ne pas écraser si on est en train d'éditer (fichier sélectionné mais pas encore déployé)
        if (!this.selectedWatermarkFile) {
          this.watermarkConfig = {
            ...this.watermarkConfig,
            ...mirrorWatermark
          };
        }
      }
    }
  }

  /**
   * Apply hotspot info from data service to component state
   */
  private applyHotspotInfo(info: { ssid: string | null; password: string | null; channel: number | null; clients: number | null; isActive: boolean }): void {
    this.currentHotspotSsid = info.ssid;
    this.currentHotspotPassword = info.password;
    this.currentHotspotChannel = info.channel;
    this.currentHotspotClients = info.clients;
    this.currentHotspotActive = info.isActive;
  }

  toggleShowPassword(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  /**
   * Fetch hotspot config from Pi via API (includes password)
   */
  fetchHotspotConfig(): void {
    if (!this.siteId || !this.isConnected) return;

    this.fetchingHotspotConfig = true;
    this.dataService.fetchHotspotConfig(this.siteId).subscribe({
      next: (response) => {
        this.fetchingHotspotConfig = false;
        if (response.configured) {
          this.currentHotspotSsid = response.ssid || null;
          this.currentHotspotPassword = response.password || null;
          this.currentHotspotChannel = response.channel || null;
          this.currentHotspotActive = response.isActive || false;
          this.logger.info('Hotspot config fetched from Pi', {
            ssid: this.currentHotspotSsid,
            hasPassword: !!this.currentHotspotPassword
          });
        }
      },
      error: (error) => {
        this.fetchingHotspotConfig = false;
        this.logger.warn('Failed to fetch hotspot config', { error });
        this.notificationService.error('Impossible de récupérer la configuration hotspot');
      }
    });
  }

  saveClubAuth(): void {
    if (!this.clubName && !this.remotePassword) {
      this.notificationService.error('Veuillez renseigner au moins un champ');
      return;
    }

    this.savingClubAuth = true;

    this.dataService.saveClubAuth(this.siteId, this.clubName, this.remotePassword).subscribe({
      next: ({ commandResponse, updatedSite }) => {
        this.savingClubAuth = false;
        if (updatedSite) {
          this.siteUpdated.emit(updatedSite);
        }
        this.notificationService.success(
          commandResponse.queued
            ? '📥 Configuration mise en file d\'attente'
            : 'Configuration déployée avec succès !'
        );
      },
      error: (error) => {
        this.savingClubAuth = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  saveAvgSpectators(): void {
    if (this.avgSpectators === null || this.avgSpectators === undefined) return;

    this.savingAvgSpectators = true;
    this.dataService.saveAvgSpectators(this.siteId, this.avgSpectators).subscribe({
      next: (updatedSite) => {
        this.savingAvgSpectators = false;
        this.notificationService.success('Spectateurs moyens mis à jour');
        this.siteUpdated.emit(updatedSite);
      },
      error: (error) => {
        this.savingAvgSpectators = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // P5: Branding
  saveBranding(): void {
    this.brandingSaving = true;
    this.dataService.saveBranding(this.siteId, this.logoUrl, this.colorPrimary, this.colorSecondary).subscribe({
      next: (updatedSite) => {
        this.brandingSaving = false;
        this.notificationService.success('Branding du club mis à jour');
        this.siteUpdated.emit(updatedSite);
      },
      error: (error) => {
        this.brandingSaving = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  onLogoError(): void {
    this.logoError = true;
  }

  saveRemotePin(): void {
    if (!this.remotePin || this.remotePin.length < 4) {
      this.notificationService.error('Le PIN doit contenir entre 4 et 6 chiffres');
      return;
    }

    this.savingRemotePin = true;
    this.dataService.setRemotePin(this.siteId, this.remotePin).subscribe({
      next: () => {
        this.remotePinEnabled = true;
        this.remotePin = '';
        this.savingRemotePin = false;
        this.notificationService.success('PIN de télécommande cloud défini avec succès');
      },
      error: (error: { error?: { error?: string } }) => {
        this.savingRemotePin = false;
        this.notificationService.error(error.error?.error || 'Erreur lors de la définition du PIN');
      }
    });
  }

  clearRemotePin(): void {
    this.clearingRemotePin = true;
    this.dataService.clearRemotePin(this.siteId).subscribe({
      next: () => {
        this.remotePinEnabled = false;
        this.clearingRemotePin = false;
        this.notificationService.success('PIN de télécommande cloud supprimé');
      },
      error: (error: { error?: { error?: string } }) => {
        this.clearingRemotePin = false;
        this.notificationService.error(error.error?.error || 'Erreur lors de la suppression du PIN');
      }
    });
  }

  updateHotspot(): void {
    if (!this.hotspotSsid && !this.hotspotPassword) {
      this.notificationService.error('Veuillez renseigner au moins un champ');
      return;
    }

    if (this.hotspotPassword && (this.hotspotPassword.length < 8 || this.hotspotPassword.length > 63)) {
      this.notificationService.error('Le mot de passe doit contenir entre 8 et 63 caractères');
      return;
    }

    if (!confirm('Modifier la configuration du hotspot WiFi ?')) return;

    this.updatingHotspot = true;
    this.dataService.updateHotspot(
      this.siteId,
      this.hotspotSsid || undefined,
      this.hotspotPassword || undefined
    ).subscribe({
      next: (response) => {
        this.updatingHotspot = false;
        this.notificationService.success(
          response.queued
            ? '📥 Configuration mise en file d\'attente'
            : 'Configuration du hotspot mise à jour !'
        );
        this.hotspotSsid = '';
        this.hotspotPassword = '';
      },
      error: (error) => {
        this.updatingHotspot = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  toggleLiveScore(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;

    this.savingLiveScore = true;
    this.dataService.toggleLiveScore(this.siteId, newValue).subscribe({
      next: ({ updatedSite }) => {
        this.savingLiveScore = false;
        this.notificationService.success(
          newValue ? 'Option Premium activée !' : 'Option Premium désactivée !'
        );
        this.siteUpdated.emit(updatedSite);
      },
      error: (error) => {
        this.savingLiveScore = false;
        // Check if the DB update succeeded but the deploy failed
        // The switchMap in the service means any error could be from either step
        checkbox.checked = !newValue;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }


  getJustify(): string {
    const pos = this.overlayConfig.position;
    if (pos.includes('right')) return 'flex-end';
    if (pos.includes('left')) return 'flex-start';
    return 'center';
  }

  getAlign(): string {
    const pos = this.overlayConfig.position;
    if (pos.includes('top')) return 'flex-start';
    if (pos.includes('bottom')) return 'flex-end';
    return 'center';
  }

  saveOverlayConfig(): void {
    this.savingOverlay = true;
    this.dataService.saveOverlayConfig(this.siteId, this.overlayConfig).subscribe({
      next: () => {
        this.savingOverlay = false;
        this.notificationService.success('Configuration de l\'overlay déployée !');
        this.showOverlayConfig = false;
      },
      error: (error) => {
        this.savingOverlay = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  getWifiSsid(): string {
    const result = this.dataService.getWifiSsid(this.site, this.currentHotspotSsid, this.realSsid);
    if (result.isReal) {
      this.realSsid = result.ssid;
    }
    return result.ssid;
  }

  openQrCode(): void {
    // Si on a déjà le SSID réel ou si le site est offline, ouvrir directement
    if (this.realSsid || !this.isConnected) {
      this.showQrCode = true;
      return;
    }

    // Sinon, récupérer le SSID réel via l'endpoint dédié
    this.fetchingSsid = true;
    this.dataService.fetchHotspotConfig(this.siteId).subscribe({
      next: (response) => {
        this.fetchingSsid = false;
        if (response.ssid) {
          this.realSsid = response.ssid;
          this.logger.info('SSID réel récupéré', { ssid: this.realSsid });
        }
        this.showQrCode = true;
      },
      error: (error) => {
        this.fetchingSsid = false;
        this.logger.warn('Impossible de récupérer le SSID réel, utilisation du SSID généré', { error });
        // Ouvrir quand même le QR code avec le SSID généré
        this.showQrCode = true;
      }
    });
  }

  /**
   * Determine QR code default mode based on network profile
   * Returns 'cloud' for mesh_isolated sites, 'local' otherwise
   */
  getQrCodeDefaultMode(): 'local' | 'cloud' {
    return this.dataService.getQrCodeDefaultMode(this.site);
  }

  // ============================================================================
  // Watermark methods
  // ============================================================================

  loadAvailableWatermarks(): void {
    this.loadingWatermarks = true;
    this.dataService.loadAvailableWatermarks().subscribe({
      next: (response) => {
        this.availableWatermarks = response.watermarks;
        this.loadingWatermarks = false;

        // Pre-select the current watermark if one is configured
        if (this.watermarkConfig.imagePath) {
          const currentFilename = this.watermarkConfig.imagePath.split('/').pop() || '';
          const match = this.availableWatermarks.find(w => w.name === currentFilename);
          if (match) {
            this.selectedWatermarkName = match.name;
          }
        }
      },
      error: () => {
        this.loadingWatermarks = false;
        this.notificationService.error('Erreur lors du chargement des watermarks');
      }
    });
  }

  onWatermarkSelected(name: string): void {
    if (!name) {
      // Option "Aucun" selectionnee — supprimer le watermark
      this.watermarkConfig = {
        ...this.watermarkConfig,
        enabled: false,
        imagePath: '',
        cloudUrl: undefined,
      };
      this.watermarkPreviewUrl = null;
      this.selectedWatermarkFile = null;
      this.selectedWatermarkName = '';
      this.saveWatermarkConfig();
      return;
    }

    const watermark = this.availableWatermarks.find(w => w.name === name);
    if (!watermark) return;

    this.selectedWatermarkName = name;
    this.watermarkPreviewUrl = null;
    this.selectedWatermarkFile = null;

    // Mettre a jour la config avec le watermark selectionne
    this.watermarkConfig = {
      ...this.watermarkConfig,
      imagePath: watermark.localPath,
      cloudUrl: watermark.url,
      enabled: true,
    };
  }

  onWatermarkFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Valider le fichier
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.error('Format non supporté. Utilisez PNG, JPEG, GIF, WebP ou SVG.');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      this.notificationService.error('Fichier trop volumineux (max 5 MB)');
      return;
    }

    this.selectedWatermarkFile = file;

    // Créer un aperçu local
    const reader = new FileReader();
    reader.onload = () => {
      this.watermarkPreviewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Uploader le fichier
    this.uploadWatermarkFile(file);
  }

  private uploadWatermarkFile(file: File): void {
    this.uploadingWatermark = true;
    this.uploadProgress = 0;
    this.uploadProgressText = 'Uploading...';

    this.dataService.uploadWatermarkFile(this.siteId, file).subscribe({
      next: (response) => {
        this.uploadingWatermark = false;
        this.uploadProgress = 100;
        this.uploadProgressText = 'Upload completed!';

        // Appliquer la config suggérée
        this.watermarkConfig = {
          ...this.watermarkConfig,
          ...response.suggestedConfig,
          imagePath: response.localPath
        };

        this.notificationService.success(
          response.deployment.sent
            ? 'Image uploadée et déployée!'
            : 'Image uploadée, en attente de connexion du site'
        );

        this.logger.info('Watermark uploaded', {
          siteId: this.siteId,
          localPath: response.localPath,
          checksum: response.checksum
        });

        // Auto-déployer la config watermark vers le Pi
        // L'image a été déployée via deploy_asset, mais configuration.json
        // doit aussi être mis à jour pour que le watermark s'affiche
        this.saveWatermarkConfig();

        // Rafraichir la liste des watermarks pour inclure le nouveau fichier
        this.loadAvailableWatermarks();
      },
      error: (error) => {
        this.uploadingWatermark = false;
        this.uploadProgress = 0;
        this.uploadProgressText = '';
        this.watermarkPreviewUrl = null;
        this.selectedWatermarkFile = null;

        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur upload: ${message}`);
      }
    });
  }

  removeWatermark(): void {
    if (!confirm('Supprimer le watermark?')) return;

    this.watermarkConfig = {
      ...this.watermarkConfig,
      enabled: false,
      imagePath: ''
    };
    this.watermarkPreviewUrl = null;
    this.selectedWatermarkFile = null;
    this.selectedWatermarkName = '';

    // Déployer la config sans watermark
    this.saveWatermarkConfig();
  }

  getWatermarkFilename(): string {
    if (!this.watermarkConfig.imagePath) return '';
    const parts = this.watermarkConfig.imagePath.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * Returns the URL to use for watermark preview in the dashboard.
   * Priority:
   * 1. watermarkPreviewUrl - Base64 preview during upload
   * 2. watermarkConfig.cloudUrl - Cloud URL (FTP or Supabase)
   * 3. Fallback to a placeholder image if only local path exists
   *
   * We NEVER use imagePath directly as it's a local Pi path that doesn't exist on the dashboard.
   */
  getWatermarkPreviewUrl(): string {
    // Priority 1: Local preview during upload
    if (this.watermarkPreviewUrl) {
      return this.watermarkPreviewUrl;
    }

    // Priority 2: Cloud URL (from FTP or Supabase)
    if (this.watermarkConfig.cloudUrl) {
      return this.watermarkConfig.cloudUrl;
    }

    // Priority 3: No cloud URL available - show placeholder
    // This happens for watermarks uploaded before cloudUrl was added
    // The image exists on the Pi but we can't preview it in the dashboard
    return 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect fill="#1e293b" width="80" height="80"/>
        <text x="40" y="35" text-anchor="middle" fill="#64748b" font-size="24">🖼️</text>
        <text x="40" y="55" text-anchor="middle" fill="#64748b" font-size="8">Aperçu non disponible</text>
      </svg>`
    );
  }

  /**
   * Handle image load errors (e.g., if cloudUrl is expired or invalid)
   */
  onWatermarkImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    // Replace with placeholder on error
    img.src = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect fill="#1e293b" width="80" height="80"/>
        <text x="40" y="35" text-anchor="middle" fill="#ef4444" font-size="20">⚠️</text>
        <text x="40" y="55" text-anchor="middle" fill="#64748b" font-size="8">Erreur de chargement</text>
      </svg>`
    );
  }

  saveWatermarkConfig(): void {
    this.savingWatermark = true;

    // 1. Toujours envoyer la config (update_config)
    this.dataService.saveWatermarkConfig(this.siteId, this.watermarkConfig).subscribe({
      next: (response) => {
        // 2. Re-déployer l'image si cloudUrl est disponible
        // Cela garantit que l'image est présente sur le Pi même si le premier
        // deploy_asset a échoué ou n'a jamais été reçu
        if (this.watermarkConfig.cloudUrl && this.watermarkConfig.imagePath) {
          this.dataService.deployWatermarkAsset(this.siteId, this.watermarkConfig).subscribe({
            next: () => {
              this.savingWatermark = false;
              this.notificationService.success(
                response.queued
                  ? 'Configuration et image mises en file d\'attente'
                  : 'Watermark déployé (config + image)!'
              );
            },
            error: () => {
              // L'image n'a pas pu être re-déployée, mais la config est OK
              this.savingWatermark = false;
              this.notificationService.success(
                response.queued
                  ? 'Configuration mise en file d\'attente'
                  : 'Configuration du watermark déployée!'
              );
              this.notificationService.warning(
                'L\'image n\'a pas pu être re-déployée. Si le watermark ne s\'affiche pas, essayez de re-uploader l\'image.'
              );
            }
          });
        } else {
          this.savingWatermark = false;
          this.notificationService.success(
            response.queued
              ? 'Configuration mise en file d\'attente'
              : 'Configuration du watermark déployée!'
          );
        }
      },
      error: (error) => {
        this.savingWatermark = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // Scheduling methods
  addScheduleRule(): void {
    if (!this.watermarkConfig.schedule) {
      this.watermarkConfig.schedule = { enabled: true, rules: [] };
    }
    this.watermarkConfig.schedule.rules.push(this.dataService.createDefaultScheduleRule());
  }

  removeScheduleRule(index: number): void {
    if (this.watermarkConfig.schedule?.rules) {
      this.watermarkConfig.schedule.rules.splice(index, 1);
    }
  }

  toggleRuleDay(rule: WatermarkScheduleRule, day: number): void {
    const idx = rule.daysOfWeek.indexOf(day);
    if (idx >= 0) {
      rule.daysOfWeek.splice(idx, 1);
    } else {
      rule.daysOfWeek.push(day);
      rule.daysOfWeek.sort((a, b) => a - b);
    }
  }

  // ========== Rapports PDF ==========

  loadClubReports(): void {
    if (!this.siteId) return;

    this.loadingReports = true;
    this.dataService.loadClubReports(this.siteId, 12).subscribe({
      next: (reports) => {
        this.clubReports = reports;
        this.loadingReports = false;
      },
      error: (error: { status?: number }) => {
        this.loadingReports = false;
        // Ne pas afficher d'erreur si simplement pas de rapports
        if (error.status !== 404) {
          this.logger.warn('Erreur chargement rapports', { error: ErrorExtractor.getMessage(error) });
        }
      }
    });
  }

  generateReport(): void {
    if (!this.siteId) return;

    this.generatingReport = true;
    this.dataService.generateReport(this.siteId).subscribe({
      next: () => {
        this.generatingReport = false;
        this.notificationService.success('Rapport généré avec succès!');
        // Recharger la liste des rapports
        this.loadClubReports();
      },
      error: (error) => {
        this.generatingReport = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur génération: ${message}`);
      }
    });
  }

  formatReportDate(dateString: string | null): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatFileSize(bytes: number | null): string {
    return this.dataService.formatFileSize(bytes);
  }
}
