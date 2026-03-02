/**
 * SAFe Sprint Tracker
 *
 * Vue sprint : sélecteur, KPI bar, stories groupées par feature, status inline, progress bar.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  SafeService,
  SafeSprintTracker,
  SafeSprint,
  SafeSprintStory,
  SprintStoryStatus,
} from '../../core/services/safe.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

interface FeatureGroup {
  featureId: string;
  stories: SafeSprintStory[];
  totalSp: number;
  doneSp: number;
}

@Component({
  selector: 'app-safe-sprint-tracker',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sprint-tracker" *ngIf="tracker; else skeleton">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>{{ 'safe.sprints.title' | translate }}</h1>
          <span class="pi-badge" *ngIf="selectedSprint">{{ selectedSprint.piId }}</span>
        </div>
        <div class="header-actions">
          <a routerLink="/safe" class="btn btn-secondary">
            {{ 'safe.portfolio.title' | translate }}
          </a>
        </div>
      </div>

      <!-- Sprint Selector -->
      <div class="sprint-selector">
        <label>{{ 'safe.sprints.selectSprint' | translate }}</label>
        <select [ngModel]="selectedSprintId" (ngModelChange)="onSprintChange($event)">
          <option *ngFor="let s of tracker.sprints; trackBy: trackBySprintId" [value]="s.id">
            {{ s.name }}
            <ng-container *ngIf="s.id === tracker.currentSprintId"> ({{ 'safe.sprints.current' | translate }})</ng-container>
          </option>
        </select>
      </div>

      <!-- KPI Bar -->
      <div class="kpi-grid" *ngIf="selectedSprint">
        <div class="kpi-card">
          <div class="kpi-value">{{ selectedSprint.velocity }}</div>
          <div class="kpi-label">{{ 'safe.sprints.velocity' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ selectedSprint.capacity }}</div>
          <div class="kpi-label">{{ 'safe.sprints.capacity' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ completionPercent }}%</div>
          <div class="kpi-label">{{ 'safe.sprints.completion' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ storiesRemaining }}</div>
          <div class="kpi-label">{{ 'safe.sprints.remaining' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ tracker.averageVelocity | number:'1.0-0' }}</div>
          <div class="kpi-label">{{ 'safe.sprints.avgVelocity' | translate }}</div>
        </div>
      </div>

      <!-- Sprint Progress Bar -->
      <div class="section-card" *ngIf="selectedSprint">
        <div class="progress-header">
          <span>{{ 'safe.sprints.progress' | translate }}</span>
          <span class="progress-dates">{{ selectedSprint.startDate }} → {{ selectedSprint.endDate }}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div class="progress-done" [style.width.%]="completionPercent"></div>
            <div class="progress-wip" [style.width.%]="wipPercent" [style.left.%]="completionPercent"></div>
          </div>
          <div class="progress-legend">
            <span class="legend-item"><span class="legend-dot done"></span> {{ 'safe.sprints.storyDone' | translate }} ({{ doneCount }})</span>
            <span class="legend-item"><span class="legend-dot wip"></span> {{ 'safe.sprints.storyInProgress' | translate }} ({{ wipCount }})</span>
            <span class="legend-item"><span class="legend-dot todo"></span> {{ 'safe.sprints.storyTodo' | translate }} ({{ todoCount }})</span>
            <span class="legend-item" *ngIf="removedCount > 0"><span class="legend-dot removed"></span> {{ 'safe.sprints.storyRemoved' | translate }} ({{ removedCount }})</span>
          </div>
        </div>
      </div>

      <!-- Stories by Feature -->
      <div class="section-card" *ngIf="selectedSprint && featureGroups.length > 0">
        <h2>{{ 'safe.sprints.stories' | translate }}</h2>
        <div class="feature-group" *ngFor="let fg of featureGroups; trackBy: trackByFeatureId">
          <div class="feature-header">
            <span class="feature-id">{{ fg.featureId }}</span>
            <span class="feature-progress">{{ fg.doneSp }}/{{ fg.totalSp }} SP</span>
            <div class="feature-bar">
              <div class="feature-bar-fill" [style.width.%]="fg.totalSp > 0 ? (fg.doneSp / fg.totalSp * 100) : 0"></div>
            </div>
          </div>
          <table class="stories-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{{ 'safe.sprints.storyName' | translate }}</th>
                <th>SP</th>
                <th>{{ 'safe.sprints.priority' | translate }}</th>
                <th>{{ 'safe.proposals.status' | translate }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let story of fg.stories; trackBy: trackByStoryId" [class]="'story-' + story.status">
                <td class="story-id">{{ story.id }}</td>
                <td class="story-name">{{ story.name }}</td>
                <td class="story-sp">{{ story.storyPoints }}</td>
                <td><span class="priority-badge" [ngClass]="prioCssClass(story.priority)">{{ story.priority }}</span></td>
                <td>
                  <select
                    class="status-select"
                    [class]="'status-' + story.status"
                    [ngModel]="story.status"
                    (ngModelChange)="onStoryStatusChange(story, $event)"
                  >
                    <option *ngFor="let s of storyStatuses" [value]="s">{{ 'safe.storyStatus.' + s | translate }}</option>
                  </select>
                </td>
                <td><button class="btn-icon" (click)="openStoryEditModal(story)">✏️</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Empty state -->
      <div class="section-card empty-state" *ngIf="selectedSprint && featureGroups.length === 0">
        <p>{{ 'safe.sprints.empty' | translate }}</p>
      </div>

    </div>

    <!-- Story Edit Modal -->
    <div class="modal" *ngIf="showStoryEditModal" (click)="closeStoryEditModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Modifier la story</h3>
          <button class="modal-close" (click)="closeStoryEditModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Story</label>
            <div class="read-only-field">{{ editingStory?.id }} — {{ editingStory?.name }}</div>
          </div>
          <div class="form-group">
            <label>Story Points (1-21)</label>
            <input type="number" class="form-control" [(ngModel)]="storyEditForm.storyPoints" min="1" max="21">
          </div>
          <div class="form-group">
            <label>Priorité</label>
            <select class="form-control" [(ngModel)]="storyEditForm.priority">
              <option *ngFor="let p of priorities" [value]="p">{{ p }}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" (click)="closeStoryEditModal()" [disabled]="savingStoryEdit">Annuler</button>
          <button class="btn btn-save" (click)="saveStoryEdit()" [disabled]="savingStoryEdit">
            {{ savingStoryEdit ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Skeleton -->
    <ng-template #skeleton>
      <div class="sprint-tracker">
        <div class="page-header">
          <div class="header-left">
            <div class="skel skel-pulse skel-title"></div>
          </div>
        </div>
        <div class="skel skel-pulse skel-selector"></div>
        <div class="kpi-grid">
          <div class="kpi-card" *ngFor="let i of [1,2,3,4,5]">
            <div class="skel skel-pulse skel-kpi-value"></div>
            <div class="skel skel-pulse skel-kpi-label"></div>
          </div>
        </div>
        <div class="section-card">
          <div class="skel skel-pulse skel-section-title"></div>
          <div class="skel skel-pulse skel-progress"></div>
        </div>
        <div class="section-card">
          <div class="skel skel-pulse skel-section-title"></div>
          <div class="skel skel-pulse skel-table-row" *ngFor="let i of [1,2,3,4,5,6]"></div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .sprint-tracker { padding: 24px; max-width: 1400px; margin: 0 auto; }

    /* Header */
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left h1 { margin: 0; font-size: 24px; color: var(--neo-text, #fff); }
    .pi-badge {
      background: var(--neo-primary, #4f8cff); color: #fff;
      padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;
    }
    .header-actions { display: flex; gap: 8px; }
    .btn {
      padding: 8px 16px; border-radius: 8px; font-size: 13px;
      text-decoration: none; cursor: pointer; border: none;
    }
    .btn-secondary {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333);
    }
    .btn-secondary:hover { background: var(--neo-border, #333); }

    /* Sprint Selector */
    .sprint-selector {
      display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
      padding: 16px; background: var(--neo-card, #1a1a2e); border-radius: 12px;
    }
    .sprint-selector label { color: var(--neo-text-secondary, #999); font-size: 13px; white-space: nowrap; }
    .sprint-selector select {
      flex: 1; max-width: 400px;
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333); border-radius: 8px;
      padding: 8px 12px; font-size: 14px; cursor: pointer;
    }
    .sprint-selector select:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }

    /* KPI Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card {
      background: var(--neo-card, #1a1a2e); border-radius: 12px;
      padding: 16px; text-align: center;
    }
    .kpi-value { font-size: 28px; font-weight: 700; color: var(--neo-text, #fff); }
    .kpi-label { font-size: 12px; color: var(--neo-text-secondary, #999); margin-top: 4px; }

    /* Section */
    .section-card {
      background: var(--neo-card, #1a1a2e); border-radius: 12px;
      padding: 20px; margin-bottom: 24px;
    }
    .section-card h2 { margin: 0 0 16px; font-size: 18px; color: var(--neo-text, #fff); }

    /* Progress Bar */
    .progress-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; color: var(--neo-text, #fff); font-weight: 600;
    }
    .progress-dates { font-size: 12px; color: var(--neo-text-secondary, #999); font-weight: 400; }
    .progress-bar-container { margin-bottom: 8px; }
    .progress-bar {
      position: relative; height: 24px; background: var(--neo-bg, #121220);
      border-radius: 12px; overflow: hidden;
    }
    .progress-done {
      position: absolute; top: 0; left: 0; height: 100%;
      background: #4caf50; border-radius: 12px 0 0 12px;
      transition: width 0.4s ease;
    }
    .progress-wip {
      position: absolute; top: 0; height: 100%;
      background: #ff9800; transition: width 0.4s ease, left 0.4s ease;
    }
    .progress-legend { display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--neo-text-secondary, #999); }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .legend-dot.done { background: #4caf50; }
    .legend-dot.wip { background: #ff9800; }
    .legend-dot.todo { background: var(--neo-border, #444); }
    .legend-dot.removed { background: #f44336; }

    /* Feature Groups */
    .feature-group { margin-bottom: 20px; }
    .feature-group:last-child { margin-bottom: 0; }
    .feature-header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--neo-border, #333);
      margin-bottom: 8px;
    }
    .feature-id { font-weight: 600; color: var(--neo-primary, #4f8cff); font-size: 14px; }
    .feature-progress { font-size: 12px; color: var(--neo-text-secondary, #999); white-space: nowrap; }
    .feature-bar { flex: 1; max-width: 200px; height: 6px; background: var(--neo-bg, #121220); border-radius: 3px; overflow: hidden; }
    .feature-bar-fill { height: 100%; background: #4caf50; border-radius: 3px; transition: width 0.3s ease; }

    /* Stories Table */
    .stories-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .stories-table th {
      text-align: left; padding: 6px 12px; color: var(--neo-text-secondary, #999);
      font-weight: 600; font-size: 11px; text-transform: uppercase;
    }
    .stories-table td {
      padding: 8px 12px; color: var(--neo-text, #fff);
      border-bottom: 1px solid var(--neo-border, #222);
    }
    .story-id { font-weight: 600; color: var(--neo-primary, #4f8cff); white-space: nowrap; }
    .story-name { max-width: 400px; }
    .story-sp { font-weight: 600; text-align: center; }
    .story-done td { opacity: 0.6; }
    .story-removed td { opacity: 0.4; text-decoration: line-through; }

    /* Priority badges */
    .priority-badge {
      padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;
    }
    .prio-must { background: #b71c1c; color: #ef9a9a; }
    .prio-should { background: #e65100; color: #ffcc80; }
    .prio-could { background: #1565c0; color: #90caf9; }
    .prio-wont { background: #424242; color: #bdbdbd; }

    /* Status select */
    .status-select {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333); border-radius: 6px;
      padding: 4px 8px; font-size: 12px; cursor: pointer;
    }
    .status-select:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }
    .status-select.status-done { border-color: #4caf50; color: #a5d6a7; }
    .status-select.status-in-progress { border-color: #ff9800; color: #ffcc80; }
    .status-select.status-todo { border-color: var(--neo-border, #444); }
    .status-select.status-removed { border-color: #f44336; color: #ef9a9a; }

    /* Empty state */
    .empty-state { text-align: center; color: var(--neo-text-secondary, #999); padding: 40px 20px; }

    /* Skeleton */
    .skel { background: var(--neo-surface, #1e1e2e); border-radius: 8px; }
    .skel-pulse { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .skel-title { width: 200px; height: 28px; }
    .skel-selector { height: 52px; margin-bottom: 24px; }
    .skel-kpi-value { width: 60px; height: 32px; margin: 0 auto 8px; }
    .skel-kpi-label { width: 80px; height: 14px; margin: 0 auto; }
    .skel-section-title { width: 180px; height: 20px; margin-bottom: 16px; }
    .skel-progress { height: 24px; margin-bottom: 12px; }
    .skel-table-row { height: 36px; margin-bottom: 6px; }

    /* Edit button */
    .btn-icon {
      background: none; border: none; cursor: pointer; font-size: 14px;
      padding: 2px 6px; border-radius: 4px; opacity: 0.5;
      transition: opacity 0.2s;
    }
    .btn-icon:hover { opacity: 1; }

    /* Modal */
    .modal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-content {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px;
      width: 90%; max-width: 480px; border: 1px solid var(--neo-border, #333);
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; border-bottom: 1px solid var(--neo-border, #333);
    }
    .modal-header h3 { margin: 0; font-size: 16px; color: var(--neo-text, #fff); }
    .modal-close {
      background: none; border: none; color: var(--neo-text-secondary, #999);
      font-size: 22px; cursor: pointer; padding: 0 4px; line-height: 1;
    }
    .modal-close:hover { color: var(--neo-text, #fff); }
    .modal-body { padding: 20px; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 16px 20px; border-top: 1px solid var(--neo-border, #333);
    }
    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block; font-size: 12px; color: var(--neo-text-secondary, #999);
      margin-bottom: 6px; text-transform: uppercase; font-weight: 600;
    }
    .form-control {
      width: 100%; padding: 8px 12px; border-radius: 8px;
      background: var(--neo-bg, #121220); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333); font-size: 14px;
      box-sizing: border-box;
    }
    .form-control:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }
    .read-only-field {
      padding: 8px 12px; background: var(--neo-bg, #121220);
      border-radius: 8px; color: var(--neo-text-secondary, #999); font-size: 14px;
    }
    .btn-cancel { background: var(--neo-bg, #121220); color: var(--neo-text, #fff); border: 1px solid var(--neo-border, #333); }
    .btn-save { background: var(--neo-primary, #4f8cff); color: #fff; border: none; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 768px) {
      .sprint-tracker { padding: 16px; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .feature-header { flex-wrap: wrap; }
      .feature-bar { max-width: 100%; }
      .stories-table { font-size: 12px; }
      .stories-table th, .stories-table td { padding: 6px 8px; }
    }
  `]
})
export class SafeSprintTrackerComponent implements OnInit, OnDestroy {
  private readonly safeService = inject(SafeService);
  private readonly notif = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  tracker: SafeSprintTracker | null = null;
  selectedSprintId = '';
  selectedSprint: SafeSprint | null = null;
  featureGroups: FeatureGroup[] = [];

  readonly storyStatuses: SprintStoryStatus[] = ['todo', 'in-progress', 'done', 'removed'];
  readonly priorities = ['Must', 'Should', 'Could', 'Nice'];

  // Story edit modal state
  showStoryEditModal = false;
  editingStory: SafeSprintStory | null = null;
  storyEditForm = { storyPoints: 0, priority: '' };
  savingStoryEdit = false;

  // KPI computed values
  completionPercent = 0;
  wipPercent = 0;
  storiesRemaining = 0;
  doneCount = 0;
  wipCount = 0;
  todoCount = 0;
  removedCount = 0;

  ngOnInit(): void {
    this.safeService.getSprints().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.tracker = data;
        const initialId = data.currentSprintId || (data.sprints.length > 0 ? data.sprints[0].id : '');
        this.selectSprint(initialId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.notif.error(this.translate.instant('safe.sprints.loadError'));
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSprintChange(sprintId: string): void {
    this.selectSprint(sprintId);
  }

  async onStoryStatusChange(story: SafeSprintStory, newStatus: SprintStoryStatus): Promise<void> {
    if (newStatus === story.status || !this.selectedSprint) return;

    const oldStatus = story.status;
    const label = this.translate.instant('safe.storyStatus.' + newStatus);
    const confirmed = await this.confirmDialog.confirm(
      this.translate.instant('safe.sprints.confirmStatusChange', { id: story.id, status: label })
    );

    if (!confirmed) {
      this.cdr.markForCheck();
      return;
    }

    // Optimistic update
    story.status = newStatus;
    this.recomputeKpis();
    this.cdr.markForCheck();

    this.safeService.updateStoryStatus(this.selectedSprint.id, story.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notif.success(this.translate.instant('safe.sprints.statusUpdated'));
          // Update sprint velocity
          if (this.selectedSprint) {
            this.selectedSprint.velocity = this.selectedSprint.stories
              .filter(s => s.status === 'done')
              .reduce((sum, s) => sum + s.storyPoints, 0);
          }
          this.recomputeKpis();
          this.cdr.markForCheck();
        },
        error: () => {
          // Rollback
          story.status = oldStatus;
          this.recomputeKpis();
          this.cdr.markForCheck();
          this.notif.error(this.translate.instant('safe.sprints.statusError'));
        }
      });
  }

  openStoryEditModal(story: SafeSprintStory): void {
    this.editingStory = story;
    this.storyEditForm = {
      storyPoints: story.storyPoints,
      priority: story.priority,
    };
    this.showStoryEditModal = true;
    this.cdr.markForCheck();
  }

  closeStoryEditModal(): void {
    this.showStoryEditModal = false;
    this.editingStory = null;
    this.cdr.markForCheck();
  }

  saveStoryEdit(): void {
    if (!this.editingStory || !this.selectedSprint || this.savingStoryEdit) return;

    const data: { storyPoints?: number; priority?: string } = {};
    if (this.storyEditForm.storyPoints !== this.editingStory.storyPoints) {
      data.storyPoints = this.storyEditForm.storyPoints;
    }
    if (this.storyEditForm.priority !== this.editingStory.priority) {
      data.priority = this.storyEditForm.priority;
    }

    if (data.storyPoints === undefined && data.priority === undefined) {
      this.closeStoryEditModal();
      return;
    }

    this.savingStoryEdit = true;
    this.cdr.markForCheck();

    const storyRef = this.editingStory;
    this.safeService.updateStoryFields(this.selectedSprint.id, storyRef.id, data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Optimistic update
          if (data.storyPoints !== undefined) storyRef.storyPoints = data.storyPoints;
          if (data.priority !== undefined) storyRef.priority = data.priority;
          this.buildFeatureGroups();
          this.recomputeKpis();
          this.notif.success('Story mise à jour');
          this.savingStoryEdit = false;
          this.showStoryEditModal = false;
          this.editingStory = null;
          this.cdr.markForCheck();
        },
        error: () => {
          this.notif.error('Erreur lors de la mise à jour');
          this.savingStoryEdit = false;
          this.cdr.markForCheck();
        }
      });
  }

  // trackBy functions
  trackBySprintId(_index: number, sprint: SafeSprint): string { return sprint.id; }
  trackByFeatureId(_index: number, group: FeatureGroup): string { return group.featureId; }
  trackByStoryId(_index: number, story: SafeSprintStory): string { return story.id; }
  prioCssClass(priority: string): string { return 'prio-' + priority.toLowerCase().replace(/'/g, ''); }

  private selectSprint(sprintId: string): void {
    this.selectedSprintId = sprintId;
    this.selectedSprint = this.tracker?.sprints.find(s => s.id === sprintId) ?? null;
    this.buildFeatureGroups();
    this.recomputeKpis();
  }

  private buildFeatureGroups(): void {
    if (!this.selectedSprint) {
      this.featureGroups = [];
      return;
    }

    const groups = new Map<string, SafeSprintStory[]>();
    for (const story of this.selectedSprint.stories) {
      const existing = groups.get(story.featureId);
      if (existing) {
        existing.push(story);
      } else {
        groups.set(story.featureId, [story]);
      }
    }

    this.featureGroups = Array.from(groups.entries()).map(([featureId, stories]) => ({
      featureId,
      stories,
      totalSp: stories.reduce((sum, s) => sum + s.storyPoints, 0),
      doneSp: stories.filter(s => s.status === 'done').reduce((sum, s) => sum + s.storyPoints, 0),
    }));
  }

  private recomputeKpis(): void {
    if (!this.selectedSprint) {
      this.completionPercent = 0;
      this.wipPercent = 0;
      this.storiesRemaining = 0;
      this.doneCount = 0;
      this.wipCount = 0;
      this.todoCount = 0;
      this.removedCount = 0;
      return;
    }

    const stories = this.selectedSprint.stories;
    const activeStories = stories.filter(s => s.status !== 'removed');
    const totalSp = activeStories.reduce((sum, s) => sum + s.storyPoints, 0);

    this.doneCount = stories.filter(s => s.status === 'done').length;
    this.wipCount = stories.filter(s => s.status === 'in-progress').length;
    this.todoCount = stories.filter(s => s.status === 'todo').length;
    this.removedCount = stories.filter(s => s.status === 'removed').length;

    const doneSp = stories.filter(s => s.status === 'done').reduce((sum, s) => sum + s.storyPoints, 0);
    const wipSp = stories.filter(s => s.status === 'in-progress').reduce((sum, s) => sum + s.storyPoints, 0);

    this.completionPercent = totalSp > 0 ? Math.round((doneSp / totalSp) * 100) : 0;
    this.wipPercent = totalSp > 0 ? Math.round((wipSp / totalSp) * 100) : 0;
    this.storiesRemaining = this.todoCount + this.wipCount;

    // Also update feature groups doneSp
    for (const fg of this.featureGroups) {
      fg.doneSp = fg.stories.filter(s => s.status === 'done').reduce((sum, s) => sum + s.storyPoints, 0);
    }
  }
}
