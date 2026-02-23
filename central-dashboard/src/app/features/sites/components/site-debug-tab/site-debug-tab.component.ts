import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval } from 'rxjs';
import { pollCommand, CommandPollResult } from './command-poller.util';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { LocalVideo, LocalStorage, ConfigHistory, SiteConfiguration } from '../../../../core/models';
import { CommandExecutorComponent } from '../command-executor/command-executor.component';
import { DebugSummaryBarComponent } from './debug-summary-bar/debug-summary-bar.component';

// Types pour le health status
interface GpuInfo {
  gpu_mem_mb: number | null;
  gpu_mem_warning: boolean;
  gpu_mem_note?: string | null;  // Note explicative pour Pi 5 (optionnel pour rétrocompatibilité)
  is_pi5?: boolean;  // true si Raspberry Pi 5 détecté (optionnel pour rétrocompatibilité)
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

interface HdmiCecStatus {
  tv_power: 'on' | 'standby' | 'transitioning' | 'unknown' | null;
  tv_connected: boolean;
  devices_found: number;
  cec_available: boolean;
  last_check_at: string | null;
  error: string | null;
}

interface DisplayInfo {
  connected: boolean;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  resolution: string | null;
  display_type: 'tv' | 'monitor' | 'projector' | 'unknown';
  detection_method: string;
}

interface FanStatusInfo {
  present: boolean;
  type: string | null;
  curState: number | null;
  maxState: number | null;
  speedPercent: number | null;
  is_pi5: boolean;
}

interface HealthStatus {
  success: boolean;
  timestamp: string;
  healthScore: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  issues: HealthIssue[];
  gpu: GpuInfo;
  fanStatus?: FanStatusInfo;
  services: ServiceStatus[];
  metrics: {
    cpu: number;
    memory: number;
    temperature: number;
    disk: number;
    uptime: number;
    localIp: string | null;
  } | null;
  hdmiCecStatus?: HdmiCecStatus;
  displayInfo?: DisplayInfo;
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

// Types pour les diagnostics réseau (P2.2) - aligné avec sync-agent network_diagnostics
interface NetworkDiagnostics {
  success: boolean;
  timestamp: string;
  internet?: {
    reachable: boolean;
    latency_ms: number | null;
    packet_loss_percent: number | null;
    packets_sent?: number;
    packets_received?: number;
  };
  dns?: {
    working: boolean;
    resolution_time_ms: number | null;
    tested_domain?: string | null;
    resolved_ip?: string | null;
  };
  gateway?: {
    ip: string | null;
    reachable: boolean;
    latency_ms?: number | null;
  };
  central_server?: {
    reachable: boolean;
    latency_ms: number | null;
    http_latency_ms?: number | null;
    http_status?: number | null;
    url?: string;
    port_443_open?: boolean | null;
    ssl_valid?: boolean | null;
  };
  interfaces?: Array<{
    name: string;
    ip4: string | null;
    ip6: string | null;
    mac: string | null;
    type: string;
    operstate: string;
    speed: number | null;
  }>;
  wifi?: {
    connected: boolean;
    ssid: string | null;
    quality_percent: number | null;
    signal_dbm: number | null;
    bitrate_mbps: number | null;
  };
  stability?: {
    interface_uptime_seconds: number | null;
    reconnections_24h: number | null;
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
  analytics?: BufferInfo;
  sponsors?: { event_count: number; oldest_event: string | null; newest_event: string | null };
  legacy_sponsor_file?: boolean;
}

// Types pour le hotspot (P2.4)
interface HotspotCheck {
  name: string;
  status: 'ok' | 'fail' | 'warning';
  value: string;
}

interface HotspotDiagnostic {
  currentChannel: number;
  recommendedChannel: number;
  ssid: string;
  hostapdActive: boolean;
  dnsmasqActive: boolean;
  powerOk: boolean;
  throttledValue: string;
}

interface HotspotFix {
  channelChanged: boolean;
  needsReboot: boolean;
  oldChannel: string;
  newChannel: string;
}

interface HotspotResult {
  success: boolean;
  timestamp: string;
  autoFix?: boolean;
  output?: string;
  checks?: HotspotCheck[];
  manual?: boolean;
  // Nouveau format JSON du script
  diagnostic?: HotspotDiagnostic;
  fix?: HotspotFix;
  message?: string;
}

// Types pour WiFi BSSID / Mesh detection
interface WifiBssidStatus {
  success: boolean;
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  bssidLocked: string | null;
  isMeshEnvironment: boolean;
  meshApCount: number;
  signal: number | null;
  ipAddress: string | null;
  timestamp: string;
}

// Types pour WiFi Client Configuration (scan & connect wlan1)
interface WifiNetwork {
  ssid: string;
  bssid: string | null;
  signal: number | null;
  quality: number | null;
  channel: number | null;
  security: string;
}

interface WifiScanResult {
  success: boolean;
  networks: WifiNetwork[];
  currentSsid: string | null;
  currentBssid: string | null;
  scannedAt: string;
  error?: string;
}

// Types pour le diagnostic guidé (F-AUD-08)
type WizardStepStatus = 'pending' | 'checking' | 'ok' | 'warning' | 'error';

interface WizardStep {
  id: number;
  title: string;
  icon: string;
  status: WizardStepStatus;
  message: string;
  details: string[];
  suggestions: string[];
}

@Component({
  selector: 'app-site-debug-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CommandExecutorComponent, DebugSummaryBarComponent],
  template: `
    <div class="debug-tab">
      <!-- Dashboard résumé -->
      <app-debug-summary-bar
        [isConnected]="isConnected"
        [connectionHealth]="connectionHealth"
        [healthStatus]="healthStatus"
        [filesCount]="localVideos.length"
        [networkInfo]="networkInfo"
        [hotspotInfo]="hotspotInfo"
        [bufferStatus]="bufferStatus">
      </app-debug-summary-bar>

      <!-- Diagnostic guidé (F-AUD-08) -->
      <div class="debug-card wizard-card">
        <div class="debug-header" (click)="toggleWizard()">
          <span class="expand-icon">{{ showWizard ? '&#9660;' : '&#9654;' }}</span>
          <span class="debug-icon">&#128270;</span>
          <h4>Diagnostic guid&eacute;</h4>
          <span class="debug-stats" *ngIf="wizardCompleted && !showWizard"
            [class.health-ok]="getWizardOverallStatus() === 'ok'"
            [class.health-warning]="getWizardOverallStatus() === 'warning'"
            [class.health-critical]="getWizardOverallStatus() === 'error'">
            {{ getWizardScoreLabel() }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showWizard">
          <!-- Step indicator -->
          <div class="wizard-steps-indicator">
            <div class="wizard-step-dot" *ngFor="let step of wizardSteps; let i = index"
              [class.dot-active]="i === wizardCurrentStep"
              [class.dot-ok]="step.status === 'ok'"
              [class.dot-warning]="step.status === 'warning'"
              [class.dot-error]="step.status === 'error'"
              [class.dot-checking]="step.status === 'checking'"
              [class.dot-pending]="step.status === 'pending'"
              (click)="goToWizardStep(i)">
              <span class="dot-number">{{ i + 1 }}</span>
            </div>
          </div>

          <!-- Wizard not started -->
          <div *ngIf="!wizardRunning && !wizardCompleted" class="wizard-start">
            <p class="wizard-intro">
              Ce diagnostic v&eacute;rifie en 5 &eacute;tapes le bon fonctionnement du site :
              connectivit&eacute;, vid&eacute;os, boucle de diffusion, impressions, et synth&egrave;se.
            </p>
            <button class="btn btn-primary" (click)="startWizard()">
              &#128270; Lancer le diagnostic
            </button>
          </div>

          <!-- Current step display -->
          <div *ngIf="wizardRunning || wizardCompleted" class="wizard-step-content">
            <div class="wizard-step-header">
              <span class="wizard-step-icon">{{ getWizardStepStatusIcon(wizardSteps[wizardCurrentStep].status) }}</span>
              <div class="wizard-step-title">
                <h5>&Eacute;tape {{ wizardCurrentStep + 1 }}/{{ wizardSteps.length }} &mdash; {{ wizardSteps[wizardCurrentStep].title }}</h5>
                <span class="wizard-step-subtitle" *ngIf="wizardSteps[wizardCurrentStep].message">
                  {{ wizardSteps[wizardCurrentStep].message }}
                </span>
              </div>
            </div>

            <!-- Details -->
            <div class="wizard-step-details" *ngIf="wizardSteps[wizardCurrentStep].details.length > 0">
              <div class="wizard-detail-item" *ngFor="let detail of wizardSteps[wizardCurrentStep].details">
                {{ detail }}
              </div>
            </div>

            <!-- Suggestions (when there are issues) -->
            <div class="wizard-step-suggestions" *ngIf="wizardSteps[wizardCurrentStep].suggestions.length > 0">
              <h6>Suggestions :</h6>
              <ul>
                <li *ngFor="let suggestion of wizardSteps[wizardCurrentStep].suggestions">{{ suggestion }}</li>
              </ul>
            </div>

            <!-- Summary (step 5) -->
            <div *ngIf="wizardCurrentStep === 4 && wizardCompleted" class="wizard-summary">
              <div class="wizard-summary-score"
                [class.summary-ok]="getWizardOverallStatus() === 'ok'"
                [class.summary-warning]="getWizardOverallStatus() === 'warning'"
                [class.summary-error]="getWizardOverallStatus() === 'error'">
                <span class="summary-score-value">{{ getWizardScore() }}/4</span>
                <span class="summary-score-label">{{ getWizardScoreLabel() }}</span>
              </div>
              <div class="wizard-checklist">
                <div class="wizard-checklist-item" *ngFor="let step of wizardSteps; let i = index">
                  <span *ngIf="i < 4">{{ getWizardStepStatusIcon(step.status) }} {{ step.title }} &mdash; {{ step.message }}</span>
                </div>
              </div>
            </div>

            <!-- Navigation buttons -->
            <div class="wizard-nav">
              <button class="btn btn-secondary btn-sm" *ngIf="wizardCurrentStep > 0"
                (click)="wizardPreviousStep()">
                &larr; Pr&eacute;c&eacute;dent
              </button>
              <div class="wizard-nav-spacer"></div>
              <button class="btn btn-secondary btn-sm" *ngIf="wizardCompleted"
                (click)="startWizard()">
                &#128260; Relancer
              </button>
              <button class="btn btn-primary btn-sm" *ngIf="wizardRunning && wizardCurrentStep < wizardSteps.length - 1"
                (click)="wizardNextStep()"
                [disabled]="wizardSteps[wizardCurrentStep].status === 'checking'">
                Suivant &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Fichiers sur le Pi -->
      <div class="debug-card">
        <div class="debug-header" (click)="showFiles = !showFiles">
          <span class="expand-icon">{{ showFiles ? '▼' : '▶' }}</span>
          <span class="debug-icon">📂</span>
          <h4>{{ 'debug.filesTitle' | translate }}</h4>
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
              <span class="file-name file-sortable" (click)="sortFiles('filename')">Fichier {{ fileSortField === 'filename' ? (fileSortAsc ? '▲' : '▼') : '' }}</span>
              <span class="file-category file-sortable" (click)="sortFiles('category')">Catégorie {{ fileSortField === 'category' ? (fileSortAsc ? '▲' : '▼') : '' }}</span>
              <span class="file-size file-sortable" (click)="sortFiles('size')">Taille {{ fileSortField === 'size' ? (fileSortAsc ? '▲' : '▼') : '' }}</span>
            </div>
            <div class="file-row" *ngFor="let video of getSortedVideos()"
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
          <h4>{{ 'debug.healthTitle' | translate }}</h4>
          <span class="debug-stats" *ngIf="healthStatus && healthStatus.healthScore !== undefined"
            [class.health-ok]="healthStatus.healthStatus === 'healthy'"
            [class.health-warning]="healthStatus.healthStatus === 'degraded'"
            [class.health-critical]="healthStatus.healthStatus === 'critical'">
            {{ healthStatus.healthScore }}% - {{ getHealthStatusLabel(healthStatus.healthStatus) }}
          </span>
          <span class="debug-stats" *ngIf="(!healthStatus || healthStatus.healthScore === undefined) && !loadingHealthStatus">Non chargé</span>
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

          <div *ngIf="healthStatus && healthStatus.healthScore !== undefined" class="health-content">
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

            <!-- Système (hostname, OS, IP) -->
            <div class="system-info-bar" *ngIf="healthStatus.system">
              <span class="system-tag" *ngIf="healthStatus.system.hostname">🏷️ {{ healthStatus.system.hostname }}</span>
              <span class="system-tag" *ngIf="healthStatus.system.os">💻 {{ healthStatus.system.os }}</span>
              <span class="system-tag" *ngIf="healthStatus.system.localIp">🌐 {{ healthStatus.system.localIp }}</span>
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
              <h5>🎮 GPU {{ healthStatus.gpu.is_pi5 ? '(Pi 5)' : '' }}</h5>
              <div class="health-grid">
                <div class="health-metric" [class.metric-warning]="healthStatus.gpu.gpu_mem_warning">
                  <span class="metric-label">Mémoire GPU</span>
                  <span class="metric-value">
                    <ng-container *ngIf="healthStatus.gpu.is_pi5; else legacyGpuMem">
                      <!-- Pi 5: mémoire GPU dynamique (CMA), la valeur 4M est un indicateur legacy -->
                      <span class="metric-ok">✅ Dynamique (CMA)</span>
                    </ng-container>
                    <ng-template #legacyGpuMem>
                      {{ healthStatus.gpu.gpu_mem_mb !== null ? healthStatus.gpu.gpu_mem_mb + 'M' : 'N/A' }}
                      <span class="metric-hint" *ngIf="healthStatus.gpu.gpu_mem_warning">⚠️ Min: 128M</span>
                    </ng-template>
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
                    <span *ngIf="healthStatus.gpu.throttled === '0x0'">✅ {{ 'debug.noThrottling' | translate }}</span>
                    <span *ngIf="healthStatus.gpu.throttled !== '0x0'">{{ healthStatus.gpu.throttled || 'N/A' }}</span>
                  </span>
                </div>
              </div>
              <div class="throttle-flags" *ngIf="healthStatus.gpu.throttled_flags && healthStatus.gpu.throttled_flags.length > 0">
                <span class="flag-item" *ngFor="let flag of healthStatus.gpu.throttled_flags">{{ flag }}</span>
              </div>
            </div>

            <!-- Fan Status -->
            <div class="health-section" *ngIf="healthStatus.fanStatus?.present">
              <h5>🌀 Ventilateur {{ healthStatus.fanStatus?.is_pi5 ? '(Pi 5 Active Cooler)' : '(Fan HAT)' }}</h5>
              <div class="health-grid">
                <div class="health-metric">
                  <span class="metric-label">Type</span>
                  <span class="metric-value">{{ healthStatus.fanStatus?.type || 'N/A' }}</span>
                </div>
                <div class="health-metric" [class.metric-warning]="healthStatus.fanStatus?.curState === 0 && (healthStatus.metrics?.temperature ?? 0) > 70">
                  <span class="metric-label">État</span>
                  <span class="metric-value">
                    {{ healthStatus.fanStatus?.curState }}/{{ healthStatus.fanStatus?.maxState }}
                    <span *ngIf="healthStatus.fanStatus?.speedPercent !== null">({{ healthStatus.fanStatus?.speedPercent }}%)</span>
                  </span>
                </div>
                <div class="health-metric">
                  <span class="metric-label">Vitesse</span>
                  <span class="metric-value">
                    <span *ngIf="healthStatus.fanStatus?.curState === 0">Arrêté</span>
                    <span *ngIf="(healthStatus.fanStatus?.curState ?? -1) > 0 && (healthStatus.fanStatus?.curState ?? 0) <= 1">Faible</span>
                    <span *ngIf="(healthStatus.fanStatus?.curState ?? 0) > 1 && (healthStatus.fanStatus?.curState ?? 0) <= 2">Moyen</span>
                    <span *ngIf="(healthStatus.fanStatus?.curState ?? 0) > 2">Fort</span>
                  </span>
                </div>
              </div>
            </div>

            <div class="health-section" *ngIf="healthStatus.fanStatus && !healthStatus.fanStatus.present">
              <h5>🌀 Ventilateur</h5>
              <p class="muted">Aucun ventilateur détecté (refroidissement passif)</p>
            </div>

            <!-- HDMI-CEC TV Status + Display Info -->
            <div class="health-section" *ngIf="healthStatus.hdmiCecStatus">
              <h5>{{ getDisplaySectionIcon(healthStatus.displayInfo) }} {{ getDisplaySectionTitle(healthStatus.displayInfo) }}</h5>

              <!-- Display Info (from EDID) -->
              <div class="health-grid" *ngIf="healthStatus.displayInfo?.connected">
                <div class="health-metric metric-ok">
                  <span class="metric-label">Écran</span>
                  <span class="metric-value">
                    {{ getDisplayName(healthStatus.displayInfo) }}
                  </span>
                </div>
                <div class="health-metric" *ngIf="healthStatus.displayInfo?.resolution">
                  <span class="metric-label">Résolution</span>
                  <span class="metric-value">{{ healthStatus.displayInfo?.resolution }}</span>
                </div>
                <div class="health-metric">
                  <span class="metric-label">Type</span>
                  <span class="metric-value">{{ getDisplayTypeLabel(healthStatus.displayInfo?.display_type || 'unknown') }}</span>
                </div>
                <div class="health-metric" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_connected" [class.metric-warning]="!healthStatus.hdmiCecStatus.tv_connected">
                  <span class="metric-label">Connexion HDMI</span>
                  <span class="metric-value">
                    {{ healthStatus.hdmiCecStatus.tv_connected ? '✅ Connected' : '✅ Signal OK' }}
                  </span>
                </div>
              </div>

              <!-- Monitor PC detected: simplified CEC info -->
              <div class="monitor-notice" *ngIf="healthStatus.displayInfo?.display_type === 'monitor'">
                <span class="metric-hint">🖥️ Moniteur PC détecté — le contrôle CEC (allumage/extinction automatique) n'est pas disponible sur ce type d'écran.</span>
              </div>

              <!-- TV CEC details (only for TVs or unknown displays) -->
              <div class="health-grid" *ngIf="healthStatus.displayInfo?.display_type !== 'monitor'">
                <div class="health-metric" [class.metric-warning]="healthStatus.hdmiCecStatus.tv_power === 'standby'" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_power === 'on'">
                  <span class="metric-label">Alimentation TV</span>
                  <span class="metric-value">
                    {{ getTvPowerLabel(healthStatus.hdmiCecStatus.tv_power) }}
                  </span>
                </div>
                <div class="health-metric" *ngIf="!healthStatus.displayInfo?.connected" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_connected" [class.metric-warning]="!healthStatus.hdmiCecStatus.tv_connected">
                  <span class="metric-label">Connexion HDMI</span>
                  <span class="metric-value">
                    {{ healthStatus.hdmiCecStatus.tv_connected ? '✅ Connected' : '❌ Not detected' }}
                  </span>
                </div>
                <div class="health-metric" [class.metric-ok]="healthStatus.hdmiCecStatus.cec_available">
                  <span class="metric-label">CEC disponible</span>
                  <span class="metric-value">
                    {{ healthStatus.hdmiCecStatus.cec_available ? '✅ Yes' : '❌ No' }}
                  </span>
                </div>
                <div class="health-metric">
                  <span class="metric-label">Périphériques CEC</span>
                  <span class="metric-value">{{ healthStatus.hdmiCecStatus.devices_found }}</span>
                </div>
              </div>
              <div class="cec-last-check" *ngIf="healthStatus.hdmiCecStatus.last_check_at">
                <span class="metric-hint">Dernière vérification: {{ healthStatus.hdmiCecStatus.last_check_at | date:'HH:mm:ss' }}</span>
              </div>
              <div class="cec-error" *ngIf="healthStatus.hdmiCecStatus.error && healthStatus.displayInfo?.display_type !== 'monitor'">
                <span class="metric-hint metric-warning">⚠️ {{ healthStatus.hdmiCecStatus.error }}</span>
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

          <!-- Diagnostic approfondi (fusionné P1.2) -->
          <div class="health-section diagnostics-subsection" *ngIf="isConnected">
            <h5>🔍 Diagnostic approfondi
              <span class="diagnostics-badge" *ngIf="diagnosticsResult">
                {{ getDiagnosticsOkCount() }}/{{ diagnosticsResult.checks?.length || 0 }} OK
              </span>
            </h5>
            <p class="diagnostics-hint">Exécute diagnose-pi.sh — rapport complet du boîtier</p>

            <button class="btn btn-primary btn-sm" (click)="runDiagnostics()" [disabled]="runningDiagnostics">
              {{ runningDiagnostics ? '⏳ Diagnostic en cours...' : '🔍 Lancer le diagnostic' }}
            </button>

            <div *ngIf="runningDiagnostics" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Exécution (peut prendre jusqu'à 60 secondes)...</span>
            </div>

            <div *ngIf="diagnosticsResult && !runningDiagnostics" class="diagnostics-result">
              <div class="diagnostics-header">
                <span class="diagnostics-time">{{ diagnosticsResult.timestamp | date:'dd/MM/yyyy HH:mm:ss' }}</span>
              </div>

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

              <div *ngIf="diagnosticsResult.output" class="diagnostics-output">
                <h6>Sortie du script</h6>
                <pre class="output-viewer">{{ diagnosticsResult.output }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration & Historique (P1.3 - fusionné) -->
      <div class="debug-card">
        <div class="debug-header" (click)="toggleHistory()">
          <span class="expand-icon">{{ showHistory ? '▼' : '▶' }}</span>
          <span class="debug-icon">📜</span>
          <h4>{{ 'debug.configHistoryTitle' | translate }}</h4>
          <span class="debug-stats" *ngIf="configHash">{{ configHash.substring(0, 8) }}</span>
          <span class="debug-stats" *ngIf="historyTotal > 0">{{ historyTotal }} version(s)</span>
        </div>

        <div class="debug-content" *ngIf="showHistory">
          <!-- Config actuelle -->
          <div class="current-config-card">
            <div class="current-config-header">
              <h5>📋 Configuration actuelle</h5>
              <div class="current-config-actions">
                <button class="btn btn-secondary btn-sm" (click)="copyJson()">📋 Copier</button>
                <button class="btn btn-secondary btn-sm" (click)="downloadJson()">💾 Télécharger</button>
                <button class="btn btn-secondary btn-sm" (click)="showJson = !showJson">
                  {{ showJson ? '▲ Masquer' : '▼ Voir JSON' }}
                </button>
              </div>
            </div>
            <pre class="json-viewer" *ngIf="showJson">{{ configJson }}</pre>
          </div>

          <!-- Historique -->
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
          <div class="version-modal" *ngIf="viewingVersion && !viewingDiff" #versionModal>
            <div class="version-modal-header">
              <h5>Version du {{ viewingVersion.deployed_at | date:'dd/MM/yyyy HH:mm' }}</h5>
              <button class="btn-close" (click)="viewingVersion = null">×</button>
            </div>
            <div class="version-modal-body">
              <pre class="json-viewer">{{ viewingVersionJson }}</pre>
            </div>
          </div>

          <!-- Diff viewer modal (P1.3) -->
          <div class="diff-modal" *ngIf="viewingDiff" #diffModal>
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
          <h4>{{ 'debug.commandsTitle' | translate }}</h4>
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
          <h4>{{ 'debug.logsTitle' | translate }}</h4>
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
                <span *ngIf="loadingLogs">⏳ {{ 'debug.loadingLogs' | translate }}</span>
                <span *ngIf="!loadingLogs">🔄 {{ 'debug.loadLogs' | translate }}</span>
              </button>
            </div>

            <div *ngIf="loadingLogs" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Récupération des logs...</span>
            </div>

            <div *ngIf="logsContent && !loadingLogs" class="logs-viewer">
              <div class="logs-toolbar">
                <input type="text" class="log-filter-input" [(ngModel)]="logFilter" placeholder="Filtrer les logs...">
                <button class="btn btn-secondary btn-sm" (click)="copyLogs()">📋 Copier</button>
                <button class="btn btn-secondary btn-sm" (click)="downloadLogs()">💾</button>
              </div>
              <pre class="logs-output"><ng-container *ngFor="let line of getFilteredLogLines()"><span [class]="getLogLineClass(line)">{{ line }}
</span></ng-container></pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Synthèse réseau (P2.2) -->
      <div class="debug-card">
        <div class="debug-header" (click)="showNetworkInfo = !showNetworkInfo">
          <span class="expand-icon">{{ showNetworkInfo ? '▼' : '▶' }}</span>
          <span class="debug-icon">🌐</span>
          <h4>{{ 'debug.networkTitle' | translate }}</h4>
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
                <div class="network-card-detail" *ngIf="networkInfo.dns?.resolution_time_ms">
                  Résolution: {{ networkInfo.dns?.resolution_time_ms }}ms
                </div>
              </div>

              <!-- Passerelle -->
              <div class="network-card" [class.status-ok]="networkInfo.gateway?.reachable" [class.status-fail]="!networkInfo.gateway?.reachable">
                <div class="network-card-header">🚪 Passerelle</div>
                <div class="network-card-value">{{ networkInfo.gateway?.ip || 'N/A' }}</div>
                <div class="network-card-detail">
                  <span *ngIf="networkInfo.gateway?.reachable">✅ {{ 'debug.gatewayAccessible' | translate }}</span>
                  <span *ngIf="!networkInfo.gateway?.reachable">❌ {{ 'debug.gatewayNotAccessible' | translate }}</span>
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

            <!-- Stabilité -->
            <div class="wifi-section" *ngIf="networkInfo.stability">
              <h5>📈 Stabilité</h5>
              <div class="wifi-info">
                <span *ngIf="networkInfo.stability.interface_uptime_seconds !== null">
                  <strong>Uptime interface:</strong> {{ formatUptime(networkInfo.stability.interface_uptime_seconds!) }}
                </span>
                <span *ngIf="networkInfo.stability.reconnections_24h !== null"
                  [class.text-danger]="(networkInfo.stability.reconnections_24h ?? 0) > 5"
                  [class.text-success]="(networkInfo.stability.reconnections_24h ?? 0) === 0">
                  <strong>Reconnexions 24h:</strong> {{ networkInfo.stability.reconnections_24h }}
                </span>
              </div>
            </div>

            <!-- Interfaces réseau -->
            <div class="wifi-section" *ngIf="networkInfo.interfaces && networkInfo.interfaces.length > 0">
              <h5>🔌 Interfaces réseau</h5>
              <div class="interfaces-list">
                <div class="interface-row header">
                  <span>Interface</span>
                  <span>IP</span>
                  <span>Type</span>
                  <span>État</span>
                </div>
                <div class="interface-row" *ngFor="let iface of networkInfo.interfaces"
                  [class.interface-up]="iface.operstate === 'up'"
                  [class.interface-down]="iface.operstate !== 'up'">
                  <span class="interface-name">{{ iface.name }}</span>
                  <span class="interface-ip">{{ iface.ip4 || '-' }}</span>
                  <span class="interface-type">{{ iface.type }}</span>
                  <span class="interface-state">{{ iface.operstate === 'up' ? '✅' : '⚪' }} {{ iface.operstate }}</span>
                </div>
              </div>
            </div>

            <!-- Détails serveur central -->
            <div class="wifi-section" *ngIf="networkInfo.central_server">
              <h5>☁️ Détails serveur central</h5>
              <div class="wifi-info">
                <span *ngIf="networkInfo.central_server.http_latency_ms">
                  <strong>Latence HTTP:</strong> {{ networkInfo.central_server.http_latency_ms }}ms
                </span>
                <span *ngIf="networkInfo.central_server.ssl_valid !== null && networkInfo.central_server.ssl_valid !== undefined">
                  <strong>SSL:</strong> {{ networkInfo.central_server.ssl_valid ? '✅ Valide' : '❌ Invalide' }}
                </span>
                <span *ngIf="networkInfo.central_server.port_443_open !== null && networkInfo.central_server.port_443_open !== undefined">
                  <strong>Port 443:</strong> {{ networkInfo.central_server.port_443_open ? '✅ Ouvert' : '❌ Fermé' }}
                </span>
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
          <h4>{{ 'debug.bufferTitle' | translate }}</h4>
          <span class="debug-stats" *ngIf="bufferStatus">
            {{ bufferStatus.analytics?.event_count || 0 }} événements en attente
          </span>
        </div>

        <div class="debug-content" *ngIf="showBufferStatus">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ Le boîtier doit être connecté pour voir l'état du buffer.
          </div>

          <div *ngIf="isConnected && !bufferStatus && !loadingBufferStatus" class="buffer-actions">
            <button class="btn btn-primary btn-sm" (click)="loadBufferStatus()">
              🔄 Charger l'état du buffer
            </button>
          </div>

          <div *ngIf="loadingBufferStatus" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Récupération...</span>
          </div>

          <div *ngIf="bufferStatus && !loadingBufferStatus" class="buffer-content">
            <div class="buffer-grid">
              <!-- Unified analytics buffer -->
              <div class="buffer-card" [class.buffer-warning]="(bufferStatus.analytics?.event_count || 0) > 1000">
                <div class="buffer-header">📹 Lectures vidéo</div>
                <div class="buffer-count">{{ bufferStatus.analytics?.event_count || 0 }}</div>
                <div class="buffer-label">événements</div>
                <div class="buffer-details" *ngIf="bufferStatus.analytics?.file_exists">
                  <div class="buffer-detail">Taille: {{ formatBytes(bufferStatus.analytics?.file_size_bytes || 0) }}</div>
                  <div class="buffer-detail" *ngIf="bufferStatus.sponsors?.event_count">
                    dont {{ bufferStatus.sponsors?.event_count }} sponsors
                  </div>
                  <div class="buffer-detail" *ngIf="bufferStatus.analytics?.oldest_event">
                    Plus ancien: {{ bufferStatus.analytics?.oldest_event | date:'dd/MM HH:mm' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="buffer-hint" *ngIf="bufferStatus.legacy_sponsor_file">
              ⚠️ Fichier legacy <code>sponsor_impressions.json</code> détecté. Ce fichier est obsolète depuis la consolidation du pipeline (v3.66) et peut être supprimé.
            </div>

            <div class="buffer-hint" *ngIf="(bufferStatus.analytics?.event_count || 0) > 1000">
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
          <h4>{{ 'debug.hotspotTitle' | translate }}</h4>
          <span class="debug-stats" *ngIf="hotspotInfo">
            <span *ngIf="hotspotInfo.isActive" class="status-badge status-online">● Actif</span>
            <span *ngIf="!hotspotInfo.isActive" class="status-badge status-offline">● Inactif</span>
            <span *ngIf="hotspotInfo.clients > 0" class="client-count">👥 {{ hotspotInfo.clients }}</span>
          </span>
          <span class="debug-stats" *ngIf="!hotspotInfo && hotspotResult">
            <span *ngIf="hotspotResult.success">✅ {{ 'debug.hotspotVerified' | translate }}</span>
            <span *ngIf="!hotspotResult.success">❌ {{ 'debug.hotspotError' | translate }}</span>
          </span>
        </div>

        <div class="debug-content" *ngIf="showHotspotFix">
          <!-- Infos hotspot temps réel depuis local_config_mirror -->
          <div *ngIf="hotspotInfo" class="hotspot-live-info">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">SSID</span>
                <span class="info-value">{{ hotspotInfo.ssid || 'N/A' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Canal</span>
                <span class="info-value" [class.channel-crowded]="hotspotInfo.channel === 1 || hotspotInfo.channel === 6">
                  {{ hotspotInfo.channel || 'N/A' }}
                  <span *ngIf="hotspotInfo.channel === 1 || hotspotInfo.channel === 6" class="channel-warning" title="Canal potentiellement encombré">⚠️</span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">État</span>
                <span class="info-value" [class.text-success]="hotspotInfo.isActive" [class.text-danger]="!hotspotInfo.isActive">
                  {{ hotspotInfo.isActive ? '✅' : '❌' }} {{ (hotspotInfo.isActive ? 'sites.status.active' : 'sites.status.inactive') | translate }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Clients connectés</span>
                <span class="info-value">👥 {{ hotspotInfo.clients || 0 }}</span>
              </div>
            </div>
          </div>

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

            <!-- Modal de confirmation de reboot -->
            <div *ngIf="showRebootConfirmModal" class="modal-overlay">
              <div class="modal-content reboot-modal">
                <h3>⚠️ Redémarrage nécessaire</h3>
                <p>
                  Le canal WiFi a été changé de <strong>{{ hotspotResult?.fix?.oldChannel }}</strong>
                  à <strong>{{ hotspotResult?.fix?.newChannel }}</strong>.
                </p>
                <p>
                  Pour appliquer ce changement, le boîtier doit redémarrer
                  (~1 minute d'interruption).
                </p>
                <p class="reboot-warning">
                  ⚠️ La TV et la télécommande seront indisponibles pendant le redémarrage.
                </p>
                <div class="modal-actions">
                  <button class="btn btn-secondary" (click)="cancelReboot()">
                    {{ 'debug.later' | translate }}
                  </button>
                  <button class="btn btn-danger" (click)="confirmReboot()" [disabled]="rebooting">
                    {{ rebooting ? ('debug.rebooting' | translate) : ('debug.rebootNow' | translate) }}
                  </button>
                </div>
              </div>
            </div>

            <div *ngIf="hotspotResult && !fixingHotspot && !showRebootConfirmModal" class="hotspot-result">
              <!-- Nouveau format JSON du script -->
              <div *ngIf="hotspotResult.diagnostic" class="hotspot-diagnostic">
                <div class="diagnostic-grid">
                  <div class="diagnostic-item">
                    <span class="diagnostic-label">{{ 'debug.currentChannel' | translate }}</span>
                    <span class="diagnostic-value">{{ hotspotResult.diagnostic.currentChannel }}</span>
                  </div>
                  <div class="diagnostic-item" *ngIf="hotspotResult.diagnostic.recommendedChannel !== hotspotResult.diagnostic.currentChannel">
                    <span class="diagnostic-label">{{ 'debug.recommendedChannel' | translate }}</span>
                    <span class="diagnostic-value recommended">{{ hotspotResult.diagnostic.recommendedChannel }}</span>
                  </div>
                  <div class="diagnostic-item">
                    <span class="diagnostic-label">SSID</span>
                    <span class="diagnostic-value">{{ hotspotResult.diagnostic.ssid }}</span>
                  </div>
                  <div class="diagnostic-item">
                    <span class="diagnostic-label">hostapd</span>
                    <span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.hostapdActive" [class.text-danger]="!hotspotResult.diagnostic.hostapdActive">
                      {{ hotspotResult.diagnostic.hostapdActive ? ('debug.activeStatus' | translate) : ('debug.inactiveStatus' | translate) }}
                    </span>
                  </div>
                  <div class="diagnostic-item">
                    <span class="diagnostic-label">dnsmasq</span>
                    <span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.dnsmasqActive" [class.text-danger]="!hotspotResult.diagnostic.dnsmasqActive">
                      {{ hotspotResult.diagnostic.dnsmasqActive ? ('debug.activeStatus' | translate) : ('debug.inactiveStatus' | translate) }}
                    </span>
                  </div>
                  <div class="diagnostic-item">
                    <span class="diagnostic-label">{{ 'debug.power' | translate }}</span>
                    <span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.powerOk" [class.text-danger]="!hotspotResult.diagnostic.powerOk">
                      {{ hotspotResult.diagnostic.powerOk ? ('debug.powerOk' | translate) : ('debug.powerProblem' | translate) }}
                    </span>
                  </div>
                </div>

                <!-- Message si canal changé mais en attente de reboot -->
                <div *ngIf="hotspotResult.fix?.channelChanged && hotspotResult.fix?.needsReboot" class="pending-reboot-info">
                  <p>✅ Canal changé de {{ hotspotResult.fix?.oldChannel }} à {{ hotspotResult.fix?.newChannel }}.</p>
                  <p>ℹ️ Le changement sera appliqué au prochain redémarrage du boîtier.</p>
                </div>

                <!-- Message du script -->
                <div *ngIf="hotspotResult.message" class="diagnostic-message">
                  {{ hotspotResult.message }}
                </div>
              </div>

              <!-- Ancien format : résultat structuré (checks) -->
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

              <!-- Sortie brute si script exécuté (fallback) -->
              <div *ngIf="hotspotResult.output && !hotspotResult.diagnostic" class="hotspot-output">
                <pre class="output-viewer">{{ hotspotResult.output }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- WiFi Client (wlan1) - Mesh Detection -->
      <div class="debug-card">
        <div class="debug-header" (click)="toggleWifiBssid()">
          <span class="expand-icon">{{ showWifiBssid ? '▼' : '▶' }}</span>
          <span class="debug-icon">📶</span>
          <h4>{{ 'debug.wifiClient' | translate }}</h4>
          <span class="debug-stats" *ngIf="wifiBssidStatus">
            <span *ngIf="wifiBssidStatus.connected" class="status-badge status-online">● {{ 'debug.wifiConnected' | translate }}</span>
            <span *ngIf="!wifiBssidStatus.connected" class="status-badge status-offline">● {{ 'debug.wifiDisconnected' | translate }}</span>
            <span *ngIf="wifiBssidStatus.isMeshEnvironment" class="mesh-badge">🔀 {{ 'debug.meshDetected' | translate }} ({{ wifiBssidStatus.meshApCount }} APs)</span>
            <span *ngIf="wifiBssidStatus.bssidLocked" class="bssid-lock-badge">🔒 {{ 'debug.bssidLocked' | translate }}</span>
          </span>
          <span class="debug-stats" *ngIf="!wifiBssidStatus && !loadingWifiBssid">{{ 'debug.notLoaded' | translate }}</span>
          <span class="debug-stats" *ngIf="loadingWifiBssid">{{ 'common.loading' | translate }}</span>
        </div>

        <div class="debug-content" *ngIf="showWifiBssid">
          <div *ngIf="!isConnected" class="offline-warning">
            ⚠️ {{ 'debug.wifiOfflineWarning' | translate }}
          </div>

          <div *ngIf="isConnected && !wifiBssidStatus && !loadingWifiBssid" class="wifi-actions">
            <button class="btn btn-primary btn-sm" (click)="loadWifiBssidStatus()">
              🔄 {{ 'debug.loadWifiStatus' | translate }}
            </button>
          </div>

          <div *ngIf="loadingWifiBssid" class="loading-inline">
            <div class="spinner-small"></div>
            <span>{{ 'debug.loadingWifi' | translate }}</span>
          </div>

          <div *ngIf="wifiBssidStatus" class="wifi-bssid-content">
            <!-- Avertissement mesh avec BSSID lock -->
            <div *ngIf="wifiBssidStatus.isMeshEnvironment && wifiBssidStatus.bssidLocked" class="mesh-warning-banner">
              <div class="warning-icon">⚠️</div>
              <div class="warning-content">
                <strong>{{ 'debug.meshWarningTitle' | translate }}</strong>
                <p>
                  {{ wifiBssidStatus.meshApCount }} {{ 'debug.meshWarningText' | translate }} "{{ wifiBssidStatus.ssid }}".
                  {{ 'debug.meshWarningText2' | translate }}
                </p>
                <div class="warning-actions">
                  <button class="btn btn-warning btn-sm" (click)="removeBssidLock()" [disabled]="removingBssidLock">
                    {{ removingBssidLock ? ('⏳ ' + ('debug.removingBssidLock' | translate)) : ('🔓 ' + ('debug.removeBssidLock' | translate)) }}
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="optimizeForMesh()" [disabled]="optimizingMesh">
                    {{ optimizingMesh ? ('⏳ ' + ('debug.optimizingMesh' | translate)) : ('🔧 ' + ('debug.optimizeForMesh' | translate)) }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Info mesh sans verrouillage -->
            <div *ngIf="wifiBssidStatus.isMeshEnvironment && !wifiBssidStatus.bssidLocked" class="mesh-info-banner">
              <div class="info-icon">ℹ️</div>
              <div class="info-content">
                <strong>{{ 'debug.meshInfoTitle' | translate }}</strong>
                <p>{{ wifiBssidStatus.meshApCount }} {{ 'debug.meshInfoText' | translate }} "{{ wifiBssidStatus.ssid }}". {{ 'debug.roamingActive' | translate }}</p>
              </div>
            </div>

            <!-- Détails WiFi -->
            <div class="wifi-info-grid">
              <div class="info-item">
                <span class="info-label">SSID</span>
                <span class="info-value">{{ wifiBssidStatus.ssid || ('debug.notAvailable' | translate) }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">BSSID ({{ 'debug.accessPoint' | translate }})</span>
                <span class="info-value">{{ wifiBssidStatus.bssid || ('debug.notAvailable' | translate) }}</span>
              </div>
              <div class="info-item" *ngIf="wifiBssidStatus.bssidLocked">
                <span class="info-label">{{ 'debug.lockedBssid' | translate }}</span>
                <span class="info-value bssid-locked">🔒 {{ wifiBssidStatus.bssidLocked }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">{{ 'debug.signal' | translate }}</span>
                <span class="info-value" [class.signal-good]="wifiBssidStatus.signal && wifiBssidStatus.signal > -60"
                  [class.signal-medium]="wifiBssidStatus.signal && wifiBssidStatus.signal <= -60 && wifiBssidStatus.signal > -75"
                  [class.signal-weak]="wifiBssidStatus.signal && wifiBssidStatus.signal <= -75">
                  {{ wifiBssidStatus.signal ? wifiBssidStatus.signal + ' dBm' : ('debug.notAvailable' | translate) }}
                  {{ wifiBssidStatus.signal && wifiBssidStatus.signal > -60 ? '📶' : '' }}
                  {{ wifiBssidStatus.signal && wifiBssidStatus.signal <= -60 && wifiBssidStatus.signal > -75 ? '📶' : '' }}
                  {{ wifiBssidStatus.signal && wifiBssidStatus.signal <= -75 ? '📶' : '' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">{{ 'debug.ipAddress' | translate }}</span>
                <span class="info-value">{{ wifiBssidStatus.ipAddress || ('debug.notAvailable' | translate) }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">{{ 'debug.environment' | translate }}</span>
                <span class="info-value">
                  {{ wifiBssidStatus.isMeshEnvironment ? ('🔀 ' + ('debug.meshDetected' | translate) + ' (' + wifiBssidStatus.meshApCount + ' APs)') : ('📡 ' + ('debug.standard' | translate)) }}
                </span>
              </div>
            </div>

            <div class="wifi-refresh">
              <button class="btn btn-secondary btn-sm" (click)="loadWifiBssidStatus()" [disabled]="loadingWifiBssid">
                🔄 {{ 'debug.refresh' | translate }}
              </button>
            </div>
          </div>

          <!-- WiFi Client Configuration (scan & connect wlan1) -->
          <div class="wifi-config-section" *ngIf="isConnected">
            <h5>{{ 'debug.wifiConfig' | translate }}</h5>

            <div class="wifi-scan-actions">
              <button class="btn btn-primary btn-sm" (click)="scanWifiNetworks()" [disabled]="scanningWifi || connectingWifi">
                📡 {{ scanningWifi ? ('debug.scanningWifi' | translate) : ('debug.scanNetworks' | translate) }}
              </button>
            </div>

            <!-- Scanning spinner -->
            <div *ngIf="scanningWifi" class="loading-inline">
              <div class="spinner-small"></div>
              <span>{{ 'debug.scanningWifi' | translate }}</span>
            </div>

            <!-- Scan error -->
            <div *ngIf="wifiScanResult && !wifiScanResult.success && wifiScanResult.error" class="wifi-scan-error">
              ⚠️ {{ wifiScanResult.error }}
            </div>

            <!-- Scan results -->
            <div *ngIf="wifiScanResult && wifiScanResult.success && !scanningWifi" class="wifi-networks-list">
              <div class="scan-info">
                {{ wifiScanResult.networks.length }} {{ 'debug.networksFound' | translate }}
                <span class="scan-time">{{ wifiScanResult.scannedAt | date:'HH:mm:ss' }}</span>
              </div>

              <div *ngFor="let network of wifiScanResult.networks"
                class="wifi-network-item"
                [class.selected]="selectedWifiNetwork?.ssid === network.ssid && selectedWifiNetwork?.bssid === network.bssid"
                [class.current-network]="wifiScanResult.currentSsid === network.ssid"
                (click)="selectWifiNetwork(network)">
                <div class="network-info">
                  <span class="network-ssid">{{ network.ssid }}</span>
                  <span class="network-details">{{ network.security }} · ch.{{ network.channel }}</span>
                </div>
                <div class="network-signal">
                  <span [class]="getWifiSignalClass(network.signal)">
                    {{ network.signal }} dBm
                  </span>
                  <span *ngIf="wifiScanResult.currentSsid === network.ssid" class="current-badge">
                    ✓ {{ 'debug.currentNetwork' | translate }}
                  </span>
                </div>
              </div>

              <!-- Connect form when a network is selected -->
              <div *ngIf="selectedWifiNetwork" class="wifi-connect-form">
                <div class="connect-target">
                  {{ 'debug.connectTo' | translate }} <strong>{{ selectedWifiNetwork.ssid }}</strong>
                  ({{ selectedWifiNetwork.security }})
                </div>

                <div *ngIf="selectedWifiNetwork.security !== 'Open'" class="password-input-group">
                  <label>{{ 'debug.wifiPassword' | translate }}</label>
                  <input
                    type="password"
                    [(ngModel)]="wifiPassword"
                    [placeholder]="'debug.wifiPasswordPlaceholder' | translate"
                    class="form-control"
                    (keyup.enter)="connectWifiClient()"
                  />
                </div>

                <div class="connect-actions">
                  <button
                    class="btn btn-success btn-sm"
                    (click)="connectWifiClient()"
                    [disabled]="connectingWifi || (selectedWifiNetwork.security !== 'Open' && (!wifiPassword || wifiPassword.length < 8))">
                    {{ connectingWifi ? ('debug.connectingWifi' | translate) : ('debug.connectWifi' | translate) }}
                  </button>
                </div>

                <!-- Connection result -->
                <div *ngIf="wifiConnectResult" class="wifi-connect-result"
                  [class.connect-success]="wifiConnectResult.connected"
                  [class.connect-pending]="!wifiConnectResult.connected">
                  <div>{{ wifiConnectResult.message }}</div>
                  <div *ngIf="wifiConnectResult.ipAddress">IP: {{ wifiConnectResult.ipAddress }}</div>
                </div>
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
          <h4>{{ 'debug.exportTitle' | translate }}</h4>
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
          <h4>{{ 'debug.timelineTitle' | translate }}</h4>
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

          <div *ngIf="!loadingTimeline && timelineEvents.length > 0" class="timeline-filter-bar">
            <button class="btn btn-sm" [class.btn-primary]="!timelineTypeFilter" [class.btn-secondary]="timelineTypeFilter" (click)="timelineTypeFilter = ''">Tous</button>
            <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'deployment'" [class.btn-secondary]="timelineTypeFilter !== 'deployment'" (click)="timelineTypeFilter = 'deployment'">📹 Déploiements</button>
            <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'command'" [class.btn-secondary]="timelineTypeFilter !== 'command'" (click)="timelineTypeFilter = 'command'">⚡ Commandes</button>
            <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'config'" [class.btn-secondary]="timelineTypeFilter !== 'config'" (click)="timelineTypeFilter = 'config'">⚙️ Config</button>
            <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'alert'" [class.btn-secondary]="timelineTypeFilter !== 'alert'" (click)="timelineTypeFilter = 'alert'">⚠️ Alertes</button>
          </div>

          <div *ngIf="!loadingTimeline && timelineEvents.length > 0" class="timeline">
            <div class="timeline-item" *ngFor="let event of getFilteredTimeline()"
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
                <div class="timeline-details" *ngIf="event.details && hasDetails(event.details)">
                  <div class="detail-item" *ngFor="let key of getDetailKeys(event.details)">
                    <span class="detail-key">{{ key }}:</span>
                    <span class="detail-value">{{ formatDetailValue(event.details[key]) }}</span>
                  </div>
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

      <!-- Modal de confirmation générique -->
      <div *ngIf="confirmModal.visible" class="modal-overlay" (click)="cancelConfirmModal()">
        <div class="modal-content confirm-modal" (click)="$event.stopPropagation()">
          <h3>{{ confirmModal.icon }} {{ confirmModal.title }}</h3>
          <p>{{ confirmModal.message }}</p>
          <p class="reboot-warning" *ngIf="confirmModal.warning">⚠️ {{ confirmModal.warning }}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="cancelConfirmModal()">Annuler</button>
            <button class="btn" [class.btn-danger]="confirmModal.danger" [class.btn-primary]="!confirmModal.danger"
              (click)="executeConfirmModal()" [disabled]="confirmModal.executing">
              {{ confirmModal.executing ? '⏳...' : confirmModal.confirmLabel }}
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

    /* Summary bar */
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .summary-pill {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .summary-pill.pill-ok {
      background: #f0fdf4;
      color: #166534;
      border-color: #bbf7d0;
    }

    .summary-pill.pill-warning {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }

    .summary-pill.pill-error {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .pill-icon {
      font-size: 0.8125rem;
    }

    .pill-detail {
      font-size: 0.6875rem;
      opacity: 0.8;
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

    .file-sortable {
      cursor: pointer;
      user-select: none;
    }

    .file-sortable:hover {
      color: #2563eb;
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

    /* Current config card (merged into history) */
    .current-config-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      margin-top: 1rem;
    }

    .current-config-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .current-config-header h5 {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .current-config-actions {
      display: flex;
      gap: 0.5rem;
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

    /* HDMI-CEC */
    .health-metric.metric-ok {
      background: #dcfce7;
    }

    .cec-last-check {
      margin-top: 0.5rem;
      text-align: right;
    }

    .cec-error {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #fef3c7;
      border-radius: 4px;
    }

    .monitor-notice {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: #eff6ff;
      border-radius: 6px;
      border-left: 3px solid #3b82f6;
      font-size: 0.85rem;
      color: #1e40af;
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

    .diagnostics-subsection {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 2px dashed #e2e8f0;
    }

    .diagnostics-badge {
      font-size: 0.75rem;
      font-weight: 500;
      background: #f1f5f9;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      margin-left: 0.5rem;
      color: #64748b;
    }

    .diagnostics-hint {
      margin: 0 0 0.75rem 0;
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

    .logs-toolbar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      align-items: center;
    }

    .log-filter-input {
      flex: 1;
      padding: 0.375rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.8125rem;
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
      margin: 0;
    }

    .log-error {
      color: #fca5a5;
    }

    .log-warn {
      color: #fde68a;
    }

    .log-debug {
      color: #94a3b8;
    }

    .log-info {
      color: #e2e8f0;
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

    /* System info bar (hostname, OS, IP) */
    .system-info-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .system-tag {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #f1f5f9;
      border-radius: 4px;
      color: #475569;
      font-family: 'SF Mono', Monaco, monospace;
    }

    /* Interfaces list */
    .interfaces-list {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .interface-row {
      display: grid;
      grid-template-columns: 100px 1fr 80px 80px;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }

    .interface-row:last-child {
      border-bottom: none;
    }

    .interface-row.header {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 0.6875rem;
      text-transform: uppercase;
    }

    .interface-row.interface-up {
      background: #f0fdf4;
    }

    .interface-name {
      font-family: 'SF Mono', Monaco, monospace;
      font-weight: 500;
    }

    .interface-ip {
      font-family: 'SF Mono', Monaco, monospace;
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

    /* Hotspot live info */
    .hotspot-live-info {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      border: 1px solid #e2e8f0;
    }

    .hotspot-live-info .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .hotspot-live-info .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .hotspot-live-info .info-label {
      font-size: 0.6875rem;
      font-weight: 500;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .hotspot-live-info .info-value {
      font-size: 0.875rem;
      color: #1e293b;
      font-weight: 500;
    }

    .hotspot-live-info .channel-warning {
      margin-left: 0.25rem;
      cursor: help;
    }

    .client-count {
      margin-left: 0.5rem;
      background: #dbeafe;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .status-badge {
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-online {
      background: #dcfce7;
      color: #166534;
    }

    .status-offline {
      background: #fee2e2;
      color: #991b1b;
    }

    .text-success {
      color: #16a34a;
    }

    .text-danger {
      color: #dc2626;
    }

    /* Modal de confirmation reboot */
    .modal-overlay {
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
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .reboot-modal h3 {
      margin: 0 0 1rem 0;
      font-size: 1.125rem;
      color: #f59e0b;
    }

    .reboot-modal p {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #475569;
    }

    .reboot-warning {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 0.75rem;
      color: #92400e;
      font-weight: 500;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-top: 1.5rem;
    }

    .btn-danger {
      background: #dc2626;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-danger:hover {
      background: #b91c1c;
    }

    .btn-danger:disabled {
      background: #f87171;
      cursor: not-allowed;
    }

    .confirm-modal h3 {
      margin: 0 0 1rem 0;
      font-size: 1.125rem;
      color: #1e293b;
    }

    .confirm-modal p {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      color: #475569;
    }

    /* Diagnostic grid */
    .diagnostic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .diagnostic-item {
      background: #f8fafc;
      padding: 0.75rem;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .diagnostic-label {
      display: block;
      font-size: 0.6875rem;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .diagnostic-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
    }

    .diagnostic-value.recommended {
      color: #16a34a;
    }

    .pending-reboot-info {
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 6px;
      padding: 0.75rem;
      margin-top: 1rem;
    }

    .pending-reboot-info p {
      margin: 0 0 0.5rem 0;
      font-size: 0.8125rem;
      color: #166534;
    }

    .pending-reboot-info p:last-child {
      margin-bottom: 0;
    }

    .diagnostic-message {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #f1f5f9;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #475569;
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

    /* WiFi BSSID / Mesh Detection */
    .wifi-bssid-content {
      padding-top: 1rem;
    }

    .wifi-actions {
      padding-top: 1rem;
    }

    .mesh-warning-banner {
      display: flex;
      gap: 0.75rem;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .mesh-warning-banner .warning-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .mesh-warning-banner .warning-content strong {
      color: #92400e;
      display: block;
      margin-bottom: 0.25rem;
    }

    .mesh-warning-banner .warning-content p {
      font-size: 0.8125rem;
      color: #78350f;
      margin: 0 0 0.75rem 0;
    }

    .mesh-warning-banner .warning-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .mesh-info-banner {
      display: flex;
      gap: 0.75rem;
      background: rgba(0, 123, 255, 0.1);
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .mesh-info-banner .info-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .mesh-info-banner .info-content strong {
      color: #1e40af;
      display: block;
      margin-bottom: 0.125rem;
    }

    .mesh-info-banner .info-content p {
      font-size: 0.8125rem;
      color: #3b82f6;
      margin: 0;
    }

    .wifi-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .wifi-info-grid .info-item {
      background: #f8fafc;
      padding: 0.75rem;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .wifi-info-grid .info-label {
      display: block;
      font-size: 0.6875rem;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .wifi-info-grid .info-value {
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
    }

    .wifi-info-grid .info-value.bssid-locked {
      color: #dc2626;
    }

    .wifi-info-grid .info-value.signal-good {
      color: #16a34a;
    }

    .wifi-info-grid .info-value.signal-medium {
      color: #ca8a04;
    }

    .wifi-info-grid .info-value.signal-weak {
      color: #dc2626;
    }

    .wifi-refresh {
      margin-top: 0.75rem;
    }

    .mesh-badge {
      background: #dbeafe;
      color: #1e40af;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }

    .bssid-lock-badge {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }

    /* WiFi Client Configuration (scan & connect) */
    .wifi-config-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .wifi-config-section h5 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #334155;
    }

    .wifi-scan-actions {
      margin-bottom: 0.75rem;
    }

    .wifi-scan-error {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 0.75rem;
      margin-top: 0.5rem;
      font-size: 0.813rem;
      color: #92400e;
    }

    .wifi-networks-list {
      margin-top: 0.75rem;
    }

    .scan-info {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .scan-time {
      margin-left: 0.5rem;
      font-style: italic;
    }

    .wifi-network-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 0.25rem;
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
      font-size: 0.813rem;
    }

    .wifi-network-item:hover {
      background-color: #f8fafc;
    }

    .wifi-network-item.selected {
      border-color: #3b82f6;
      background-color: #eff6ff;
    }

    .wifi-network-item.current-network {
      border-left: 3px solid #16a34a;
    }

    .network-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .network-ssid {
      font-weight: 500;
    }

    .network-details {
      font-size: 0.688rem;
      color: #94a3b8;
    }

    .network-signal {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
    }

    .current-badge {
      font-size: 0.688rem;
      color: #16a34a;
      font-weight: 600;
    }

    .wifi-connect-form {
      margin-top: 0.75rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .connect-target {
      margin-bottom: 0.5rem;
      font-size: 0.813rem;
    }

    .password-input-group {
      margin-bottom: 0.5rem;
    }

    .password-input-group label {
      display: block;
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.25rem;
    }

    .password-input-group .form-control {
      width: 100%;
      padding: 0.375rem 0.625rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.813rem;
    }

    .connect-actions {
      margin-top: 0.5rem;
    }

    .wifi-connect-result {
      margin-top: 0.625rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      font-size: 0.813rem;
    }

    .wifi-connect-result.connect-success {
      background-color: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }

    .wifi-connect-result.connect-pending {
      background-color: #fef9c3;
      color: #854d0e;
      border: 1px solid #fde047;
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

    .timeline-details {
      margin-top: 0.375rem;
      padding-top: 0.375rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
    }

    .detail-item {
      font-size: 0.6875rem;
      color: #64748b;
    }

    .detail-key {
      font-weight: 500;
    }

    .detail-value {
      font-family: 'SF Mono', Monaco, monospace;
    }

    .timeline-filter-bar {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .timeline-actions {
      margin-top: 1rem;
    }

    /* Diagnostic guidé (F-AUD-08) */
    .wizard-card {
      border: 2px solid #e0e7ff;
      background: linear-gradient(135deg, #fefefe 0%, #f8faff 100%);
    }

    .wizard-steps-indicator {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding-top: 0.5rem;
    }

    .wizard-step-dot {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #e2e8f0;
      border: 2px solid transparent;
    }

    .wizard-step-dot:hover {
      transform: scale(1.1);
    }

    .dot-number {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
    }

    .dot-active {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    .dot-ok {
      background: #dcfce7;
    }
    .dot-ok .dot-number {
      color: #15803d;
    }

    .dot-warning {
      background: #fef3c7;
    }
    .dot-warning .dot-number {
      color: #92400e;
    }

    .dot-error {
      background: #fee2e2;
    }
    .dot-error .dot-number {
      color: #dc2626;
    }

    .dot-checking {
      background: #dbeafe;
      animation: pulse-dot 1.2s ease-in-out infinite;
    }
    .dot-checking .dot-number {
      color: #1e40af;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .dot-pending {
      background: #f1f5f9;
    }

    .wizard-start {
      text-align: center;
      padding: 1rem 0;
    }

    .wizard-intro {
      color: #475569;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      line-height: 1.5;
    }

    .wizard-step-content {
      padding: 0.5rem 0;
    }

    .wizard-step-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .wizard-step-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      margin-top: 0.1rem;
    }

    .wizard-step-title h5 {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
    }

    .wizard-step-subtitle {
      display: block;
      font-size: 0.8125rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .wizard-step-details {
      background: #f8fafc;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .wizard-detail-item {
      font-size: 0.8125rem;
      color: #334155;
      padding: 0.25rem 0;
    }

    .wizard-step-suggestions {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .wizard-step-suggestions h6 {
      margin: 0 0 0.5rem 0;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #92400e;
    }

    .wizard-step-suggestions ul {
      margin: 0;
      padding-left: 1.25rem;
    }

    .wizard-step-suggestions li {
      font-size: 0.8125rem;
      color: #78350f;
      padding: 0.125rem 0;
    }

    .wizard-summary {
      margin-bottom: 1rem;
    }

    .wizard-summary-score {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 10px;
      margin-bottom: 1rem;
    }

    .summary-ok {
      background: #dcfce7;
      border: 1px solid #86efac;
    }

    .summary-warning {
      background: #fef3c7;
      border: 1px solid #fde68a;
    }

    .summary-error {
      background: #fee2e2;
      border: 1px solid #fca5a5;
    }

    .summary-score-value {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .summary-ok .summary-score-value {
      color: #15803d;
    }

    .summary-warning .summary-score-value {
      color: #92400e;
    }

    .summary-error .summary-score-value {
      color: #dc2626;
    }

    .summary-score-label {
      font-size: 0.9375rem;
      font-weight: 500;
    }

    .summary-ok .summary-score-label {
      color: #166534;
    }

    .summary-warning .summary-score-label {
      color: #78350f;
    }

    .summary-error .summary-score-label {
      color: #991b1b;
    }

    .wizard-checklist {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .wizard-checklist-item {
      font-size: 0.8125rem;
      color: #334155;
      padding: 0.375rem 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
    }

    .wizard-nav {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding-top: 0.75rem;
      border-top: 1px solid #f1f5f9;
    }

    .wizard-nav-spacer {
      flex: 1;
    }
  `]
})
export class SiteDebugTabComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() connectionHealth: ConnectionHealth | null = null;
  @Output() configRestored = new EventEmitter<SiteConfiguration>();

  // ViewChild pour scroll automatique vers les modals
  @ViewChild('versionModal') versionModalRef?: ElementRef<HTMLElement>;
  @ViewChild('diffModal') diffModalRef?: ElementRef<HTMLElement>;
  private shouldScrollToVersionModal = false;
  private shouldScrollToDiffModal = false;

  localVideos: LocalVideo[] = [];
  localStorage: LocalStorage | null = null;
  lastVideoSync: string | null = null;
  lastConfigSync: string | null = null;
  configHash: string | null = null;
  configJson: string = '{}';

  showFiles: boolean = false;
  showJson: boolean = false;
  fileSortField: 'filename' | 'category' | 'size' = 'filename';
  fileSortAsc: boolean = true;
  showHistory: boolean = false;
  showTerminal: boolean = false;
  showHealthStatus: boolean = false;

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
  logFilter: string = '';

  // Network (P2.2)
  showNetworkInfo: boolean = false;
  networkInfo: NetworkDiagnostics | null = null;
  loadingNetworkInfo: boolean = false;

  // Buffer Status (P2.3)
  showBufferStatus: boolean = false;
  bufferStatus: BufferStatus | null = null;
  loadingBufferStatus: boolean = false;
  private bufferPollSubscription: Subscription | null = null;

  // Hotspot (P2.4)
  showHotspotFix: boolean = false;
  hotspotResult: HotspotResult | null = null;
  fixingHotspot: boolean = false;
  hotspotInfo: { ssid: string | null; channel: number | null; clients: number; isActive: boolean } | null = null;
  showRebootConfirmModal: boolean = false;
  rebooting: boolean = false;

  // WiFi BSSID / Mesh detection
  showWifiBssid: boolean = false;
  wifiBssidStatus: WifiBssidStatus | null = null;
  loadingWifiBssid: boolean = false;
  removingBssidLock: boolean = false;
  optimizingMesh: boolean = false;

  // WiFi Client Configuration (scan & connect wlan1)
  wifiScanResult: WifiScanResult | null = null;
  scanningWifi: boolean = false;
  selectedWifiNetwork: WifiNetwork | null = null;
  wifiPassword: string = '';
  connectingWifi: boolean = false;
  wifiConnectResult: { connected: boolean; ipAddress: string | null; message: string } | null = null;

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
  timelineTypeFilter: string = '';

  // Modal de confirmation générique
  confirmModal: {
    visible: boolean;
    title: string;
    message: string;
    warning: string;
    confirmLabel: string;
    danger: boolean;
    icon: string;
    executing: boolean;
    onConfirm: (() => void) | null;
  } = {
    visible: false, title: '', message: '', warning: '', confirmLabel: 'Confirmer',
    danger: false, icon: '', executing: false, onConfirm: null
  };

  // Diagnostic guidé (F-AUD-08)
  showWizard: boolean = false;
  wizardRunning: boolean = false;
  wizardCompleted: boolean = false;
  wizardCurrentStep: number = 0;
  private wizardBufferPollSub: Subscription | null = null;
  wizardSteps: WizardStep[] = [
    { id: 1, title: 'Connectivit\u00e9', icon: '\uD83D\uDD0C', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 2, title: 'Vid\u00e9os', icon: '\uD83C\uDFAC', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 3, title: 'Boucle de diffusion', icon: '\uD83D\uDD01', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 4, title: 'Impressions r\u00e9centes', icon: '\uD83D\uDCCA', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 5, title: 'Diagnostic complet', icon: '\uD83D\uDCCB', status: 'pending', message: '', details: [], suggestions: [] },
  ];

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.loadDebugInfo();
  }

  ngOnDestroy(): void {
    this.bufferPollSubscription?.unsubscribe();
    this.wizardBufferPollSub?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    // Scroll vers le modal de version si demandé
    if (this.shouldScrollToVersionModal && this.versionModalRef) {
      this.versionModalRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.shouldScrollToVersionModal = false;
    }
    // Scroll vers le modal de diff si demandé
    if (this.shouldScrollToDiffModal && this.diffModalRef) {
      this.diffModalRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.shouldScrollToDiffModal = false;
    }
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
        this.hotspotInfo = response.hotspotInfo || null;

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
    if (bytes === null || bytes === undefined || bytes <= 0 || !isFinite(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  sortFiles(field: 'filename' | 'category' | 'size'): void {
    if (this.fileSortField === field) {
      this.fileSortAsc = !this.fileSortAsc;
    } else {
      this.fileSortField = field;
      this.fileSortAsc = field === 'size' ? false : true; // Size defaults to descending
    }
  }

  getSortedVideos(): LocalVideo[] {
    return [...this.localVideos].sort((a, b) => {
      let cmp = 0;
      switch (this.fileSortField) {
        case 'filename':
          cmp = (a.filename || '').localeCompare(b.filename || '');
          break;
        case 'category':
          cmp = (a.category || '').localeCompare(b.category || '');
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
      }
      return this.fileSortAsc ? cmp : -cmp;
    });
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
    this.shouldScrollToVersionModal = true;  // Scroll vers le modal après rendu
  }

  restoreVersion(item: ConfigHistory): void {
    if (!item.configuration) {
      this.notificationService.error('Configuration non disponible pour cette version');
      return;
    }

    const dateStr = new Date(item.deployed_at).toLocaleString();
    this.showConfirmModal({
      title: 'Restaurer la configuration',
      message: `Restaurer et déployer la configuration du ${dateStr} ? Cela va remplacer la configuration actuelle sur le boîtier.`,
      warning: 'La configuration en cours sera écrasée.',
      confirmLabel: '🔄 Restaurer',
      danger: true,
      icon: '📜',
      onConfirm: () => this.doRestoreVersion(item),
    });
  }

  private doRestoreVersion(item: ConfigHistory): void {
    this.confirmModal.visible = false;
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
        this.executingCommand = false;
        this.showConfirmModal({
          title: 'Redémarrer le Raspberry Pi',
          message: 'Le boîtier va redémarrer. La TV et la télécommande seront indisponibles pendant environ 1 minute.',
          warning: 'Le contenu ne sera pas diffusé pendant le redémarrage.',
          confirmLabel: '🔄 Redémarrer',
          danger: true,
          icon: '🔌',
          onConfirm: () => {
            this.confirmModal.visible = false;
            this.doExecuteCommand('reboot', {});
          },
        });
        return;
    }

    this.doExecuteCommand(commandType, params);
  }

  private doExecuteCommand(commandType: string, params: Record<string, unknown>): void {
    this.executingCommand = true;
    this.commandResult = '';

    this.sitesService.sendCommand(this.siteId, commandType, params).subscribe({
      next: (response) => {
        this.executingCommand = false;
        this.commandResult = JSON.stringify(response, null, 2);
        this.notificationService.success(`Commande "${commandType}" envoyée avec succès`);
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

    this.sitesService.getHealthStatus(this.siteId).subscribe({
      next: (result) => {
        this.loadingHealthStatus = false;
        this.logger.info('Health status received', { result });
        if (result && result.healthScore !== undefined) {
          this.healthStatus = result;
        } else {
          this.logger.warn('Invalid health status response', { result });
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

  getTvPowerLabel(power: string | null): string {
    switch (power) {
      case 'on': return '✅ Allumée';
      case 'standby': return '🔴 En veille';
      case 'transitioning': return '⏳ Transition...';
      case 'unknown': return '❓ Inconnu';
      default: return '❓ Non détecté';
    }
  }

  getDisplaySectionIcon(displayInfo?: DisplayInfo): string {
    if (!displayInfo) return '📺';
    switch (displayInfo.display_type) {
      case 'monitor': return '🖥️';
      case 'tv': return '📺';
      case 'projector': return '📽️';
      default: return '📺';
    }
  }

  getDisplaySectionTitle(displayInfo?: DisplayInfo): string {
    if (!displayInfo || !displayInfo.connected) return 'État TV (HDMI-CEC)';
    switch (displayInfo.display_type) {
      case 'monitor': return 'Écran (Moniteur PC)';
      case 'tv': return 'État TV (HDMI-CEC)';
      case 'projector': return 'Écran (Projecteur)';
      default: return 'Écran connecté';
    }
  }

  getDisplayName(displayInfo?: DisplayInfo): string {
    if (!displayInfo) return 'Inconnu';
    const parts: string[] = [];
    if (displayInfo.manufacturer) parts.push(displayInfo.manufacturer);
    if (displayInfo.model) parts.push(displayInfo.model);
    return parts.length > 0 ? parts.join(' ') : 'Écran détecté';
  }

  getDisplayTypeLabel(displayType: string): string {
    switch (displayType) {
      case 'tv': return '📺 TV';
      case 'monitor': return '🖥️ Moniteur PC';
      case 'projector': return '📽️ Projecteur';
      default: return '❓ Inconnu';
    }
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

    this.sitesService.runDiagnostics(this.siteId).subscribe({
      next: (result) => {
        this.runningDiagnostics = false;
        this.logger.info('Diagnostics received', { result });
        if (result && (result.success !== false || result.output)) {
          this.diagnosticsResult = result;
          this.notificationService.success('Diagnostic terminé');
        } else {
          this.logger.warn('Invalid diagnostics response', { result });
          this.notificationService.error('Échec du diagnostic');
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
    this.shouldScrollToDiffModal = true;  // Scroll vers le modal après rendu

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
    this.shouldScrollToDiffModal = true;  // Scroll vers le modal après rendu

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

    this.sitesService.getLogs(this.siteId, this.logLines, this.selectedLogService).subscribe({
      next: (response) => {
        this.loadingLogs = false;
        // L'endpoint retourne { logs: string[] }
        if (response?.logs && Array.isArray(response.logs)) {
          this.logsContent = response.logs.join('\n') || 'Aucun log disponible';
        } else {
          this.logsContent = 'Aucun log disponible';
        }
      },
      error: (error) => {
        this.loadingLogs = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to get logs', { error: message, siteId: this.siteId });
      }
    });
  }

  getFilteredLogLines(): string[] {
    const lines = this.logsContent.split('\n');
    if (!this.logFilter) return lines;
    const filter = this.logFilter.toLowerCase();
    return lines.filter(line => line.toLowerCase().includes(filter));
  }

  getLogLineClass(line: string): string {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('err]') || lower.includes('fatal')) return 'log-error';
    if (lower.includes('warn') || lower.includes('warning')) return 'log-warn';
    if (lower.includes('debug') || lower.includes('trace')) return 'log-debug';
    return 'log-info';
  }

  copyLogs(): void {
    navigator.clipboard.writeText(this.logsContent);
    this.notificationService.success('Logs copiés !');
  }

  downloadLogs(): void {
    const blob = new Blob([this.logsContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${this.siteId}-${this.selectedLogService}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

    this.sitesService.getNetworkDiagnostics(this.siteId).subscribe({
      next: (result) => {
        this.loadingNetworkInfo = false;
        if (result && result.success !== false) {
          this.networkInfo = result as NetworkDiagnostics;
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
    this.bufferPollSubscription?.unsubscribe();

    const { result$, cancel } = pollCommand<BufferStatus>({
      siteId: this.siteId,
      commandName: 'get_analytics_buffer_status',
      timeoutSeconds: 15,
      sendCommand: (id, cmd, params) => this.sitesService.sendCommand(id, cmd, params),
      getCommandStatus: (id, cmdId) => this.sitesService.getCommandStatus(id, cmdId),
    });

    // Store cancel function for cleanup
    this.bufferPollSubscription = new Subscription(() => cancel());

    result$.subscribe((pollResult: CommandPollResult<BufferStatus>) => {
      this.loadingBufferStatus = false;
      if (pollResult.success && pollResult.data) {
        this.bufferStatus = pollResult.data;
      } else {
        this.notificationService.error(pollResult.error || 'Échec de la récupération de l\'état des buffers');
        this.logger.error('Failed to get buffer status', { error: pollResult.error, siteId: this.siteId });
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
    this.showRebootConfirmModal = false;

    // Utilise l'endpoint dédié qui attend le résultat complet
    this.sitesService.fixHotspot(this.siteId, autoFix).subscribe({
      next: (result) => {
        this.fixingHotspot = false;
        if (result) {
          this.hotspotResult = result as HotspotResult;

          // Si le canal a été changé et qu'un reboot est nécessaire, afficher le modal de confirmation
          if (autoFix && result.fix?.channelChanged && result.fix?.needsReboot) {
            this.showRebootConfirmModal = true;
            this.notificationService.info('Canal WiFi modifié - redémarrage nécessaire pour appliquer');
          } else if (result.success) {
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

  cancelReboot(): void {
    this.showRebootConfirmModal = false;
    this.notificationService.info('Le changement de canal sera appliqué au prochain redémarrage du boîtier');
  }

  confirmReboot(): void {
    if (!this.isConnected) {
      this.notificationService.warning('Le boîtier doit être connecté pour redémarrer');
      return;
    }

    this.rebooting = true;

    // Envoie la commande de reboot via le service
    this.sitesService.sendCommand(this.siteId, 'reboot', {}).subscribe({
      next: () => {
        this.rebooting = false;
        this.showRebootConfirmModal = false;
        this.notificationService.success('Redémarrage en cours... Le boîtier sera de nouveau en ligne dans ~1 minute');
        this.logger.info('Reboot command sent after hotspot fix', { siteId: this.siteId });
      },
      error: (error) => {
        this.rebooting = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur lors du redémarrage: ${message}`);
        this.logger.error('Failed to reboot after hotspot fix', { error: message, siteId: this.siteId });
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

    // Utilise le nouvel endpoint dédié qui attend le résultat
    this.sitesService.exportDebugBundle(this.siteId).subscribe({
      next: (response) => {
        this.exportingBundle = false;

        if (response?.success && response?.bundle) {
          // Créer et télécharger le fichier JSON
          const jsonContent = JSON.stringify(response.bundle, null, 2);
          const blob = new Blob([jsonContent], { type: 'application/json' });
          const url = URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.href = url;
          const hostname = response.bundle.hostname || this.siteId;
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
  // WiFi BSSID / Mesh Detection Methods
  // ============================================

  toggleWifiBssid(): void {
    this.showWifiBssid = !this.showWifiBssid;
    if (this.showWifiBssid && !this.wifiBssidStatus && this.isConnected) {
      this.loadWifiBssidStatus();
    }
  }

  loadWifiBssidStatus(): void {
    if (!this.siteId || !this.isConnected) return;

    this.loadingWifiBssid = true;
    this.sitesService.getWifiBssidStatus(this.siteId).subscribe({
      next: (response) => {
        this.loadingWifiBssid = false;
        this.wifiBssidStatus = response;
      },
      error: (error) => {
        this.loadingWifiBssid = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to load WiFi BSSID status', { error: message, siteId: this.siteId });
      }
    });
  }

  removeBssidLock(): void {
    if (!this.siteId || !this.isConnected) return;

    this.removingBssidLock = true;
    this.sitesService.removeBssidLock(this.siteId).subscribe({
      next: (response) => {
        this.removingBssidLock = false;
        if (response.success) {
          this.notificationService.success('Verrouillage BSSID supprimé. Le roaming est maintenant actif.');
          // Recharger le status
          this.loadWifiBssidStatus();
        } else {
          this.notificationService.warning(response.message || 'Aucune modification nécessaire');
        }
      },
      error: (error) => {
        this.removingBssidLock = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to remove BSSID lock', { error: message, siteId: this.siteId });
      }
    });
  }

  optimizeForMesh(): void {
    if (!this.siteId || !this.isConnected) return;

    this.optimizingMesh = true;
    this.sitesService.optimizeForMesh(this.siteId).subscribe({
      next: (response) => {
        this.optimizingMesh = false;
        if (response.success) {
          this.notificationService.success('Configuration WiFi optimisée pour environnement mesh.');
          // Recharger le status
          this.loadWifiBssidStatus();
        } else {
          this.notificationService.warning(response.message || 'Aucune modification nécessaire');
        }
      },
      error: (error) => {
        this.optimizingMesh = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.logger.error('Failed to optimize for mesh', { error: message, siteId: this.siteId });
      }
    });
  }

  // ============================================
  // WiFi Client Configuration Methods (scan & connect wlan1)
  // ============================================

  scanWifiNetworks(): void {
    if (!this.siteId || !this.isConnected) return;

    this.scanningWifi = true;
    this.selectedWifiNetwork = null;
    this.wifiPassword = '';
    this.wifiConnectResult = null;

    this.sitesService.scanWifiNetworks(this.siteId).subscribe({
      next: (response) => {
        this.scanningWifi = false;
        this.wifiScanResult = response;
        if (!response.success && response.error) {
          this.notificationService.warning(response.error);
        }
      },
      error: (error) => {
        this.scanningWifi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur scan WiFi: ${message}`);
        this.logger.error('Failed to scan WiFi networks', { error: message, siteId: this.siteId });
      }
    });
  }

  selectWifiNetwork(network: WifiNetwork): void {
    if (this.selectedWifiNetwork?.ssid === network.ssid && this.selectedWifiNetwork?.bssid === network.bssid) {
      this.selectedWifiNetwork = null;
      this.wifiPassword = '';
    } else {
      this.selectedWifiNetwork = network;
      this.wifiPassword = '';
      this.wifiConnectResult = null;
    }
  }

  connectWifiClient(): void {
    if (!this.siteId || !this.isConnected || !this.selectedWifiNetwork) return;
    if (this.selectedWifiNetwork.security !== 'Open' && (!this.wifiPassword || this.wifiPassword.length < 8)) {
      this.notificationService.warning('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    this.connectingWifi = true;
    this.wifiConnectResult = null;

    this.sitesService.connectWifiClient(
      this.siteId,
      this.selectedWifiNetwork.ssid,
      this.wifiPassword
    ).subscribe({
      next: (response) => {
        this.connectingWifi = false;
        this.wifiConnectResult = {
          connected: response.connected,
          ipAddress: response.ipAddress,
          message: response.message,
        };
        if (response.connected) {
          this.notificationService.success(response.message);
          this.wifiPassword = '';
          this.loadWifiBssidStatus();
        } else {
          this.notificationService.warning(response.message);
        }
      },
      error: (error) => {
        this.connectingWifi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur connexion WiFi: ${message}`);
        this.logger.error('Failed to connect WiFi client', { error: message, siteId: this.siteId });
      }
    });
  }

  getWifiSignalClass(signal: number | null): string {
    if (!signal) return '';
    if (signal > -60) return 'signal-good';
    if (signal > -75) return 'signal-medium';
    return 'signal-weak';
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

  getFilteredTimeline(): typeof this.timelineEvents {
    if (!this.timelineTypeFilter) return this.timelineEvents;
    return this.timelineEvents.filter(e => e.type === this.timelineTypeFilter);
  }

  // ===== Confirmation modal =====

  showConfirmModal(options: {
    title: string;
    message: string;
    warning?: string;
    confirmLabel?: string;
    danger?: boolean;
    icon?: string;
    onConfirm: () => void;
  }): void {
    this.confirmModal = {
      visible: true,
      title: options.title,
      message: options.message,
      warning: options.warning || '',
      confirmLabel: options.confirmLabel || 'Confirmer',
      danger: options.danger ?? true,
      icon: options.icon || '⚠️',
      executing: false,
      onConfirm: options.onConfirm,
    };
  }

  cancelConfirmModal(): void {
    this.confirmModal.visible = false;
    this.confirmModal.onConfirm = null;
  }

  executeConfirmModal(): void {
    if (this.confirmModal.onConfirm) {
      this.confirmModal.executing = true;
      this.confirmModal.onConfirm();
    }
  }

  // ===== Timeline detail helpers =====

  hasDetails(details: Record<string, unknown>): boolean {
    return Object.keys(details).length > 0;
  }

  getDetailKeys(details: Record<string, unknown>): string[] {
    return Object.keys(details).slice(0, 5); // Limit to 5 keys for readability
  }

  formatDetailValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  // ===== Diagnostic guidé (F-AUD-08) =====

  toggleWizard(): void {
    this.showWizard = !this.showWizard;
  }

  startWizard(): void {
    this.wizardBufferPollSub?.unsubscribe();
    this.wizardRunning = true;
    this.wizardCompleted = false;
    this.wizardCurrentStep = 0;
    this.wizardSteps = this.wizardSteps.map(step => ({
      ...step,
      status: 'pending' as WizardStepStatus,
      message: '',
      details: [],
      suggestions: [],
    }));
    this.runWizardStep(0);
  }

  goToWizardStep(index: number): void {
    if (index >= 0 && index < this.wizardSteps.length) {
      this.wizardCurrentStep = index;
    }
  }

  wizardNextStep(): void {
    if (this.wizardCurrentStep < this.wizardSteps.length - 1) {
      this.wizardCurrentStep++;
      if (this.wizardSteps[this.wizardCurrentStep].status === 'pending') {
        this.runWizardStep(this.wizardCurrentStep);
      }
    }
  }

  wizardPreviousStep(): void {
    if (this.wizardCurrentStep > 0) {
      this.wizardCurrentStep--;
    }
  }

  getWizardStepStatusIcon(status: WizardStepStatus): string {
    switch (status) {
      case 'ok': return '\u2705';
      case 'warning': return '\u26A0\uFE0F';
      case 'error': return '\u274C';
      case 'checking': return '\u23F3';
      case 'pending': return '\u2B55';
    }
  }

  getWizardScore(): number {
    return this.wizardSteps
      .filter((_step, i) => i < 4) // Only count the 4 diagnostic steps, not summary
      .filter(step => step.status === 'ok')
      .length;
  }

  getWizardOverallStatus(): 'ok' | 'warning' | 'error' {
    const score = this.getWizardScore();
    if (score === 4) return 'ok';
    if (score >= 2) return 'warning';
    return 'error';
  }

  getWizardScoreLabel(): string {
    const status = this.getWizardOverallStatus();
    switch (status) {
      case 'ok': return 'Site op\u00e9rationnel';
      case 'warning': return 'Probl\u00e8mes d\u00e9tect\u00e9s';
      case 'error': return 'Site en difficult\u00e9';
    }
  }

  private runWizardStep(stepIndex: number): void {
    switch (stepIndex) {
      case 0:
        this.wizardCheckConnectivity();
        break;
      case 1:
        this.wizardCheckVideos();
        break;
      case 2:
        this.wizardCheckLoop();
        break;
      case 3:
        this.wizardCheckImpressions();
        break;
      case 4:
        this.wizardBuildSummary();
        break;
    }
  }

  private wizardCheckConnectivity(): void {
    const step = this.wizardSteps[0];
    step.status = 'checking';
    step.message = 'V\u00e9rification de la connectivit\u00e9...';

    // Simulated async delay to give the UI a "checking" feel
    setTimeout(() => {
      if (this.isConnected) {
        step.status = 'ok';
        step.message = 'Le bo\u00eetier est en ligne';
        step.details = ['Connexion WebSocket active'];
        step.suggestions = [];
        if (this.connectionHealth) {
          if (this.connectionHealth.lastPongAgeMs !== null) {
            const ageSec = Math.round(this.connectionHealth.lastPongAgeMs / 1000);
            step.details.push(`Dernier heartbeat : il y a ${ageSec}s`);
          }
          if (!this.connectionHealth.isHealthy) {
            step.status = 'warning';
            step.message = 'Connect\u00e9 mais connexion instable';
            step.suggestions = [this.connectionHealth.reason];
          }
        }
        // Auto-advance after short delay
        setTimeout(() => {
          if (this.wizardCurrentStep === 0 && this.wizardRunning) {
            this.wizardNextStep();
          }
        }, 800);
      } else {
        step.status = 'error';
        step.message = 'Le bo\u00eetier est hors ligne';
        step.details = [];
        step.suggestions = [
          'V\u00e9rifier que le bo\u00eetier est allum\u00e9 (LED d\'alimentation)',
          'V\u00e9rifier le c\u00e2ble r\u00e9seau ou la connexion WiFi',
          'Red\u00e9marrer le routeur si n\u00e9cessaire',
          'V\u00e9rifier que le bo\u00eetier a acc\u00e8s \u00e0 Internet',
        ];
      }
    }, 500);
  }

  private wizardCheckVideos(): void {
    const step = this.wizardSteps[1];
    step.status = 'checking';
    step.message = 'V\u00e9rification des vid\u00e9os...';

    setTimeout(() => {
      const videoCount = this.localVideos.length;
      if (videoCount > 0) {
        const totalSize = this.getTotalSize();
        step.status = 'ok';
        step.message = `${videoCount} vid\u00e9o${videoCount > 1 ? 's' : ''} pr\u00e9sente${videoCount > 1 ? 's' : ''}`;
        step.details = [
          `Espace utilis\u00e9 : ${this.formatBytes(totalSize)}`,
        ];
        if (this.localStorage) {
          const pct = Math.round((this.localStorage.used / this.localStorage.total) * 100);
          step.details.push(`Stockage : ${pct}% utilis\u00e9 (${this.formatBytes(this.localStorage.free)} libre)`);
          if (pct > 90) {
            step.status = 'warning';
            step.suggestions = ['L\'espace disque est presque plein. Envisager de supprimer des vid\u00e9os inutilis\u00e9es.'];
          }
        }
        if (this.lastVideoSync) {
          step.details.push(`Derni\u00e8re sync : ${new Date(this.lastVideoSync).toLocaleString('fr-FR')}`);
        }
      } else {
        step.status = 'error';
        step.message = 'Aucune vid\u00e9o sur le bo\u00eetier';
        step.suggestions = [
          'D\u00e9ployer du contenu depuis l\'onglet "Contenu"',
          'V\u00e9rifier que le bo\u00eetier est connect\u00e9 pour la synchronisation',
        ];
      }
    }, 400);
  }

  private wizardCheckLoop(): void {
    const step = this.wizardSteps[2];
    step.status = 'checking';
    step.message = 'V\u00e9rification de la boucle de diffusion...';

    setTimeout(() => {
      try {
        const config = JSON.parse(this.configJson) as Record<string, unknown>;
        const sponsors = config['sponsors'] as Array<Record<string, unknown>> | undefined;
        const sponsorCount = sponsors?.length ?? 0;

        if (sponsorCount > 0) {
          step.status = 'ok';
          step.message = `Boucle configur\u00e9e avec ${sponsorCount} vid\u00e9o${sponsorCount > 1 ? 's' : ''}`;
          step.details = [`${sponsorCount} \u00e9l\u00e9ment${sponsorCount > 1 ? 's' : ''} dans la boucle de diffusion`];

          const timeCategories = config['timeCategories'] as Array<Record<string, unknown>> | undefined;
          if (timeCategories && timeCategories.length > 0) {
            step.details.push(`${timeCategories.length} tranche${timeCategories.length > 1 ? 's' : ''} horaire${timeCategories.length > 1 ? 's' : ''} configur\u00e9e${timeCategories.length > 1 ? 's' : ''}`);
          }
        } else {
          step.status = 'error';
          step.message = 'Boucle de diffusion vide';
          step.suggestions = [
            'Configurer la boucle depuis l\'onglet "Contenu"',
            'Ajouter des vid\u00e9os \u00e0 la boucle de diffusion (sponsors/animations)',
          ];
        }
      } catch {
        step.status = 'warning';
        step.message = 'Impossible de lire la configuration';
        step.details = ['La configuration JSON n\'a pas pu \u00eatre analys\u00e9e'];
        step.suggestions = ['Recharger les donn\u00e9es du site'];
      }
    }, 400);
  }

  private wizardCheckImpressions(): void {
    const step = this.wizardSteps[3];
    step.status = 'checking';
    step.message = 'V\u00e9rification des impressions r\u00e9centes...';

    if (!this.isConnected) {
      setTimeout(() => {
        step.status = 'warning';
        step.message = 'Impossible de v\u00e9rifier (bo\u00eetier hors ligne)';
        step.suggestions = ['Connecter le bo\u00eetier pour v\u00e9rifier les impressions'];
      }, 300);
      return;
    }

    // If we already have buffer status data, use it
    if (this.bufferStatus) {
      this.wizardEvaluateImpressions(step, this.bufferStatus);
      return;
    }

    // Otherwise, trigger a buffer status command via factorized poller
    this.wizardBufferPollSub?.unsubscribe();

    const { result$, cancel } = pollCommand<BufferStatus>({
      siteId: this.siteId,
      commandName: 'get_analytics_buffer_status',
      timeoutSeconds: 12,
      sendCommand: (id, cmd, params) => this.sitesService.sendCommand(id, cmd, params),
      getCommandStatus: (id, cmdId) => this.sitesService.getCommandStatus(id, cmdId),
    });

    this.wizardBufferPollSub = new Subscription(() => cancel());

    result$.subscribe((pollResult: CommandPollResult<BufferStatus>) => {
      if (pollResult.success && pollResult.data) {
        this.bufferStatus = pollResult.data;
        this.wizardEvaluateImpressions(step, pollResult.data);
      } else {
        step.status = 'warning';
        step.message = pollResult.error || '\u00c9chec de r\u00e9cup\u00e9ration du buffer';
        step.suggestions = ['R\u00e9essayer le diagnostic'];
      }
    });
  }

  private wizardEvaluateImpressions(step: WizardStep, buffer: BufferStatus): void {
    const totalEvents = buffer.analytics?.event_count ?? 0;
    const sponsorsCount = buffer.sponsors?.event_count ?? 0;

    if (totalEvents > 0) {
      step.status = 'ok';
      step.message = `${totalEvents} \u00e9v\u00e9nement${totalEvents > 1 ? 's' : ''} en buffer`;
      step.details = [
        `Total : ${totalEvents} \u00e9v\u00e9nement${totalEvents > 1 ? 's' : ''}`,
      ];
      if (sponsorsCount > 0) {
        step.details.push(`dont ${sponsorsCount} sponsor${sponsorsCount > 1 ? 's' : ''}`);
      }
      if (buffer.analytics?.oldest_event) {
        step.details.push(`Plus ancien : ${new Date(buffer.analytics.oldest_event).toLocaleString('fr-FR')}`);
      }
      if (buffer.legacy_sponsor_file) {
        step.details.push('⚠️ Fichier legacy sponsor_impressions.json d\u00e9tect\u00e9 (obsolète)');
      }
      if (totalEvents > 1000) {
        step.status = 'warning';
        step.message = `${totalEvents} \u00e9v\u00e9nements en attente (file importante)`;
        step.suggestions = ['Le buffer est volumineux. V\u00e9rifier la synchronisation des analytics.'];
      }
    } else {
      // No events in buffer - could mean sync is working well OR no activity
      step.status = 'warning';
      step.message = 'Aucun \u00e9v\u00e9nement en buffer';
      step.details = ['Le buffer est vide : soit la sync fonctionne bien, soit il n\'y a pas d\'activit\u00e9 r\u00e9cente.'];
      step.suggestions = ['V\u00e9rifier que la boucle de diffusion tourne sur la TV'];
    }
  }

  private wizardBuildSummary(): void {
    const step = this.wizardSteps[4];
    const score = this.getWizardScore();
    const total = 4;

    if (score === total) {
      step.status = 'ok';
      step.message = 'Tous les diagnostics sont OK';
    } else if (score >= 2) {
      step.status = 'warning';
      const issues = this.wizardSteps.filter((_s, i) => i < 4 && _s.status !== 'ok').length;
      step.message = `${issues} point${issues > 1 ? 's' : ''} d'attention d\u00e9tect\u00e9${issues > 1 ? 's' : ''}`;
    } else {
      step.status = 'error';
      const issues = this.wizardSteps.filter((_s, i) => i < 4 && _s.status !== 'ok').length;
      step.message = `${issues} probl\u00e8me${issues > 1 ? 's' : ''} d\u00e9tect\u00e9${issues > 1 ? 's' : ''}`;
    }

    step.details = this.wizardSteps
      .filter((_s, i) => i < 4)
      .map(s => `${this.getWizardStepStatusIcon(s.status)} ${s.title} : ${s.message}`);

    this.wizardRunning = false;
    this.wizardCompleted = true;
  }
}
