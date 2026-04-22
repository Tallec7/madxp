/**
 * SAFe ADR Viewer
 *
 * Liste et consultation des Architecture Decision Records depuis docs/adr/.
 * URL : /safe/adr?id=ADR-083 — partage direct d'un ADR.
 * Clavier : / = focus search, Esc = fermer, ←/→ = prev/next.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  ViewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, skip } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SafeService, SafeAdrSummary, SafeAdrWithContent } from '../../core/services/safe.service';
import { renderMarkdown } from './markdown.utils';
import { SafeAdrDetailComponent } from './safe-adr-detail.component';

type AdrStatus = '' | 'Accepté' | 'Proposé' | 'Déprécié' | 'Supersédé' | 'Suspendu' | 'Partiel';

@Component({
  selector: 'app-safe-adr',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule, SafeAdrDetailComponent],
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
          #searchInput
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
            {{ s || 'Tous' }}
          </button>
        </div>
      </div>

      <!-- Skeleton -->
      <div *ngIf="loading" class="skeleton-list">
        <div class="skeleton-row" *ngFor="let i of [1,2,3,4,5,6]"></div>
      </div>

      <!-- Error -->
      <div *ngIf="error && !loading" class="error-banner">{{ error }}</div>

      <!-- List + Detail -->
      <div *ngIf="!loading && !error" class="adr-layout">

        <!-- List -->
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
              <span class="status-badge" [class]="'badge-' + statusClass(adr.status)">{{ adr.status || '—' }}</span>
            </div>
          </div>
          <div *ngIf="filtered.length === 0" class="empty-state">Aucun ADR ne correspond à ce filtre.</div>
        </div>

        <!-- Detail -->
        <app-safe-adr-detail
          [adr]="selectedAdr"
          [content]="contentAdr"
          [loadingContent]="loadingContent"
          [renderedContent]="renderedContent"
          [hasPrev]="selectedIndex > 0"
          [hasNext]="selectedIndex < filtered.length - 1"
          (closed)="closeDetail()"
          (prev)="navigate(-1)"
          (next)="navigate(1)"
        ></app-safe-adr-detail>

      </div>
    </div>
  `,
  styles: [`
    .safe-adr { padding: 24px; display: flex; flex-direction: column; gap: 20px; height: 100%; box-sizing: border-box; }

    .page-header { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
    .adr-count { background: var(--color-surface-2, #f0f0f0); padding: 2px 10px; border-radius: 12px; font-size: 0.82rem; color: var(--color-text-secondary, #666); }
    .header-actions { display: flex; gap: 8px; }

    .filters-bar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
    .search-input { flex: 1; min-width: 200px; max-width: 380px; padding: 8px 12px; border: 1px solid var(--color-border, #ddd); border-radius: 6px; font-size: 0.88rem; }
    .search-input:focus { outline: none; border-color: var(--color-primary, #4f46e5); box-shadow: 0 0 0 2px rgba(79,70,229,0.1); }
    .status-filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border: 1px solid var(--color-border, #ddd); border-radius: 20px; background: transparent; cursor: pointer; font-size: 0.8rem; transition: all 0.15s; }
    .filter-btn.active { background: var(--color-primary, #4f46e5); color: white; border-color: var(--color-primary, #4f46e5); }
    .filter-btn:hover:not(.active) { background: var(--color-surface-2, #f5f5f5); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

    .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
    .skeleton-row { height: 44px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 6px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .error-banner { padding: 12px 16px; background: #fef2f2; color: #dc2626; border-radius: 6px; border: 1px solid #fecaca; }

    .adr-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1; min-height: 0; }
    @media (max-width: 900px) { .adr-layout { grid-template-columns: 1fr; } }

    .adr-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
    .adr-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 13px; border-radius: 6px; border: 1px solid var(--color-border, #e5e7eb); cursor: pointer; transition: all 0.12s; gap: 12px; }
    .adr-row:hover { background: var(--color-surface-2, #f9fafb); }
    .adr-row.selected { background: var(--color-primary-light, #eef2ff); border-color: var(--color-primary, #4f46e5); }
    .adr-row-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .adr-id { font-family: monospace; font-size: 0.75rem; color: var(--color-text-secondary, #888); white-space: nowrap; }
    .adr-title { font-size: 0.86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .adr-row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .adr-date { font-size: 0.72rem; color: var(--color-text-secondary, #999); white-space: nowrap; }
    .empty-state { padding: 24px; text-align: center; color: var(--color-text-secondary, #999); font-size: 0.9rem; }

    /* Status badges */
    .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  adrs: SafeAdrSummary[] = [];
  filtered: SafeAdrSummary[] = [];
  selectedAdr: SafeAdrSummary | null = null;
  contentAdr: SafeAdrWithContent | null = null;
  renderedContent: SafeHtml = '';
  loading = true;
  loadingContent = false;
  error = '';
  searchQuery = '';
  selectedStatus: AdrStatus = '';

  readonly statusOptions: AdrStatus[] = ['', 'Accepté', 'Proposé', 'Suspendu', 'Partiel', 'Déprécié', 'Supersédé'];

  get selectedIndex(): number {
    return this.selectedAdr ? this.filtered.findIndex(a => a.id === this.selectedAdr!.id) : -1;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === '/') {
      e.preventDefault();
      this.searchInput?.nativeElement.focus();
    } else if (e.key === 'Escape') {
      if (this.selectedAdr) { e.preventDefault(); this.closeDetail(); }
    } else if (e.key === 'ArrowLeft' && this.selectedAdr) {
      e.preventDefault(); this.navigate(-1);
    } else if (e.key === 'ArrowRight' && this.selectedAdr) {
      e.preventDefault(); this.navigate(1);
    }
  }

  ngOnInit(): void {
    this.safe.getAdrs().pipe(takeUntil(this.destroy$)).subscribe({
      next: adrs => {
        this.adrs = adrs.sort((a, b) => b.number - a.number);
        this.applyFilters();
        this.loading = false;
        const id = this.route.snapshot.queryParamMap.get('id');
        if (id) {
          const found = this.adrs.find(a => a.id === id);
          if (found) this.doSelect(found, false);
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = err?.message ?? 'Erreur de chargement';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    // Handle in-app navigation (clicking ADR cross-refs updates queryParam)
    this.route.queryParams.pipe(skip(1), takeUntil(this.destroy$)).subscribe(params => {
      const id = params['id'];
      if (id && id !== this.selectedAdr?.id) {
        const found = this.adrs.find(a => a.id === id);
        if (found) this.doSelect(found, false);
      } else if (!id && this.selectedAdr) {
        this.doCloseDetail();
      }
      this.cdr.markForCheck();
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

  selectStatus(status: AdrStatus): void {
    this.selectedStatus = status;
    this.applyFilters();
  }

  selectAdr(adr: SafeAdrSummary): void {
    if (this.selectedAdr?.id === adr.id) { this.closeDetail(); return; }
    this.doSelect(adr, true);
  }

  navigate(delta: -1 | 1): void {
    const idx = this.selectedIndex + delta;
    if (idx >= 0 && idx < this.filtered.length) this.doSelect(this.filtered[idx], true);
  }

  closeDetail(): void {
    this.doCloseDetail();
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  trackById(_: number, adr: SafeAdrSummary): string { return adr.id; }

  statusClass(status: string): string {
    const s = (status ?? '').split(' ')[0];
    if (s.includes('Accepté')) return 'accepted';
    if (s.includes('Proposé')) return 'proposed';
    if (s.includes('Déprécié')) return 'deprecated';
    if (s.includes('Supersédé')) return 'superseded';
    if (s.includes('Suspendu')) return 'suspended';
    if (s.includes('Partiel') || s.includes('Phase')) return 'partial';
    return 'unknown';
  }

  private normalizeStatus(status: string): AdrStatus {
    const s = (status ?? '').split(' ')[0];
    if (s.includes('Accepté')) return 'Accepté';
    if (s.includes('Proposé')) return 'Proposé';
    if (s.includes('Déprécié')) return 'Déprécié';
    if (s.includes('Supersédé')) return 'Supersédé';
    if (s.includes('Suspendu')) return 'Suspendu';
    if (s.includes('Partiel') || s.includes('Phase')) return 'Partiel';
    return '';
  }

  private doSelect(adr: SafeAdrSummary, updateUrl: boolean): void {
    this.selectedAdr = adr;
    this.contentAdr = null;
    this.loadingContent = true;
    this.cdr.markForCheck();

    if (updateUrl) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { id: adr.id }, replaceUrl: true });
    }

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

  private doCloseDetail(): void {
    this.selectedAdr = null;
    this.contentAdr = null;
    this.renderedContent = '';
  }
}
