import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeResourceUrl } from '@angular/platform-browser';
import { RemotionPreviewService } from './remotion-preview.service';

/**
 * Iframe d'aperçu live d'une composition Remotion.
 * - Charge la composition via URL initiale (query string).
 * - Propage les changements de props via postMessage debounced (150ms).
 * - Détruit le timer au destroy pour éviter les fuites.
 */
@Component({
  selector: 'app-template-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="section-title">
      Aperçu en direct
      <span class="preview-badge">Live</span>
    </h3>
    <div class="preview-frame-wrapper">
      <iframe
        #previewFrame
        *ngIf="previewUrl"
        [src]="previewUrl"
        class="preview-frame"
        frameborder="0"
        allow="autoplay"
        title="Aperçu Remotion"
      ></iframe>
    </div>
    <p class="preview-hint">
      L'aperçu se met à jour instantanément. Ajustez les valeurs à gauche.
    </p>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 8px; }
    .section-title {
      font-size: 13px; font-weight: 600; color: #6b7280;
      text-transform: uppercase; letter-spacing: .05em; margin: 0 0 16px;
    }
    .preview-badge {
      background: #fee2e2; color: #b91c1c;
      font-size: 10px; padding: 1px 6px; border-radius: 8px;
      vertical-align: middle; margin-left: 6px;
      font-weight: 600; text-transform: uppercase;
    }
    .preview-frame-wrapper {
      position: relative; width: 100%; padding-top: 56.25%; /* 16:9 */
      background: #111; border-radius: 10px; overflow: hidden;
    }
    .preview-frame {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%; border: none;
    }
    .preview-hint { font-size: 12px; color: #9ca3af; margin: 0; }
  `],
})
export class TemplatePreviewComponent implements OnChanges, OnDestroy {
  @ViewChild('previewFrame') previewFrameRef?: ElementRef<HTMLIFrameElement>;

  @Input({ required: true }) compositionId!: string;
  @Input() props: Record<string, unknown> = {};

  previewUrl: SafeResourceUrl | null = null;

  private previewService = inject(RemotionPreviewService);
  private postMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCompositionId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // Reconstruction de l'URL uniquement quand la composition change.
    // Les simples modifs de `props` passent par postMessage (pas de reload iframe).
    const compositionChanged = this.compositionId !== this.lastCompositionId;
    if (compositionChanged) {
      this.previewUrl = this.previewService.buildPreviewUrl(this.compositionId, this.props);
      this.lastCompositionId = this.compositionId;
      return;
    }

    if (changes['props'] && !compositionChanged) {
      this.schedulePropsUpdate();
    }
  }

  ngOnDestroy(): void {
    if (this.postMessageTimer) clearTimeout(this.postMessageTimer);
  }

  private schedulePropsUpdate(): void {
    if (this.postMessageTimer) clearTimeout(this.postMessageTimer);
    this.postMessageTimer = setTimeout(() => {
      this.previewService.sendPropsUpdate(
        this.previewFrameRef?.nativeElement,
        this.compositionId,
        this.props,
      );
    }, 150);
  }
}
