import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SafeHtml } from '@angular/platform-browser';
import { SafeAdrSummary, SafeAdrWithContent } from '../../core/services/safe.service';
import { extractToc, parseAdrRefs, TocEntry, AdrRef, MARKDOWN_STYLES } from './markdown.utils';

@Component({
  selector: 'app-safe-adr-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Empty state -->
    <div class="detail-empty" *ngIf="!adr">
      <span class="empty-hint">Sélectionnez un ADR dans la liste pour voir son contenu</span>
    </div>

    <!-- Detail panel -->
    <div class="detail-panel" [class.is-fullscreen]="isFullscreen" *ngIf="adr">

      <!-- Header -->
      <div class="detail-header">
        <div class="detail-meta">
          <span class="adr-id-large">{{ adr.id }}</span>
          <span class="status-badge" [class]="'badge-' + statusClass(adr.status)">{{ adr.status || '—' }}</span>
          <span class="detail-date" *ngIf="adr.date">{{ adr.date }}</span>
          <span class="detail-format" *ngIf="adr.format">{{ adr.format }}</span>
        </div>
        <div class="detail-actions">
          <button class="icon-btn" (click)="prev.emit()" [disabled]="!hasPrev" title="ADR précédent (←)">◀</button>
          <button class="icon-btn" (click)="next.emit()" [disabled]="!hasNext" title="ADR suivant (→)">▶</button>
          <button class="icon-btn" (click)="toggleFullscreen()" [title]="isFullscreen ? 'Quitter plein écran (Esc)' : 'Plein écran'">
            {{ isFullscreen ? '⊠' : '⛶' }}
          </button>
          <button class="icon-btn close-btn" (click)="closed.emit()" title="Fermer (Esc)">✕</button>
        </div>
      </div>

      <h2 class="detail-title">{{ adr.title }}</h2>

      <!-- Cross-refs -->
      <div class="refs-row" *ngIf="refs.length > 0">
        <a *ngFor="let ref of refs"
           [href]="ref.external ? ref.href : null"
           [routerLink]="ref.external ? null : ref.routerPath ?? null"
           [queryParams]="ref.external ? null : (ref.queryParams ?? {})"
           [attr.target]="ref.external ? '_blank' : undefined"
           [attr.rel]="ref.external ? 'noopener' : undefined"
           class="ref-chip"
           [class]="'ref-chip ref-' + ref.type">
          {{ ref.label }}<span *ngIf="ref.external"> ↗</span>
        </a>
      </div>

      <!-- TOC -->
      <div class="toc-section" *ngIf="toc.length > 2">
        <button class="toc-toggle" (click)="tocVisible = !tocVisible">
          {{ tocVisible ? '▾' : '▸' }} Table des matières ({{ toc.length }})
        </button>
        <div class="toc-list" *ngIf="tocVisible">
          <button
            *ngFor="let entry of toc"
            class="toc-entry"
            [class]="'toc-h' + entry.level"
            (click)="scrollTo(entry.id)">
            {{ entry.text }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="content-body" #contentBody>
        <div *ngIf="loadingContent" class="content-loading">Chargement du contenu…</div>
        <div *ngIf="!loadingContent && content" class="markdown-content" [innerHTML]="renderedContent"></div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }

    .detail-empty { display: flex; align-items: center; justify-content: center; height: 100%;
      border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; }
    .empty-hint { color: var(--color-text-secondary, #999); font-size: 0.9rem; }

    .detail-panel { display: flex; flex-direction: column; gap: 10px; height: 100%;
      background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5e7eb);
      border-radius: 8px; padding: 16px; overflow: hidden; }
    .detail-panel.is-fullscreen { position: fixed; inset: 0; z-index: 1000; border-radius: 0;
      padding: 20px; max-height: 100vh; }

    .detail-header { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .adr-id-large { font-family: monospace; font-size: 0.88rem; font-weight: 600; color: var(--color-text-secondary, #666); }
    .detail-date { font-size: 0.78rem; color: var(--color-text-secondary, #999); }
    .detail-format { font-size: 0.72rem; padding: 1px 8px; background: var(--color-surface-2, #f5f5f5);
      border-radius: 10px; color: var(--color-text-secondary, #888); }
    .detail-actions { display: flex; align-items: center; gap: 4px; }
    .detail-title { margin: 0; font-size: 1.05rem; font-weight: 600; line-height: 1.4; flex-shrink: 0; }

    .icon-btn { background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 4px 7px;
      border-radius: 4px; color: var(--color-text-secondary, #888); transition: background 0.12s; }
    .icon-btn:hover:not(:disabled) { background: var(--color-surface-2, #f5f5f5); color: var(--color-text, #333); }
    .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .close-btn { font-size: 0.8rem; }

    .refs-row { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }
    .ref-chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 9px; border-radius: 12px;
      font-size: 0.72rem; font-weight: 500; text-decoration: none; cursor: pointer; transition: opacity 0.12s; }
    .ref-chip:hover { opacity: 0.8; }
    .ref-pr { background: #dcfce7; color: #166534; }
    .ref-adr { background: #dbeafe; color: #1e40af; }
    .ref-prop { background: #fae8ff; color: #7e22ce; }
    .ref-feature { background: #ffedd5; color: #9a3412; }

    .toc-section { flex-shrink: 0; border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px; overflow: hidden; }
    .toc-toggle { width: 100%; text-align: left; background: var(--color-surface-2, #f9fafb);
      border: none; padding: 6px 12px; font-size: 0.8rem; font-weight: 500; cursor: pointer;
      color: var(--color-text, #333); }
    .toc-toggle:hover { background: var(--color-surface-2, #f0f0f0); }
    .toc-list { display: flex; flex-direction: column; padding: 4px 0; }
    .toc-entry { background: none; border: none; text-align: left; padding: 3px 12px; font-size: 0.78rem;
      cursor: pointer; color: var(--color-primary, #4f46e5); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .toc-entry:hover { background: var(--color-surface-2, #f5f5f5); }
    .toc-h1 { padding-left: 12px; font-weight: 600; }
    .toc-h2 { padding-left: 20px; }
    .toc-h3 { padding-left: 32px; color: var(--color-text-secondary, #888); }

    .content-body { flex: 1; overflow-y: auto; min-height: 0; }
    .content-loading { padding: 24px; text-align: center; color: var(--color-text-secondary, #999); font-size: 0.85rem; }

    /* Status badges */
    .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .badge-accepted { background: #dcfce7; color: #166534; }
    .badge-proposed { background: #dbeafe; color: #1e40af; }
    .badge-deprecated { background: #f3f4f6; color: #6b7280; }
    .badge-superseded { background: #fef9c3; color: #854d0e; }
    .badge-suspended { background: #ffedd5; color: #9a3412; }
    .badge-partial { background: #fae8ff; color: #7e22ce; }
    .badge-unknown { background: #f3f4f6; color: #6b7280; }

    ${MARKDOWN_STYLES}
  `],
})
export class SafeAdrDetailComponent {
  @Input() adr: SafeAdrSummary | null = null;
  @Input() content: SafeAdrWithContent | null = null;
  @Input() loadingContent = false;
  @Input() renderedContent: SafeHtml = '';
  @Input() hasPrev = false;
  @Input() hasNext = false;
  @Output() closed = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  @ViewChild('contentBody') contentBody?: ElementRef<HTMLElement>;

  isFullscreen = false;
  tocVisible = true;

  get toc(): TocEntry[] {
    return this.content ? extractToc(this.content.content).filter(e => e.level > 1) : [];
  }

  get refs(): AdrRef[] {
    return this.content ? parseAdrRefs(this.content.content, this.adr?.id ?? '') : [];
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  scrollTo(id: string): void {
    const el = this.contentBody?.nativeElement.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
}
