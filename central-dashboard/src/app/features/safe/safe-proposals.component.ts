/**
 * SAFe Proposals Kanban
 *
 * Kanban board avec drag & drop pour les proposals, spikes et specs.
 * Filtrage par type et epic lié. Vue Kanban ou Liste.
 */

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CdkDragDrop, DragDropModule, transferArrayItem, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  SafeService,
  SafeProposalSummary,
  ProposalStatus,
  ProposalType,
} from '../../core/services/safe.service';

interface ProposalColumn {
  id: ProposalStatus;
  label: string;
  items: SafeProposalSummary[];
}

@Component({
  selector: 'app-safe-proposals',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, DragDropModule],
  template: `
    <div class="safe-proposals" *ngIf="loaded; else loading">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/safe" class="back-link">&larr;</a>
          <h1>{{ 'safe.proposals.title' | translate }}</h1>
          <span class="count-badge">{{ proposals.length }}</span>
        </div>
        <div class="header-actions">
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
          *ngFor="let col of columns"
          cdkDropList
          [cdkDropListData]="col.items"
          [id]="'prop-' + col.id"
          [cdkDropListConnectedTo]="getConnectedLists(col.id)"
          (cdkDropListDropped)="onProposalDrop($event)"
        >
          <div class="kanban-column-header">
            <span class="column-title">{{ col.label }}</span>
            <span class="column-count">{{ col.items.length }}</span>
          </div>
          <div
            class="proposal-card"
            *ngFor="let p of col.items"
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
              <th>ID</th>
              <th>{{ 'safe.proposals.titleLabel' | translate }}</th>
              <th>Type</th>
              <th>Epic</th>
              <th>{{ 'safe.proposals.status' | translate }}</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let p of filteredProposals"
              [routerLink]="['/safe/proposals', p.id]"
              class="clickable-row"
            >
              <td class="id-cell">{{ p.id }}</td>
              <td>{{ p.title }}</td>
              <td><span class="type-badge" [class]="p.type">{{ p.type | uppercase }}</span></td>
              <td>{{ p.relatedEpic || '—' }}</td>
              <td><span class="status-badge" [class]="p.status">{{ p.status }}</span></td>
              <td class="date-cell">{{ p.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <ng-template #loading>
      <div class="loading-container">
        <div class="spinner"></div>
        <p>{{ 'common.loading' | translate }}</p>
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

    /* Loading */
    .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; }
    .spinner {
      width: 40px; height: 40px; border: 3px solid var(--neo-border, #333);
      border-top-color: var(--neo-primary, #4f8cff); border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .safe-proposals { padding: 16px; }
      .kanban-board { flex-direction: column; }
      .kanban-column { min-width: unset; }
    }
  `]
})
export class SafeProposalsComponent implements OnInit {
  private readonly safeService = inject(SafeService);

  proposals: SafeProposalSummary[] = [];
  filteredProposals: SafeProposalSummary[] = [];
  columns: ProposalColumn[] = [];
  loaded = false;
  view: 'kanban' | 'list' = 'kanban';

  filterType = '';
  searchQuery = '';

  private readonly columnDefs: { id: ProposalStatus; label: string }[] = [
    { id: 'draft', label: 'Draft' },
    { id: 'in-review', label: 'In Review' },
    { id: 'approved', label: 'Approved' },
    { id: 'implementing', label: 'Implementing' },
    { id: 'done', label: 'Done' },
  ];

  ngOnInit(): void {
    this.safeService.getProposals().subscribe({
      next: (data) => {
        this.proposals = data;
        this.applyFilters();
        this.loaded = true;
      },
      error: (err) => {
        console.error('Failed to load proposals', err);
        this.loaded = true;
      }
    });
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
    this.buildColumns(filtered);
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

  onProposalDrop(event: CdkDragDrop<SafeProposalSummary[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    const proposal = event.previousContainer.data[event.previousIndex];
    const newStatus = this.columnDefs.find(
      c => event.container.id === 'prop-' + c.id
    )?.id;

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );

    if (newStatus && proposal) {
      this.safeService.updateProposalStatus(proposal.id, newStatus).subscribe({
        next: () => {
          // Update source data
          const src = this.proposals.find(p => p.id === proposal.id);
          if (src) src.status = newStatus;
        },
        error: () => {
          // Revert on error
          transferArrayItem(
            event.container.data,
            event.previousContainer.data,
            event.currentIndex,
            event.previousIndex
          );
        }
      });
    }
  }
}
