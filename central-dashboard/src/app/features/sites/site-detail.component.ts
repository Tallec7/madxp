import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';
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
  template: `
    <div class="page-container" *ngIf="site; else loading">
      <!-- Header -->
      <div class="page-header">
        <button class="btn btn-secondary" routerLink="/sites">← Retour</button>
        <h1>{{ site.club_name }}</h1>
        <button class="btn btn-primary btn-analytics" [routerLink]="['/sites', siteId, 'analytics']">
          📊 Analytics
        </button>
        <div class="header-badges">
          <!-- Badge profil réseau -->
          <span class="network-badge" [ngClass]="getNetworkBadgeClass()" [title]="getNetworkBadgeTooltip()">
            {{ getNetworkBadgeIcon() }} {{ getNetworkBadgeLabel() }}
          </span>
          <app-connection-indicator
            [siteId]="siteId"
            [showText]="true"
            [showDetails]="true"
            [externalStatus]="connectionStatus"
          ></app-connection-indicator>
        </div>
      </div>

      <!-- Network Alert Banner -->
      <div class="network-alert" *ngIf="showNetworkAlert()" [ngClass]="getNetworkAlertClass()">
        <div class="alert-icon">{{ getNetworkAlertIcon() }}</div>
        <div class="alert-content">
          <strong>{{ getNetworkAlertTitle() }}</strong>
          <p>{{ getNetworkAlertMessage() }}</p>
        </div>
        <div class="alert-actions" *ngIf="getNetworkAlertAction()">
          <button class="btn btn-sm" (click)="handleNetworkAlertAction()">
            {{ getNetworkAlertActionLabel() }}
          </button>
        </div>
        <button class="alert-dismiss" (click)="dismissNetworkAlert()">×</button>
      </div>

      <!-- Tabs Navigation -->
      <div class="tabs-nav">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'status'"
          (click)="activeTab = 'status'"
        >
          <span class="tab-icon">📊</span>
          <span class="tab-label">État</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'content'"
          (click)="activeTab = 'content'"
        >
          <span class="tab-icon">📱</span>
          <span class="tab-label">Contenu</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'settings'"
          (click)="activeTab = 'settings'"
        >
          <span class="tab-icon">⚙️</span>
          <span class="tab-label">Paramètres</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'profiles'"
          (click)="activeTab = 'profiles'"
        >
          <span class="tab-icon">📑</span>
          <span class="tab-label">Profils</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'sponsors'"
          (click)="activeTab = 'sponsors'"
        >
          <span class="tab-icon">💼</span>
          <span class="tab-label">Sponsors</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'subscription'"
          (click)="activeTab = 'subscription'"
        >
          <span class="tab-icon">💳</span>
          <span class="tab-label">Abonnement</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'debug'"
          (click)="activeTab = 'debug'"
        >
          <span class="tab-icon">🔧</span>
          <span class="tab-label">Debug</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- TAB: État -->
        <div *ngIf="activeTab === 'status'" class="tab-panel">
          <div class="status-grid">
            <!-- Informations principales -->
            <div class="card">
              <h3>Informations</h3>
              <div class="info-list">
                <div class="info-row">
                  <span class="label">Site ID:</span>
                  <span class="value monospace">{{ site.id }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Nom du site:</span>
                  <span class="value">{{ site.site_name }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Club:</span>
                  <span class="value">{{ site.club_name }}</span>
                </div>
                @if (site.hostname_slug) {
                  <div class="info-row">
                    <span class="label">Hostname:</span>
                    <span class="value monospace">{{ site.hostname_slug }}.local</span>
                  </div>
                }
                <div class="info-row">
                  <span class="label">Localisation:</span>
                  <span class="value">{{ getLocation() }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Sports:</span>
                  <span class="value">{{ site.sports?.join(', ') || 'N/A' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Version:</span>
                  <span class="value">{{ formatVersion(site.software_version) }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Modèle:</span>
                  <span class="value">{{ site.hardware_model || 'N/A' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Dernière vue:</span>
                  <span class="value">{{ formatLastSeen(site.last_seen_at) }}</span>
                </div>
                <div class="info-row" *ngIf="site.last_ip">
                  <span class="label">IP publique:</span>
                  <span class="value monospace">{{ site.last_ip }}</span>
                </div>
                <div class="info-row" *ngIf="site.local_ip">
                  <span class="label">IP locale:</span>
                  <span class="value monospace">{{ site.local_ip }}</span>
                </div>
              </div>
            </div>

            <!-- Métriques -->
            <div class="card">
              <h3>Métriques actuelles</h3>
              <div class="metrics-grid" *ngIf="currentMetrics; else noMetrics">
                <div class="metric" [class.warning]="(currentMetrics.cpu_usage ?? 0) > 80">
                  <div class="metric-icon">💻</div>
                  <div class="metric-info">
                    <div class="metric-label">CPU</div>
                    <div class="metric-value">{{ currentMetrics.cpu_usage?.toFixed(1) || 0 }}%</div>
                  </div>
                  <div class="metric-bar">
                    <div class="metric-fill" [style.width.%]="currentMetrics.cpu_usage ?? 0"></div>
                  </div>
                </div>

                <div class="metric" [class.warning]="(currentMetrics.memory_usage ?? 0) > 80">
                  <div class="metric-icon">🧠</div>
                  <div class="metric-info">
                    <div class="metric-label">RAM</div>
                    <div class="metric-value">{{ currentMetrics.memory_usage?.toFixed(1) || 0 }}%</div>
                  </div>
                  <div class="metric-bar">
                    <div class="metric-fill" [style.width.%]="currentMetrics.memory_usage ?? 0"></div>
                  </div>
                </div>

                <div class="metric" [class.warning]="(currentMetrics.temperature ?? 0) > 70">
                  <div class="metric-icon">🌡️</div>
                  <div class="metric-info">
                    <div class="metric-label">Température</div>
                    <div class="metric-value">{{ currentMetrics.temperature?.toFixed(1) || 0 }}°C</div>
                  </div>
                  <div class="metric-bar">
                    <div class="metric-fill" [style.width.%]="Math.min(currentMetrics.temperature ?? 0, 100)"></div>
                  </div>
                </div>

                <div class="metric" [class.warning]="(currentMetrics.disk_usage ?? 0) > 80">
                  <div class="metric-icon">💾</div>
                  <div class="metric-info">
                    <div class="metric-label">Disque</div>
                    <div class="metric-value">{{ currentMetrics.disk_usage?.toFixed(1) || 0 }}%</div>
                  </div>
                  <div class="metric-bar">
                    <div class="metric-fill" [style.width.%]="currentMetrics.disk_usage ?? 0"></div>
                  </div>
                </div>

                <div class="metric uptime-metric">
                  <div class="metric-icon">⏱️</div>
                  <div class="metric-info">
                    <div class="metric-label">Uptime</div>
                    <div class="metric-value">{{ formatUptime(currentMetrics.uptime) }}</div>
                  </div>
                </div>

                <div class="metric" [class.warning]="wifiSignalWeak" [class.critical]="wifiSignalCritical" *ngIf="wifiStatus">
                  <div class="metric-icon">{{ connectionIcon }}</div>
                  <div class="metric-info">
                    <div class="metric-label">Connexion</div>
                    <div class="metric-value">{{ wifiSignalDisplay }}</div>
                  </div>
                  <div class="metric-bar" *ngIf="wifiStatus.connectionType === 'wifi'">
                    <div class="metric-fill" [style.width.%]="wifiStatus.quality ?? 0"></div>
                  </div>
                </div>

                <div class="metric" [class.warning]="fanWarning" *ngIf="fanStatus?.present">
                  <div class="metric-icon">🌀</div>
                  <div class="metric-info">
                    <div class="metric-label">Ventilateur</div>
                    <div class="metric-value">{{ fanStatusDisplay }}</div>
                  </div>
                  <div class="metric-bar">
                    <div class="metric-fill" [style.width.%]="fanStatus?.speedPercent ?? 0"></div>
                  </div>
                </div>

                <div class="metric" [class.warning]="!hotspotActive" *ngIf="hotspotSsid">
                  <div class="metric-icon">📡</div>
                  <div class="metric-info">
                    <div class="metric-label">Hotspot</div>
                    <div class="metric-value">{{ hotspotActive ? hotspotSsid : 'Inactif' }}</div>
                  </div>
                  <div class="metric-details" *ngIf="hotspotActive">
                    <span class="metric-detail">Ch. {{ hotspotChannel || '?' }}</span>
                    <span class="metric-detail" *ngIf="hotspotClients > 0">{{ hotspotClients }} client{{ hotspotClients > 1 ? 's' : '' }}</span>
                  </div>
                </div>
              </div>
              <ng-template #noMetrics>
                <p class="no-data">Aucune métrique disponible</p>
              </ng-template>
            </div>
          </div>

          <!-- Actions rapides -->
          <div class="card actions-card">
            <h3>Actions rapides</h3>
            <p class="connection-hint" *ngIf="!isConnected">
              <strong>Site hors ligne.</strong> Les commandes temps réel sont désactivées.
              Les autres actions seront mises en file d'attente.
            </p>
            <p class="connection-hint warning" *ngIf="isConnected && connectionHealth && !connectionHealth.isHealthy">
              <strong>⚠️ Connexion instable.</strong>
              {{ getHealthReason() }}
              Les commandes peuvent échouer ou être mises en file d'attente.
            </p>
            <div class="actions-grid">
              <button class="action-card" (click)="restartService('neopro-app')" [disabled]="sendingCommand">
                <span class="action-icon">🔄</span>
                <div class="action-content">
                  <div class="action-title">Redémarrer l'app</div>
                  <div class="action-desc">{{ isConnected ? ('debug.restartsService' | translate) : ('debug.queued' | translate) }}</div>
                </div>
              </button>

              <button class="action-card" (click)="getLogs()" [disabled]="!isConnected">
                <span class="action-icon">📄</span>
                <div class="action-content">
                  <div class="action-title">Voir les logs</div>
                  <div class="action-desc">{{ isConnected ? 'Logs récents' : '⚡ Temps réel requis' }}</div>
                </div>
              </button>

              <button class="action-card" (click)="getSystemInfo()" [disabled]="!isConnected">
                <span class="action-icon">ℹ️</span>
                <div class="action-content">
                  <div class="action-title">Infos système</div>
                  <div class="action-desc">{{ isConnected ? 'Détails matériel' : '⚡ Temps réel requis' }}</div>
                </div>
              </button>

              <button class="action-card" (click)="restartHotspot()" [disabled]="sendingCommand" *ngIf="hotspotSsid">
                <span class="action-icon">📡</span>
                <div class="action-content">
                  <div class="action-title">Relancer Hotspot</div>
                  <div class="action-desc">{{ isConnected ? 'Redémarre hostapd + dnsmasq' : ('debug.queued' | translate) }}</div>
                </div>
              </button>

              <button class="action-card warning" (click)="rebootSite()" [disabled]="sendingCommand">
                <span class="action-icon">⚡</span>
                <div class="action-content">
                  <div class="action-title">Redémarrer Pi</div>
                  <div class="action-desc">{{ isConnected ? ('debug.fullReboot' | translate) : ('debug.queued' | translate) }}</div>
                </div>
              </button>

              <button class="action-card" (click)="showApiKey = !showApiKey">
                <span class="action-icon">🔑</span>
                <div class="action-content">
                  <div class="action-title">API Key</div>
                  <div class="action-desc">{{ showApiKey ? 'Masquer' : 'Afficher' }}</div>
                </div>
              </button>

              <button class="action-card" (click)="regenerateApiKey()">
                <span class="action-icon">🔄</span>
                <div class="action-content">
                  <div class="action-title">Régénérer clé</div>
                  <div class="action-desc">Nouvelle API key</div>
                </div>
              </button>
            </div>

            <div class="api-key-display" *ngIf="showApiKey">
              <div class="api-key-label">API Key:</div>
              <code class="api-key-value">{{ site.api_key }}</code>
              <button class="btn-icon" (click)="copyApiKey()" title="Copier">📋</button>
            </div>
          </div>

          <!-- Historique métriques -->
          <div class="card">
            <h3>Historique des métriques (24h)</h3>
            <div class="metrics-history" *ngIf="metricsHistory.length > 0; else noHistory">
              <div class="history-item" *ngFor="let metric of metricsHistory.slice(0, 10)">
                <div class="history-time">{{ metric.recorded_at | date:'HH:mm' }}</div>
                <div class="history-values">
                  <span class="history-badge">CPU: {{ metric.cpu_usage?.toFixed(1) }}%</span>
                  <span class="history-badge">RAM: {{ metric.memory_usage?.toFixed(1) }}%</span>
                  <span class="history-badge">{{ metric.temperature?.toFixed(1) }}°C</span>
                  <span class="history-badge">Disque: {{ metric.disk_usage?.toFixed(1) }}%</span>
                </div>
              </div>
            </div>
            <ng-template #noHistory>
              <p class="no-data">Aucun historique disponible</p>
            </ng-template>
          </div>

          <!-- Historique des matchs -->
          <div class="card">
            <div class="card-header-flex">
              <h3>🏆 Historique des matchs</h3>
              <button class="btn btn-sm btn-secondary" (click)="loadMatchHistory()" [disabled]="matchHistoryLoading">
                {{ matchHistoryLoading ? 'Chargement...' : '🔄 Actualiser' }}
              </button>
            </div>

            <div *ngIf="matchHistoryLoading" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Chargement...</span>
            </div>

            <div *ngIf="!matchHistoryLoading && matchHistory">
              <!-- Stats agrégées -->
              <div class="match-stats-grid" *ngIf="matchHistory.stats.totalMatches > 0">
                <div class="match-stat">
                  <div class="match-stat-value">{{ matchHistory.stats.totalMatches }}</div>
                  <div class="match-stat-label">Matchs</div>
                </div>
                <div class="match-stat">
                  <div class="match-stat-value">{{ matchHistory.stats.totalAudience | number }}</div>
                  <div class="match-stat-label">Spectateurs total</div>
                </div>
                <div class="match-stat">
                  <div class="match-stat-value">{{ matchHistory.stats.avgAudience }}</div>
                  <div class="match-stat-label">Moyenne / match</div>
                </div>
                <div class="match-stat">
                  <div class="match-stat-value">{{ matchHistory.stats.totalVideos }}</div>
                  <div class="match-stat-label">Vidéos diffusées</div>
                </div>
              </div>

              <!-- Liste des matchs -->
              <div class="matches-list" *ngIf="matchHistory.matches.length > 0; else noMatches">
                <div class="match-item" *ngFor="let match of matchHistory.matches">
                  <div class="match-date">{{ formatMatchDate(match.matchDate) }}</div>
                  <div class="match-details">
                    <div class="match-name">{{ match.matchName }}</div>
                    <div class="match-meta">
                      <span class="match-badge" *ngIf="match.audienceEstimate">
                        👥 {{ match.audienceEstimate }} spectateurs
                      </span>
                      <span class="match-badge">
                        📺 {{ match.videosPlayed }} vidéos
                      </span>
                      <span class="match-badge" *ngIf="match.durationMinutes">
                        ⏱️ {{ match.durationMinutes }} min
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <ng-template #noMatches>
                <p class="no-data">Aucun match enregistré. Les matchs apparaîtront ici quand vous configurerez un match depuis la télécommande.</p>
              </ng-template>
            </div>

            <div *ngIf="!matchHistoryLoading && !matchHistory">
              <p class="no-data">Impossible de charger l'historique des matchs</p>
            </div>
          </div>

          <!-- Benchmark anonymisé -->
          <div class="card">
            <app-site-benchmark [siteId]="siteId"></app-site-benchmark>
          </div>
        </div>

        <!-- TAB: Contenu -->
        <div *ngIf="activeTab === 'content'" class="tab-panel">
          <app-site-content-tab
            [siteId]="siteId"
            [siteName]="site.site_name || site.club_name || ''"
            [isConnected]="isConnected"
            (configDeployed)="onConfigDeployed()"
          ></app-site-content-tab>
        </div>

        <!-- TAB: Paramètres -->
        <div *ngIf="activeTab === 'settings'" class="tab-panel">
          <app-site-settings-tab
            [siteId]="siteId"
            [site]="site"
            [isConnected]="isConnected"
            (siteUpdated)="onSiteUpdated($event)"
          ></app-site-settings-tab>
        </div>

        <!-- TAB: Profils -->
        <div *ngIf="activeTab === 'profiles'" class="tab-panel">
          <app-site-profiles-tab
            [siteId]="siteId"
            [site]="site"
            [isConnected]="isConnected"
            (profileDeployed)="onConfigDeployed()"
          ></app-site-profiles-tab>
        </div>

        <!-- TAB: Sponsors -->
        <div *ngIf="activeTab === 'sponsors'" class="tab-panel">
          <app-site-sponsors-tab
            [siteId]="siteId"
            [site]="site"
          ></app-site-sponsors-tab>
        </div>

        <!-- TAB: Abonnement -->
        <div *ngIf="activeTab === 'subscription'" class="tab-panel">
          <app-site-subscription-tab
            [site]="site"
            (subscriptionChanged)="loadSite()"
          ></app-site-subscription-tab>
        </div>

        <!-- TAB: Debug -->
        <div *ngIf="activeTab === 'debug'" class="tab-panel">
          <app-site-debug-tab
            [siteId]="siteId"
            [isConnected]="isConnected"
            [connectionHealth]="connectionHealth"
          ></app-site-debug-tab>
        </div>
      </div>

      <!-- Modals -->
      <!-- Logs Modal -->
      <div class="modal" *ngIf="showLogsModal" (click)="showLogsModal = false">
        <div class="modal-content modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Logs - {{ site.club_name }}</h2>
            <button class="modal-close" (click)="showLogsModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="logs-container" *ngIf="!logsLoading; else logsLoadingTpl">
              <pre class="logs-content" *ngIf="logs.length > 0; else noLogs">{{ logs.join('\\n') }}</pre>
              <ng-template #noLogs>
                <p class="no-data">Aucun log disponible</p>
              </ng-template>
            </div>
            <ng-template #logsLoadingTpl>
              <div class="loading-inline">
                <div class="spinner-small"></div>
                <span>Chargement des logs...</span>
              </div>
            </ng-template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showLogsModal = false">Fermer</button>
            <button class="btn btn-primary" (click)="refreshLogs()">Rafraîchir</button>
          </div>
        </div>
      </div>

      <!-- System Info Modal -->
      <div class="modal" *ngIf="showSystemInfoModal" (click)="showSystemInfoModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Infos système - {{ site.club_name }}</h2>
            <button class="modal-close" (click)="showSystemInfoModal = false">×</button>
          </div>
          <div class="modal-body">
            <div *ngIf="!systemInfoLoading; else sysInfoLoadingTpl">
              <div class="info-list" *ngIf="systemInfo; else noSysInfo">
                <div class="info-row">
                  <span class="label">Hostname:</span>
                  <span class="value">{{ systemInfo.hostname }}</span>
                </div>
                <div class="info-row">
                  <span class="label">OS:</span>
                  <span class="value">{{ systemInfo.os }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Kernel:</span>
                  <span class="value">{{ systemInfo.kernel }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Architecture:</span>
                  <span class="value">{{ systemInfo.architecture }}</span>
                </div>
                <div class="info-row">
                  <span class="label">CPU:</span>
                  <span class="value">{{ systemInfo.cpu_model }} ({{ systemInfo.cpu_cores }} cores)</span>
                </div>
                <div class="info-row">
                  <span class="label">RAM:</span>
                  <span class="value">{{ formatMemory(systemInfo.total_memory) }}</span>
                </div>
                <div class="info-row">
                  <span class="label">IP:</span>
                  <span class="value monospace">{{ systemInfo.ip_address }}</span>
                </div>
                <div class="info-row">
                  <span class="label">MAC:</span>
                  <span class="value monospace">{{ systemInfo.mac_address }}</span>
                </div>
              </div>
              <ng-template #noSysInfo>
                <p class="no-data">Impossible de récupérer les informations système</p>
              </ng-template>
            </div>
            <ng-template #sysInfoLoadingTpl>
              <div class="loading-inline">
                <div class="spinner-small"></div>
                <span>Chargement...</span>
              </div>
            </ng-template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showSystemInfoModal = false">Fermer</button>
          </div>
        </div>
      </div>

    </div>

    <ng-template #loading>
      <div class="loading-container">
        <div class="spinner"></div>
        <span>Chargement...</span>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      flex: 1;
      margin: 0;
      font-size: 1.75rem;
    }

    .header-badges {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    /* Network Profile Badge */
    .network-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 500;
      white-space: nowrap;
      cursor: help;
    }

    .network-simple {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }

    .network-mesh {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }

    .network-mesh-isolated {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }

    .network-enterprise {
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #a5b4fc;
    }

    .network-unknown {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .network-ethernet {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #7dd3fc;
    }

    .network-warning {
      animation: pulse-warning 2s infinite;
    }

    @keyframes pulse-warning {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Network Alert Banner */
    .network-alert {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      position: relative;
    }

    .alert-warning {
      background: #fffbeb;
      border: 1px solid #fcd34d;
    }

    .alert-danger {
      background: #fef2f2;
      border: 1px solid #fca5a5;
    }

    .alert-info {
      background: #eff6ff;
      border: 1px solid #93c5fd;
    }

    .alert-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      margin-top: 0.125rem;
    }

    .alert-content {
      flex: 1;
    }

    .alert-content strong {
      display: block;
      font-size: 0.9375rem;
      margin-bottom: 0.375rem;
    }

    .alert-warning .alert-content strong { color: #92400e; }
    .alert-danger .alert-content strong { color: #991b1b; }
    .alert-info .alert-content strong { color: #1e40af; }

    .alert-content p {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.5;
      color: #64748b;
    }

    .alert-actions {
      flex-shrink: 0;
    }

    .alert-actions .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.8125rem;
      border-radius: 8px;
      background: white;
      border: 1px solid #e2e8f0;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s;
    }

    .alert-warning .alert-actions .btn-sm {
      border-color: #fcd34d;
      color: #92400e;
    }

    .alert-warning .alert-actions .btn-sm:hover {
      background: #fef3c7;
    }

    .alert-danger .alert-actions .btn-sm {
      border-color: #fca5a5;
      color: #991b1b;
    }

    .alert-danger .alert-actions .btn-sm:hover {
      background: #fee2e2;
    }

    .alert-dismiss {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
    }

    .alert-dismiss:hover {
      color: #475569;
    }

    /* Tabs Navigation */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 0;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border: none;
      background: transparent;
      font-size: 0.9375rem;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: #1e293b;
      background: #f8fafc;
    }

    .tab-btn.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .tab-icon {
      font-size: 1.125rem;
    }

    /* Tab Content */
    .tab-content {
      min-height: 400px;
    }

    .tab-panel {
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Status Grid */
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    /* Cards */
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h3 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
    }

    /* Info List */
    .info-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.375rem 0;
      border-bottom: 1px solid #f1f5f9;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row .label {
      font-size: 0.875rem;
      color: #64748b;
    }

    .info-row .value {
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
    }

    .info-row .value.monospace {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8125rem;
    }

    /* Metrics */
    .metrics-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .metric {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .metric.warning {
      background: #fef3c7;
    }

    .metric-icon {
      font-size: 1.25rem;
    }

    .metric-info {
      min-width: 80px;
    }

    .metric-label {
      font-size: 0.75rem;
      color: #64748b;
    }

    .metric-value {
      font-size: 1rem;
      font-weight: 600;
    }

    .metric-bar {
      flex: 1;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .metric-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .metric.warning .metric-fill {
      background: #f59e0b;
    }

    .metric-details {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .metric-detail {
      font-size: 0.75rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }

    .uptime-metric .metric-info {
      flex: 1;
    }

    /* Actions */
    .actions-card {
      margin-bottom: 1.5rem;
    }

    .connection-hint {
      margin: 0 0 1rem 0;
      padding: 0.75rem;
      background: #fef3c7;
      border-radius: 6px;
      font-size: 0.875rem;
      color: #92400e;
    }

    .connection-hint.warning {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      color: #92400e;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.75rem;
    }

    .action-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      text-align: left;
    }

    .action-card:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .action-card:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-card.warning {
      border-color: #fde047;
      background: #fefce8;
    }

    .action-icon {
      font-size: 1.25rem;
    }

    .action-title {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .action-desc {
      font-size: 0.75rem;
      color: #64748b;
    }

    /* API Key */
    .api-key-display {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      padding: 0.75rem;
      background: #f1f5f9;
      border-radius: 6px;
    }

    .api-key-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    .api-key-value {
      flex: 1;
      font-size: 0.8125rem;
      font-family: 'SF Mono', Monaco, monospace;
      background: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      word-break: break-all;
    }

    .btn-icon {
      padding: 0.375rem;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 1rem;
    }

    /* History */
    .metrics-history {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .history-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 6px;
    }

    .history-time {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #64748b;
      min-width: 50px;
    }

    .history-values {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .history-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      background: white;
      border-radius: 4px;
    }

    /* Modal */
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

    .modal-content.modal-large {
      max-width: 900px;
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
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .logs-content {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 400px;
      overflow: auto;
      white-space: pre-wrap;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 1rem;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .spinner-small {
      width: 24px;
      height: 24px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    /* Match History */
    .card-header-flex {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .card-header-flex h3 {
      margin: 0;
    }

    .match-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 10px;
    }

    .match-stat {
      text-align: center;
    }

    .match-stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0369a1;
    }

    .match-stat-label {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .matches-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .match-item {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 0.875rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .match-item:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .match-date {
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
      min-width: 80px;
      padding-top: 0.125rem;
    }

    .match-details {
      flex: 1;
    }

    .match-name {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 0.375rem;
    }

    .match-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .match-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: white;
      border-radius: 4px;
      color: #475569;
    }

    @media (max-width: 768px) {
      .match-stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .page-container {
        padding: 1rem;
      }

      .status-grid {
        grid-template-columns: 1fr;
      }

      .tabs-nav {
        overflow-x: auto;
      }

      .tab-label {
        display: none;
      }

      .tab-btn {
        padding: 0.75rem 1rem;
      }
    }
  `]
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

  // Hotspot status (from local_config_mirror)
  hotspotSsid: string | null = null;
  hotspotChannel: number | null = null;
  hotspotClients: number = 0;
  hotspotActive: boolean = false;

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
  private readonly notificationService = inject(NotificationService);
  private readonly logger = inject(LoggerService);
  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadSite();
    this.loadDashboardData();

    // Polling toutes les 30 secondes (suffisant pour un dashboard)
    this.refreshSubscription = interval(30000).subscribe(() => {
      this.loadDashboardData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
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
      this.sitesService.restartService(this.siteId, service).subscribe({
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
    this.sitesService.getLogs(this.siteId, 200).subscribe({
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
    this.sitesService.getSystemInfo(this.siteId).subscribe({
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
      this.sitesService.rebootSite(this.siteId).subscribe({
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
  }

  restartHotspot(): void {
    if (confirm('Redémarrer le hotspot WiFi (hostapd + dnsmasq) ?')) {
      this.sendingCommand = true;
      this.sitesService.fixHotspot(this.siteId, true).subscribe({
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
