import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SitesService } from '../../../../../core/services/sites.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import { LocalVideo, LocalStorage, ConfigHistory, SiteConfiguration, ConfigDiff } from '../../../../../core/models';
import { TimelineEvent, ConfirmModalState } from '../debug-tab.models';

@Component({
  selector: 'app-system-info',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <!-- Fichiers sur le Pi -->
    <div class="debug-card">
      <div class="debug-header" (click)="showFiles = !showFiles">
        <span class="expand-icon">{{ showFiles ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCC2</span>
        <h4>{{ 'debug.filesTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="localVideos.length > 0">
          {{ localVideos.length }} {{ 'debug.summaryFiles' | translate }} | {{ formatBytes(getTotalSize()) }}
        </span>
      </div>
      <div class="debug-content" *ngIf="showFiles">
        <div class="storage-bar" *ngIf="localStorage">
          <div class="storage-info">
            <span>{{ formatBytes(localStorage.used) }} {{ 'debug.filesUsed' | translate }} {{ formatBytes(localStorage.total) }}</span>
            <span>{{ formatBytes(localStorage.free) }} {{ 'debug.filesFree' | translate }}</span>
          </div>
          <div class="storage-progress"><div class="storage-fill" [style.width.%]="getStoragePercent()"></div></div>
        </div>
        <div class="files-list" *ngIf="localVideos.length > 0">
          <div class="file-row header">
            <span class="file-name file-sortable" (click)="sortFiles('filename')" role="button" tabindex="0" (keydown.enter)="sortFiles('filename')" (keydown.space)="sortFiles('filename')">{{ 'debug.filesFileName' | translate }} {{ fileSortField === 'filename' ? (fileSortAsc ? '\u25B2' : '\u25BC') : '' }}</span>
            <span class="file-category file-sortable" (click)="sortFiles('category')" role="button" tabindex="0" (keydown.enter)="sortFiles('category')" (keydown.space)="sortFiles('category')">{{ 'debug.filesCategory' | translate }} {{ fileSortField === 'category' ? (fileSortAsc ? '\u25B2' : '\u25BC') : '' }}</span>
            <span class="file-size file-sortable" (click)="sortFiles('size')" role="button" tabindex="0" (keydown.enter)="sortFiles('size')" (keydown.space)="sortFiles('size')">{{ 'debug.filesSize' | translate }} {{ fileSortField === 'size' ? (fileSortAsc ? '\u25B2' : '\u25BC') : '' }}</span>
          </div>
          <div class="file-row" *ngFor="let video of getSortedVideos()">
            <span class="file-name" [title]="video.path">{{ video.filename }}</span>
            <span class="file-category">{{ video.category || '-' }}</span>
            <span class="file-size">{{ formatBytes(video.size) }}</span>
          </div>
        </div>
        <p class="empty-hint" *ngIf="localVideos.length === 0">{{ 'debug.filesNoFilesSync' | translate }}</p>
        <div class="sync-info" *ngIf="lastVideoSync">
          <span class="sync-label">{{ 'debug.filesLastSyncLabel' | translate }}:</span>
          <span class="sync-value">{{ lastVideoSync | date:'dd/MM/yyyy HH:mm' }}</span>
        </div>
      </div>
    </div>

    <!-- Configuration & Historique -->
    <div class="debug-card">
      <div class="debug-header" (click)="toggleHistory()">
        <span class="expand-icon">{{ showHistory ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCDC</span>
        <h4>{{ 'debug.configHistoryTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="configHash">{{ configHash.substring(0, 8) }}</span>
        <span class="debug-stats" *ngIf="historyTotal > 0">{{ historyTotal }} version(s)</span>
      </div>
      <div class="debug-content" *ngIf="showHistory">
        <!-- Config actuelle -->
        <div class="current-config-card">
          <div class="current-config-header">
            <h5>\uD83D\uDCCB {{ 'debug.configCurrent' | translate }}</h5>
            <div class="current-config-actions">
              <button class="btn btn-secondary btn-sm" (click)="copyJson()">\uD83D\uDCCB {{ 'debug.configCopy' | translate }}</button>
              <button class="btn btn-secondary btn-sm" (click)="downloadJson()">\uD83D\uDCBE {{ 'debug.configDownload' | translate }}</button>
              <button class="btn btn-secondary btn-sm" (click)="showJson = !showJson">{{ showJson ? ('\u25B2 ' + ('debug.configHideJson' | translate)) : ('\u25BC ' + ('debug.configShowJson' | translate)) }}</button>
            </div>
          </div>
          <pre class="json-viewer" *ngIf="showJson">{{ configJson }}</pre>
        </div>

        <div *ngIf="loadingHistory" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.healthLoadingShort' | translate }}</span></div>
        <div *ngIf="!loadingHistory && history.length === 0" class="empty-hint">{{ 'debug.configNoHistory' | translate }}</div>

        <!-- Mode comparaison -->
        <div *ngIf="compareMode && !loadingHistory && history.length > 1" class="compare-mode-bar">
          <span class="compare-info">{{ selectedForCompare.length }}/2 {{ 'debug.configSelected' | translate }}</span>
          <button class="btn btn-primary btn-sm" (click)="executeCompare()" [disabled]="selectedForCompare.length !== 2 || loadingDiff">{{ loadingDiff ? ('debug.healthLoadingShort' | translate) : ('\uD83D\uDD0D ' + ('debug.configCompare' | translate)) }}</button>
          <button class="btn btn-secondary btn-sm" (click)="cancelCompareMode()">{{ 'debug.confirmCancel' | translate }}</button>
        </div>

        <div class="history-list" *ngIf="!loadingHistory && history.length > 0">
          <div class="history-actions" *ngIf="history.length > 1 && !compareMode">
            <button class="btn btn-secondary btn-sm" (click)="startCompareMode()">\uD83D\uDD00 {{ 'debug.configCompare' | translate }}</button>
          </div>
          <div class="history-item" *ngFor="let item of history; let i = index" [class.selected]="selectedHistoryId === item.id" [class.compare-selected]="isSelectedForCompare(item.id)">
            <div class="compare-checkbox" *ngIf="compareMode">
              <input type="checkbox" [checked]="isSelectedForCompare(item.id)" (change)="toggleCompareSelection(item.id)" [disabled]="!isSelectedForCompare(item.id) && selectedForCompare.length >= 2">
            </div>
            <div class="history-item-main">
              <div class="history-item-date">{{ item.deployed_at | date:'dd/MM/yyyy HH:mm' }}</div>
              <div class="history-item-user">{{ item.deployed_by_email || ('debug.configSystemUser' | translate) }}</div>
              <div class="history-item-comment" *ngIf="item.comment">{{ item.comment }}</div>
              <div class="history-item-changes" *ngIf="item.changes_summary && item.changes_summary.length > 0">
                <span class="changes-badge">{{ item.changes_summary.length }} {{ 'debug.configChanges' | translate }}</span>
              </div>
            </div>
            <div class="history-item-actions" *ngIf="!compareMode">
              <button class="btn btn-secondary btn-sm" (click)="viewVersion(item)">{{ 'debug.configView' | translate }}</button>
              <button class="btn btn-secondary btn-sm" (click)="viewVersionDiff(item, i)" *ngIf="i < history.length - 1" [title]="'debug.configViewDiff' | translate">{{ 'debug.configDiffLabel' | translate }}</button>
              <button class="btn btn-primary btn-sm" (click)="restoreVersion(item)" [disabled]="restoringVersion">{{ restoringVersion === item.id ? ('debug.configRestoring' | translate) : ('debug.configRestore' | translate) }}</button>
            </div>
          </div>
        </div>

        <!-- Version viewer modal -->
        <div class="version-modal" *ngIf="viewingVersion && !viewingDiff" #versionModal>
          <div class="version-modal-header">
            <h5>{{ 'debug.configVersionOf' | translate }} {{ viewingVersion.deployed_at | date:'dd/MM/yyyy HH:mm' }}</h5>
            <button class="btn-close" (click)="viewingVersion = null">\u00D7</button>
          </div>
          <div class="version-modal-body"><pre class="json-viewer">{{ viewingVersionJson }}</pre></div>
        </div>

        <!-- Diff viewer modal -->
        <div class="diff-modal" *ngIf="viewingDiff" #diffModal>
          <div class="diff-modal-header">
            <h5>{{ 'debug.configDiffTitle' | translate }}</h5>
            <div class="diff-versions">
              <span class="diff-version old">{{ diffVersionOld | date:'dd/MM HH:mm' }}</span>
              <span class="diff-arrow">\u2192</span>
              <span class="diff-version new">{{ diffVersionNew | date:'dd/MM HH:mm' }}</span>
            </div>
            <button class="btn-close" (click)="closeDiffView()">\u00D7</button>
          </div>
          <div class="diff-modal-body">
            <div *ngIf="loadingDiff" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.configDiffLoading' | translate }}</span></div>
            <div *ngIf="!loadingDiff && configDiff.length === 0" class="empty-hint">{{ 'debug.configDiffEmpty' | translate }}</div>
            <div *ngIf="!loadingDiff && configDiff.length > 0" class="diff-list">
              <div class="diff-summary">
                <span class="diff-count added">{{ getDiffCountByType('added') }} {{ 'debug.configDiffAdded' | translate }}</span>
                <span class="diff-count removed">{{ getDiffCountByType('removed') }} {{ 'debug.configDiffRemoved' | translate }}</span>
                <span class="diff-count changed">{{ getDiffCountByType('changed') }} {{ 'debug.configDiffChanged' | translate }}</span>
              </div>
              <div class="diff-item" *ngFor="let diff of configDiff" [class.diff-added]="diff.type === 'added'" [class.diff-removed]="diff.type === 'removed'" [class.diff-changed]="diff.type === 'changed'">
                <div class="diff-item-header">
                  <span class="diff-type-badge">{{ diff.type === 'added' ? '\u2795' : diff.type === 'removed' ? '\u2796' : '\u270F\uFE0F' }}</span>
                  <span class="diff-path">{{ diff.path }}</span>
                </div>
                <div class="diff-item-content">
                  <div class="diff-old" *ngIf="diff.type !== 'added' && diff.oldValue !== undefined">
                    <span class="diff-label">{{ 'debug.configDiffBefore' | translate }}:</span>
                    <code>{{ formatDiffValue(diff.oldValue) }}</code>
                  </div>
                  <div class="diff-new" *ngIf="diff.type !== 'removed' && diff.newValue !== undefined">
                    <span class="diff-label">{{ 'debug.configDiffAfter' | translate }}:</span>
                    <code>{{ formatDiffValue(diff.newValue) }}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="debug-card">
      <div class="debug-header" (click)="toggleTimeline()">
        <span class="expand-icon">{{ showTimeline ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCC5</span>
        <h4>{{ 'debug.timelineTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="timelineEvents.length > 0">{{ timelineEvents.length }} {{ 'debug.timelineEvents' | translate }}</span>
      </div>
      <div class="debug-content" *ngIf="showTimeline">
        <div *ngIf="loadingTimeline" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.timelineLoading' | translate }}</span></div>
        <div *ngIf="!loadingTimeline && timelineEvents.length === 0" class="empty-hint">{{ 'debug.timelineEmpty' | translate }}</div>
        <div *ngIf="!loadingTimeline && timelineEvents.length > 0" class="timeline-filter-bar">
          <button class="btn btn-sm" [class.btn-primary]="!timelineTypeFilter" [class.btn-secondary]="timelineTypeFilter" (click)="timelineTypeFilter = ''">{{ 'debug.timelineAll' | translate }}</button>
          <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'deployment'" [class.btn-secondary]="timelineTypeFilter !== 'deployment'" (click)="timelineTypeFilter = 'deployment'">\uD83D\uDCF9 {{ 'debug.timelineDeployments' | translate }}</button>
          <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'command'" [class.btn-secondary]="timelineTypeFilter !== 'command'" (click)="timelineTypeFilter = 'command'">\u26A1 {{ 'debug.timelineCommands' | translate }}</button>
          <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'config'" [class.btn-secondary]="timelineTypeFilter !== 'config'" (click)="timelineTypeFilter = 'config'">\u2699\uFE0F {{ 'debug.timelineConfig' | translate }}</button>
          <button class="btn btn-sm" [class.btn-primary]="timelineTypeFilter === 'alert'" [class.btn-secondary]="timelineTypeFilter !== 'alert'" (click)="timelineTypeFilter = 'alert'">\u26A0\uFE0F {{ 'debug.timelineAlerts' | translate }}</button>
        </div>
        <div *ngIf="!loadingTimeline && timelineEvents.length > 0" class="timeline">
          <div class="timeline-item" *ngFor="let event of getFilteredTimeline()" [class.timeline-deployment]="event.type === 'deployment'" [class.timeline-command]="event.type === 'command'" [class.timeline-config]="event.type === 'config'" [class.timeline-alert]="event.type === 'alert'">
            <div class="timeline-icon">{{ getTimelineIcon(event.type) }}</div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-title">{{ event.title }}</span>
                <span class="timeline-time">{{ event.timestamp | date:'dd/MM HH:mm' }}</span>
              </div>
              <div class="timeline-meta">
                <span class="timeline-status" [class.status-completed]="event.status === 'completed'" [class.status-failed]="event.status === 'failed'" [class.status-active]="event.status === 'active'">{{ getStatusLabel(event.status) }}</span>
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
          <button class="btn btn-secondary btn-sm" (click)="loadTimeline()" [disabled]="loadingTimeline">\uD83D\uDD04 {{ 'debug.timelineRefresh' | translate }}</button>
        </div>
      </div>
    </div>

    <!-- Confirm modal for restore -->
    <div *ngIf="confirmModal.visible" class="modal-overlay" (click)="cancelConfirmModal()">
      <div class="modal-content confirm-modal" (click)="$event.stopPropagation()">
        <h3>{{ confirmModal.icon }} {{ confirmModal.title }}</h3>
        <p>{{ confirmModal.message }}</p>
        <p class="reboot-warning" *ngIf="confirmModal.warning">\u26A0\uFE0F {{ confirmModal.warning }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="cancelConfirmModal()">{{ 'debug.confirmCancel' | translate }}</button>
          <button class="btn" [class.btn-danger]="confirmModal.danger" [class.btn-primary]="!confirmModal.danger" (click)="executeConfirmModal()" [disabled]="confirmModal.executing">{{ confirmModal.executing ? '\u23F3...' : confirmModal.confirmLabel }}</button>
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
    .btn-danger { background: #dc2626; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-danger:disabled { background: #f87171; cursor: not-allowed; }
    .empty-hint { margin: 0; padding: 1rem; text-align: center; color: #64748b; font-size: 0.8125rem; background: #f8fafc; border-radius: 6px; }
    .storage-bar { margin-bottom: 1rem; }
    .storage-info { display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem; }
    .storage-progress { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .storage-fill { height: 100%; background: #2563eb; border-radius: 4px; transition: width 0.3s; }
    .files-list { max-height: 300px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; }
    .file-row { display: grid; grid-template-columns: 1fr 120px 80px; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; font-size: 0.8125rem; }
    .file-row:last-child { border-bottom: none; }
    .file-row.header { background: #f8fafc; font-weight: 600; color: #475569; font-size: 0.75rem; text-transform: uppercase; }
    .file-sortable { cursor: pointer; user-select: none; }
    .file-sortable:hover { color: #2563eb; }
    .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-category { color: #64748b; }
    .file-size { text-align: right; color: #64748b; }
    .sync-info { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.8125rem; display: flex; gap: 0.5rem; }
    .sync-label { color: #64748b; }
    .sync-value { font-weight: 500; }
    .current-config-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; margin-top: 1rem; }
    .current-config-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .current-config-header h5 { margin: 0; font-size: 0.875rem; font-weight: 600; }
    .current-config-actions { display: flex; gap: 0.5rem; }
    .json-viewer { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; font-size: 0.75rem; font-family: 'SF Mono', Monaco, monospace; max-height: 400px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
    .history-list { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 1rem; }
    .history-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
    .history-item.selected { border-color: #2563eb; background: #eff6ff; }
    .history-item.compare-selected { background: #eff6ff; border-color: #2563eb; }
    .history-item-main { display: flex; flex-direction: column; gap: 0.25rem; }
    .history-item-date { font-weight: 600; font-size: 0.875rem; }
    .history-item-user { font-size: 0.75rem; color: #64748b; }
    .history-item-comment { font-size: 0.8125rem; color: #475569; font-style: italic; }
    .history-item-actions { display: flex; gap: 0.5rem; }
    .history-actions { margin-bottom: 0.75rem; }
    .history-item-changes { margin-top: 0.25rem; }
    .changes-badge { font-size: 0.6875rem; padding: 0.125rem 0.375rem; background: #e0e7ff; color: #3730a3; border-radius: 4px; }
    .compare-mode-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #eff6ff; border-radius: 6px; margin-bottom: 1rem; }
    .compare-info { font-size: 0.8125rem; font-weight: 500; }
    .compare-checkbox { margin-right: 0.5rem; }
    .compare-checkbox input { width: 18px; height: 18px; cursor: pointer; }
    .version-modal { margin-top: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .version-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .version-modal-header h5 { margin: 0; font-size: 0.875rem; }
    .btn-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b; }
    .btn-close:hover { color: #1e293b; }
    .version-modal-body { max-height: 300px; overflow: auto; }
    .diff-modal { margin-top: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .diff-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .diff-modal-header h5 { margin: 0; font-size: 0.875rem; }
    .diff-versions { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; }
    .diff-version.old { color: #dc2626; }
    .diff-version.new { color: #15803d; }
    .diff-arrow { color: #64748b; }
    .diff-modal-body { max-height: 400px; overflow-y: auto; padding: 1rem; }
    .diff-summary { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
    .diff-count { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .diff-count.added { background: #dcfce7; color: #15803d; }
    .diff-count.removed { background: #fee2e2; color: #dc2626; }
    .diff-count.changed { background: #fef3c7; color: #92400e; }
    .diff-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .diff-item { border-radius: 6px; overflow: hidden; }
    .diff-item.diff-added { border-left: 3px solid #15803d; background: #f0fdf4; }
    .diff-item.diff-removed { border-left: 3px solid #dc2626; background: #fef2f2; }
    .diff-item.diff-changed { border-left: 3px solid #f59e0b; background: #fffbeb; }
    .diff-item-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.8125rem; }
    .diff-type-badge { font-size: 0.875rem; }
    .diff-path { font-family: 'SF Mono', Monaco, monospace; font-weight: 500; }
    .diff-item-content { padding: 0 0.75rem 0.5rem 0.75rem; font-size: 0.75rem; }
    .diff-old, .diff-new { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
    .diff-label { color: #64748b; min-width: 50px; }
    .diff-item-content code { font-family: 'SF Mono', Monaco, monospace; font-size: 0.6875rem; background: rgba(0,0,0,0.05); padding: 0.125rem 0.25rem; border-radius: 3px; word-break: break-all; }
    .timeline-filter-bar { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .timeline-actions { margin-top: 1rem; }
    .timeline { display: flex; flex-direction: column; gap: 0.75rem; position: relative; }
    .timeline::before { content: ''; position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
    .timeline-item { display: flex; gap: 0.75rem; position: relative; }
    .timeline-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; z-index: 1; background: white; border: 2px solid #e2e8f0; }
    .timeline-item.timeline-deployment .timeline-icon { background: #dbeafe; border-color: #3b82f6; }
    .timeline-item.timeline-command .timeline-icon { background: #dcfce7; border-color: #22c55e; }
    .timeline-item.timeline-config .timeline-icon { background: #fef3c7; border-color: #f59e0b; }
    .timeline-item.timeline-alert .timeline-icon { background: #fee2e2; border-color: #ef4444; }
    .timeline-content { flex: 1; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
    .timeline-item.timeline-deployment .timeline-content { border-left: 3px solid #3b82f6; }
    .timeline-item.timeline-command .timeline-content { border-left: 3px solid #22c55e; }
    .timeline-item.timeline-config .timeline-content { border-left: 3px solid #f59e0b; }
    .timeline-item.timeline-alert .timeline-content { border-left: 3px solid #ef4444; }
    .timeline-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem; }
    .timeline-title { font-weight: 500; font-size: 0.8125rem; }
    .timeline-time { font-size: 0.6875rem; color: #64748b; white-space: nowrap; }
    .timeline-meta { display: flex; gap: 0.5rem; align-items: center; font-size: 0.75rem; }
    .timeline-status { padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.6875rem; font-weight: 500; }
    .timeline-status.status-completed, .timeline-status.status-success { background: #dcfce7; color: #15803d; }
    .timeline-status.status-failed, .timeline-status.status-error { background: #fee2e2; color: #dc2626; }
    .timeline-status.status-active { background: #fef3c7; color: #92400e; }
    .timeline-user { color: #64748b; font-style: italic; }
    .timeline-details { margin-top: 0.375rem; padding-top: 0.375rem; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
    .detail-item { font-size: 0.6875rem; color: #64748b; }
    .detail-key { font-weight: 500; }
    .detail-value { font-family: 'SF Mono', Monaco, monospace; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; border-radius: 12px; padding: 1.5rem; max-width: 450px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .confirm-modal h3 { margin: 0 0 1rem 0; font-size: 1.125rem; color: #1e293b; }
    .confirm-modal p { margin: 0 0 0.75rem 0; font-size: 0.875rem; color: #475569; }
    .reboot-warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 0.75rem; color: #92400e; font-weight: 500; }
    .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
  `]
})
export class SystemInfoComponent implements AfterViewChecked {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() localVideos: LocalVideo[] = [];
  @Input() localStorage: LocalStorage | null = null;
  @Input() lastVideoSync: string | null = null;
  @Input() configHash: string | null = null;
  @Input() configJson: string = '{}';
  @Output() configRestored = new EventEmitter<SiteConfiguration>();

  @ViewChild('versionModal') versionModalRef?: ElementRef<HTMLElement>;
  @ViewChild('diffModal') diffModalRef?: ElementRef<HTMLElement>;
  private shouldScrollToVersionModal = false;
  private shouldScrollToDiffModal = false;

  showFiles: boolean = false;
  showJson: boolean = false;
  fileSortField: 'filename' | 'category' | 'size' = 'filename';
  fileSortAsc: boolean = true;

  showHistory: boolean = false;
  history: ConfigHistory[] = [];
  historyTotal: number = 0;
  loadingHistory: boolean = false;
  selectedHistoryId: string | null = null;
  viewingVersion: ConfigHistory | null = null;
  viewingVersionJson: string = '';
  restoringVersion: string | null = null;

  compareMode: boolean = false;
  selectedForCompare: string[] = [];
  viewingDiff: boolean = false;
  configDiff: ConfigDiff[] = [];
  loadingDiff: boolean = false;
  diffVersionOld: Date | null = null;
  diffVersionNew: Date | null = null;

  showTimeline: boolean = false;
  timelineEvents: TimelineEvent[] = [];
  loadingTimeline: boolean = false;
  timelineTypeFilter: string = '';

  confirmModal: ConfirmModalState = {
    visible: false, title: '', message: '', warning: '', confirmLabel: '',
    danger: false, icon: '', executing: false, onConfirm: null
  };

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private translate: TranslateService
  ) {}

  ngAfterViewChecked(): void {
    if (this.shouldScrollToVersionModal && this.versionModalRef) {
      this.versionModalRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.shouldScrollToVersionModal = false;
    }
    if (this.shouldScrollToDiffModal && this.diffModalRef) {
      this.diffModalRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.shouldScrollToDiffModal = false;
    }
  }

  getTotalSize(): number { return this.localVideos.reduce((sum, v) => sum + v.size, 0); }

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
    if (this.fileSortField === field) { this.fileSortAsc = !this.fileSortAsc; }
    else { this.fileSortField = field; this.fileSortAsc = field === 'size' ? false : true; }
  }

  getSortedVideos(): LocalVideo[] {
    return [...this.localVideos].sort((a, b) => {
      let cmp = 0;
      switch (this.fileSortField) {
        case 'filename': cmp = (a.filename || '').localeCompare(b.filename || ''); break;
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
        case 'size': cmp = a.size - b.size; break;
      }
      return this.fileSortAsc ? cmp : -cmp;
    });
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.configJson);
    this.notificationService.success(this.translate.instant('debug.notifyJsonCopied'));
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

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.history.length === 0) { this.loadHistory(); }
  }

  loadHistory(): void {
    this.loadingHistory = true;
    this.sitesService.getConfigHistory(this.siteId, 20, 0).subscribe({
      next: (response) => { this.history = response.history || []; this.historyTotal = response.total || 0; this.loadingHistory = false; },
      error: (error) => { this.loadingHistory = false; const message = ErrorExtractor.getMessage(error); this.logger.error('Failed to load config history', { error: message, siteId: this.siteId }); }
    });
  }

  viewVersion(item: ConfigHistory): void {
    this.selectedHistoryId = item.id;
    this.viewingVersion = item;
    this.viewingVersionJson = JSON.stringify(item.configuration, null, 2);
    this.shouldScrollToVersionModal = true;
  }

  restoreVersion(item: ConfigHistory): void {
    if (!item.configuration) { this.notificationService.error(this.translate.instant('debug.notifyConfigNotAvailable')); return; }
    const dateStr = new Date(item.deployed_at).toLocaleString();
    this.showConfirmModal({
      title: this.translate.instant('debug.confirmRestoreTitle'),
      message: this.translate.instant('debug.confirmRestoreMsg', { date: dateStr }),
      warning: this.translate.instant('debug.confirmRestoreWarn'),
      confirmLabel: '\uD83D\uDD04 ' + this.translate.instant('debug.configRestore'),
      danger: true, icon: '\uD83D\uDCDC',
      onConfirm: () => this.doRestoreVersion(item),
    });
  }

  private doRestoreVersion(item: ConfigHistory): void {
    this.confirmModal.visible = false;
    this.restoringVersion = item.id;
    this.sitesService.sendCommand(this.siteId, 'update_config', { configuration: item.configuration, mode: 'replace' }).subscribe({
      next: () => {
        this.restoringVersion = null;
        this.notificationService.success(this.translate.instant('debug.notifyConfigRestored'));
        this.configRestored.emit(item.configuration);
      },
      error: (error) => {
        this.restoringVersion = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyRestoreError')}: ${message}`);
        this.logger.error('Failed to restore config version', { error: message, siteId: this.siteId, versionId: item.id });
      }
    });
  }

  startCompareMode(): void { this.compareMode = true; this.selectedForCompare = []; }
  cancelCompareMode(): void { this.compareMode = false; this.selectedForCompare = []; }
  isSelectedForCompare(id: string): boolean { return this.selectedForCompare.includes(id); }

  toggleCompareSelection(id: string): void {
    const index = this.selectedForCompare.indexOf(id);
    if (index > -1) { this.selectedForCompare.splice(index, 1); }
    else if (this.selectedForCompare.length < 2) { this.selectedForCompare.push(id); }
  }

  executeCompare(): void {
    if (this.selectedForCompare.length !== 2) return;
    this.loadingDiff = true;
    this.viewingDiff = true;
    this.shouldScrollToDiffModal = true;
    const version1 = this.history.find(h => h.id === this.selectedForCompare[0]);
    const version2 = this.history.find(h => h.id === this.selectedForCompare[1]);
    const sorted = [version1, version2].sort((a, b) => new Date(a!.deployed_at).getTime() - new Date(b!.deployed_at).getTime());
    this.diffVersionOld = sorted[0] ? new Date(sorted[0].deployed_at) : null;
    this.diffVersionNew = sorted[1] ? new Date(sorted[1].deployed_at) : null;
    this.sitesService.compareConfigVersions(this.siteId, sorted[0]!.id, sorted[1]!.id).subscribe({
      next: (response) => { this.loadingDiff = false; this.configDiff = response.diff || []; this.compareMode = false; this.selectedForCompare = []; },
      error: (error) => { this.loadingDiff = false; const message = ErrorExtractor.getMessage(error); this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`); this.logger.error('Failed to compare config versions', { error: message, siteId: this.siteId }); }
    });
  }

  viewVersionDiff(item: ConfigHistory, index: number): void {
    if (index >= this.history.length - 1) return;
    const olderVersion = this.history[index + 1];
    this.loadingDiff = true;
    this.viewingDiff = true;
    this.shouldScrollToDiffModal = true;
    this.diffVersionOld = new Date(olderVersion.deployed_at);
    this.diffVersionNew = new Date(item.deployed_at);
    this.sitesService.compareConfigVersions(this.siteId, olderVersion.id, item.id).subscribe({
      next: (response) => { this.loadingDiff = false; this.configDiff = response.diff || []; },
      error: (error) => { this.loadingDiff = false; const message = ErrorExtractor.getMessage(error); this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`); }
    });
  }

  closeDiffView(): void { this.viewingDiff = false; this.configDiff = []; this.diffVersionOld = null; this.diffVersionNew = null; }
  getDiffCountByType(type: 'added' | 'removed' | 'changed'): number { return this.configDiff.filter(d => d.type === type).length; }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  toggleTimeline(): void {
    this.showTimeline = !this.showTimeline;
    if (this.showTimeline && this.timelineEvents.length === 0) { this.loadTimeline(); }
  }

  loadTimeline(): void {
    this.loadingTimeline = true;
    this.sitesService.getTimeline(this.siteId, 20).subscribe({
      next: (response) => { this.loadingTimeline = false; this.timelineEvents = response.events; },
      error: (error) => { this.loadingTimeline = false; const message = ErrorExtractor.getMessage(error); this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`); this.logger.error('Failed to load timeline', { error: message, siteId: this.siteId }); }
    });
  }

  getTimelineIcon(type: string): string {
    switch (type) { case 'deployment': return '\uD83D\uDCF9'; case 'command': return '\u26A1'; case 'config': return '\u2699\uFE0F'; case 'alert': return '\u26A0\uFE0F'; default: return '\uD83D\uDCCC'; }
  }

  getStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'completed': return '\u2705 ' + this.translate.instant('debug.statusCompleted');
      case 'in_progress': return '\u23F3 ' + this.translate.instant('debug.statusInProgress');
      case 'failed': return '\u274C ' + this.translate.instant('debug.statusFailed');
      case 'active': return '\uD83D\uDD34 ' + this.translate.instant('debug.statusActive');
      case 'resolved': return '\u2705 ' + this.translate.instant('debug.statusResolved');
      case 'pending': return '\u23F8\uFE0F ' + this.translate.instant('debug.statusPending');
      default: return status || '';
    }
  }

  getFilteredTimeline(): TimelineEvent[] {
    if (!this.timelineTypeFilter) return this.timelineEvents;
    return this.timelineEvents.filter(e => e.type === this.timelineTypeFilter);
  }

  hasDetails(details: Record<string, unknown>): boolean { return Object.keys(details).length > 0; }
  getDetailKeys(details: Record<string, unknown>): string[] { return Object.keys(details).slice(0, 5); }

  formatDetailValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private showConfirmModal(options: { title: string; message: string; warning?: string; confirmLabel?: string; danger?: boolean; icon?: string; onConfirm: () => void }): void {
    this.confirmModal = {
      visible: true, title: options.title, message: options.message,
      warning: options.warning || '', confirmLabel: options.confirmLabel || 'Confirmer',
      danger: options.danger ?? true, icon: options.icon || '\u26A0\uFE0F',
      executing: false, onConfirm: options.onConfirm,
    };
  }

  cancelConfirmModal(): void { this.confirmModal.visible = false; this.confirmModal.onConfirm = null; }

  executeConfirmModal(): void {
    if (this.confirmModal.onConfirm) { this.confirmModal.executing = true; this.confirmModal.onConfirm(); }
  }
}
