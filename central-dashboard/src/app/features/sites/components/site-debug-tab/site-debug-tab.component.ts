import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { pollCommand, CommandPollResult } from './command-poller.util';
import { SitesService } from '../../../../core/services/sites.service';
import { SiteCommandService } from '../../../../core/services/site-command.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { LocalVideo, LocalStorage, SiteConfiguration, ConnectionHealth } from '../../../../core/models';
import { DebugSummaryBarComponent } from './debug-summary-bar/debug-summary-bar.component';
import { HealthMonitorComponent } from './health-monitor/health-monitor.component';
import { CommandPanelComponent } from './command-panel/command-panel.component';
import { ServiceStatusComponent } from './service-status/service-status.component';
import { SystemInfoComponent } from './system-info/system-info.component';
import {
  HealthStatus, NetworkDiagnostics, BufferStatus,
  HotspotInfo, WizardStep, WizardStepStatus
} from './debug-tab.models';

@Component({
  selector: 'app-site-debug-tab',
  standalone: true,
  imports: [
    CommonModule, TranslateModule,
    DebugSummaryBarComponent, HealthMonitorComponent,
    CommandPanelComponent, ServiceStatusComponent, SystemInfoComponent
  ],
  template: `
    <div class="debug-tab">
      <!-- Dashboard r\u00e9sum\u00e9 -->
      <app-debug-summary-bar
        [isConnected]="isConnected"
        [connectionHealth]="connectionHealth"
        [healthStatus]="healthStatus"
        [filesCount]="localVideos.length"
        [networkInfo]="networkInfo"
        [hotspotInfo]="hotspotInfo"
        [bufferStatus]="bufferStatus">
      </app-debug-summary-bar>

      <!-- Diagnostic guid\u00e9 (F-AUD-08) -->
      <div class="debug-card wizard-card">
        <div class="debug-header" (click)="toggleWizard()">
          <span class="expand-icon">{{ showWizard ? '&#9660;' : '&#9654;' }}</span>
          <span class="debug-icon">&#128270;</span>
          <h4>{{ 'debug.wizardTitle' | translate }}</h4>
          <span class="debug-stats" *ngIf="wizardCompleted && !showWizard"
            [class.health-ok]="getWizardOverallStatus() === 'ok'"
            [class.health-warning]="getWizardOverallStatus() === 'warning'"
            [class.health-critical]="getWizardOverallStatus() === 'error'">
            {{ getWizardScoreLabel() }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showWizard">
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

          <div *ngIf="!wizardRunning && !wizardCompleted" class="wizard-start">
            <p class="wizard-intro">{{ 'debug.wizardIntro' | translate }}</p>
            <button class="btn btn-primary" (click)="startWizard()">&#128270; {{ 'debug.wizardStart' | translate }}</button>
          </div>

          <div *ngIf="wizardRunning || wizardCompleted" class="wizard-step-content">
            <div class="wizard-step-header">
              <span class="wizard-step-icon">{{ getWizardStepStatusIcon(wizardSteps[wizardCurrentStep].status) }}</span>
              <div class="wizard-step-title">
                <h5>{{ 'debug.wizardStep' | translate }} {{ wizardCurrentStep + 1 }}/{{ wizardSteps.length }} &mdash; {{ wizardSteps[wizardCurrentStep].title }}</h5>
                <span class="wizard-step-subtitle" *ngIf="wizardSteps[wizardCurrentStep].message">{{ wizardSteps[wizardCurrentStep].message }}</span>
              </div>
            </div>

            <div class="wizard-step-details" *ngIf="wizardSteps[wizardCurrentStep].details.length > 0">
              <div class="wizard-detail-item" *ngFor="let detail of wizardSteps[wizardCurrentStep].details">{{ detail }}</div>
            </div>

            <div class="wizard-step-suggestions" *ngIf="wizardSteps[wizardCurrentStep].suggestions.length > 0">
              <h6>{{ 'debug.wizardSuggestions' | translate }} :</h6>
              <ul><li *ngFor="let suggestion of wizardSteps[wizardCurrentStep].suggestions">{{ suggestion }}</li></ul>
            </div>

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

            <div class="wizard-nav">
              <button class="btn btn-secondary btn-sm" *ngIf="wizardCurrentStep > 0" (click)="wizardPreviousStep()">&larr; {{ 'debug.wizardPrevious' | translate }}</button>
              <div class="wizard-nav-spacer"></div>
              <button class="btn btn-secondary btn-sm" *ngIf="wizardCompleted" (click)="startWizard()">&#128260; {{ 'debug.wizardRestart' | translate }}</button>
              <button class="btn btn-primary btn-sm" *ngIf="wizardRunning && wizardCurrentStep < wizardSteps.length - 1" (click)="wizardNextStep()" [disabled]="wizardSteps[wizardCurrentStep].status === 'checking'">{{ 'debug.wizardNext' | translate }} &rarr;</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sub-components -->
      <app-system-info
        [siteId]="siteId"
        [isConnected]="isConnected"
        [localVideos]="localVideos"
        [localStorage]="localStorage"
        [lastVideoSync]="lastVideoSync"
        [configHash]="configHash"
        [configJson]="configJson"
        (configRestored)="onConfigRestored($event)">
      </app-system-info>

      <app-health-monitor
        [siteId]="siteId"
        [isConnected]="isConnected"
        (healthStatusLoaded)="healthStatus = $event">
      </app-health-monitor>

      <app-command-panel
        [siteId]="siteId"
        [isConnected]="isConnected"
        [connectionHealth]="connectionHealth"
        (configRestored)="onConfigRestored($event)">
      </app-command-panel>

      <app-service-status
        [siteId]="siteId"
        [isConnected]="isConnected"
        [hotspotInfo]="hotspotInfo"
        (networkInfoLoaded)="networkInfo = $event"
        (bufferStatusLoaded)="bufferStatus = $event">
      </app-service-status>
    </div>
  `,
  styles: [`
    .debug-tab { display: flex; flex-direction: column; gap: 1rem; }
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
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .wizard-card { border: 2px solid #e0e7ff; background: linear-gradient(135deg, #fefefe 0%, #f8faff 100%); }
    .wizard-steps-indicator { display: flex; justify-content: center; gap: 1rem; margin-bottom: 1.5rem; padding-top: 0.5rem; }
    .wizard-step-dot { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; background: #e2e8f0; border: 2px solid transparent; }
    .wizard-step-dot:hover { transform: scale(1.1); }
    .dot-number { font-size: 0.8125rem; font-weight: 600; color: #64748b; }
    .dot-active { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
    .dot-ok { background: #dcfce7; }
    .dot-ok .dot-number { color: #15803d; }
    .dot-warning { background: #fef3c7; }
    .dot-warning .dot-number { color: #92400e; }
    .dot-error { background: #fee2e2; }
    .dot-error .dot-number { color: #dc2626; }
    .dot-checking { background: #dbeafe; animation: pulse-dot 1.2s ease-in-out infinite; }
    .dot-checking .dot-number { color: #1e40af; }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .dot-pending { background: #f1f5f9; }
    .wizard-start { text-align: center; padding: 1rem 0; }
    .wizard-intro { color: #475569; font-size: 0.875rem; margin-bottom: 1rem; line-height: 1.5; }
    .wizard-step-content { padding: 0.5rem 0; }
    .wizard-step-header { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1rem; }
    .wizard-step-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 0.1rem; }
    .wizard-step-title h5 { margin: 0; font-size: 0.9375rem; font-weight: 600; color: #1e293b; }
    .wizard-step-subtitle { display: block; font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .wizard-step-details { background: #f8fafc; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
    .wizard-detail-item { font-size: 0.8125rem; color: #334155; padding: 0.25rem 0; }
    .wizard-step-suggestions { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
    .wizard-step-suggestions h6 { margin: 0 0 0.5rem 0; font-size: 0.8125rem; font-weight: 600; color: #92400e; }
    .wizard-step-suggestions ul { margin: 0; padding-left: 1.25rem; }
    .wizard-step-suggestions li { font-size: 0.8125rem; color: #78350f; padding: 0.125rem 0; }
    .wizard-summary { margin-bottom: 1rem; }
    .wizard-summary-score { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; }
    .summary-ok { background: #dcfce7; border: 1px solid #86efac; }
    .summary-warning { background: #fef3c7; border: 1px solid #fde68a; }
    .summary-error { background: #fee2e2; border: 1px solid #fca5a5; }
    .summary-score-value { font-size: 1.5rem; font-weight: 700; }
    .summary-ok .summary-score-value { color: #15803d; }
    .summary-warning .summary-score-value { color: #92400e; }
    .summary-error .summary-score-value { color: #dc2626; }
    .summary-score-label { font-size: 0.9375rem; font-weight: 500; }
    .summary-ok .summary-score-label { color: #166534; }
    .summary-warning .summary-score-label { color: #78350f; }
    .summary-error .summary-score-label { color: #991b1b; }
    .wizard-checklist { display: flex; flex-direction: column; gap: 0.5rem; }
    .wizard-checklist-item { font-size: 0.8125rem; color: #334155; padding: 0.375rem 0.75rem; background: #f8fafc; border-radius: 6px; }
    .wizard-nav { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9; }
    .wizard-nav-spacer { flex: 1; }
    @media (max-width: 768px) {
      .debug-tab { padding: 0.75rem; }
      .debug-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    }
  `]
})
export class SiteDebugTabComponent implements OnInit, OnDestroy {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() connectionHealth: ConnectionHealth | null = null;
  @Output() configRestored = new EventEmitter<SiteConfiguration>();

  localVideos: LocalVideo[] = [];
  localStorage: LocalStorage | null = null;
  lastVideoSync: string | null = null;
  configHash: string | null = null;
  configJson: string = '{}';
  hotspotInfo: HotspotInfo | null = null;

  healthStatus: HealthStatus | null = null;
  networkInfo: NetworkDiagnostics | null = null;
  bufferStatus: BufferStatus | null = null;

  showWizard: boolean = false;
  wizardRunning: boolean = false;
  wizardCompleted: boolean = false;
  wizardCurrentStep: number = 0;
  private wizardBufferPollSub: Subscription | null = null;
  wizardStepKeys: string[] = ['debug.wizardStepConnectivity', 'debug.wizardStepVideos', 'debug.wizardStepLoop', 'debug.wizardStepImpressions', 'debug.wizardStepSummary'];
  wizardSteps: WizardStep[] = [
    { id: 1, title: '', icon: '\uD83D\uDD0C', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 2, title: '', icon: '\uD83C\uDFAC', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 3, title: '', icon: '\uD83D\uDD01', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 4, title: '', icon: '\uD83D\uDCCA', status: 'pending', message: '', details: [], suggestions: [] },
    { id: 5, title: '', icon: '\uD83D\uDCCB', status: 'pending', message: '', details: [], suggestions: [] },
  ];

  constructor(
    private sitesService: SitesService,
    private commandService: SiteCommandService,
    private logger: LoggerService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.initWizardTitles();
    this.loadDebugInfo();
  }

  ngOnDestroy(): void {
    this.wizardBufferPollSub?.unsubscribe();
  }

  private initWizardTitles(): void {
    this.wizardSteps.forEach((step, i) => {
      step.title = this.translate.instant(this.wizardStepKeys[i]);
    });
  }

  private loadDebugInfo(): void {
    if (!this.siteId) return;

    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response) => {
        this.localVideos = response.localVideos || [];
        this.localStorage = response.localStorage || null;
        this.lastVideoSync = response.lastVideoSync || null;
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

  onConfigRestored(config: SiteConfiguration): void {
    this.configRestored.emit(config);
    this.loadDebugInfo();
  }

  formatBytes(bytes: number): string {
    if (bytes === null || bytes === undefined || bytes <= 0 || !isFinite(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ===== Wizard =====

  toggleWizard(): void { this.showWizard = !this.showWizard; }

  startWizard(): void {
    this.wizardBufferPollSub?.unsubscribe();
    this.wizardRunning = true;
    this.wizardCompleted = false;
    this.wizardCurrentStep = 0;
    this.wizardSteps = this.wizardSteps.map(step => ({
      ...step, status: 'pending' as WizardStepStatus, message: '', details: [], suggestions: [],
    }));
    this.runWizardStep(0);
  }

  goToWizardStep(index: number): void {
    if (index >= 0 && index < this.wizardSteps.length) { this.wizardCurrentStep = index; }
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
    if (this.wizardCurrentStep > 0) { this.wizardCurrentStep--; }
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
    return this.wizardSteps.filter((_step, i) => i < 4).filter(step => step.status === 'ok').length;
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
      case 0: this.wizardCheckConnectivity(); break;
      case 1: this.wizardCheckVideos(); break;
      case 2: this.wizardCheckLoop(); break;
      case 3: this.wizardCheckImpressions(); break;
      case 4: this.wizardBuildSummary(); break;
    }
  }

  private wizardCheckConnectivity(): void {
    const step = this.wizardSteps[0];
    step.status = 'checking';
    step.message = this.translate.instant('debug.wizardCheckingConnectivity');

    setTimeout(() => {
      if (this.isConnected) {
        step.status = 'ok';
        step.message = this.translate.instant('debug.wizardDeviceOnline');
        step.details = [this.translate.instant('debug.wizardWebSocketActive')];
        step.suggestions = [];
        if (this.connectionHealth) {
          if (this.connectionHealth.lastPongAgeMs !== null) {
            const ageSec = Math.round(this.connectionHealth.lastPongAgeMs / 1000);
            step.details.push(this.translate.instant('debug.wizardLastHeartbeat', { seconds: ageSec }));
          }
          if (!this.connectionHealth.isHealthy) {
            step.status = 'warning';
            step.message = this.translate.instant('debug.wizardConnectedUnstable');
            step.suggestions = [this.connectionHealth.reason];
          }
        }
        setTimeout(() => {
          if (this.wizardCurrentStep === 0 && this.wizardRunning) { this.wizardNextStep(); }
        }, 800);
      } else {
        step.status = 'error';
        step.message = this.translate.instant('debug.wizardDeviceOffline');
        step.details = [];
        step.suggestions = [
          this.translate.instant('debug.wizardSuggestPowerLed'),
          this.translate.instant('debug.wizardSuggestCable'),
          this.translate.instant('debug.wizardSuggestRouter'),
          this.translate.instant('debug.wizardSuggestInternet'),
        ];
      }
    }, 500);
  }

  private wizardCheckVideos(): void {
    const step = this.wizardSteps[1];
    step.status = 'checking';
    step.message = this.translate.instant('debug.wizardCheckingVideos');

    setTimeout(() => {
      const videoCount = this.localVideos.length;
      if (videoCount > 0) {
        const totalSize = this.localVideos.reduce((sum, v) => sum + v.size, 0);
        step.status = 'ok';
        step.message = this.translate.instant('debug.wizardVideosPresent', { count: videoCount });
        step.details = [this.translate.instant('debug.wizardSpaceUsed', { size: this.formatBytes(totalSize) })];
        if (this.localStorage) {
          const pct = Math.round((this.localStorage.used / this.localStorage.total) * 100);
          step.details.push(this.translate.instant('debug.wizardStorageUsed', { pct, free: this.formatBytes(this.localStorage.free) }));
          if (pct > 90) { step.status = 'warning'; step.suggestions = [this.translate.instant('debug.wizardDiskAlmostFull')]; }
        }
        if (this.lastVideoSync) {
          step.details.push(this.translate.instant('debug.wizardLastSyncDate', { date: new Date(this.lastVideoSync).toLocaleString() }));
        }
      } else {
        step.status = 'error';
        step.message = this.translate.instant('debug.wizardNoVideos');
        step.suggestions = [this.translate.instant('debug.wizardSuggestDeploy'), this.translate.instant('debug.wizardSuggestConnect')];
      }
    }, 400);
  }

  private wizardCheckLoop(): void {
    const step = this.wizardSteps[2];
    step.status = 'checking';
    step.message = this.translate.instant('debug.wizardCheckingLoop');

    setTimeout(() => {
      try {
        const config = JSON.parse(this.configJson) as Record<string, unknown>;
        const sponsors = config['sponsors'] as Array<Record<string, unknown>> | undefined;
        const sponsorCount = sponsors?.length ?? 0;
        if (sponsorCount > 0) {
          step.status = 'ok';
          step.message = this.translate.instant('debug.wizardLoopConfigured', { count: sponsorCount });
          step.details = [this.translate.instant('debug.wizardLoopItems', { count: sponsorCount })];
          const timeCategories = config['timeCategories'] as Array<Record<string, unknown>> | undefined;
          if (timeCategories && timeCategories.length > 0) {
            step.details.push(this.translate.instant('debug.wizardTimeCategories', { count: timeCategories.length }));
          }
        } else {
          step.status = 'error';
          step.message = this.translate.instant('debug.wizardLoopEmpty');
          step.suggestions = [this.translate.instant('debug.wizardSuggestConfigLoop'), this.translate.instant('debug.wizardSuggestAddVideos')];
        }
      } catch {
        step.status = 'warning';
        step.message = this.translate.instant('debug.wizardCannotReadConfig');
        step.details = [this.translate.instant('debug.wizardJsonParseError')];
        step.suggestions = [this.translate.instant('debug.wizardSuggestReload')];
      }
    }, 400);
  }

  private wizardCheckImpressions(): void {
    const step = this.wizardSteps[3];
    step.status = 'checking';
    step.message = this.translate.instant('debug.wizardCheckingImpressions');

    if (!this.isConnected) {
      setTimeout(() => {
        step.status = 'warning';
        step.message = this.translate.instant('debug.wizardCannotCheckOffline');
        step.suggestions = [this.translate.instant('debug.wizardSuggestConnectImpressions')];
      }, 300);
      return;
    }

    if (this.bufferStatus) {
      this.wizardEvaluateImpressions(step, this.bufferStatus);
      return;
    }

    this.wizardBufferPollSub?.unsubscribe();
    const { result$, cancel } = pollCommand<BufferStatus>({
      siteId: this.siteId, commandName: 'get_analytics_buffer_status', timeoutSeconds: 12,
      sendCommand: (id, cmd, params) => this.commandService.sendCommand(id, cmd, params),
      getCommandStatus: (id, cmdId) => this.commandService.getCommandStatus(id, cmdId),
    });
    this.wizardBufferPollSub = new Subscription(() => cancel());
    result$.subscribe((pollResult: CommandPollResult<BufferStatus>) => {
      if (pollResult.success && pollResult.data) {
        this.bufferStatus = pollResult.data;
        this.wizardEvaluateImpressions(step, pollResult.data);
      } else {
        step.status = 'warning';
        step.message = pollResult.error || this.translate.instant('debug.wizardBufferFetchFailed');
        step.suggestions = [this.translate.instant('debug.wizardSuggestRetry')];
      }
    });
  }

  private wizardEvaluateImpressions(step: WizardStep, buffer: BufferStatus): void {
    const totalEvents = buffer.analytics?.event_count ?? 0;
    const sponsorsCount = buffer.sponsors?.event_count ?? 0;

    if (totalEvents > 0) {
      step.status = 'ok';
      step.message = this.translate.instant('debug.wizardEventsInBuffer', { count: totalEvents });
      step.details = [this.translate.instant('debug.wizardTotalEvents', { count: totalEvents })];
      if (sponsorsCount > 0) {
        step.details.push(this.translate.instant('debug.wizardIncludingSponsors', { count: sponsorsCount }));
      }
      if (buffer.analytics?.oldest_event) {
        step.details.push(this.translate.instant('debug.wizardOldestEvent', { date: new Date(buffer.analytics.oldest_event).toLocaleString() }));
      }
      if (buffer.legacy_sponsor_file) {
        step.details.push('\u26A0\uFE0F ' + this.translate.instant('debug.wizardLegacyFile'));
      }
      if (totalEvents > 1000) {
        step.status = 'warning';
        step.message = this.translate.instant('debug.wizardBufferLarge', { count: totalEvents });
        step.suggestions = [this.translate.instant('debug.wizardSuggestCheckSync')];
      }
    } else {
      step.status = 'ok';
      step.message = this.translate.instant('debug.wizardNoEvents');
      step.details = [this.translate.instant('debug.wizardBufferEmpty')];
      step.suggestions = [];
    }
  }

  private wizardBuildSummary(): void {
    const step = this.wizardSteps[4];
    const score = this.getWizardScore();
    const total = 4;

    if (score === total) {
      step.status = 'ok';
      step.message = this.translate.instant('debug.wizardAllOk');
    } else if (score >= 2) {
      step.status = 'warning';
      const issues = this.wizardSteps.filter((_s, i) => i < 4 && _s.status !== 'ok').length;
      step.message = this.translate.instant('debug.wizardAttentionPoints', { count: issues });
    } else {
      step.status = 'error';
      const issues = this.wizardSteps.filter((_s, i) => i < 4 && _s.status !== 'ok').length;
      step.message = this.translate.instant('debug.wizardProblems', { count: issues });
    }

    step.details = this.wizardSteps
      .filter((_s, i) => i < 4)
      .map(s => `${this.getWizardStepStatusIcon(s.status)} ${s.title} : ${s.message}`);

    this.wizardRunning = false;
    this.wizardCompleted = true;
  }
}
