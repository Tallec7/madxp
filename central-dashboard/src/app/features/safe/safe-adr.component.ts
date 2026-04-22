/**
 * SAFe ADR Viewer
 *
 * Liste et consultation des Architecture Decision Records depuis docs/adr/.
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
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SafeService, SafeAdrSummary, SafeAdrWithContent } from '../../core/services/safe.service';
import { renderMarkdown, MARKDOWN_STYLES } from './markdown.utils';

type AdrStatus = 'Accepté' | 'Proposé' | 'Déprécié' | 'Supersédé' | 'Suspendu' | 'Partiel' | '';

const STATUS_ORDER: Record<string, number> = {
  'Accepté': 0,
  'Proposé': 1,
  'Suspendu': 2,
  'Partiel': 3,
  'Déprécié': 4,
  'Supersédé': 5,
};

@Component({
  selector: 'app-safe-adr',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="safe-adr">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>Architecture Decision Records</h1>
          <span class="adr-count" *ngIf="!loading">{{ filtered.length }} / {{ adrs.length }} ADRs</span>
        </div>
        <div class="header-actions">
          <a routerLink="/safe" class="btn btn-secondary">Portfolio</a>
          <a routerLink="/safe/proposals" class="btn btn-secondary">Proposals</a>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <input
          class="search-input"
          type="text"
          [placeholder]="'safe.adr.searchPlaceholder' | translate"
          [(ngModel)]="searchQuery"
          (ngModelChange)="applyFilters()"
        />
        <div class="status-filters">
          <button
            *ngFor="let s of statusOptions"
            class="filter-btn"
            [class.active]="selectedStatus === s"
            (click)="selectStatus(s)"
          >
            <span class="status-dot" [class]="'dot-' + statusClass(s)"></span>
            {{ s || ('safe.adr.all' | translate) }}
          </button>
        </div>
      </div>

      <!-- Skeleton -->
      <div *ngIf="loading" class="skeleton-list">
        <div class="skeleton-row" *ngFor="let i of [1,2,3,4,5,6,7,8]"></div>
      </div>

      <!-- Error -->
      <div *ngIf="error && !loading" class="error-banner">
        {{ 'safe.adr.loadError' | translate }} : {{ error }}
      </div>

      <!-- List + Detail panel -->
      <div *ngIf="!loading && !error" class="adr-layout">

        <!-- ADR list -->
        <div class="adr-list">
          <div
            *ngFor="let adr of filtered; trackBy: trackById"
            class="adr-row"
            [class.selected]="selectedAdr?.id === adr.id"
            (click)="selectAdr(adr)"
          >
            <div class="adr-row-left">
              <span class="adr-id">{{ adr.id }}</span>
              <span class="adr-title">{{ adr.title }}</span>
            </div>
            <div class="adr-row-right">
              <span class="adr-date">{{ adr.date }}</span>
              <span class="status-badge" [class]="'badge-' + statusClass(adr.status)">
                {{ adr.status || '—' }}
              </span>
            </div>
          </div>
          <div *ngIf="filtered.length === 0" class="empty-state">
            {{ 'safe.adr.empty' | translate }}
          </div>
        </div>

        <!-- Detail panel -->
        <div class="adr-detail" *ngIf="selectedAdr">
          <div class="detail-header">
            <div class="detail-meta">
              <span class="adr-id-large">{{ selectedAdr.id }}</span>
              <span class="status-badge" [class]="'badge-' + statusClass(selectedAdr.status)">{{ selectedAdr.status || '—' }}</span>
              <span class="detail-date" *ngIf="selectedAdr.date">{{ selectedAdr.date }}</span>
              <span class="detail-format" *ngIf="selectedAdr.format">{{ selectedAdr.format }}</span>
            </div>
            <button class="btn-close" (click)="closeDetail()" title="Fermer">✕</button>
          </div>
          <h2 class="detail-title">{{ selectedAdr.title }}</h2>

          <div *ngIf="loadingContent" class="content-loading">{{ 'safe.adr.loading' | translate }}</div>
          <div *ngIf="!loadingContent && contentAdr" class="markdown-content" [innerHTML]="renderedContent"></div>
        </div>

        <!-- Placeholder when nothing selected -->
        <div class="adr-detail adr-detail--empty" *ngIf="!selectedAdr && !loading">
          <div class="empty-hint">{{ 'safe.adr.selectHint' | translate }}</div>
        </div>

      </div>

    </div>
  `,
  styles: [`
    .safe-adr { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

    .page-header { display: flex; justify-content: space-between; align-items: center; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left h1 { margin: 0; font-size: 1.6rem; font-weight: 700; }
    .adr-count { background: var(--color-surface-2, #f0f0f0); padding: 2px 10px; border-radius: 12px; font-size: 0.85rem; color: var(--color-text-secondary, #666); }
    .header-actions { display: flex; gap: 8px; }

    .filters-bar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 200px; max-width: 360px; padding: 8px 12px; border: 1px solid var(--color-border, #ddd); border-radius: 6px; font-size: 0.9rem; }
    .status-filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border: 1px solid var(--color-border, #ddd); border-radius: 20px; background: transparent; cursor: pointer; font-size: 0.82rem; transition: all 0.15s; }
    .filter-btn.active { background: var(--color-primary, #4f46e5); color: white; border-color: var(--color-primary, #4f46e5); }
    .filter-btn:hover:not(.active) { background: var(--color-surface-2, #f5f5f5); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

    .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
    .skeleton-row { height: 44px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 6px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .error-banner { padding: 12px 16px; background: #fef2f2; color: #dc2626; border-radius: 6px; border: 1px solid #fecaca; }

    .adr-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-height: 500px; }
    @media (max-width: 900px) { .adr-layout { grid-template-columns: 1fr; } }

    .adr-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 70vh; }
    .adr-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 6px; border: 1px solid var(--color-border, #e5e7eb); cursor: pointer; transition: all 0.12s; gap: 12px; }
    .adr-row:hover { background: var(--color-surface-2, #f9fafb); }
    .adr-row.selected { background: var(--color-primary-light, #eef2ff); border-color: var(--color-primary, #4f46e5); }
    .adr-row-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .adr-id { font-family: monospace; font-size: 0.78rem; color: var(--color-text-secondary, #888); white-space: nowrap; }
    .adr-title { font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .adr-row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .adr-date { font-size: 0.75rem; color: var(--color-text-secondary, #999); white-space: nowrap; }
    .empty-state { padding: 24px; text-align: center; color: var(--color-text-secondary, #999); font-size: 0.9rem; }

    .adr-detail { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 70vh; }
    .adr-detail--empty { justify-content: center; align-items: center; }
    .empty-hint { color: var(--color-text-secondary, #999); font-size: 0.9rem; }
    .detail-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .adr-id-large { font-family: monospace; font-size: 0.9rem; font-weight: 600; color: var(--color-text-secondary, #666); }
    .detail-date { font-size: 0.8rem; color: var(--color-text-secondary, #999); }
    .detail-format { font-size: 0.75rem; padding: 1px 8px; background: var(--color-surface-2, #f5f5f5); border-radius: 10px; color: var(--color-text-secondary, #888); }
    .detail-title { margin: 0; font-size: 1.1rem; font-weight: 600; line-height: 1.4; }
    .btn-close { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--color-text-secondary, #999); padding: 4px 8px; border-radius: 4px; }
    .btn-close:hover { background: var(--color-surface-2, #f5f5f5); }
    .content-loading { padding: 24px; text-align: center; color: var(--color-text-secondary, #999); }
    ${MARKDOWN_STYLES}

    /* Status badges */
    .status-badge { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .badge-accepted { background: #dcfce7; color: #166534; }
    .badge-proposed { background: #dbeafe; color: #1e40af; }
    .badge-deprecated { background: #f3f4f6; color: #6b7280; }
    .badge-superseded { background: #fef9c3; color: #854d0e; }
    .badge-suspended { background: #ffedd5; color: #9a3412; }
    .badge-partial { background: #fae8ff; color: #7e22ce; }
    .badge-unknown { background: #f3f4f6; color: #6b7280; }

    .dot-accepted { background: #16a34a; }
    .dot-proposed { background: #2563eb; }
    .dot-deprecated { background: #9ca3af; }
    .dot-superseded { background: #ca8a04; }
    .dot-suspended { background: #ea580c; }
    .dot-partial { background: #9333ea; }
    .dot-unknown { background: #9ca3af; }

    .btn { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--color-border, #ddd); cursor: pointer; font-size: 0.85rem; text-decoration: none; display: inline-flex; align-items: center; }
    .btn-secondary { background: var(--color-surface, #fff); color: var(--color-text, #333); }
    .btn-secondary:hover { background: var(--color-surface-2, #f5f5f5); }
  `],
})
export class SafeAdrComponent implements OnInit, OnDestroy {
  private readonly safe = inject(SafeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy$ = new Subject<void>();

  adrs: SafeAdrSummary[] = [];
  filtered: SafeAdrSummary[] = [];
  selectedAdr: SafeAdrSummary | null = null;
  contentAdr: SafeAdrWithContent | null = null;
  renderedContent: SafeHtml = '';
  loading = true;
  loadingContent = false;
  error = '';
  searchQuery = '';
  selectedStatus = '';

  readonly statusOptions = ['', 'Accepté', 'Proposé', 'Suspendu', 'Partiel', 'Déprécié', 'Supersédé'];

  ngOnInit(): void {
    this.safe.getAdrs().pipe(takeUntil(this.destroy$)).subscribe({
      next: adrs => {
        this.adrs = adrs.sort((a, b) => b.number - a.number);
        this.applyFilters();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = err?.message ?? 'Erreur inconnue';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filtered = this.adrs.filter(adr => {
      const matchSearch = !q || adr.title.toLowerCase().includes(q) || adr.id.toLowerCase().includes(q);
      const matchStatus = !this.selectedStatus || this.normalizeStatus(adr.status) === this.selectedStatus;
      return matchSearch && matchStatus;
    });
  }

  selectStatus(status: string): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  selectAdr(adr: SafeAdrSummary): void {
    if (this.selectedAdr?.id === adr.id) {
      this.closeDetail();
      return;
    }
    this.selectedAdr = adr;
    this.contentAdr = null;
    this.loadingContent = true;
    this.cdr.markForCheck();

    this.safe.getAdr(adr.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: full => {
        this.contentAdr = full;
        this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(full.content));
        this.loadingContent = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingContent = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeDetail(): void {
    this.selectedAdr = null;
    this.contentAdr = null;
    this.renderedContent = '';
    this.cdr.markForCheck();
  }

  statusClass(status: string): string {
    switch (this.normalizeStatus(status)) {
      case 'Accepté': return 'accepted';
      case 'Proposé': return 'proposed';
      case 'Déprécié': return 'deprecated';
      case 'Supersédé': return 'superseded';
      case 'Suspendu': return 'suspended';
      case 'Partiel': return 'partial';
      default: return 'unknown';
    }
  }

  trackById(_: number, adr: SafeAdrSummary): string {
    return adr.id;
  }

  private normalizeStatus(status: string): string {
    if (!status) return '';
    const s = status.split(' ')[0]; // handle "Phase 1 ✅" etc.
    if (s.includes('Accepté') || s === 'Accepted') return 'Accepté';
    if (s.includes('Proposé') || s === 'Proposed') return 'Proposé';
    if (s.includes('Déprécié') || s === 'Deprecated') return 'Déprécié';
    if (s.includes('Supersédé') || s === 'Superseded') return 'Supersédé';
    if (s.includes('Suspendu') || s === 'Suspended') return 'Suspendu';
    if (s.includes('Partiel') || s === 'Partial') return 'Partiel';
    return status;
  }
}
