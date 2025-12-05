import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SitesService } from '../../core/services/sites.service';
import { Site, Metrics } from '../../core/models';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container" *ngIf="site; else loading">
      <div class="page-header">
        <button class="btn btn-secondary" routerLink="/sites">← Retour</button>
        <h1>{{ site.club_name }}</h1>
        <span class="badge" [class]="'badge-' + getStatusBadge(site.status)">
          {{ site.status }}
        </span>
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
        <div class="actions-grid">
          <button class="action-card" (click)="restartService('neopro-app')" [disabled]="site.status !== 'online'">
            <span class="action-icon">🔄</span>
            <div class="action-content">
              <div class="action-title">Redémarrer l'app</div>
              <div class="action-desc">Redémarre le service NEOPRO</div>
            </div>
          </button>

          <button class="action-card" (click)="getLogs()" [disabled]="site.status !== 'online'">
            <span class="action-icon">📄</span>
            <div class="action-content">
              <div class="action-title">Voir les logs</div>
              <div class="action-desc">Récupère les logs récents</div>
            </div>
          </button>

          <button class="action-card" (click)="getSystemInfo()" [disabled]="site.status !== 'online'">
            <span class="action-icon">ℹ️</span>
            <div class="action-content">
              <div class="action-title">Infos système</div>
              <div class="action-desc">Détails matériel et réseau</div>
            </div>
          </button>

          <button class="action-card warning" (click)="rebootSite()" [disabled]="site.status !== 'online'">
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

      <!-- Configuration du site -->
      <div class="card">
        <div class="card-header-row">
          <h3>Configuration du site</h3>
          <button class="btn btn-primary" (click)="showConfigEditor = !showConfigEditor" [disabled]="site.status !== 'online'">
            {{ showConfigEditor ? 'Fermer' : 'Modifier la configuration' }}
          </button>
        </div>
        <div *ngIf="showConfigEditor" class="config-editor">
          <div class="config-warning">
            Modifiez la configuration JSON du site. Les changements seront appliqués immédiatement.
          </div>
          <textarea
            class="config-textarea"
            [(ngModel)]="configJson"
            [placeholder]="configPlaceholder"
            rows="20"
          ></textarea>
          <div class="config-actions">
            <button class="btn btn-secondary" (click)="formatConfig()">Formater JSON</button>
            <button class="btn btn-secondary" (click)="validateConfig()">Valider</button>
            <button class="btn btn-primary" (click)="deployConfig()" [disabled]="!isConfigValid || sendingCommand">
              {{ sendingCommand ? 'Envoi en cours...' : 'Deployer la configuration' }}
            </button>
          </div>
          <div *ngIf="configError" class="config-error">{{ configError }}</div>
          <div *ngIf="configSuccess" class="config-success">{{ configSuccess }}</div>
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

    .config-editor {
      margin-top: 1rem;
    }

    .config-warning {
      padding: 0.75rem 1rem;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      color: #92400e;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .config-textarea {
      width: 100%;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      resize: vertical;
      min-height: 300px;
    }

    .config-textarea:focus {
      outline: none;
      border-color: #2563eb;
      background: white;
    }

    .config-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .config-error {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #fef2f2;
      border: 1px solid #ef4444;
      border-radius: 6px;
      color: #b91c1c;
      font-size: 0.875rem;
    }

    .config-success {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #ecfdf5;
      border: 1px solid #10b981;
      border-radius: 6px;
      color: #065f46;
      font-size: 0.875rem;
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

  // Configuration editor
  showConfigEditor = false;
  configJson = '';
  configError = '';
  configSuccess = '';
  isConfigValid = false;
  sendingCommand = false;

  configPlaceholder = `{
  "remote": {
    "title": "Telecommande Neopro - MON_CLUB"
  },
  "auth": {
    "password": "MotDePasseWiFi",
    "clubName": "MON_CLUB",
    "sessionDuration": 28800000
  },
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central-server.onrender.com",
    "siteName": "ID_SITE",
    "clubName": "MON_CLUB"
  },
  "version": "1.0",
  "sponsors": [],
  "categories": []
}`;

  private refreshSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private sitesService: SitesService
  ) {}

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadSite();
    this.loadMetrics();

    // Auto-refresh toutes les 30 secondes
    this.refreshSubscription = interval(30000).subscribe(() => {
      if (this.site?.status === 'online') {
        this.loadMetrics();
      }
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
        alert('Erreur: ' + (error.error?.error || error.message));
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
    if (confirm(`Redemarrer le service ${service} ?`)) {
      this.sendingCommand = true;
      this.sitesService.sendCommand(this.siteId, 'restart_service', { service }).subscribe({
        next: (response) => {
          this.sendingCommand = false;
          alert(`Commande envoyee ! ID: ${response.commandId}`);
        },
        error: (error) => {
          this.sendingCommand = false;
          alert('Erreur: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  getLogs(): void {
    this.sendingCommand = true;
    this.sitesService.sendCommand(this.siteId, 'get_logs', { service: 'neopro-app', lines: 100 }).subscribe({
      next: (response) => {
        this.sendingCommand = false;
        alert(`Commande envoyee ! Les logs seront disponibles sous peu. ID: ${response.commandId}`);
      },
      error: (error) => {
        this.sendingCommand = false;
        alert('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  getSystemInfo(): void {
    this.sendingCommand = true;
    this.sitesService.sendCommand(this.siteId, 'get_system_info', {}).subscribe({
      next: (response) => {
        this.sendingCommand = false;
        alert(`Commande envoyee ! ID: ${response.commandId}`);
      },
      error: (error) => {
        this.sendingCommand = false;
        alert('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  rebootSite(): void {
    if (confirm('Etes-vous sur de vouloir redemarrer le Raspberry Pi ?')) {
      this.sendingCommand = true;
      this.sitesService.sendCommand(this.siteId, 'reboot', {}).subscribe({
        next: (response) => {
          this.sendingCommand = false;
          alert(`Commande de redemarrage envoyee ! Le site sera temporairement hors ligne.`);
        },
        error: (error) => {
          this.sendingCommand = false;
          alert('Erreur: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  regenerateApiKey(): void {
    if (confirm('Regenerer la cle API ? L\'ancienne cle ne fonctionnera plus.')) {
      this.sitesService.regenerateApiKey(this.siteId).subscribe({
        next: (site) => {
          this.site = site;
          alert('Cle API regeneree avec succes !');
        },
        error: (error) => {
          alert('Erreur: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  copyApiKey(): void {
    if (this.site?.api_key) {
      navigator.clipboard.writeText(this.site.api_key);
      alert('Cle API copiee !');
    }
  }

  // Configuration editor methods
  formatConfig(): void {
    this.configError = '';
    this.configSuccess = '';
    try {
      const parsed = JSON.parse(this.configJson);
      this.configJson = JSON.stringify(parsed, null, 2);
      this.isConfigValid = true;
      this.configSuccess = 'JSON formate avec succes';
    } catch (e: any) {
      this.configError = `Erreur de syntaxe JSON: ${e.message}`;
      this.isConfigValid = false;
    }
  }

  validateConfig(): void {
    this.configError = '';
    this.configSuccess = '';
    try {
      const parsed = JSON.parse(this.configJson);

      // Validation basique de la structure
      if (!parsed.auth) {
        throw new Error('La section "auth" est requise');
      }
      if (!parsed.auth.clubName) {
        throw new Error('Le champ "auth.clubName" est requis');
      }

      this.isConfigValid = true;
      this.configSuccess = 'Configuration valide !';
    } catch (e: any) {
      this.configError = e.message;
      this.isConfigValid = false;
    }
  }

  deployConfig(): void {
    if (!this.isConfigValid) {
      this.validateConfig();
      if (!this.isConfigValid) return;
    }

    this.configError = '';
    this.configSuccess = '';

    try {
      const configuration = JSON.parse(this.configJson);

      if (!confirm('Deployer cette configuration sur le site ? Les changements seront appliques immediatement.')) {
        return;
      }

      this.sendingCommand = true;
      this.sitesService.sendCommand(this.siteId, 'update_config', { configuration }).subscribe({
        next: (response) => {
          this.sendingCommand = false;
          this.configSuccess = `Configuration deployee avec succes ! ID: ${response.commandId}`;
        },
        error: (error) => {
          this.sendingCommand = false;
          this.configError = 'Erreur: ' + (error.error?.error || error.message);
        }
      });
    } catch (e: any) {
      this.configError = `Erreur JSON: ${e.message}`;
    }
  }
}
