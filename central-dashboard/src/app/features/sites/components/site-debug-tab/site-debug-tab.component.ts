import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { LocalVideo, LocalStorage, ConfigHistory, SiteConfiguration } from '../../../../core/models';
import { CommandExecutorComponent } from '../command-executor/command-executor.component';

// Types pour le health status
interface GpuInfo {
  gpu_mem_mb: number | null;
  gpu_mem_warning: boolean;
  temperature: number | null;
  temperature_warning: boolean;
  throttled: string | null;
  throttled_flags: string[];
  voltage_ok: boolean;
  frequency_capped: boolean;
  throttling_active: boolean;
}

interface ServiceStatus {
  name: string;
  description: string;
  status: string;
  active: boolean;
  failed: boolean;
  lastError?: string | null;
}

interface HealthIssue {
  severity: 'critical' | 'warning';
  component: string;
  message: string;
  fix: string;
  lastError?: string | null;
}

interface HealthStatus {
  success: boolean;
  timestamp: string;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  issues: HealthIssue[];
  gpu: GpuInfo;
  services: ServiceStatus[];
  metrics: {
    cpu: number;
    memory: number;
    temperature: number;
    disk: number;
    uptime: number;
    localIp: string | null;
  } | null;
  system: {
    hostname: string;
    os: string;
    uptime: number;
    localIp: string | null;
  };
  error?: string;
}

interface DiagnosticCheck {
  category: string;
  name: string;
  status: 'ok' | 'fail' | 'warning' | 'unknown';
  value: string;
  warning?: string | null;
}

interface DiagnosticsResult {
  success: boolean;
  timestamp: string;
  output?: string;
  checks?: DiagnosticCheck[];
  errors?: string | null;
}

interface ConfigDiff {
  field: string;
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

// Type pour la santé de la connexion (P1.4)
interface ConnectionHealth {
  socketInMap: boolean;
  socketConnected: boolean;
  lastPongAgeMs: number | null;
  isHealthy: boolean;
  reason: string;
}

// Types pour les diagnostics réseau (P2.2)
interface NetworkDiagnostics {
  success: boolean;
  timestamp: string;
  internet?: {
    reachable: boolean;
    latency_ms: number | null;
    packet_loss_percent: number | null;
  };
  dns?: {
    working: boolean;
    resolution_ms: number | null;
  };
  gateway?: {
    ip: string | null;
    reachable: boolean;
  };
  central_server?: {
    reachable: boolean;
    latency_ms: number | null;
  };
  wifi?: {
    connected: boolean;
    ssid: string | null;
    quality_percent: number | null;
    signal_dbm: number | null;
    bitrate_mbps: number | null;
  };
}

// Types pour le buffer analytics (P2.3)
interface BufferInfo {
  file_exists: boolean;
  event_count: number;
  file_size_bytes: number;
  oldest_event: string | null;
  newest_event: string | null;
}

interface BufferStatus {
  success: boolean;
  timestamp: string;
  analytics: BufferInfo;
  sponsors: BufferInfo;
}

// Types pour le hotspot (P2.4)
interface HotspotCheck {
  name: string;
  status: 'ok' | 'fail' | 'warning';
  value: string;
}

interface HotspotResult {
  success: boolean;
  timestamp: string;
  autoFix?: boolean;
  output?: string;
  checks?: HotspotCheck[];
  manual?: boolean;
}

@Component({
  selector: 'app-site-debug-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CommandExecutorComponent],
  template: `
    <div class="debug-tab">
      <!-- Fichiers sur le Pi -->
      <div class="debug-card">
        <div class="debug-header" (click)="showFiles = !showFiles">
          <span class="expand-icon">{{ showFiles ? '▼' : '▶' }}</span>
          <span class="debug-icon">📂</span>
          <h4>Fichiers sur le Pi</h4>
          <span class="debug-stats" *ngIf="localVideos.length > 0">
            {{ localVideos.length }} fichiers | {{ formatBytes(getTotalSize()) }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showFiles">
          <div class="storage-bar" *ngIf="localStorage">
            <div class="storage-info">
              <span>{{ formatBytes(localStorage.used) }} utilisé sur {{ formatBytes(localStorage.total) }}</span>
              <span>{{ formatBytes(localStorage.free) }} libre</span>
            </div>
            <div class="storage-progress">
              <div class="storage-fill" [style.width.%]="getStoragePercent()"></div>
            </div>
          </div>

          <div class="files-list" *ngIf="localVideos.length > 0">
            <div class="file-row header">
              <span class="file-name">Fichier</span>
              <span class="file-category">Catégorie</span>
              <span class="file-size">Taille</span>
            </div>
            <div class="file-row" *ngFor="let video of localVideos">
              <span class="file-name" [title]="video.path">{{ video.filename }}</span>
              <span class="file-category">{{ video.category || '-' }}</span>
              <span class="file-size">{{ formatBytes(video.size) }}</span>
            </div>
          </div>
          <p class="empty-hint" *ngIf="localVideos.length === 0">
            Aucun fichier synchronisé. Le boîtier doit être connecté pour remonter sa liste de fichiers.
          </p>

          <div class="sync-info" *ngIf="lastVideoSync">
            <span class="sync-label">Dernière synchronisation:</span>
            <span class="sync-value">{{ lastVideoSync | date:'dd/MM/yyyy HH:mm' }}</span>
          </div>
        </div>
      </div>

      <!-- Santé Système (P1.1 - GPU, température, throttling, services) -->
      <div class="debug-card">
        <div class="debug-header" (click)="toggleHealthStatus()">
          <span class="expand-icon">{{ showHealthStatus ? '▼' : '▶' }}</span>
          <span class="debug-icon">🩺</span>
          <h4>Santé système</h4>
          <span class="debug-stats" *ngIf="healthStatus"
            [class.health-ok]="healthStatus.healthStatus === 'healthy'"
            [class.health-warning]="healthStatus.healthStatus === 'degraded'"
            [class.health-critical]="healthStatus.healthStatus === 'critical'">
            {{ healthStatus.healthScore }}% - {{ getHealthStatusLabel(healthStatus.healthStatus) }}
          </span>
          <span class="debug-stats" *ngIf="!healthStatus && !loadingHealthStatus">Non chargé</span>
          <span class="debug-stats" *ngIf="loadingHealthStatus">Chargement...</span>
        </div>

        <div class="debug-content" *ngIf="showHealthStatus">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour récupérer l'état de santé.
          </div>

          <div *ngIf="isConnected && !healthStatus && !loadingHealthStatus" class="health-actions">
            <button class="btn btn-primary btn-sm" (click)="loadHealthStatus()">
              🔄 Charger l'état de santé
            </button>
          </div>

          <div *ngIf="loadingHealthStatus" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Récupération des données...</span>
          </div>

          <div *ngIf="healthStatus" class="health-content">
            <!-- Score global -->
            <div class="health-score-card" [class.score-healthy]="healthStatus.healthScore >= 80"
              [class.score-degraded]="healthStatus.healthScore >= 50 && healthStatus.healthScore < 80"
              [class.score-critical]="healthStatus.healthScore < 50">
              <div class="score-circle">
                <span class="score-value">{{ healthStatus.healthScore }}</span>
                <span class="score-label">/ 100</span>
              </div>
              <div class="score-info">
                <span class="score-status">{{ getHealthStatusLabel(healthStatus.healthStatus) }}</span>
                <span class="score-time">{{ healthStatus.timestamp | date:'HH:mm:ss' }}</span>
              </div>
              <button class="btn btn-secondary btn-sm refresh-btn" (click)="loadHealthStatus()" [disabled]="loadingHealthStatus">
                🔄
              </button>
            </div>

            <!-- Alertes/Issues -->
            <div *ngIf="healthStatus.issues && healthStatus.issues.length > 0" class="health-issues">
              <h5>⚠️ Problèmes détectés ({{ healthStatus.issues.length }})</h5>
              <div class="issue-item" *ngFor="let issue of healthStatus.issues"
                [class.issue-critical]="issue.severity === 'critical'"
                [class.issue-warning]="issue.severity === 'warning'">
                <div class="issue-header">
                  <span class="issue-badge">{{ issue.severity === 'critical' ? '🔴' : '🟡' }} {{ issue.component }}</span>
                </div>
                <div class="issue-message">{{ issue.message }}</div>
                <div class="issue-fix">💡 {{ issue.fix }}</div>
              </div>
            </div>

            <!-- GPU Info -->
            <div class="health-section" *ngIf="healthStatus.gpu">
              <h5>🎮 GPU</h5>
              <div class="health-grid">
                <div class="health-metric" [class.metric-warning]="healthStatus.gpu.gpu_mem_warning">
                  <span class="metric-label">Mémoire GPU</span>
                  <span class="metric-value">
                    {{ healthStatus.gpu.gpu_mem_mb !== null ? healthStatus.gpu.gpu_mem_mb + 'M' : 'N/A' }}
                    <span class="metric-hint" *ngIf="healthStatus.gpu.gpu_mem_warning">⚠️ Min: 128M</span>
                  </span>
                </div>
                <div class="health-metric" [class.metric-warning]="healthStatus.gpu.temperature_warning">
                  <span class="metric-label">Température</span>
                  <span class="metric-value">
                    {{ healthStatus.gpu.temperature !== null ? healthStatus.gpu.temperature + '°C' : 'N/A' }}
                    <span class="metric-hint" *ngIf="healthStatus.gpu.temperature_warning">🔥 Élevée</span>
                  </span>
                </div>
                <div class="health-metric" [class.metric-warning]="!healthStatus.gpu.voltage_ok">
                  <span class="metric-label">Alimentation</span>
                  <span class="metric-value">
                    {{ healthStatus.gpu.voltage_ok ? '✅ OK' : '⚠️ Sous-voltage' }}
                  </span>
                </div>
                <div class="health-metric" [class.metric-warning]="healthStatus.gpu.throttling_active">
                  <span class="metric-label">Throttling</span>
                  <span class="metric-value">
                    {{ healthStatus.gpu.throttled === '0x0' ? '✅ ' + ('debug.noThrottling' | translate) : healthStatus.gpu.throttled || 'N/A' }}
                  </span>
                </div>
              </div>
              <div class="throttle-flags" *ngIf="healthStatus.gpu.throttled_flags && healthStatus.gpu.throttled_flags.length > 0">
                <span class="flag-item" *ngFor="let flag of healthStatus.gpu.throttled_flags">{{ flag }}</span>
              </div>
            </div>

            <!-- Services -->
            <div class="health-section" *ngIf="healthStatus.services && healthStatus.services.length > 0">
              <h5>⚙️ Services systemd</h5>
              <div class="services-grid">
                <div class="service-item" *ngFor="let svc of healthStatus.services"
                  [class.service-active]="svc.active"
                  [class.service-failed]="svc.failed"
                  [class.service-inactive]="!svc.active && !svc.failed">
                  <span class="service-status">{{ svc.active ? '✅' : svc.failed ? '❌' : '⚪' }}</span>
                  <span class="service-name">{{ svc.name }}</span>
                  <span class="service-desc">{{ svc.description }}</span>
                </div>
              </div>
            </div>

            <!-- Métriques système -->
            <div class="health-section" *ngIf="healthStatus.metrics">
              <h5>📊 Ressources</h5>
              <div class="health-grid">
                <div class="health-metric">
                  <span class="metric-label">CPU</span>
                  <span class="metric-value">{{ healthStatus.metrics.cpu }}%</span>
                </div>
                <div class="health-metric" [class.metric-warning]="healthStatus.metrics.memory > 90">
                  <span class="metric-label">Mémoire</span>
                  <span class="metric-value">{{ healthStatus.metrics.memory }}%</span>
                </div>
                <div class="health-metric" [class.metric-warning]="healthStatus.metrics.disk > 90">
                  <span class="metric-label">Disque</span>
                  <span class="metric-value">{{ healthStatus.metrics.disk }}%</span>
                </div>
                <div class="health-metric">
                  <span class="metric-label">Uptime</span>
                  <span class="metric-value">{{ formatUptime(healthStatus.metrics.uptime) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Diagnostic complet (P1.2) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showDiagnostics = !showDiagnostics">
          <span class="expand-icon">{{ showDiagnostics ? '▼' : '▶' }}</span>
          <span class="debug-icon">🔍</span>
          <h4>Diagnostic complet</h4>
          <span class="debug-stats" *ngIf="diagnosticsResult">
            {{ getDiagnosticsOkCount() }}/{{ diagnosticsResult.checks?.length || 0 }} OK
          </span>
        </div>

        <div class="debug-content" *ngIf="showDiagnostics">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour lancer un diagnostic.
          </div>

          <div class="diagnostics-actions" *ngIf="isConnected">
            <button class="btn btn-primary" (click)="runDiagnostics()" [disabled]="runningDiagnostics">
              {{ runningDiagnostics ? '⏳ Diagnostic en cours...' : '🔍 Lancer le diagnostic complet' }}
            </button>
            <p class="diagnostics-hint">Exécute le script diagnose-pi.sh et retourne un rapport complet</p>
          </div>

          <div *ngIf="runningDiagnostics" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Exécution du diagnostic (peut prendre jusqu'à 60 secondes)...</span>
          </div>

          <div *ngIf="diagnosticsResult && !runningDiagnostics" class="diagnostics-result">
            <div class="diagnostics-header">
              <span class="diagnostics-time">{{ diagnosticsResult.timestamp | date:'dd/MM/yyyy HH:mm:ss' }}</span>
            </div>

            <!-- Affichage structuré des checks -->
            <div *ngIf="diagnosticsResult.checks && diagnosticsResult.checks.length > 0" class="checks-list">
              <div *ngFor="let category of getDiagnosticsCategories()" class="check-category">
                <h6>{{ category }}</h6>
                <div class="check-items">
                  <div *ngFor="let check of getChecksByCategory(category)" class="check-item"
                    [class.check-ok]="check.status === 'ok'"
                    [class.check-fail]="check.status === 'fail'"
                    [class.check-warning]="check.status === 'warning'">
                    <span class="check-status">{{ check.status === 'ok' ? '✅' : check.status === 'fail' ? '❌' : '⚠️' }}</span>
                    <span class="check-name">{{ check.name }}</span>
                    <span class="check-value">{{ check.value }}</span>
                    <span class="check-warn" *ngIf="check.warning">{{ check.warning }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sortie brute si script exécuté -->
            <div *ngIf="diagnosticsResult.output" class="diagnostics-output">
              <h6>Sortie du script</h6>
              <pre class="output-viewer">{{ diagnosticsResult.output }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration JSON -->
      <div class="debug-card">
        <div class="debug-header" (click)="showJson = !showJson">
          <span class="expand-icon">{{ showJson ? '▼' : '▶' }}</span>
          <span class="debug-icon">📋</span>
          <h4>Configuration JSON</h4>
          <span class="debug-stats" *ngIf="configHash">Hash: {{ configHash.substring(0, 8) }}...</span>
        </div>

        <div class="debug-content" *ngIf="showJson">
          <div class="json-actions">
            <button class="btn btn-secondary btn-sm" (click)="copyJson()">📋 Copier</button>
            <button class="btn btn-secondary btn-sm" (click)="downloadJson()">💾 Télécharger</button>
          </div>
          <pre class="json-viewer">{{ configJson }}</pre>
        </div>
      </div>

      <!-- Historique des configurations (P1.3 - avec diff visuel) -->
      <div class="debug-card">
        <div class="debug-header" (click)="toggleHistory()">
          <span class="expand-icon">{{ showHistory ? '▼' : '▶' }}</span>
          <span class="debug-icon">📜</span>
          <h4>Historique des configurations</h4>
          <span class="debug-stats" *ngIf="historyTotal > 0">{{ historyTotal }} version(s)</span>
        </div>

        <div class="debug-content" *ngIf="showHistory">
          <div *ngIf="loadingHistory" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Chargement...</span>
          </div>

          <div *ngIf="!loadingHistory && history.length === 0" class="empty-hint">
            Aucun historique. L'historique sera créé lors du premier déploiement.
          </div>

          <!-- Mode comparaison -->
          <div *ngIf="compareMode && !loadingHistory && history.length > 1" class="compare-mode-bar">
            <span class="compare-info">
              {{ selectedForCompare.length }}/2 versions sélectionnées
            </span>
            <button class="btn btn-primary btn-sm" (click)="executeCompare()"
              [disabled]="selectedForCompare.length !== 2 || loadingDiff">
              {{ loadingDiff ? 'Comparaison...' : '🔍 Comparer' }}
            </button>
            <button class="btn btn-secondary btn-sm" (click)="cancelCompareMode()">Annuler</button>
          </div>

          <div class="history-list" *ngIf="!loadingHistory && history.length > 0">
            <!-- Bouton pour activer le mode comparaison -->
            <div class="history-actions" *ngIf="history.length > 1 && !compareMode">
              <button class="btn btn-secondary btn-sm" (click)="startCompareMode()">
                🔀 Comparer des versions
              </button>
            </div>

            <div
              class="history-item"
              *ngFor="let item of history; let i = index"
              [class.selected]="selectedHistoryId === item.id"
              [class.compare-selected]="isSelectedForCompare(item.id)"
            >
              <!-- Checkbox en mode comparaison -->
              <div class="compare-checkbox" *ngIf="compareMode">
                <input type="checkbox"
                  [checked]="isSelectedForCompare(item.id)"
                  (change)="toggleCompareSelection(item.id)"
                  [disabled]="!isSelectedForCompare(item.id) && selectedForCompare.length >= 2">
              </div>

              <div class="history-item-main">
                <div class="history-item-date">{{ item.deployed_at | date:'dd/MM/yyyy HH:mm' }}</div>
                <div class="history-item-user">{{ item.deployed_by_email || 'Système' }}</div>
                <div class="history-item-comment" *ngIf="item.comment">{{ item.comment }}</div>
                <!-- Indicateur de changements -->
                <div class="history-item-changes" *ngIf="item.changes_summary && item.changes_summary.length > 0">
                  <span class="changes-badge">{{ item.changes_summary.length }} changement(s)</span>
                </div>
              </div>
              <div class="history-item-actions" *ngIf="!compareMode">
                <button class="btn btn-secondary btn-sm" (click)="viewVersion(item)">Voir</button>
                <button class="btn btn-secondary btn-sm" (click)="viewVersionDiff(item, i)"
                  *ngIf="i < history.length - 1" title="Voir les changements depuis la version précédente">
                  Diff
                </button>
                <button class="btn btn-primary btn-sm" (click)="restoreVersion(item)" [disabled]="restoringVersion">
                  {{ restoringVersion === item.id ? 'Restauration...' : 'Restaurer' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Version viewer modal -->
          <div class="version-modal" *ngIf="viewingVersion && !viewingDiff">
            <div class="version-modal-header">
              <h5>Version du {{ viewingVersion.deployed_at | date:'dd/MM/yyyy HH:mm' }}</h5>
              <button class="btn-close" (click)="viewingVersion = null">×</button>
            </div>
            <div class="version-modal-body">
              <pre class="json-viewer">{{ viewingVersionJson }}</pre>
            </div>
          </div>

          <!-- Diff viewer modal (P1.3) -->
          <div class="diff-modal" *ngIf="viewingDiff">
            <div class="diff-modal-header">
              <h5>Différences</h5>
              <div class="diff-versions">
                <span class="diff-version old">{{ diffVersionOld | date:'dd/MM HH:mm' }}</span>
                <span class="diff-arrow">→</span>
                <span class="diff-version new">{{ diffVersionNew | date:'dd/MM HH:mm' }}</span>
              </div>
              <button class="btn-close" (click)="closeDiffView()">×</button>
            </div>
            <div class="diff-modal-body">
              <div *ngIf="loadingDiff" class="loading-inline">
                <div class="spinner-small"></div>
                <span>Calcul des différences...</span>
              </div>

              <div *ngIf="!loadingDiff && configDiff.length === 0" class="empty-hint">
                Aucune différence détectée entre ces deux versions.
              </div>

              <div *ngIf="!loadingDiff && configDiff.length > 0" class="diff-list">
                <div class="diff-summary">
                  <span class="diff-count added">{{ getDiffCountByType('added') }} ajouté(s)</span>
                  <span class="diff-count removed">{{ getDiffCountByType('removed') }} supprimé(s)</span>
                  <span class="diff-count changed">{{ getDiffCountByType('changed') }} modifié(s)</span>
                </div>

                <div class="diff-item" *ngFor="let diff of configDiff"
                  [class.diff-added]="diff.type === 'added'"
                  [class.diff-removed]="diff.type === 'removed'"
                  [class.diff-changed]="diff.type === 'changed'">
                  <div class="diff-item-header">
                    <span class="diff-type-badge">
                      {{ diff.type === 'added' ? '➕' : diff.type === 'removed' ? '➖' : '✏️' }}
                    </span>
                    <span class="diff-path">{{ diff.path }}</span>
                  </div>
                  <div class="diff-item-content">
                    <div class="diff-old" *ngIf="diff.type !== 'added' && diff.oldValue !== undefined">
                      <span class="diff-label">Avant:</span>
                      <code>{{ formatDiffValue(diff.oldValue) }}</code>
                    </div>
                    <div class="diff-new" *ngIf="diff.type !== 'removed' && diff.newValue !== undefined">
                      <span class="diff-label">Après:</span>
                      <code>{{ formatDiffValue(diff.newValue) }}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Terminal & Commandes (fusionné P3.2) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showTerminal = !showTerminal">
          <span class="expand-icon">{{ showTerminal ? '▼' : '▶' }}</span>
          <span class="debug-icon">💻</span>
          <h4>Terminal & Commandes</h4>
          <span class="debug-stats"
            [class.connected]="isConnected && isConnectionHealthy()"
            [class.disconnected]="!isConnected"
            [class.zombie]="isConnected && !isConnectionHealthy()">
            {{ getConnectionStatusText() }}
          </span>
        </div>

        <div class="debug-content always-visible" *ngIf="showTerminal">
          <!-- Alerte connexion zombie (P1.4) -->
          <div *ngIf="isConnected && connectionHealth && !connectionHealth.isHealthy" class="zombie-warning">
            <div class="zombie-header">
              <span class="zombie-icon">⚠️</span>
              <span class="zombie-title">Connexion instable détectée</span>
            </div>
            <div class="zombie-details">
              <div class="zombie-info">
                <span class="zombie-label">État:</span>
                <span class="zombie-value">{{ getZombieReasonText() }}</span>
              </div>
              <div class="zombie-info" *ngIf="connectionHealth.lastPongAgeMs !== null">
                <span class="zombie-label">Dernier pong:</span>
                <span class="zombie-value">il y a {{ formatPongAge(connectionHealth.lastPongAgeMs) }}</span>
              </div>
              <div class="zombie-info">
                <span class="zombie-label">Socket dans la map:</span>
                <span class="zombie-value">{{ connectionHealth.socketInMap ? 'Oui' : 'Non' }}</span>
              </div>
              <div class="zombie-info">
                <span class="zombie-label">Socket connectée:</span>
                <span class="zombie-value">{{ connectionHealth.socketConnected ? 'Oui' : 'Non' }}</span>
              </div>
            </div>
            <div class="zombie-hint">
              💡 Le boîtier est peut-être en train de se reconnecter. Les commandes temps réel peuvent échouer.
              Essayez de redémarrer le sync-agent ou le boîtier si le problème persiste.
            </div>
          </div>

          <!-- Commandes rapides -->
          <div class="quick-commands" *ngIf="isConnected">
            <div class="quick-commands-label">Commandes rapides:</div>
            <div class="quick-commands-buttons">
              <button class="btn btn-warning btn-xs" (click)="executeCommand('fix_permissions')" [disabled]="executingCommand" title="Corriger les permissions des fichiers">
                🔐 Permissions
              </button>
              <button class="btn btn-secondary btn-xs" (click)="executeCommand('restart_sync')" [disabled]="executingCommand" title="Relancer le sync-agent">
                🔃 Sync-agent
              </button>
              <button class="btn btn-secondary btn-xs" (click)="executeCommand('reboot')" [disabled]="executingCommand" title="Redémarrer le Raspberry Pi">
                🔄 Reboot
              </button>
            </div>
            <div class="command-result-inline" *ngIf="commandResult">
              <pre>{{ commandResult }}</pre>
            </div>
          </div>

          <!-- Terminal shell -->
          <app-command-executor
            [siteId]="siteId"
            [isConnected]="isConnected"
          ></app-command-executor>
        </div>
      </div>

      <!-- Logs temps réel (P2.1) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showLogs = !showLogs">
          <span class="expand-icon">{{ showLogs ? '▼' : '▶' }}</span>
          <span class="debug-icon">📜</span>
          <h4>Logs système</h4>
          <span class="debug-stats" *ngIf="selectedLogService">{{ selectedLogService }}</span>
        </div>

        <div class="debug-content" *ngIf="showLogs">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour récupérer les logs.
          </div>

          <div *ngIf="isConnected" class="logs-section">
            <div class="logs-controls">
              <select [(ngModel)]="selectedLogService" class="log-service-select">
                <option value="neopro-sync-agent">sync-agent</option>
                <option value="neopro-app">neopro-app</option>
                <option value="neopro-kiosk">kiosk (Chromium)</option>
                <option value="neopro-admin">admin panel</option>
                <option value="nginx">nginx</option>
                <option value="hostapd">hostapd</option>
              </select>
              <input type="number" [(ngModel)]="logLines" min="10" max="500" class="log-lines-input" placeholder="Lignes">
              <button class="btn btn-primary btn-sm" (click)="loadLogs()" [disabled]="loadingLogs">
                {{ loadingLogs ? '⏳ ' + ('debug.loadingLogs' | translate) : '🔄 ' + ('debug.loadLogs' | translate) }}
              </button>
            </div>

            <div *ngIf="loadingLogs" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Récupération des logs...</span>
            </div>

            <div *ngIf="logsContent && !loadingLogs" class="logs-viewer">
              <pre class="logs-output">{{ logsContent }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Synthèse réseau (P2.2) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showNetworkInfo = !showNetworkInfo">
          <span class="expand-icon">{{ showNetworkInfo ? '▼' : '▶' }}</span>
          <span class="debug-icon">🌐</span>
          <h4>Réseau</h4>
          <span class="debug-stats" *ngIf="networkInfo">
            {{ networkInfo.internet?.reachable ? '✅ Internet OK' : '❌ Pas d\\'Internet' }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showNetworkInfo">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour les diagnostics réseau.
          </div>

          <div *ngIf="isConnected && !networkInfo && !loadingNetworkInfo" class="network-actions">
            <button class="btn btn-primary btn-sm" (click)="loadNetworkInfo()">
              🔄 Analyser le réseau
            </button>
          </div>

          <div *ngIf="loadingNetworkInfo" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Analyse du réseau...</span>
          </div>

          <div *ngIf="networkInfo && !loadingNetworkInfo" class="network-content">
            <div class="network-grid">
              <!-- Internet -->
              <div class="network-card" [class.status-ok]="networkInfo.internet?.reachable" [class.status-fail]="!networkInfo.internet?.reachable">
                <div class="network-card-header">🌍 Internet</div>
                <div class="network-card-value">{{ networkInfo.internet?.reachable ? 'Connecté' : 'Non accessible' }}</div>
                <div class="network-card-detail" *ngIf="networkInfo.internet?.latency_ms">
                  Latence: {{ networkInfo.internet?.latency_ms }}ms
                </div>
                <div class="network-card-detail" *ngIf="networkInfo.internet?.packet_loss_percent !== null">
                  Perte: {{ networkInfo.internet?.packet_loss_percent }}%
                </div>
              </div>

              <!-- DNS -->
              <div class="network-card" [class.status-ok]="networkInfo.dns?.working" [class.status-fail]="!networkInfo.dns?.working">
                <div class="network-card-header">🔗 DNS</div>
                <div class="network-card-value">{{ networkInfo.dns?.working ? 'Fonctionnel' : 'En échec' }}</div>
                <div class="network-card-detail" *ngIf="networkInfo.dns?.resolution_ms">
                  Résolution: {{ networkInfo.dns?.resolution_ms }}ms
                </div>
              </div>

              <!-- Passerelle -->
              <div class="network-card" [class.status-ok]="networkInfo.gateway?.reachable" [class.status-fail]="!networkInfo.gateway?.reachable">
                <div class="network-card-header">🚪 Passerelle</div>
                <div class="network-card-value">{{ networkInfo.gateway?.ip || 'N/A' }}</div>
                <div class="network-card-detail">
                  {{ networkInfo.gateway?.reachable ? '✅ ' + ('debug.gatewayAccessible' | translate) : '❌ ' + ('debug.gatewayNotAccessible' | translate) }}
                </div>
              </div>

              <!-- Serveur Central -->
              <div class="network-card" [class.status-ok]="networkInfo.central_server?.reachable" [class.status-fail]="!networkInfo.central_server?.reachable">
                <div class="network-card-header">☁️ Serveur Central</div>
                <div class="network-card-value">{{ networkInfo.central_server?.reachable ? 'Connecté' : 'Non accessible' }}</div>
                <div class="network-card-detail" *ngIf="networkInfo.central_server?.latency_ms">
                  Latence: {{ networkInfo.central_server?.latency_ms }}ms
                </div>
              </div>
            </div>

            <!-- WiFi si disponible -->
            <div class="wifi-section" *ngIf="networkInfo.wifi">
              <h5>📶 WiFi</h5>
              <div class="wifi-info">
                <span><strong>SSID:</strong> {{ networkInfo.wifi.ssid || 'N/A' }}</span>
                <span><strong>Signal:</strong> {{ networkInfo.wifi.signal_dbm }}dBm ({{ networkInfo.wifi.quality_percent }}%)</span>
                <span *ngIf="networkInfo.wifi.bitrate_mbps"><strong>Débit:</strong> {{ networkInfo.wifi.bitrate_mbps }} Mb/s</span>
              </div>
            </div>

            <button class="btn btn-secondary btn-sm refresh-network-btn" (click)="loadNetworkInfo()" [disabled]="loadingNetworkInfo">
              🔄 Rafraîchir
            </button>
          </div>
        </div>
      </div>

      <!-- Buffer Analytics (P2.3) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showBufferStatus = !showBufferStatus">
          <span class="expand-icon">{{ showBufferStatus ? '▼' : '▶' }}</span>
          <span class="debug-icon">📊</span>
          <h4>Buffers Analytics</h4>
          <span class="debug-stats" *ngIf="bufferStatus">
            {{ (bufferStatus.analytics?.event_count || 0) + (bufferStatus.sponsors?.event_count || 0) }} événements en attente
          </span>
        </div>

        <div class="debug-content" *ngIf="showBufferStatus">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour voir l'état des buffers.
          </div>

          <div *ngIf="isConnected && !bufferStatus && !loadingBufferStatus" class="buffer-actions">
            <button class="btn btn-primary btn-sm" (click)="loadBufferStatus()">
              🔄 Charger l'état des buffers
            </button>
          </div>

          <div *ngIf="loadingBufferStatus" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Récupération...</span>
          </div>

          <div *ngIf="bufferStatus && !loadingBufferStatus" class="buffer-content">
            <div class="buffer-grid">
              <!-- Analytics buffer -->
              <div class="buffer-card" [class.buffer-warning]="(bufferStatus.analytics?.event_count || 0) > 1000">
                <div class="buffer-header">📹 Lectures vidéo</div>
                <div class="buffer-count">{{ bufferStatus.analytics?.event_count || 0 }}</div>
                <div class="buffer-label">événements</div>
                <div class="buffer-details" *ngIf="bufferStatus.analytics?.file_exists">
                  <div class="buffer-detail">Taille: {{ formatBytes(bufferStatus.analytics?.file_size_bytes || 0) }}</div>
                  <div class="buffer-detail" *ngIf="bufferStatus.analytics?.oldest_event">
                    Plus ancien: {{ bufferStatus.analytics.oldest_event | date:'dd/MM HH:mm' }}
                  </div>
                </div>
              </div>

              <!-- Sponsors buffer -->
              <div class="buffer-card" [class.buffer-warning]="(bufferStatus.sponsors?.event_count || 0) > 1000">
                <div class="buffer-header">🎯 Impressions sponsors</div>
                <div class="buffer-count">{{ bufferStatus.sponsors?.event_count || 0 }}</div>
                <div class="buffer-label">événements</div>
                <div class="buffer-details" *ngIf="bufferStatus.sponsors?.file_exists">
                  <div class="buffer-detail">Taille: {{ formatBytes(bufferStatus.sponsors?.file_size_bytes || 0) }}</div>
                  <div class="buffer-detail" *ngIf="bufferStatus.sponsors?.oldest_event">
                    Plus ancien: {{ bufferStatus.sponsors.oldest_event | date:'dd/MM HH:mm' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="buffer-hint" *ngIf="(bufferStatus.analytics?.event_count || 0) + (bufferStatus.sponsors?.event_count || 0) > 1000">
              ⚠️ Le buffer contient beaucoup d'événements. Ils seront envoyés automatiquement à la prochaine synchronisation.
            </div>

            <button class="btn btn-secondary btn-sm" (click)="loadBufferStatus()" [disabled]="loadingBufferStatus">
              🔄 Rafraîchir
            </button>
          </div>
        </div>
      </div>

      <!-- Hotspot WiFi (P2.4) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showHotspotFix = !showHotspotFix">
          <span class="expand-icon">{{ showHotspotFix ? '▼' : '▶' }}</span>
          <span class="debug-icon">📡</span>
          <h4>Hotspot WiFi</h4>
          <span class="debug-stats" *ngIf="hotspotResult">
            {{ hotspotResult.success ? '✅ ' + ('debug.hotspotVerified' | translate) : '❌ ' + ('debug.hotspotError' | translate) }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showHotspotFix">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour gérer le hotspot.
          </div>

          <div *ngIf="isConnected" class="hotspot-section">
            <p class="hotspot-hint">
              Si le réseau WiFi du boîtier (NEOPRO-xxx) n'apparaît pas ou est instable,
              utilisez ce bouton pour diagnostiquer et réparer automatiquement.
            </p>

            <div class="hotspot-actions">
              <button class="btn btn-warning" (click)="fixHotspot(false)" [disabled]="fixingHotspot">
                {{ fixingHotspot ? '⏳ Diagnostic...' : '🔍 Diagnostiquer' }}
              </button>
              <button class="btn btn-primary" (click)="fixHotspot(true)" [disabled]="fixingHotspot">
                {{ fixingHotspot ? '⏳ Réparation...' : '🔧 Réparer automatiquement' }}
              </button>
            </div>

            <div *ngIf="fixingHotspot" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Cette opération peut prendre jusqu'à 2 minutes (scan des canaux WiFi)...</span>
            </div>

            <div *ngIf="hotspotResult && !fixingHotspot" class="hotspot-result">
              <!-- Résultat structuré -->
              <div *ngIf="hotspotResult.checks" class="hotspot-checks">
                <div *ngFor="let check of hotspotResult.checks" class="hotspot-check"
                  [class.check-ok]="check.status === 'ok'"
                  [class.check-fail]="check.status === 'fail'"
                  [class.check-warning]="check.status === 'warning'">
                  <span class="check-icon">{{ check.status === 'ok' ? '✅' : check.status === 'fail' ? '❌' : '⚠️' }}</span>
                  <span class="check-name">{{ check.name }}</span>
                  <span class="check-value">{{ check.value }}</span>
                </div>
              </div>

              <!-- Sortie brute si script exécuté -->
              <div *ngIf="hotspotResult.output" class="hotspot-output">
                <pre class="output-viewer">{{ hotspotResult.output }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Export pour Support (P3.3) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showExport = !showExport">
          <span class="expand-icon">{{ showExport ? '▼' : '▶' }}</span>
          <span class="debug-icon">📦</span>
          <h4>Export pour support</h4>
        </div>

        <div class="debug-content" *ngIf="showExport">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour exporter les données de debug.
          </div>

          <div *ngIf="isConnected" class="export-section">
            <p class="export-hint">
              Exporte un rapport complet contenant la configuration, les logs récents,
              l'état des services et les diagnostics système. Utile pour le support technique.
            </p>

            <div class="export-actions">
              <button class="btn btn-primary" (click)="exportDebugBundle()" [disabled]="exportingBundle">
                {{ exportingBundle ? '⏳ Collecte des données...' : '📦 Exporter le rapport de debug' }}
              </button>
            </div>

            <div *ngIf="exportingBundle" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Collecte des logs, configuration et diagnostics...</span>
            </div>

            <div *ngIf="exportError" class="export-error">
              ❌ {{ exportError }}
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline des événements récents (P3.4) -->
      <div class="debug-card">
        <div class="debug-header" (click)="toggleTimeline()">
          <span class="expand-icon">{{ showTimeline ? '▼' : '▶' }}</span>
          <span class="debug-icon">📅</span>
          <h4>Activité récente</h4>
          <span class="debug-stats" *ngIf="timelineEvents.length > 0">
            {{ timelineEvents.length }} événement(s)
          </span>
        </div>

        <div class="debug-content" *ngIf="showTimeline">
          <div *ngIf="loadingTimeline" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Chargement de l'historique...</span>
          </div>

          <div *ngIf="!loadingTimeline && timelineEvents.length === 0" class="empty-hint">
            Aucun événement récent trouvé.
          </div>

          <div *ngIf="!loadingTimeline && timelineEvents.length > 0" class="timeline">
            <div class="timeline-item" *ngFor="let event of timelineEvents"
              [class.timeline-deployment]="event.type === 'deployment'"
              [class.timeline-command]="event.type === 'command'"
              [class.timeline-config]="event.type === 'config'"
              [class.timeline-alert]="event.type === 'alert'">
              <div class="timeline-icon">
                {{ getTimelineIcon(event.type) }}
              </div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-title">{{ event.title }}</span>
                  <span class="timeline-time">{{ event.timestamp | date:'dd/MM HH:mm' }}</span>
                </div>
                <div class="timeline-meta">
                  <span class="timeline-status" [class.status-completed]="event.status === 'completed'"
                    [class.status-failed]="event.status === 'failed'"
                    [class.status-active]="event.status === 'active'">
                    {{ getStatusLabel(event.status) }}
                  </span>
                  <span class="timeline-user" *ngIf="event.user">{{ event.user }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="timeline-actions" *ngIf="!loadingTimeline">
            <button class="btn btn-secondary btn-sm" (click)="loadTimeline()" [disabled]="loadingTimeline">
              🔄 Rafraîchir
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .debug-tab {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .debug-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .debug-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .debug-header:hover {
      background: #f8fafc;
    }

    .debug-header h4 {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      flex: 1;
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #64748b;
      width: 16px;
    }

    .debug-icon {
      font-size: 1.125rem;
    }

    .debug-stats {
      font-size: 0.75rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .debug-content {
      padding: 0 1.5rem 1.5rem 1.5rem;
      border-top: 1px solid #f1f5f9;
    }

    .debug-content.always-visible {
      border-top: none;
      padding-top: 0;
    }

    /* Storage */
    .storage-bar {
      margin-bottom: 1rem;
    }

    .storage-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.25rem;
    }

    .storage-progress {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .storage-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 4px;
      transition: width 0.3s;
    }

    /* Files list */
    .files-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    .file-row {
      display: grid;
      grid-template-columns: 1fr 120px 80px;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.8125rem;
    }

    .file-row:last-child {
      border-bottom: none;
    }

    .file-row.header {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-category {
      color: #64748b;
    }

    .file-size {
      text-align: right;
      color: #64748b;
    }

    .sync-info {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
      font-size: 0.8125rem;
      display: flex;
      gap: 0.5rem;
    }

    .sync-label {
      color: #64748b;
    }

    .sync-value {
      font-weight: 500;
    }

    /* JSON viewer */
    .json-actions {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding-top: 1rem;
    }

    .json-viewer {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 400px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Info grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      padding-top: 1rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .info-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .info-value.monospace {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8125rem;
      word-break: break-all;
    }

    .empty-hint {
      margin: 0;
      padding: 1rem;
      text-align: center;
      color: #64748b;
      font-size: 0.8125rem;
      background: #f8fafc;
      border-radius: 6px;
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

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    /* History */
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 1rem;
    }

    .history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .history-item.selected {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .history-item-main {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .history-item-date {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .history-item-user {
      font-size: 0.75rem;
      color: #64748b;
    }

    .history-item-comment {
      font-size: 0.8125rem;
      color: #475569;
      font-style: italic;
    }

    .history-item-actions {
      display: flex;
      gap: 0.5rem;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      color: #64748b;
    }

    .spinner-small {
      width: 16px;
      height: 16px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .version-modal {
      margin-top: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .version-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .version-modal-header h5 {
      margin: 0;
      font-size: 0.875rem;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      color: #64748b;
    }

    .btn-close:hover {
      color: #1e293b;
    }

    .version-modal-body {
      max-height: 300px;
      overflow: auto;
    }

    /* Commands section */
    .commands-section {
      padding-top: 1rem;
    }

    .commands-hint {
      margin: 0 0 1rem 0;
      font-size: 0.8125rem;
      color: #64748b;
    }

    .command-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    .btn-warning {
      background: #f59e0b;
      color: white;
    }

    .btn-warning:hover:not(:disabled) {
      background: #d97706;
    }

    .command-custom {
      border-top: 1px solid #e2e8f0;
      padding-top: 1rem;
    }

    .command-custom h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .command-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .command-select {
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
    }

    .command-params {
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-family: 'SF Mono', Monaco, monospace;
      resize: vertical;
    }

    .command-result {
      margin-top: 1rem;
      border-top: 1px solid #e2e8f0;
      padding-top: 1rem;
    }

    .command-result h5 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .result-viewer {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Terminal status badges */
    .debug-stats.connected {
      background: #dcfce7;
      color: #15803d;
    }

    .debug-stats.disconnected {
      background: #fee2e2;
      color: #dc2626;
    }

    .debug-stats.zombie {
      background: #fef3c7;
      color: #92400e;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Zombie connection warning (P1.4) */
    .zombie-warning {
      padding: 1rem;
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border: 1px solid #f59e0b;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .zombie-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .zombie-icon {
      font-size: 1.25rem;
    }

    .zombie-title {
      font-weight: 600;
      color: #92400e;
    }

    .zombie-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .zombie-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }

    .zombie-label {
      color: #78716c;
      font-weight: 500;
    }

    .zombie-value {
      color: #44403c;
      font-family: 'SF Mono', Monaco, monospace;
    }

    .zombie-hint {
      font-size: 0.75rem;
      color: #78716c;
      padding-top: 0.5rem;
      border-top: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Health status badges */
    .debug-stats.health-ok {
      background: #dcfce7;
      color: #15803d;
    }

    .debug-stats.health-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .debug-stats.health-critical {
      background: #fee2e2;
      color: #dc2626;
    }

    /* Offline warning */
    .offline-warning {
      padding: 1rem;
      background: #fef3c7;
      border-radius: 6px;
      color: #92400e;
      font-size: 0.875rem;
      margin-top: 1rem;
    }

    /* Health actions */
    .health-actions {
      padding-top: 1rem;
    }

    /* Health content */
    .health-content {
      padding-top: 1rem;
    }

    /* Health score card */
    .health-score-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .health-score-card.score-healthy {
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    }

    .health-score-card.score-degraded {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    }

    .health-score-card.score-critical {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    }

    .score-circle {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }

    .score-value {
      font-size: 2rem;
      font-weight: 700;
    }

    .score-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    .score-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .score-status {
      font-weight: 600;
    }

    .score-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .refresh-btn {
      padding: 0.25rem 0.5rem !important;
    }

    /* Health issues */
    .health-issues {
      margin-bottom: 1rem;
    }

    .health-issues h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .issue-item {
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }

    .issue-item.issue-critical {
      background: #fee2e2;
      border-left: 3px solid #dc2626;
    }

    .issue-item.issue-warning {
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
    }

    .issue-badge {
      font-weight: 600;
      font-size: 0.8125rem;
    }

    .issue-message {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
    }

    .issue-fix {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #475569;
      font-family: 'SF Mono', Monaco, monospace;
    }

    /* Health sections */
    .health-section {
      margin-bottom: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }

    .health-section h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .health-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
    }

    .health-metric {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
    }

    .health-metric.metric-warning {
      background: #fef3c7;
    }

    .metric-label {
      font-size: 0.6875rem;
      color: #64748b;
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 0.9375rem;
      font-weight: 600;
    }

    .metric-hint {
      font-size: 0.6875rem;
      margin-left: 0.25rem;
    }

    .throttle-flags {
      margin-top: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .flag-item {
      font-size: 0.6875rem;
      padding: 0.125rem 0.375rem;
      background: #fef3c7;
      border-radius: 4px;
      color: #92400e;
    }

    /* Services grid */
    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.5rem;
    }

    .service-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .service-item.service-active {
      background: #dcfce7;
    }

    .service-item.service-failed {
      background: #fee2e2;
    }

    .service-name {
      font-weight: 500;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.75rem;
    }

    .service-desc {
      color: #64748b;
      font-size: 0.6875rem;
    }

    /* Diagnostics */
    .diagnostics-actions {
      padding-top: 1rem;
    }

    .diagnostics-hint {
      margin: 0.5rem 0 0 0;
      font-size: 0.75rem;
      color: #64748b;
    }

    .diagnostics-result {
      padding-top: 1rem;
    }

    .diagnostics-header {
      margin-bottom: 0.75rem;
    }

    .diagnostics-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .checks-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .check-category h6 {
      margin: 0 0 0.5rem 0;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #475569;
    }

    .check-items {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .check-item.check-ok {
      background: #dcfce7;
    }

    .check-item.check-fail {
      background: #fee2e2;
    }

    .check-item.check-warning {
      background: #fef3c7;
    }

    .check-name {
      font-weight: 500;
      min-width: 120px;
    }

    .check-value {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.75rem;
      color: #475569;
    }

    .check-warn {
      font-size: 0.6875rem;
      color: #92400e;
      margin-left: auto;
    }

    .diagnostics-output {
      margin-top: 1rem;
    }

    .diagnostics-output h6 {
      margin: 0 0 0.5rem 0;
      font-size: 0.8125rem;
    }

    .output-viewer {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.6875rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 300px;
      overflow: auto;
      white-space: pre-wrap;
    }

    /* Diff styles */
    .compare-mode-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #eff6ff;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .compare-info {
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .history-actions {
      margin-bottom: 0.75rem;
    }

    .compare-checkbox {
      margin-right: 0.5rem;
    }

    .compare-checkbox input {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .history-item.compare-selected {
      background: #eff6ff;
      border-color: #2563eb;
    }

    .history-item-changes {
      margin-top: 0.25rem;
    }

    .changes-badge {
      font-size: 0.6875rem;
      padding: 0.125rem 0.375rem;
      background: #e0e7ff;
      color: #3730a3;
      border-radius: 4px;
    }

    .diff-modal {
      margin-top: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .diff-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .diff-modal-header h5 {
      margin: 0;
      font-size: 0.875rem;
    }

    .diff-versions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
    }

    .diff-version.old {
      color: #dc2626;
    }

    .diff-version.new {
      color: #15803d;
    }

    .diff-arrow {
      color: #64748b;
    }

    .diff-modal-body {
      max-height: 400px;
      overflow-y: auto;
      padding: 1rem;
    }

    .diff-summary {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .diff-count {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .diff-count.added {
      background: #dcfce7;
      color: #15803d;
    }

    .diff-count.removed {
      background: #fee2e2;
      color: #dc2626;
    }

    .diff-count.changed {
      background: #fef3c7;
      color: #92400e;
    }

    .diff-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .diff-item {
      border-radius: 6px;
      overflow: hidden;
    }

    .diff-item.diff-added {
      border-left: 3px solid #15803d;
      background: #f0fdf4;
    }

    .diff-item.diff-removed {
      border-left: 3px solid #dc2626;
      background: #fef2f2;
    }

    .diff-item.diff-changed {
      border-left: 3px solid #f59e0b;
      background: #fffbeb;
    }

    .diff-item-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
    }

    .diff-type-badge {
      font-size: 0.875rem;
    }

    .diff-path {
      font-family: 'SF Mono', Monaco, monospace;
      font-weight: 500;
    }

    .diff-item-content {
      padding: 0 0.75rem 0.5rem 0.75rem;
      font-size: 0.75rem;
    }

    .diff-old, .diff-new {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .diff-label {
      color: #64748b;
      min-width: 50px;
    }

    .diff-item-content code {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.6875rem;
      background: rgba(0, 0, 0, 0.05);
      padding: 0.125rem 0.25rem;
      border-radius: 3px;
      word-break: break-all;
    }

    /* P2.1 - Logs */
    .logs-section {
      padding-top: 1rem;
    }

    .logs-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .log-service-select {
      padding: 0.375rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      min-width: 150px;
    }

    .log-lines-input {
      width: 80px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .logs-viewer {
      margin-top: 1rem;
    }

    .logs-output {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.6875rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 400px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* P2.2 - Network */
    .network-actions, .buffer-actions {
      padding-top: 1rem;
    }

    .network-content {
      padding-top: 1rem;
    }

    .network-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .network-card {
      padding: 1rem;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    .network-card.status-ok {
      background: #f0fdf4;
      border-color: #86efac;
    }

    .network-card.status-fail {
      background: #fef2f2;
      border-color: #fca5a5;
    }

    .network-card-header {
      font-weight: 600;
      font-size: 0.8125rem;
      margin-bottom: 0.5rem;
    }

    .network-card-value {
      font-size: 0.9375rem;
      font-weight: 500;
    }

    .network-card-detail {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .wifi-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .wifi-section h5 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
    }

    .wifi-info {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.8125rem;
    }

    .refresh-network-btn {
      margin-top: 1rem;
    }

    /* P2.3 - Buffer */
    .buffer-content {
      padding-top: 1rem;
    }

    .buffer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .buffer-card {
      padding: 1.25rem;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      text-align: center;
    }

    .buffer-card.buffer-warning {
      background: #fef3c7;
      border-color: #fbbf24;
    }

    .buffer-header {
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .buffer-count {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .buffer-label {
      font-size: 0.75rem;
      color: #64748b;
    }

    .buffer-details {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }

    .buffer-detail {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .buffer-hint {
      padding: 0.75rem;
      background: #fef3c7;
      border-radius: 6px;
      font-size: 0.8125rem;
      margin-bottom: 1rem;
    }

    /* P2.4 - Hotspot */
    .hotspot-section {
      padding-top: 1rem;
    }

    .hotspot-hint {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 1rem 0;
    }

    .hotspot-actions {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .hotspot-result {
      margin-top: 1rem;
    }

    .hotspot-checks {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 1rem;
    }

    .hotspot-check {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .hotspot-check.check-ok {
      background: #dcfce7;
    }

    .hotspot-check.check-fail {
      background: #fee2e2;
    }

    .hotspot-check.check-warning {
      background: #fef3c7;
    }

    .hotspot-check .check-name {
      font-weight: 500;
      min-width: 100px;
    }

    .hotspot-check .check-value {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.75rem;
      color: #475569;
    }

    .hotspot-output {
      margin-top: 1rem;
    }

    /* Quick commands (P3.2) */
    .quick-commands {
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .quick-commands-label {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .quick-commands-buttons {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .btn-xs {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
    }

    .command-result-inline {
      margin-top: 0.75rem;
      padding: 0.5rem;
      background: #1e293b;
      border-radius: 4px;
    }

    .command-result-inline pre {
      margin: 0;
      color: #e2e8f0;
      font-size: 0.6875rem;
      font-family: 'SF Mono', Monaco, monospace;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 100px;
      overflow: auto;
    }

    /* P3.3 - Export */
    .export-section {
      padding-top: 1rem;
    }

    .export-hint {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 1rem 0;
    }

    .export-actions {
      margin-bottom: 1rem;
    }

    .export-error {
      padding: 0.75rem;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      border-radius: 6px;
      color: #dc2626;
      font-size: 0.8125rem;
      margin-top: 1rem;
    }

    /* P3.4 - Timeline */
    .timeline-section {
      padding-top: 1rem;
    }

    .timeline-counts {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .timeline-count {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background: #f1f5f9;
    }

    .timeline-count.count-deployment {
      background: #dbeafe;
      color: #1e40af;
    }

    .timeline-count.count-command {
      background: #dcfce7;
      color: #15803d;
    }

    .timeline-count.count-config {
      background: #fef3c7;
      color: #92400e;
    }

    .timeline-count.count-alert {
      background: #fee2e2;
      color: #dc2626;
    }

    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      position: relative;
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 11px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e2e8f0;
    }

    .timeline-item {
      display: flex;
      gap: 0.75rem;
      position: relative;
    }

    .timeline-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
      z-index: 1;
      background: white;
      border: 2px solid #e2e8f0;
    }

    .timeline-item.timeline-deployment .timeline-icon {
      background: #dbeafe;
      border-color: #3b82f6;
    }

    .timeline-item.timeline-command .timeline-icon {
      background: #dcfce7;
      border-color: #22c55e;
    }

    .timeline-item.timeline-config .timeline-icon {
      background: #fef3c7;
      border-color: #f59e0b;
    }

    .timeline-item.timeline-alert .timeline-icon {
      background: #fee2e2;
      border-color: #ef4444;
    }

    .timeline-content {
      flex: 1;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .timeline-item.timeline-deployment .timeline-content {
      border-left: 3px solid #3b82f6;
    }

    .timeline-item.timeline-command .timeline-content {
      border-left: 3px solid #22c55e;
    }

    .timeline-item.timeline-config .timeline-content {
      border-left: 3px solid #f59e0b;
    }

    .timeline-item.timeline-alert .timeline-content {
      border-left: 3px solid #ef4444;
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .timeline-title {
      font-weight: 500;
      font-size: 0.8125rem;
    }

    .timeline-time {
      font-size: 0.6875rem;
      color: #64748b;
      white-space: nowrap;
    }

    .timeline-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.75rem;
    }

    .timeline-status {
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.6875rem;
      font-weight: 500;
    }

    .timeline-status.status-completed,
    .timeline-status.status-success {
      background: #dcfce7;
      color: #15803d;
    }

    .timeline-status.status-failed,
    .timeline-status.status-error {
      background: #fee2e2;
      color: #dc2626;
    }

    .timeline-status.status-pending,
    .timeline-status.status-in_progress {
      background: #fef3c7;
      color: #92400e;
    }

    .timeline-status.status-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .timeline-status.status-info {
      background: #dbeafe;
      color: #1e40af;
    }

    .timeline-user {
      color: #64748b;
      font-style: italic;
    }

    .timeline-actions {
      margin-top: 1rem;
    }
  `]
})
export class SiteDebugTabComponent implements OnInit {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() connectionHealth: ConnectionHealth | null = null;
  @Output() configRestored = new EventEmitter<SiteConfiguration>();

  localVideos: LocalVideo[] = [];
  localStorage: LocalStorage | null = null;
  lastVideoSync: string | null = null;
  lastConfigSync: string | null = null;
  configHash: string | null = null;
  configJson: string = '{}';

  showFiles: boolean = false;
  showJson: boolean = false;
  showHistory: boolean = false;
  showTerminal: boolean = false;
  showHealthStatus: boolean = false;
  showDiagnostics: boolean = false;

  // Commands
  executingCommand: boolean = false;
  commandResult: string = '';

  // History
  history: ConfigHistory[] = [];
  historyTotal: number = 0;
  loadingHistory: boolean = false;
  selectedHistoryId: string | null = null;
  viewingVersion: ConfigHistory | null = null;
  viewingVersionJson: string = '';
  restoringVersion: string | null = null;

  // Health Status (P1.1)
  healthStatus: HealthStatus | null = null;
  loadingHealthStatus: boolean = false;

  // Diagnostics (P1.2)
  diagnosticsResult: DiagnosticsResult | null = null;
  runningDiagnostics: boolean = false;

  // Config Diff (P1.3)
  compareMode: boolean = false;
  selectedForCompare: string[] = [];
  viewingDiff: boolean = false;
  configDiff: ConfigDiff[] = [];
  loadingDiff: boolean = false;
  diffVersionOld: Date | null = null;
  diffVersionNew: Date | null = null;

  // Logs (P2.1)
  showLogs: boolean = false;
  selectedLogService: string = 'neopro-sync-agent';
  logLines: number = 100;
  logsContent: string = '';
  loadingLogs: boolean = false;

  // Network (P2.2)
  showNetworkInfo: boolean = false;
  networkInfo: NetworkDiagnostics | null = null;
  loadingNetworkInfo: boolean = false;

  // Buffer Status (P2.3)
  showBufferStatus: boolean = false;
  bufferStatus: BufferStatus | null = null;
  loadingBufferStatus: boolean = false;

  // Hotspot (P2.4)
  showHotspotFix: boolean = false;
  hotspotResult: HotspotResult | null = null;
  fixingHotspot: boolean = false;

  // Export (P3.3)
  showExport: boolean = false;
  exportingBundle: boolean = false;
  exportError: string | null = null;

  // Timeline (P3.4)
  showTimeline: boolean = false;
  timelineEvents: Array<{
    id: string;
    type: 'deployment' | 'command' | 'config' | 'alert';
    timestamp: string;
    title: string;
    details: Record<string, unknown>;
    status?: string;
    user?: string;
  }> = [];
  loadingTimeline: boolean = false;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.loadDebugInfo();
  }

  private loadDebugInfo(): void {
    if (!this.siteId) return;

    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response) => {
        this.localVideos = response.localVideos || [];
        this.localStorage = response.localStorage || null;
        this.lastVideoSync = response.lastVideoSync || null;
        this.lastConfigSync = response.lastSync ? new Date(response.lastSync).toISOString() : null;
        this.configHash = response.configHash || null;

        if (response.configuration) {
          this.configJson = JSON.stringify(response.configuration, null, 2);
        }
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load debug info', { error: message, siteId: this.siteId });
      }
    });
  }

  getTotalSize(): number {
    return this.localVideos.reduce((sum, v) => sum + v.size, 0);
  }

  getStoragePercent(): number {
    if (!this.localStorage || !this.localStorage.total) return 0;
    return (this.localStorage.used / this.localStorage.total) * 100;
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getVideoCategories(): string[] {
    const cats = new Set<string>();
    this.localVideos.forEach(v => cats.add(v.category || ''));
    return Array.from(cats).sort();
  }

  getVideosByCategory(category: string): LocalVideo[] {
    return this.localVideos.filter(v => (v.category || '') === category);
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.configJson);
    this.notificationService.success('JSON copié !');
  }

  downloadJson(): void {
    const blob = new Blob([this.configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-${this.siteId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // History methods
  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.history.length === 0) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.loadingHistory = true;
    this.sitesService.getConfigHistory(this.siteId, 20, 0).subscribe({
      next: (response) => {
        this.history = response.history || [];
        this.historyTotal = response.total || 0;
        this.loadingHistory = false;
      },
      error: (error) => {
        this.loadingHistory = false;
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load config history', { error: message, siteId: this.siteId });
      }
    });
  }

  viewVersion(item: ConfigHistory): void {
    this.selectedHistoryId = item.id;
    this.viewingVersion = item;
    this.viewingVersionJson = JSON.stringify(item.configuration, null, 2);
  }

  restoreVersion(item: ConfigHistory): void {
    if (!item.configuration) {
      this.notificationService.error('Configuration non disponible pour cette version');
      return;
    }

    if (!confirm(`Restaurer et déployer la configuration du ${new Date(item.deployed_at).toLocaleString()} ?\n\nCela va remplacer la configuration actuelle sur le boîtier.`)) {
      return;
    }

    this.restoringVersion = item.id;

    // Déployer directement la configuration restaurée via la commande update_config
    // Mode 'replace' car on veut restaurer la configuration exactement comme elle était
    this.sitesService.sendCommand(this.siteId, 'update_config', {
      configuration: item.configuration,
      mode: 'replace'
    }).subscribe({
      next: () => {
        this.restoringVersion = null;
        this.notificationService.success('Configuration restaurée et déployée avec succès !');
        this.configRestored.emit(item.configuration);
        // Recharger les infos de debug pour refléter la nouvelle config
        this.loadDebugInfo();
      },
      error: (error) => {
        this.restoringVersion = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur lors de la restauration: ${message}`);
        this.logger.error('Failed to restore config version', { error: message, siteId: this.siteId, versionId: item.id });
      }
    });
  }

  // Command methods
  executeCommand(command: string): void {
    this.executingCommand = true;
    this.commandResult = '';

    let commandType = command;
    let params: Record<string, unknown> = {};

    // Map quick commands to actual commands
    switch (command) {
      case 'fix_permissions':
        commandType = 'update_config';
        params = { mode: 'fix_permissions' };
        break;
      case 'restart_sync':
        commandType = 'restart_service';
        params = { service: 'neopro-sync-agent' };
        break;
      case 'reboot':
        if (!confirm('Êtes-vous sûr de vouloir redémarrer le Raspberry Pi ?')) {
          this.executingCommand = false;
          return;
        }
        break;
    }

    this.sitesService.sendCommand(this.siteId, commandType, params).subscribe({
      next: (response) => {
        this.executingCommand = false;
        this.commandResult = JSON.stringify(response, null, 2);
        this.notificationService.success(`Commande "${command}" envoyée avec succès`);
      },
      error: (error) => {
        this.executingCommand = false;
        const message = ErrorExtractor.getMessage(error);
        this.commandResult = `Erreur: ${message}`;
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // ============================================
  // P1.1 - Health Status Methods
  // ============================================

  toggleHealthStatus(): void {
    this.showHealthStatus = !this.showHealthStatus;
    if (this.showHealthStatus && !this.healthStatus && this.isConnected) {
      this.loadHealthStatus();
    }
  }

  loadHealthStatus(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour récupérer l\'état de santé');
      return;
    }

    this.loadingHealthStatus = true;

    this.sitesService.sendCommand(this.siteId, 'get_health_status', {}).subscribe({
      next: (response: unknown) => {
        this.loadingHealthStatus = false;
        // Le résultat peut être dans response.result ou directement dans response
        const result = (response as { result?: HealthStatus })?.result || response as HealthStatus;
        if (result && result.success !== false) {
          this.healthStatus = result;
        } else {
          this.notificationService.error('Échec de la récupération de l\'état de santé');
        }
      },
      error: (error) => {
        this.loadingHealthStatus = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to get health status', { error: message, siteId: this.siteId });
      }
    });
  }

  getHealthStatusLabel(status: string): string {
    switch (status) {
      case 'healthy': return 'Bon état';
      case 'degraded': return 'Dégradé';
      case 'critical': return 'Critique';
      default: return status;
    }
  }

  formatUptime(seconds: number): string {
    if (!seconds || seconds <= 0) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  // ============================================
  // P1.2 - Diagnostics Methods
  // ============================================

  runDiagnostics(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour lancer un diagnostic');
      return;
    }

    this.runningDiagnostics = true;
    this.diagnosticsResult = null;

    this.sitesService.sendCommand(this.siteId, 'run_diagnostics', {}).subscribe({
      next: (response: unknown) => {
        this.runningDiagnostics = false;
        const result = (response as { result?: DiagnosticsResult })?.result || response as DiagnosticsResult;
        if (result) {
          this.diagnosticsResult = result;
          this.notificationService.success('Diagnostic terminé');
        }
      },
      error: (error) => {
        this.runningDiagnostics = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to run diagnostics', { error: message, siteId: this.siteId });
      }
    });
  }

  getDiagnosticsCategories(): string[] {
    if (!this.diagnosticsResult?.checks) return [];
    const categories = new Set<string>();
    this.diagnosticsResult.checks.forEach(check => categories.add(check.category));
    return Array.from(categories);
  }

  getChecksByCategory(category: string): DiagnosticCheck[] {
    if (!this.diagnosticsResult?.checks) return [];
    return this.diagnosticsResult.checks.filter(c => c.category === category);
  }

  getDiagnosticsOkCount(): number {
    if (!this.diagnosticsResult?.checks) return 0;
    return this.diagnosticsResult.checks.filter(c => c.status === 'ok').length;
  }

  // ============================================
  // P1.3 - Config Diff Methods
  // ============================================

  startCompareMode(): void {
    this.compareMode = true;
    this.selectedForCompare = [];
  }

  cancelCompareMode(): void {
    this.compareMode = false;
    this.selectedForCompare = [];
  }

  isSelectedForCompare(id: string): boolean {
    return this.selectedForCompare.includes(id);
  }

  toggleCompareSelection(id: string): void {
    const index = this.selectedForCompare.indexOf(id);
    if (index > -1) {
      this.selectedForCompare.splice(index, 1);
    } else if (this.selectedForCompare.length < 2) {
      this.selectedForCompare.push(id);
    }
  }

  executeCompare(): void {
    if (this.selectedForCompare.length !== 2) return;

    this.loadingDiff = true;
    this.viewingDiff = true;

    // Trouver les versions sélectionnées pour afficher les dates
    const version1 = this.history.find(h => h.id === this.selectedForCompare[0]);
    const version2 = this.history.find(h => h.id === this.selectedForCompare[1]);

    // Trier par date pour avoir old -> new
    const sorted = [version1, version2].sort((a, b) =>
      new Date(a!.deployed_at).getTime() - new Date(b!.deployed_at).getTime()
    );

    this.diffVersionOld = sorted[0] ? new Date(sorted[0].deployed_at) : null;
    this.diffVersionNew = sorted[1] ? new Date(sorted[1].deployed_at) : null;

    this.sitesService.compareConfigVersions(
      this.siteId,
      sorted[0]!.id,
      sorted[1]!.id
    ).subscribe({
      next: (response) => {
        this.loadingDiff = false;
        this.configDiff = response.diff || [];
        this.compareMode = false;
        this.selectedForCompare = [];
      },
      error: (error) => {
        this.loadingDiff = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to compare config versions', { error: message, siteId: this.siteId });
      }
    });
  }

  viewVersionDiff(item: ConfigHistory, index: number): void {
    // Comparer avec la version précédente (index + 1 car trié par date desc)
    if (index >= this.history.length - 1) return;

    const olderVersion = this.history[index + 1];
    this.loadingDiff = true;
    this.viewingDiff = true;

    this.diffVersionOld = new Date(olderVersion.deployed_at);
    this.diffVersionNew = new Date(item.deployed_at);

    this.sitesService.compareConfigVersions(
      this.siteId,
      olderVersion.id,
      item.id
    ).subscribe({
      next: (response) => {
        this.loadingDiff = false;
        this.configDiff = response.diff || [];
      },
      error: (error) => {
        this.loadingDiff = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  closeDiffView(): void {
    this.viewingDiff = false;
    this.configDiff = [];
    this.diffVersionOld = null;
    this.diffVersionNew = null;
  }

  getDiffCountByType(type: 'added' | 'removed' | 'changed'): number {
    return this.configDiff.filter(d => d.type === type).length;
  }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  // ============================================
  // P1.4 - Connection Health / Zombie Detection
  // ============================================

  isConnectionHealthy(): boolean {
    if (!this.connectionHealth) return this.isConnected;
    return this.connectionHealth.isHealthy;
  }

  getConnectionStatusText(): string {
    if (!this.isConnected) {
      return '○ Déconnecté';
    }
    if (this.connectionHealth && !this.connectionHealth.isHealthy) {
      return '⚠ Instable';
    }
    return '● Connecté';
  }

  getZombieReasonText(): string {
    if (!this.connectionHealth) return 'Inconnu';

    switch (this.connectionHealth.reason) {
      case 'not_in_map':
        return 'Socket non enregistrée sur le serveur';
      case 'socket_disconnected':
        return 'Socket présente mais déconnectée';
      case 'no_pong_received':
        return 'Aucune réponse ping reçue';
      case 'pong_stale':
        return 'Réponse ping trop ancienne';
      case 'healthy':
        return 'Connexion saine';
      default:
        return this.connectionHealth.reason;
    }
  }

  formatPongAge(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}min`;
  }

  // ============================================
  // P2.1 - Logs Methods
  // ============================================

  loadLogs(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour récupérer les logs');
      return;
    }

    this.loadingLogs = true;
    this.logsContent = '';

    this.sitesService.sendCommand(this.siteId, 'get_logs', {
      service: this.selectedLogService,
      lines: this.logLines
    }).subscribe({
      next: (response: unknown) => {
        this.loadingLogs = false;
        const result = (response as { result?: { logs?: string } })?.result || response as { logs?: string };
        this.logsContent = result?.logs || 'Aucun log disponible';
      },
      error: (error) => {
        this.loadingLogs = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to get logs', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // P2.2 - Network Methods
  // ============================================

  loadNetworkInfo(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour les diagnostics réseau');
      return;
    }

    this.loadingNetworkInfo = true;

    this.sitesService.sendCommand(this.siteId, 'network_diagnostics', {}).subscribe({
      next: (response: unknown) => {
        this.loadingNetworkInfo = false;
        const result = (response as { result?: NetworkDiagnostics })?.result || response as NetworkDiagnostics;
        if (result && result.success !== false) {
          this.networkInfo = result;
        } else {
          this.notificationService.error('Échec des diagnostics réseau');
        }
      },
      error: (error) => {
        this.loadingNetworkInfo = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to get network diagnostics', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // P2.3 - Buffer Status Methods
  // ============================================

  loadBufferStatus(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour voir l\'état des buffers');
      return;
    }

    this.loadingBufferStatus = true;

    this.sitesService.sendCommand(this.siteId, 'get_analytics_buffer_status', {}).subscribe({
      next: (response: unknown) => {
        this.loadingBufferStatus = false;
        const result = (response as { result?: BufferStatus })?.result || response as BufferStatus;
        if (result && result.success !== false) {
          this.bufferStatus = result;
        } else {
          this.notificationService.error('Échec de la récupération de l\'état des buffers');
        }
      },
      error: (error) => {
        this.loadingBufferStatus = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to get buffer status', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // P2.4 - Hotspot Methods
  // ============================================

  fixHotspot(autoFix: boolean): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour gérer le hotspot');
      return;
    }

    this.fixingHotspot = true;
    this.hotspotResult = null;

    this.sitesService.sendCommand(this.siteId, 'fix_hotspot', { autoFix }).subscribe({
      next: (response: unknown) => {
        this.fixingHotspot = false;
        const result = (response as { result?: HotspotResult })?.result || response as HotspotResult;
        if (result) {
          this.hotspotResult = result;
          if (result.success) {
            this.notificationService.success(autoFix ? 'Hotspot réparé avec succès' : 'Diagnostic terminé');
          } else {
            this.notificationService.warning('Des problèmes ont été détectés');
          }
        }
      },
      error: (error) => {
        this.fixingHotspot = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to fix hotspot', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // P3.3 - Export Debug Bundle Methods
  // ============================================

  exportDebugBundle(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour exporter les données');
      return;
    }

    this.exportingBundle = true;
    this.exportError = null;

    this.sitesService.sendCommand(this.siteId, 'export_debug_bundle', {}).subscribe({
      next: (response: unknown) => {
        this.exportingBundle = false;
        const result = response as { result?: { success: boolean; bundle: Record<string, unknown> } };
        const data = result?.result;

        if (data?.success && data?.bundle) {
          // Créer et télécharger le fichier JSON
          const jsonContent = JSON.stringify(data.bundle, null, 2);
          const blob = new Blob([jsonContent], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.href = url;
          const hostname = (data.bundle as { hostname?: string })?.hostname || this.siteId;
          const timestamp = new Date().toISOString().slice(0, 10);
          link.download = `neopro-debug-${hostname}-${timestamp}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          this.notificationService.success('Rapport de debug exporté');
        } else {
          this.exportError = 'Le rapport n\'a pas pu être généré';
          this.notificationService.error('Échec de l\'export');
        }
      },
      error: (error) => {
        this.exportingBundle = false;
        const message = ErrorExtractor.getMessage(error);
        this.exportError = message;
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to export debug bundle', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // P3.4 - Timeline Methods
  // ============================================

  toggleTimeline(): void {
    this.showTimeline = !this.showTimeline;
    if (this.showTimeline && this.timelineEvents.length === 0) {
      this.loadTimeline();
    }
  }

  loadTimeline(): void {
    this.loadingTimeline = true;

    this.sitesService.getTimeline(this.siteId, 20).subscribe({
      next: (response) => {
        this.loadingTimeline = false;
        this.timelineEvents = response.events;
      },
      error: (error) => {
        this.loadingTimeline = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to load timeline', { error: message, siteId: this.siteId });
      }
    });
  }

  getTimelineIcon(type: string): string {
    switch (type) {
      case 'deployment': return '📹';
      case 'command': return '⚡';
      case 'config': return '⚙️';
      case 'alert': return '⚠️';
      default: return '📌';
    }
  }

  getStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'completed': return '✅ Terminé';
      case 'in_progress': return '⏳ En cours';
      case 'failed': return '❌ Échoué';
      case 'active': return '🔴 Actif';
      case 'resolved': return '✅ Résolu';
      case 'pending': return '⏸️ En attente';
      default: return status || '';
    }
  }
}
