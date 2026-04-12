/**
 * SiteSettingsDataService
 *
 * Extracts all API calls and data operations from SiteSettingsTabComponent.
 * The component retains UI state and template bindings only.
 */

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SitesService } from '../../../../core/services/sites.service';
import { SiteCommandService } from '../../../../core/services/site-command.service';
import { SiteMetricsService } from '../../../../core/services/site-metrics.service';
import {
  AssetService,
  WatermarkConfig,
  WatermarkFileInfo,
  UploadWatermarkResponse,
  DeployAssetResponse,
  ListWatermarksResponse,
} from '../../../../core/services/asset.service';
import { ReportsService, GeneratedReport } from '../../../../core/services/reports.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { Site, OverlayTheme, ScoreOverlayPosition, DisplayConfig } from '../../../../core/models';

// ============================================================================
// Interfaces
// ============================================================================

export interface HotspotInfo {
  ssid: string | null;
  password: string | null;
  channel: number | null;
  clients: number | null;
  isActive: boolean;
}

export interface OverlayConfig {
  theme: OverlayTheme;
  position: ScoreOverlayPosition;
}

export interface HotspotConfigResponse {
  success: boolean;
  configured: boolean;
  ssid?: string;
  password?: string;
  channel?: number;
  isActive?: boolean;
  message?: string;
}

export interface CommandResponse {
  success: boolean;
  sent?: boolean;
  queued?: boolean;
  commandId?: string;
  message: string;
}

// ============================================================================
// Service
// ============================================================================

@Injectable({ providedIn: 'root' })
export class SiteSettingsDataService {
  private readonly sitesService = inject(SitesService);
  private readonly commandService = inject(SiteCommandService);
  private readonly metricsService = inject(SiteMetricsService);
  private readonly assetService = inject(AssetService);
  private readonly reportsService = inject(ReportsService);
  private readonly logger = inject(LoggerService);

  // ========================================================================
  // 1. Club auth
  // ========================================================================

  /**
   * Save club auth: update DB (if clubName provided) then deploy to Pi.
   * For SaaS sites, writes directly to the default profile config.
   */
  saveClubAuth(
    siteId: string,
    clubName: string,
    remotePassword: string,
    isSaas: boolean = false
  ): Observable<{ commandResponse: CommandResponse; updatedSite?: Site }> {
    const neoProContent: { clubName?: string; remotePassword?: string } = {};
    if (clubName) neoProContent.clubName = clubName;
    if (remotePassword) neoProContent.remotePassword = remotePassword;

    const deploy$ = isSaas
      ? this.mergeDefaultProfileConfig(siteId, { auth: { clubName, password: remotePassword, sessionDuration: 86400000 } })
      : this.deployClubAuth(siteId, neoProContent);

    if (clubName) {
      return this.sitesService.updateSite(siteId, { club_name: clubName }).pipe(
        switchMap((updatedSite) =>
          deploy$.pipe(
            map((commandResponse) => ({ commandResponse, updatedSite }))
          )
        )
      );
    }

    return deploy$.pipe(
      map((commandResponse) => ({ commandResponse }))
    );
  }

  private deployClubAuth(
    siteId: string,
    neoProContent: { clubName?: string; remotePassword?: string }
  ): Observable<CommandResponse> {
    return this.commandService.sendCommand(siteId, 'update_config', {
      neoProContent,
      mode: 'merge',
    });
  }

  /**
   * Merge partial config into the default profile (SaaS only).
   * Fetches the default profile ID, then calls updateProfileConfiguration with merge mode.
   */
  mergeDefaultProfileConfig(siteId: string, partialConfig: Record<string, unknown>): Observable<CommandResponse> {
    return this.sitesService.getProfiles(siteId).pipe(
      switchMap(response => {
        const defaultProfile = response.profiles.find(p => p.is_default);
        if (!defaultProfile) {
          throw new Error('Aucun profil par defaut trouve');
        }
        return this.sitesService.updateProfileConfiguration(
          siteId,
          defaultProfile.id,
          partialConfig as never,
          'merge'
        );
      }),
      map(() => ({ success: true, message: 'Configuration enregistree' }))
    );
  }

  // ========================================================================
  // 2. Audience
  // ========================================================================

  saveAvgSpectators(siteId: string, avgSpectators: number): Observable<Site> {
    return this.sitesService.updateSite(siteId, { avg_spectators: avgSpectators });
  }

  // ========================================================================
  // 3. Branding
  // ========================================================================

  saveBranding(
    siteId: string,
    logoUrl: string,
    colorPrimary: string,
    colorSecondary: string
  ): Observable<Site> {
    const data: Record<string, string | null> = {
      logo_url: logoUrl || null,
      color_primary: colorPrimary || null,
      color_secondary: colorSecondary || null,
    };
    return this.sitesService.updateSite(siteId, data);
  }

  saveFeatureOverrides(
    siteId: string,
    featureOverrides: Record<string, boolean>
  ): Observable<Site> {
    return this.sitesService.updateSite(siteId, { feature_overrides: featureOverrides });
  }

  // ========================================================================
  // 3b. Displays N-display (PROP-002 Phase 5H)
  // ========================================================================

  saveDisplays(siteId: string, displays: DisplayConfig[]): Observable<DisplayConfig[]> {
    return this.sitesService.updateDisplays(siteId, displays).pipe(
      map(response => response.displays)
    );
  }

  // ========================================================================
  // 4. Remote PIN
  // ========================================================================

  loadRemotePinStatus(siteId: string): Observable<{ pinEnabled: boolean }> {
    return this.sitesService.getRemotePinStatus(siteId);
  }

  setRemotePin(siteId: string, pin: string): Observable<{ success: boolean; message: string }> {
    return this.sitesService.setRemotePin(siteId, pin);
  }

  clearRemotePin(siteId: string): Observable<{ success: boolean; message: string }> {
    return this.sitesService.clearRemotePin(siteId);
  }

  // ========================================================================
  // 5. Hotspot
  // ========================================================================

  fetchHotspotConfig(siteId: string): Observable<HotspotConfigResponse> {
    return this.metricsService.getHotspotConfig(siteId);
  }

  updateHotspot(
    siteId: string,
    ssid?: string,
    password?: string
  ): Observable<CommandResponse> {
    return this.commandService.updateHotspot(siteId, ssid, password);
  }

  /**
   * Extract hotspot info from site.local_config_mirror.
   * Pure data extraction, no side effects.
   */
  loadHotspotInfo(site: Site): HotspotInfo {
    // Try _hotspotInfo first (complete info)
    const hotspotInfo = site.local_config_mirror?._hotspotInfo;
    if (hotspotInfo) {
      return {
        ssid: hotspotInfo.ssid || null,
        password: hotspotInfo.password || null,
        channel: hotspotInfo.channel || null,
        clients: hotspotInfo.clients ?? null,
        isActive: hotspotInfo.isActive || false,
      };
    }

    // Fallback to _hotspotSsid (backward compatibility)
    const ssid = site.local_config_mirror?._hotspotSsid;
    if (ssid) {
      return {
        ssid,
        password: null,
        channel: null,
        clients: null,
        isActive: true, // Assume active if we have SSID
      };
    }

    return {
      ssid: null,
      password: null,
      channel: null,
      clients: null,
      isActive: false,
    };
  }

  // ========================================================================
  // 6. Premium / Overlay
  // ========================================================================

  toggleLiveScore(siteId: string, enabled: boolean, isSaas: boolean = false): Observable<{ updatedSite: Site; commandResponse: CommandResponse }> {
    const deploy$ = isSaas
      ? this.mergeDefaultProfileConfig(siteId, { liveScoreEnabled: enabled })
      : this.commandService.sendCommand(siteId, 'update_config', {
          neoProContent: { liveScoreEnabled: enabled },
          mode: 'merge',
        });

    return this.sitesService.updateSite(siteId, { live_score_enabled: enabled }).pipe(
      switchMap((updatedSite) =>
        deploy$.pipe(
          map((commandResponse) => ({ updatedSite, commandResponse }))
        )
      )
    );
  }

  saveOverlayConfig(siteId: string, config: OverlayConfig, isSaas: boolean = false): Observable<CommandResponse> {
    if (isSaas) {
      return this.mergeDefaultProfileConfig(siteId, { scoreOverlay: config });
    }
    return this.commandService.sendCommand(siteId, 'update_config', {
      neoProContent: { scoreOverlay: config },
      mode: 'merge',
    });
  }

  // ========================================================================
  // 7. Watermark
  // ========================================================================

  loadAvailableWatermarks(): Observable<ListWatermarksResponse> {
    return this.assetService.listWatermarks();
  }

  uploadWatermarkFile(siteId: string, file: File): Observable<UploadWatermarkResponse> {
    return this.assetService.uploadWatermark(siteId, file);
  }

  saveWatermarkConfig(siteId: string, config: WatermarkConfig, isSaas: boolean = false): Observable<CommandResponse> {
    if (isSaas) {
      return this.mergeDefaultProfileConfig(siteId, { watermark: config });
    }
    return this.commandService.sendCommand(siteId, 'update_config', {
      neoProContent: { watermark: config },
      mode: 'merge',
    });
  }

  deployWatermarkAsset(
    siteId: string,
    config: WatermarkConfig
  ): Observable<DeployAssetResponse> {
    const filename = config.imagePath.split('/').pop() || 'watermark.png';
    return this.assetService.deployAsset(
      siteId,
      config.cloudUrl!,
      filename,
      config.imagePath,
      undefined,
      'watermark'
    );
  }

  // ========================================================================
  // 8. Reports
  // ========================================================================

  loadClubReports(siteId: string, limit: number = 12): Observable<GeneratedReport[]> {
    return this.reportsService.getClubReports(siteId, limit);
  }

  generateReport(siteId: string): Observable<{ reportId: string; url: string }> {
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const periodStart = firstDayLastMonth.toISOString().split('T')[0];
    const periodEnd = lastDayLastMonth.toISOString().split('T')[0];

    return this.reportsService.generateReport({
      type: 'club',
      entityId: siteId,
      periodStart,
      periodEnd,
    });
  }

  // ========================================================================
  // 9. SSID helpers
  // ========================================================================

  /**
   * Determine the WiFi SSID to display.
   * Returns the SSID string and whether it was a real (detected) SSID.
   */
  getWifiSsid(
    site: Site | null,
    currentHotspotSsid: string | null,
    realSsid: string | null
  ): { ssid: string; isReal: boolean } {
    // Use the real SSID if already retrieved via fetch
    if (realSsid) {
      return { ssid: realSsid, isReal: true };
    }

    // Use currentHotspotSsid (from _hotspotInfo, new format)
    if (currentHotspotSsid) {
      return { ssid: currentHotspotSsid, isReal: true };
    }

    // Fallback: use _hotspotSsid from local_config_mirror (old format)
    const mirrorSsid = site?.local_config_mirror?._hotspotSsid;
    if (mirrorSsid) {
      return { ssid: mirrorSsid, isReal: true };
    }

    // Fallback: use _hotspotInfo.ssid directly
    const hotspotInfoSsid = site?.local_config_mirror?._hotspotInfo?.ssid;
    if (hotspotInfoSsid) {
      return { ssid: hotspotInfoSsid, isReal: true };
    }

    // Last fallback: generate SSID from club name
    const name = site?.club_name || site?.site_name || 'CLUB';
    const sanitized = name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 20);
    return { ssid: `NEOPRO-${sanitized}`, isReal: false };
  }

  /**
   * Determine QR code default mode based on network profile.
   * Returns 'cloud' for mesh_isolated sites, 'local' otherwise.
   */
  getQrCodeDefaultMode(site: Site | null): 'local' | 'cloud' {
    const networkProfile = site?.network_profile;
    if (networkProfile?.type === 'mesh_isolated') {
      return 'cloud';
    }
    return 'local';
  }

  // ========================================================================
  // 10. Config extraction
  // ========================================================================

  /**
   * Extract overlay config from site.local_config_mirror.scoreOverlay
   */
  extractOverlayConfig(site: Site): OverlayConfig {
    const defaults: OverlayConfig = { theme: 'broadcast', position: 'top-right' };
    const mirrorScoreOverlay = site.local_config_mirror?.['scoreOverlay'] as Record<string, unknown> | undefined;
    if (!mirrorScoreOverlay) return defaults;

    const config = { ...defaults };

    if (mirrorScoreOverlay['theme'] === 'broadcast' || mirrorScoreOverlay['theme'] === 'minimal') {
      config.theme = mirrorScoreOverlay['theme'];
    }

    const pos = mirrorScoreOverlay['position'] as string | undefined;
    if (pos && ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(pos)) {
      config.position = pos as ScoreOverlayPosition;
    }

    return config;
  }

  /**
   * Extract watermark config from site.local_config_mirror.watermark
   */
  extractWatermarkConfig(site: Site): WatermarkConfig | null {
    const mirrorWatermark = site.local_config_mirror?.['watermark'] as WatermarkConfig | undefined;
    if (!mirrorWatermark) return null;

    this.logger.info('Watermark config loaded from local_config_mirror', {
      enabled: mirrorWatermark.enabled,
      imagePath: mirrorWatermark.imagePath,
    });

    return mirrorWatermark;
  }

  // ========================================================================
  // Delegate helpers (from underlying services)
  // ========================================================================

  getPositionOptions(): ReturnType<AssetService['getPositionOptions']> {
    return this.assetService.getPositionOptions();
  }

  getAnimationOptions(): ReturnType<AssetService['getAnimationOptions']> {
    return this.assetService.getAnimationOptions();
  }

  getDaysOfWeekOptions(): { value: number; label: string; shortLabel: string }[] {
    return this.assetService.getDaysOfWeekOptions();
  }

  createDefaultScheduleRule(): ReturnType<AssetService['createDefaultScheduleRule']> {
    return this.assetService.createDefaultScheduleRule();
  }

  formatFileSize(bytes: number | null): string {
    return this.reportsService.formatFileSize(bytes);
  }
}
