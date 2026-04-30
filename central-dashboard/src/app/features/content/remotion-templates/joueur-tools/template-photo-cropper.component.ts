/**
 * SPEC JOUEUR Q15 — Photo cropper super_admin.
 *
 * Drop-zone PNG → POST /photo/auto-crop → preview bbox + offset éditable.
 * L'admin peut ajuster manuellement l'offset_x si le cadrage auto n'est
 * pas idéal. Émet le résultat finalisé via @Output cropFinalized.
 */

import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TemplateVersioningDataService,
  type AutoCropResult,
} from './template-versioning-data.service';

export interface PhotoCropFinalized {
  file: File;
  bbox: AutoCropResult['bbox'];
  offset_x: number; // override user (-1..+1)
}

@Component({
  selector: 'app-template-photo-cropper',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cropper">
      <h3>Photo joueur (PNG détouré) — auto-crop</h3>
      <p class="muted">SPEC JOUEUR Q15 — cadrage auto à l'upload + offset éditable.</p>

      <label class="drop" [class.drag]="dragOver()" [class.has-file]="!!file()">
        <input type="file" accept="image/png" (change)="onFileChange($event)" />
        <div *ngIf="!file()">
          📥 Drop un PNG détouré ici
          <br><small>(canal alpha obligatoire, ≤ 20 MB)</small>
        </div>
        <div *ngIf="file() as f">
          <strong>{{ f.name }}</strong>
          <br><small>{{ formatSize(f.size) }} · {{ f.type }}</small>
        </div>
      </label>

      <div class="threshold-row">
        <label>
          Seuil alpha :
          <input
            type="number"
            min="0"
            max="255"
            [ngModel]="threshold()"
            (ngModelChange)="threshold.set(+$event); recompute()"
            [disabled]="busy()"
          />
          <span class="muted-inline">/ 255 (default 16 ≈ 6 %)</span>
        </label>
      </div>

      <div class="error" *ngIf="error()" role="alert">{{ error() }}</div>

      <div class="result" *ngIf="result() as r">
        <div class="preview-grid">
          <div class="card">
            <h4>Photo originale</h4>
            <img [src]="originalUrl()" alt="" />
          </div>
          <div class="card">
            <h4>BBox + offset éditable</h4>
            <div class="bbox-canvas" [style.aspectRatio]="r.canvas_width + ' / ' + r.canvas_height">
              <img [src]="originalUrl()" alt="" class="bg" />
              <svg
                class="overlay"
                [attr.viewBox]="'0 0 ' + r.canvas_width + ' ' + r.canvas_height"
                preserveAspectRatio="xMidYMid meet"
              >
                <!-- bbox détectée -->
                <rect
                  [attr.x]="r.bbox.left"
                  [attr.y]="r.bbox.top"
                  [attr.width]="r.bbox.width"
                  [attr.height]="r.bbox.height"
                  fill="none"
                  stroke="#ef4444"
                  stroke-width="3"
                />
                <!-- centre canvas -->
                <line
                  [attr.x1]="(r.canvas_width - 1) / 2 - 16" [attr.y1]="(r.canvas_height - 1) / 2"
                  [attr.x2]="(r.canvas_width - 1) / 2 + 16" [attr.y2]="(r.canvas_height - 1) / 2"
                  stroke="#16a34a" stroke-width="3" />
                <line
                  [attr.x1]="(r.canvas_width - 1) / 2" [attr.y1]="(r.canvas_height - 1) / 2 - 16"
                  [attr.x2]="(r.canvas_width - 1) / 2" [attr.y2]="(r.canvas_height - 1) / 2 + 16"
                  stroke="#16a34a" stroke-width="3" />
                <!-- centre bbox + offset user appliqué -->
                <line
                  [attr.x1]="effectiveBboxCenterX(r) - 16" [attr.y1]="(r.bbox.top + r.bbox.bottom) / 2"
                  [attr.x2]="effectiveBboxCenterX(r) + 16" [attr.y2]="(r.bbox.top + r.bbox.bottom) / 2"
                  stroke="#2563eb" stroke-width="3" />
                <line
                  [attr.x1]="effectiveBboxCenterX(r)" [attr.y1]="(r.bbox.top + r.bbox.bottom) / 2 - 16"
                  [attr.x2]="effectiveBboxCenterX(r)" [attr.y2]="(r.bbox.top + r.bbox.bottom) / 2 + 16"
                  stroke="#2563eb" stroke-width="3" />
              </svg>
            </div>
            <div class="legend">
              <span><span class="swatch r"></span>BBox</span>
              <span><span class="swatch g"></span>Centre canvas</span>
              <span><span class="swatch b"></span>Centre bbox (avec offset)</span>
            </div>
          </div>
        </div>

        <div class="offset-row">
          <label>
            Offset horizontal :
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              [ngModel]="offsetOverride()"
              (ngModelChange)="offsetOverride.set(+$event)"
            />
            <strong>{{ (offsetOverride() * 100).toFixed(0) }}%</strong>
          </label>
          <button type="button" class="btn-link" (click)="resetOffset(r.suggested_offset_x)">
            Reset (auto = {{ (r.suggested_offset_x * 100).toFixed(0) }}%)
          </button>
        </div>

        <pre class="json">{{ formatJson(r) }}</pre>

        <div class="footer">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="busy() || !file() || r.empty"
            (click)="finalize(r)"
          >
            Valider ce cadrage
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .cropper { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
    h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
    h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
    .muted { color: #6b7280; font-size: 13px; margin: 0 0 12px; }
    .muted-inline { color: #6b7280; font-size: 12px; margin-left: 6px; }

    .drop {
      display: block; border: 2px dashed #d1d5db; border-radius: 10px;
      padding: 32px; text-align: center; cursor: pointer; transition: 0.15s;
    }
    .drop:hover, .drop.drag { border-color: #2563eb; background: #eff6ff; }
    .drop.has-file { border-color: #10b981; background: #ecfdf5; }
    .drop input { display: none; }
    .drop small { color: #6b7280; }

    .threshold-row { margin: 12px 0; font-size: 13px; }
    .threshold-row input { width: 60px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; margin: 0 6px; }

    .error { background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 13px; margin: 12px 0; }

    .result { margin-top: 16px; }
    .preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 700px) { .preview-grid { grid-template-columns: 1fr; } }
    .card { background: #f9fafb; border-radius: 8px; padding: 10px; }
    .card img { max-width: 100%; height: auto; display: block; border-radius: 4px; }

    .bbox-canvas { position: relative; }
    .bbox-canvas .bg { width: 100%; height: 100%; display: block; }
    .bbox-canvas .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

    .legend { display: flex; gap: 14px; font-size: 11px; margin-top: 8px; flex-wrap: wrap; color: #6b7280; }
    .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
    .swatch.r { background: #ef4444; }
    .swatch.g { background: #16a34a; }
    .swatch.b { background: #2563eb; }

    .offset-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 12px 0; font-size: 13px; }
    .offset-row input { flex: 1; min-width: 200px; }
    .offset-row strong { font-family: 'SF Mono', monospace; min-width: 50px; text-align: right; }

    .json { background: #1f2937; color: #d1fae5; padding: 10px; border-radius: 6px; font-size: 11px; overflow-x: auto; max-height: 160px; }

    .footer { display: flex; justify-content: flex-end; margin-top: 12px; }
    .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; font-size: 13px; cursor: pointer; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .btn-link { background: transparent; border: none; color: #1d4ed8; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }
  `],
})
export class TemplatePhotoCropperComponent {
  @Output() cropFinalized = new EventEmitter<PhotoCropFinalized>();

  private data = inject(TemplateVersioningDataService);

  file = signal<File | null>(null);
  originalUrl = signal<string>('');
  result = signal<AutoCropResult | null>(null);
  threshold = signal(16);
  offsetOverride = signal(0);
  busy = signal(false);
  error = signal<string | null>(null);
  dragOver = signal(false);

  effectiveBboxCenterX = computed(() => (r: AutoCropResult) => {
    // Centre bbox naturel + offset utilisateur projeté en pixels.
    const naturalCx = (r.bbox.left + r.bbox.right) / 2;
    const half = (r.canvas_width - 1) / 2;
    const userPx = this.offsetOverride() * half;
    return half + userPx;
  });

  onFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.setFile(f);
  }

  private setFile(f: File): void {
    if (f.type !== 'image/png') {
      this.error.set('Seuls les PNG sont acceptés');
      return;
    }
    this.file.set(f);
    this.originalUrl.set(URL.createObjectURL(f));
    this.error.set(null);
    this.recompute();
  }

  recompute(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.error.set(null);
    this.data.autoCropPhoto(f, this.threshold()).subscribe({
      next: (r) => {
        this.result.set(r);
        this.offsetOverride.set(r.suggested_offset_x);
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(this.formatError(err));
        this.busy.set(false);
      },
    });
  }

  resetOffset(suggested: number): void {
    this.offsetOverride.set(suggested);
  }

  finalize(r: AutoCropResult): void {
    const f = this.file();
    if (!f || r.empty) return;
    this.cropFinalized.emit({ file: f, bbox: r.bbox, offset_x: this.offsetOverride() });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatJson(r: AutoCropResult): string {
    return JSON.stringify(r, null, 2);
  }

  private formatError(err: unknown): string {
    const e = err as { error?: { error?: string; message?: string }; status?: number };
    if (e?.error?.error) return `${e.error.error}${e.error.message ? ` — ${e.error.message}` : ''}`;
    return e?.status ? `HTTP ${e.status}` : 'Erreur inconnue';
  }
}
