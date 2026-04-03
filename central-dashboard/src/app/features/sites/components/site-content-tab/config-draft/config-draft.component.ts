import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DraftService, ConfigDraft, SiteConfiguration as DraftSiteConfiguration } from '../../../../../core/services/draft.service';
import { SitesService } from '../../../../../core/services/sites.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import { SiteConfiguration, ConfigDiff, ConfigHistory } from '../../../../../core/models';

@Component({
  selector: 'app-config-draft',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Draft Indicator -->
    <div class="draft-indicator" *ngIf="draft || isDirty">
      <div class="draft-info">
        <span class="draft-icon">📝</span>
        <div class="draft-text">
          <span class="draft-title" *ngIf="isDirty">Modifications non enregistrées</span>
          <span class="draft-title" *ngIf="draft && !isDirty">Brouillon sauvegardé</span>
          <span class="draft-time" *ngIf="draft">Dernière modification: {{ draft.updated_at | date:'short' }}</span>
        </div>
      </div>
      <div class="draft-actions">
        <button class="btn btn-sm btn-secondary" (click)="onSaveDraft()" [disabled]="!isDirty || savingDraft">
          {{ savingDraft ? 'Sauvegarde...' : 'Sauvegarder' }}
        </button>
        <button class="btn btn-sm btn-outline" (click)="onDeleteDraft()" *ngIf="draft" [disabled]="savingDraft">
          Supprimer brouillon
        </button>
      </div>
    </div>

    <!-- Config History -->
    <div class="section card" id="section-history">
      <div class="section-header clickable" (click)="toggleHistory()">
        <h4>
          <span class="section-icon">📜</span>
          Historique des modifications
          <span class="history-count" *ngIf="configHistory.length > 0">({{ configHistoryTotal }})</span>
        </h4>
        <span class="expand-icon">{{ showHistory ? '▼' : '▶' }}</span>
      </div>

      <div class="history-content" *ngIf="showHistory">
        <div class="loading-inline" *ngIf="loadingHistory">
          <div class="spinner-small"></div>
          <span>Chargement de l'historique...</span>
        </div>

        <div class="history-list" *ngIf="!loadingHistory && configHistory.length > 0">
          <div class="history-item" *ngFor="let entry of configHistory; let entryIdx = index">
            <div class="history-header-row">
              <div class="history-meta">
                <span class="history-date">{{ entry.deployed_at | date:'dd/MM/yyyy HH:mm' }}</span>
                <span class="history-author" *ngIf="entry.deployed_by_name || entry.deployed_by_email">
                  par {{ entry.deployed_by_name || entry.deployed_by_email }}
                </span>
              </div>
              <div class="history-entry-actions">
                <button
                  class="btn-history-detail"
                  *ngIf="entry.changes_summary && entry.changes_summary.length > 0"
                  (click)="toggleHistoryDetail(entryIdx)"
                  title="Voir le détail des changements"
                >
                  {{ expandedHistoryItems[entryIdx] ? '▼' : '▶' }} Détails
                </button>
                <button
                  class="btn-history-restore"
                  (click)="onRestoreVersion(entry)"
                  title="Restaurer cette version"
                >
                  ↩ Restaurer
                </button>
              </div>
            </div>
            <div class="history-comment" *ngIf="entry.comment">{{ entry.comment }}</div>
            <div class="history-changes" *ngIf="entry.changes_summary && entry.changes_summary.length > 0">
              <span class="history-changes-count">{{ entry.changes_summary!.length }} changement(s)</span>
              <span class="history-change-pills">
                <span class="change-pill added" *ngIf="countChangeType(entry.changes_summary!, 'added') as n">+{{ n }}</span>
                <span class="change-pill changed" *ngIf="countChangeType(entry.changes_summary!, 'changed') as n">~{{ n }}</span>
                <span class="change-pill removed" *ngIf="countChangeType(entry.changes_summary!, 'removed') as n">-{{ n }}</span>
              </span>
            </div>

            <div class="history-detail" *ngIf="expandedHistoryItems[entryIdx] && entry.changes_summary">
              <div
                class="history-diff-row"
                *ngFor="let diff of entry.changes_summary"
                [class]="'diff-type-' + diff.type"
              >
                <span class="diff-type-badge">
                  <span *ngIf="diff.type === 'added'">+</span>
                  <span *ngIf="diff.type === 'changed'">~</span>
                  <span *ngIf="diff.type === 'removed'">−</span>
                </span>
                <span class="diff-path">{{ diff.path || diff.field }}</span>
                <span class="diff-values" *ngIf="diff.type === 'changed'">
                  <span class="diff-old">{{ formatDiffValue(diff.oldValue) }}</span>
                  →
                  <span class="diff-new">{{ formatDiffValue(diff.newValue) }}</span>
                </span>
                <span class="diff-values" *ngIf="diff.type === 'added'">
                  <span class="diff-new">{{ formatDiffValue(diff.newValue) }}</span>
                </span>
                <span class="diff-values" *ngIf="diff.type === 'removed'">
                  <span class="diff-old">{{ formatDiffValue(diff.oldValue) }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="empty-state small" *ngIf="!loadingHistory && configHistory.length === 0">
          <p>Aucun historique disponible</p>
        </div>

        <div class="history-actions" *ngIf="!loadingHistory && configHistoryTotal > configHistory.length">
          <button class="btn btn-sm btn-outline" (click)="loadMoreHistory()">
            Voir plus ({{ configHistoryTotal - configHistory.length }} restant(s))
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .draft-indicator {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .draft-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .draft-icon { font-size: 1.25rem; }

    .draft-text {
      display: flex;
      flex-direction: column;
    }

    .draft-title {
      font-weight: 500;
      color: #1e40af;
    }

    .draft-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .draft-actions {
      display: flex;
      gap: 0.5rem;
    }

    .section { margin-bottom: 0; }

    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .section-header h4 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
    }

    .section-icon { font-size: 1.25rem; }

    .section-header.clickable {
      cursor: pointer;
      user-select: none;
    }

    .section-header.clickable:hover { opacity: 0.85; }

    .expand-icon {
      font-size: 0.75rem;
      color: #64748b;
      width: 16px;
    }

    .history-count {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 400;
    }

    .history-content { margin-top: 0.75rem; }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .history-item {
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #3b82f6;
    }

    .history-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .history-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }

    .history-date {
      font-weight: 600;
      color: #334155;
    }

    .history-author { color: #64748b; }

    .history-comment {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
      color: #475569;
      font-style: italic;
    }

    .history-changes {
      margin-top: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .history-changes-count {
      font-size: 0.75rem;
      color: #64748b;
    }

    .history-change-pills {
      display: flex;
      gap: 0.25rem;
    }

    .change-pill {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.0625rem 0.375rem;
      border-radius: 4px;
    }

    .change-pill.added { background: #dcfce7; color: #166534; }
    .change-pill.changed { background: #fef3c7; color: #92400e; }
    .change-pill.removed { background: #fee2e2; color: #991b1b; }

    .history-entry-actions {
      display: flex;
      gap: 0.375rem;
      flex-shrink: 0;
    }

    .btn-history-detail {
      border: 1px solid #e2e8f0;
      background: white;
      color: #64748b;
      font-size: 0.6875rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-history-detail:hover { background: #f1f5f9; color: #334155; }

    .btn-history-restore {
      border: 1px solid #dbeafe;
      background: #eff6ff;
      color: #1e40af;
      font-size: 0.6875rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-history-restore:hover { background: #dbeafe; }

    .history-detail {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 300px;
      overflow-y: auto;
    }

    .history-diff-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.25rem 0.375rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: ui-monospace, monospace;
    }

    .history-diff-row.diff-type-added { background: #f0fdf4; }
    .history-diff-row.diff-type-changed { background: #fffbeb; }
    .history-diff-row.diff-type-removed { background: #fef2f2; }

    .diff-type-badge {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-weight: 700;
      font-size: 0.6875rem;
      flex-shrink: 0;
    }

    .diff-type-added .diff-type-badge { background: #dcfce7; color: #166534; }
    .diff-type-changed .diff-type-badge { background: #fef3c7; color: #92400e; }
    .diff-type-removed .diff-type-badge { background: #fee2e2; color: #991b1b; }

    .diff-path {
      color: #475569;
      word-break: break-all;
      min-width: 0;
    }

    .diff-values {
      color: #64748b;
      margin-left: auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
    }

    .diff-old { color: #991b1b; text-decoration: line-through; }
    .diff-new { color: #166534; }

    .history-actions {
      margin-top: 0.75rem;
      text-align: center;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
    }

    .spinner-small {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .empty-state p { margin: 0 0 1rem 0; }

    .empty-state.small { padding: 1rem; }
    .empty-state.small p { margin: 0; font-size: 0.8125rem; }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover { background: #f8fafc; }

    .btn-outline {
      background: white;
      border: 1px solid #e2e8f0;
      color: #475569;
    }

    .btn-outline:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .btn-outline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class ConfigDraftComponent {
  @Input() siteId!: string;
  @Input() config!: SiteConfiguration;
  @Input() isDirty = false;
  @Input() draft: ConfigDraft | null = null;

  @Output() draftSaved = new EventEmitter<ConfigDraft>();
  @Output() draftDeleted = new EventEmitter<void>();
  @Output() versionRestored = new EventEmitter<SiteConfiguration>();

  savingDraft = false;
  showHistory = false;
  configHistory: ConfigHistory[] = [];
  configHistoryTotal = 0;
  loadingHistory = false;
  expandedHistoryItems: Record<number, boolean> = {};

  constructor(
    private draftService: DraftService,
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef
  ) {}

  onSaveDraft(): void {
    if (!this.siteId || this.savingDraft) return;

    this.savingDraft = true;
    this.cdr.markForCheck();

    const configToSave: Partial<SiteConfiguration> = {
      sponsors: this.config.sponsors,
      categories: this.config.categories,
      timeCategories: this.config.timeCategories,
      categoryMappings: this.config.categoryMappings
    };

    this.draftService.saveDraft(this.siteId, configToSave as unknown as DraftSiteConfiguration, 'Brouillon').subscribe({
      next: (savedDraft) => {
        this.savingDraft = false;
        this.notificationService.success('Brouillon sauvegardé');
        this.draftSaved.emit(savedDraft);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.savingDraft = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  onDeleteDraft(): void {
    if (!this.siteId || !this.draft) return;
    if (!confirm('Supprimer le brouillon ? Cette action est irréversible.')) return;

    this.draftService.deleteDraft(this.siteId).subscribe({
      next: () => {
        this.notificationService.success('Brouillon supprimé');
        this.draftDeleted.emit();
        this.cdr.markForCheck();
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.configHistory.length === 0) {
      this.loadConfigHistory();
    }
  }

  loadConfigHistory(): void {
    this.loadingHistory = true;
    this.cdr.markForCheck();
    this.sitesService.getConfigHistory(this.siteId, 10, 0).subscribe({
      next: (response) => {
        this.configHistory = response.history || [];
        this.configHistoryTotal = response.total || 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.configHistory = [];
        this.configHistoryTotal = 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadMoreHistory(): void {
    const offset = this.configHistory.length;
    this.loadingHistory = true;
    this.cdr.markForCheck();
    this.sitesService.getConfigHistory(this.siteId, 10, offset).subscribe({
      next: (response) => {
        this.configHistory = [...this.configHistory, ...(response.history || [])];
        this.configHistoryTotal = response.total || 0;
        this.loadingHistory = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingHistory = false;
        this.cdr.markForCheck();
      }
    });
  }

  countChangeType(changes: ConfigDiff[], type: string): number {
    return changes.filter(c => c.type === type).length;
  }

  toggleHistoryDetail(index: number): void {
    this.expandedHistoryItems[index] = !this.expandedHistoryItems[index];
    this.cdr.markForCheck();
  }

  onRestoreVersion(entry: ConfigHistory): void {
    if (!entry.configuration) return;
    const restored = JSON.parse(JSON.stringify(entry.configuration)) as SiteConfiguration;
    this.versionRestored.emit(restored);
    this.notificationService.success('Configuration restaurée — déployez pour appliquer');
    this.showHistory = false;
  }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return '(vide)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
}
