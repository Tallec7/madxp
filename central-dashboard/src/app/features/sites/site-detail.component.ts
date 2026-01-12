import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { Site, Metrics, SiteConnectionStatus, ConnectionHealth } from '../../core/models';
import { formatVersion } from './utils/version';
import { Subscription, interval } from 'rxjs';
import { ConnectionIndicatorComponent } from '../../shared/components/connection-indicator.component';
import { SiteContentTabComponent } from './components/site-content-tab/site-content-tab.component';
import { SiteSettingsTabComponent } from './components/site-settings-tab/site-settings-tab.component';
import { SiteDebugTabComponent } from './components/site-debug-tab/site-debug-tab.component';

type TabId = 'status' | 'content' | 'settings' | 'debug';

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
    SiteDebugTabComponent
  ],
  template: `
    <div class="page-container" *ngIf="site; else loading">
      <!-- Header -->
      <div class="page-header">
        <button class="btn btn-secondary" routerLink="/sites">← Retour</button>
        <h1>{{ site.club_name }}</h1>
        <app-connection-indicator
          [siteId]="siteId"
          [showText]="true"
          [showDetails]="true"
          [externalStatus]="connectionStatus"
        ></app-connection-indicator>
        <button class="btn btn-primary" [routerLink]="['/sites', siteId, 'analytics']">
          📊 Analytics
        </button>
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
        </div>

        <!-- TAB: Contenu -->
        <div *ngIf="activeTab === 'content'" class="tab-panel">
          <app-site-content-tab
            [siteId]="siteId"
            [siteName]="site?.site_name || site?.club_name || ''"
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
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load site', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
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
            uptime24h: 0,
            firstHeartbeat24h: data.connection.heartbeat_24h.firstAt,
            lastHeartbeat24h: data.connection.heartbeat_24h.lastAt
          },
          health: this.connectionHealth || undefined
        };
        this.isConnected = isReallyConnected;
        this.metricsHistory = data.metrics.data;
        if (data.metrics.data.length > 0) {
          this.currentMetrics = data.metrics.data[0];
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

  formatUptime(ms: number | null): string {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
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
}
