/**
 * ADR-075 / ADR-077 — Angular host du <Player> @remotion/player.
 *
 * Bridge React-in-Angular : crée un React root dans un div Angular et y monte
 * le Player Remotion avec la composition `TemplateRuntime` (data-driven).
 * Le preview utilise la même runtime que le worker server-side → parité stricte.
 *
 * Input unique `state` = RuntimePlayerState (variantes, couches, slots +
 * sélections utilisateur). Un changement de state re-render le Player via
 * `inputProps` — pas besoin de remonter le root.
 */

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

// Filtre le spam d'AbortError émis par Chrome quand il met en pause power-save
// les <video> sans piste audio (video-only background media). Lecture non affectée.
const _origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args[0];
  if (typeof msg === 'string' && msg.includes('Could not play video')) return;
  _origConsoleError(...args);
};
import { CommonModule } from '@angular/common';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Player } from '@remotion/player';
import {
  TemplateRuntime,
  TemplateRuntimeProps,
  RuntimeLayer,
  RuntimeTextField,
  RuntimeImageSlot,
  RuntimeVariant,
} from './template-runtime';

export interface RuntimePlayerState {
  variants: RuntimeVariant[];
  layers: RuntimeLayer[];
  textFields: RuntimeTextField[];
  imageSlots: RuntimeImageSlot[];
  variantId: string;
  textValues: Record<string, string>;
  imageUploads: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
  durationSeconds: number;
  fps: number;
  /** PDF JOUEUR §démarrage — options sélectionnées, propagées au runtime pour visible_if filtering. */
  selectedOptions?: Record<string, string>;
}

@Component({
  selector: 'app-template-studio-player',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="studio-player" [class.studio-player--empty]="!state">
      <div #host class="studio-player__host"></div>
      <div *ngIf="!state" class="studio-player__empty">
        Sélectionnez un template pour prévisualiser
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .studio-player { position: relative; width: 100%; background: #000; border-radius: 8px; overflow: hidden; }
    .studio-player--empty { aspect-ratio: 16 / 9; }
    .studio-player__host { width: 100%; }
    .studio-player__empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #888; font-size: 14px; text-align: center; padding: 1rem;
    }
  `],
})
export class TemplateStudioPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  @Input() state: RuntimePlayerState | null = null;

  private root: Root | null = null;

  ngAfterViewInit(): void {
    this.root = createRoot(this.hostRef.nativeElement);
    this.renderPlayer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('state' in changes && this.root) {
      this.renderPlayer();
    }
  }

  ngOnDestroy(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private renderPlayer(): void {
    if (!this.root) return;
    if (!this.state) {
      this.root.render(createElement('div'));
      return;
    }
    const s = this.state;
    const inputProps: TemplateRuntimeProps = {
      variants: s.variants,
      layers: s.layers,
      textFields: s.textFields,
      imageSlots: s.imageSlots,
      variantId: s.variantId,
      textValues: s.textValues,
      imageUploads: s.imageUploads,
      selectedOptions: s.selectedOptions ?? {},
    };
    const durationInFrames = Math.max(1, Math.round(s.durationSeconds * s.fps));
    this.root.render(
      createElement(Player as unknown as React.FC<Record<string, unknown>>, {
        component: TemplateRuntime,
        inputProps,
        durationInFrames,
        fps: s.fps,
        compositionWidth: s.canvasWidth,
        compositionHeight: s.canvasHeight,
        style: { width: '100%', aspectRatio: `${s.canvasWidth} / ${s.canvasHeight}` },
        controls: true,
        loop: true,
        initiallyMuted: true,
        acknowledgeRemotionLicense: true,
      }),
    );
  }
}
