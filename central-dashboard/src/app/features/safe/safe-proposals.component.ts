/**
 * SAFe Proposals Kanban
 *
 * Kanban board avec drag & drop pour les proposals, spikes et specs.
 * Filtrage par type et epic lié. Vue Kanban ou Liste.
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
import { CdkDragDrop, DragDropModule, transferArrayItem, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';
import {
  SafeService,
  SafeProposalSummary,
  ProposalStatus,
  ProposalType,
} from '../../core/services/safe.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

interface ProposalColumn {
  id: ProposalStatus;
  labelKey: string;
  items: SafeProposalSummary[];
}

@Component({
  selector: 'app-safe-proposals',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="safe-proposals" *ngIf="loaded; else skeleton">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/safe" class="back-link">&larr;</a>
          <h1>{{ 'safe.proposals.title' | translate }}</h1>
          <span class="count-badge">{{ proposals.length }}</span>
        </div>
        <div class="header-actions">
          <button class="btn-create" (click)="showCreateModal = true">+ {{ 'safe.proposals.newProposal' | translate }}</button>
          <div class="view-toggle">
            <button [class.active]="view === 'kanban'" (click)="view = 'kanban'">Kanban</button>
            <button [class.active]="view === 'list'" (click)="view = 'list'">{{ 'safe.proposals.listView' | translate }}</button>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <select [(ngModel)]="filterType" (ngModelChange)="applyFilters()">
          <option value="">{{ 'safe.proposals.allTypes' | translate }}</option>
          <option value="prop">PROP</option>
          <option value="spike">SPIKE</option>
          <option value="spec">SPEC</option>
        </select>
        <input
          type="text"
          [(ngModel)]="searchQuery"
          (ngModelChange)="applyFilters()"
          [placeholder]="'common.searchPlaceholder' | translate"
          class="search-input"
        />
      </div>

      <!-- Kanban View -->
      <div class="kanban-board" *ngIf="view === 'kanban'" cdkDropListGroup>
        <div
          class="kanban-column"
          *ngFor="let col of columns; trackBy: trackByColumnId"
          cdkDropList
          [cdkDropListData]="col.items"
          [id]="'prop-' + col.id"
          [cdkDropListConnectedTo]="getConnectedLists(col.id)"
          (cdkDropListDropped)="onProposalDrop($event)"
        >
          <div class="kanban-column-header">
            <span class="column-title">{{ col.labelKey | translate }}</span>
            <span class="column-count">{{ col.items.length }}</span>
          </div>
          <div
            class="proposal-card"
            *ngFor="let p of col.items; trackBy: trackById"
            cdkDrag
            [routerLink]="['/safe/proposals', p.id]"
            [class]="'type-' + p.type"
          >
            <div class="card-top">
              <span class="card-id">{{ p.id }}</span>
              <span class="card-type" [class]="p.type">{{ p.type | uppercase }}</span>
            </div>
            <div class="card-title">{{ p.title }}</div>
            <div class="card-meta">
              <span *ngIf="p.relatedEpic" class="card-epic">{{ p.relatedEpic }}</span>
              <span class="card-date">{{ p.date }}</span>
            </div>
          </div>
          <div class="kanban-empty" *ngIf="col.items.length === 0">
            {{ 'safe.proposals.empty' | translate }}
          </div>
        </div>
      </div>

      <!-- List View -->
      <div class="list-view" *ngIf="view === 'list'">
        <table>
          <thead>
            <tr>
              <th (click)="sortBy('id')" class="sortable-th">
                ID <span class="sort-indicator">{{ getSortIndicator('id') }}</span>
              </th>
              <th (click)="sortBy('title')" class="sortable-th">
                {{ 'safe.proposals.titleLabel' | translate }}
                <span class="sort-indicator">{{ getSortIndicator('title') }}</span>
              </th>
              <th (click)="sortBy('type')" class="sortable-th">
                Type <span class="sort-indicator">{{ getSortIndicator('type') }}</span>
              </th>
              <th>Epic</th>
              <th (click)="sortBy('status')" class="sortable-th">
                {{ 'safe.proposals.status' | translate }}
                <span class="sort-indicator">{{ getSortIndicator('status') }}</span>
              </th>
              <th (click)="sortBy('date')" class="sortable-th">
                Date <span class="sort-indicator">{{ getSortIndicator('date') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let p of sortedProposals; trackBy: trackById"
              [routerLink]="['/safe/proposals', p.id]"
              class="clickable-row"
            >
              <td class="id-cell">{{ p.id }}</td>
              <td>{{ p.title }}</td>
              <td><span class="type-badge" [class]="p.type">{{ p.type | uppercase }}</span></td>
              <td>{{ p.relatedEpic || '—' }}</td>
              <td>
                <span class="status-badge" [class]="p.status">
                  {{ 'safe.proposalStatus.' + p.status | translate }}
                </span>
              </td>
              <td class="date-cell">{{ p.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- Create Proposal Modal -->
    <div class="modal-overlay" *ngIf="showCreateModal" (click)="showCreateModal = false">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <h2>{{ 'safe.proposals.newProposal' | translate }}</h2>
        <div class="form-group">
          <label>{{ 'safe.proposals.formTitle' | translate }}</label>
          <input type="text" [(ngModel)]="newProposal.title" class="form-input" />
        </div>
        <div class="form-group">
          <label>Type</label>
          <select [(ngModel)]="newProposal.type" class="form-input">
            <option value="prop">PROP</option>
            <option value="spike">SPIKE</option>
            <option value="spec">SPEC</option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ 'safe.proposals.relatedEpic' | translate }}</label>
          <input type="text" [(ngModel)]="newProposal.relatedEpic" class="form-input" placeholder="E-01" />
        </div>
        <div class="form-group">
          <label>{{ 'safe.proposals.formContent' | translate }}</label>
          <textarea [(ngModel)]="newProposal.content" class="form-textarea" rows="8"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" (click)="showCreateModal = false">{{ 'common.cancel' | translate }}</button>
          <button class="btn-submit" (click)="createProposal()" [disabled]="!newProposal.title.trim()">{{ 'common.create' | translate }}</button>
        </div>
      </div>
    </div>

    <!-- Skeleton Loading -->
    <ng-template #skeleton>
      <div class="safe-proposals skeleton-container">
        <div class="page-header">
          <div class="header-left">
            <div class="skel skel-back"></div>
            <div class="skel skel-title"></div>
            <div class="skel skel-badge"></div>
          </div>
          <div class="skel skel-toggle"></div>
        </div>
        <div class="filters-bar">
          <div class="skel skel-select"></div>
          <div class="skel skel-search"></div>
        </div>
        <div class="kanban-board">
          <div class="kanban-column" *ngFor="let i of [1,2,3,4,5]">
            <div class="skel skel-col-header"></div>
            <div class="skel skel-card" *ngFor="let j of [1,2,3]"></div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }

    .safe-proposals { padding: 24px; max-width: 1400px; margin: 0 auto; }

    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left h1 { margin: 0; font-size: 24px; color: var(--neo-text, #fff); }
    .back-link {
      color: var(--neo-text-secondary, #999); text-decoration: none; font-size: 20px;
      padding: 4px 8px; border-radius: 6px;
    }
    .back-link:hover { background: var(--neo-hover, #2a2a3e); }
    .count-badge {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text-secondary, #999);
      padding: 2px 10px; border-radius: 10px; font-size: 13px;
    }

    .view-toggle {
      display: flex; border: 1px solid var(--neo-border, #333); border-radius: 8px; overflow: hidden;
    }
    .view-toggle button {
      padding: 6px 16px; border: none; background: transparent;
      color: var(--neo-text-secondary, #999); cursor: pointer; font-size: 13px;
    }
    .view-toggle button.active {
      background: var(--neo-primary, #4f8cff); color: #fff;
    }

    /* Filters */
    .filters-bar {
      display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .filters-bar select, .search-input {
      padding: 8px 12px; border-radius: 8px; font-size: 13px;
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333);
    }
    .search-input { flex: 1; min-width: 200px; }

    /* Kanban Board */
    .kanban-board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
    .kanban-column {
      min-width: 220px; flex: 1;
      background: var(--neo-bg, #121220); border-radius: 8px;
      padding: 12px; min-height: 300px;
    }
    .kanban-column-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; padding-bottom: 8px;
      border-bottom: 2px solid var(--neo-border, #333);
    }
    .column-title { font-size: 13px; font-weight: 600; color: var(--neo-text, #fff); text-transform: uppercase; }
    .column-count {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text-secondary, #999);
      padding: 2px 8px; border-radius: 10px; font-size: 11px;
    }

    .proposal-card {
      background: var(--neo-surface, #1e1e2e); border-radius: 8px;
      padding: 12px; margin-bottom: 8px; cursor: grab;
      border-left: 3px solid var(--neo-border, #333);
      transition: box-shadow 0.2s; text-decoration: none; display: block; color: inherit;
    }
    .proposal-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .proposal-card.cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    .proposal-card.type-prop { border-left-color: #4f8cff; }
    .proposal-card.type-spike { border-left-color: #ff9800; }
    .proposal-card.type-spec { border-left-color: #66bb6a; }

    .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .card-id { font-size: 11px; font-weight: 600; color: var(--neo-primary, #4f8cff); }
    .card-type {
      font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px;
    }
    .card-type.prop { background: #1a3a6b; color: #90caf9; }
    .card-type.spike { background: #5d3a00; color: #ffcc80; }
    .card-type.spec { background: #1b5e20; color: #a5d6a7; }
    .card-title { font-size: 13px; color: var(--neo-text, #fff); line-height: 1.3; }
    .card-meta { display: flex; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--neo-text-secondary, #999); }
    .card-epic { font-weight: 600; }

    .kanban-empty {
      text-align: center; padding: 24px 12px; color: var(--neo-text-muted, #555);
      font-size: 12px; font-style: italic;
    }

    .cdk-drag-placeholder {
      background: var(--neo-bg, #121220); border: 2px dashed var(--neo-border, #444);
      border-radius: 8px; min-height: 60px; margin-bottom: 8px;
    }

    /* List View */
    .list-view { overflow-x: auto; }
    .list-view table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .list-view th {
      text-align: left; padding: 10px 12px; color: var(--neo-text-secondary, #999);
      border-bottom: 1px solid var(--neo-border, #333); font-weight: 600;
    }
    .sortable-th { cursor: pointer; user-select: none; }
    .sortable-th:hover { color: var(--neo-text, #fff); }
    .sort-indicator { font-size: 11px; margin-left: 4px; }
    .list-view td {
      padding: 10px 12px; color: var(--neo-text, #fff);
      border-bottom: 1px solid var(--neo-border, #222);
    }
    .clickable-row { cursor: pointer; }
    .clickable-row:hover td { background: var(--neo-hover, #1a1a2e); }
    .id-cell { font-weight: 600; color: var(--neo-primary, #4f8cff); white-space: nowrap; }
    .date-cell { white-space: nowrap; color: var(--neo-text-secondary, #999); }

    .type-badge {
      padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
    }
    .type-badge.prop { background: #1a3a6b; color: #90caf9; }
    .type-badge.spike { background: #5d3a00; color: #ffcc80; }
    .type-badge.spec { background: #1b5e20; color: #a5d6a7; }

    .status-badge {
      padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
    }
    .status-badge.draft { background: #333; color: #999; }
    .status-badge.in-review { background: #4a148c; color: #ce93d8; }
    .status-badge.approved { background: #1b5e20; color: #a5d6a7; }
    .status-badge.implementing { background: #0d47a1; color: #90caf9; }
    .status-badge.done { background: #2e7d32; color: #c8e6c9; }

    /* Skeleton */
    .skeleton-container .skel {
      background: var(--neo-surface, #1e1e2e); border-radius: 8px;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .skel-back { width: 30px; height: 30px; border-radius: 6px; }
    .skel-title { width: 180px; height: 28px; }
    .skel-badge { width: 36px; height: 22px; border-radius: 10px; }
    .skel-toggle { width: 160px; height: 34px; }
    .skel-select { width: 140px; height: 36px; }
    .skel-search { flex: 1; min-width: 200px; height: 36px; }
    .skel-col-header { height: 20px; margin-bottom: 12px; }
    .skel-card { height: 72px; margin-bottom: 8px; }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.7; }
    }

    .header-actions { display: flex; align-items: center; gap: 12px; }
    .btn-create {
      padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
      background: var(--neo-primary, #4f8cff); color: #fff; font-weight: 600; font-size: 13px;
    }
    .btn-create:hover { opacity: 0.9; }

    /* Create Modal */
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px; padding: 24px;
      width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;
      border: 1px solid var(--neo-border, #333);
    }
    .modal-content h2 { margin: 0 0 20px; color: var(--neo-text, #fff); font-size: 18px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 4px; font-size: 13px; color: var(--neo-text-secondary, #999); }
    .form-input {
      width: 100%; padding: 8px 12px; border-radius: 6px;
      background: var(--neo-bg, #121220); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333); font-size: 14px;
      box-sizing: border-box;
    }
    .form-input:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }
    .form-textarea {
      width: 100%; padding: 8px 12px; border-radius: 6px;
      background: var(--neo-bg, #121220); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333); font-size: 14px;
      resize: vertical; font-family: monospace; box-sizing: border-box;
    }
    .form-textarea:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
    .btn-cancel {
      padding: 8px 16px; border: 1px solid var(--neo-border, #333); border-radius: 8px;
      background: transparent; color: var(--neo-text-secondary, #999); cursor: pointer;
    }
    .btn-submit {
      padding: 8px 20px; border: none; border-radius: 8px; cursor: pointer;
      background: var(--neo-primary, #4f8cff); color: #fff; font-weight: 600;
    }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 768px) {
      .safe-proposals { padding: 16px; }
      .kanban-board { flex-direction: column; }
      .kanban-column { min-width: unset; }
    }
  `]
})
export class SafeProposalsComponent implements OnInit, OnDestroy {
  private readonly safeService = inject(SafeService);
  private readonly notif = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  proposals: SafeProposalSummary[] = [];
  filteredProposals: SafeProposalSummary[] = [];
  sortedProposals: SafeProposalSummary[] = [];
  columns: ProposalColumn[] = [];
  loaded = false;
  view: 'kanban' | 'list' = 'kanban';

  filterType = '';
  searchQuery = '';
  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  showCreateModal = false;
  newProposal = { title: '', type: 'prop' as ProposalType, relatedEpic: '', content: '' };

  private readonly columnDefs: { id: ProposalStatus; labelKey: string }[] = [
    { id: 'draft', labelKey: 'safe.proposalStatus.draft' },
    { id: 'in-review', labelKey: 'safe.proposalStatus.in-review' },
    { id: 'approved', labelKey: 'safe.proposalStatus.approved' },
    { id: 'implementing', labelKey: 'safe.proposalStatus.implementing' },
    { id: 'done', labelKey: 'safe.proposalStatus.done' },
  ];

  ngOnInit(): void {
    this.safeService.getProposals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.proposals = data;
          this.applyFilters();
          this.loaded = true;
          this.cdr.markForCheck();
        },
        error: () => {
          this.notif.error(this.translate.instant('safe.proposals.loadError'));
          this.loaded = true;
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackById(_index: number, item: SafeProposalSummary): string {
    return item.id;
  }

  trackByColumnId(_index: number, col: ProposalColumn): string {
    return col.id;
  }

  applyFilters(): void {
    let filtered = [...this.proposals];

    if (this.filterType) {
      filtered = filtered.filter(p => p.type === this.filterType);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.relatedEpic?.toLowerCase().includes(q) ?? false)
      );
    }

    this.filteredProposals = filtered;
    this.applySorting();
    this.buildColumns(filtered);
  }

  sortBy(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applySorting();
    this.cdr.markForCheck();
  }

  getSortIndicator(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  private applySorting(): void {
    if (!this.sortColumn) {
      this.sortedProposals = [...this.filteredProposals];
      return;
    }
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const col = this.sortColumn as keyof SafeProposalSummary;
    this.sortedProposals = [...this.filteredProposals].sort((a, b) => {
      const va = (a[col] ?? '') as string;
      const vb = (b[col] ?? '') as string;
      return va.localeCompare(vb) * dir;
    });
  }

  private buildColumns(proposals: SafeProposalSummary[]): void {
    this.columns = this.columnDefs.map(def => ({
      ...def,
      items: proposals.filter(p => p.status === def.id),
    }));
  }

  getConnectedLists(current: ProposalStatus): string[] {
    return this.columnDefs
      .filter(c => c.id !== current)
      .map(c => 'prop-' + c.id);
  }

  createProposal(): void {
    if (!this.newProposal.title.trim()) return;

    this.safeService.createProposal({
      title: this.newProposal.title.trim(),
      type: this.newProposal.type,
      relatedEpic: this.newProposal.relatedEpic.trim() || null,
      content: this.newProposal.content,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (created) => {
        this.proposals.push(created);
        this.applyFilters();
        this.buildColumns(this.filteredProposals);
        this.showCreateModal = false;
        this.newProposal = { title: '', type: 'prop', relatedEpic: '', content: '' };
        this.notif.success(this.translate.instant('safe.proposals.created'));
        this.cdr.markForCheck();
      },
      error: () => {
        this.notif.error(this.translate.instant('safe.proposals.createError'));
      }
    });
  }

  async onProposalDrop(event: CdkDragDrop<SafeProposalSummary[]>): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    const proposal = event.previousContainer.data[event.previousIndex];
    const newStatus = this.columnDefs.find(
      c => event.container.id === 'prop-' + c.id
    )?.id;

    if (!newStatus || !proposal) return;

    const statusLabel = this.translate.instant(`safe.proposalStatus.${newStatus}`);
    const confirmed = await this.confirmDialog.confirm(
      this.translate.instant('safe.proposals.confirmStatusChange', {
        id: proposal.id,
        status: statusLabel,
      })
    );
    if (!confirmed) return;

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );
    this.cdr.markForCheck();

    this.safeService.updateProposalStatus(proposal.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const src = this.proposals.find(p => p.id === proposal.id);
          if (src) src.status = newStatus;
          this.notif.success(this.translate.instant('safe.proposals.statusUpdated'));
          this.cdr.markForCheck();
        },
        error: () => {
          transferArrayItem(
            event.container.data,
            event.previousContainer.data,
            event.currentIndex,
            event.previousIndex
          );
          this.notif.error(this.translate.instant('safe.proposals.statusError'));
          this.cdr.markForCheck();
        }
      });
  }
}
