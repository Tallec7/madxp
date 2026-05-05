/**
 * Plan 02-03 / UX-02 — Single animation card.
 *
 * Visual + FR name + (when selected) integrated in/out direction toggle.
 * Hover-only CSS preview animation (no JS, no GPU loop). Direction toggle
 * is hidden for `logo-pop` (single behavior) and `aucune` (no animation).
 *
 * NEVER expose scaleFrom/scaleTo/durationMs to the user — those numeric
 * params are baked into the runtime preset. Smoke vocabulary BANLIST
 * enforces this.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

export type AnimationCardKey = 'fade' | 'slide' | 'zoom' | 'logo-pop' | 'aucune';
export type AnimationDirection = 'in' | 'out';

@Component({
  selector: 'app-animation-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './animation-card.component.html',
  styleUrls: ['./animation-card.component.scss'],
})
export class AnimationCardComponent {
  @Input({ required: true }) cardKey!: AnimationCardKey;
  /** FR label, sourced from ANIMATION_PRESET_LABELS in parent. */
  @Input({ required: true }) label!: string;
  @Input() selected = false;
  @Input() direction: AnimationDirection = 'in';

  @Output() cardSelect = new EventEmitter<void>();
  @Output() directionChange = new EventEmitter<AnimationDirection>();

  /** Cards with no in/out concept: pure pop, or no animation at all. */
  get supportsDirection(): boolean {
    return (
      this.cardKey === 'fade' ||
      this.cardKey === 'slide' ||
      this.cardKey === 'zoom'
    );
  }

  onSelect(): void {
    if (!this.selected) this.cardSelect.emit();
  }

  onSetDirection(d: AnimationDirection, ev: Event): void {
    ev.stopPropagation(); // don't bubble to onSelect
    if (this.direction !== d) this.directionChange.emit(d);
  }
}
