/**
 * Live Remotion Player panel for steps 3-4 (PREV-01 / PREV-03).
 *
 * Mounted ONCE inside StudioV3WizardComponent as a sibling of the 4 step
 * containers. Toggled via [hidden]="currentStep() < 3" — NEVER *ngIf
 * (Pitfall P3, React root leak). When no layers exist yet, shows a FR
 * placeholder with a "go to step 2" CTA.
 *
 * Props are computed by the shell via RemotionPreviewService.buildRuntimePlayerState
 * (which proxies every layers[].videoUrl per Pitfall P2).
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { TemplateStudioPlayerComponent } from '../../studio-player/template-studio-player.component';
import type { PreviewMode } from '../../remotion-preview.service';
import type { WizardState, WizardStep } from '../wizard-state.types';

@Component({
  selector: 'app-wizard-preview-panel',
  standalone: true,
  imports: [CommonModule, TemplateStudioPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wizard-preview-panel.component.html',
  styleUrls: ['./wizard-preview-panel.component.scss'],
})
export class WizardPreviewPanelComponent {
  @Input({ required: true }) state!: WizardState;
  /**
   * Plan 02-04 / UX-03 — Set by the shell when the admin clicks the inline
   * « ✓ N zones reliées » counter in Step 4. Triggers a yellow border + banner
   * over the player to signal which option is being inspected. Auto-cleared
   * by the shell after 4s.
   */
  @Input() highlightedOptionKey: string | null = null;
  /**
   * Plan 03-04 / PUB-02 — Mounted on the wizard shell, the toggle is only
   * visible on Step 5 (controlled via [hidden]="currentStep() !== 5"). The
   * Player itself stays mounted (Pitfall P3) — we only swap the visible
   * source between the live preview state and the rendered MP4.
   */
  @Input() currentStep: WizardStep = 1;
  @Input() previewMode: PreviewMode = 'live';
  @Input() testRenderUrl: string | null = null;
  @Output() previewModeChange = new EventEmitter<PreviewMode>();
  @Output() goToStep = new EventEmitter<WizardStep>();

  get hasLayer(): boolean {
    return this.state.layers.length > 0 && !!this.state.previewState;
  }

  onGoToBackgrounds(): void {
    this.goToStep.emit(2);
  }

  onModeChange(mode: PreviewMode): void {
    this.previewModeChange.emit(mode);
  }
}
