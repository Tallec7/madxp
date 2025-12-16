import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SitesService } from '../../core/services/sites.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site, Metrics, SiteConnectionStatus } from '../../core/models';
import { Subscription, interval } from 'rxjs';
import { ConfigEditorComponent } from './config-editor/config-editor.component';
import { SiteContentViewerComponent } from './site-content-viewer/site-content-viewer.component';
import { ConnectionIndicatorComponent } from '../../shared/components/connection-indicator.component';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ConfigEditorComponent, SiteContentViewerComponent, ConnectionIndicatorComponent],
  template: `
    <div class="page-container" *ngIf="site; else loading">
      <div class="page-header">
        <button class="btn btn-secondary" routerLink="/sites">← Retour</button>
        <h1>{{ site.club_name }}</h1>
        <app-connection-indicator
          [siteId]="siteId"
          [showText]="true"
          [showDetails]="true"
          [refreshInterval]="15000"
        ></app-connection-indicator>
        <button class="btn btn-primary" [routerLink]="['/sites', siteId, 'analytics']">
          📊 Analytics
        </button>
      </div>

      <div class="info-grid">
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
              <span class="value">{{ site.software_version || 'N/A' }}</span>
            </div>
            <div class="info-row">
              <span class="label">Modèle:</span>
              <span class="value">{{ site.hardware_model }}</span>
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
              <span class="value monospace hint">{{ site.local_ip }}</span>
            </div>
            <div class="info-row">
              <span class="label">Créé le:</span>
              <span class="value">{{ site.created_at | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
          </div>
        </div>

        <!-- Métriques en temps réel -->
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

            <div class="metric" [class.warning]="(currentMetrics.temperature ?? 0) > 70" [class.critical]="(currentMetrics.temperature ?? 0) > 80">
              <div class="metric-icon">🌡️</div>
              <div class="metric-info">
                <div class="metric-label">Température</div>
                <div class="metric-value">{{ currentMetrics.temperature?.toFixed(1) || 0 }}°C</div>
              </div>
              <div class="metric-bar">
                <div class="metric-fill" [style.width.%]="Math.min(currentMetrics.temperature ?? 0, 100)"></div>
              </div>
            </div>

            <div class="metric" [class.warning]="(currentMetrics.disk_usage ?? 0) > 80" [class.critical]="(currentMetrics.disk_usage ?? 0) > 90">
              <div class="metric-icon">💾</div>
              <div class="metric-info">
                <div class="metric-label">Disque</div>
                <div class="metric-value">{{ currentMetrics.disk_usage?.toFixed(1) || 0 }}%</div>
              </div>
              <div class="metric-bar">
                <div class="metric-fill" [style.width.%]="currentMetrics.disk_usage"></div>
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
      <div class="card">
        <h3>Actions rapides</h3>
        <p class="connection-hint" *ngIf="!isConnected && connectionStatus">
          Le site n'est pas connecté en temps réel. Les actions à distance sont désactivées.
          <span *ngIf="connectionStatus.connection.lastSeenAt">
            Dernière connexion : {{ formatLastSeen(connectionStatus.connection.lastSeenAt) }}
          </span>
        </p>
        <div class="actions-grid">
          <button class="action-card" (click)="restartService('neopro-app')" [disabled]="!isConnected || sendingCommand">
            <span class="action-icon">🔄</span>
            <div class="action-content">
              <div class="action-title">Redémarrer l'app</div>
              <div class="action-desc">Redémarre le service NEOPRO</div>
            </div>
          </button>

          <button class="action-card" (click)="getLogs()" [disabled]="!isConnected">
            <span class="action-icon">📄</span>
            <div class="action-content">
              <div class="action-title">Voir les logs</div>
              <div class="action-desc">Récupère les logs récents</div>
            </div>
          </button>

          <button class="action-card" (click)="getSystemInfo()" [disabled]="!isConnected">
            <span class="action-icon">ℹ️</span>
            <div class="action-content">
              <div class="action-title">Infos système</div>
              <div class="action-desc">Détails matériel et réseau</div>
            </div>
          </button>

          <button class="action-card" (click)="runNetworkDiagnostics()" [disabled]="!isConnected">
            <span class="action-icon">🌐</span>
            <div class="action-content">
              <div class="action-title">Diagnostic réseau</div>
              <div class="action-desc">Tester la connectivité</div>
            </div>
          </button>

          <button class="action-card warning" (click)="rebootSite()" [disabled]="!isConnected || sendingCommand">
            <span class="action-icon">⚡</span>
            <div class="action-content">
              <div class="action-title">Redémarrer</div>
              <div class="action-desc">Redémarre le Raspberry Pi</div>
            </div>
          </button>

          <button class="action-card" (click)="showApiKey = !showApiKey">
            <span class="action-icon">🔑</span>
            <div class="action-content">
              <div class="action-title">API Key</div>
              <div class="action-desc">{{ showApiKey ? 'Masquer' : 'Afficher' }} la clé</div>
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

      <!-- Mise à jour du sync-agent -->
      <div class="card" *ngIf="isConnected">
        <div class="card-header-row">
          <h3>Mise à jour Sync-Agent</h3>
          <button
            class="btn btn-primary"
            (click)="updateSyncAgentRemotely()"
            [disabled]="updatingSyncAgent"
          >
            {{ updatingSyncAgent ? 'Mise à jour en cours...' : 'Mettre à jour le sync-agent' }}
          </button>
        </div>
        <p class="card-description">
          Met à jour le sync-agent à distance pour activer les nouvelles fonctionnalités
          (configuration hotspot WiFi, etc.).
        </p>
      </div>

      <!-- Configuration Hotspot WiFi -->
      <div class="card">
        <div class="card-header-row">
          <h3>Configuration Hotspot WiFi</h3>
          <button class="btn btn-secondary" (click)="toggleHotspotConfig()" [disabled]="!isConnected">
            {{ showHotspotConfig ? 'Masquer' : 'Modifier' }}
          </button>
        </div>
        <div *ngIf="showHotspotConfig" class="hotspot-config-form">
          <div class="form-group">
            <label for="hotspotSsid">SSID (nom du réseau WiFi)</label>
            <input
              type="text"
              id="hotspotSsid"
              [(ngModel)]="hotspotSsid"
              placeholder="NEOPRO-MonClub"
              maxlength="32"
              class="form-input"
            />
            <small class="form-hint">Max 32 caractères</small>
          </div>
          <div class="form-group">
            <label for="hotspotPassword">Mot de passe WiFi</label>
            <input
              type="text"
              id="hotspotPassword"
              [(ngModel)]="hotspotPassword"
              placeholder="Nouveau mot de passe"
              minlength="8"
              maxlength="63"
              class="form-input"
            />
            <small class="form-hint">Entre 8 et 63 caractères (WPA2)</small>
          </div>
          <div class="form-actions">
            <button
              class="btn btn-primary"
              (click)="updateHotspot()"
              [disabled]="updatingHotspot || (!hotspotSsid && !hotspotPassword)"
            >
              {{ updatingHotspot ? 'Mise à jour...' : 'Appliquer les modifications' }}
            </button>
          </div>
          <div class="hotspot-warning">
            <strong>Attention :</strong> Après modification, vous devrez vous reconnecter au nouveau réseau WiFi pour accéder au boîtier.
          </div>
        </div>
      </div>

      <!-- Options Premium -->
      <div class="card">
        <div class="card-header-row">
          <h3>Options Premium</h3>
        </div>
        <div class="premium-options">
          <div class="premium-option">
            <div class="premium-option-header">
              <label class="toggle-label">
                <input
                  type="checkbox"
                  [checked]="site.live_score_enabled"
                  (change)="toggleLiveScore($event)"
                  [disabled]="savingLiveScore"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">Score en Live</span>
                <span class="premium-badge">Premium</span>
              </label>
            </div>
            <p class="premium-option-desc">
              Permet d'afficher le score du match en surimpression sur la TV pendant les vidéos.
              Le score est saisi depuis la télécommande.
            </p>
          </div>
        </div>
      </div>

      <!-- Configuration du site -->
      <div class="card">
        <div class="card-header-row">
          <h3>Configuration du site</h3>
          <button class="btn btn-primary" (click)="toggleConfigEditor()" [disabled]="site.status !== 'online'">
            {{ showConfigEditor ? 'Fermer' : 'Modifier la configuration' }}
          </button>
        </div>
        <div *ngIf="showConfigEditor" class="config-editor-wrapper">
          <app-config-editor
            [siteId]="siteId"
            [siteName]="site.site_name"
            (configDeployed)="onConfigDeployed()"
          ></app-config-editor>
        </div>
      </div>

      <!-- Contenu local du site -->
      <div class="card">
        <div class="card-header-row">
          <h3>Contenu local</h3>
          <button class="btn btn-secondary" (click)="showContentViewer = !showContentViewer">
            {{ showContentViewer ? 'Masquer' : 'Voir le contenu' }}
          </button>
        </div>
        <div *ngIf="showContentViewer" class="content-viewer-wrapper">
          <app-site-content-viewer [siteId]="siteId"></app-site-content-viewer>
        </div>
      </div>

      <!-- Historique des métriques -->
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

    <!-- Modal Logs -->
    <div class="modal" *ngIf="showLogsModal" (click)="showLogsModal = false">
      <div class="modal-content modal-large" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Logs - {{ site?.club_name }}</h2>
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

    <!-- Modal System Info -->
    <div class="modal" *ngIf="showSystemInfoModal" (click)="showSystemInfoModal = false">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Infos système - {{ site?.club_name }}</h2>
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
                <span class="label">Mémoire totale:</span>
                <span class="value">{{ formatMemory(systemInfo.total_memory) }}</span>
              </div>
              <div class="info-row">
                <span class="label">Adresse IP:</span>
                <span class="value monospace">{{ systemInfo.ip_address }}</span>
              </div>
              <div class="info-row">
                <span class="label">Adresse MAC:</span>
                <span class="value monospace">{{ systemInfo.mac_address }}</span>
              </div>
            </div>
            <ng-template #noSysInfo>
              <p class="no-data">Impossible de récupérer les infos système</p>
            </ng-template>
          </div>
          <ng-template #sysInfoLoadingTpl>
            <div class="loading-inline">
              <div class="spinner-small"></div>
              <span>Chargement des infos système...</span>
            </div>
          </ng-template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showSystemInfoModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- Modal Network Diagnostics -->
    <div class="modal" *ngIf="showNetworkDiagModal" (click)="showNetworkDiagModal = false">
      <div class="modal-content modal-large" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Diagnostic réseau - {{ site?.club_name }}</h2>
          <button class="modal-close" (click)="showNetworkDiagModal = false">×</button>
        </div>
        <div class="modal-body">
          <div *ngIf="!networkDiagLoading; else networkDiagLoadingTpl">
            <div *ngIf="networkDiagnostics; else noNetworkDiag" class="network-diagnostics">
              <!-- Résumé des tests -->
              <div class="diag-summary">
                <div class="diag-status-item" [class.success]="networkDiagnostics.internet?.reachable" [class.error]="!networkDiagnostics.internet?.reachable">
                  <span class="diag-icon">{{ networkDiagnostics.internet?.reachable ? '✅' : '❌' }}</span>
                  <span class="diag-label">Internet</span>
                  <span class="diag-value" *ngIf="networkDiagnostics.internet?.latency_ms">{{ networkDiagnostics.internet.latency_ms }}ms</span>
                </div>
                <div class="diag-status-item" [class.success]="networkDiagnostics.central_server?.reachable" [class.error]="!networkDiagnostics.central_server?.reachable">
                  <span class="diag-icon">{{ networkDiagnostics.central_server?.reachable ? '✅' : '❌' }}</span>
                  <span class="diag-label">Serveur central</span>
                  <span class="diag-value" *ngIf="networkDiagnostics.central_server?.latency_ms">{{ networkDiagnostics.central_server.latency_ms }}ms</span>
                </div>
                <div class="diag-status-item" [class.success]="networkDiagnostics.dns?.working" [class.error]="!networkDiagnostics.dns?.working">
                  <span class="diag-icon">{{ networkDiagnostics.dns?.working ? '✅' : '❌' }}</span>
                  <span class="diag-label">DNS</span>
                  <span class="diag-value" *ngIf="networkDiagnostics.dns?.resolution_time_ms">{{ networkDiagnostics.dns.resolution_time_ms }}ms</span>
                </div>
                <div class="diag-status-item" [class.success]="networkDiagnostics.gateway?.reachable" [class.error]="!networkDiagnostics.gateway?.reachable">
                  <span class="diag-icon">{{ networkDiagnostics.gateway?.reachable ? '✅' : '❌' }}</span>
                  <span class="diag-label">Passerelle</span>
                  <span class="diag-value" *ngIf="networkDiagnostics.gateway?.ip">{{ networkDiagnostics.gateway.ip }}</span>
                </div>
              </div>

              <!-- Détails Internet (packet loss) -->
              <div class="diag-section" *ngIf="networkDiagnostics.internet">
                <h4>Internet</h4>
                <div class="info-list">
                  <div class="info-row">
                    <span class="label">Latence ping:</span>
                    <span class="value">{{ networkDiagnostics.internet.latency_ms ?? 'N/A' }} ms</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.internet.packet_loss_percent !== null">
                    <span class="label">Perte de paquets:</span>
                    <span class="value" [class.warning-text]="networkDiagnostics.internet.packet_loss_percent > 0" [class.error-text]="networkDiagnostics.internet.packet_loss_percent > 10">
                      {{ networkDiagnostics.internet.packet_loss_percent }}%
                      <span class="hint" *ngIf="networkDiagnostics.internet.packets_sent">({{ networkDiagnostics.internet.packets_received }}/{{ networkDiagnostics.internet.packets_sent }})</span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Détails Serveur central -->
              <div class="diag-section" *ngIf="networkDiagnostics.central_server">
                <h4>Serveur central</h4>
                <div class="info-list">
                  <div class="info-row">
                    <span class="label">Latence ping:</span>
                    <span class="value">{{ networkDiagnostics.central_server.latency_ms ?? 'N/A' }} ms</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.central_server.http_latency_ms !== null">
                    <span class="label">Latence HTTP:</span>
                    <span class="value">{{ networkDiagnostics.central_server.http_latency_ms }} ms</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.central_server.http_status !== null">
                    <span class="label">Status HTTP:</span>
                    <span class="value" [class.success-text]="networkDiagnostics.central_server.http_status >= 200 && networkDiagnostics.central_server.http_status < 300"
                      [class.error-text]="networkDiagnostics.central_server.http_status >= 400">
                      {{ networkDiagnostics.central_server.http_status }}
                    </span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.central_server.port_443_open !== null">
                    <span class="label">Port 443 (HTTPS):</span>
                    <span class="value">
                      <span [class.success-text]="networkDiagnostics.central_server.port_443_open" [class.error-text]="!networkDiagnostics.central_server.port_443_open">
                        {{ networkDiagnostics.central_server.port_443_open ? 'Ouvert' : 'Fermé' }}
                      </span>
                    </span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.central_server.ssl_valid !== null">
                    <span class="label">Certificat SSL:</span>
                    <span class="value">
                      <span [class.success-text]="networkDiagnostics.central_server.ssl_valid" [class.error-text]="!networkDiagnostics.central_server.ssl_valid">
                        {{ networkDiagnostics.central_server.ssl_valid ? 'Valide' : 'Invalide' }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Détails DNS -->
              <div class="diag-section" *ngIf="networkDiagnostics.dns">
                <h4>DNS</h4>
                <div class="info-list">
                  <div class="info-row" *ngIf="networkDiagnostics.dns.tested_domain">
                    <span class="label">Domaine testé:</span>
                    <span class="value monospace">{{ networkDiagnostics.dns.tested_domain }}</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.dns.resolved_ip">
                    <span class="label">IP résolue:</span>
                    <span class="value monospace">{{ networkDiagnostics.dns.resolved_ip }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Temps résolution:</span>
                    <span class="value">{{ networkDiagnostics.dns.resolution_time_ms ?? 'N/A' }} ms</span>
                  </div>
                </div>
              </div>

              <!-- Infos WiFi (utile pour comprendre l'instabilité) -->
              <div class="diag-section" *ngIf="networkDiagnostics.wifi">
                <h4>WiFi</h4>
                <div class="info-list">
                  <div class="info-row" *ngIf="networkDiagnostics.wifi.ssid">
                    <span class="label">SSID:</span>
                    <span class="value">{{ networkDiagnostics.wifi.ssid }}</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.wifi.quality_percent !== null">
                    <span class="label">Qualité signal:</span>
                    <span class="value">
                      {{ networkDiagnostics.wifi.quality_percent }}%
                      <span class="wifi-quality-bar">
                        <span class="wifi-quality-fill" [style.width.%]="networkDiagnostics.wifi.quality_percent"
                          [class.good]="networkDiagnostics.wifi.quality_percent >= 70"
                          [class.medium]="networkDiagnostics.wifi.quality_percent >= 40 && networkDiagnostics.wifi.quality_percent < 70"
                          [class.poor]="networkDiagnostics.wifi.quality_percent < 40"></span>
                      </span>
                    </span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.wifi.signal_dbm !== null">
                    <span class="label">Signal:</span>
                    <span class="value">{{ networkDiagnostics.wifi.signal_dbm }} dBm</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.wifi.bitrate_mbps">
                    <span class="label">Débit:</span>
                    <span class="value">{{ networkDiagnostics.wifi.bitrate_mbps }} Mb/s</span>
                  </div>
                </div>
              </div>

              <!-- Stabilité réseau -->
              <div class="diag-section" *ngIf="networkDiagnostics.stability">
                <h4>Stabilité</h4>
                <div class="info-list">
                  <div class="info-row" *ngIf="networkDiagnostics.stability.interface_uptime_seconds !== null">
                    <span class="label">Uptime interface:</span>
                    <span class="value">{{ formatInterfaceUptime(networkDiagnostics.stability.interface_uptime_seconds) }}</span>
                  </div>
                  <div class="info-row" *ngIf="networkDiagnostics.stability.reconnections_24h !== null">
                    <span class="label">Reconnexions (24h):</span>
                    <span class="value" [class.warning-text]="networkDiagnostics.stability.reconnections_24h > 5" [class.error-text]="networkDiagnostics.stability.reconnections_24h > 20">
                      {{ networkDiagnostics.stability.reconnections_24h }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Timestamp -->
              <div class="diag-timestamp" *ngIf="networkDiagnostics.timestamp">
                Test effectué le {{ networkDiagnostics.timestamp | date:'dd/MM/yyyy HH:mm:ss' }}
              </div>
            </div>
            <ng-template #noNetworkDiag>
              <p class="no-data">Impossible de récupérer les diagnostics réseau</p>
            </ng-template>
          </div>
          <ng-template #networkDiagLoadingTpl>
            <div class="loading-inline">
              <div class="spinner-small"></div>
              <span>Exécution des tests réseau...</span>
            </div>
          </ng-template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showNetworkDiagModal = false">Fermer</button>
          <button class="btn btn-primary" (click)="refreshNetworkDiagnostics()">Relancer le test</button>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
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
      font-size: 2rem;
      color: #0f172a;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .card h3 {
      font-size: 1.125rem;
      margin: 0 0 1.5rem 0;
      color: #0f172a;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .info-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.625rem 0;
      border-bottom: 1px solid #f1f5f9;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row .label {
      font-weight: 500;
      color: #64748b;
    }

    .info-row .value {
      color: #0f172a;
      text-align: right;
    }

    .monospace {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
    }

    .metrics-grid {
      display: grid;
      gap: 1rem;
    }

    .metric {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #2563eb;
      transition: all 0.2s;
    }

    .metric.warning {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .metric.critical {
      border-left-color: #ef4444;
      background: #fef2f2;
    }

    .metric-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .metric-info {
      flex: 1;
    }

    .metric-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .metric-bar {
      width: 100%;
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .metric-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      transition: width 0.3s ease;
    }

    .metric.warning .metric-fill {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }

    .metric.critical .metric-fill {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }

    .uptime-metric {
      grid-column: 1 / -1;
      border-left-color: #10b981;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .action-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
    }

    .action-card:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #2563eb;
      transform: translateY(-2px);
    }

    .action-card:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-card.warning {
      border-color: #f59e0b;
    }

    .action-card.warning:hover:not(:disabled) {
      background: #fffbeb;
    }

    .action-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .action-content {
      flex: 1;
    }

    .action-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .action-desc {
      font-size: 0.875rem;
      color: #64748b;
    }

    .api-key-display {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .api-key-label {
      font-weight: 600;
      color: #64748b;
    }

    .api-key-value {
      flex: 1;
      padding: 0.5rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      color: #0f172a;
    }

    .metrics-history {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .history-item {
      display: flex;
      gap: 1rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
    }

    .history-time {
      font-weight: 600;
      color: #64748b;
      min-width: 60px;
    }

    .history-values {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .history-badge {
      padding: 0.25rem 0.75rem;
      background: white;
      border-radius: 12px;
      font-size: 0.875rem;
      color: #475569;
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #94a3b8;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 1rem;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .card-header-row h3 {
      margin: 0;
      border: none;
      padding: 0;
    }

    .card-description {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0;
    }

    .config-editor-wrapper {
      margin-top: 1rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #cbd5e1;
    }

    /* Modal */
    .modal {
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
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-content.modal-large {
      max-width: 800px;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f1f5f9;
      color: #64748b;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .logs-container {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .logs-content {
      color: #e2e8f0;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.75rem;
      line-height: 1.5;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
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

    /* Hotspot config form */
    .hotspot-config-form {
      margin-top: 1rem;
      padding: 1.5rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group label {
      display: block;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .form-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-hint {
      display: block;
      margin-top: 0.375rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .form-actions {
      margin-top: 1.5rem;
    }

    .hotspot-warning {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      font-size: 0.875rem;
      color: #92400e;
    }

    /* Premium Options */
    .premium-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .premium-option {
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .premium-option-header {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
    }

    .toggle-label input[type="checkbox"] {
      position: relative;
      width: 44px;
      height: 24px;
      appearance: none;
      background: #cbd5e1;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .toggle-label input[type="checkbox"]:checked {
      background: #10b981;
    }

    .toggle-label input[type="checkbox"]::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .toggle-label input[type="checkbox"]:checked::after {
      transform: translateX(20px);
    }

    .toggle-label input[type="checkbox"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .toggle-text {
      font-weight: 600;
      color: #0f172a;
    }

    .premium-badge {
      padding: 0.25rem 0.5rem;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .premium-option-desc {
      margin: 0.75rem 0 0 0;
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
    }

    /* Network Diagnostics Modal */
    .network-diagnostics {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .diag-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .diag-status-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 2px solid #e2e8f0;
      transition: all 0.2s;
    }

    .diag-status-item.success {
      background: #f0fdf4;
      border-color: #10b981;
    }

    .diag-status-item.error {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .diag-icon {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .diag-label {
      font-weight: 600;
      color: #374151;
      text-align: center;
    }

    .diag-value {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .diag-section {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1rem;
    }

    .diag-section h4 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #374151;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.5rem;
    }

    .hint {
      color: #9ca3af;
      font-size: 0.875rem;
    }

    .connection-hint {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      color: #92400e;
      font-size: 0.875rem;
    }

    .connection-hint span {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.8125rem;
      color: #b45309;
    }

    .wifi-quality-bar {
      display: inline-block;
      width: 60px;
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
      vertical-align: middle;
      margin-left: 0.5rem;
    }

    .wifi-quality-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }

    .wifi-quality-fill.good {
      background: linear-gradient(90deg, #10b981, #34d399);
    }

    .wifi-quality-fill.medium {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }

    .wifi-quality-fill.poor {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }

    .diag-timestamp {
      text-align: center;
      font-size: 0.8125rem;
      color: #9ca3af;
      padding-top: 0.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .success-text {
      color: #10b981;
      font-weight: 500;
    }

    .warning-text {
      color: #f59e0b;
      font-weight: 500;
    }

    .error-text {
      color: #ef4444;
      font-weight: 500;
    }

    @media (max-width: 768px) {
      .info-grid {
        grid-template-columns: 1fr;
      }

      .actions-grid {
        grid-template-columns: 1fr;
      }

      .config-actions {
        flex-direction: column;
      }

      .diag-summary {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class SiteDetailComponent implements OnInit, OnDestroy {
  site: Site | null = null;
  currentMetrics: Metrics | null = null;
  metricsHistory: Metrics[] = [];
  showApiKey = false;
  siteId!: string;
  Math = Math;

  // Connexion temps réel (WebSocket)
  connectionStatus: SiteConnectionStatus | null = null;
  isConnected = false;
  private connectionCheckSubscription?: Subscription;

  // Configuration editor
  showConfigEditor = false;
  sendingCommand = false;

  // Content viewer
  showContentViewer = false;

  // Hotspot config
  showHotspotConfig = false;
  hotspotSsid = '';
  hotspotPassword = '';
  updatingHotspot = false;

  // Sync-agent update
  updatingSyncAgent = false;

  // Premium options
  savingLiveScore = false;

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

  // Network Diagnostics
  showNetworkDiagModal = false;
  networkDiagLoading = false;
  networkDiagnostics: {
    success: boolean;
    timestamp: string;
    internet: {
      reachable: boolean;
      latency_ms: number | null;
      packet_loss_percent: number | null;
      packets_sent: number;
      packets_received: number;
    };
    central_server: {
      reachable: boolean;
      latency_ms: number | null;
      http_latency_ms: number | null;
      http_status: number | null;
      url: string;
      port_443_open: boolean | null;
      ssl_valid: boolean | null;
    };
    dns: {
      working: boolean;
      resolution_time_ms: number | null;
      tested_domain: string | null;
      resolved_ip: string | null;
    };
    gateway: { ip: string | null; reachable: boolean; latency_ms: number | null };
    interfaces: Array<{
      name: string;
      ip4: string | null;
      ip6: string | null;
      mac: string | null;
      type: string;
      operstate: string;
      speed: number | null;
    }>;
    wifi: {
      connected: boolean;
      ssid: string | null;
      quality_percent: number | null;
      signal_dbm: number | null;
      bitrate_mbps: number | null;
    } | null;
    stability: {
      interface_uptime_seconds: number | null;
      reconnections_24h: number | null;
    };
  } | null = null;
  private networkDiagCommandId: string | null = null;
  private networkDiagPollInterval: ReturnType<typeof setInterval> | null = null;

  private readonly route = inject(ActivatedRoute);
  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);
  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadSite();
    this.loadMetrics();
    this.loadConnectionStatus();

    // Auto-refresh toutes les 30 secondes
    this.refreshSubscription = interval(30000).subscribe(() => {
      if (this.isConnected) {
        this.loadMetrics();
      }
    });

    // Vérification de la connexion temps réel toutes les 15 secondes
    this.connectionCheckSubscription = interval(15000).subscribe(() => {
      this.loadConnectionStatus();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.connectionCheckSubscription?.unsubscribe();
    if (this.networkDiagPollInterval) {
      clearInterval(this.networkDiagPollInterval);
      this.networkDiagPollInterval = null;
    }
  }

  loadSite(): void {
    this.sitesService.getSite(this.siteId).subscribe({
      next: (site) => {
        this.site = site;
      },
      error: (error) => {
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  loadConnectionStatus(): void {
    this.sitesService.getConnectionStatus(this.siteId).subscribe({
      next: (status) => {
        this.connectionStatus = status;
        this.isConnected = status.connection.isConnected;
      },
      error: (error) => {
        console.error('Erreur chargement statut connexion:', error);
        this.isConnected = false;
      }
    });
  }

  loadMetrics(): void {
    this.sitesService.getSiteMetrics(this.siteId, 24).subscribe({
      next: (response) => {
        this.metricsHistory = response.metrics;
        if (response.metrics.length > 0) {
          this.currentMetrics = response.metrics[0];
        }
      },
      error: (error) => {
        console.error('Erreur chargement métriques:', error);
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

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      online: 'success',
      offline: 'secondary',
      error: 'danger',
      maintenance: 'warning'
    };
    return badges[status] || 'secondary';
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

  restartService(service: string): void {
    if (confirm(`Redémarrer le service ${service} ?`)) {
      this.sendingCommand = true;
      this.sitesService.restartService(this.siteId, service).subscribe({
        next: (response) => {
          this.sendingCommand = false;
          this.notificationService.success(response.message || 'Commande envoyée avec succès');
        },
        error: (error) => {
          this.sendingCommand = false;
          this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
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
        this.logs = [`Erreur lors de la récupération des logs: ${error.error?.error || error.message}`];
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
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  formatMemory(bytes: number): string {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  }

  formatInterfaceUptime(seconds: number | null): string {
    if (seconds === null) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}j ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Network Diagnostics
  runNetworkDiagnostics(): void {
    this.showNetworkDiagModal = true;
    this.refreshNetworkDiagnostics();
  }

  refreshNetworkDiagnostics(): void {
    this.networkDiagLoading = true;
    this.networkDiagnostics = null;

    // Clear any existing poll interval
    if (this.networkDiagPollInterval) {
      clearInterval(this.networkDiagPollInterval);
      this.networkDiagPollInterval = null;
    }

    this.sitesService.runNetworkDiagnostics(this.siteId).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.networkDiagCommandId = response.commandId;
          // Poll for command result
          this.pollNetworkDiagResult();
        } else {
          this.networkDiagLoading = false;
          this.notificationService.error('Erreur: pas de commandId reçu');
        }
      },
      error: (error) => {
        this.networkDiagLoading = false;
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  private pollNetworkDiagResult(): void {
    if (!this.networkDiagCommandId) return;

    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    this.networkDiagPollInterval = setInterval(() => {
      attempts++;

      if (attempts > maxAttempts) {
        if (this.networkDiagPollInterval) {
          clearInterval(this.networkDiagPollInterval);
          this.networkDiagPollInterval = null;
        }
        this.networkDiagLoading = false;
        this.notificationService.error('Timeout: le diagnostic n\'a pas répondu à temps');
        return;
      }

      this.sitesService.getCommandStatus(this.siteId, this.networkDiagCommandId!).subscribe({
        next: (result) => {
          if (result.status === 'completed' && result.result) {
            if (this.networkDiagPollInterval) {
              clearInterval(this.networkDiagPollInterval);
              this.networkDiagPollInterval = null;
            }
            this.networkDiagLoading = false;
            this.networkDiagnostics = result.result as typeof this.networkDiagnostics;
          } else if (result.status === 'failed') {
            if (this.networkDiagPollInterval) {
              clearInterval(this.networkDiagPollInterval);
              this.networkDiagPollInterval = null;
            }
            this.networkDiagLoading = false;
            this.notificationService.error('Erreur: ' + (result.error_message || 'Échec du diagnostic'));
          }
          // Si pending ou executing, on continue de poller
        },
        error: (error) => {
          console.error('Error polling network diag result:', error);
        }
      });
    }, 1000);
  }

  rebootSite(): void {
    if (confirm('⚠️ Êtes-vous sûr de vouloir redémarrer le Raspberry Pi ?')) {
      this.sendingCommand = true;
      this.sitesService.rebootSite(this.siteId).subscribe({
        next: (response) => {
          this.sendingCommand = false;
          this.notificationService.success(response.message || 'Commande de redémarrage envoyée');
        },
        error: (error) => {
          this.sendingCommand = false;
          this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  regenerateApiKey(): void {
    if (confirm('Régénérer la clé API ? L\'ancienne clé ne fonctionnera plus.')) {
      this.sitesService.regenerateApiKey(this.siteId).subscribe({
        next: (site) => {
          this.site = site;
          this.notificationService.success('Clé API régénérée avec succès !');
        },
        error: (error) => {
          this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
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

  // Configuration editor methods
  toggleConfigEditor(): void {
    this.showConfigEditor = !this.showConfigEditor;
  }

  onConfigDeployed(): void {
    this.notificationService.success('Configuration déployée avec succès !');
  }

  // Premium options methods
  toggleLiveScore(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;

    this.savingLiveScore = true;
    this.sitesService.updateSite(this.siteId, { live_score_enabled: newValue }).subscribe({
      next: (updatedSite) => {
        this.savingLiveScore = false;
        if (this.site) {
          this.site.live_score_enabled = newValue;
        }
        this.notificationService.success(
          newValue
            ? 'Score en Live activé ! Le boîtier doit être resynchronisé pour appliquer le changement.'
            : 'Score en Live désactivé.'
        );
      },
      error: (error) => {
        this.savingLiveScore = false;
        // Revert checkbox state
        checkbox.checked = !newValue;
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  // Hotspot config methods
  toggleHotspotConfig(): void {
    this.showHotspotConfig = !this.showHotspotConfig;
    if (!this.showHotspotConfig) {
      this.hotspotSsid = '';
      this.hotspotPassword = '';
    }
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

    const changes = [];
    if (this.hotspotSsid) changes.push(`SSID: ${this.hotspotSsid}`);
    if (this.hotspotPassword) changes.push('Mot de passe');

    if (!confirm(`Modifier la configuration du hotspot WiFi ?\n\nChangements : ${changes.join(', ')}\n\nAttention : vous devrez vous reconnecter au nouveau réseau WiFi.`)) {
      return;
    }

    this.updatingHotspot = true;
    this.sitesService.updateHotspot(
      this.siteId,
      this.hotspotSsid || undefined,
      this.hotspotPassword || undefined
    ).subscribe({
      next: (response) => {
        this.updatingHotspot = false;
        this.notificationService.success('Configuration du hotspot mise à jour avec succès !');
        this.hotspotSsid = '';
        this.hotspotPassword = '';
        this.showHotspotConfig = false;
      },
      error: (error) => {
        this.updatingHotspot = false;
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  // Remote sync-agent update
  updateSyncAgentRemotely(): void {
    if (!confirm('Mettre à jour le sync-agent à distance ?\n\nCette opération va envoyer les fichiers mis à jour et redémarrer le service sync-agent sur le boîtier.')) {
      return;
    }

    this.updatingSyncAgent = true;

    // Files to update on the remote sync-agent
    const agentFiles: Record<string, string> = {
      'src/config.js': this.getSyncAgentConfigFile(),
      'src/commands/index.js': this.getSyncAgentCommandsFile(),
    };

    this.sitesService.updateSyncAgent(this.siteId, agentFiles).subscribe({
      next: (response) => {
        this.updatingSyncAgent = false;
        this.notificationService.success('Mise à jour du sync-agent envoyée ! Le service va redémarrer.');
      },
      error: (error) => {
        this.updatingSyncAgent = false;
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  private getSyncAgentConfigFile(): string {
    return `const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const configPath = process.env.CONFIG_FILE || '/etc/neopro/site.conf';

if (fs.existsSync(configPath)) {
  dotenv.config({ path: configPath });
}

dotenv.config({ path: path.join(__dirname, '../config/.env') });

const config = {
  central: {
    url: process.env.CENTRAL_SERVER_URL || 'http://localhost:3001',
    enabled: process.env.CENTRAL_SERVER_ENABLED === 'true',
  },

  site: {
    id: process.env.SITE_ID,
    apiKey: process.env.SITE_API_KEY,
    name: process.env.SITE_NAME,
    clubName: process.env.CLUB_NAME,
    location: {
      city: process.env.LOCATION_CITY,
      region: process.env.LOCATION_REGION,
      country: process.env.LOCATION_COUNTRY,
    },
    sports: process.env.SPORTS ? process.env.SPORTS.split(',') : [],
  },

  paths: {
    root: process.env.NEOPRO_ROOT || '/home/pi/neopro',
    videos: process.env.VIDEOS_PATH || '/home/pi/neopro/videos',
    config: process.env.CONFIG_PATH || '/home/pi/neopro/webapp/configuration.json',
    backup: process.env.BACKUP_PATH || '/home/pi/neopro/backups',
  },

  monitoring: {
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '300000'),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || '/home/pi/neopro/logs/sync-agent.log',
  },

  updates: {
    autoUpdateEnabled: process.env.AUTO_UPDATE_ENABLED === 'true',
    autoUpdateHour: parseInt(process.env.AUTO_UPDATE_HOUR || '3'),
  },

  security: {
    maxDownloadSize: parseInt(process.env.MAX_DOWNLOAD_SIZE || '1073741824'),
    allowedCommands: process.env.ALLOWED_COMMANDS
      ? process.env.ALLOWED_COMMANDS.split(',')
      : ['deploy_video', 'delete_video', 'update_software', 'update_config', 'reboot', 'restart_service', 'get_logs', 'get_config', 'update_hotspot', 'get_hotspot_config'],
  },
};

const validateConfig = () => {
  if (!config.central.enabled) {
    console.warn('⚠️  Central server disabled - agent will run in offline mode');
    return false;
  }

  if (!config.site.id || !config.site.apiKey) {
    console.error('❌ SITE_ID and SITE_API_KEY are required');
    console.error('Run: sudo node scripts/register-site.js');
    return false;
  }

  return true;
};

module.exports = { config, validateConfig };
`;
  }

  private getSyncAgentCommandsFile(): string {
    return `const deployVideo = require('./deploy-video');
const deleteVideo = require('./delete-video');
const updateSoftware = require('./update-software');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');
const { mergeConfigurations, createBackup, calculateConfigHash } = require('../utils/config-merge');

const execAsync = util.promisify(exec);

const commands = {
  deploy_video: deployVideo,
  delete_video: deleteVideo,
  update_software: updateSoftware,

  /**
   * Met à jour la configuration avec merge intelligent
   *
   * Modes supportés :
   * - mode: 'merge' (défaut) - Fusionne le contenu NEOPRO avec la config locale
   * - mode: 'replace' - Remplace entièrement (ancien comportement, pour migration)
   * - mode: 'update_agent' - Met à jour les fichiers du sync-agent (pour remote update)
   *
   * @param {Object} data - { neoProContent, mode?, configuration?, agentFiles? }
   */
  async update_config(data) {
    // Mode spécial : mise à jour des fichiers du sync-agent
    if (data.mode === 'update_agent' && data.agentFiles) {
      logger.info('Updating sync-agent files remotely');
      try {
        const syncAgentPath = config.paths.root + '/sync-agent';

        for (const [filePath, content] of Object.entries(data.agentFiles)) {
          const fullPath = syncAgentPath + '/' + filePath;
          const dir = require('path').dirname(fullPath);
          await fs.ensureDir(dir);
          await fs.writeFile(fullPath, content);
          logger.info('Updated sync-agent file', { path: filePath });
        }

        // Redémarrer le sync-agent pour appliquer les changements
        logger.info('Restarting sync-agent to apply updates...');
        // Utiliser spawn pour ne pas attendre (car le processus va se terminer)
        const { spawn } = require('child_process');
        spawn('sudo', ['systemctl', 'restart', 'neopro-sync-agent'], {
          detached: true,
          stdio: 'ignore'
        }).unref();

        return {
          success: true,
          message: 'Sync-agent files updated, restarting...',
          filesUpdated: Object.keys(data.agentFiles),
        };
      } catch (error) {
        logger.error('Failed to update sync-agent files:', error);
        throw error;
      }
    }

    logger.info('Updating configuration', { mode: data.mode || 'merge' });

    try {
      const configPath = config.paths.root + '/webapp/configuration.json';
      const backupPath = config.paths.root + '/webapp/configuration.backup.json';

      // Lire la configuration locale actuelle
      let localConfig = {};
      if (await fs.pathExists(configPath)) {
        const localContent = await fs.readFile(configPath, 'utf8');
        localConfig = JSON.parse(localContent);
      }

      // Créer un backup avant modification
      await fs.writeFile(backupPath, JSON.stringify(localConfig, null, 2));
      logger.info('Backup created', { path: backupPath });

      let finalConfig;

      if (data.mode === 'replace' && data.configuration) {
        // Mode legacy : remplacement complet (pour rétrocompatibilité)
        logger.warn('Using legacy replace mode - local changes may be lost');
        finalConfig = data.configuration;
      } else if (data.neoProContent) {
        // Mode merge : fusionner le contenu NEOPRO avec la config locale
        const hashBefore = calculateConfigHash(localConfig);
        finalConfig = mergeConfigurations(localConfig, data.neoProContent);
        const hashAfter = calculateConfigHash(finalConfig);

        logger.info('Configuration merged', {
          hashBefore,
          hashAfter,
          changed: hashBefore !== hashAfter,
        });
      } else if (data.configuration) {
        // Fallback : ancien format (remplacement)
        logger.warn('Legacy configuration format detected, using merge');
        finalConfig = mergeConfigurations(localConfig, data.configuration);
      } else {
        throw new Error('Missing neoProContent or configuration in update_config command');
      }

      // Écrire la configuration fusionnée
      const configJson = JSON.stringify(finalConfig, null, 2);
      await fs.writeFile(configPath, configJson);
      logger.info('Configuration written to', { path: configPath });

      // Notifier l'application locale du changement
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });
      socket.emit('config_updated');
      setTimeout(() => socket.close(), 1000);

      logger.info('Configuration updated successfully');

      return {
        success: true,
        hash: calculateConfigHash(finalConfig),
        mode: data.mode || 'merge',
      };
    } catch (error) {
      logger.error('Configuration update failed:', error);
      throw error;
    }
  },

  async reboot() {
    logger.warn('System reboot requested');

    setTimeout(async () => {
      try {
        await execAsync('sudo reboot');
      } catch (error) {
        logger.error('Reboot command failed:', error);
      }
    }, 2000);

    return { success: true, message: 'Rebooting in 2 seconds' };
  },

  async restart_service(data) {
    const { service, update } = data;

    logger.info('Restarting service', { service, update: !!update });

    try {
      // Si update=true ou si c'est le sync-agent, faire un git pull avant de redémarrer
      if (update || service === 'neopro-sync-agent') {
        const syncAgentPath = config.paths.root + '/sync-agent';
        try {
          logger.info('Updating sync-agent before restart...');
          await execAsync(\`cd \${syncAgentPath} && git pull\`);
          logger.info('Sync-agent updated successfully');
        } catch (gitError) {
          logger.warn('Git pull failed, continuing with restart:', gitError.message);
        }
      }

      await execAsync(\`sudo systemctl restart \${service}\`);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync(\`sudo systemctl is-active \${service}\`);

      if (stdout.trim() === 'active') {
        logger.info('Service restarted successfully', { service });
        return { success: true, status: 'active' };
      } else {
        throw new Error(\`Service \${service} is not active after restart\`);
      }
    } catch (error) {
      logger.error('Service restart failed:', error);
      throw error;
    }
  },

  async get_logs(data) {
    const { service, lines = 100 } = data;

    logger.info('Retrieving logs', { service, lines });

    try {
      let command;

      if (service === 'sync-agent') {
        command = \`tail -n \${lines} \${config.logging.path}\`;
      } else {
        command = \`sudo journalctl -u \${service} -n \${lines} --no-pager\`;
      }

      const { stdout } = await execAsync(command);

      return {
        success: true,
        logs: stdout,
      };
    } catch (error) {
      logger.error('Failed to retrieve logs:', error);
      throw error;
    }
  },

  async get_system_info() {
    logger.info('Retrieving system information');

    try {
      const metricsCollector = require('../metrics');
      const systemInfo = await metricsCollector.getSystemInfo();
      const networkStatus = await metricsCollector.getNetworkStatus();
      const metrics = await metricsCollector.collectAll();

      return {
        success: true,
        systemInfo,
        networkStatus,
        metrics,
      };
    } catch (error) {
      logger.error('Failed to retrieve system info:', error);
      throw error;
    }
  },

  async get_config() {
    logger.info('Retrieving site configuration');

    try {
      // Single source of truth: webapp/configuration.json (served by app :8080)
      const configPath = config.paths.root + '/webapp/configuration.json';

      if (!await fs.pathExists(configPath)) {
        logger.warn('Configuration file not found', { configPath });
        return {
          success: true,
          configuration: null,
          message: 'No configuration file found',
        };
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const configuration = JSON.parse(configContent);

      logger.info('Configuration retrieved successfully', { path: configPath });

      return {
        success: true,
        configuration,
      };
    } catch (error) {
      logger.error('Failed to retrieve configuration:', error);
      throw error;
    }
  },

  /**
   * Met à jour la configuration du hotspot WiFi (SSID et mot de passe)
   * Modifie /etc/hostapd/hostapd.conf et redémarre le service hostapd
   *
   * @param {Object} data - { ssid?, password? }
   */
  async update_hotspot(data) {
    const { ssid, password } = data;

    logger.info('Updating hotspot configuration', { ssid: ssid || '(unchanged)' });

    if (!ssid && !password) {
      throw new Error('At least one of ssid or password must be provided');
    }

    // Validation du mot de passe WiFi (WPA2 requiert 8-63 caractères)
    if (password && (password.length < 8 || password.length > 63)) {
      throw new Error('WiFi password must be between 8 and 63 characters');
    }

    // Validation du SSID (max 32 caractères)
    if (ssid && ssid.length > 32) {
      throw new Error('SSID must be 32 characters or less');
    }

    const hostapdPath = '/etc/hostapd/hostapd.conf';
    const backupPath = '/etc/hostapd/hostapd.conf.backup';

    try {
      // Vérifier que hostapd.conf existe
      if (!await fs.pathExists(hostapdPath)) {
        throw new Error('hostapd.conf not found - hotspot not configured on this device');
      }

      // Lire la configuration actuelle
      let hostapdContent = await fs.readFile(hostapdPath, 'utf8');

      // Créer un backup
      await execAsync(\`sudo cp \${hostapdPath} \${backupPath}\`);
      logger.info('Backup created', { path: backupPath });

      // Modifier le SSID si fourni
      if (ssid) {
        hostapdContent = hostapdContent.replace(/^ssid=.*/m, \`ssid=\${ssid}\`);
        logger.info('SSID updated', { ssid });
      }

      // Modifier le mot de passe si fourni
      if (password) {
        hostapdContent = hostapdContent.replace(/^wpa_passphrase=.*/m, \`wpa_passphrase=\${password}\`);
        logger.info('WiFi password updated');
      }

      // Écrire la nouvelle configuration (via sudo car fichier root)
      const tempPath = '/tmp/hostapd.conf.tmp';
      await fs.writeFile(tempPath, hostapdContent);
      await execAsync(\`sudo mv \${tempPath} \${hostapdPath}\`);
      await execAsync(\`sudo chmod 600 \${hostapdPath}\`);

      // Redémarrer hostapd pour appliquer les changements
      logger.info('Restarting hostapd service...');
      await execAsync('sudo systemctl restart hostapd');

      // Attendre que le service soit actif
      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync('sudo systemctl is-active hostapd');
      const isActive = stdout.trim() === 'active';

      if (!isActive) {
        // Restaurer le backup si le service ne démarre pas
        logger.error('hostapd failed to start, restoring backup');
        await execAsync(\`sudo cp \${backupPath} \${hostapdPath}\`);
        await execAsync('sudo systemctl restart hostapd');
        throw new Error('Failed to restart hostapd with new configuration - backup restored');
      }

      logger.info('Hotspot configuration updated successfully');

      return {
        success: true,
        message: 'Hotspot configuration updated',
        ssidUpdated: !!ssid,
        passwordUpdated: !!password,
      };
    } catch (error) {
      logger.error('Hotspot update failed:', error);
      throw error;
    }
  },

  /**
   * Récupère la configuration actuelle du hotspot (SSID uniquement, pas le mot de passe)
   */
  async get_hotspot_config() {
    logger.info('Retrieving hotspot configuration');

    const hostapdPath = '/etc/hostapd/hostapd.conf';

    try {
      if (!await fs.pathExists(hostapdPath)) {
        return {
          success: true,
          configured: false,
          message: 'Hotspot not configured on this device',
        };
      }

      const hostapdContent = await fs.readFile(hostapdPath, 'utf8');

      // Extraire le SSID
      const ssidMatch = hostapdContent.match(/^ssid=(.*)$/m);
      const ssid = ssidMatch ? ssidMatch[1] : null;

      // Extraire le channel
      const channelMatch = hostapdContent.match(/^channel=(.*)$/m);
      const channel = channelMatch ? parseInt(channelMatch[1]) : null;

      // Vérifier si hostapd est actif
      let isActive = false;
      try {
        const { stdout } = await execAsync('sudo systemctl is-active hostapd');
        isActive = stdout.trim() === 'active';
      } catch {
        isActive = false;
      }

      return {
        success: true,
        configured: true,
        ssid,
        channel,
        isActive,
      };
    } catch (error) {
      logger.error('Failed to retrieve hotspot config:', error);
      throw error;
    }
  },
};

module.exports = commands;
`;
  }
}
