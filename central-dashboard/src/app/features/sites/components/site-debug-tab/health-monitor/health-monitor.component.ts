import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SiteMetricsService } from '../../../../../core/services/site-metrics.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import {
  HealthStatus, DiagnosticsResult, DiagnosticCheck, DisplayInfo
} from '../debug-tab.models';

@Component({
  selector: 'app-health-monitor',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="debug-card">
      <div class="debug-header" (click)="toggleHealthStatus()">
        <span class="expand-icon">{{ showHealthStatus ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83E\uDE7A</span>
        <h4>{{ 'debug.healthTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="healthStatus && healthStatus.healthScore !== undefined"
          [class.health-ok]="healthStatus.healthStatus === 'healthy'"
          [class.health-warning]="healthStatus.healthStatus === 'degraded'"
          [class.health-critical]="healthStatus.healthStatus === 'critical'">
          {{ healthStatus.healthScore }}% - {{ getHealthStatusLabel(healthStatus.healthStatus) }}
        </span>
        <span class="debug-stats" *ngIf="(!healthStatus || healthStatus.healthScore === undefined) && !loadingHealthStatus">{{ 'debug.healthNotLoaded' | translate }}</span>
        <span class="debug-stats" *ngIf="loadingHealthStatus">{{ 'debug.healthLoadingShort' | translate }}</span>
      </div>

      <div class="debug-content" *ngIf="showHealthStatus">
        <div *ngIf="!isConnected" class="offline-warning">
          \u26A0\uFE0F {{ 'debug.healthOffline' | translate }}
        </div>

        <div *ngIf="isConnected && !healthStatus && !loadingHealthStatus" class="health-actions">
          <button class="btn btn-primary btn-sm" (click)="loadHealthStatus()">
            \uD83D\uDD04 {{ 'debug.healthLoad' | translate }}
          </button>
        </div>

        <div *ngIf="loadingHealthStatus" class="loading-inline">
          <div class="spinner-small"></div>
          <span>{{ 'debug.healthLoading' | translate }}</span>
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
              \uD83D\uDD04
            </button>
          </div>

          <!-- Syst\u00e8me (hostname, OS, IP) -->
          <div class="system-info-bar" *ngIf="healthStatus.system">
            <span class="system-tag" *ngIf="healthStatus.system.hostname">\uD83C\uDFF7\uFE0F {{ healthStatus.system.hostname }}</span>
            <span class="system-tag" *ngIf="healthStatus.system.os">\uD83D\uDCBB {{ healthStatus.system.os }}</span>
            <span class="system-tag" *ngIf="healthStatus.system.localIp">\uD83C\uDF10 {{ healthStatus.system.localIp }}</span>
          </div>

          <!-- Alertes/Issues -->
          <div *ngIf="healthStatus.issues && healthStatus.issues.length > 0" class="health-issues">
            <h5>\u26A0\uFE0F {{ 'debug.healthIssues' | translate }} ({{ healthStatus.issues.length }})</h5>
            <div class="issue-item" *ngFor="let issue of healthStatus.issues"
              [class.issue-critical]="issue.severity === 'critical'"
              [class.issue-warning]="issue.severity === 'warning'">
              <div class="issue-header">
                <span class="issue-badge">{{ issue.severity === 'critical' ? '\uD83D\uDD34' : '\uD83D\uDFE1' }} {{ issue.component }}</span>
              </div>
              <div class="issue-message">{{ issue.message }}</div>
              <div class="issue-fix">\uD83D\uDCA1 {{ issue.fix }}</div>
            </div>
          </div>

          <!-- GPU Info -->
          <div class="health-section" *ngIf="healthStatus.gpu">
            <h5>\uD83C\uDFAE GPU {{ healthStatus.gpu.is_pi5 ? '(Pi 5)' : '' }}</h5>
            <div class="health-grid">
              <div class="health-metric" [class.metric-warning]="healthStatus.gpu.gpu_mem_warning">
                <span class="metric-label">{{ 'debug.healthGpuMem' | translate }}</span>
                <span class="metric-value">
                  <ng-container *ngIf="healthStatus.gpu.is_pi5; else legacyGpuMem">
                    <span class="metric-ok">\u2705 {{ 'debug.healthDynamic' | translate }}</span>
                  </ng-container>
                  <ng-template #legacyGpuMem>
                    {{ healthStatus.gpu.gpu_mem_mb !== null ? healthStatus.gpu.gpu_mem_mb + 'M' : 'N/A' }}
                    <span class="metric-hint" *ngIf="healthStatus.gpu.gpu_mem_warning">\u26A0\uFE0F {{ 'debug.healthMinGpu' | translate }}</span>
                  </ng-template>
                </span>
              </div>
              <div class="health-metric" [class.metric-warning]="healthStatus.gpu.temperature_warning">
                <span class="metric-label">{{ 'debug.healthTemperature' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.gpu.temperature !== null ? healthStatus.gpu.temperature + '\u00B0C' : 'N/A' }}
                  <span class="metric-hint" *ngIf="healthStatus.gpu.temperature_warning">\uD83D\uDD25 {{ 'debug.healthTempHigh' | translate }}</span>
                </span>
              </div>
              <div class="health-metric" [class.metric-warning]="!healthStatus.gpu.voltage_ok">
                <span class="metric-label">{{ 'debug.healthPower' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.gpu.voltage_ok ? ('\u2705 ' + ('debug.healthVoltageOk' | translate)) : ('\u26A0\uFE0F ' + ('debug.healthUnderVoltage' | translate)) }}
                </span>
              </div>
              <div class="health-metric" [class.metric-warning]="healthStatus.gpu.throttling_active">
                <span class="metric-label">Throttling</span>
                <span class="metric-value">
                  <span *ngIf="healthStatus.gpu.throttled === '0x0'">\u2705 {{ 'debug.noThrottling' | translate }}</span>
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
            <h5>\uD83C\uDF00 {{ 'debug.healthFanTitle' | translate }} {{ healthStatus.fanStatus?.is_pi5 ? '(Pi 5 Active Cooler)' : '(Fan HAT)' }}</h5>
            <div class="health-grid">
              <div class="health-metric">
                <span class="metric-label">{{ 'debug.healthFanType' | translate }}</span>
                <span class="metric-value">{{ healthStatus.fanStatus?.type || 'N/A' }}</span>
              </div>
              <div class="health-metric" [class.metric-warning]="healthStatus.fanStatus?.curState === 0 && (healthStatus.metrics?.temperature ?? 0) > 70">
                <span class="metric-label">{{ 'debug.healthFanState' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.fanStatus?.curState }}/{{ healthStatus.fanStatus?.maxState }}
                  <span *ngIf="healthStatus.fanStatus?.speedPercent !== null">({{ healthStatus.fanStatus?.speedPercent }}%)</span>
                </span>
              </div>
              <div class="health-metric">
                <span class="metric-label">{{ 'debug.healthFanSpeed' | translate }}</span>
                <span class="metric-value">
                  <span *ngIf="healthStatus.fanStatus?.curState === 0">{{ 'debug.healthFanStopped' | translate }}</span>
                  <span *ngIf="(healthStatus.fanStatus?.curState ?? -1) > 0 && (healthStatus.fanStatus?.curState ?? 0) <= 1">{{ 'debug.healthFanLow' | translate }}</span>
                  <span *ngIf="(healthStatus.fanStatus?.curState ?? 0) > 1 && (healthStatus.fanStatus?.curState ?? 0) <= 2">{{ 'debug.healthFanMedium' | translate }}</span>
                  <span *ngIf="(healthStatus.fanStatus?.curState ?? 0) > 2">{{ 'debug.healthFanHigh' | translate }}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="health-section" *ngIf="healthStatus.fanStatus && !healthStatus.fanStatus.present">
            <h5>\uD83C\uDF00 {{ 'debug.healthFanTitle' | translate }}</h5>
            <p class="muted">{{ 'debug.healthNoFan' | translate }}</p>
          </div>

          <!-- HDMI-CEC TV Status + Display Info -->
          <div class="health-section" *ngIf="healthStatus.hdmiCecStatus">
            <h5>{{ getDisplaySectionIcon(healthStatus.displayInfo) }} {{ getDisplaySectionTitle(healthStatus.displayInfo) }}</h5>

            <div class="health-grid" *ngIf="healthStatus.displayInfo?.connected">
              <div class="health-metric metric-ok">
                <span class="metric-label">{{ 'debug.healthDisplay' | translate }}</span>
                <span class="metric-value">{{ getDisplayName(healthStatus.displayInfo) }}</span>
              </div>
              <div class="health-metric" *ngIf="healthStatus.displayInfo?.resolution">
                <span class="metric-label">{{ 'debug.healthDisplayResolution' | translate }}</span>
                <span class="metric-value">{{ healthStatus.displayInfo?.resolution }}</span>
              </div>
              <div class="health-metric">
                <span class="metric-label">{{ 'debug.healthDisplayType' | translate }}</span>
                <span class="metric-value">{{ getDisplayTypeLabel(healthStatus.displayInfo?.display_type || 'unknown') }}</span>
              </div>
              <div class="health-metric" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_connected" [class.metric-warning]="!healthStatus.hdmiCecStatus.tv_connected">
                <span class="metric-label">{{ 'debug.healthHdmiConnection' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.hdmiCecStatus.tv_connected ? ('\u2705 ' + ('debug.healthHdmiConnected' | translate)) : ('\u2705 ' + ('debug.healthHdmiSignalOk' | translate)) }}
                </span>
              </div>
            </div>

            <!-- Enriched EDID details -->
            <div class="health-grid" *ngIf="healthStatus.displayInfo?.edid_detailed as edid">
              <div class="health-metric" *ngIf="healthStatus.displayInfo?.display_category">
                <span class="metric-label">{{ 'debug.healthDisplayCategory' | translate }}</span>
                <span class="metric-value">{{ getDisplayCategoryLabel(healthStatus.displayInfo?.display_category) }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.diagonal_inches">
                <span class="metric-label">{{ 'debug.healthDisplaySize' | translate }}</span>
                <span class="metric-value">{{ edid.diagonal_inches }}"</span>
              </div>
              <div class="health-metric" *ngIf="edid.native_resolution">
                <span class="metric-label">{{ 'debug.healthNativeResolution' | translate }}</span>
                <span class="metric-value">{{ edid.native_resolution }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.max_refresh_rate">
                <span class="metric-label">{{ 'debug.healthRefreshRate' | translate }}</span>
                <span class="metric-value">{{ edid.max_refresh_rate }} Hz</span>
              </div>
              <div class="health-metric" *ngIf="edid.hdmi_version">
                <span class="metric-label">{{ 'debug.healthHdmiVersion' | translate }}</span>
                <span class="metric-value">HDMI {{ edid.hdmi_version }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.hdr_supported">
                <span class="metric-label">HDR</span>
                <span class="metric-value metric-ok-text">\u2705 {{ 'debug.healthHdrSupported' | translate }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.color_spaces?.length">
                <span class="metric-label">{{ 'debug.healthColorSpaces' | translate }}</span>
                <span class="metric-value metric-small">{{ edid.color_spaces.join(', ') }}</span>
              </div>
            </div>

            <div class="monitor-notice" *ngIf="healthStatus.displayInfo?.display_type === 'monitor'">
              <span class="metric-hint">\uD83D\uDDA5\uFE0F {{ 'debug.healthMonitorNotice' | translate }}</span>
            </div>

            <div class="health-grid" *ngIf="healthStatus.displayInfo?.display_type !== 'monitor'">
              <div class="health-metric" [class.metric-warning]="healthStatus.hdmiCecStatus.tv_power === 'standby'" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_power === 'on'">
                <span class="metric-label">{{ 'debug.healthTvPower' | translate }}</span>
                <span class="metric-value">{{ getTvPowerLabel(healthStatus.hdmiCecStatus.tv_power) }}</span>
              </div>
              <div class="health-metric" *ngIf="!healthStatus.displayInfo?.connected" [class.metric-ok]="healthStatus.hdmiCecStatus.tv_connected" [class.metric-warning]="!healthStatus.hdmiCecStatus.tv_connected">
                <span class="metric-label">{{ 'debug.healthHdmiConnection' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.hdmiCecStatus.tv_connected ? ('\u2705 ' + ('debug.healthHdmiConnected' | translate)) : ('\u274C ' + ('debug.healthHdmiNotDetected' | translate)) }}
                </span>
              </div>
              <div class="health-metric" [class.metric-ok]="healthStatus.hdmiCecStatus.cec_available">
                <span class="metric-label">{{ 'debug.healthCecAvailable' | translate }}</span>
                <span class="metric-value">
                  {{ healthStatus.hdmiCecStatus.cec_available ? ('\u2705 ' + ('debug.yes' | translate)) : ('\u274C ' + ('debug.no' | translate)) }}
                </span>
              </div>
              <div class="health-metric">
                <span class="metric-label">{{ 'debug.healthCecDevices' | translate }}</span>
                <span class="metric-value">{{ healthStatus.hdmiCecStatus.devices_found }}</span>
              </div>
            </div>
            <div class="cec-last-check" *ngIf="healthStatus.hdmiCecStatus.last_check_at">
              <span class="metric-hint">{{ 'debug.healthLastCheck' | translate }} {{ healthStatus.hdmiCecStatus.last_check_at | date:'HH:mm:ss' }}</span>
            </div>
            <div class="cec-error" *ngIf="healthStatus.hdmiCecStatus.error && healthStatus.displayInfo?.display_type !== 'monitor'">
              <span class="metric-hint metric-warning">\u26A0\uFE0F {{ healthStatus.hdmiCecStatus.error }}</span>
            </div>
          </div>

          <!-- Secondary Display Info -->
          <div class="health-section" *ngIf="healthStatus.secondaryDisplayInfo">
            <h5>{{ getDisplaySectionIcon(healthStatus.secondaryDisplayInfo) }} {{ 'debug.secondaryDisplay' | translate }}</h5>

            <div class="health-grid" *ngIf="healthStatus.secondaryDisplayInfo.connected">
              <div class="health-metric metric-ok">
                <span class="metric-label">{{ 'debug.healthDisplay' | translate }}</span>
                <span class="metric-value">{{ getDisplayName(healthStatus.secondaryDisplayInfo) }}</span>
              </div>
              <div class="health-metric" *ngIf="healthStatus.secondaryDisplayInfo.resolution">
                <span class="metric-label">{{ 'debug.healthDisplayResolution' | translate }}</span>
                <span class="metric-value">{{ healthStatus.secondaryDisplayInfo.resolution }}</span>
              </div>
              <div class="health-metric">
                <span class="metric-label">{{ 'debug.healthDisplayType' | translate }}</span>
                <span class="metric-value">{{ getDisplayTypeLabel(healthStatus.secondaryDisplayInfo.display_type || 'unknown') }}</span>
              </div>
            </div>

            <div class="health-grid" *ngIf="healthStatus.secondaryDisplayInfo.edid_detailed as edid">
              <div class="health-metric" *ngIf="healthStatus.secondaryDisplayInfo.display_category">
                <span class="metric-label">{{ 'debug.healthDisplayCategory' | translate }}</span>
                <span class="metric-value">{{ getDisplayCategoryLabel(healthStatus.secondaryDisplayInfo.display_category) }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.diagonal_inches">
                <span class="metric-label">{{ 'debug.healthDisplaySize' | translate }}</span>
                <span class="metric-value">{{ edid.diagonal_inches }}"</span>
              </div>
              <div class="health-metric" *ngIf="edid.native_resolution">
                <span class="metric-label">{{ 'debug.healthNativeResolution' | translate }}</span>
                <span class="metric-value">{{ edid.native_resolution }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.max_refresh_rate">
                <span class="metric-label">{{ 'debug.healthRefreshRate' | translate }}</span>
                <span class="metric-value">{{ edid.max_refresh_rate }} Hz</span>
              </div>
              <div class="health-metric" *ngIf="edid.hdmi_version">
                <span class="metric-label">{{ 'debug.healthHdmiVersion' | translate }}</span>
                <span class="metric-value">HDMI {{ edid.hdmi_version }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.hdr_supported">
                <span class="metric-label">HDR</span>
                <span class="metric-value metric-ok-text">\u2705 {{ 'debug.healthHdrSupported' | translate }}</span>
              </div>
              <div class="health-metric" *ngIf="edid.color_spaces?.length">
                <span class="metric-label">{{ 'debug.healthColorSpaces' | translate }}</span>
                <span class="metric-value metric-small">{{ edid.color_spaces.join(', ') }}</span>
              </div>
            </div>
          </div>

          <!-- Services -->
          <div class="health-section" *ngIf="healthStatus.services && healthStatus.services.length > 0">
            <h5>\u2699\uFE0F {{ 'debug.healthSystemdServices' | translate }}</h5>
            <div class="services-grid">
              <div class="service-item" *ngFor="let svc of healthStatus.services"
                [class.service-active]="svc.active"
                [class.service-failed]="svc.failed"
                [class.service-inactive]="!svc.active && !svc.failed">
                <span class="service-status">{{ svc.active ? '\u2705' : svc.failed ? '\u274C' : '\u26AA' }}</span>
                <span class="service-name">{{ svc.name }}</span>
                <span class="service-desc">{{ svc.description }}</span>
              </div>
            </div>
          </div>

          <!-- M\u00e9triques syst\u00e8me -->
          <div class="health-section" *ngIf="healthStatus.metrics">
            <h5>\uD83D\uDCCA {{ 'debug.healthResources' | translate }}</h5>
            <div class="health-grid">
              <div class="health-metric">
                <span class="metric-label">CPU</span>
                <span class="metric-value">{{ healthStatus.metrics.cpu }}%</span>
              </div>
              <div class="health-metric" [class.metric-warning]="healthStatus.metrics.memory > 90">
                <span class="metric-label">{{ 'debug.healthMemory' | translate }}</span>
                <span class="metric-value">{{ healthStatus.metrics.memory }}%</span>
              </div>
              <div class="health-metric" [class.metric-warning]="healthStatus.metrics.disk > 90">
                <span class="metric-label">{{ 'debug.healthDisk' | translate }}</span>
                <span class="metric-value">{{ healthStatus.metrics.disk }}%</span>
              </div>
              <div class="health-metric">
                <span class="metric-label">Uptime</span>
                <span class="metric-value">{{ formatUptime(healthStatus.metrics.uptime) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Diagnostic approfondi -->
        <div class="health-section diagnostics-subsection" *ngIf="isConnected">
          <h5>\uD83D\uDD0D {{ 'debug.healthDiagTitle' | translate }}
            <span class="diagnostics-badge" *ngIf="diagnosticsResult">
              {{ getDiagnosticsOkCount() }}/{{ diagnosticsResult.checks?.length || 0 }} OK
            </span>
          </h5>
          <p class="diagnostics-hint">{{ 'debug.healthDiagHint' | translate }}</p>

          <button class="btn btn-primary btn-sm" (click)="runDiagnostics()" [disabled]="runningDiagnostics">
            {{ runningDiagnostics ? ('\u23F3 ' + ('debug.healthDiagRunning' | translate)) : ('\uD83D\uDD0D ' + ('debug.healthDiagRun' | translate)) }}
          </button>

          <div *ngIf="runningDiagnostics" class="loading-inline">
            <div class="spinner-small"></div>
            <span>{{ 'debug.healthDiagExec' | translate }}</span>
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
                    <span class="check-status">{{ check.status === 'ok' ? '\u2705' : check.status === 'fail' ? '\u274C' : '\u26A0\uFE0F' }}</span>
                    <span class="check-name">{{ check.name }}</span>
                    <span class="check-value">{{ check.value }}</span>
                    <span class="check-warn" *ngIf="check.warning">{{ check.warning }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div *ngIf="diagnosticsResult.output" class="diagnostics-output">
              <h6>{{ 'debug.healthDiagScriptOutput' | translate }}</h6>
              <pre class="output-viewer">{{ diagnosticsResult.output }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .debug-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .debug-header { display: flex; align-items: center; gap: 0.5rem; padding: 1rem 1.5rem; cursor: pointer; transition: background 0.15s; }
    .debug-header:hover { background: #f8fafc; }
    .debug-header h4 { margin: 0; font-size: 0.9375rem; font-weight: 600; flex: 1; }
    .expand-icon { font-size: 0.75rem; color: #64748b; width: 16px; }
    .debug-icon { font-size: 1.125rem; }
    .debug-stats { font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .debug-content { padding: 0 1.5rem 1.5rem 1.5rem; border-top: 1px solid #f1f5f9; }
    .debug-stats.health-ok { background: #dcfce7; color: #15803d; }
    .debug-stats.health-warning { background: #fef3c7; color: #92400e; }
    .debug-stats.health-critical { background: #fee2e2; color: #dc2626; }
    .offline-warning { padding: 1rem; background: #fef3c7; border-radius: 6px; color: #92400e; font-size: 0.875rem; margin-top: 1rem; }
    .health-actions { padding-top: 1rem; }
    .health-content { padding-top: 1rem; }
    .loading-inline { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; color: #64748b; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .health-score-card { display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .health-score-card.score-healthy { background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); }
    .health-score-card.score-degraded { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); }
    .health-score-card.score-critical { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); }
    .score-circle { display: flex; align-items: baseline; gap: 0.25rem; }
    .score-value { font-size: 2rem; font-weight: 700; }
    .score-label { font-size: 0.875rem; color: #64748b; }
    .score-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
    .score-status { font-weight: 600; }
    .score-time { font-size: 0.75rem; color: #64748b; }
    .refresh-btn { padding: 0.25rem 0.5rem !important; }
    .system-info-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .system-tag { font-size: 0.75rem; padding: 0.25rem 0.5rem; background: #f1f5f9; border-radius: 4px; color: #475569; font-family: 'SF Mono', Monaco, monospace; }
    .health-issues { margin-bottom: 1rem; }
    .health-issues h5 { margin: 0 0 0.75rem 0; font-size: 0.875rem; font-weight: 600; }
    .issue-item { padding: 0.75rem; border-radius: 6px; margin-bottom: 0.5rem; }
    .issue-item.issue-critical { background: #fee2e2; border-left: 3px solid #dc2626; }
    .issue-item.issue-warning { background: #fef3c7; border-left: 3px solid #f59e0b; }
    .issue-badge { font-weight: 600; font-size: 0.8125rem; }
    .issue-message { margin-top: 0.25rem; font-size: 0.8125rem; }
    .issue-fix { margin-top: 0.5rem; font-size: 0.75rem; color: #475569; font-family: 'SF Mono', Monaco, monospace; }
    .health-section { margin-bottom: 1rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; }
    .health-section h5 { margin: 0 0 0.75rem 0; font-size: 0.875rem; font-weight: 600; }
    .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
    .health-metric { display: flex; flex-direction: column; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 6px; }
    .health-metric.metric-warning { background: #fef3c7; }
    .health-metric.metric-ok { background: #dcfce7; }
    .metric-label { font-size: 0.6875rem; color: #64748b; text-transform: uppercase; }
    .metric-value { font-size: 0.9375rem; font-weight: 600; }
    .metric-hint { font-size: 0.6875rem; margin-left: 0.25rem; }
    .metric-ok-text { color: #16a34a; }
    .metric-small { font-size: 0.75rem; }
    .throttle-flags { margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .flag-item { font-size: 0.6875rem; padding: 0.125rem 0.375rem; background: #fef3c7; border-radius: 4px; color: #92400e; }
    .cec-last-check { margin-top: 0.5rem; text-align: right; }
    .cec-error { margin-top: 0.5rem; padding: 0.5rem; background: #fef3c7; border-radius: 4px; }
    .monitor-notice { margin-top: 0.5rem; padding: 0.75rem; background: #eff6ff; border-radius: 6px; border-left: 3px solid #3b82f6; font-size: 0.85rem; color: #1e40af; }
    .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; }
    .service-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; background: #f8fafc; border-radius: 4px; font-size: 0.8125rem; }
    .service-item.service-active { background: #dcfce7; }
    .service-item.service-failed { background: #fee2e2; }
    .service-name { font-weight: 500; font-family: 'SF Mono', Monaco, monospace; font-size: 0.75rem; }
    .service-desc { color: #64748b; font-size: 0.6875rem; }
    .muted { color: #64748b; font-size: 0.8125rem; }
    .diagnostics-subsection { margin-top: 1rem; padding-top: 1rem; border-top: 2px dashed #e2e8f0; }
    .diagnostics-badge { font-size: 0.75rem; font-weight: 500; background: #f1f5f9; padding: 0.125rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; color: #64748b; }
    .diagnostics-hint { margin: 0 0 0.75rem 0; font-size: 0.75rem; color: #64748b; }
    .diagnostics-result { padding-top: 1rem; }
    .diagnostics-header { margin-bottom: 0.75rem; }
    .diagnostics-time { font-size: 0.75rem; color: #64748b; }
    .checks-list { display: flex; flex-direction: column; gap: 1rem; }
    .check-category h6 { margin: 0 0 0.5rem 0; font-size: 0.8125rem; font-weight: 600; color: #475569; }
    .check-items { display: flex; flex-direction: column; gap: 0.25rem; }
    .check-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; background: #f8fafc; border-radius: 4px; font-size: 0.8125rem; }
    .check-item.check-ok { background: #dcfce7; }
    .check-item.check-fail { background: #fee2e2; }
    .check-item.check-warning { background: #fef3c7; }
    .check-name { font-weight: 500; min-width: 120px; }
    .check-value { font-family: 'SF Mono', Monaco, monospace; font-size: 0.75rem; color: #475569; }
    .check-warn { font-size: 0.6875rem; color: #92400e; margin-left: auto; }
    .diagnostics-output { margin-top: 1rem; }
    .diagnostics-output h6 { margin: 0 0 0.5rem 0; font-size: 0.8125rem; }
    .output-viewer { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; font-size: 0.6875rem; font-family: 'SF Mono', Monaco, monospace; max-height: 300px; overflow: auto; white-space: pre-wrap; }
  `]
})
export class HealthMonitorComponent {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Output() healthStatusLoaded = new EventEmitter<HealthStatus>();

  showHealthStatus: boolean = false;
  healthStatus: HealthStatus | null = null;
  loadingHealthStatus: boolean = false;
  diagnosticsResult: DiagnosticsResult | null = null;
  runningDiagnostics: boolean = false;

  constructor(
    private metricsService: SiteMetricsService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private translate: TranslateService
  ) {}

  toggleHealthStatus(): void {
    this.showHealthStatus = !this.showHealthStatus;
    if (this.showHealthStatus && !this.healthStatus && this.isConnected) {
      this.loadHealthStatus();
    }
  }

  loadHealthStatus(): void {
    if (!this.isConnected) {
      this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline'));
      return;
    }

    this.loadingHealthStatus = true;

    this.metricsService.getHealthStatus(this.siteId).subscribe({
      next: (result) => {
        this.loadingHealthStatus = false;
        this.logger.info('Health status received', { result });
        if (result && result.healthScore !== undefined) {
          this.healthStatus = result;
          this.healthStatusLoaded.emit(result);
        } else {
          this.logger.warn('Invalid health status response', { result });
          this.notificationService.error(this.translate.instant('debug.notifyHealthFailed'));
        }
      },
      error: (error) => {
        this.loadingHealthStatus = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to get health status', { error: message, siteId: this.siteId });
      }
    });
  }

  getHealthStatusLabel(status: string): string {
    switch (status) {
      case 'healthy': return this.translate.instant('debug.healthStatusHealthy');
      case 'degraded': return this.translate.instant('debug.healthStatusDegraded');
      case 'critical': return this.translate.instant('debug.healthStatusCritical');
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
      case 'on': return '\u2705 ' + this.translate.instant('debug.tvOn');
      case 'standby': return '\uD83D\uDD34 ' + this.translate.instant('debug.tvStandby');
      case 'transitioning': return '\u23F3 ' + this.translate.instant('debug.tvTransitioning');
      case 'unknown': return '\u2753 ' + this.translate.instant('debug.tvUnknown');
      default: return '\u2753 ' + this.translate.instant('debug.tvNotDetected');
    }
  }

  getDisplaySectionIcon(displayInfo?: DisplayInfo): string {
    if (!displayInfo) return '\uD83D\uDCFA';
    switch (displayInfo.display_type) {
      case 'monitor': return '\uD83D\uDDA5\uFE0F';
      case 'tv': return '\uD83D\uDCFA';
      case 'projector': return '\uD83D\uDCFD\uFE0F';
      default: return '\uD83D\uDCFA';
    }
  }

  getDisplaySectionTitle(displayInfo?: DisplayInfo): string {
    if (!displayInfo || !displayInfo.connected) return this.translate.instant('debug.displayTv');
    switch (displayInfo.display_type) {
      case 'monitor': return this.translate.instant('debug.displayMonitor');
      case 'tv': return this.translate.instant('debug.displayTv');
      case 'projector': return this.translate.instant('debug.displayProjector');
      default: return this.translate.instant('debug.displayConnected');
    }
  }

  getDisplayName(displayInfo?: DisplayInfo): string {
    if (!displayInfo) return this.translate.instant('debug.displayUnknown');
    const parts: string[] = [];
    if (displayInfo.manufacturer) parts.push(displayInfo.manufacturer);
    if (displayInfo.model) parts.push(displayInfo.model);
    return parts.length > 0 ? parts.join(' ') : this.translate.instant('debug.displayDetected');
  }

  getDisplayTypeLabel(displayType: string): string {
    switch (displayType) {
      case 'tv': return '\uD83D\uDCFA ' + this.translate.instant('debug.displayTypeTv');
      case 'monitor': return '\uD83D\uDDA5\uFE0F ' + this.translate.instant('debug.displayTypeMonitor');
      case 'projector': return '\uD83D\uDCFD\uFE0F ' + this.translate.instant('debug.displayTypeProjector');
      default: return '\u2753 ' + this.translate.instant('debug.displayUnknown');
    }
  }

  getDisplayCategoryLabel(category?: string): string {
    if (!category) return '\u2753 ' + this.translate.instant('debug.displayUnknown');
    const labels: Record<string, string> = {
      tv_oled: '\uD83D\uDCFA OLED',
      tv_qled: '\uD83D\uDCFA QLED',
      tv_qned: '\uD83D\uDCFA QNED',
      tv_led: '\uD83D\uDCFA LED',
      tv_lcd: '\uD83D\uDCFA LCD',
      tv_plasma: '\uD83D\uDCFA Plasma',
      tv: '\uD83D\uDCFA ' + this.translate.instant('debug.displayTypeTv'),
      monitor: '\uD83D\uDDA5\uFE0F ' + this.translate.instant('debug.displayTypeMonitor'),
      projector: '\uD83D\uDCFD\uFE0F ' + this.translate.instant('debug.displayTypeProjector'),
    };
    return labels[category] || '\u2753 ' + category;
  }

  runDiagnostics(): void {
    if (!this.isConnected) {
      this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline'));
      return;
    }

    this.runningDiagnostics = true;
    this.diagnosticsResult = null;

    this.metricsService.runDiagnostics(this.siteId).subscribe({
      next: (result) => {
        this.runningDiagnostics = false;
        this.logger.info('Diagnostics received', { result });
        if (result && (result.success !== false || result.output)) {
          this.diagnosticsResult = result;
          this.notificationService.success(this.translate.instant('debug.notifyDiagDone'));
        } else {
          this.logger.warn('Invalid diagnostics response', { result });
          this.notificationService.error(this.translate.instant('debug.notifyDiagFailed'));
        }
      },
      error: (error) => {
        this.runningDiagnostics = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
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
}
