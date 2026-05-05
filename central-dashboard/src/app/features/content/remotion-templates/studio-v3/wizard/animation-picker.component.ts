/**
 * Plan 02-03 / UX-02 — Animation picker (5 cards: 4 presets + 'Aucune animation').
 *
 * Selecting a card emits the persistence shape:
 *   - 'fade'      → { preset: 'fade', direction }
 *   - 'slide'     → { preset: direction === 'in' ? 'slide-up' : 'slide-down', direction }
 *   - 'zoom'      → { preset: 'zoom', direction }
 *   - 'logo-pop'  → { preset: 'logo-pop' }
 *   - 'aucune'    → null
 *
 * FR labels are sourced from ANIMATION_PRESET_LABELS (Plan 01 vocabulary lock).
 * The literal 'Aucune animation' is the only inline FR string here — no other
 * preset name should be hardcoded.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { ANIMATION_PRESET_LABELS } from '../vocabulary.constants';

import {
  AnimationCardComponent,
  AnimationCardKey,
  AnimationDirection,
} from './animation-card.component';

export type AnimationValue =
  | {
      preset: 'fade' | 'slide-up' | 'slide-down' | 'zoom' | 'logo-pop';
      direction?: AnimationDirection;
    }
  | null;

interface CardDef {
  key: AnimationCardKey;
  label: string;
}

const CARDS: CardDef[] = [
  { key: 'fade', label: ANIMATION_PRESET_LABELS.fade }, // 'Apparition'
  { key: 'slide', label: ANIMATION_PRESET_LABELS['slide-up'] }, // 'Glissement'
  { key: 'zoom', label: ANIMATION_PRESET_LABELS.zoom }, // 'Zoom arrière'
  { key: 'logo-pop', label: ANIMATION_PRESET_LABELS['logo-pop'] }, // 'Logo Pop'
  { key: 'aucune', label: 'Aucune animation' },
];

@Component({
  selector: 'app-animation-picker',
  standalone: true,
  imports: [CommonModule, AnimationCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './animation-picker.component.html',
  styleUrls: ['./animation-picker.component.scss'],
})
export class AnimationPickerComponent {
  readonly cards = CARDS;

  @Input() value: AnimationValue = null;
  @Output() valueChange = new EventEmitter<AnimationValue>();

  get selectedKey(): AnimationCardKey {
    if (!this.value) return 'aucune';
    if (this.value.preset === 'fade') return 'fade';
    if (this.value.preset === 'slide-up' || this.value.preset === 'slide-down') return 'slide';
    if (this.value.preset === 'zoom') return 'zoom';
    if (this.value.preset === 'logo-pop') return 'logo-pop';
    return 'aucune';
  }

  get currentDirection(): AnimationDirection {
    if (!this.value) return 'in';
    return this.value.direction ?? 'in';
  }

  onSelectCard(key: AnimationCardKey): void {
    this.valueChange.emit(this.toValue(key, this.currentDirection));
  }

  onDirectionChange(d: AnimationDirection): void {
    this.valueChange.emit(this.toValue(this.selectedKey, d));
  }

  private toValue(key: AnimationCardKey, dir: AnimationDirection): AnimationValue {
    switch (key) {
      case 'aucune':
        return null;
      case 'fade':
        return { preset: 'fade', direction: dir };
      case 'slide':
        return { preset: dir === 'in' ? 'slide-up' : 'slide-down', direction: dir };
      case 'zoom':
        return { preset: 'zoom', direction: dir };
      case 'logo-pop':
        return { preset: 'logo-pop' };
    }
  }
}
