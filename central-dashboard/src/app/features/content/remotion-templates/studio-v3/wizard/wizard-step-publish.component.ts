/**
 * Wizard Step 5 — Validation / Publish gate (Plan 03-04 / PUB-01 + PUB-02).
 *
 * Standalone OnPush component, mounted via [hidden]="currentStep() !== 5"
 * in the shell (NEVER *ngIf — Pitfall P2/P3 GPU SharedImage leak on the
 * sibling Player). Consumes the 8-rule validation result and exposes:
 *   - "Lancer un rendu de test" → emits requestTestRender (parent enqueues
 *     POST /:id/test-render and polls until success/failure)
 *   - "Publier ce template"     → emits publish (disabled while ≥1 error)
 *   - "Corriger →"              → emits fixHint({step, entityId?}) so the
 *                                 shell can deep-link back to the faulty
 *                                 step + entity.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { VALIDATION_RULE_LABELS } from '../vocabulary.constants';
import type { ValidationResult } from '../wizard-state.types';

@Component({
  selector: 'app-wizard-step-publish',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wizard-step-publish.component.html',
  styleUrls: ['./wizard-step-publish.component.scss'],
})
export class WizardStepPublishComponent {
  readonly templateId = input.required<string>();
  readonly validationResults = input.required<ValidationResult[]>();
  readonly testRenderInProgress = input<boolean>(false);
  readonly testRenderError = input<string | null>(null);

  readonly requestTestRender = output<void>();
  readonly publish = output<void>();
  readonly fixHint = output<{ step: number; entityId?: string }>();

  readonly LABELS = VALIDATION_RULE_LABELS;

  readonly errorCount = computed(
    () =>
      this.validationResults().filter(
        (r) => !r.ok && r.severity === 'error',
      ).length,
  );

  readonly warningCount = computed(
    () =>
      this.validationResults().filter(
        (r) => !r.ok && r.severity === 'warning',
      ).length,
  );

  readonly canPublish = computed(() => this.errorCount() === 0);

  readonly disabledTitle = computed(() =>
    this.canPublish()
      ? ''
      : `Corrigez d'abord les ${this.errorCount()} critères en rouge`,
  );

  trackByRule(_idx: number, r: ValidationResult): string {
    return r.rule_id;
  }

  iconFor(r: ValidationResult): string {
    if (r.ok) return '✓';
    return r.severity === 'error' ? '✗' : '⚠';
  }

  labelFor(ruleId: string): string {
    return this.LABELS[ruleId] ?? ruleId;
  }

  onFix(hint: { step: number; entityId?: string } | undefined): void {
    if (!hint) return;
    this.fixHint.emit(hint);
  }
}
