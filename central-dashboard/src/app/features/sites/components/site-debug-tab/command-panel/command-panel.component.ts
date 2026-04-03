import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SiteCommandService } from '../../../../../core/services/site-command.service';
import { SiteMetricsService } from '../../../../../core/services/site-metrics.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import { SiteConfiguration } from '../../../../../core/models';
import { ConnectionHealth } from '../debug-tab.models';
import { CommandExecutorComponent } from '../../command-executor/command-executor.component';

@Component({
  selector: 'app-command-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CommandExecutorComponent],
  template: `
    <!-- Terminal & Commandes -->
    <div class="debug-card">
      <div class="debug-header" (click)="showTerminal = !showTerminal">
        <span class="expand-icon">{{ showTerminal ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCBB</span>
        <h4>{{ 'debug.commandsTitle' | translate }}</h4>
        <span class="debug-stats"
          [class.connected]="isConnected && isConnectionHealthy()"
          [class.disconnected]="!isConnected"
          [class.zombie]="isConnected && !isConnectionHealthy()">
          {{ getConnectionStatusText() }}
        </span>
      </div>

      <div class="debug-content always-visible" *ngIf="showTerminal">
        <!-- Alerte connexion zombie -->
        <div *ngIf="isConnected && connectionHealth && !connectionHealth.isHealthy" class="zombie-warning">
          <div class="zombie-header">
            <span class="zombie-icon">\u26A0\uFE0F</span>
            <span class="zombie-title">{{ 'debug.zombieTitle' | translate }}</span>
          </div>
          <div class="zombie-details">
            <div class="zombie-info">
              <span class="zombie-label">{{ 'debug.zombieState' | translate }}:</span>
              <span class="zombie-value">{{ getZombieReasonText() }}</span>
            </div>
            <div class="zombie-info" *ngIf="connectionHealth.lastPongAgeMs !== null">
              <span class="zombie-label">{{ 'debug.zombieLastPong' | translate }}:</span>
              <span class="zombie-value">{{ 'debug.zombieAgo' | translate }} {{ formatPongAge(connectionHealth.lastPongAgeMs) }}</span>
            </div>
            <div class="zombie-info">
              <span class="zombie-label">{{ 'debug.zombieSocketInMap' | translate }}:</span>
              <span class="zombie-value">{{ connectionHealth.socketInMap ? ('debug.yes' | translate) : ('debug.no' | translate) }}</span>
            </div>
            <div class="zombie-info">
              <span class="zombie-label">{{ 'debug.zombieSocketConnected' | translate }}:</span>
              <span class="zombie-value">{{ connectionHealth.socketConnected ? ('debug.yes' | translate) : ('debug.no' | translate) }}</span>
            </div>
          </div>
          <div class="zombie-hint">
            \uD83D\uDCA1 {{ 'debug.zombieHint' | translate }}
          </div>
        </div>

        <!-- Commandes rapides -->
        <div class="quick-commands" *ngIf="isConnected">
          <div class="quick-commands-label">{{ 'debug.commandsQuickLabel' | translate }}</div>
          <div class="quick-commands-buttons">
            <button class="btn btn-warning btn-xs" (click)="executeCommand('fix_permissions')" [disabled]="executingCommand" [title]="'debug.commandsFixPerms' | translate">
              \uD83D\uDD10 {{ 'debug.commandsPermissions' | translate }}
            </button>
            <button class="btn btn-secondary btn-xs" (click)="executeCommand('restart_sync')" [disabled]="executingCommand" [title]="'debug.commandsRestartSync' | translate">
              \uD83D\uDD03 {{ 'debug.commandsSyncAgent' | translate }}
            </button>
            <button class="btn btn-secondary btn-xs" (click)="executeCommand('restart_kiosk')" [disabled]="executingCommand" [title]="'debug.commandsRestartKiosk' | translate">
              \uD83D\uDDA5\uFE0F {{ 'debug.commandsKiosk' | translate }}
            </button>
            <button class="btn btn-secondary btn-xs" (click)="executeCommand('restart_app')" [disabled]="executingCommand" [title]="'debug.commandsRestartApp' | translate">
              \uD83D\uDCFA {{ 'debug.commandsApp' | translate }}
            </button>
            <button class="btn btn-secondary btn-xs" (click)="executeCommand('reboot')" [disabled]="executingCommand" [title]="'debug.confirmRebootTitle' | translate">
              \uD83D\uDD04 {{ 'debug.commandsRebootShort' | translate }}
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

    <!-- Logs temps r\u00e9el -->
    <div class="debug-card">
      <div class="debug-header" (click)="showLogs = !showLogs">
        <span class="expand-icon">{{ showLogs ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCDC</span>
        <h4>{{ 'debug.logsTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="selectedLogService">{{ selectedLogService }}</span>
      </div>

      <div class="debug-content" *ngIf="showLogs">
        <div *ngIf="!isConnected" class="offline-warning">
          \u26A0\uFE0F {{ 'debug.logsOffline' | translate }}
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
            <input type="number" [(ngModel)]="logLines" min="10" max="500" class="log-lines-input" [placeholder]="'debug.logsLines' | translate">
            <button class="btn btn-primary btn-sm" (click)="loadLogs()" [disabled]="loadingLogs">
              <span *ngIf="loadingLogs">\u23F3 {{ 'debug.loadingLogs' | translate }}</span>
              <span *ngIf="!loadingLogs">\uD83D\uDD04 {{ 'debug.loadLogs' | translate }}</span>
            </button>
          </div>

          <div *ngIf="loadingLogs" class="loading-inline">
            <div class="spinner-small"></div>
            <span>{{ 'debug.logsRetrieving' | translate }}</span>
          </div>

          <div *ngIf="logsContent && !loadingLogs" class="logs-viewer">
            <div class="logs-toolbar">
              <input type="text" class="log-filter-input" [(ngModel)]="logFilter" [placeholder]="'debug.logsFilter' | translate">
              <button class="btn btn-secondary btn-sm" (click)="copyLogs()">\uD83D\uDCCB {{ 'debug.logsCopy' | translate }}</button>
              <button class="btn btn-secondary btn-sm" (click)="downloadLogs()">\uD83D\uDCBE</button>
            </div>
            <pre class="logs-output"><ng-container *ngFor="let line of getFilteredLogLines()"><span [class]="getLogLineClass(line)">{{ line }}
</span></ng-container></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Export pour Support -->
    <div class="debug-card">
      <div class="debug-header" (click)="showExport = !showExport">
        <span class="expand-icon">{{ showExport ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCE6</span>
        <h4>{{ 'debug.exportTitle' | translate }}</h4>
      </div>

      <div class="debug-content" *ngIf="showExport">
        <div *ngIf="!isConnected" class="offline-warning">
          \u26A0\uFE0F {{ 'debug.exportOffline' | translate }}
        </div>

        <div *ngIf="isConnected" class="export-section">
          <p class="export-hint">{{ 'debug.exportHintFull' | translate }}</p>

          <div class="export-actions">
            <button class="btn btn-primary" (click)="exportDebugBundle()" [disabled]="exportingBundle">
              {{ exportingBundle ? ('\u23F3 ' + ('debug.exportBtnExporting' | translate)) : ('\uD83D\uDCE6 ' + ('debug.exportBtnLabel' | translate)) }}
            </button>
          </div>

          <div *ngIf="exportingBundle" class="loading-inline">
            <div class="spinner-small"></div>
            <span>{{ 'debug.exportCollecting' | translate }}</span>
          </div>

          <div *ngIf="exportError" class="export-error">
            \u274C {{ exportError }}
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Modal for reboot -->
    <div *ngIf="confirmModalVisible" class="modal-overlay" (click)="cancelConfirm()">
      <div class="modal-content confirm-modal" (click)="$event.stopPropagation()">
        <h3>{{ confirmModalIcon }} {{ confirmModalTitle }}</h3>
        <p>{{ confirmModalMessage }}</p>
        <p class="reboot-warning" *ngIf="confirmModalWarning">\u26A0\uFE0F {{ confirmModalWarning }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="cancelConfirm()">{{ 'debug.confirmCancel' | translate }}</button>
          <button class="btn btn-danger" (click)="executeConfirm()" [disabled]="confirmExecuting">
            {{ confirmExecuting ? '\u23F3...' : confirmModalLabel }}
          </button>
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
    .debug-content.always-visible { border-top: none; padding-top: 0; }
    .debug-stats.connected { background: #dcfce7; color: #15803d; }
    .debug-stats.disconnected { background: #fee2e2; color: #dc2626; }
    .debug-stats.zombie { background: #fef3c7; color: #92400e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .offline-warning { padding: 1rem; background: #fef3c7; border-radius: 6px; color: #92400e; font-size: 0.875rem; margin-top: 1rem; }
    .loading-inline { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; color: #64748b; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .btn-xs { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover:not(:disabled) { background: #d97706; }
    .btn-danger { background: #dc2626; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-danger:disabled { background: #f87171; cursor: not-allowed; }
    .zombie-warning { padding: 1rem; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 8px; margin-bottom: 1rem; }
    .zombie-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .zombie-icon { font-size: 1.25rem; }
    .zombie-title { font-weight: 600; color: #92400e; }
    .zombie-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem; }
    .zombie-info { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; }
    .zombie-label { color: #78716c; font-weight: 500; }
    .zombie-value { color: #44403c; font-family: 'SF Mono', Monaco, monospace; }
    .zombie-hint { font-size: 0.75rem; color: #78716c; padding-top: 0.5rem; border-top: 1px solid rgba(245, 158, 11, 0.3); }
    .quick-commands { margin-bottom: 1rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .quick-commands-label { font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; font-weight: 500; }
    .quick-commands-buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .command-result-inline { margin-top: 0.75rem; padding: 0.5rem; background: #1e293b; border-radius: 4px; }
    .command-result-inline pre { margin: 0; color: #e2e8f0; font-size: 0.6875rem; font-family: 'SF Mono', Monaco, monospace; white-space: pre-wrap; word-break: break-all; max-height: 100px; overflow: auto; }
    .logs-section { padding-top: 1rem; }
    .logs-controls { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
    .log-service-select { padding: 0.375rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; min-width: 150px; }
    .log-lines-input { width: 80px; padding: 0.375rem 0.5rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; }
    .logs-viewer { margin-top: 1rem; }
    .logs-toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; }
    .log-filter-input { flex: 1; padding: 0.375rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8125rem; }
    .logs-output { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; font-size: 0.6875rem; font-family: 'SF Mono', Monaco, monospace; max-height: 400px; overflow: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
    .log-error { color: #fca5a5; }
    .log-warn { color: #fde68a; }
    .log-debug { color: #94a3b8; }
    .log-info { color: #e2e8f0; }
    .export-section { padding-top: 1rem; }
    .export-hint { font-size: 0.8125rem; color: #64748b; margin: 0 0 1rem 0; }
    .export-actions { margin-bottom: 1rem; }
    .export-error { padding: 0.75rem; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; color: #dc2626; font-size: 0.8125rem; margin-top: 1rem; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; border-radius: 12px; padding: 1.5rem; max-width: 450px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .confirm-modal h3 { margin: 0 0 1rem 0; font-size: 1.125rem; color: #1e293b; }
    .confirm-modal p { margin: 0 0 0.75rem 0; font-size: 0.875rem; color: #475569; }
    .reboot-warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 0.75rem; color: #92400e; font-weight: 500; }
    .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
  `]
})
export class CommandPanelComponent {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() connectionHealth: ConnectionHealth | null = null;
  @Output() configRestored = new EventEmitter<SiteConfiguration>();

  showTerminal: boolean = false;
  showLogs: boolean = false;
  showExport: boolean = false;

  executingCommand: boolean = false;
  commandResult: string = '';

  selectedLogService: string = 'neopro-sync-agent';
  logLines: number = 100;
  logsContent: string = '';
  loadingLogs: boolean = false;
  logFilter: string = '';

  exportingBundle: boolean = false;
  exportError: string | null = null;

  confirmModalVisible: boolean = false;
  confirmModalTitle: string = '';
  confirmModalMessage: string = '';
  confirmModalWarning: string = '';
  confirmModalLabel: string = '';
  confirmModalIcon: string = '';
  confirmExecuting: boolean = false;
  private confirmCallback: (() => void) | null = null;

  constructor(
    private commandService: SiteCommandService,
    private metricsService: SiteMetricsService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private translate: TranslateService
  ) {}

  isConnectionHealthy(): boolean {
    if (!this.connectionHealth) return this.isConnected;
    return this.connectionHealth.isHealthy;
  }

  getConnectionStatusText(): string {
    if (!this.isConnected) {
      return '\u25CB ' + this.translate.instant('debug.connectionDisconnected');
    }
    if (this.connectionHealth && !this.connectionHealth.isHealthy) {
      return '\u26A0 ' + this.translate.instant('debug.connectionUnstable');
    }
    return '\u25CF ' + this.translate.instant('debug.connectionConnected');
  }

  getZombieReasonText(): string {
    if (!this.connectionHealth) return this.translate.instant('debug.zombieUnknown');
    switch (this.connectionHealth.reason) {
      case 'not_in_map': return this.translate.instant('debug.zombieNotInMap');
      case 'socket_disconnected': return this.translate.instant('debug.zombieSocketDisconnected');
      case 'no_pong_received': return this.translate.instant('debug.zombieNoPong');
      case 'pong_stale': return this.translate.instant('debug.zombiePongStale');
      case 'healthy': return this.translate.instant('debug.zombieHealthy');
      default: return this.connectionHealth.reason;
    }
  }

  formatPongAge(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}min`;
  }

  executeCommand(command: string): void {
    this.executingCommand = true;
    this.commandResult = '';

    let commandType = command;
    let params: Record<string, unknown> = {};

    switch (command) {
      case 'fix_permissions':
        commandType = 'update_config';
        params = { mode: 'fix_permissions' };
        break;
      case 'restart_sync':
        commandType = 'restart_service';
        params = { service: 'neopro-sync-agent' };
        break;
      case 'restart_kiosk':
        commandType = 'restart_service';
        params = { service: 'neopro-kiosk' };
        break;
      case 'restart_app':
        commandType = 'restart_service';
        params = { service: 'neopro-app' };
        break;
      case 'reboot':
        this.executingCommand = false;
        this.showConfirmModal({
          title: this.translate.instant('debug.confirmRebootTitle'),
          message: this.translate.instant('debug.confirmRebootMsg'),
          warning: this.translate.instant('debug.confirmRebootWarn'),
          confirmLabel: '\uD83D\uDD04 ' + this.translate.instant('debug.commandsRebootShort'),
          icon: '\uD83D\uDD0C',
          onConfirm: () => {
            this.confirmModalVisible = false;
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

    this.commandService.sendCommand(this.siteId, commandType, params).subscribe({
      next: (response) => {
        this.executingCommand = false;
        this.commandResult = JSON.stringify(response, null, 2);
        this.notificationService.success(this.translate.instant('debug.notifyCommandSuccess'));
      },
      error: (error) => {
        this.executingCommand = false;
        const message = ErrorExtractor.getMessage(error);
        this.commandResult = `${this.translate.instant('debug.notifyError')}: ${message}`;
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
      }
    });
  }

  loadLogs(): void {
    if (!this.isConnected) {
      this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline'));
      return;
    }
    this.loadingLogs = true;
    this.logsContent = '';
    this.commandService.getLogs(this.siteId, this.logLines, this.selectedLogService).subscribe({
      next: (response) => {
        this.loadingLogs = false;
        if (response?.logs && Array.isArray(response.logs)) {
          this.logsContent = response.logs.join('\n') || this.translate.instant('debug.logsNoLogs');
        } else {
          this.logsContent = this.translate.instant('debug.logsNoLogs');
        }
      },
      error: (error) => {
        this.loadingLogs = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
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
    this.notificationService.success(this.translate.instant('debug.notifyLogsCopied'));
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

  exportDebugBundle(): void {
    if (!this.isConnected) {
      this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline'));
      return;
    }
    this.exportingBundle = true;
    this.exportError = null;

    this.metricsService.exportDebugBundle(this.siteId).subscribe({
      next: (response) => {
        this.exportingBundle = false;
        if (response?.success && response?.bundle) {
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
          this.notificationService.success(this.translate.instant('debug.notifyExportDone'));
        } else {
          this.exportError = this.translate.instant('debug.notifyExportGenFailed');
          this.notificationService.error(this.translate.instant('debug.notifyExportFailed'));
        }
      },
      error: (error) => {
        this.exportingBundle = false;
        const message = ErrorExtractor.getMessage(error);
        this.exportError = message;
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to export debug bundle', { error: message, siteId: this.siteId });
      }
    });
  }

  private showConfirmModal(options: { title: string; message: string; warning?: string; confirmLabel: string; icon: string; onConfirm: () => void }): void {
    this.confirmModalVisible = true;
    this.confirmModalTitle = options.title;
    this.confirmModalMessage = options.message;
    this.confirmModalWarning = options.warning || '';
    this.confirmModalLabel = options.confirmLabel;
    this.confirmModalIcon = options.icon;
    this.confirmExecuting = false;
    this.confirmCallback = options.onConfirm;
  }

  cancelConfirm(): void {
    this.confirmModalVisible = false;
    this.confirmCallback = null;
  }

  executeConfirm(): void {
    if (this.confirmCallback) {
      this.confirmExecuting = true;
      this.confirmCallback();
    }
  }
}
