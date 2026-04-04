import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../core/services/sites.service';
import { SiteCommandService } from '../../core/services/site-command.service';
import { SiteMetricsService } from '../../core/services/site-metrics.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';
import { SocketService } from '../../core/services/socket.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { Site, Metrics, FanStatus, SiteConnectionStatus, ConnectionHealth, MatchHistoryData, Match } from '../../core/models';
import { formatVersion } from './utils/version';
import { Subscription, interval } from 'rxjs';
import { ConnectionIndicatorComponent } from '../../shared/components/connection-indicator.component';
import { SiteContentTabComponent } from './components/site-content-tab/site-content-tab.component';
import { SiteSettingsTabComponent } from './components/site-settings-tab/site-settings-tab.component';
import { SiteDebugTabComponent } from './components/site-debug-tab/site-debug-tab.component';
import { SiteSubscriptionTabComponent } from './components/site-subscription-tab/site-subscription-tab.component';
import { SiteProfilesTabComponent } from './components/site-profiles-tab/site-profiles-tab.component';
import { SiteBenchmarkComponent } from './components/site-benchmark/site-benchmark.component';
import { SiteSponsorsTabComponent } from './components/site-sponsors-tab/site-sponsors-tab.component';

type TabId = 'status' | 'content' | 'settings' | 'profiles' | 'sponsors' | 'subscription' | 'debug';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    ConnectionIndicatorComponent,
    SiteContentTabComponent,
    SiteSettingsTabComponent,
    SiteDebugTabComponent,
    SiteSubscriptionTabComponent,
    SiteProfilesTabComponent,
    SiteBenchmarkComponent,
    SiteSponsorsTabComponent
  ],
  templateUrl: './site-detail.component.html',
  styleUrls: ['./site-detail.component.scss']
})
export class SiteDetailComponent implements OnInit, OnDestroy {
  site: Site | null = null;
  currentMetrics: Metrics | null = null;
  metricsHistory: Metrics[] = [];
  siteId!: string;
  Math = Math;
  readonly formatVersion = formatVersion;

  // Active tab
  activeTab: TabId = 'status';

  // WiFi / network status
  wifiStatus: {
    interface: string | null;
    connected: boolean;
    ssid: string | null;
    signal: number | null;
    quality: number | null;
    connectionType: 'wifi' | 'ethernet' | 'none';
    disconnectsLastHour: number;
    throttled: string | null;
    voltageOk: boolean;
  } | null = null;

  // Fan status
  fanStatus: FanStatus | null = null;

  // E-23 US-23.4.4: Dual-display & HDMI port status (real-time from heartbeat)
  dualDisplayActive = false;
  hdmiStatus: { hdmi0: boolean; hdmi1: boolean; wrongPort: boolean; hdmi0Resolution?: string | null; hdmi1Resolution?: string | null } | null = null;

  // Hotspot status (from local_config_mirror)
  hotspotSsid: string | null = null;
  hotspotChannel: number | null = null;
  hotspotClients: number = 0;
  hotspotActive: boolean = false;

  // Network profile (from local_config_mirror._networkProfile)
  networkProfileType: string | null = null;
  networkStabilityScore: number | null = null;
  networkApCount: number = 0;
  networkProfileLabel: string = '';

  // Connection
  connectionStatus: SiteConnectionStatus | null = null;
  isConnected = false;
  connectionHealth: ConnectionHealth | null = null;
  private loadingDashboard = false;

  // UI state
  showApiKey = false;
  sendingCommand = false;

  // Modals
  showLogsModal = false;
  showSystemInfoModal = false;

  // Logs
  logs: string[] = [];
  logsLoading = false;

  // System Info
  systemInfo: {
    hostname: string;
    os: string;
    kernel: string;
    architecture: string;
    cpu_model: string;
    cpu_cores: number;
    total_memory: number;
    ip_address: string;
    mac_address: string;
  } | null = null;
  systemInfoLoading = false;

  // Match History
  matchHistory: MatchHistoryData | null = null;
  matchHistoryLoading = false;

  private readonly route = inject(ActivatedRoute);
  private readonly sitesService = inject(SitesService);
  private readonly commandService = inject(SiteCommandService);
  private readonly metricsService = inject(SiteMetricsService);
  private readonly notificationService = inject(NotificationService);
  private readonly logger = inject(LoggerService);
  private readonly socketService = inject(SocketService);
  private refreshSubscription?: Subscription;
  private hdmiSubscription?: Subscription;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadSite();
    this.loadDashboardData();

    // Polling toutes les 30 secondes (suffisant pour un dashboard)
    this.refreshSubscription = interval(30000).subscribe(() => {
      this.loadDashboardData();
    });

    // E-23 US-23.4.4: Real-time HDMI & dual-display status updates
    this.hdmiSubscription = this.socketService.events$.subscribe((event) => {
      if (event.type === 'hdmi_status_updated') {
        const data = event.data as { siteId: string; hdmiStatus: { hdmi0: boolean; hdmi1: boolean; wrongPort: boolean; hdmi0Resolution?: string | null; hdmi1Resolution?: string | null }; dualDisplayActive: boolean };
        if (data.siteId === this.siteId) {
          this.hdmiStatus = data.hdmiStatus;
          this.dualDisplayActive = data.dualDisplayActive;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.hdmiSubscription?.unsubscribe();
  }

  loadSite(): void {
    this.sitesService.getSite(this.siteId).subscribe({
      next: (site) => {
        this.site = site;
        this.updateHotspotStatus(site);
        this.loadMatchHistory();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load site', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  loadMatchHistory(): void {
    this.matchHistoryLoading = true;
    this.sitesService.getMatchHistory(this.siteId, 10).subscribe({
      next: (data) => {
        this.matchHistory = data;
        this.matchHistoryLoading = false;
      },
      error: () => {
        this.matchHistory = null;
        this.matchHistoryLoading = false;
      }
    });
  }

  formatMatchDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  loadDashboardData(): void {
    if (this.loadingDashboard) return;

    this.loadingDashboard = true;
    this.sitesService.getDashboardData(this.siteId, 24).subscribe({
      next: (data: any) => {
        // Récupérer l'état de santé de la connexion (nouveau champ)
        this.connectionHealth = data.health || null;

        // Utiliser health.isHealthy pour déterminer si la connexion est vraiment fonctionnelle
        // Cela détecte les "connexions zombies" où isConnected=true mais la socket est morte
        const isReallyConnected = this.connectionHealth?.isHealthy ?? data.connection.isConnected;

        this.connectionStatus = {
          siteId: data.site.id,
          siteName: data.site.site_name,
          clubName: data.site.club_name,
          connection: {
            isConnected: isReallyConnected,
            displayStatus: isReallyConnected ? 'online' : (data.connection.isConnected ? 'warning' : data.connection.status),
            lastSeenAt: data.connection.lastSeenAt,
            secondsSinceLastSeen: data.connection.secondsSinceLastSeen,
            localIp: data.connection.localIp
          },
          sync: {
            lastConfigSync: data.connection.lastConfigSync
          },
          statistics: {
            heartbeats24h: data.connection.heartbeat_24h.count,
            uptime24h: Math.min(100, (data.connection.heartbeat_24h.count / 2880) * 100),
            firstHeartbeat24h: data.connection.heartbeat_24h.firstAt,
            lastHeartbeat24h: data.connection.heartbeat_24h.lastAt
          },
          health: this.connectionHealth || undefined
        };
        this.isConnected = isReallyConnected;
        this.metricsHistory = data.metrics.data;
        if (data.metrics.data.length > 0) {
          this.currentMetrics = data.metrics.data[0];
          // Extract WiFi status from network_status JSONB
          const networkStatus = this.currentMetrics?.network_status;
          if (networkStatus && typeof networkStatus === 'object' && 'connectionType' in networkStatus) {
            this.wifiStatus = networkStatus as typeof this.wifiStatus;
          }
          // Extract fan status from fan_status JSONB
          const fanData = this.currentMetrics?.fan_status;
          if (fanData && typeof fanData === 'object' && 'present' in fanData) {
            this.fanStatus = fanData as FanStatus;
          }
        }
        this.loadingDashboard = false;
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.warn('Failed to load dashboard data', { error: message, siteId: this.siteId });
        this.isConnected = false;
        this.connectionHealth = null;
        this.loadingDashboard = false;
      }
    });
  }

  getLocation(): string {
    if (!this.site?.location) return 'N/A';
    const parts = [];
    if (this.site.location.city) parts.push(this.site.location.city);
    if (this.site.location.region) parts.push(this.site.location.region);
    if (this.site.location.country) parts.push(this.site.location.country);
    return parts.join(', ') || 'N/A';
  }

  formatLastSeen(date: Date | null): string {
    if (!date) return 'Jamais vu';
    const now = new Date();
    const lastSeen = new Date(date);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return `Il y a ${Math.floor(diffMins / 1440)} jours`;
  }

  formatUptime(seconds: number | null): string {
    if (!seconds || seconds <= 0) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatMemory(bytes: number): string {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  }

  restartService(service: string): void {
    const confirmMsg = this.isConnected
      ? `Redémarrer le service ${service} ?`
      : `Redémarrer le service ${service} ?\nLa commande sera mise en file d'attente.`;

    if (confirm(confirmMsg)) {
      this.sendingCommand = true;
      this.commandService.restartService(this.siteId, service).subscribe({
        next: (response: any) => {
          this.sendingCommand = false;
          this.notificationService.success(
            response.queued ? '📥 Commande mise en file d\'attente' : 'Commande envoyée !'
          );
        },
        error: (error) => {
          this.sendingCommand = false;
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  getLogs(): void {
    this.showLogsModal = true;
    this.refreshLogs();
  }

  refreshLogs(): void {
    this.logsLoading = true;
    this.commandService.getLogs(this.siteId, 200).subscribe({
      next: (response) => {
        this.logs = response.logs;
        this.logsLoading = false;
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logs = [`Erreur: ${message}`];
        this.logsLoading = false;
      }
    });
  }

  getSystemInfo(): void {
    this.showSystemInfoModal = true;
    this.systemInfoLoading = true;
    this.metricsService.getSystemInfo(this.siteId).subscribe({
      next: (response) => {
        this.systemInfo = response;
        this.systemInfoLoading = false;
      },
      error: (error) => {
        this.systemInfo = null;
        this.systemInfoLoading = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  rebootSite(): void {
    const confirmMsg = this.isConnected
      ? '⚠️ Redémarrer le Raspberry Pi ?'
      : '⚠️ Redémarrer le Raspberry Pi ?\nLa commande sera mise en file d\'attente.';

    if (confirm(confirmMsg)) {
      this.sendingCommand = true;
      this.commandService.rebootSite(this.siteId).subscribe({
        next: (response: any) => {
          this.sendingCommand = false;
          this.notificationService.success(
            response.queued ? '📥 Commande mise en file d\'attente' : 'Commande envoyée !'
          );
        },
        error: (error) => {
          this.sendingCommand = false;
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  private updateHotspotStatus(site: Site): void {
    const info = site.local_config_mirror?._hotspotInfo;
    if (info) {
      this.hotspotSsid = info.ssid || null;
      this.hotspotChannel = info.channel || null;
      this.hotspotClients = info.clients || 0;
      this.hotspotActive = info.isActive || false;
    } else {
      const ssid = site.local_config_mirror?._hotspotSsid;
      if (ssid) {
        this.hotspotSsid = ssid;
        this.hotspotActive = true;
      }
    }

    const profile = site.local_config_mirror?._networkProfile;
    if (profile) {
      this.networkProfileType = profile.type || null;
      this.networkStabilityScore = profile.stabilityScore ?? null;
      this.networkApCount = profile.apCount || 0;
      this.networkProfileLabel = this.getNetworkProfileLabel(profile.type);
    }
  }

  private getNetworkProfileLabel(type: string): string {
    const labels: Record<string, string> = {
      'ethernet': 'Ethernet',
      'simple': 'WiFi Simple',
      'mesh': 'WiFi Mesh',
      'mesh_isolated': 'Mesh Isolé',
      'enterprise': 'Enterprise',
      'unknown': 'Inconnu',
    };
    return labels[type] || type;
  }

  restartHotspot(): void {
    if (confirm('Redémarrer le hotspot WiFi (hostapd + dnsmasq) ?')) {
      this.sendingCommand = true;
      this.metricsService.fixHotspot(this.siteId, true).subscribe({
        next: (result) => {
          this.sendingCommand = false;
          if (result.success) {
            this.notificationService.success('Hotspot redémarré avec succès');
          } else {
            this.notificationService.warning('Des problèmes ont été détectés, consultez l\'onglet Debug pour plus de détails');
          }
        },
        error: (error) => {
          this.sendingCommand = false;
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  regenerateApiKey(): void {
    if (confirm('Régénérer la clé API ? L\'ancienne clé ne fonctionnera plus.')) {
      this.sitesService.regenerateApiKey(this.siteId).subscribe({
        next: (site) => {
          this.site = site;
          this.notificationService.success('Clé API régénérée !');
        },
        error: (error) => {
          const message = ErrorExtractor.getMessage(error);
          this.notificationService.error(`Erreur: ${message}`);
        }
      });
    }
  }

  copyApiKey(): void {
    if (this.site?.api_key) {
      navigator.clipboard.writeText(this.site.api_key);
      this.notificationService.success('Clé API copiée !');
    }
  }

  onConfigDeployed(): void {
    this.notificationService.success('Configuration déployée !');
  }

  onSiteUpdated(site: Site): void {
    this.site = site;
  }

  /**
   * Retourne un message explicatif pour l'état de santé de la connexion
   */
  getHealthReason(): string {
    if (!this.connectionHealth) return '';

    switch (this.connectionHealth.reason) {
      case 'socket_disconnected':
        return 'La socket est déconnectée.';
      case 'pong_stale': {
        const ageSeconds = Math.round((this.connectionHealth.lastPongAgeMs || 0) / 1000);
        return `Pas de réponse depuis ${ageSeconds}s.`;
      }
      case 'no_pong_received':
        return 'Aucune réponse reçue du boîtier.';
      case 'not_in_map':
        return 'Connexion non enregistrée.';
      default:
        return '';
    }
  }

  // === Network Profile Badge ===

  /**
   * Récupère le profil réseau du site (depuis local_config_mirror ou network_profile)
   */
  private getNetworkProfile(): { type: string; apCount: number; bssidLocked: boolean; hasIsolation: boolean } | null {
    if (!this.site) return null;

    // Priorité: network_profile (colonne dédiée) > local_config_mirror._networkProfile
    const profile = (this.site as any).network_profile ||
                   (this.site.local_config_mirror as any)?._networkProfile;

    if (!profile) return null;

    return {
      type: profile.type || 'unknown',
      apCount: profile.apCount || 0,
      bssidLocked: profile.bssidLocked || profile.locked || false,
      hasIsolation: profile.hasIsolation || false
    };
  }

  /**
   * Retourne l'icône du badge selon le type de réseau
   */
  getNetworkBadgeIcon(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return '📡';

    switch (profile.type) {
      case 'simple':
        return '📶';
      case 'mesh':
        return '🔀';
      case 'mesh_isolated':
        return '🔒';
      case 'enterprise':
        return '🏢';
      case 'ethernet':
        return '🔌';
      default:
        return '📡';
    }
  }

  /**
   * Retourne le label du badge selon le type de réseau
   */
  getNetworkBadgeLabel(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return 'Inconnu';

    switch (profile.type) {
      case 'simple':
        return 'Simple';
      case 'mesh':
        return `Mesh (${profile.apCount} APs)`;
      case 'mesh_isolated':
        return 'Mesh Isolé';
      case 'enterprise':
        return 'Enterprise';
      case 'ethernet':
        return 'Ethernet';
      default:
        return 'Inconnu';
    }
  }

  /**
   * Retourne la classe CSS du badge selon le type et l'état du réseau
   */
  getNetworkBadgeClass(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return 'network-unknown';

    const classes = [`network-${profile.type.replace('_', '-')}`];

    // Ajouter warning si BSSID lock en mesh
    if (profile.bssidLocked && (profile.type === 'mesh' || profile.type === 'mesh_isolated')) {
      classes.push('network-warning');
    }

    return classes.join(' ');
  }

  /**
   * Retourne le tooltip du badge avec les détails du réseau
   */
  getNetworkBadgeTooltip(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return 'Profil réseau non détecté';

    const lines: string[] = [];

    switch (profile.type) {
      case 'simple':
        lines.push('Réseau simple (1 AP)');
        lines.push('✅ Configuration optimale');
        break;
      case 'mesh':
        lines.push(`Réseau mesh (${profile.apCount} points d'accès)`);
        if (profile.bssidLocked) {
          lines.push('⚠️ BSSID verrouillé - déconseillé en mesh');
        } else {
          lines.push('✅ Roaming activé');
        }
        break;
      case 'mesh_isolated':
        lines.push(`Réseau mesh avec isolation client (${profile.apCount} APs)`);
        lines.push('⚠️ Remote Cloud recommandé');
        lines.push('⚠️ SSH via Ethernet uniquement');
        break;
      case 'enterprise':
        lines.push('Réseau enterprise (802.1X)');
        lines.push('Configuration IT requise');
        break;
      case 'ethernet':
        lines.push('Connexion Ethernet (câble)');
        lines.push('✅ Connexion stable et fiable');
        break;
      default:
        lines.push('Type de réseau inconnu');
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Network Alert Banner Methods
  // ============================================================================

  private networkAlertDismissed: boolean = false;

  /**
   * Determine if we should show the network alert banner
   */
  showNetworkAlert(): boolean {
    if (this.networkAlertDismissed) return false;

    const profile = this.getNetworkProfile();
    if (!profile) return false;

    // Show alert for mesh with BSSID locked, mesh_isolated, or enterprise
    if (profile.type === 'mesh' && profile.bssidLocked) return true;
    if (profile.type === 'mesh_isolated') return true;
    if (profile.type === 'enterprise') return true;

    return false;
  }

  /**
   * Get the CSS class for the alert banner
   */
  getNetworkAlertClass(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return 'alert-info';

    if (profile.type === 'mesh' && profile.bssidLocked) return 'alert-warning';
    if (profile.type === 'mesh_isolated') return 'alert-danger';
    if (profile.type === 'enterprise') return 'alert-info';

    return 'alert-info';
  }

  /**
   * Get the icon for the alert banner
   */
  getNetworkAlertIcon(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return 'ℹ️';

    if (profile.type === 'mesh' && profile.bssidLocked) return '⚠️';
    if (profile.type === 'mesh_isolated') return '🔒';
    if (profile.type === 'enterprise') return '🏢';

    return 'ℹ️';
  }

  /**
   * Get the title for the alert banner
   */
  getNetworkAlertTitle(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return '';

    if (profile.type === 'mesh' && profile.bssidLocked) {
      return 'BSSID verrouillé dans un environnement mesh';
    }
    if (profile.type === 'mesh_isolated') {
      return 'Réseau mesh avec isolation client détecté';
    }
    if (profile.type === 'enterprise') {
      return 'Réseau enterprise détecté (802.1X)';
    }

    return '';
  }

  /**
   * Get the message for the alert banner
   */
  getNetworkAlertMessage(): string {
    const profile = this.getNetworkProfile();
    if (!profile) return '';

    if (profile.type === 'mesh' && profile.bssidLocked) {
      return `Ce site est dans un environnement mesh WiFi avec ${profile.apCount} points d'accès, mais le BSSID est verrouillé. ` +
             `Cela peut causer des déconnexions si le point d'accès verrouillé devient inaccessible. ` +
             `Supprimez le verrouillage BSSID pour activer le roaming automatique.`;
    }
    if (profile.type === 'mesh_isolated') {
      return `Ce site est dans un réseau mesh avec isolation client. Les appareils ne peuvent pas communiquer directement. ` +
             `Utilisez la télécommande Cloud au lieu du hotspot local. Pour la maintenance SSH, utilisez un câble Ethernet.`;
    }
    if (profile.type === 'enterprise') {
      return `Ce site est dans un réseau enterprise avec authentification 802.1X. ` +
             `La configuration WiFi nécessite la coordination avec l'équipe IT du lieu.`;
    }

    return '';
  }

  /**
   * Get the action type for the alert (if any)
   */
  getNetworkAlertAction(): string | null {
    const profile = this.getNetworkProfile();
    if (!profile) return null;

    if (profile.type === 'mesh' && profile.bssidLocked) {
      return 'remove_bssid_lock';
    }
    if (profile.type === 'mesh_isolated') {
      return 'open_cloud_remote';
    }

    return null;
  }

  /**
   * Get the action button label
   */
  getNetworkAlertActionLabel(): string {
    const action = this.getNetworkAlertAction();
    if (action === 'remove_bssid_lock') return 'Supprimer le verrou BSSID';
    if (action === 'open_cloud_remote') return 'Ouvrir Remote Cloud';
    return '';
  }

  /**
   * Handle the alert action button click
   */
  handleNetworkAlertAction(): void {
    const action = this.getNetworkAlertAction();

    if (action === 'remove_bssid_lock') {
      // Switch to debug tab where the user can remove the lock
      this.activeTab = 'debug';
      this.notificationService.info('Utilisez la section "WiFi Client" pour supprimer le verrouillage BSSID.');
    }

    if (action === 'open_cloud_remote') {
      // Open cloud remote in a new tab
      window.open(`/remote/${this.siteId}`, '_blank');
    }
  }

  /**
   * Dismiss the network alert
   */
  dismissNetworkAlert(): void {
    this.networkAlertDismissed = true;
  }

  // WiFi / Connection getters for template
  get wifiSignalDisplay(): string {
    if (!this.wifiStatus) return 'N/A';
    if (this.wifiStatus.connectionType === 'ethernet') return 'Ethernet';
    if (this.wifiStatus.connectionType === 'none') return 'Déconnecté';
    if (this.wifiStatus.interface === null) return 'Pas de clé USB';
    if (this.wifiStatus.signal !== null) return `${this.wifiStatus.signal} dBm`;
    return 'WiFi';
  }

  get wifiSignalWeak(): boolean {
    return !!this.wifiStatus &&
      this.wifiStatus.connectionType === 'wifi' &&
      this.wifiStatus.signal !== null &&
      this.wifiStatus.signal < -70;
  }

  get wifiSignalCritical(): boolean {
    if (!this.wifiStatus) return false;
    if (this.wifiStatus.connectionType === 'none') return true;
    if (this.wifiStatus.interface === null && this.wifiStatus.connectionType !== 'ethernet') return true;
    return this.wifiStatus.connectionType === 'wifi' &&
      this.wifiStatus.signal !== null &&
      this.wifiStatus.signal < -85;
  }

  get connectionIcon(): string {
    if (!this.wifiStatus) return '📶';
    if (this.wifiStatus.connectionType === 'ethernet') return '🔌';
    if (this.wifiStatus.connectionType === 'none') return '❌';
    return '📶';
  }

  get fanWarning(): boolean {
    if (!this.fanStatus?.present) return false;
    return this.fanStatus.curState === 0 && (this.currentMetrics?.temperature ?? 0) > 70;
  }

  get fanStatusDisplay(): string {
    if (!this.fanStatus?.present) return 'N/A';
    if (this.fanStatus.speedPercent !== null) {
      return `${this.fanStatus.speedPercent}%`;
    }
    return `${this.fanStatus.curState ?? '?'}/${this.fanStatus.maxState ?? '?'}`;
  }
}
