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
  @Output() goToStep = new EventEmitter<WizardStep>();

  get hasLayer(): boolean {
    return this.state.layers.length > 0 && !!this.state.previewState;
  }

  onGoToBackgrounds(): void {
    this.goToStep.emit(2);
  }
}
