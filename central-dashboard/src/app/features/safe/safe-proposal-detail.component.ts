/**
 * SAFe Proposal Detail
 *
 * Affiche le contenu markdown d'une proposal avec metadata et actions.
 */

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  SafeService,
  SafeProposal,
  ProposalStatus,
} from '../../core/services/safe.service';

@Component({
  selector: 'app-safe-proposal-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  template: `
    <div class="proposal-detail" *ngIf="proposal; else loading">

      <!-- Header -->
      <div class="detail-header">
        <div class="header-nav">
          <a routerLink="/safe/proposals" class="back-link">&larr; {{ 'safe.proposals.title' | translate }}</a>
        </div>
        <div class="header-main">
          <div class="header-left">
            <span class="type-badge" [class]="proposal.type">{{ proposal.type | uppercase }}</span>
            <h1>{{ proposal.id }} — {{ proposal.title }}</h1>
          </div>
          <div class="status-control">
            <select
              [value]="proposal.status"
              (change)="onStatusChange($event)"
              class="status-select"
              [class]="proposal.status"
            >
              <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
            </select>
          </div>
        </div>

        <!-- Metadata -->
        <div class="meta-row">
          <div class="meta-item" *ngIf="proposal.relatedEpic">
            <span class="meta-label">Epic</span>
            <span class="meta-value">{{ proposal.relatedEpic }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Date</span>
            <span class="meta-value">{{ proposal.date }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{{ 'safe.proposals.file' | translate }}</span>
            <span class="meta-value file-path">{{ proposal.filePath }}</span>
          </div>
        </div>
      </div>

      <!-- Content (rendered markdown) -->
      <div class="content-card">
        <div class="markdown-content" [innerHTML]="renderedContent"></div>
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

    .proposal-detail { padding: 24px; max-width: 900px; margin: 0 auto; }

    .detail-header {
      margin-bottom: 24px;
    }
    .header-nav { margin-bottom: 12px; }
    .back-link {
      color: var(--neo-text-secondary, #999); text-decoration: none; font-size: 14px;
      padding: 4px 8px; border-radius: 6px;
    }
    .back-link:hover { background: var(--neo-hover, #2a2a3e); color: var(--neo-text, #fff); }

    .header-main {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; flex-wrap: wrap;
    }
    .header-left { display: flex; align-items: center; gap: 12px; flex: 1; }
    .header-left h1 {
      margin: 0; font-size: 20px; color: var(--neo-text, #fff); line-height: 1.3;
    }
    .type-badge {
      font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px;
      flex-shrink: 0;
    }
    .type-badge.prop { background: #1a3a6b; color: #90caf9; }
    .type-badge.spike { background: #5d3a00; color: #ffcc80; }
    .type-badge.spec { background: #1b5e20; color: #a5d6a7; }

    .status-select {
      padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600;
      border: 1px solid var(--neo-border, #333); cursor: pointer;
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
    }
    .status-select.draft { border-color: #555; }
    .status-select.in-review { border-color: #9c27b0; }
    .status-select.approved { border-color: #4caf50; }
    .status-select.implementing { border-color: #2196f3; }
    .status-select.done { border-color: #2e7d32; }

    .meta-row {
      display: flex; gap: 24px; margin-top: 12px; flex-wrap: wrap;
    }
    .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { font-size: 11px; color: var(--neo-text-muted, #666); text-transform: uppercase; }
    .meta-value { font-size: 13px; color: var(--neo-text, #fff); }
    .file-path { font-family: monospace; font-size: 12px; color: var(--neo-text-secondary, #999); }

    /* Content */
    .content-card {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px;
      padding: 24px; border: 1px solid var(--neo-border, #333);
    }
    .markdown-content {
      color: var(--neo-text, #e0e0e0); font-size: 14px; line-height: 1.7;
    }
    .markdown-content h1 { font-size: 20px; color: var(--neo-text, #fff); margin: 20px 0 12px; border-bottom: 1px solid var(--neo-border, #333); padding-bottom: 8px; }
    .markdown-content h2 { font-size: 17px; color: var(--neo-text, #fff); margin: 18px 0 10px; }
    .markdown-content h3 { font-size: 15px; color: var(--neo-text, #fff); margin: 14px 0 8px; }
    .markdown-content p { margin: 8px 0; }
    .markdown-content code {
      background: var(--neo-bg, #121220); padding: 2px 6px; border-radius: 4px;
      font-size: 13px; color: #e0e0e0;
    }
    .markdown-content pre {
      background: var(--neo-bg, #121220); padding: 16px; border-radius: 8px;
      overflow-x: auto; font-size: 13px; margin: 12px 0;
    }
    .markdown-content pre code { padding: 0; background: transparent; }
    .markdown-content table {
      width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;
    }
    .markdown-content th {
      text-align: left; padding: 8px 10px;
      border-bottom: 1px solid var(--neo-border, #333);
      color: var(--neo-text-secondary, #999); font-weight: 600;
    }
    .markdown-content td {
      padding: 6px 10px; border-bottom: 1px solid var(--neo-border, #222);
    }
    .markdown-content ul, .markdown-content ol { padding-left: 20px; margin: 8px 0; }
    .markdown-content li { margin: 4px 0; }
    .markdown-content blockquote {
      border-left: 3px solid var(--neo-primary, #4f8cff);
      padding: 8px 16px; margin: 12px 0;
      color: var(--neo-text-secondary, #999); font-style: italic;
    }
    .markdown-content a { color: var(--neo-primary, #4f8cff); }
    .markdown-content strong { color: var(--neo-text, #fff); }
    .markdown-content hr { border: none; border-top: 1px solid var(--neo-border, #333); margin: 16px 0; }

    /* Loading */
    .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; }
    .spinner {
      width: 40px; height: 40px; border: 3px solid var(--neo-border, #333);
      border-top-color: var(--neo-primary, #4f8cff); border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .proposal-detail { padding: 16px; }
      .header-main { flex-direction: column; }
    }
  `]
})
export class SafeProposalDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly safeService = inject(SafeService);

  proposal: SafeProposal | null = null;
  renderedContent = '';
  statuses: ProposalStatus[] = ['draft', 'in-review', 'approved', 'implementing', 'done'];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.safeService.getProposal(id).subscribe({
      next: (data) => {
        this.proposal = data;
        this.renderedContent = this.renderMarkdown(data.content);
      },
      error: (err) => {
        console.error('Failed to load proposal', err);
      }
    });
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newStatus = target.value as ProposalStatus;
    if (!this.proposal || this.proposal.status === newStatus) return;

    const previousStatus = this.proposal.status;
    this.proposal.status = newStatus;

    this.safeService.updateProposalStatus(this.proposal.id, newStatus).subscribe({
      error: () => {
        if (this.proposal) this.proposal.status = previousStatus;
      }
    });
  }

  /**
   * Basic markdown → HTML renderer.
   * Handles headers, bold, italic, code blocks, tables, lists, links, blockquotes, hr.
   */
  private renderMarkdown(md: string): string {
    if (!md) return '';

    let html = md;

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
      return `<pre><code>${this.escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Tables
    html = this.renderTables(html);

    // Lists (unordered)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p><(h[1-3]|pre|table|ul|ol|blockquote|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-3]|pre|table|ul|ol|blockquote)><\/p>/g, '</$1>');
    html = html.replace(/<hr><\/p>/g, '<hr>');
    html = html.replace(/<p><\/p>/g, '');

    return html;
  }

  private renderTables(html: string): string {
    const lines = html.split('\n');
    const result: string[] = [];
    let inTable = false;
    let headerDone = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        // Check if separator line
        if (/^\|[\s:-]+\|$/.test(line.replace(/\|/g, '|').replace(/[^|:-\s]/g, ''))) {
          continue; // Skip separator
        }

        if (!inTable) {
          result.push('<table>');
          inTable = true;
          headerDone = false;
        }

        const cells = line.split('|').filter(c => c.trim() !== '');
        const tag = !headerDone ? 'th' : 'td';
        const row = cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('');
        if (!headerDone) {
          result.push(`<thead><tr>${row}</tr></thead><tbody>`);
          headerDone = true;
        } else {
          result.push(`<tr>${row}</tr>`);
        }
      } else {
        if (inTable) {
          result.push('</tbody></table>');
          inTable = false;
        }
        result.push(rawLine);
      }
    }
    if (inTable) result.push('</tbody></table>');

    return result.join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
